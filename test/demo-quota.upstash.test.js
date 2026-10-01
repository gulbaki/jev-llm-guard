import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createDemoQuota } from '../src/demo-quota.js';
import { handleApiRequest } from '../src/web-server.js';

// Explicit opt-in: JSON contains only Redis credentials and quota secret.
const credentialFile = process.env.JEV_QUOTA_TEST_CREDENTIALS;
test('Upstash: real atomic reservations and HTTP minute/daily/global rejection before Jev', { skip: !credentialFile }, async t => {
  const settings = JSON.parse(await readFile(credentialFile, 'utf8'));
  const env = { ...settings, VERCEL: '1', VERCEL_ENV: 'production', JEV_PUBLIC_ORIGIN: 'https://demo.example.test', TYPESAFE_API_KEY: 'stub-only' };
  const keys = new Set();
  const command = async args => {
    const response = await fetch(env.KV_REST_API_URL, { method: 'POST', headers: { authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Redis test request failed: ${response.status}`);
    const p = await response.json();
    if (p.error) throw new Error('Redis test command failed');
    return p.result;
  };
  const namespace = `test-${randomUUID()}`;
  let lastKeys;
  const quota = createDemoQuota({ env, namespace, fetchImpl: async (url, options) => {
    lastKeys = JSON.parse(options.body).slice(3, 6);
    lastKeys.forEach(key => keys.add(key));
    return fetch(url, options);
  } });
  t.after(async () => { if (keys.size) await command(['DEL', ...keys]); });
  let jevCalls = 0;
  const req = ip => ({ method: 'POST', headers: { host: 'demo.example.test', origin: 'https://demo.example.test', 'content-type': 'application/json', 'x-vercel-forwarded-for': ip }, body: JSON.stringify({ text: 'hello' }) });
  const evaluate = async () => { jevCalls++; return { action: 'allow' }; };
  const request = ip => handleApiRequest(req(ip), { env, evaluate, reserveQuota: quota });

  const [seconds] = await command(['TIME']);
  const untilReset = 60 - Number(seconds) % 60;
  if (untilReset < 10) await new Promise(resolve => setTimeout(resolve, untilReset * 1000 + 100));
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => request('203.0.113.8')));
  assert.equal(concurrent.filter(x => x.status === 200).length, 5);
  assert.equal(concurrent.filter(x => x.status === 429 && x.body.code === 'ip_minute_limit').length, 1);
  assert.equal(jevCalls, 5);
  const ipKeys = [...lastKeys];
  for (let batch = 0; batch < 3; batch++) {
    await command(['HSET', ipKeys[0], 'window', -1]);
    for (let i = 0; i < 5; i++) assert.equal((await request('203.0.113.8')).status, 200);
  }
  const daily = await request('203.0.113.8');
  assert.equal(daily.status, 429);
  assert.equal(daily.body.code, 'ip_daily_limit');
  assert.equal(jevCalls, 20);
  assert.ok(Number(daily.headers['retry-after']) > 0);
  await command(['HSET', ipKeys[2], 'count', 499]);
  const global = await Promise.all(Array.from({ length: 5 }, (_, i) => request(`198.18.0.${i + 1}`)));
  assert.equal(global.filter(x => x.status === 200).length, 1);
  assert.equal(global.filter(x => x.body.code === 'global_daily_limit').length, 4);
  assert.equal(jevCalls, 21);
  assert.equal(await command(['HGET', ipKeys[2], 'count']), '500');
});
