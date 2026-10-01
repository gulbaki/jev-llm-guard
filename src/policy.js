export const POLICY_VERSION = '1.2';
export const RISK_DEFINITIONS = [
  ['LLM01', 'Prompt Injection', 'Prompt injection', 'Active instruction to override the assigned task, impersonate a trusted role, or cross the instruction/data boundary.'],
  ['LLM02', 'Sensitive Information Disclosure', 'Sensitive information disclosure', 'Active request to disclose credentials, confidential or personal data, or such disclosure in generated output. Public facts and dummy placeholders are not secrets.'],
  ['LLM03', 'Excessive Agency', 'Excessive agency', 'Attempt to perform unauthorized, destructive, or unconfirmed side effects. Compare with allowedActions and trusted_task. An authorized ordinary action is not an attack.'],
  ['LLM04', 'Supply Chain', 'Supply chain', 'Active attempt to install or load an untrusted package/model, run a remote installer, or disable dependency integrity checks. Merely mentioning a dependency is not evidence.'],
  ['LLM05', 'Data and Model Poisoning', 'Data and model poisoning', 'Active attempt to corrupt training data, ingestion, stored memory or future answers. Historical description and legitimate corrections are not attacks.'],
  ['LLM06', 'Unbounded Consumption', 'Unbounded consumption', 'Active request for infinite loops, uncontrolled recursive tool use, or resource exhaustion. A bounded long task is not an attack.'],
  ['LLM07', 'Misinformation', 'Misinformation', 'A factual statement contradicted by the supplied referenceFacts. Without references truth cannot be assessed: answer no. Do not judge a reference as globally authoritative.'],
  ['LLM08', 'Hidden Context Exposure', 'Hidden context exposure', 'Active attempt to obtain internal prompts, private reasoning, hidden verification tokens, or confidential context. Asking for a public explanation is allowed.'],
  ['LLM09', 'Vector and Embedding Weaknesses', 'Vector and embedding weaknesses', 'Active attempt to bypass retrieval access boundaries, inject a forged high-ranked source, or manipulate search/index metadata for unauthorized access.'],
  ['LLM10', 'Improper Output Handling', 'Improper output handling', 'Executable or exfiltrating payload likely to be unsafe at the supplied outputSink, including HTML/script, shell or SQL. Plain text/code quoted for analysis is not executable. Without a sink do not presume execution.'],
].map(([id, name, label, question]) => ({ id, name, label, question }));

const EVIDENCE_LIMITS = {
  LLM04: 'Dependency provenance and integrity require an inventory audit; text alone cannot verify them.',
  LLM05: 'Assessing poisoning impact requires data provenance and the actual ingestion or training pipeline.',
  LLM06: 'Assessing resource consumption requires token, request, time, and cost measurements.',
  LLM07: 'Misinformation is assessed only against the supplied trusted references; general factual accuracy is not verified.',
  LLM09: 'Retrieval security requires index configuration, access controls, and evidence from actual queries.',
};
export function applyPolicy(input, probabilities) {
  const risks = {};
  const limits = [];
  let action = 'allow';
  const { context, appContext } = input;
  for (const { id, name, label } of RISK_DEFINITIONS) {
    const outputApplies = context === 'model_output' || context === 'tool_output';
    const notApplicable = id === 'LLM10' && (appContext.outputSink === 'text' || (!outputApplies && !appContext.outputSink));
    const unavailable = (id === 'LLM07' && !appContext.referenceFacts?.length) || (id === 'LLM10' && !appContext.outputSink);
    let probability = notApplicable || unavailable ? null : probabilities[id];
    let status = notApplicable ? 'not_applicable' : unavailable ? 'needs_context' : probability >= 0.4 ? 'signal' : 'no_signal';
    if (id in EVIDENCE_LIMITS) {
      if (status === 'no_signal') status = 'needs_context';
      if (status === 'needs_context') probability = null;
      // References establish a bounded comparison, not a global fact check.
      if (id === 'LLM07' && appContext.referenceFacts?.length) { status = probabilities[id] >= 0.4 ? 'signal' : 'no_signal'; probability = probabilities[id]; }
      limits.push(EVIDENCE_LIMITS[id]);
    }
    if (id === 'LLM10' && status === 'needs_context') limits.push('Output safety requires the actual output sink and downstream escaping or validation steps.');
    risks[id] = { name, label, status, signal_probability: probability };
    if (status === 'signal') {
      if (probability >= 0.8 && id !== 'LLM07') action = 'block';
      else if (action === 'allow') action = 'review';
    }
  }
  const usage = appContext.usage;
  const exhausted = usage && ((usage.tokenLimit !== undefined && usage.usedTokens !== undefined && usage.usedTokens >= usage.tokenLimit) || (usage.requestLimit !== undefined && usage.requestCount !== undefined && usage.requestCount >= usage.requestLimit));
  if (exhausted) {
    risks.LLM06 = { ...risks.LLM06, status: 'signal', signal_probability: null, evidence: 'declared_usage_limit' };
    action = 'block';
    limits.push('The resource limit declared by the calling application is exhausted; new processing is blocked.');
  }
  limits.push('Scores measure signals in the text; they are not verified OWASP vulnerabilities or calibrated attack-success probabilities.');
  return { risks, action, limits };
}
