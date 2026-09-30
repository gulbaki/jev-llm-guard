import assert from 'node:assert/strict';
import test from 'node:test';
import { runScenarios, selectScenarios } from '../src/scenarios.js';

test('selects a scenario group by prefix', () => {
  const selected = selectScenarios(['injection']);
  assert.ok(selected.length >= 2);
  assert.ok(selected.every(({ id }) => id.startsWith('injection:')));
  assert.throws(() => selectScenarios(['missing']), /Unknown scenario/);
});

test('runs selected scenarios and keeps a failing request visible', async () => {
  const seen = [];
  const results = await runScenarios(['injection'], {
    evaluate: async (text) => {
      seen.push(text);
      if (seen.length === 2) throw new Error('Jev request failed (HTTP 401)');
      return { model: 'system-one-v1', action: 'block', decisions: { prompt_injection: 0.95 } };
    },
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].result.action, 'block');
  assert.match(results[1].error, /HTTP 401/);
  assert.equal(seen.length, 2);
});
