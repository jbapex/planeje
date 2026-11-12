export class DecisionProviderError extends Error {}

export async function requestDecisionModel({ key, messages, signal, request = fetch }) {
  const timeout = AbortSignal.timeout(22000);
  const response = await request('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, response_format: { type: 'json_object' }, max_tokens: 1150, store: false }),
  });
  if (response.status === 429) throw new DecisionProviderError('PROVIDER_LIMIT');
  if ([400, 401, 403, 404, 422].includes(response.status)) throw new DecisionProviderError('PROVIDER_CONFIG');
  if (!response.ok) throw new DecisionProviderError('PROVIDER_UNAVAILABLE');
  const data = await response.json().catch(() => { throw new DecisionProviderError('PROVIDER_INVALID'); });
  const choice = data?.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw new DecisionProviderError('PROVIDER_INCOMPLETE');
  return choice.message?.content;
}
