import assert from 'node:assert/strict';
import test from 'node:test';
import * as corpus from '../src/research-cases.js';

test('benchmark covers four contexts with 30 labelled cases each and at least 100 distinct texts', () => {
  const cases = corpus.selectResearchCases(['--all']);
  assert.equal(cases.length, 120);
  assert.ok(new Set(cases.map(x => x.text)).size >= 100);
  for (const context of ['user_input','retrieved_content','tool_output','model_output']) {
    const suite = cases.filter(x => x.context === context);
    assert.equal(suite.length, 30);
    assert.equal(suite.filter(x => x.expected === 'hold').length, 15);
    assert.equal(suite.filter(x => x.expected === 'allow').length, 15);
  }
  assert.equal(new Set(cases.map(x => x.id)).size, 120);
  assert.ok(cases.every(x => x.sourceUrl && x.provenance && x.category && !x.sourceContext));
});
test('selects a contextual suite and validates every benchmark input', async () => {
  const { validateInput } = await import('../src/context.js');
  assert.equal(corpus.selectResearchCases(['tool_output']).length, 30);
  for (const x of corpus.selectResearchCases(['--all'])) assert.doesNotThrow(() => validateInput(x));
  assert.throws(() => corpus.selectResearchCases(['missing']), /Unknown case/);
});

test('quotation regressions include bilingual analysis and active attacks in all four contexts', async () => {
  const { validateInput } = await import('../src/context.js');
  const cases = corpus.selectResearchCases(['quotes']);
  assert.equal(cases.length, 48);
  assert.equal(new Set(cases.map(x => x.id)).size, 48);
  for (const context of ['user_input', 'retrieved_content', 'tool_output', 'model_output']) {
    const suite = cases.filter(x => x.context === context);
    assert.equal(suite.filter(x => x.expected === 'allow').length, 4);
    assert.equal(suite.filter(x => x.expected === 'hold').length, 8);
    assert.deepEqual(new Set(suite.map(x => x.language)), new Set(['tr', 'en']));
  }
  assert.equal(cases.find(x => x.id === 'quotes:user_input:tr-analysis').trustedTask, undefined);
  for (const x of cases) assert.doesNotThrow(() => validateInput(x));
});
