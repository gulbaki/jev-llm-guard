export async function readEvaluationResponse(response) {
  let result;
  try { result = await response.json(); } catch { /* Firewall errors may be HTML. */ }
  if (!response.ok) {
    const fallback = response.status === 429 ? 'Too many analyses. Wait a minute and try again.' : 'Server request failed. Please try again later.';
    throw new Error(typeof result?.error === 'string' ? result.error : fallback);
  }
  if (!result || typeof result !== 'object') throw new Error('Server request failed. Please try again later.');
  return result;
}
