/**
 * Edge Function para enviar mensagem de texto ou mídia via uazapi (CRM WhatsApp / Atendimento).
 * Texto: { to, body, whatsapp_config_id?, conversation_id?, cliente_id? }
 * Mídia: { to, media_type, file (base64 ou URL), caption?, doc_name?, mimetype?, ... }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeCrmIaServiceDelivery, revalidateCrmIaInternalNotification } from '../_shared/crmIaServiceDelivery.js';
import {
  canClienteSendAtendimento,
  fetchAtendimentoLojaHabilitada,
  hasAtendimentoPagePermission,
  isAtendimentoInternalSenderRole,
  nivelEfetivo,
} from '../_shared/atendimentoLojaAcesso.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isInternalUazapiId(id: string): boolean {
  const s = String(id || '').trim();
  if (!s) return true;
  if (/^r[0-9a-f]{6,}$/i.test(s)) return true;
  if (/^sent_\d+$/i.test(s)) return true;
  // fallback gerado quando o webhook não achou ID real (jid_timestamp)
  if (/@(s\.whatsapp\.net|g\.us|lid)_.+_\d{10,}$/i.test(s) || /@.+_\d{13,}$/.test(s)) return true;
  return false;
}

function collectWhatsAppIdsDeep(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    const stanza = stanzaFromValue(value);
    if (stanza) out.add(stanza);
    if (value.includes(':')) {
      const part = value.split(':').pop()?.trim();
      if (part && !isInternalUazapiId(part)) out.add(part);
    }
    return;
  }
  if (typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectWhatsAppIdsDeep(item, out, depth + 1));
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (['messageid', 'message_id', 'stanzaid', 'quoted', 'replyid'].includes(lk)) {
      collectWhatsAppIdsDeep(v, out, depth + 1);
    }
    if (lk === 'id' && (typeof v === 'string' || typeof v === 'number')) {
      collectWhatsAppIdsDeep(v, out, depth + 1);
    }
    collectWhatsAppIdsDeep(v, out, depth + 1);
  }
}

function extractWhatsAppIdsFromRaw(raw: unknown): { stanza: string; full?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const key = (payload.key ?? body.key) as Record<string, unknown> | undefined;
  const msg = (payload.message ?? body.message) as Record<string, unknown> | undefined;
  const msgKey = msg?.key as Record<string, unknown> | undefined;

  const fullIdRaw = String(payload.id ?? body.id ?? '').trim();
  if (fullIdRaw.includes(':')) {
    const stanza = stanzaFromValue(fullIdRaw);
    if (stanza) return { stanza, full: fullIdRaw };
  }

  for (const candidate of [
    payload.messageid,
    payload.messageId,
    body.messageid,
    body.messageId,
    key?.id,
    msgKey?.id,
    payload.id,
    body.id,
  ]) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) {
      return {
        stanza,
        full: String(candidate ?? '').includes(':') ? String(candidate).trim() : undefined,
      };
    }
  }

  const collected = new Set<string>();
  collectWhatsAppIdsDeep(raw, collected);
  const first = [...collected][0];
  if (first) return { stanza: first };
  return null;
}

function stanzaFromValue(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s || isInternalUazapiId(s)) return '';
  if (s.includes(':')) {
    const part = s.split(':').pop()?.trim() || '';
    return isInternalUazapiId(part) ? '' : part;
  }
  return s;
}

function pickUazapiInternalId(resData: Record<string, unknown>): string | null {
  const id = String(resData.id ?? '').trim();
  if (id && isInternalUazapiId(id)) return id;
  return null;
}

function normalizeSendResponse(resData: Record<string, unknown>): Record<string, unknown> {
  const nested = resData.response;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...resData, ...(nested as Record<string, unknown>) };
  }
  return resData;
}

function pickSentMessageId(resData: Record<string, unknown>): string {
  const data = normalizeSendResponse(resData);
  for (const candidate of [data.messageid, data.messageId, (data.key as Record<string, unknown> | undefined)?.id]) {
    const s = String(candidate ?? '').trim();
    if (!s) continue;
    if (s.includes(':') && !isInternalUazapiId(s)) return s;
    const stanza = stanzaFromValue(candidate);
    if (stanza) return stanza;
  }
  const internal = pickUazapiInternalId(data);
  if (internal) return internal;
  return `sent_${Date.now()}`;
}

function initialAckFromSendResponse(resData: Record<string, unknown>): 'sent' | 'delivered' | 'read' {
  const data = normalizeSendResponse(resData);
  const raw = data.status ?? data.messageStatus ?? (data.message as Record<string, unknown> | undefined)?.status;
  if (raw == null || raw === '') return 'sent';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 4) return 'read';
    if (raw >= 3) return 'delivered';
    return 'sent';
  }
  const s = String(raw).trim().toLowerCase();
  if (s === 'read' || s === 'played') return 'read';
  if (s === 'delivered') return 'delivered';
  return 'sent';
}

function resolveSendNumber(to: string): string {
  const jid = String(to).trim();
  if (!jid) return '';
  if (jid.includes('@g.us') || jid.includes('@newsletter')) return jid;
  if (jid.includes('@')) return jid.replace(/@.*$/, '').replace(/\D/g, '') || jid;
  return jid.replace(/\D/g, '') || jid;
}

function resolveChatJid(to: string): string {
  const jid = String(to).trim();
  if (!jid) return '';
  if (jid.includes('@')) return jid;
  const phone = jid.replace(/\D/g, '');
  return phone ? `${phone}@s.whatsapp.net` : jid;
}

function previewForMedia(mediaType: string, docName: string, caption: string): string {
  const cap = caption.trim();
  if (cap) return cap;
  const name = docName || 'arquivo';
  if (mediaType === 'image') return `[Imagem] ${name}`;
  if (mediaType === 'audio' || mediaType === 'ptt') return `[Áudio] ${name}`;
  return `[Documento] ${name}`;
}

function classifySendForLog(
  isMedia: boolean,
  mediaType: string,
  bodyText: string,
  docName: string,
  sentPreview: string,
): { send_kind: string; label: string; file_name: string | null; body_preview: string | null } {
  if (isMedia) {
    let send_kind = 'document';
    if (mediaType === 'image' || mediaType === 'sticker') send_kind = 'image';
    else if (mediaType === 'audio' || mediaType === 'ptt' || mediaType === 'myaudio') send_kind = 'audio';
    else if (mediaType === 'video' || mediaType === 'videoplay' || mediaType === 'ptv') send_kind = 'video';
    return {
      send_kind,
      label: sentPreview.slice(0, 500),
      file_name: docName || null,
      body_preview: bodyText || null,
    };
  }
  const text = bodyText.trim();
  if (/https?:\/\//i.test(text)) {
    return {
      send_kind: 'link',
      label: text.slice(0, 500),
      file_name: null,
      body_preview: text.slice(0, 500),
    };
  }
  return {
    send_kind: 'text',
    label: text.slice(0, 500),
    file_name: null,
    body_preview: text.slice(0, 500),
  };
}

const LOJA_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
const VALID_MEDIA_TYPES = new Set(['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker']);

async function resolveWhatsAppMessageIdCandidates(
  supabase: ReturnType<typeof createClient>,
  opts: {
    clienteId: string;
    messageId: string;
    messageRowId?: string | null;
  },
): Promise<string[]> {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const stanza = stanzaFromValue(value);
    if (stanza) ids.add(stanza);
    const s = String(value ?? '').trim();
    if (s.includes(':') && !isInternalUazapiId(s)) ids.add(s);
  };

  const absorbRow = (row: { message_id?: string | null; raw_payload?: unknown } | null) => {
    if (!row) return;
    add(row.message_id);
    const fromRaw = extractWhatsAppIdsFromRaw(row.raw_payload);
    if (fromRaw?.stanza) ids.add(fromRaw.stanza);
    if (fromRaw?.full) ids.add(fromRaw.full);
    const collected = new Set<string>();
    collectWhatsAppIdsDeep(row.raw_payload, collected);
    collected.forEach((id) => ids.add(id));
  };

  const tables = ['cliente_whatsapp_inbox', 'cliente_whatsapp_sent'] as const;

  if (opts.messageRowId) {
    for (const table of tables) {
      const { data } = await supabase
        .from(table)
        .select('message_id, raw_payload')
        .eq('cliente_id', opts.clienteId)
        .eq('id', opts.messageRowId)
        .maybeSingle();
      absorbRow(data);
    }
  }

  if (opts.messageId) {
    add(opts.messageId);
    for (const table of tables) {
      const { data } = await supabase
        .from(table)
        .select('message_id, raw_payload')
        .eq('cliente_id', opts.clienteId)
        .eq('message_id', opts.messageId)
        .maybeSingle();
      absorbRow(data);
    }
  }

  return [...ids];
}

async function callUazapiReact(
  baseUrl: string,
  token: string,
  number: string,
  stanzaId: string,
  emoji: string,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const res = await fetch(`${baseUrl}/message/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ number, text: emoji, id: stanzaId }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const failed = !res.ok || (typeof data?.error === 'string' && data.error.length > 0);
  return { ok: !failed, data, status: res.status };
}

type AckStatus = 'sent' | 'delivered' | 'read';

const ACK_STATUS_RANK: Record<AckStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

function normalizeUazapiAckStatus(raw: unknown): AckStatus | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 4) return 'read';
    if (raw >= 3) return 'delivered';
    if (raw >= 2) return 'sent';
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'read' || s === 'played' || s === 'viewed') return 'read';
  if (s === 'delivered' || s === 'delivery_ack') return 'delivered';
  if (s === 'sent' || s === 'server_ack' || s === 'queued' || s === 'pending') return 'sent';
  return null;
}

function ackStatusRank(status: AckStatus | null | undefined): number {
  if (!status) return 0;
  return ACK_STATUS_RANK[status] ?? 0;
}

async function fetchAckFromUazapi(
  baseUrl: string,
  token: string,
  row: { message_id: string | null; uazapi_internal_id: string | null; chat_jid: string | null },
): Promise<AckStatus | null> {
  const ids = [...new Set([row.message_id, row.uazapi_internal_id].filter(Boolean))] as string[];
  for (const id of ids) {
    const res = await fetch(`${baseUrl}/message/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ id, limit: 1 }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const msg = (messages[0] ?? data) as Record<string, unknown>;
    const ack = normalizeUazapiAckStatus(msg.status);
    if (ack) return ack;
  }
  if (row.chat_jid) {
    const res = await fetch(`${baseUrl}/message/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ chatid: row.chat_jid, limit: 30, offset: 0 }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    for (const item of messages) {
      const msg = item as Record<string, unknown>;
      if (msg.fromMe !== true) continue;
      const msgId = String(msg.messageid ?? msg.messageId ?? msg.id ?? '').trim();
      const internalId = String(msg.id ?? '').trim();
      const matches =
        (row.message_id && (msgId === row.message_id || internalId === row.message_id)) ||
        (row.uazapi_internal_id && internalId === row.uazapi_internal_id);
      if (!matches) continue;
      const ack = normalizeUazapiAckStatus(msg.status);
      if (ack) return ack;
    }
  }
  return null;
}

async function updateConversationAfterSend(
  supabase: ReturnType<typeof createClient>,
  opts: {
    conversationId: string | null;
    clienteId: string;
    configId: string;
    chatJid: string;
    userId: string;
    preview: string;
    nowIso: string;
  }
) {
  const { conversationId, clienteId, configId, chatJid, userId, preview, nowIso } = opts;

  if (conversationId) {
    const { data: conv } = await supabase
      .from('atendimento_conversas')
      .select('first_response_at, status')
      .eq('id', conversationId)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      last_message_at: nowIso,
      last_message_preview: preview.slice(0, 200),
      awaiting_response_since: null,
      updated_at: nowIso,
    };
    if (!conv?.first_response_at) updates.first_response_at = nowIso;

    await supabase.from('atendimento_conversas').update(updates).eq('id', conversationId);
    return;
  }

  await supabase.from('atendimento_conversas').upsert(
    {
      cliente_id: clienteId,
      whatsapp_config_id: configId,
      chat_jid: chatJid,
      is_group: chatJid.includes('@g.us'),
      status: 'em_atendimento',
      assigned_to: userId,
      last_message_at: nowIso,
      last_message_preview: preview.slice(0, 200),
      first_response_at: nowIso,
      awaiting_response_since: null,
      updated_at: nowIso,
    },
    { onConflict: 'cliente_id,whatsapp_config_id,chat_jid' }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const authToken = authHeader.slice(7);

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceDelivery = authToken === supabaseServiceKey && Boolean(supabaseServiceKey)
    ? await authorizeCrmIaServiceDelivery(supabase, body) : { handled: false, allowed: false };
  if (serviceDelivery.handled && !serviceDelivery.allowed) {
    return new Response(JSON.stringify({ error: 'Reserva de envio indisponível ou autorização alterada.' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const queuedHuman = serviceDelivery.handled && serviceDelivery.allowed && serviceDelivery.human === true;
  if (serviceDelivery.allowed && serviceDelivery.media) body.body = serviceDelivery.media.caption;
  const isIaAuto = serviceDelivery.allowed || (
    Boolean(supabaseServiceKey) &&
    authToken === supabaseServiceKey &&
    String(body.origem || '') === 'atendimento-ia');

  let user: { id: string } | null = queuedHuman && serviceDelivery.actorId ? { id: serviceDelivery.actorId } : null;
  if (!isIaAuto) {
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !authUser?.id) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    user = authUser;
  }

  let role: string | null = null;
  let profileClienteId: string | null = null;
  let isInternal = false;
  let lojaMembro: { nivel: string; ativo: boolean; cliente_id: string } | null = null;
  let isLojaClienteSender = false;
  let clienteId: string | null = null;
  let lojaOn = false;
  let implicitAdmin = false;

  if (isIaAuto) {
    clienteId = typeof body.cliente_id === 'string' ? body.cliente_id.trim() : '';
    lojaOn = await fetchAtendimentoLojaHabilitada(supabase, clienteId);
    if (!clienteId || (!lojaOn && !serviceDelivery.allowed)) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cliente_id, role, allowed_pages')
      .eq('id', user?.id)
      .single();

    role = profile?.role ?? null;
    profileClienteId = (profile?.cliente_id as string | null) ?? null;
    isInternal = isAtendimentoInternalSenderRole(role);
    lojaOn =
      !isInternal && role === 'cliente'
        ? hasAtendimentoPagePermission(profile?.allowed_pages, profileClienteId)
        : false;
    if (!isInternal && role === 'cliente' && lojaOn) {
      const { data: membroRow } = await supabase
        .from('cliente_atend_membros')
        .select('nivel, ativo, cliente_id')
        .eq('cliente_id', profileClienteId)
        .eq('user_id', user?.id)
        .maybeSingle();
      lojaMembro = membroRow ?? null;
      if (!lojaMembro) {
        const { count } = await supabase
          .from('cliente_atend_membros')
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', profileClienteId);
        implicitAdmin = (count || 0) === 0;
      }
    }
    isLojaClienteSender = canClienteSendAtendimento({
      role,
      profileClienteId,
      targetClienteId: profileClienteId,
      membro: lojaMembro,
      allowedPages: profile?.allowed_pages,
      lojaHabilitada: lojaOn,
      implicitAdmin,
    });
    if (!isInternal && !isLojaClienteSender) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clienteId = isInternal ? (profileClienteId ?? null) : profileClienteId;
    if (isInternal && body?.cliente_id) {
      clienteId = (body.cliente_id as string) || clienteId;
    }
  }

  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null;
  let whatsappConfigId = typeof body.whatsapp_config_id === 'string' ? body.whatsapp_config_id.trim() : null;
  let chatJidFromConv: string | null = null;
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const isActionRequest = action === 'react' || action === 'forward' || action === 'delete' || action === 'sync_ack';
  const isOutboundSend = !isActionRequest || action === 'forward';

  if (conversationId) {
    const { data: conv } = await supabase
      .from('atendimento_conversas')
      .select('cliente_id, whatsapp_config_id, chat_jid, status')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversa não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (serviceDelivery.allowed) {
      if (conv.cliente_id !== clienteId || conv.whatsapp_config_id !== whatsappConfigId || conv.chat_jid !== body.to) {
        return new Response(JSON.stringify({ error: 'O destino da reserva foi alterado.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (!isInternal) {
      // Ápice só usa conversa da própria loja; não eleva cliente_id via conversation_id.
      if (String(conv.cliente_id || '') !== String(profileClienteId || '')) {
        return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      clienteId = profileClienteId;
    } else {
      if (isOutboundSend && conv.status === 'aguardando') {
        return new Response(JSON.stringify({ error: 'Assuma a conversa antes de enviar mensagens.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (isOutboundSend && conv.status === 'resolvido') {
        return new Response(JSON.stringify({ error: 'Conversa encerrada. Reabra assumindo uma nova mensagem do cliente.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      clienteId = conv.cliente_id;
    }
    whatsappConfigId = conv.whatsapp_config_id;
    chatJidFromConv = conv.chat_jid;
  }

  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'Cliente não identificado. Informe cliente_id.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (
    !isIaAuto &&
    !isInternal &&
    !canClienteSendAtendimento({
      role,
      profileClienteId,
      targetClienteId: clienteId,
      membro: lojaMembro,
      isAction: isActionRequest,
      lojaHabilitada: lojaOn,
      implicitAdmin,
    })
  ) {
    return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const needsChannelSendPermission =
    action !== 'sync_ack' && (isOutboundSend || action === 'react' || action === 'delete');

  const to = (body?.to ?? body?.to_jid ?? chatJidFromConv ?? '').trim() as string;

  if (to && to !== 'unknown') {
    const { data: bloqueio, error: bloqueioError } = await supabase
      .from('atendimento_bloqueios')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('chat_jid', to)
      .maybeSingle();
    if (bloqueioError) {
      console.error('[uazapi-send-message] bloqueio lookup', bloqueioError.message);
    } else if (bloqueio?.id) {
      return new Response(JSON.stringify({ error: 'Conversa bloqueada. Nada foi enviado nem gravado.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
  const mediaTypeRaw = typeof body.media_type === 'string' ? body.media_type.trim().toLowerCase() : '';
  const filePayload = typeof body.file === 'string' ? body.file.trim() : '';
  const isMedia = Boolean(mediaTypeRaw && filePayload && VALID_MEDIA_TYPES.has(mediaTypeRaw));

  const bodyText = (body?.body ?? body?.text ?? body?.message ?? body?.caption ?? '').trim() as string;

  if (isIaAuto && (isActionRequest || (isMedia && !serviceDelivery.media) || (!isMedia && !bodyText))) {
    return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Loja habilitada: texto ou mídia na própria loja (sem react, forward, delete, sync_ack).
  if (!isInternal && (isActionRequest || (!isMedia && !bodyText))) {
    return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!isInternal && isMedia) {
    // Loja: só arquivo em base64 (sem URL), tipos do compositor e até 4 MB.
    const lojaMediaOk = ['image', 'document', 'audio', 'ptt', 'sticker'].includes(mediaTypeRaw);
    const looksUrl = /^https?:\/\//i.test(filePayload);
    const approxBytes = Math.floor((filePayload.replace(/^data:[^,]*,/, '').length * 3) / 4);
    if (!lojaMediaOk || looksUrl || approxBytes > LOJA_MEDIA_MAX_BYTES) {
      return new Response(
        JSON.stringify({
          error: approxBytes > LOJA_MEDIA_MAX_BYTES ? 'Arquivo muito grande. Máximo 4 MB.' : 'Tipo de arquivo não permitido.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  if (!to && action !== 'sync_ack') {
    return new Response(JSON.stringify({ error: 'Campo "to" é obrigatório' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isActionRequest && !isMedia && !bodyText) {
    return new Response(JSON.stringify({ error: 'Informe "body" (texto) ou "media_type" + "file" (mídia)' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (mediaTypeRaw && filePayload && !VALID_MEDIA_TYPES.has(mediaTypeRaw)) {
    return new Response(JSON.stringify({ error: `media_type inválido: ${mediaTypeRaw}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Contato do destino precisa ser da própria loja (cliente_id do perfil).
  if (!isInternal && !serviceDelivery.internalNotification && to) {
    const jidBase = String(to).split('@')[0].split(':')[0].replace(/\D/g, '');
    let ownContactId: string | null = null;
    if (jidBase) {
      const { data: byExactJid } = await supabase
        .from('cliente_whatsapp_contact')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('from_jid', to)
        .limit(1)
        .maybeSingle();
      ownContactId = byExactJid?.id ?? null;
      if (!ownContactId) {
        const { data: byPhone } = await supabase
          .from('cliente_whatsapp_contact')
          .select('id')
          .eq('cliente_id', clienteId)
          .eq('phone', jidBase)
          .limit(1)
          .maybeSingle();
        ownContactId = byPhone?.id ?? null;
      }
      if (!ownContactId) {
        const { data: byPrefix } = await supabase
          .from('cliente_whatsapp_contact')
          .select('id')
          .eq('cliente_id', clienteId)
          .like('from_jid', `${jidBase}%`)
          .limit(1)
          .maybeSingle();
        ownContactId = byPrefix?.id ?? null;
      }
    }
    if (!ownContactId) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas equipe interna pode enviar mensagens.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Atendente só envia em conversa que ele pode ver (atribuída ou do setor).
    if (!isIaAuto && nivelEfetivo(lojaMembro, clienteId, { lojaHabilitada: lojaOn, implicitAdmin }) !== 'admin') {
      const { data: podeVer, error: podeVerError } = await supabase.rpc('cliente_atend_pode_ver_contato_de', {
        p_user_id: user?.id,
        p_cliente_id: clienteId,
        p_contact_id: ownContactId,
      });
      if (podeVerError || podeVer !== true) {
        return new Response(JSON.stringify({ error: 'Sem acesso a esta conversa.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  let configQuery = supabase
    .from('cliente_whatsapp_config')
    .select('id, subdomain, token')
    .eq('cliente_id', clienteId);

  if (whatsappConfigId) {
    configQuery = configQuery.eq('id', whatsappConfigId);
  } else {
    configQuery = configQuery.order('created_at', { ascending: true }).limit(1);
  }

  const { data: config, error: configError } = await configQuery.maybeSingle();

  if (configError || !config?.subdomain || !config?.token) {
    return new Response(JSON.stringify({ error: 'WhatsApp não configurado para este cliente/canal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const activeWhatsappConfigId = whatsappConfigId || config.id;

  // RPC de fila/canal é só da equipe; Ápice usa a regra estreita acima.
  if (isInternal && needsChannelSendPermission && activeWhatsappConfigId) {
    const { data: canSend, error: permError } = await supabase.rpc(
      'atendimento_user_can_send_on_whatsapp_config',
      {
        p_user_id: user.id,
        p_cliente_id: clienteId,
        p_whatsapp_config_id: activeWhatsappConfigId,
      },
    );
    if (permError) {
      console.error('[uazapi-send-message] send permission check failed', permError);
      return new Response(JSON.stringify({ error: 'Não foi possível validar permissão de envio.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!canSend) {
      return new Response(
        JSON.stringify({
          error:
            'Sem permissão para enviar neste número WhatsApp. Acesso somente por fila permite apenas visualizar as conversas.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const subdomain = String(config.subdomain).replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '');
  const baseUrl = `https://${subdomain}.uazapi.com`;
  const chatJid = resolveChatJid(to);
  const sendNumber = resolveSendNumber(to);
  const instanceToken = config.token.trim();
  const nowIso = new Date().toISOString();

  const replyIdInput =
    (typeof body.reply_to_message_id === 'string' ? body.reply_to_message_id.trim() : '') ||
    (typeof body.replyid === 'string' ? body.replyid.trim() : '');
  const replyRowId = typeof body.reply_message_row_id === 'string' ? body.reply_message_row_id.trim() : null;
  let replyId = replyIdInput;
  if (replyRowId || replyIdInput) {
    const replyCandidates = await resolveWhatsAppMessageIdCandidates(supabase, {
      clienteId,
      messageId: replyIdInput,
      messageRowId: replyRowId,
    });
    if (replyCandidates[0]) replyId = replyCandidates[0];
  }
  const forwardFlag = body.forward === true;

  if (action === 'sync_ack') {
    const rowIds = Array.isArray(body.message_row_ids)
      ? body.message_row_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('cliente_whatsapp_sent')
      .select('id, message_id, uazapi_internal_id, ack_status, chat_jid')
      .eq('cliente_id', clienteId)
      .gte('created_at', sinceIso)
      .neq('ack_status', 'read')
      .order('created_at', { ascending: false })
      .limit(25);

    if (rowIds.length) {
      query = query.in('id', rowIds);
    } else if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    } else if (chatJidFromConv) {
      query = query.eq('chat_jid', chatJidFromConv);
    } else {
      return new Response(JSON.stringify({ error: 'Informe conversation_id para sincronizar confirmações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rows, error: rowsError } = await query;
    if (rowsError) {
      return new Response(JSON.stringify({ error: rowsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;
    const updates: Array<{ id: string; ack_status: AckStatus }> = [];
    for (const row of rows || []) {
      const current = normalizeUazapiAckStatus(row.ack_status) ?? 'sent';
      const ack = await fetchAckFromUazapi(baseUrl, instanceToken, row);
      if (!ack || ackStatusRank(ack) <= ackStatusRank(current)) continue;
      const patch: Record<string, unknown> = { ack_status: ack };
      const { error: updateError } = await supabase
        .from('cliente_whatsapp_sent')
        .update(patch)
        .eq('id', row.id);
      if (!updateError) {
        updated += 1;
        updates.push({ id: row.id, ack_status: ack });
      }
    }

    return new Response(JSON.stringify({ success: true, action: 'sync_ack', updated, updates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'react') {
    const messageId = String(body.message_id ?? body.id ?? '').trim();
    const messageRowId = typeof body.message_row_id === 'string' ? body.message_row_id.trim() : null;
    const emoji = typeof body.emoji === 'string' ? body.emoji : typeof body.text === 'string' ? body.text : '👍';
    if (!messageId && !messageRowId) {
      return new Response(JSON.stringify({ error: 'Campo "message_id" é obrigatório para reação' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const idsToTry = await resolveWhatsAppMessageIdCandidates(supabase, {
      clienteId,
      messageId,
      messageRowId,
    });

    if (idsToTry.length === 0) {
      return new Response(JSON.stringify({
        error: 'Não foi possível identificar a mensagem no WhatsApp. Peça ao contato enviar uma mensagem nova e tente reagir a ela.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const numbersToTry = [...new Set([chatJid, sendNumber.includes('@') ? sendNumber : `${sendNumber}@s.whatsapp.net`].filter(Boolean))];

    let lastError = 'Erro ao enviar reação.';
    let lastDetails: Record<string, unknown> = {};

    for (const number of numbersToTry) {
      for (const id of idsToTry) {
        const attempt = await callUazapiReact(baseUrl, instanceToken, number, id, emoji);
        if (attempt.ok) {
          return new Response(JSON.stringify({
            success: true,
            action: 'react',
            message_id: id,
            emoji,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        lastError = (attempt.data?.error as string) ?? (attempt.data?.message as string) ?? lastError;
        lastDetails = attempt.data;
        console.error('[uazapi-send-message] react failed', { number, id, status: attempt.status, data: attempt.data });
      }
    }

    const friendly =
      String(lastError).toLowerCase().includes('not found') || String(lastError).toLowerCase().includes('404')
        ? 'Mensagem não encontrada no WhatsApp. Só é possível reagir a mensagens recebidas recentes.'
        : lastError;

    return new Response(JSON.stringify({ error: friendly, details: lastDetails }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'delete') {
    const messageId = String(body.message_id ?? body.id ?? '').trim();
    const messageRowId = typeof body.message_row_id === 'string' ? body.message_row_id.trim() : null;
    const messageDirection = String(body.message_direction ?? 'out').toLowerCase();

    if (!messageId && !messageRowId) {
      return new Response(JSON.stringify({ error: 'Campo "message_id" é obrigatório para apagar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const idsToTry = await resolveWhatsAppMessageIdCandidates(supabase, {
      clienteId,
      messageId,
      messageRowId,
    });

    if (idsToTry.length === 0) {
      return new Response(JSON.stringify({
        error: 'Não foi possível identificar a mensagem no WhatsApp.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let lastError = 'Erro ao apagar mensagem.';
    let lastDetails: Record<string, unknown> = {};
    let deletedId: string | null = null;

    for (const id of idsToTry) {
      const delRes = await fetch(`${baseUrl}/message/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instanceToken },
        body: JSON.stringify({ id }),
      });
      const delData = (await delRes.json().catch(() => ({}))) as Record<string, unknown>;
      const failed = !delRes.ok || (typeof delData?.error === 'string' && delData.error.length > 0);
      if (!failed) {
        deletedId = id;
        break;
      }
      lastError = (delData?.error as string) ?? delRes.statusText ?? lastError;
      lastDetails = delData;
      console.error('[uazapi-send-message] delete failed', { id, status: delRes.status, data: delData });
    }

    if (!deletedId) {
      const friendly =
        String(lastError).toLowerCase().includes('not found') || String(lastError).toLowerCase().includes('404')
          ? 'Mensagem não encontrada no WhatsApp ou prazo para apagar expirou.'
          : lastError;
      return new Response(JSON.stringify({ error: friendly, details: lastDetails }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deletedLabel = 'Esta mensagem foi apagada';
    if (messageRowId) {
      const table = messageDirection === 'in' ? 'cliente_whatsapp_inbox' : 'cliente_whatsapp_sent';
      await supabase
        .from(table)
        .update({ body: deletedLabel })
        .eq('cliente_id', clienteId)
        .eq('id', messageRowId);
    }

    return new Response(JSON.stringify({
      success: true,
      action: 'delete',
      message_id: deletedId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (action === 'forward') {
    let sourceMessageId = String(body.source_message_id ?? body.message_id ?? '').trim();
    const sourceRowId = typeof body.source_message_row_id === 'string' ? body.source_message_row_id.trim() : null;
    const sourceCandidates = await resolveWhatsAppMessageIdCandidates(supabase, {
      clienteId,
      messageId: sourceMessageId,
      messageRowId: sourceRowId,
    });
    if (sourceCandidates[0]) sourceMessageId = sourceCandidates[0];
    const sourceKind = String(body.source_kind ?? 'text').toLowerCase();
    const sourceBody = String(body.source_body ?? body.body ?? body.text ?? '').trim();
    const sourceCaption = String(body.source_caption ?? body.caption ?? '').trim();
    const sourceMediaType = String(body.source_media_type ?? '').toLowerCase();

    let fwdRes: Response;
    let fwdData: Record<string, unknown>;
    let sentPreview = sourceBody || sourceCaption || 'Mensagem encaminhada';

    const isMediaForward =
      sourceKind !== 'text' &&
      sourceMessageId &&
      (sourceMediaType || ['image', 'video', 'audio', 'document', 'sticker', 'ptt'].includes(sourceKind));

    if (isMediaForward) {
      const dlRes = await fetch(`${baseUrl}/message/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instanceToken },
        body: JSON.stringify({ id: sourceMessageId, return_base64: true, return_link: false, generate_mp3: true }),
      });
      const dlData = (await dlRes.json().catch(() => ({}))) as Record<string, unknown>;
      const filePayload = (dlData.base64Data ?? dlData.base64 ?? dlData.fileURL ?? dlData.fileUrl) as string | undefined;
      if (!filePayload) {
        return new Response(JSON.stringify({ error: 'Não foi possível baixar a mídia para encaminhar.' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const mediaType = sourceMediaType || (sourceKind === 'sticker' ? 'sticker' : sourceKind === 'audio' ? 'audio' : sourceKind);
      const mediaPayload: Record<string, unknown> = {
        number: sendNumber,
        type: mediaType,
        file: filePayload,
        forward: true,
      };
      if (sourceCaption) mediaPayload.text = sourceCaption;
      fwdRes = await fetch(`${baseUrl}/send/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instanceToken },
        body: JSON.stringify(mediaPayload),
      });
      fwdData = (await fwdRes.json().catch(() => ({}))) as Record<string, unknown>;
      sentPreview = previewForMedia(mediaType, '', sourceCaption);
    } else {
      const textToSend = sourceBody || sourceCaption || '(mensagem encaminhada)';
      fwdRes = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instanceToken },
        body: JSON.stringify({ number: sendNumber, text: textToSend, forward: true }),
      });
      fwdData = (await fwdRes.json().catch(() => ({}))) as Record<string, unknown>;
      sentPreview = textToSend;
    }

    const fwdFailed =
      !fwdRes.ok ||
      fwdData?.success === false ||
      (typeof fwdData?.error === 'string' && fwdData.error.length > 0);
    if (fwdFailed) {
      const errMsg = (fwdData?.error as string) ?? fwdRes.statusText ?? 'Erro ao encaminhar mensagem.';
      return new Response(JSON.stringify({ error: errMsg, details: fwdData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messageId = pickSentMessageId(fwdData);
    const uazapiInternalId = pickUazapiInternalId(normalizeSendResponse(fwdData));

    await supabase.from('cliente_whatsapp_sent').insert({
      cliente_id: clienteId,
      to_jid: chatJid,
      chat_jid: chatJid,
      whatsapp_config_id: config.id,
      conversation_id: conversationId,
      sent_by: user.id,
      message_id: String(messageId),
      uazapi_internal_id: uazapiInternalId,
      body: `[Encaminhada] ${sentPreview}`.slice(0, 500),
      ack_status: initialAckFromSendResponse(fwdData),
    });

    await updateConversationAfterSend(supabase, {
      conversationId,
      clienteId,
      configId: config.id,
      chatJid,
      userId: user.id,
      preview: sentPreview,
      nowIso,
    });

    return new Response(
      JSON.stringify({ success: true, action: 'forward', message_id: String(messageId), to_jid: chatJid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let res: Response;
  let resData: Record<string, unknown>;
  let sentPreview: string;

  let docName = '';
  let mimetype = '';

  if (isMedia) {
    docName = typeof body.doc_name === 'string' ? body.doc_name.trim() : '';
    mimetype = typeof body.mimetype === 'string' ? body.mimetype.trim() : '';
    const mediaPayload: Record<string, unknown> = {
      number: sendNumber,
      type: mediaTypeRaw,
      file: filePayload,
    };
    if (bodyText) mediaPayload.text = bodyText;
    if (docName) mediaPayload.docName = docName;
    if (mimetype) mediaPayload.mimetype = mimetype;
    if (replyId) mediaPayload.replyid = replyId;
    if (forwardFlag) mediaPayload.forward = true;

    res = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instanceToken },
      body: JSON.stringify(mediaPayload),
    });
    resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    sentPreview = previewForMedia(mediaTypeRaw, docName, bodyText);
  } else {
    const textPayload: Record<string, unknown> = { number: sendNumber, text: bodyText };
    if (replyId) textPayload.replyid = replyId;
    if (forwardFlag) textPayload.forward = true;

    if (serviceDelivery.internalNotification && !await revalidateCrmIaInternalNotification(supabase, body, serviceDelivery.internalNotification)) {
      return new Response(JSON.stringify({ error: 'Autorização do aviso alterada.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    res = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instanceToken },
      body: JSON.stringify(textPayload),
    });
    resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    sentPreview = bodyText;
  }

  const apiFailed = !res.ok || resData?.success === false || (typeof resData?.error === 'string' && resData.error.length > 0);

  if (apiFailed) {
    const errMsg = (resData?.error as string) ?? (resData?.message as string) ?? res.statusText ?? 'Erro ao enviar mensagem na uazapi.';
    console.error('[uazapi-send-message] uazapi error', res.status, resData);
    return new Response(
      JSON.stringify({ error: errMsg, details: resData }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const normalizedRes = normalizeSendResponse(resData);
  const messageId = pickSentMessageId(resData);
  const uazapiInternalId = pickUazapiInternalId(normalizedRes);
  const ackStatus = initialAckFromSendResponse(resData);

  if (serviceDelivery.internalNotification || serviceDelivery.notificationEvent) {
    const receipt = await supabase.rpc('crm_ia_notification_note_receipt', {
      p_id: body.outbox_id, p_claim_token: body.claim_token, p_message: stanzaFromValue(messageId),
    });
    if (receipt.error || receipt.data?.recorded !== true) {
      return new Response(JSON.stringify({ error: 'Recibo do envio não confirmado.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const insertBase = {
    cliente_id: clienteId,
    to_jid: chatJid,
    chat_jid: chatJid,
    whatsapp_config_id: config.id,
    conversation_id: conversationId,
    sent_by: queuedHuman ? user?.id : isIaAuto ? null : user?.id,
    sender_kind: queuedHuman ? 'human' : isIaAuto ? 'automation' : 'human',
    message_id: String(messageId),
    body: sentPreview,
  };

  let insertedRow: { id: string } | null = null;
  // Internal summaries keep their receipt in the private outbox, including when both phone numbers coincide.
  if (!serviceDelivery.internalNotification) {
    let insertResult = await supabase
      .from('cliente_whatsapp_sent')
      .insert({ ...insertBase, uazapi_internal_id: uazapiInternalId, ack_status: ackStatus })
      .select('id')
      .single();

    if (insertResult.error) {
      console.error('[uazapi-send-message] insert sent error (full)', insertResult.error);
      insertResult = await supabase.from('cliente_whatsapp_sent').insert(insertBase).select('id').single();
      if (insertResult.error) {
        console.error('[uazapi-send-message] insert sent error (fallback)', insertResult.error);
      } else {
        insertedRow = insertResult.data;
      }
    } else {
      insertedRow = insertResult.data;
    }
  }

  if ((!isIaAuto || queuedHuman) && user?.id) {
    const logMeta = classifySendForLog(isMedia, mediaTypeRaw, bodyText, docName, sentPreview);
    const { error: logError } = await supabase.from('atendimento_material_envios').insert({
      cliente_id: clienteId,
      conversation_id: conversationId,
      chat_jid: chatJid,
      whatsapp_config_id: config.id,
      sent_by: user.id,
      message_id: String(messageId),
      send_kind: logMeta.send_kind,
      label: logMeta.label,
      file_name: logMeta.file_name,
      body_preview: logMeta.body_preview,
    });

    if (logError) {
      console.error('[uazapi-send-message] material log insert error', logError);
    }

    await updateConversationAfterSend(supabase, {
      conversationId,
      clienteId,
      configId: config.id,
      chatJid,
      userId: user.id,
      preview: sentPreview,
      nowIso,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message_id: String(messageId),
      sent_row_id: insertedRow?.id ?? null,
      uazapi_internal_id: uazapiInternalId,
      ack_status: ackStatus,
      to_jid: chatJid,
      chat_jid: chatJid,
      media: isMedia,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
