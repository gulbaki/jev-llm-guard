import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDemoQuota } from '../src/demo-quota.js';

const run = promisify(execFile);
const bin = process.env.JEV_REDIS_TEST_BIN;

test('real Redis: atomic quotas, cold starts, rejection accounting, expiry and daily reset', { skip: !bin }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-quota-test-'));
  const socket = join(directory, 'redis.sock');
  const server = spawn(join(bin, 'redis-server'), ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await stopped; } await rm(directory, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis startup timeout')), 10000);
    const ready = () => { clearTimeout(timer); resolve(); };
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Redis startup exited ${code}`)); });
    server.stdout.on('data', chunk => { if (String(chunk).toLowerCase().includes('ready to accept connections')) ready(); });
  });
  const command = async args => JSON.parse((await run(join(bin, 'redis-cli'), ['-s', socket, '--json', ...args.map(String)])).stdout);
  const env = { VERCEL: '1', VERCEL_ENV: 'production', KV_REST_API_URL: 'https://redis.example.test', KV_REST_API_TOKEN: 'test', JEV_QUOTA_SECRET: 's'.repeat(64) };
  const req = ip => ({ headers: { 'x-vercel-forwarded-for': ip } });
  const scopes = new Map();
  const make = namespace => createDemoQuota({ env, namespace, fetchImpl: async (_, options) => {
    const args = JSON.parse(options.body);
    scopes.set(namespace, args.slice(3, 6));
    return Response.json({ result: await command(args) });
  } });

  await t.test('60 concurrent reservations allow exactly 5; a new function instance shares the limit', async () => {
    const [seconds] = await command(['TIME']);
    const untilReset = 60 - Number(seconds) % 60;
    if (untilReset < 5) await new Promise(resolve => setTimeout(resolve, untilReset * 1000 + 100));
    const namespace = `test-${randomUUID()}`, reserve = make(namespace);
    const results = await Promise.all(Array.from({ length: 60 }, () => reserve(req('203.0.113.8'))));
    assert.equal(results.filter(x => x.allowed).length, 5);
    assert.equal(results.filter(x => x.scope === 'ip_minute').length, 55);
    assert.equal((await make(namespace)(req('203.0.113.8'))).allowed, false);
    const keys = scopes.get(namespace);
    assert.equal(await command(['HGET', keys[2], 'count']), '5');
    for (const key of keys) assert.ok(await command(['TTL', key]) > 0);
  });

  await t.test('20 daily accepted reservations; the 21st consumes neither IP nor global quota', async () => {
    const namespace = `test-${randomUUID()}`, reserve = make(namespace);
    for (let batch = 0; batch < 4; batch++) {
      for (let i = 0; i < 5; i++) assert.equal((await reserve(req('203.0.113.9'))).allowed, true);
      // Simulate the previous minute window; actual production Lua still reads Redis TIME.
      await command(['HSET', scopes.get(namespace)[0], 'window', '-1']);
    }
    const result = await reserve(req('203.0.113.9'));
    assert.equal(result.scope, 'ip_daily');
    assert.equal(await command(['HGET', scopes.get(namespace)[1], 'count']), '20');
    assert.equal(await command(['HGET', scopes.get(namespace)[2], 'count']), '20');
    assert.equal((await reserve(req('203.0.113.10'))).allowed, true);
  });

  await t.test('the global 500 cap holds across IPs and concurrent instances, then resets next day', async () => {
    const namespace = `test-${randomUUID()}`, reserve = make(namespace);
    await reserve(req('203.0.113.11'));
    const globalKey = scopes.get(namespace)[2];
    await command(['HSET', globalKey, 'count', 495]);
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => make(namespace)(req(`198.18.0.${i + 1}`))));
    assert.equal(results.filter(x => x.allowed).length, 5);
    assert.equal(results.filter(x => x.scope === 'global_daily').length, 35);
    assert.equal(await command(['HGET', globalKey, 'count']), '500');
    // Old day is ignored even if a stale key survives expiry.
    const keys = scopes.get(namespace);
    for (const key of keys) await command(['HSET', key, 'window', '-1']);
    assert.equal((await make(namespace)(req('198.18.0.40'))).allowed, true);
    assert.equal(await command(['HGET', globalKey, 'count']), '1');
  });
});
