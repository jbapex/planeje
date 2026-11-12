/** Leitura/gravação do Atendimento da loja (tabelas cliente_atend_*, RLS por nível). */
import { supabase } from '@/lib/customSupabaseClient';

export const CONVERSA_FIELDS =
  'id, cliente_id, contact_id, status, status_at, finalizado_at, finalizado_by, assigned_to, setor_id, privado, etiqueta_ids, contato_email, ia_pausada, ia_respondeu_em, updated_at';

export async function fetchMeuMembro(clienteId, userId) {
  if (!clienteId || !userId) return null;
  const { data, error } = await supabase
    .from('cliente_atend_membros')
    .select('id, cliente_id, user_id, nivel, ativo, setor_ids, nome, email')
    .eq('cliente_id', clienteId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchAtendimentoLojaHabilitada(clienteId) {
  if (!clienteId) return false;
  const { data, error } = await supabase.rpc('cliente_atend_loja_habilitada', {
    p_cliente_id: clienteId,
  });
  if (error) return null;
  return data === true;
}

export async function fetchLojaTemMembros(clienteId) {
  if (!clienteId) return false;
  const { count, error } = await supabase
    .from('cliente_atend_membros')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId);
  if (error) return false;
  return (count || 0) > 0;
}

export async function fetchLojaBase(clienteId) {
  const [setores, etiquetas, membros, respostas, agentes] = await Promise.all([
    supabase.from('cliente_atend_setores').select('id, nome, cor, ordem').eq('cliente_id', clienteId).order('ordem').order('nome'),
    supabase.from('cliente_atend_etiquetas').select('id, nome, cor').eq('cliente_id', clienteId).order('nome'),
    supabase
      .from('cliente_atend_membros')
      .select('id, user_id, nivel, ativo, setor_ids, nome, email, created_by, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at'),
    supabase.from('cliente_atend_respostas').select('id, titulo, atalho, texto, updated_at').eq('cliente_id', clienteId).order('titulo'),
    supabase.rpc('cliente_atend_ia_agentes_resumo', { p_cliente_id: clienteId }),
  ]);
  for (const res of [setores, etiquetas, membros, respostas, agentes]) {
    if (res.error) throw res.error;
  }
  const agentesAtivosLista = (agentes.data || []).filter((a) => a.ativo);
  return {
    setores: setores.data || [],
    etiquetas: etiquetas.data || [],
    membros: membros.data || [],
    respostas: respostas.data || [],
    agentes: agentesAtivosLista,
    agentesAtivos: agentesAtivosLista.length,
  };
}

export async function fetchConversasEstado(clienteId) {
  const { data, error } = await supabase
    .from('cliente_atend_conversas')
    .select(CONVERSA_FIELDS)
    .eq('cliente_id', clienteId)
    .limit(1000);
  if (error) throw error;
  return data || [];
}

/**
 * Grava o estado da conversa do contato: update quando a linha existe, insert na primeira vez
 * (insert de atendente exige assigned_to = ele mesmo pela RLS).
 */
export async function saveConversa({ clienteId, contactId, existingId, patch, userId }) {
  const payload = { ...patch, updated_by: userId || null };
  const query = existingId
    ? supabase
        .from('cliente_atend_conversas')
        .update(payload)
        .eq('id', existingId)
        .eq('cliente_id', clienteId)
    : supabase.from('cliente_atend_conversas').insert({
        cliente_id: clienteId,
        contact_id: contactId,
        ...payload,
      });
  const { data, error } = await query.select(CONVERSA_FIELDS).maybeSingle();
  if (error) throw error;
  return data;
}

/** Observação do mini_crm do contato (lê o atual e troca só a chave observacao). */
export async function saveObservacao({ clienteId, contactId, value, patchMiniCrm }) {
  const { data, error } = await supabase
    .from('cliente_whatsapp_contact')
    .select('mini_crm')
    .eq('id', contactId)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw error;
  const next = patchMiniCrm(data?.mini_crm || {}, 'observacao', value, 'text');
  const { error: updateError } = await supabase
    .from('cliente_whatsapp_contact')
    .update({ mini_crm: next })
    .eq('id', contactId)
    .eq('cliente_id', clienteId);
  if (updateError) throw updateError;
  return next;
}

export async function fetchNotas(clienteId, contactId) {
  const { data, error } = await supabase
    .from('cliente_atend_notas')
    .select('id, autor_id, autor_nome, texto, created_at')
    .eq('cliente_id', clienteId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return data || [];
}

export async function addNota({ clienteId, contactId, userId, autorNome, texto }) {
  const { data, error } = await supabase
    .from('cliente_atend_notas')
    .insert({
      cliente_id: clienteId,
      contact_id: contactId,
      autor_id: userId,
      autor_nome: autorNome || null,
      texto,
    })
    .select('id, autor_id, autor_nome, texto, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNota(id) {
  const { error } = await supabase.from('cliente_atend_notas').delete().eq('id', id);
  if (error) throw error;
}

export async function saveLojaRow(table, clienteId, row) {
  const payload = { ...row, cliente_id: clienteId };
  const query = row.id
    ? supabase.from(table).update(payload).eq('id', row.id).eq('cliente_id', clienteId)
    : supabase.from(table).insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteLojaRow(table, clienteId, id) {
  const { error } = await supabase.from(table).delete().eq('id', id).eq('cliente_id', clienteId);
  if (error) throw error;
}

export function friendlyDbError(err, fallback = 'Não foi possível gravar.') {
  const msg = String(err?.message || '');
  if (!msg) return fallback;
  if (/duplicate key|unique/i.test(msg)) return 'Já existe um item com esse nome ou atalho.';
  if (/row-level security|permission denied/i.test(msg)) return 'Seu nível de acesso não permite esta ação.';
  if (/pelo menos um administrador/i.test(msg)) return 'A loja precisa de pelo menos um administrador ativo.';
  if (/check constraint/i.test(msg)) return 'Confira os campos (tamanho ou formato).';
  return msg.length > 160 ? fallback : msg;
}
