import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoQuota, clientIp } from '../src/demo-quota.js';

const configured = { VERCEL: '1', KV_REST_API_URL: 'https://redis.example.test', KV_REST_API_TOKEN: 'redis-secret', JEV_QUOTA_SECRET: 's'.repeat(64) };
const request = { headers: { 'x-vercel-forwarded-for': '203.0.113.8', 'x-forwarded-for': '203.0.113.100' } };

test('uses the Vercel IP header and ignores spoofable local proxy headers', () => {
  assert.equal(clientIp(request, configured), '203.0.113.8');
  assert.equal(clientIp({ ...request, remoteAddress: '127.0.0.1' }, {}), '127.0.0.1');
  assert.equal(clientIp({ headers: { 'x-vercel-forwarded-for': '::ffff:203.0.113.8' } }, configured), '203.0.113.8');
  assert.equal(clientIp({ headers: { 'x-vercel-forwarded-for': '2001:0DB8:0000::1' } }, configured), '2001:db8::1');
  assert.throws(() => clientIp({ headers: { 'x-forwarded-for': '203.0.113.8' } }, configured));
  assert.throws(() => clientIp({ headers: { 'x-vercel-forwarded-for': '203.0.113.8, 203.0.113.9' } }, configured));
});

test('local demo needs no Redis but public demo fails closed without configuration', async () => {
  assert.deepEqual(await createDemoQuota({ env: {} })(request), { allowed: true });
  await assert.rejects(createDemoQuota({ env: { VERCEL: '1' } })(request));
  await assert.rejects(createDemoQuota({ env: { JEV_PUBLIC_ORIGIN: 'https://demo.test' } })(request));
});

test('reserves with one atomic Redis script, no raw IP/text, no caching or retries', async () => {
  let seen;
  const reserve = createDemoQuota({ env: configured, fetchImpl: async (url, options) => {
    seen = { url, options };
    return Response.json({ result: [1, 0, 0, 19] });
  } });
  assert.deepEqual(await reserve(request), { allowed: true, remainingDaily: 19 });
  assert.equal(seen.options.headers.authorization, 'Bearer redis-secret');
  assert.equal(seen.options.cache, 'no-store');
  assert.ok(seen.options.signal instanceof AbortSignal);
  const command = JSON.parse(seen.options.body);
  assert.equal(command[0], 'EVAL');
  assert.equal(command[2], 3);
  assert.doesNotMatch(seen.options.body, /203\.0\.113|redis-secret/);
});

test('validates Redis responses and reports the correct exhausted bucket', async () => {
  for (const [scope, result] of [['ip_minute', [0, 1, 50, 0]], ['ip_daily', [0, 2, 1234, 0]], ['global_daily', [0, 3, 1234, 0]]]) {
    assert.deepEqual(await createDemoQuota({ env: configured, fetchImpl: async () => Response.json({ result }) })(request), { allowed: false, scope, retryAfter: result[2] });
  }
  for (const body of [{ result: [1] }, { result: [1, 0, 0, 1000] }, { result: [0, 7, 60, 0] }, { result: [0, 2, -1, 0] }, { error: 'secret detail' }]) {
    await assert.rejects(createDemoQuota({ env: configured, fetchImpl: async () => Response.json(body) })(request));
  }
  await assert.rejects(createDemoQuota({ env: configured, fetchImpl: async () => new Response('no', { status: 503 }) })(request));
  await assert.rejects(createDemoQuota({ env: configured, fetchImpl: async () => { throw new Error('offline'); } })(request));
});
