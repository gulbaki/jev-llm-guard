export const CONTEXTS = ['user_input', 'retrieved_content', 'tool_output', 'model_output'];
export const MAX_TEXT_LENGTH = 20_000;
const SINKS = ['text', 'html', 'markdown', 'shell', 'sql'];
const FIELDS = ['allowedActions', 'outputSink', 'referenceFacts', 'usage', 'dependencies', 'retrieval'];
function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`);
}
function strings(value, name) {
  if (!Array.isArray(value) || value.length > 50 || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 2000)) throw new Error(`Invalid ${name}`);
}
export function validateInput(input) {
  record(input, 'input');
  const { text, context = 'user_input', trustedTask, appContext = {} } = input;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Text must not be empty');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Text exceeds 20000 characters');
  if (!CONTEXTS.includes(context)) throw new Error('Unsupported context');
  if (trustedTask !== undefined && (typeof trustedTask !== 'string' || !trustedTask.trim() || trustedTask.length > 2000)) throw new Error('Invalid trustedTask');
  record(appContext, 'appContext');
  if (Object.keys(appContext).some(k => !FIELDS.includes(k))) throw new Error('Unsupported appContext field');
  for (const k of ['allowedActions', 'referenceFacts']) if (appContext[k] !== undefined) strings(appContext[k], k);
  if (appContext.outputSink !== undefined && !SINKS.includes(appContext.outputSink)) throw new Error('Invalid outputSink');
  if (appContext.usage !== undefined) {
    record(appContext.usage, 'usage');
    const keys = ['usedTokens', 'tokenLimit', 'requestCount', 'requestLimit'];
    if (Object.entries(appContext.usage).some(([k,v]) => !keys.includes(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0)) throw new Error('Invalid usage');
  }
  if (appContext.dependencies !== undefined) {
    if (!Array.isArray(appContext.dependencies) || appContext.dependencies.length > 50) throw new Error('Invalid dependencies');
    for (const dependency of appContext.dependencies) {
      record(dependency, 'dependency');
      if (Object.keys(dependency).some(k => !['name', 'version', 'source'].includes(k)) || ['name', 'version', 'source'].some(k => typeof dependency[k] !== 'string' || !dependency[k] || dependency[k].length > 500)) throw new Error('Invalid dependency');
    }
  }
  if (appContext.retrieval !== undefined) {
    record(appContext.retrieval, 'retrieval');
    const fields = { source: 'string', accessScope: 'string', trustedSource: 'boolean' };
    if (Object.entries(appContext.retrieval).some(([k,v]) => !fields[k] || typeof v !== fields[k] || (typeof v === 'string' && (!v || v.length > 500)))) throw new Error('Invalid retrieval');
  }
  if (JSON.stringify(appContext).length > 8000) throw new Error('appContext exceeds 8000 characters');
  return { text, context, ...(trustedTask === undefined ? {} : { trustedTask }), appContext };
}
