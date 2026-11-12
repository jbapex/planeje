import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import { SessionExpiredError } from '@/lib/authSessionToast';
import { parseFunctionInvokeError } from '@/lib/atendimentoMessageActions';

async function callAdminClientUser(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new SessionExpiredError();
  const result = await invokeEdgeFunction('admin-client-user', payload, session.access_token);
  if (result.error) throw new Error(await parseFunctionInvokeError(result.error, result.data));
  if (result.data?.error) throw new Error(String(result.data.error));
  return result.data || {};
}

/** Administrador da loja cria um login da própria loja com nível e setores. */
export function criarUsuarioLoja({ clienteId, nome, email, senha, nivel, setorIds }) {
  return callAdminClientUser({
    acao: 'loja_criar',
    cliente_id: clienteId,
    full_name: nome,
    email,
    password: senha,
    nivel,
    setor_ids: setorIds || [],
  });
}

/** Troca a senha de um login que a própria loja criou. */
export function trocarSenhaUsuarioLoja({ clienteId, userId, senha }) {
  return callAdminClientUser({ acao: 'loja_senha', cliente_id: clienteId, user_id: userId, password: senha });
}
