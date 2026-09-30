import { evaluateGuardrail } from './guard.js';
const HELP = `Usage: jev-guard [--json] [--context=CONTEXT] [--task=TASK] <text>
       echo "text" | jev-guard [--json] [--context=CONTEXT]

Contexts: user_input, retrieved_content, tool_output, model_output
Set TYPESAFE_API_KEY, TYPESAFE_BASE_URL and TYPESAFE_DEFAULT_MODEL.
`;
export async function runCli(args, { env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, fetchImpl = fetch } = {}) {
  if (args.includes('--help') || args.includes('-h')) { stdout.write(HELP); return 0; }
  const json = args.includes('--json');
  let context = 'user_input'; let trustedTask;
  const inputArgs = [];
  for (const arg of args) {
    if (arg === '--json') continue;
    if (arg.startsWith('--context=')) context = arg.slice(10);
    else if (arg.startsWith('--task=')) trustedTask = arg.slice(7);
    else if (arg.startsWith('-') && arg !== '-') { stderr.write('Unknown option. Run jev-guard --help.\n'); return 1; }
    else inputArgs.push(arg);
  }
  if (!env.TYPESAFE_API_KEY) { stderr.write('TYPESAFE_API_KEY is required.\n'); return 1; }
  if (inputArgs.includes('-') && inputArgs.length > 1) { stderr.write('Use either text or stdin, not both.\n'); return 1; }
  if (!inputArgs.length && stdin.isTTY) { stderr.write(HELP); return 1; }
  let text = inputArgs.join(' ');
  if (!inputArgs.length || inputArgs[0] === '-') {
    text = '';
    for await (const chunk of stdin) {
      text += chunk.toString();
      if (text.length > 20_000) { stderr.write('Text exceeds 20000 characters\n'); return 1; }
    }
  }
  try {
    const result = await evaluateGuardrail({ text, context, ...(trustedTask === undefined ? {} : { trustedTask }) }, { apiKey: env.TYPESAFE_API_KEY, baseURL: env.TYPESAFE_BASE_URL, model: env.TYPESAFE_DEFAULT_MODEL, fetchImpl });
    if (json) stdout.write(`${JSON.stringify(result)}\n`);
    else {
      stdout.write(`Context: ${result.context}\n`);
      for (const [id, risk] of Object.entries(result.risks)) stdout.write(`${id} ${risk.name}: ${risk.status}${risk.signal_probability === null ? '' : ` (${Math.round(risk.signal_probability * 100)}%)`}\n`);
      stdout.write(`Decision: ${result.action.toUpperCase()}\n`);
      stdout.write(`Model: ${result.model} | ${result.latency_ms} ms\n`);
    }
    return 0;
  } catch (error) { stderr.write(`${error.message}\n`); return 1; }
}
