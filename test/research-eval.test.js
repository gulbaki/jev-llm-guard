import assert from 'node:assert/strict';
import test from 'node:test';
import * as research from '../src/research-eval.js';

test('passes per-case context and trusted task independently from text', async () => {
  const cases = [{ id: 'tool', text: 'content', context: 'tool_output', trustedTask: 'Summarize results', appContext: { outputSink: 'text' }, expected: 'allow' }];
  let seen;
  const rows = await research.evaluateResearchCases(cases, { config: { apiKey: 'test-key' }, evaluate: async (input, opts) => { seen = { input, opts }; return { action: 'allow', risks: {} }; } });
  assert.equal(rows[0].status, 'pass');
  assert.deepEqual(seen.input, { text: 'content', context: 'tool_output', trustedTask: 'Summarize results', appContext: { outputSink: 'text' } });
  assert.equal(seen.opts.apiKey, 'test-key');
});
test('reports contextual false positives, false negatives, abstentions and API errors honestly', () => {
  const rows = [
    { researchCase: { context: 'user_input', expected: 'allow', category: 'LLM01' }, actual: 'review', status: 'fail', result: { risks: { LLM04: { status: 'needs_context' } }, latency_ms: 100 } },
    { researchCase: { context: 'user_input', expected: 'hold', category: 'LLM01' }, actual: 'allow', status: 'fail', result: { risks: {}, latency_ms: 200 } },
    { researchCase: { context: 'tool_output', expected: 'hold', category: 'LLM03' }, actual: 'block', status: 'pass', result: { risks: {}, latency_ms: 300 } },
    { researchCase: { context: 'tool_output', expected: 'allow', category: 'LLM03' }, status: 'error' },
  ];
  const metrics = research.summarizeEvaluation(rows);
  assert.equal(metrics.total, 4); assert.equal(metrics.errors, 1); assert.equal(metrics.passed, 1);
  assert.equal(metrics.by_context.user_input.false_positives, 1);
  assert.equal(metrics.by_context.user_input.false_negatives, 1);
  assert.equal(metrics.by_context.tool_output.errors, 1);
  assert.equal(metrics.by_category.LLM03.total, 2);
  assert.equal(metrics.context_abstentions.LLM04, 1);
  assert.equal(metrics.reviews, 1);
});
test('invalid evaluator actions and category mismatches never pass', async () => {
  const rows = await research.evaluateResearchCases([{ id: 'a', text: 'text', context: 'user_input', category: 'LLM08', expected: 'hold', expectedRisk: 'signal' }], { evaluate: async () => ({ action: 'block', risks: { LLM08: { status: 'no_signal' } } }) });
  assert.equal(rows[0].status, 'fail');
  const invalid = await research.evaluateResearchCases([{ text: 'text', expected: 'hold' }], { evaluate: async () => ({ action: 'other' }) });
  assert.equal(invalid[0].status, 'error');
});
test('bounded concurrency preserves order and retains request errors', async () => {
  const cases = ['a','b','c'].map(id => ({ id, text: id, context: 'tool_output', expected: 'hold' }));
  let release; const gate = new Promise(resolve => { release = resolve; }); const started = [];
  const pending = research.evaluateResearchCases(cases, { concurrency: 2, evaluate: async ({ text }) => { started.push(text); await gate; if (text === 'b') throw new Error('network'); return { action: 'block', risks: {} }; } });
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(started, ['a','b']); release();
  const rows = await pending;
  assert.deepEqual(rows.map(x => x.researchCase.id), ['a','b','c']);
  assert.deepEqual(rows.map(x => x.status), ['pass','error','pass']);
});
