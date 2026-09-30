const STATUS_LABELS = {
  signal: 'Risk sinyali',
  no_signal: 'Sinyal yok',
  needs_context: 'Bağlam eksik',
  not_applicable: 'Uygulanmaz',
};
const ACTIONS = {
  allow: { title: 'Metin işlenebilir', note: 'Mevcut politikaya göre engelleme gerektiren sinyal bulunmadı. Eksik bağlam olan başlıklar ayrıca değerlendirilmelidir.' },
  review: { title: 'İnceleme gerekli', note: 'Bu metni kullanmadan önce işaretlenen riskleri incele.' },
  block: { title: 'Bu metni işleme alma', note: 'İşaretlenen talimatı veya çıktıyı mevcut iş akışına doğrudan aktarma.' },
};
const ORDER = { signal: 0, no_signal: 1, needs_context: 2, not_applicable: 3 };

export function buildResultView(result) {
  const action = Object.hasOwn(ACTIONS,result.action) ? result.action : 'review';
  const rows = Object.entries(result.risks ?? {}).map(([id,risk]) => ({
    id,
    label: risk.label ?? risk.name ?? id,
    status: risk.status,
    statusLabel: STATUS_LABELS[risk.status] ?? 'Bilinmiyor',
    probability: Number.isFinite(risk.signal_probability) ? risk.signal_probability : null,
    score: risk.evidence === 'declared_usage_limit' ? 'Limit dolu' : Number.isFinite(risk.signal_probability) ? `${Math.round(risk.signal_probability*100)}%` : '—',
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
