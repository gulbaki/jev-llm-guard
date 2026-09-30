#!/usr/bin/env node
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectResearchCases } from '../src/research-cases.js';
import { evaluateResearchCases, summarizeEvaluation } from '../src/research-eval.js';
config({ quiet: true });
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) process.stdout.write('Usage: npm run eval:research -- [context-or-case | --all] [--max=N] [--concurrency=N]\n');
else if (!process.env.TYPESAFE_API_KEY) { process.stderr.write('TYPESAFE_API_KEY is required.\n'); process.exitCode = 1; }
else {
  try {
    const maxArg = args.find(x => x.startsWith('--max='));
    const concurrencyArg = args.find(x => x.startsWith('--concurrency='));
    const max = maxArg ? Number(maxArg.slice(6)) : Infinity;
    const concurrency = concurrencyArg ? Number(concurrencyArg.slice(14)) : 2;
    const filters = args.filter(x => x !== maxArg && x !== concurrencyArg);
    if ((max !== Infinity && (!Number.isInteger(max) || max <= 0)) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || filters.some(x => x.startsWith('--') && x !== '--all')) throw new Error('Invalid options: --max must be positive; --concurrency must be 1–8.');
    const cases = selectResearchCases(filters).slice(0,max);
    process.stdout.write(`Jev Guard — ${cases.length} contextual regressions (authored scenarios; not independently validated exploits)\n`);
    const rows = await evaluateResearchCases(cases, { concurrency, config: { apiKey: process.env.TYPESAFE_API_KEY, baseURL: process.env.TYPESAFE_BASE_URL, model: process.env.TYPESAFE_DEFAULT_MODEL } });
    for (const row of rows) process.stdout.write(`${row.status.toUpperCase()} ${row.researchCase.id} ${row.researchCase.category}: ${row.actual ?? row.error}\n`);
    const metrics = summarizeEvaluation(rows);
    process.stdout.write('\nContext | passed/total | FP | FN | category misses | errors\n');
    for (const [context, x] of Object.entries(metrics.by_context)) process.stdout.write(`${context} | ${x.passed}/${x.total} | ${x.false_positives} | ${x.false_negatives} | ${x.category_misses} | ${x.errors}\n`);
    process.stdout.write(`Reviews: ${metrics.reviews}; latency p50/p95: ${metrics.latency_ms.p50}/${metrics.latency_ms.p95} ms; tokens in/out: ${metrics.tokens.input}/${metrics.tokens.output}\n`);
    const report = { timestamp: new Date().toISOString(), framework: 'OWASP-LLM-2026', provenance: 'authored_regression_inspired_by_owasp', metrics, rows };
    await mkdir('out', { recursive: true });
    const path = resolve('out/contextual-evaluation.json'); await writeFile(path, JSON.stringify(report,null,2));
    process.stdout.write(`JSON report: ${path}\n`);
    if (metrics.passed !== metrics.total) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
