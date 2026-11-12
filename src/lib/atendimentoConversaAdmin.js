import { supabase } from '@/lib/customSupabaseClient';

/**
 * Conta conversas que seriam removidas (superadmin).
 */
export async function countConversationsForPurge({ clienteId, whatsappConfigId, status = 'all' }) {
  if (!clienteId) return { count: 0, error: null };
  let query = supabase
    .from('atendimento_conversas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId);
  if (whatsappConfigId && whatsappConfigId !== 'all') {
    query = query.eq('whatsapp_config_id', whatsappConfigId);
  }
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  const { count, error } = await query;
  return { count: count ?? 0, error };
}

/**
 * Remove conversas do módulo Conversas (lembretes vinculados caem em CASCADE).
 * Mensagens em cliente_whatsapp_inbox/sent permanecem, só perdem conversation_id.
 */
export async function purgeAtendimentoConversations({ clienteId, whatsappConfigId, status = 'all' }) {
  if (!clienteId) {
    return { error: new Error('Selecione a operação.') };
  }
  if (!whatsappConfigId || whatsappConfigId === 'all') {
    return { error: new Error('Selecione um canal WhatsApp específico.') };
  }

  let query = supabase
    .from('atendimento_conversas')
    .delete()
    .eq('cliente_id', clienteId)
    .eq('whatsapp_config_id', whatsappConfigId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { error } = await query;
  return { error: error ? new Error(error.message) : null };
}

export async function deleteAtendimentoConversation(conversationId) {
  if (!conversationId) return { error: new Error('Conversa não identificada.') };
  const { error } = await supabase.from('atendimento_conversas').delete().eq('id', conversationId);
  return { error: error ? new Error(error.message) : null };
}
