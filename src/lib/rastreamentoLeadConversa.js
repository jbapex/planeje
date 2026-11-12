/** Histórico WhatsApp na ficha do lead: leitura para auditoria. Sem envio. */

import { ATENDIMENTO_MEDIA_RETENTION_DAYS } from './atendimentoMediaRetention.js';
import { readChatvoltPayload } from '../../supabase/functions/_shared/chatvoltIngress.js';

export const LEAD_CONVERSA_LIMIT = 120;

const INBOX_AUDIT_SELECT = 'id, body, msg_timestamp, created_at, type, is_group, chat_jid, from_jid, conversation_id, media_purged_at, phone, profile_pic_url, message_id, whatsapp_config_id, ingress_channel:raw_payload->>channel, chatvolt_event:raw_payload->>eventType, chatvolt_conversation_id:raw_payload->>conversationId, chatvolt_original_at:raw_payload->>createdAt, meta_product:raw_payload->entry->0->changes->0->value->>messaging_product, wa_message_id:raw_payload->message->>messageid, uazapi_internal_id:raw_payload->message->>id, media_files:raw_payload->attachments';
const SENT_AUDIT_SELECT = 'id, body, created_at, chat_jid, to_jid, conversation_id, message_id, uazapi_internal_id, whatsapp_config_id';

export function leadPhoneDigits(contact, lead, event) {
  const raw = lead?.whatsapp || contact?.phone || event?.phone || '';
  return String(raw).replace(/\D/g, '');
}

export function phoneDigitCandidates(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return [];
  const set = new Set([d]);
  if (d.startsWith('55') && d.length >= 12) set.add(d.slice(2));
  else if (!d.startsWith('55') && d.length >= 10) set.add(`55${d}`);
  return [...set];
}

export function chatJidsFromDigits(digits) {
  return phoneDigitCandidates(digits).flatMap((d) => [`${d}@s.whatsapp.net`, `${d}@c.us`]);
}

function isAuditSticker(body, type) {
  return String(type || '').toLowerCase().includes('sticker') || /^\[(figurinha|sticker)\]/i.test(String(body || '').trim());
}

export function auditMediaKind(body, type) {
  const text = String(body || '').trim();
  const t = String(type || '').toLowerCase();
  if (t.includes('audio') || t.includes('ptt') || ['voice', 'voicemessage', 'voice_message'].includes(t) || /^\[(áudio|audio|ptt)\]/i.test(text)) return 'audio';
  // CRM IA e os demais consumidores compartilham o contrato de figurinha como imagem.
  if (t.includes('image') || isAuditSticker(body, type) || /^\[(imagem|image)\]/i.test(text)) return 'image';
  if (t.includes('video') || /^\[(vídeo|video)\]/i.test(text)) return 'video';
  if (t.includes('document') || t === 'file' || /^\[(documento|document|arquivo|file)\]/i.test(text)) return 'document';
  return 'text';
}

export function auditDownloadIds(row) {
  const ids = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (text && !ids.includes(text)) ids.push(text);
  };
  add(row?.wa_message_id);
  add(row?.message_id);
  add(row?.uazapi_internal_id);
  return ids;
}

function mediaExpired(at, kind, now) {
  if (kind === 'text') return false;
  const ts = new Date(at || 0).getTime();
  const today = new Date(now || Date.now()).getTime();
  if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(today)) return false;
  return today - ts > ATENDIMENTO_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export function messageAuditPreview(body, type) {
  const text = String(body || '').trim();
  const t = String(type || '').toLowerCase();
  if (isAuditSticker(body, type)) return 'Figurinha';
  if (t.includes('image') || /^\[imagem\]/i.test(text) || /^\[image\]/i.test(text)) return text.replace(/^\[[^\]]+\]\s*/i, '') || 'Imagem';
  if (auditMediaKind(body, type) === 'audio') {
    return text.replace(/^\[[^\]]+\]\s*/i, '') || 'Áudio';
  }
  if (t.includes('video') || /^\[vídeo\]/i.test(text) || /^\[video\]/i.test(text)) return text.replace(/^\[[^\]]+\]\s*/i, '') || 'Vídeo';
  if (t.includes('document') || /^\[documento\]/i.test(text)) return text.replace(/^\[[^\]]+\]\s*/i, '') || 'Documento';
  return text || 'Mensagem';
}

export function auditDayLabel(ts, now = new Date()) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOf(now) - startOf(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function auditTimeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayKey(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function leadHttpsMediaUrl(value) {
  const text = String(value || '').trim();
  if (!/^https:\/\//i.test(text)) return '';
  try {
    const url = new URL(text);
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function leadMediaKindFromMime(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  if (value) return 'document';
  return '';
}

export function leadAttachmentFiles(row) {
  const raw = row?.media_files ?? row?.raw_payload?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const mime = String(item.mimeType || item.mime || '').trim();
      return {
        url: leadHttpsMediaUrl(item.url),
        mime,
        name: String(item.name || '').trim(),
        kind: leadMediaKindFromMime(mime),
      };
    })
    .filter((item) => item.url && item.kind);
}

function isMediaPlaceholderBody(body) {
  const text = String(body || '').trim();
  if (!text) return true;
  return /^[\p{Extended_Pictographic}\uFE0F\s]+$/u.test(text);
}

export function leadChannelKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function leadChannelLabel(value) {
  const key = leadChannelKey(value);
  if (key === 'unknown') return 'Canal não identificado';
  if (key === 'whatsapp') return 'WhatsApp oficial';
  if (key === 'zapperapi') return 'Zapper';
  return String(value || '').trim();
}

const CHATVOLT_TEAM_EVENTS = new Set([
  'AGENT_MESSAGE_SENDED',
  'AGENT_MESSAGE_FOLLOW_UP',
  'AGENT_USER_MESSAGE',
]);

function chatvoltSourceTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function chatvoltTeamSpeech(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const event = String(payload.eventType || '').trim();
  if (!CHATVOLT_TEAM_EVENTS.has(event)) return null;
  const text = String(payload.agentResponse || '').trim();
  const files = leadAttachmentFiles({ raw_payload: payload });
  if (!text && !files.length) return null;
  return {
    text,
    files,
    channel: leadChannelKey(payload.channel),
    at: chatvoltSourceTime(payload.createdAt),
    messageId: String(payload.messageId || '').trim(),
  };
}

function metaEchoTeamSpeech(message, now) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const text = (value) => typeof value === 'string' ? value.trim() : '';
  const to = text(message.to);
  const messageId = text(message.id);
  const timestamp = /^\d+$/.test(String(message.timestamp)) ? Number(message.timestamp) : NaN;
  const date = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  if (!/^\d{10,15}$/.test(to) || !messageId || !Number.isFinite(date.getTime())) return null;
  const at = date.toISOString();
  const type = text(message.type);
  const labels = { image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha' };
  let body = '';
  if (type === 'text') body = text(message.text?.body);
  else if (type === 'template') body = text(message.template?.f3_rendered_text) || (text(message.template?.name) ? `Modelo WhatsApp: ${text(message.template.name)}` : 'Modelo WhatsApp');
  else if (type === 'interactive') body = [message.interactive?.header?.text, message.interactive?.body?.text, message.interactive?.footer?.text].map(text).filter(Boolean).join('\n');
  else if (!Object.hasOwn(labels, type)) return null;
  const media = message[type] || {};
  const kind = labels[type] ? type : 'text';
  const expiry = media.f3_media_url_expires_at;
  const expired = mediaExpired(at, kind, now) || Boolean(expiry && !(new Date(expiry).getTime() > new Date(now).getTime()));
  const url = expired ? '' : leadHttpsMediaUrl(media.f3_media_url || media.link || media.url);
  const files = url && labels[type] ? [{ url, kind, mime: text(media.mime_type), name: text(media.filename) }] : [];
  body ||= text(media.caption) || text(media.filename) || labels[type] || '';
  if (!body && !files.length) return null;
  return { text: body, files, kind, at, messageId, chatJid: `${to}@s.whatsapp.net`, channel: 'whatsapp', mediaPurged: expired };
}

export function leadConversaChannels(audit) {
  const counts = new Map((audit?.channels || []).map((item) => [
    `config:${item.id}`, { key: `config:${item.id}`, label: item.name || 'Conta WhatsApp', count: 0, lastAt: '' },
  ]));
  for (const item of audit?.items || []) {
    if (item.type !== 'msg') continue;
    const key = leadChannelKey(item.channel);
    if (!key) continue;
    const prev = counts.get(key) || { key, label: item.channelLabel || leadChannelLabel(key), count: 0, lastAt: '' };
    prev.count += 1;
    if (String(item.at || '') > prev.lastAt) prev.lastAt = String(item.at || '');
    counts.set(key, prev);
  }
  return [...counts.values()]
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map((item) => ({ ...item, label: item.label || leadChannelLabel(item.key) }));
}

export function filterLeadConversaByChannel(audit, channel, now = new Date()) {
  const key = leadChannelKey(channel);
  if (!key || !audit) return audit;
  const msgs = (audit.items || []).filter((item) => item.type === 'msg' && leadChannelKey(item.channel) === key);
  const items = [];
  let lastDay = '';
  msgs.forEach((item) => {
    const day = dayKey(item.at);
    if (day && day !== lastDay) {
      items.push({ id: `day-${key}-${day}`, type: 'day', label: auditDayLabel(item.at, now) });
      lastDay = day;
    }
    items.push(item);
  });
  return {
    ...audit,
    items,
    inboundCount: msgs.filter((item) => item.side === 'lead').length,
    outboundCount: msgs.filter((item) => item.side === 'equipe').length,
  };
}

function teamLogMessages(teamLogRows, sentRows, now) {
  const sentIds = new Set((sentRows || []).map((row) => String(row?.message_id || '').trim()).filter(Boolean));
  return (teamLogRows || []).flatMap((row) => {
    const payload = row?.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : null;
    const spoken = row?.meta_echo ? metaEchoTeamSpeech(row.meta_echo, now) : chatvoltTeamSpeech(payload);
    if (!spoken) return [];
    if (spoken.messageId && sentIds.has(spoken.messageId)) return [];
    if (spoken.messageId) sentIds.add(spoken.messageId);
    const files = spoken.files;
    const kind = spoken.kind || files[0]?.kind || 'text';
    return [{
      id: `team-${row.id}`,
      side: 'equipe',
      body: files.length && isMediaPlaceholderBody(spoken.text) ? '' : spoken.text,
      kind,
      at: spoken.at || row.created_at,
      timeEstimated: !row?.meta_echo && !spoken.at,
      mediaFiles: files,
      mediaUrl: files[0]?.url || '',
      mediaPurged: spoken.mediaPurged || false,
      downloadMessageIds: [],
      whatsappConfigId: null,
      conversationId: null,
      chatJid: spoken.chatJid || row.from_jid || '',
      channel: spoken.channel,
    }];
  });
}

export function buildLeadConversaAudit({ inboxRows = [], sentRows = [], teamLogRows = [], channels = [] } = {}, now = new Date()) {
  const incoming = (inboxRows || [])
    .filter((row) => !row?.is_group)
    .map((row) => {
      const files = leadAttachmentFiles(row);
      const fileKind = files[0]?.kind || '';
      const kind = isAuditSticker(row.body, row.type) ? 'sticker' : fileKind || auditMediaKind(row.body, row.type);
      const at = row.msg_timestamp || row.created_at;
      const preview = messageAuditPreview(row.body, row.type);
      return {
        id: `in-${row.id}`,
        side: 'lead',
        body: files.length && isMediaPlaceholderBody(row.body) ? '' : preview,
        kind,
        at,
        timeEstimated: Boolean(row.chatvolt_event && !chatvoltSourceTime(row.chatvolt_original_at)),
        mediaFiles: files,
        mediaUrl: files[0]?.url || '',
        mediaPurged: Boolean(row.media_purged_at) || (!files.length && mediaExpired(at, kind, now)),
        downloadMessageIds: auditDownloadIds(row),
        whatsappConfigId: row.whatsapp_config_id || null,
        conversationId: row.conversation_id || null,
        chatJid: row.chat_jid || row.from_jid || '',
        channel: leadChannelKey(row.ingress_channel || row.channel || row.raw_payload?.channel || (row.meta_product === 'whatsapp' ? 'whatsapp' : '')),
      };
    });
  const metaMessageIds = new Set((teamLogRows || []).map((row) => String(row?.meta_echo?.id || '').trim()).filter(Boolean));
  const outgoing = (sentRows || []).map((row) => {
    const kind = isAuditSticker(row.body, '') ? 'sticker' : auditMediaKind(row.body, '');
    return {
      id: `out-${row.id}`,
      side: 'equipe',
      body: messageAuditPreview(row.body, ''),
      kind,
      at: row.created_at,
      mediaPurged: mediaExpired(row.created_at, kind, now),
      downloadMessageIds: auditDownloadIds(row),
      whatsappConfigId: row.whatsapp_config_id || null,
      conversationId: row.conversation_id || null,
      chatJid: row.chat_jid || row.to_jid || '',
      channel: leadChannelKey(row.channel || (metaMessageIds.has(String(row.message_id || '').trim()) ? 'whatsapp' : '')),
    };
  });
  const team = teamLogMessages(teamLogRows, sentRows, now);
  const channelNames = new Map(channels.map((item) => [item.id, item.name || 'Conta WhatsApp']));
  const merged = [...incoming, ...outgoing, ...team].map((item) => ({
    ...item,
    channel: item.whatsappConfigId ? `config:${item.whatsappConfigId}` : item.channel || 'unknown',
    channelLabel: item.whatsappConfigId ? channelNames.get(item.whatsappConfigId) || 'Conta WhatsApp' : leadChannelLabel(item.channel || 'unknown'),
  })).sort(
    (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
  );
  const counts = new Map();
  const slice = merged.slice().reverse().filter((item) => {
    const count = (counts.get(item.channel) || 0) + 1;
    counts.set(item.channel, count);
    return count <= LEAD_CONVERSA_LIMIT;
  }).reverse();
  const truncated = merged.length > slice.length;
  const items = [];
  let lastDay = '';
  slice.forEach((item) => {
    const key = dayKey(item.at);
    if (key && key !== lastDay) {
      items.push({ id: `day-${key}`, type: 'day', label: auditDayLabel(item.at, now) });
      lastDay = key;
    }
    items.push({
      ...item,
      type: 'msg',
      timeLabel: auditTimeLabel(item.at),
    });
  });
  const chatJid = slice.map((item) => item.chatJid).find((value) => value && String(value).includes('@')) || '';
  const conversationId = slice.map((item) => item.conversationId).find(Boolean) || null;
  return {
    channels,
    items,
    inboundCount: slice.filter((item) => item.side === 'lead').length,
    outboundCount: slice.filter((item) => item.side === 'equipe').length,
    truncated,
    chatJid,
    conversationId,
    mediaRetentionDays: ATENDIMENTO_MEDIA_RETENTION_DAYS,
  };
}

async function collectById(client, table, select, filters) {
  const rowsById = new Map();
  for (const filter of filters) {
    if (!filter?.values?.length) continue;
    const { data, error } = await client
      .from(table)
      .select(select)
      .match(filter.match || {})
      .in(filter.column, filter.values)
      .order('created_at', { ascending: false })
      .limit(LEAD_CONVERSA_LIMIT);
    if (error) throw new Error('Não foi possível carregar parte da conversa.');
    (data || []).forEach((row) => rowsById.set(row.id, row));
  }
  return [...rowsById.values()];
}

function cqcStamp(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text : '';
}

export function cqcPreviewRows(contact) {
  const tracking = contact?.tracking_data && typeof contact.tracking_data === 'object' ? contact.tracking_data : {};
  const at = tracking.cqc_msg_at || contact?.first_seen_at || null;
  const lead = String(tracking.cqc_msg_lead || '').trim();
  const team = String(tracking.cqc_msg_atendente || '').trim();
  const leadStamp = cqcStamp(lead);
  const teamStamp = cqcStamp(team);
  return {
    inboxRows: lead && !leadStamp
      ? [{ id: `cqc-lead-${contact?.id || 'x'}`, body: lead, created_at: at, msg_timestamp: at, is_group: false }]
      : [],
    sentRows: team && !teamStamp
      ? [{ id: `cqc-team-${contact?.id || 'x'}`, body: team, created_at: at }]
      : [],
    leadAt: leadStamp || null,
    teamAt: teamStamp || null,
  };
}

export async function fetchLeadPhoto(client, { clienteId, digits }) {
  const phone = String(digits || '').replace(/\D/g, '');
  if (!clienteId || phone.length < 10) return '';
  const phones = phoneDigitCandidates(phone);
  const jids = chatJidsFromDigits(phone);
  try {
    const [byPhone, byJid] = await Promise.all([
      client
        .from('cliente_whatsapp_contact')
        .select('profile_pic_url')
        .eq('cliente_id', clienteId)
        .in('phone', phones)
        .not('profile_pic_url', 'is', null)
        .limit(1),
      client
        .from('cliente_whatsapp_contact')
        .select('profile_pic_url')
        .eq('cliente_id', clienteId)
        .in('from_jid', jids)
        .not('profile_pic_url', 'is', null)
        .limit(1),
    ]);
    return String(byPhone.data?.[0]?.profile_pic_url || byJid.data?.[0]?.profile_pic_url || '').trim();
  } catch {
    return '';
  }
}

export async function fetchLeadConversaAudit(client, { clienteId, digits }) {
  const phone = String(digits || '').replace(/\D/g, '');
  if (!clienteId || phone.length < 10) {
    return { inboxRows: [], sentRows: [], photoUrl: '', error: null };
  }
  const phones = phoneDigitCandidates(phone);
  const jids = chatJidsFromDigits(phone);
  try {
    let channels = [], channelError = false;
    try {
      const result = await client.from('cliente_whatsapp_config').select('id,name').eq('cliente_id', clienteId);
      if (result.error) throw new Error('channels');
      channels = result.data || [];
    } catch { channelError = true; }
    // Keep the unscoped lookup for legacy rows; account lookups prevent a busy account hiding another.
    const scopes = [{ cliente_id: clienteId }, ...channels.map((item) => ({ cliente_id: clienteId, whatsapp_config_id: item.id }))];
    const results = [];
    for (const scope of scopes) {
      results.push(...await Promise.allSettled([
        collectById(client, 'cliente_whatsapp_inbox', INBOX_AUDIT_SELECT, [{ column: 'phone', values: phones, match: { ...scope, is_group: false } }]),
        collectById(client, 'cliente_whatsapp_inbox', INBOX_AUDIT_SELECT, [{ column: 'chat_jid', values: jids, match: { ...scope, is_group: false } }]),
        collectById(client, 'cliente_whatsapp_inbox', INBOX_AUDIT_SELECT, [{ column: 'from_jid', values: jids, match: { ...scope, is_group: false } }]),
        collectById(client, 'cliente_whatsapp_sent', SENT_AUDIT_SELECT, [{ column: 'chat_jid', values: jids, match: scope }]),
        collectById(client, 'cliente_whatsapp_sent', SENT_AUDIT_SELECT, [{ column: 'to_jid', values: jids, match: scope }]),
      ]));
    }
    let error = results.some((result) => result.status === 'rejected') ? 'Parte da conversa não foi carregada. Tente atualizar.'
      : channelError ? 'Não foi possível identificar todas as contas. Tente atualizar.' : null;
    const inboxById = new Map();
    const sentById = new Map();
    results.forEach((result, index) => {
      const target = index % 5 < 3 ? inboxById : sentById;
      if (result.status === 'fulfilled') result.value.forEach((row) => target.set(row.id, row));
    });
    const inboxRows = [...inboxById.values()];
    const sentRows = [...sentById.values()];
    let teamLogRows = [];
    if (jids.length) {
      const [chatvoltLogs, metaLogs] = await Promise.allSettled([client
        .from('cliente_whatsapp_webhook_log')
        .select('id, created_at, from_jid, raw_payload')
        .eq('cliente_id', clienteId)
        .eq('source', 'chatvolt')
        .in('from_jid', jids)
        .order('created_at', { ascending: false })
        .limit(LEAD_CONVERSA_LIMIT),
      // Mirror currently sends one envelope/message per event; expand the filter if batches are introduced.
      client.from('cliente_whatsapp_webhook_log')
        .select('id, created_at, meta_echo:raw_payload->entry->0->changes->0->value->message_echoes->0')
        .eq('cliente_id', clienteId)
        .eq('source', 'ingress')
        .eq('raw_payload->entry->0->changes->0->>field', 'smb_message_echoes')
        .in('raw_payload->entry->0->changes->0->value->message_echoes->0->>to', phones)
        .order('created_at', { ascending: false })
        .limit(LEAD_CONVERSA_LIMIT),
      ]);
      teamLogRows = [...(chatvoltLogs.status === 'fulfilled' ? chatvoltLogs.value.data || [] : []),
        ...(metaLogs.status === 'fulfilled' ? metaLogs.value.data || [] : [])];
      if (chatvoltLogs.status === 'rejected' || chatvoltLogs.value.error) error = 'Não foi possível carregar as mensagens Chatvolt. Tente atualizar.';
      if (metaLogs.status === 'rejected' || metaLogs.value.error) error = 'Não foi possível carregar as respostas Meta.';
      const conversationIds = [...new Set([
        ...inboxRows.map((row) => row.chatvolt_conversation_id),
        ...teamLogRows.map((row) => row.raw_payload?.conversationId),
      ].filter((value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)))];
      if (conversationIds.length) {
        // Some Chatvolt events omit the phone; only a conversation already bound to this contact can recover them.
        try {
          const related = await client.from('cliente_whatsapp_webhook_log')
            .select('id, created_at, from_jid, raw_payload')
            .eq('cliente_id', clienteId)
            .eq('source', 'chatvolt')
            .is('from_jid', null)
            .in('raw_payload->>conversationId', conversationIds)
            .order('created_at', { ascending: false })
            .limit(LEAD_CONVERSA_LIMIT);
          if (related.error) throw new Error('history');
          for (const row of related.data || []) {
            if (row.from_jid || !conversationIds.includes(row.raw_payload?.conversationId)) continue;
            const parsed = readChatvoltPayload(row.raw_payload);
            if (!parsed || parsed.phone) continue;
            teamLogRows.push(row);
          }
        } catch {
          error = 'Parte das mensagens Chatvolt não foi carregada. Tente atualizar.';
        }
      }
      const ids = new Set(inboxRows.map((row) => row.message_id).filter(Boolean));
      for (const row of teamLogRows) {
        const parsed = readChatvoltPayload(row.raw_payload);
        const files = leadAttachmentFiles(row);
        if (!parsed || !['USER_MESSAGE_RECEIVED', 'AGENT_USER_MESSAGE'].includes(parsed.event) || parsed.fromMe || parsed.isGroup || (!parsed.messageText && !files.length) || !parsed.messageId || ids.has(parsed.messageId)) continue;
        if (parsed.phone && !phones.includes(parsed.phone)) continue;
        ids.add(parsed.messageId);
        inboxRows.push({
          id: `chatvolt-${row.id}`, body: parsed.messageText, message_id: parsed.messageId,
          created_at: row.created_at, msg_timestamp: chatvoltSourceTime(parsed.createdAt) || row.created_at,
          ingress_channel: parsed.channel, chatvolt_event: parsed.event,
          chatvolt_original_at: parsed.createdAt, media_files: row.raw_payload.attachments,
          chat_jid: jids[0], is_group: false,
        });
      }
    }
    const fromInbox = inboxRows.map((row) => row.profile_pic_url).find((url) => String(url || '').trim()) || '';
    return { inboxRows, sentRows, teamLogRows, channels, photoUrl: String(fromInbox).trim(), error };
  } catch (err) {
    return { inboxRows: [], sentRows: [], photoUrl: '', error: err?.message || 'falha ao ler conversa' };
  }
}
