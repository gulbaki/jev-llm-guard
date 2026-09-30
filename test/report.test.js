import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtmlReport } from '../src/report.js';

test('renders probabilities and escapes untrusted scenario text', () => {
  const html = renderHtmlReport([{
    scenario: {
      id: 'injection:html',
      title: '<img src=x onerror=alert(1)>',
      description: 'Tool output',
      text: '<script>alert(1)</script>',
    },
    result: {
      model: 'system-one-v1', action: 'block', latency_ms: 120,
      decisions: {
        prompt_injection: 0.98,
        data_exfiltration_attempt: 0.86,
        safe_to_execute: 0.04,
      },
      attack_type: { choice: 'instruction_override', confidence: 0.91, probabilities: { instruction_override: 0.91 } },
      severity: { score: 3.6, confidence: 0.88, probabilities: { '4': 0.7 }, legend: { '4': 'critical' } },
      usage: { input_tokens: 100, output_tokens: 30 },
    },
  }], { baseURL: 'https://example.test', model: 'system-one-v1' });
  assert.match(html, /98%/);
  assert.match(html, /BLOCK/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror/);
});
