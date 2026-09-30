import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const percent = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';

function metric(label, value, cssClass = '') {
  return `<div class="metric ${cssClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(percent(value))}</strong><div class="track"><i style="width:${Math.max(0, Math.min(100, Math.round((value || 0) * 100)))}%"></i></div></div>`;
}

function card({ scenario, result, error }) {
  const heading = `<div class="card-head"><div><small>${escapeHtml(scenario.id)}</small><h2>${escapeHtml(scenario.title)}</h2><p>${escapeHtml(scenario.description)}</p></div><span class="badge ${escapeHtml(result?.action || 'error')}">${escapeHtml((result?.action || 'error').toUpperCase())}</span></div>`;
  const body = error
    ? `<p class="error-text">${escapeHtml(error)}</p>`
    : `<div class="metrics">${metric('Prompt injection', result.decisions.prompt_injection, 'danger')}${metric('Data exfiltration', result.decisions.data_exfiltration_attempt, 'danger')}${metric('Safe to execute', result.decisions.safe_to_execute, 'safe')}</div>
       <div class="details"><span>Attack type <b>${escapeHtml(result.attack_type.choice)}</b> (${percent(result.attack_type.confidence)} confidence)</span><span>Severity <b>${escapeHtml(result.severity.score.toFixed(2))}/4</b></span><span>Model <b>${escapeHtml(result.model)}</b></span><span>Latency <b>${escapeHtml(result.latency_ms)} ms</b></span><span>Tokens <b>${escapeHtml(result.usage?.input_tokens ?? '—')} in / ${escapeHtml(result.usage?.output_tokens ?? '—')} out</b></span></div>`;
  return `<article class="card">${heading}<pre>${escapeHtml(scenario.text)}</pre>${body}</article>`;
}

export function renderHtmlReport(results, { baseURL = '(default)', model = 'jev-latest' } = {}) {
  const counts = Object.fromEntries(['allow', 'review', 'block', 'error'].map((action) =>
    [action, results.filter(({ result }) => (result?.action || 'error') === action).length]));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jev Prompt Guard — Scenario Report</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0c1018;color:#edf2fa}
*{box-sizing:border-box}body{margin:0;padding:40px 20px}main{max-width:1100px;margin:auto}
h1{font-size:clamp(2rem,5vw,3.5rem);margin:8px 0}h2{font-size:1.25rem;margin:6px 0}p{color:#aab9c9;line-height:1.5;margin:4px 0}
.eyebrow,small{color:#74b8ff;text-transform:uppercase;letter-spacing:.12em;font-size:.75rem;font-weight:700}
.intro{max-width:680px}.config{margin:22px 0 32px;color:#8fa0b5;font-size:.9rem;overflow-wrap:anywhere}
.summary{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0}.summary div{background:#17202c;border:1px solid #293545;border-radius:12px;padding:16px 22px;min-width:130px}.summary strong{display:block;font-size:1.8rem}.summary span{color:#aab9c9;text-transform:uppercase;font-size:.7rem;letter-spacing:.1em}
.cards{display:grid;gap:18px}.card{background:#151d28;border:1px solid #2b3849;border-radius:18px;padding:24px;box-shadow:0 12px 35px #0002}
.card-head{display:flex;justify-content:space-between;align-items:start;gap:16px}.badge{border-radius:999px;padding:7px 12px;font-weight:800;font-size:.75rem;letter-spacing:.08em;background:#343e4c}.badge.block{background:#693041;color:#ffb3c5}.badge.review{background:#69512d;color:#ffe0a2}.badge.allow{background:#255645;color:#a8f2c8}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0c131d;color:#b8c6d8;padding:16px;border-radius:10px;line-height:1.5;margin:18px 0}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.metric{background:#1d2936;border-radius:10px;padding:14px}.metric span{display:block;color:#b1c0d0;font-size:.8rem}.metric strong{display:block;font-size:1.35rem;margin:4px 0}.track{height:6px;border-radius:6px;background:#344254;overflow:hidden}.track i{display:block;height:100%;background:#ed867f}.metric.safe .track i{background:#70d5a1}
.details{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px;color:#96a9bd;font-size:.78rem}.details span{padding:7px 10px;border:1px solid #334254;border-radius:8px}.details b{color:#e6f1fc}.error-text{color:#ffb3c5}
@media(max-width:700px){body{padding:24px 12px}.card{padding:16px}.metrics{grid-template-columns:1fr}.card-head{flex-direction:column}}
</style></head><body><main>
<div class="eyebrow">System One · Security scenarios</div><h1>Jev Prompt Guard</h1><p class="intro">Prompt injection decisions across realistic untrusted content. Probabilities come from Jev; the final action follows local thresholds.</p>
<div class="config">Base URL: ${escapeHtml(baseURL)} · Model: ${escapeHtml(model)}</div>
<div class="summary"><div><strong>${results.length}</strong><span>Scenarios</span></div><div><strong>${counts.block}</strong><span>Block</span></div><div><strong>${counts.review}</strong><span>Review</span></div><div><strong>${counts.allow}</strong><span>Allow</span></div><div><strong>${counts.error}</strong><span>Errors</span></div></div>
<div class="cards">${results.map(card).join('')}</div>
</main></body></html>`;
}

export async function writeHtmlReport(results, meta, outputPath = 'out/report.html') {
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, renderHtmlReport(results, meta), 'utf8');
  return absolutePath;
}
