import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';

async function getAccessTokenForFunctions() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    session = refreshed.session;
  }
  return session.access_token;
}

/**
 * Remove admin/colaborador do sistema (edge function — apenas superadmin).
 */
export async function deleteTeamUser(userId) {
  const accessToken = await getAccessTokenForFunctions();
  const { data, error } = await invokeEdgeFunction(
    'admin-delete-team-user',
    { user_id: userId },
    accessToken
  );

  if (error) {
    throw new Error(error.message || 'Erro ao excluir usuário');
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  if (!data?.ok) {
    throw new Error('Resposta inválida ao excluir usuário');
  }

  return data;
}
