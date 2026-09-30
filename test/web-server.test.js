import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiRequest } from '../src/web-server.js';
const env = { TYPESAFE_API_KEY: 'test-key', TYPESAFE_BASE_URL: 'https://proxy.example.test', TYPESAFE_DEFAULT_MODEL: 'system-one-v1' };
const request = (payload, extra = {}) => ({ method: 'POST', headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', 'content-type': 'application/json' }, body: JSON.stringify(payload), ...extra });
test('API forwards explicit text context, trusted task and application evidence with server credentials', async () => {
  let seen;
  const input = { text: 'content', context: 'model_output', trustedTask: 'Return HTML', appContext: { outputSink: 'html' } };
  const response = await handleApiRequest(request(input), { env, evaluate: async (input, opts) => { seen = { input, opts }; return { action: 'review' }; } });
  assert.equal(response.status, 200);
  assert.deepEqual(seen.input, input);
  assert.equal(seen.opts.apiKey, 'test-key');
  assert.equal(seen.opts.model, 'system-one-v1');
  assert.doesNotMatch(JSON.stringify(response.body), /test-key/);
});
test('rejects unknown context, obsolete email mode and invalid application metadata before evaluation', async () => {
  let calls = 0;
  for (const payload of [{ text: 'hello', context: 'unknown' }, { text: 'hello', sourceContext: 'retrieved_email' }, { text: 'hello', appContext: { systemPrompt: 'secret' } }, { text: 'hello', trustedTask: [] }]) {
    assert.equal((await handleApiRequest(request(payload), { env, evaluate: async () => { calls++; } })).status, 400);
  }
  assert.equal(calls, 0);
});
test('rejects blank text and oversized requests', async () => {
  const evaluate = async () => { throw new Error('unexpected call'); };
  assert.equal((await handleApiRequest(request({ text: '  ' }), { env, evaluate })).status, 400);
  assert.equal((await handleApiRequest(request({ text: 'x'.repeat(20_001) }), { env, evaluate })).status, 413);
});
test('rejects cross-origin and non JSON requests', async () => {
  const evaluate = async () => { throw new Error('unexpected call'); };
  assert.equal((await handleApiRequest(request({ text: 'hello' }, { headers: { host: '127.0.0.1:4173', origin: 'https://evil.example', 'content-type': 'application/json' } }), { env, evaluate })).status, 403);
  assert.equal((await handleApiRequest(request({ text: 'hello' }, { headers: { host: '127.0.0.1:4173', 'content-type': 'text/plain' } }), { env, evaluate })).status, 415);
});
test('keeps upstream details and API keys out of error responses', async () => {
  const response = await handleApiRequest(request({ text: 'hello' }), { env, evaluate: async () => { throw new Error('upstream detail test-key'); } });
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(response.body), /test-key|upstream detail/);
});

test('malformed request URLs return 400 and the demo can still serve a subsequent request', async () => {
  const { createDemoServer } = await import('../src/web-server.js');
  const server = createDemoServer({ env });
  const handle = server.listeners('request')[0];
  const response = () => ({ status: undefined, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = String(body); } });
  const bad = response();
  await handle({ method: 'GET', url: '//' }, bad);
  assert.equal(bad.status, 400);
  const good = response();
  await handle({ method: 'GET', url: '/' }, good);
  assert.equal(good.status, 200);
  assert.match(good.body, /Jev Guard/);
  server.close();
});

test('serves the result presentation module used by the demo', async () => {
  const { createDemoServer } = await import('../src/web-server.js');
  const server = createDemoServer({ env });
  const response = { status: undefined, headers: {}, body: '', writeHead(status,headers) { this.status=status; this.headers=headers; }, end(body) { this.body=String(body); } };
  await server.listeners('request')[0]({method:'GET',url:'/view.js'},response);
  assert.equal(response.status,200);
  assert.match(response.headers['content-type'],/javascript/);
  const module = await import(`data:text/javascript;base64,${Buffer.from(response.body).toString('base64')}`);
  assert.equal(module.buildResultView({action:'block',risks:{}}).action,'block');
  server.close();
});
