import assert from 'node:assert/strict';
import test from 'node:test';
import { readEvaluationResponse } from '../web/api.js';

test('firewall HTML 429 shows a rate limit message, not a JSON input error', async () => {
  await assert.rejects(readEvaluationResponse(new Response('<html>Too many requests</html>', { status: 429 })), /Too many analyses/);
});
test('daily quota JSON error keeps its helpful message', async () => {
  await assert.rejects(readEvaluationResponse(Response.json({ error: 'Daily demo limit reached. Try again tomorrow.' }, { status: 429 })), /Daily demo limit reached/);
});
test('unexpected server response does not become a form JSON syntax error', async () => {
  await assert.rejects(readEvaluationResponse(new Response('<html>Error</html>', { status: 502 })), /Server request failed/);
  assert.deepEqual(await readEvaluationResponse(Response.json({ action: 'allow' })), { action: 'allow' });
});
