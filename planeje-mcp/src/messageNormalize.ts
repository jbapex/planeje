export type MessageRow = { id: string; created_at: string; [key: string]: unknown };
type Row = Record<string, unknown>;
export type MessageAttachment = {
  url: string | null; tipo: string; mime: string | null; nome: string | null;
  id: string | null; expira_em: string | null;
};
export type NormalMessage = {
  contexto_chatvolt: { evento: string; ia_habilitada: boolean | null; agente: { id: string | null; nome: string | null };
    responsavel_atribuido: { id: string | null; nome: string | null }; resposta_controle: string | null;
    anexos_nao_atribuidos: MessageAttachment[] } | null;
  autoria: { tipo: 'cliente' | 'humano' | 'automacao' | 'nao_identificado'; evidencia: string | null };
  id: string; fonte: string; cliente_id: string; lado: 'lead' | 'equipe'; telefone: string | null;
  texto: string; tipo: string; em: string; registrada_em: string; conversation_id: string | null;
  chat_jid: string | null; message_id: string | null; message_id_armazenado: string | null; remetente: string | null; canal: string | null;
  anexos: MessageAttachment[]; midia_expurgada: boolean; sender_jid: string | null; sent_by: string | null; ack_status: string | null;
  evento_indice: number; horario_origem: 'provedor' | 'registro'; is_group: boolean;
  provedor: 'meta_cloud' | 'chatvolt' | 'uazapi' | 'planeje'; chatvolt_organization_id: string | null;
  created_at: string; type: string; msg_timestamp: string | null; sender_name: string | null;
  from_jid: string | null; phone: string | null; whatsapp_config_id: string | null; media_purged_at: string | null;
};
type Draft = Partial<NormalMessage> & { texto: string; lado: NormalMessage['lado']; em?: string };
const obj = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (...values: unknown[]) => values.find((value): value is string => typeof value === 'string' && Boolean(value.trim())) || '';
const label = (...values: unknown[]) => text(...values).trim();

export function timestamp(value: unknown): string | null {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
    const n = Number(value), ms = n > 1e12 ? n : n * 1000;
    return Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ].*(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)) return null;
  const [year, month, date] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== date) return null;
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/([+-]\d{2})$/, '$1:00');
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}
function phone(...values: unknown[]): string | null {
  for (const value of values) {
    const raw = label(value);
    const jidNumber = raw.match(/^(\d+)(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/)?.[1];
    if (!jidNumber && !/^\+?[\d\s().-]+$/.test(raw)) continue;
    const digits = jidNumber || raw.replace(/\D/g, '');
    if (/^\d{8,15}$/.test(digits)) return digits;
  }
  return null;
}
function jid(...values: unknown[]): string | null {
  for (const value of values) {
    const raw = label(value);
    if (/^[^\s@]+@(?:s\.whatsapp\.net|c\.us|g\.us|lid)$/.test(raw)) return raw;
    const digits = phone(raw);
    if (digits) return `${digits}@s.whatsapp.net`;
  }
  return null;
}
function providerId(...values: unknown[]): string | null {
  for (const value of values) {
    const raw = label(value);
    if (!raw || /^r[0-9a-f]{6,}$/i.test(raw) || /^sent_\d+$/.test(raw) || (raw.includes('@') && raw.includes('_'))) continue;
    if (!/^r[0-9a-f]{6,}$/i.test(raw.split(':').at(-1)!)) return raw;
  }
  return null;
}
function uazapiStoredId(body: Row, payload: Row, key: Row, messageKey: Row) {
  const full = label(payload.id ?? body.id);
  // Mirror pickStoredMessageId precedence, but never synthesize its clock-based fallback.
  const candidates = [full.includes(':') ? full : null, payload.messageid, payload.messageId,
    key.id, messageKey.id, payload.id, body.id, body.messageid, body.messageId,
    obj(payload.key ?? body.key ?? obj(body.message).key).id, obj(obj(body.message ?? payload.message).key).id];
  const internal = (id: string) => !id || /^r[0-9a-f]{6,}$/i.test(id) || /^sent_\d+$/i.test(id) || /@.+_\d{13,}$/.test(id);
  for (const value of candidates) {
    const fullId = label(value), stored = fullId.split(':').at(-1)!.trim();
    if (!internal(fullId) && !internal(stored)) return { full: fullId, stored };
  }
  return null;
}
function kind(value: unknown, mime?: unknown): string {
  const candidate = label(mime, value).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/audio|ptt|voice/.test(candidate)) return 'audio';
  if (/sticker|figurinha/.test(candidate)) return 'sticker';
  if (/image/.test(candidate)) return 'image';
  if (/video|ptv/.test(candidate)) return 'video';
  if (/document|application\/|file/.test(candidate)) return 'document';
  if (/reaction/.test(candidate)) return 'reaction';
  return 'text';
}
function mediaUrl(value: unknown): string | null {
  try {
    const url = new URL(label(value));
    if (url.protocol !== 'https:' || url.username || url.password
      || [...url.searchParams.keys()].some(key => /token|secret|authorization|api.?key|signature|credential/i.test(key))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function attachment(value: unknown, type?: string): MessageAttachment {
  const file = obj(value), mime = label(file.mimeType, file.mime, file.mime_type, file.mimetype) || null;
  return { url: mediaUrl(file.f3_media_url ?? file.url ?? file.URL ?? file.link), tipo: type || kind(file.type, mime),
    mime, nome: label(file.name, file.filename, file.fileName, file.title) || null,
    id: label(file.id, file.media_id) || null, expira_em: timestamp(file.f3_media_url_expires_at ?? file.expires_at) };
}
function attachmentList(value: unknown) {
  return array(value).filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => attachment(item));
}

function chatvolt(body: Row): Draft[] {
  const event = label(body.eventType), results: Draft[] = [];
  const files = attachmentList(body.attachments), number = phone(body.userPhoneNumber);
  const control = event === 'AGENT_USER_MESSAGE' && body.isAiEnabled === false && label(body.agentResponse) === '#ai-disabled';
  const ambiguousFiles = event === 'AGENT_USER_MESSAGE' && !control;
  const context: NonNullable<NormalMessage['contexto_chatvolt']> = {
    evento: event, ia_habilitada: typeof body.isAiEnabled === 'boolean' ? body.isAiEnabled : null,
    agente: { id: label(body.agentId) || null, nome: label(body.agentName) || null },
    responsavel_atribuido: { id: label(body.assignee) || null, nome: label(body.assigneeName) || null },
    resposta_controle: control ? '#ai-disabled' : null, anexos_nao_atribuidos: ambiguousFiles ? files : [],
  };
  const sides = [
    { lado: 'lead' as const, allowed: ['USER_MESSAGE_RECEIVED', 'AGENT_USER_MESSAGE', 'GROUP_MESSAGE_RECEIVED'], value: body.userMessage },
    { lado: 'equipe' as const, allowed: ['AGENT_MESSAGE_SENDED', 'AGENT_MESSAGE_FOLLOW_UP', 'AGENT_USER_MESSAGE'], value: body.agentResponse },
  ];
  for (const [index, side] of sides.entries()) {
    const spoken = text(side.value);
    if (control && side.lado === 'equipe') continue;
    const attachments = ambiguousFiles ? [] : files;
    if (!side.allowed.includes(event) || (!spoken && !attachments.length)) continue;
    results.push({ texto: spoken, lado: side.lado, evento_indice: index, telefone: number, contexto_chatvolt: context,
      autoria: side.lado === 'equipe' && event === 'AGENT_USER_MESSAGE' && body.isAiEnabled === true
        ? { tipo: 'automacao', evidencia: 'chatvolt:AGENT_USER_MESSAGE:isAiEnabled' } : undefined,
      em: timestamp(body.createdAt) || undefined, message_id: label(body.messageId) || null,
      canal: label(body.channel).toLowerCase() || null, provedor: 'chatvolt',
      conversation_id: label(body.conversationId) || null, chatvolt_organization_id: label(body.organizationId) || null,
      chat_jid: jid(body.groupJid, body.groupId, number), is_group: event === 'GROUP_MESSAGE_RECEIVED',
      remetente: side.lado === 'lead' ? label(body.userName) || null : null,
      anexos: attachments, tipo: attachments[0]?.tipo || 'text' });
  }
  return results;
}
function meta(body: Row): Draft[] {
  const results: Draft[] = [];
  let index = 0;
  for (const entry of array(body.entry)) for (const changeValue of array(obj(entry).changes)) {
    const change = obj(changeValue), value = obj(change.value), echo = change.field === 'smb_message_echoes';
    if (!echo && change.field !== 'messages') continue;
    for (const raw of array(value[echo ? 'message_echoes' : 'messages'])) {
      const message = obj(raw), currentIndex = index++, type = label(message.type);
      if (!['text', 'image', 'audio', 'video', 'document', 'sticker', 'template', 'interactive', 'button', 'location', 'contacts', 'reaction'].includes(type)) continue;
      const media = obj(message[type]), interactive = obj(message.interactive), template = obj(message.template);
      const number = phone(echo ? message.to : message.from);
      const contact = array(value.contacts).map(obj).find(item => item.wa_id === number);
      const files = ['image', 'audio', 'video', 'document', 'sticker'].includes(type) ? [attachment(media, type)] : [];
      const spoken = text(obj(message.text).body, template.f3_rendered_text,
        [obj(interactive.header).text, obj(interactive.body).text, obj(interactive.footer).text].filter(v => typeof v === 'string').join('\n'),
        obj(interactive.button_reply).title, obj(interactive.list_reply).title, obj(message.button).text,
        media.caption, media.filename, obj(message.reaction).emoji,
        type === 'template' && label(template.name) ? `Modelo WhatsApp: ${label(template.name)}` : '',
        type === 'location' ? [media.name, media.address].filter(v => typeof v === 'string').join('\n') : '',
        type === 'contacts' ? array(message.contacts).map(c => label(obj(obj(c).name).formatted_name)).filter(Boolean).join('\n') : '');
      if (!spoken && !files.length && type !== 'location') continue;
      results.push({ texto: spoken, lado: echo ? 'equipe' : 'lead', tipo: files.length ? type : kind(type),
        em: timestamp(message.timestamp) || undefined, telefone: number, chat_jid: jid(number),
        message_id: label(message.id) || null, provedor: 'meta_cloud', canal: 'whatsapp',
        remetente: echo ? null : label(obj(contact?.profile).name, contact?.name) || null,
        anexos: files, evento_indice: currentIndex });
    }
  }
  return results;
}
function uazapi(body: Row): Draft[] {
  const payload = Object.keys(obj(body.data)).length ? obj(body.data) : body;
  const message = obj(payload.message ?? body.message), content = obj(message.content), chat = obj(body.chat ?? payload.chat);
  const key = obj(payload.key ?? body.key ?? message.key), msgKey = obj(message.key);
  const event = label(body.event, body.Event, body.eventType, body.EventType, payload.event).toLowerCase();
  if (/update|status|ack|connection|presence|qrcode|qr_code|contact|history/.test(event)) return [];
  const direction = [payload.fromMe, body.fromMe, obj(payload.data).fromMe, message.fromMe, key.fromMe,
    payload.wasSentByApi, body.wasSentByApi].find(value => typeof value === 'boolean');
  if ((obj(payload.update ?? body.update).status != null || payload.status != null || body.status != null) && direction !== false) return [];
  const mediaEntry = ['audioMessage', 'pttMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage']
    .find(name => Object.keys(obj(message[name])).length);
  const media = mediaEntry ? obj(message[mediaEntry]) : content;
  const declared = label(message.type, message.messageType, payload.type, payload.mediaType, payload.messageType, body.type);
  if (/protocol|status|ack|notification/.test(declared.toLowerCase())) return [];
  const type = kind(mediaEntry || declared, media.mimetype ?? media.mime_type);
  const spoken = text(payload.body, payload.text, payload.content, body.body, body.text,
    typeof payload.message === 'string' ? payload.message : null, message.conversation, message.text, message.body,
    obj(message.extendedTextMessage).text, message.content, content.text, content.caption, content.title, media.caption,
    obj(message.reactionMessage).text);
  const files = ['audio', 'image', 'video', 'document', 'sticker'].includes(type) ? [attachment(media, type)] : attachmentList(payload.attachments ?? body.attachments);
  if (!spoken && !files.length) return [];
  const chatJid = jid(chat.wa_chatid, chat.id, key.remoteJid, msgKey.remoteJid, message.chatid,
    payload.chatid, payload.chatId, payload.remoteJid, body.chatid, payload.from, message.from, body.from,
    payload.from_jid, payload.fromJid, payload.phone, payload.lead_phone);
  const group = chat.wa_isGroup === true || payload.isGroup === true || body.isGroup === true
    || payload.is_group === true || /@g\.us$/.test(chatJid || '');
  const sender = jid(message.sender_lid, message.senderLid, payload.participant, key.participant, msgKey.participant,
    payload.author, message.sender, message.from, payload.sender, message.sender_pn);
  const fromMe = direction === true;
  const legacy = body.planeje_ingress ? null : uazapiStoredId(body, payload, obj(payload.key ?? body.key), msgKey);
  const id = (legacy?.full.includes(':') ? legacy.full : null) || providerId(message.messageid, message.messageId, payload.messageid, payload.messageId,
    body.messageid, body.messageId, key.id, msgKey.id, payload.message_id, payload.id, body.id, message.id) || legacy?.full || null;
  return [{ texto: spoken, lado: fromMe ? 'equipe' : 'lead', tipo: type,
    telefone: group ? phone(message.sender_pn, payload.sender_pn, body.sender_pn, sender)
      : phone(chatJid, message.sender_pn, payload.sender_pn, payload.phone, body.phone),
    chat_jid: chatJid, sender_jid: group ? sender : chatJid, is_group: group,
    em: timestamp(message.messageTimestamp ?? message.timestamp ?? payload.messageTimestamp ?? payload.timestamp ?? body.messageTimestamp ?? body.timestamp) || undefined,
    message_id: id, message_id_armazenado: legacy?.stored || null, anexos: files, provedor: body.planeje_ingress ? 'planeje' : 'uazapi',
    canal: body.planeje_ingress ? label(body.channel, payload.channel) || 'planeje' : 'whatsapp',
    remetente: label(message.senderName, message.pushName, payload.pushName, payload.senderName, body.senderName, body.name) || null,
    conversation_id: label(payload.conversation_id, body.conversation_id) || null }];
}
function rawMessages(body: Row): Draft[] {
  if (body.object === 'whatsapp_business_account') return meta(body);
  if (['USER_MESSAGE_RECEIVED', 'AGENT_USER_MESSAGE', 'GROUP_MESSAGE_RECEIVED', 'AGENT_MESSAGE_SENDED',
    'AGENT_MESSAGE_FOLLOW_UP', 'AGENT_MESSAGE_BLOCKED', 'AGENT_MESSAGE_NOTED', 'STEP_ENTERED', 'NPS_INTERACTION'].includes(label(body.eventType))) return chatvolt(body);
  return uazapi(body);
}

function complete(source: string, row: MessageRow, clienteId: string, draft: Draft): NormalMessage {
  const at = draft.em || row.created_at, type = draft.tipo || 'text', number = draft.telefone ?? null;
  const purged = Boolean(row.media_purged_at) || obj(row.raw_payload)._mediaPurged === true;
  const human = source === 'cliente_whatsapp_sent' && Boolean(label(row.sent_by));
  const automated = source === 'cliente_whatsapp_sent' && row.sender_kind === 'automation';
  const autoria: NormalMessage['autoria'] = draft.lado === 'lead' ? { tipo: 'cliente', evidencia: 'direcao_recebida' }
    : automated && human ? { tipo: 'nao_identificado', evidencia: 'evidencias_conflitantes' }
    : automated && !human ? { tipo: 'automacao', evidencia: 'sender_kind' }
    : human && !automated ? { tipo: 'humano', evidencia: 'sent_by' }
    : source === 'cliente_whatsapp_sent' && row.sender_kind === 'human' && !automated ? { tipo: 'humano', evidencia: 'sender_kind' }
    : draft.autoria ?? { tipo: 'nao_identificado', evidencia: automated && human ? 'evidencias_conflitantes' : null };
  const contexto = draft.contexto_chatvolt ? { ...draft.contexto_chatvolt,
    anexos_nao_atribuidos: purged ? [] : draft.contexto_chatvolt.anexos_nao_atribuidos } : null;
  return { autoria, contexto_chatvolt: contexto, id: row.id, fonte: source, cliente_id: clienteId, lado: draft.lado, telefone: number,
    texto: draft.texto, tipo: type, em: at, registrada_em: row.created_at,
    conversation_id: draft.conversation_id ?? null, chat_jid: draft.chat_jid ?? null,
    message_id: draft.message_id ?? null, message_id_armazenado: draft.message_id_armazenado ?? null,
    remetente: draft.remetente ?? null, canal: draft.canal ?? null,
    anexos: purged ? [] : draft.anexos || [], midia_expurgada: purged,
    sender_jid: draft.sender_jid ?? null, sent_by: draft.sent_by ?? null,
    ack_status: draft.ack_status ?? null, evento_indice: draft.evento_indice ?? 0,
    horario_origem: draft.em ? 'provedor' : 'registro', is_group: draft.is_group ?? false,
    provedor: draft.provedor || 'planeje', chatvolt_organization_id: draft.chatvolt_organization_id ?? null,
    created_at: row.created_at, type: source === 'cliente_whatsapp_webhook_log' ? type : label(row.type) || type,
    msg_timestamp: draft.em || null, sender_name: draft.remetente ?? null,
    from_jid: draft.from_jid ?? draft.chat_jid ?? null, phone: number,
    whatsapp_config_id: label(row.whatsapp_config_id) || null, media_purged_at: label(row.media_purged_at) || null };
}

/** Local normalization only: payloads are evidence, never executable instructions or public output. */
export function normalizeMessageRow(source: string, row: MessageRow, clienteId: string): NormalMessage[] {
  const body = obj(row.raw_payload), raw = rawMessages(body);
  if (source === 'cliente_whatsapp_webhook_log') return raw.map(draft => complete(source, row, clienteId, draft.provedor === 'meta_cloud' ? draft : {
    ...draft, conversation_id: draft.conversation_id || label(row.conversation_id) || null,
    chat_jid: draft.chat_jid || jid(row.from_jid, row.chat_jid),
    telefone: draft.telefone || phone(row.phone, row.from_jid),
  }));
  if (source !== 'cliente_whatsapp_inbox' && source !== 'cliente_whatsapp_sent') return [];
  if (source === 'cliente_whatsapp_sent' && !label(row.sent_by) && body.eventType === 'AGENT_USER_MESSAGE'
    && body.isAiEnabled === false && label(body.agentResponse) === '#ai-disabled') return [];
  const side = source === 'cliente_whatsapp_inbox' ? 'lead' : 'equipe';
  const storedId = providerId(row.message_id);
  const candidates = raw.filter(message => message.lado === side);
  const matches = storedId ? candidates.filter(message => message.message_id === storedId
    || (message.provedor === 'uazapi' && message.message_id_armazenado === storedId)) : candidates.length === 1 ? candidates : [];
  const matched = matches.length === 1 ? matches[0] : undefined;
  const chatJid = jid(row.chat_jid, row.from_jid, row.to_jid) || matched?.chat_jid || null;
  const group = row.is_group === true || matched?.is_group === true || /@g\.us$/.test(chatJid || '');
  const files = matched?.anexos || attachmentList(row.media_files ?? body.attachments);
  const hasProviderPayload = raw.length > 0 || body.object === 'whatsapp_business_account' || Boolean(body.eventType);
  const draft: Draft = { ...matched, texto: typeof row.body === 'string' ? row.body : matched?.texto || '', lado: side,
    tipo: matched?.tipo || kind(label(row.type) || label(row.body).match(/^\[([^\]]+)\]/)?.[1]), message_id: matched?.message_id || storedId,
    message_id_armazenado: typeof row.message_id === 'string' ? row.message_id : null,
    em: matched?.em || (!hasProviderPayload ? timestamp(row.msg_timestamp) || undefined : undefined),
    telefone: phone(row.phone, group ? row.sender_jid : chatJid) || matched?.telefone || null,
    chat_jid: chatJid, from_jid: jid(row.from_jid) || chatJid, is_group: group,
    sender_jid: jid(row.sender_jid) || matched?.sender_jid || null,
    remetente: label(row.sender_name) || matched?.remetente || null,
    conversation_id: label(row.conversation_id) || matched?.conversation_id || null,
    canal: label(row.channel, row.ingress_channel) || matched?.canal || null,
    sent_by: label(row.sent_by) || null, ack_status: label(row.ack_status) || null, anexos: files, evento_indice: 0 };
  return [complete(source, row, clienteId, draft)];
}
