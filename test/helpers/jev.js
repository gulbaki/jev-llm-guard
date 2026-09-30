export function jevResponse(scores = {}) {
  return {
    model: 'system-one-v1',
    answers: {
      ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
        const id = `LLM${String(i + 1).padStart(2, '0')}`;
        return [id, { type: 'noul', noul: scores[id] ?? 0.02 }];
      })),
      safe_to_execute: { type: 'noul', noul: scores.safe_to_execute ?? 0.98 },
      attack_type: { type: 'choice', choice: 'none', confidence: 0.9, probabilities: { none: 0.9, instruction_override: 0.05, data_exfiltration: 0.03, tool_hijack: 0.02 } },
      severity: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0, '3': 0, '4': 0 }, legend: { '0': 'none', '1': 'low', '2': 'moderate', '3': 'high', '4': 'critical' } },
    },
    usage: { input_tokens: 100, output_tokens: 30 },
  };
}
export const httpResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
