import assert from 'node:assert/strict';
import test from 'node:test';

const build = async result => (await import('../web/view.js')).buildResultView(result);

test('prioritizes actionable risks without converting missing evidence into zero risk', async () => {
  const view = await build({ action: 'review', risks: {
    LLM04: { label: 'Tedarik zinciri', status: 'needs_context', signal_probability: null },
    LLM01: { label: 'Prompt injection', status: 'signal', signal_probability: 0.45 },
    LLM03: { label: 'Aşırı yetki', status: 'signal', signal_probability: 0.81 },
    LLM08: { label: 'Gizli bağlam', status: 'no_signal', signal_probability: 0 },
    LLM10: { label: 'Çıktı', status: 'not_applicable', signal_probability: null },
  }});
  assert.deepEqual(view.rows.map(x => x.id), ['LLM03','LLM01','LLM08','LLM04','LLM10']);
  assert.equal(view.rows[3].score, '—');
  assert.equal(view.rows[2].score, '0%');
  assert.equal(view.counts.signals, 2);
  assert.equal(view.counts.missing, 1);
  assert.equal(view.counts.assessed, 3);
});

test('a deterministic limit stays an actionable signal despite having no probability', async () => {
  const view = await build({ action: 'block', risks: {
    LLM06: { label: 'Kaynak tüketimi', status: 'signal', signal_probability: null, evidence: 'declared_usage_limit' },
  }});
  assert.equal(view.rows[0].status, 'signal');
  assert.equal(view.rows[0].score, 'Limit dolu');
  assert.equal(view.counts.signals, 1);
  assert.equal(view.action, 'block');
});

test('an allowing verdict explicitly preserves the need to assess missing context', async () => {
  const view = await build({ action: 'allow', risks: {
    LLM04: { label: 'Tedarik zinciri', status: 'needs_context', signal_probability: null },
  }});
  assert.match(view.note, /eksik bağlam/i);
  assert.equal(view.action, 'allow');
  const invalid = await build({ action: 'unknown', risks: {} });
  assert.equal(invalid.action, 'review');
});
