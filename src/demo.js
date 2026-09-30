import { evaluateGuardrail } from './guard.js';
import { writeHtmlReport } from './report.js';
import { runScenarios } from './scenarios.js';

const HELP = `Usage: npm run scenarios [-- scenario-id-or-prefix] [--no-html]

Examples:
  npm run scenarios
  npm run scenarios -- injection
  npm run scenarios -- benign:article --no-html
`;

export async function runDemo(args, {
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  evaluate = evaluateGuardrail,
  writeReport = writeHtmlReport,
} = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    stdout.write(HELP);
    return 0;
  }
  if (!env.TYPESAFE_API_KEY) {
    stderr.write('TYPESAFE_API_KEY is required. Put it in .env or export it in your shell.\n');
    return 1;
  }
  const noHtml = args.includes('--no-html');
  const filters = args.filter((arg) => arg !== '--no-html');
  if (filters.some((arg) => arg.startsWith('--'))) {
    stderr.write('Unknown option. Run npm run scenarios -- --help.\n');
    return 1;
  }
  const config = {
    apiKey: env.TYPESAFE_API_KEY,
    baseURL: env.TYPESAFE_BASE_URL,
    model: env.TYPESAFE_DEFAULT_MODEL,
  };
  let results;
  try {
    results = await runScenarios(filters, { evaluate, config });
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  stdout.write('Jev Guard — contextual security scenarios\n');
  stdout.write(`Base URL: ${config.baseURL || '(default)'}\n`);
  stdout.write(`Model: ${config.model || 'jev-latest'}\n\n`);
  for (const { scenario, result, error } of results) {
    if (error) {
      stdout.write(`${scenario.id}: ERROR — ${error}\n`);
    } else {
      stdout.write(`${scenario.id}: ${result.action.toUpperCase()} — injection ${Math.round(result.decisions.prompt_injection * 100)}%, exfiltration ${Math.round(result.decisions.data_exfiltration_attempt * 100)}%, safe ${Math.round(result.decisions.safe_to_execute * 100)}%, type ${result.attack_type.choice}, severity ${result.severity.score.toFixed(2)}/4\n`);
    }
  }
  if (!noHtml) {
    const path = await writeReport(results, {
      baseURL: config.baseURL || '(default)', model: config.model || 'jev-latest',
    });
    stdout.write(`\nHTML report: ${path}\n`);
  }
  return results.some(({ error }) => error) ? 1 : 0;
}
