import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import { SessionExpiredError } from '@/lib/authSessionToast';
import { parseFunctionInvokeError } from '@/lib/atendimentoMessageActions';

/** Chama a função atendimento-ia (testar agente / sugerir resposta). Nunca envia ao contato. */
export async function invokeAtendimentoIa(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new SessionExpiredError();
  const result = await invokeEdgeFunction('atendimento-ia', payload, session.access_token);
  if (result.error) throw new Error(await parseFunctionInvokeError(result.error, result.data));
  if (result.data?.error) throw new Error(String(result.data.error));
  return result.data || {};
}
