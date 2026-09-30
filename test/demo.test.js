import assert from 'node:assert/strict';
import test from 'node:test';
import { runDemo } from '../src/demo.js';

function writer() {
  let value = '';
  return { write: (chunk) => { value += chunk; }, read: () => value };
}

test('runs only the selected scenario group without HTML', async () => {
  const stdout = writer();
  const stderr = writer();
  const seen = [];
  const code = await runDemo(['injection', '--no-html'], {
    env: {
      TYPESAFE_API_KEY: 'proxy-test-key',
      TYPESAFE_BASE_URL: 'jxa-url.eu-central-1.on.aws',
      TYPESAFE_DEFAULT_MODEL: 'system-one-v1',
    },
    stdout, stderr,
    evaluate: async (text, config) => {
      seen.push({ text, config });
      return {
        model: 'system-one-v1', action: 'block',
        decisions: { prompt_injection: 0.95, data_exfiltration_attempt: 0.2, safe_to_execute: 0.1 },
        attack_type: { choice: 'instruction_override', confidence: 0.9 },
        severity: { score: 4 }, usage: { input_tokens: 100, output_tokens: 20 }, latency_ms: 100,
      };
    },
    writeReport: async () => { throw new Error('HTML should be disabled'); },
  });
  assert.equal(code, 0);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].config.model, 'system-one-v1');
  assert.match(stdout.read(), /injection:override/);
  assert.match(stdout.read(), /instruction_override/);
  assert.doesNotMatch(stdout.read(), /benign:article/);
  assert.equal(stderr.read(), '');
});

test('requires a key before running scenarios', async () => {
  const stderr = writer();
  const code = await runDemo([], { env: {}, stdout: writer(), stderr });
  assert.equal(code, 1);
  assert.match(stderr.read(), /TYPESAFE_API_KEY/);
});
