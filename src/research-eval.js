import { evaluateGuardrail } from './guard.js';
export async function evaluateResearchCases(cases, { evaluate = evaluateGuardrail, config = {}, concurrency = 1 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('concurrency must be an integer from 1 to 8');
  const rows = new Array(cases.length); let nextIndex = 0;
  async function worker() {
    while (nextIndex < cases.length) {
      const index = nextIndex++; const researchCase = cases[index];
      try {
        const { text, context = 'user_input', trustedTask, appContext } = researchCase;
        const result = await evaluate({ text, context, ...(trustedTask ? { trustedTask } : {}), ...(appContext ? { appContext } : {}) }, config);
        if (!['allow', 'review', 'block'].includes(result?.action)) throw new Error('Invalid evaluator action');
        const actionPassed = researchCase.expected === 'allow' ? result.action === 'allow' : result.action !== 'allow';
        const riskPassed = !researchCase.expectedRisk || result.risks?.[researchCase.category]?.status === researchCase.expectedRisk;
        rows[index] = { researchCase, result, actual: result.action, actionPassed, riskPassed, status: actionPassed && riskPassed ? 'pass' : 'fail' };
      } catch (error) {
        rows[index] = { researchCase, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  return rows;
}
function stats(rows) {
  const attacks = rows.filter(x => x.researchCase.expected === 'hold');
  const benign = rows.filter(x => x.researchCase.expected === 'allow');
  const fp = benign.filter(x => x.actual === 'review' || x.actual === 'block').length;
  const fn = attacks.filter(x => x.actual === 'allow').length;
  const errors = rows.filter(x => x.status === 'error').length;
  return { total: rows.length, passed: rows.filter(x => x.status === 'pass').length, errors, attacks: attacks.length, benign: benign.length, false_positives: fp, false_negatives: fn,
    false_positive_rate: benign.length ? fp / benign.length : null, false_negative_rate: attacks.length ? fn / attacks.length : null,
    // Errors remain in denominators; rates must be read together with errors.
    category_misses: rows.filter(x => x.riskPassed === false).length };
}
export function summarizeEvaluation(rows) {
  const group = field => Object.fromEntries([...new Set(rows.map(x => x.researchCase[field] ?? 'unspecified'))].map(key => [key, stats(rows.filter(x => (x.researchCase[field] ?? 'unspecified') === key))]));
  const abstentions = {};
  for (const row of rows) for (const [id, risk] of Object.entries(row.result?.risks ?? {})) if (risk.status === 'needs_context') abstentions[id] = (abstentions[id] ?? 0) + 1;
  const latencies = rows.filter(x => Number.isFinite(x.result?.latency_ms)).map(x => x.result.latency_ms).sort((a,b) => a-b);
  const percentile = p => latencies.length ? latencies[Math.ceil(p * latencies.length)-1] : null;
  return { ...stats(rows), by_context: group('context'), by_category: group('category'), context_abstentions: abstentions,
    reviews: rows.filter(x => x.actual === 'review').length, latency_ms: { p50: percentile(0.5), p95: percentile(0.95) },
    tokens: { input: rows.reduce((n,x) => n+(x.result?.usage?.input_tokens ?? 0),0), output: rows.reduce((n,x) => n+(x.result?.usage?.output_tokens ?? 0),0) } };
}
