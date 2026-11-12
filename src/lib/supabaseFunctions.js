import { supabaseUrl, supabaseAnonKey } from '@/lib/customSupabaseClient';

export function getSupabaseFunctionsBaseUrl() {
  if (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL) {
    return String(import.meta.env.VITE_SUPABASE_FUNCTIONS_URL).replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'planeje.jbapex.com.br' || host === 'www.planeje.jbapex.com.br') {
      return `${window.location.origin}/sb-fn`;
    }
  }
  return `${supabaseUrl}/functions/v1`;
}

export async function invokeEdgeFunction(functionName, body, accessToken) {
  const url = `${getSupabaseFunctionsBaseUrl()}/${functionName}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error(
      'Não foi possível contactar o servidor. Recarregue a página (Ctrl+Shift+R) e tente novamente.'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error ||
      data?.message ||
      (data?.code ? `${data.code}: ${data.message || res.statusText}` : null) ||
      `Erro ${res.status} ao processar a requisição.`;
    return { data, error: { message, status: res.status, context: { status: res.status } } };
  }

  return { data, error: null };
}
