import { supabase } from '@/lib/customSupabaseClient';

export async function parseAdminClientUserError(error, data) {
  if (data?.error && typeof data.error === 'string') return data.error;
  // FunctionsHttpError keeps the server's JSON response in context, not data.
  // Clone it so callers can still inspect the original response if necessary.
  if (error?.context && typeof error.context.clone === 'function') {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    } catch {
      // A gateway/network failure may return HTML or an empty response.
    }
  }
  if (typeof error?.message === 'string' && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro ao criar ou vincular login';
}

/**
 * Cria login de cliente ou vincula e-mail já cadastrado (edge function superadmin).
 */
export async function createOrLinkClientUser({ email, password, fullName, clienteId }) {
  const { data, error } = await supabase.functions.invoke('admin-client-user', {
    body: {
      email: String(email || '').trim().toLowerCase(),
      password,
      full_name: fullName,
      cliente_id: clienteId,
    },
  });

  if (error) {
    throw new Error(await parseAdminClientUserError(error, data));
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!data?.ok) {
    throw new Error('Resposta inválida ao criar login');
  }

  return data;
}
