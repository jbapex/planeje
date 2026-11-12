/**
 * Disparo do Responder sozinho no webhook comum.
 * Saída imediata se o módulo Atendimento da loja estiver desligado.
 * Falha da IA não propaga. Não liga o interruptor.
 */
import { fetchAtendimentoLojaHabilitada } from '../_shared/atendimentoLojaAcesso.ts';
import { decidirAutoResposta, patchAposRespostaIa } from '../_shared/atendimentoIaAuto.js';
import { normalizeFunil, parseIaAction } from '../_shared/atendimentoIaPrompt.js';
import { patchLojaConversaOnMessage } from '../_shared/atendimentoLojaInbox.js';
import { dispatchCrmIaQueue } from '../_shared/crmIaDelivery.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};

async function postJson(url: string, serviceKey: string, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function jidCurto(jid: string) {
  return String(jid || '').slice(0, 36);
}

/**
 * Grava/atualiza a ficha da inbox da loja ANTES da IA.
 * Sem esta linha a lista Conversas some (a tela junta contato + cliente_atend_conversas;
 * atendente só vê quem tem ficha) mesmo com mensagem já em cliente_whatsapp_inbox.
 */
export async function ensureLojaAtendConversa(args: {
  supabase: Admin;
  clienteId: string;
  contactId: string;
  fromMe: boolean;
  messageId?: string;
  whatsappConfigId?: string;
  sentByApi?: boolean;
}): Promise<void> {
  const clienteId = String(args.clienteId || '').trim();
  const contactId = String(args.contactId || '').trim();
  if (!(await fetchAtendimentoLojaHabilitada(args.supabase, clienteId)) || !UUID_RE.test(contactId)) return;

  const { data: conversa, error: readError } = await args.supabase
    .from('cliente_atend_conversas')
    .select('id, status, ia_pausada, assigned_to, setor_id, ia_respondeu_em,updated_at,crm_ia_runtime')
    .eq('cliente_id', clienteId)
    .eq('contact_id', contactId)
    .maybeSingle();
  if (readError) {
    console.error('[uazapi-inbox-webhook] conversa loja ler', readError.message);
    return;
  }

  if (args.fromMe && args.sentByApi === true && args.messageId && args.whatsappConfigId) {
    try {
      const echo = await args.supabase.rpc('crm_ia_notification_echo', { p_client: clienteId, p_channel: args.whatsappConfigId,
        p_contact: contactId, p_message: args.messageId, p_expected: conversa?.updated_at || null });
      if (!echo.error && echo.data?.handled === true) return;
    } catch { /* An unproven echo retains the normal human pause. */ }
  }

  const nowIso = new Date().toISOString();
  const patch = patchLojaConversaOnMessage({ fromMe: args.fromMe === true, existing: conversa, nowIso });
  if (!args.fromMe && args.messageId && args.whatsappConfigId) {
    if (conversa?.crm_ia_runtime?.last_inbound_id === args.messageId && conversa.crm_ia_runtime.last_inbound_channel === args.whatsappConfigId) return;
    patch.crm_ia_runtime = { ...(conversa?.crm_ia_runtime || {}), last_inbound_id: args.messageId, last_inbound_channel: args.whatsappConfigId };
  }
  if (args.fromMe && conversa?.crm_ia_runtime?.active) {
    const [{ data: cfg }, { data: sent }] = await Promise.all([
      args.supabase.from('crm_ia_config').select('data').eq('cliente_id', clienteId).maybeSingle(),
      args.messageId && args.whatsappConfigId ? args.supabase.from('cliente_whatsapp_sent').select('sender_kind,sent_by')
        .eq('cliente_id', clienteId).eq('whatsapp_config_id', args.whatsappConfigId).eq('message_id', args.messageId)
        .order('sender_kind', { ascending: true }).limit(5) : Promise.resolve({ data: [] }),
    ]);
    const human = (sent || []).some((item: any) => item.sender_kind === 'human' && item.sent_by);
    if (!human && (sent || []).some((item: any) => item.sender_kind === 'automation')) return;
    if (!human && args.sentByApi === true && args.messageId && args.whatsappConfigId && cfg?.data?.attendance?.pause_on_human !== false) {
      const pending = await args.supabase.rpc('crm_ia_agent_note_api_echo', { p_client: clienteId, p_channel: args.whatsappConfigId,
        p_contact: contactId, p_message: args.messageId, p_expected: conversa.updated_at });
      if (!pending.error && pending.data === true) return;
    }
    patch.ia_pausada = cfg?.data?.attendance?.pause_on_human === false ? conversa.ia_pausada : true;
    patch.crm_ia_runtime = { ...conversa.crm_ia_runtime, last_human_at: nowIso };
  }
  if (conversa?.id) {
    const { error } = await args.supabase
      .from('cliente_atend_conversas')
      .update(patch)
      .eq('id', conversa.id)
      .eq('cliente_id', clienteId)
      .eq('updated_at', conversa.updated_at);
    if (error) console.error('[uazapi-inbox-webhook] conversa loja', error.message);
    return;
  }
  const { error } = await args.supabase.from('cliente_atend_conversas').insert({
    cliente_id: clienteId,
    contact_id: contactId,
    ...patch,
  });
  if (error) console.error('[uazapi-inbox-webhook] conversa loja insert', error.message);
}

export async function maybeLojaIaAutoReply(args: {
  supabase: Admin;
  supabaseUrl: string;
  serviceKey: string;
  clienteId: string;
  contactJid: string | null;
  isGroup: boolean;
  fromMe: boolean;
  bodyText: string;
  whatsappConfigId?: string | null;
  messageId?: string;
}): Promise<void> {
  const clienteId = String(args.clienteId || '').trim();
  if (!(await fetchAtendimentoLojaHabilitada(args.supabase, clienteId))) return;

  const channelId = String(args.whatsappConfigId || '').trim();
  if (!UUID_RE.test(channelId)) return;
  const { data: channel, error: channelError } = await args.supabase.from('cliente_whatsapp_config')
    .select('id').eq('id', channelId).eq('cliente_id', clienteId).eq('provider', 'uazapi').is('archived_at', null).maybeSingle();
  if (channelError || !channel) return;

  const fromJid = String(args.contactJid || '').trim();
  const hasText = Boolean(String(args.bodyText || '').trim());
  if (!fromJid || fromJid === 'unknown') {
    console.log('[uazapi-inbox-webhook] loja IA auto pular sem_jid');
    return;
  }

  const { data: contact } = await args.supabase
    .from('cliente_whatsapp_contact')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('from_jid', fromJid)
    .maybeSingle();
  if (!contact?.id) {
    console.log('[uazapi-inbox-webhook] loja IA auto pular sem_contato', jidCurto(fromJid));
    return;
  }

  const [{ data: conversa }, { data: agentes }] = await Promise.all([
    args.supabase
      .from('cliente_atend_conversas')
      .select('id, status, ia_pausada, assigned_to, setor_id, ia_respondeu_em, updated_at')
      .eq('cliente_id', clienteId)
      .eq('contact_id', contact.id)
      .maybeSingle(),
    args.supabase
      .from('cliente_atend_ia_agentes')
      .select('id, nome, ativo, auto_responder, setor_ids, funil')
      .eq('cliente_id', clienteId)
      .order('created_at'),
  ]);

  const decisao = decidirAutoResposta({
    clienteHabilitada: true,
    fromMe: args.fromMe === true,
    isGroup: args.isGroup === true,
    hasText,
    conversa,
    agentes: agentes || [],
    setorId: conversa?.setor_id || null,
  });
  if ((agentes || []).some((agent: any) => agent.funil?.crm_ia)) {
    if (args.fromMe || args.isGroup) return;
    if (!hasText) {
      if (!args.messageId) return;
      const { data: incoming, error } = await args.supabase.from('cliente_whatsapp_inbox').select('type')
        .eq('cliente_id', clienteId).eq('whatsapp_config_id', channelId).eq('message_id', args.messageId).eq('is_group', false)
        .or(`from_jid.eq.${fromJid},chat_jid.eq.${fromJid}`).maybeSingle();
      if (error || !['audio', 'ptt', 'myaudio', 'voice', 'voicemessage', 'voice_message', 'audiomessage'].includes(String(incoming?.type || '').toLowerCase())) return;
    }
    const response = await postJson(`${args.supabaseUrl}/functions/v1/atendimento-ia`, args.serviceKey,
      { acao: 'responder', cliente_id: clienteId, contact_id: contact.id, whatsapp_config_id: channelId, message_id: args.messageId }, 60000);
    if (!response.ok || response.data?.error) { console.error('[uazapi-inbox-webhook] typed_runtime_failed'); return; }
    if (response.ok && response.data?.queued && response.data?.outbox_id) {
      await dispatchCrmIaQueue({ db: args.supabase, ids: [response.data.outbox_id], send: async (payload: unknown) => {
        const delivered = await postJson(`${args.supabaseUrl}/functions/v1/uazapi-send-message`, args.serviceKey, payload, 25000);
        return { ok: delivered.ok && !delivered.data?.error && (delivered.data?.success === true || delivered.data?.ok === true),
          definitive: !delivered.ok && [400,401,403,404,405,409,422].includes(delivered.status), messageId: delivered.data?.message_id || null };
      } });
    }
    return;
  }
  if (!decisao.ok) {
    console.log(
      '[uazapi-inbox-webhook] loja IA auto pular',
      decisao.reason,
      jidCurto(fromJid),
      'status=',
      conversa?.status || 'sem_ficha',
      'pausada=',
      Boolean(conversa?.ia_pausada),
    );
    return;
  }

  console.log(
    '[uazapi-inbox-webhook] loja IA auto chamar',
    decisao.agente?.nome || decisao.agente?.id || 'agente',
    jidCurto(fromJid),
  );

  const ia = await postJson(
    `${args.supabaseUrl}/functions/v1/atendimento-ia`,
    args.serviceKey,
    { acao: 'responder', cliente_id: clienteId, contact_id: contact.id, whatsapp_config_id: channelId, agente_id: decisao.agente?.id || null },
    28000,
  );
  if (!ia.ok || ia.data?.error || ia.data?.skipped) {
    console.error(
      '[uazapi-inbox-webhook] loja IA auto atendimento-ia',
      ia.status,
      String(ia.data?.error || ia.data?.skipped || 'falha').slice(0, 180),
    );
    return;
  }

  const { data: current, error: currentError } = await args.supabase.from('cliente_atend_conversas')
    .select('id,status,ia_pausada,updated_at').eq('cliente_id', clienteId).eq('contact_id', contact.id).maybeSingle();
  if (currentError || current?.ia_pausada || current?.status === 'finalizado'
    || current?.id !== conversa?.id || current?.updated_at !== conversa?.updated_at) return;

  const parsed = parseIaAction(String(ia.data?.resposta || ''));
  const funil = normalizeFunil(ia.data?.agente?.funil || decisao.agente?.funil);
  let texto = String(parsed.texto || '').trim();
  if (parsed.action === 'transfer' && !texto) texto = funil.mensagem_transicao || '';
  texto = texto.slice(0, 4000);
  const action = parsed.action || ia.data?.action || null;

  if (texto) {
    const send = await postJson(
      `${args.supabaseUrl}/functions/v1/uazapi-send-message`,
      args.serviceKey,
      {
        origem: 'atendimento-ia',
        cliente_id: clienteId,
        to: fromJid,
        body: texto,
        whatsapp_config_id: channelId,
      },
      20000,
    );
    if (!send.ok || send.data?.error) {
      console.error('[uazapi-inbox-webhook] loja IA auto uazapi-send-message', String(send.data?.error || send.status).slice(0, 180));
      return;
    }
    console.log('[uazapi-inbox-webhook] loja IA auto enviou', jidCurto(fromJid), 'chars=', texto.length);
  } else if (action !== 'transfer') {
    console.log('[uazapi-inbox-webhook] loja IA auto pular sem_texto_ia', jidCurto(fromJid));
    return;
  }

  const nowIso = new Date().toISOString();
  const responsePatch = patchAposRespostaIa({ action, funil, nowIso });
  const patch = {
    ...responsePatch,
    ia_followup_whatsapp_config_id: channelId,
    ia_followup_delivery_state: responsePatch.ia_followup_due_at ? 'pending' : 'sent',
    ia_followup_claim_token: null, ia_followup_claimed_at: null, ia_followup_claim_snapshot: null,
  };
  if (conversa?.id) {
    const { error } = await args.supabase
      .from('cliente_atend_conversas')
      .update(patch)
      .eq('id', conversa.id)
      .eq('cliente_id', clienteId)
      .eq('updated_at', conversa.updated_at);
    if (error) console.error('[uazapi-inbox-webhook] conversa IA', error.message);
    return;
  }
  if (!UUID_RE.test(contact.id)) return;
  const { error } = await args.supabase.from('cliente_atend_conversas').insert({
    cliente_id: clienteId,
    contact_id: contact.id,
    ...patch,
  });
  if (error) console.error('[uazapi-inbox-webhook] conversa IA insert', error.message);
}
