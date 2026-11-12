import { supabase } from '@/lib/customSupabaseClient';

export async function fetchConversaNotas(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from('atendimento_conversa_notas')
    .select('id, cliente_id, conversation_id, autor_id, autor_nome, texto, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addConversaNota({ conversationId, clienteId, texto, autorId, autorNome }) {
  const clean = String(texto || '').trim();
  if (!conversationId || !clienteId || !clean) {
    throw new Error('Escreva a nota antes de salvar.');
  }
  const { data, error } = await supabase
    .from('atendimento_conversa_notas')
    .insert({
      conversation_id: conversationId,
      cliente_id: clienteId,
      autor_id: autorId || null,
      autor_nome: autorNome || null,
      texto: clean.slice(0, 4000),
    })
    .select('id, cliente_id, conversation_id, autor_id, autor_nome, texto, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteConversaNota(id) {
  if (!id) return;
  const { error } = await supabase.from('atendimento_conversa_notas').delete().eq('id', id);
  if (error) throw error;
}
