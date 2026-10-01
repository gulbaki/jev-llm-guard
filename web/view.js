const STATUS_LABELS = {
  signal: 'Risk signal',
  no_signal: 'No signal',
  needs_context: 'Missing context',
  not_applicable: 'Not applicable',
};
const ACTIONS = {
  allow: { title: 'Text can be processed', note: 'No signal requires blocking under the current policy. Categories with missing context need further assessment.' },
  review: { title: 'Review required', note: 'Review the flagged risks before using this text.' },
  block: { title: 'Do not process this text', note: 'Do not pass the flagged instruction or output directly into the current workflow.' },
};
const ORDER = { signal: 0, no_signal: 1, needs_context: 2, not_applicable: 3 };

export function buildResultView(result) {
  const action = Object.hasOwn(ACTIONS,result.action) ? result.action : 'review';
  const rows = Object.entries(result.risks ?? {}).map(([id,risk]) => ({
    id,
    label: risk.label ?? risk.name ?? id,
    status: risk.status,
    statusLabel: STATUS_LABELS[risk.status] ?? 'Unknown',
    probability: Number.isFinite(risk.signal_probability) ? risk.signal_probability : null,
    score: risk.evidence === 'declared_usage_limit' ? 'Limit reached' : Number.isFinite(risk.signal_probability) ? `${Math.round(risk.signal_probability*100)}%` : '—',
  })).sort((a,b) => (ORDER[a.status] ?? 4)-(ORDER[b.status] ?? 4) || (b.probability ?? -1)-(a.probability ?? -1) || a.id.localeCompare(b.id));
  return {
    action, ...ACTIONS[action], rows,
    counts: {
      signals: rows.filter(x=>x.status==='signal').length,
      assessed: rows.filter(x=>x.status==='signal'||x.status==='no_signal').length,
      missing: rows.filter(x=>x.status==='needs_context').length,
    },
  };
}
