import { supabase } from '@/lib/customSupabaseClient';
import { executeAutomation } from '@/lib/workflow';

export const PLANEJAMENTO_KIND = {
  LEMBRETE: 'lembrete_interno',
  /** @deprecated não usar — lembretes são só internos */
  LEMBRETE_WHATSAPP: 'lembrete_whatsapp',
  LEMBRETE_INTERNO: 'lembrete_interno',
};

export const PLANEJAMENTO_STATUS = {
  PENDENTE: 'pendente',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado',
  FALHOU: 'falhou',
};

export function planejamentoKindLabel(kind) {
  return 'Lembrete';
}

/** Estado do prazo para UI e notificações */
export function lembreteDueState(scheduledAt, nowMs = Date.now()) {
  if (!scheduledAt) return 'scheduled';
  const due = new Date(scheduledAt).getTime();
  const diff = due - nowMs;
  if (diff <= 0) return 'overdue';
  if (diff <= 15 * 60 * 1000) return 'due_soon';
  return 'scheduled';
}

export function lembreteDueStateLabel(state) {
  if (state === 'overdue') return 'Vencido';
  if (state === 'due_soon') return 'Chegando';
  return 'Agendado';
}

function buildConversationTaskDescription({ conversation, messagePreview, note }) {
  const lines = [];
  if (note?.trim()) lines.push(note.trim());
  if (messagePreview?.trim()) {
    lines.push('');
    lines.push('Pedido no chat:');
    lines.push(messagePreview.trim());
  }
  lines.push('');
  lines.push(`Grupo: ${conversation.display_name || conversation.chat_jid}`);
  lines.push(`Conversa: ${conversation.id}`);
  return lines.join('\n').trim();
}

async function fetchDefaultTaskStatus() {
  const { data } = await supabase.from('task_statuses').select('value').order('sort_order').limit(1);
  return data?.[0]?.value || 'todo';
}

/**
 * Cria tarefa vinculada à conversa (ex.: pedido de arte/vídeo no grupo).
 */
export async function createTaskFromConversation({
  conversation,
  clienteId,
  userId,
  title,
  description,
  messagePreview,
  type = '',
  dueDate,
  assigneeIds = [],
  priority = 'medium',
}) {
  if (!conversation?.id || !clienteId || !userId) {
    throw new Error('Conversa ou usuário não identificado.');
  }
  const due = String(dueDate || '').trim();
  if (!due) throw new Error('Informe a data de entrega.');

  const status = await fetchDefaultTaskStatus();
  const body =
    String(description || '').trim() ||
    buildConversationTaskDescription({ conversation, messagePreview, note: '' });

  const payload = {
    title: String(title || '').trim() || `[Grupo] ${conversation.display_name || 'WhatsApp'}`,
    description: body,
    status,
    client_id: clienteId,
    owner_id: userId,
    assignee_ids: assigneeIds?.length ? assigneeIds : [userId],
    due_date: due,
    post_date: null,
    type: type || null,
    plataforma: null,
    priority,
    atendimento_conversation_id: conversation.id,
    whatsapp_chat_jid: conversation.chat_jid,
    status_history: [
      {
        status,
        user_id: userId,
        assignee_ids: assigneeIds?.length ? assigneeIds : [userId],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const { data, error } = await supabase.from('tarefas').insert(payload).select('*').single();
  if (error) throw error;

  try {
    await executeAutomation(data.id, 'task_created', { task: data });
  } catch {
    /* automação opcional */
  }

  return data;
}

export async function fetchConversationTasks(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from('tarefas')
    .select('id, title, status, due_date, type, assignee_ids, created_at')
    .eq('atendimento_conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function fetchConversationPlanejamento(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from('atendimento_conversa_planejamento')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('status', [PLANEJAMENTO_STATUS.PENDENTE, PLANEJAMENTO_STATUS.FALHOU])
    .order('scheduled_at', { ascending: true })
    .limit(40);
  if (error) throw error;
  return data || [];
}

export async function createConversationPlanejamento({
  conversation,
  clienteId,
  userId,
  kind,
  title,
  body,
  scheduledAt,
  assigneeId,
  taskId,
  sourceMessagePreview,
}) {
  if (!conversation?.id || !clienteId) throw new Error('Conversa não identificada.');
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw new Error('Data/hora inválida.');
  if (when.getTime() < Date.now() - 60_000) throw new Error('Escolha uma data no futuro.');

  const resolvedKind =
    kind === PLANEJAMENTO_KIND.LEMBRETE_WHATSAPP ? PLANEJAMENTO_KIND.LEMBRETE_INTERNO : kind || PLANEJAMENTO_KIND.LEMBRETE_INTERNO;

  const { data, error } = await supabase
    .from('atendimento_conversa_planejamento')
    .insert({
      cliente_id: clienteId,
      conversation_id: conversation.id,
      whatsapp_config_id: conversation.whatsapp_config_id,
      chat_jid: conversation.chat_jid,
      kind: resolvedKind,
      title: String(title || '').trim() || 'Lembrete',
      body: body?.trim() || null,
      scheduled_at: when.toISOString(),
      assignee_id: assigneeId || userId,
      task_id: taskId || null,
      source_message_preview: sourceMessagePreview?.trim() || null,
      created_by: userId,
      status: PLANEJAMENTO_STATUS.PENDENTE,
      last_notified_at: null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

const LEMBRETE_SELECT =
  'id, cliente_id, conversation_id, chat_jid, kind, title, body, scheduled_at, assignee_id, created_by, status, last_notified_at, created_at, source_message_preview, atendimento_conversas(display_name, is_group)';

export async function fetchMyLembretes(userId, { status = 'pendente', limit = 80 } = {}) {
  if (!userId) return [];
  let query = supabase
    .from('atendimento_conversa_planejamento')
    .select(LEMBRETE_SELECT)
    .eq('assignee_id', userId)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (status === 'pendente') {
    query = query.in('status', [PLANEJAMENTO_STATUS.PENDENTE]);
  } else if (status === 'done') {
    query = query.in('status', [PLANEJAMENTO_STATUS.CONCLUIDO, PLANEJAMENTO_STATUS.CANCELADO]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function countMyPendingLembretes(userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from('atendimento_conversa_planejamento')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', userId)
    .eq('status', PLANEJAMENTO_STATUS.PENDENTE);
  if (error) return 0;
  return count || 0;
}

export async function fetchLembretesDueForNotify(userId, soonMinutes = 15) {
  if (!userId) return [];
  const soonLimit = new Date(Date.now() + soonMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('atendimento_conversa_planejamento')
    .select(LEMBRETE_SELECT)
    .eq('status', PLANEJAMENTO_STATUS.PENDENTE)
    .lte('scheduled_at', soonLimit)
    .or(`created_by.eq.${userId},and(created_by.is.null,assignee_id.eq.${userId})`)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function touchLembreteNotified(id) {
  if (!id) return;
  await supabase
    .from('atendimento_conversa_planejamento')
    .update({ last_notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function cancelConversationPlanejamento(id) {
  const { error } = await supabase
    .from('atendimento_conversa_planejamento')
    .update({ status: PLANEJAMENTO_STATUS.CANCELADO, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function completeConversationPlanejamento(id) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('atendimento_conversa_planejamento')
    .update({ status: PLANEJAMENTO_STATUS.CONCLUIDO, completed_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}

export function formatPlanejamentoWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
