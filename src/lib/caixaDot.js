import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import {
  CAIXA_DOT_KIND,
  CAIXA_DOT_STATUS,
  OPEN_DOT_STATUSES,
  normalizeDotBody,
  normalizeDotTitle,
  previewMessage,
} from '@/lib/caixaDotCore';

export {
  CAIXA_DOT_KIND,
  CAIXA_DOT_STATUS,
  OPEN_DOT_STATUSES,
  isOpenDotStatus,
  normalizeDotBody,
  normalizeDotTitle,
  previewMessage,
} from '@/lib/caixaDotCore';

export async function listarMeusTopicos(ownerId, { incluirArquivados = false } = {}) {
  if (!ownerId) return [];
  let q = supabase
    .from('caixa_dot_threads')
    .select(
      'id, owner_id, kind, origin, title, status, priority, cliente_id, task_id, href, created_by_kind, created_by_label, last_message_at, last_message_preview, unread_for_owner, last_error, created_at'
    )
    .eq('owner_id', ownerId)
    .order('last_message_at', { ascending: false })
    .limit(200);
  if (!incluirArquivados) {
    q = q.neq('status', CAIXA_DOT_STATUS.ARQUIVADA);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listarEquipeResumo() {
  const { data, error } = await supabase
    .from('caixa_dot_threads')
    .select('id, owner_id, status, unread_for_owner, last_message_at, title')
    .in('status', OPEN_DOT_STATUSES)
    .order('last_message_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const ownerIds = [...new Set((data || []).map((row) => row.owner_id).filter(Boolean))];
  const names = new Map();
  if (ownerIds.length) {
    const { data: people, error: peopleError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', ownerIds);
    if (peopleError) throw peopleError;
    for (const person of people || []) {
      names.set(person.id, person);
    }
  }

  const byOwner = new Map();
  for (const row of data || []) {
    const key = row.owner_id;
    const person = names.get(key);
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        owner_id: key,
        full_name: person?.full_name || 'Sem nome',
        role: person?.role || null,
        abertas: 0,
        nao_lidas: 0,
        last_message_at: row.last_message_at,
        last_title: row.title,
      });
    }
    const bucket = byOwner.get(key);
    bucket.abertas += 1;
    if (row.unread_for_owner) bucket.nao_lidas += 1;
    if (
      !bucket.last_message_at
      || new Date(row.last_message_at) > new Date(bucket.last_message_at)
    ) {
      bucket.last_message_at = row.last_message_at;
      bucket.last_title = row.title;
    }
  }
  return [...byOwner.values()].sort(
    (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  );
}

export async function contarNaoLidos(ownerId) {
  if (!ownerId) return 0;
  const { count, error } = await supabase
    .from('caixa_dot_threads')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('unread_for_owner', true)
    .in('status', OPEN_DOT_STATUSES);
  if (error) throw error;
  return Number(count) || 0;
}

export async function listarMensagens(threadId) {
  if (!threadId) return [];
  const { data, error } = await supabase
    .from('caixa_dot_messages')
    .select('id, thread_id, role, body, meta, created_by_id, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function marcarLido(threadId) {
  if (!threadId) return;
  const { error } = await supabase
    .from('caixa_dot_threads')
    .update({ unread_for_owner: false, updated_at: new Date().toISOString() })
    .eq('id', threadId);
  if (error) throw error;
}

export async function criarTopicoUsuario({
  ownerId,
  title,
  body,
  kind = CAIXA_DOT_KIND.CONVERSA,
}) {
  const titulo = normalizeDotTitle(title);
  const corpo = body ? normalizeDotBody(body) : null;
  const { data: thread, error } = await supabase
    .from('caixa_dot_threads')
    .insert({
      owner_id: ownerId,
      kind,
      origin: 'usuario',
      title: titulo,
      status: CAIXA_DOT_STATUS.ABERTA,
      created_by_kind: 'usuario',
      created_by_id: ownerId,
      unread_for_owner: false,
      last_message_preview: corpo ? previewMessage(corpo) : null,
    })
    .select('*')
    .single();
  if (error) throw error;

  if (corpo) {
    const { error: msgError } = await supabase.from('caixa_dot_messages').insert({
      thread_id: thread.id,
      role: 'user',
      body: corpo,
      created_by_id: ownerId,
    });
    if (msgError) throw msgError;
  }

  return thread;
}

export async function enviarMensagemUsuario({ threadId, ownerId, body }) {
  const corpo = normalizeDotBody(body);
  const { data, error } = await supabase
    .from('caixa_dot_messages')
    .insert({
      thread_id: threadId,
      role: 'user',
      body: corpo,
      created_by_id: ownerId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarStatusTopico(threadId, status) {
  if (!Object.values(CAIXA_DOT_STATUS).includes(status)) {
    throw new Error('Status inválido.');
  }
  const { data, error } = await supabase
    .from('caixa_dot_threads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Pede resposta do Dot no servidor (sem WhatsApp). */
export async function pedirRespostaDot(threadId, { retry = false } = {}) {
  if (!threadId) throw new Error('Tópico inválido.');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre de novo.');
  const { data, error } = await invokeEdgeFunction(
    'caixa-dot-ia',
    { thread_id: threadId, retry: Boolean(retry) },
    token
  );
  if (error) {
    const err = new Error(error.message || 'O Dot não respondeu.');
    err.status = error.status;
    err.payload = data;
    throw err;
  }
  return data;
}
