/**
 * Normaliza o payload recebido da uazapi (webhook ou SSE) para inserir em cliente_whatsapp_inbox.
 * Suporta várias estruturas (data.key.remoteJid, chat.wa_chatid, notifyName, pushName, etc.)
 */
function extractPhoneFromJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return String(jid).replace(/@.*$/, '').trim();
}

function get(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && (typeof v === 'string' ? v.trim() : true)) return v;
  }
  return '';
}

export function normalizeUazapiPayload(body) {
  const payload = (body?.data && typeof body.data === 'object' ? body.data : body) || {};
  const chat = (body?.chat ?? payload?.chat) || {};
  const key = payload?.key ?? body?.key ?? {};
  const keyObj = typeof key === 'object' && key !== null ? key : {};

  const from = get(chat, 'wa_chatid', 'id') ||
    get(payload, 'from', 'remoteJid', 'chatId', 'author', 'participant') ||
    get(keyObj, 'remoteJid', 'from') ||
    get(body, 'from') || '';

  const bodyText = get(payload, 'body', 'text', 'content') || get(body, 'body', 'text') || '';
  const message = payload?.message ?? body?.message;
  let messageText = '';
  if (typeof message === 'string') {
    messageText = message;
  } else if (message && typeof message === 'object') {
    messageText =
      get(message, 'conversation', 'text') ||
      get(message.extendedTextMessage, 'text') ||
      (typeof message.content === 'string' ? message.content : get(message.content, 'text', 'caption')) ||
      get(message.imageMessage, 'caption') ||
      '';
  }

  const isGroup = !!(chat?.wa_isGroup ?? message?.isGroup ?? payload?.isGroup ?? payload?.is_group ?? body?.isGroup ?? body?.is_group);
  const groupName = (chat?.name ?? chat?.wa_name ?? message?.groupName ?? payload?.groupName ?? payload?.subject ?? body?.groupName ?? null) || null;

  const participantName = isGroup
    ? get(message, 'senderName', 'pushName', 'notifyName') ||
      get(payload, 'senderName', 'pushName', 'notifyName', 'contactName', 'name', 'verifiedName') ||
      get(body, 'senderName', 'pushName', 'notifyName', 'name') ||
      ''
    : get(chat, 'name', 'wa_name') ||
      get(payload, 'notifyName', 'pushName', 'senderName', 'contactName', 'name', 'verifiedName') ||
      get(body, 'notifyName', 'pushName', 'name') ||
      '';

  const profilePicUrl = isGroup
    ? (get(message, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar') ||
      get(payload, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar') ||
      get(body, 'imagePreview', 'image', 'pictureUrl', 'avatar') ||
      null)
    : get(chat, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl') ||
      get(payload, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar') ||
      null;

  const chatJidRaw = get(chat, 'wa_chatid', 'id') || get(keyObj, 'remoteJid') || get(payload, 'chatid', 'remoteJid', 'from') || get(body, 'from') || '';
  let chatJid = chatJidRaw.includes('@') ? chatJidRaw.trim() : (chatJidRaw ? `${extractPhoneFromJid(chatJidRaw)}@s.whatsapp.net` : '');
  const senderRaw = isGroup
    ? get(message, 'sender_lid', 'senderLid', 'sender', 'participant', 'author') ||
      get(payload, 'participant', 'author', 'sender', 'sender_lid', 'senderLid') ||
      get(keyObj, 'participant') ||
      get(message, 'sender_pn', 'senderPn') ||
      get(payload, 'sender_pn', 'senderPn') ||
      ''
    : get(payload, 'participant', 'author', 'sender') || get(keyObj, 'participant') || '';
  let senderJid = isGroup && senderRaw
    ? (senderRaw.includes('@') ? senderRaw.trim() : `${extractPhoneFromJid(senderRaw)}@s.whatsapp.net`)
    : chatJid;

  const participantPhone = isGroup
    ? get(message, 'sender_pn', 'senderPn') || get(payload, 'sender_pn', 'senderPn') || get(body, 'sender_pn', 'senderPn') || ''
    : '';
  const phoneFromParticipant = participantPhone ? extractPhoneFromJid(participantPhone) : '';
  const phoneFromJid = extractPhoneFromJid(from);
  const phone = isGroup
    ? (phoneFromParticipant || phoneFromJid || get(chat, 'phone') || get(payload, 'phone', 'number') || '')
    : phoneFromJid || get(chat, 'phone') || get(payload, 'phone', 'number') || get(chat, 'owner') || get(payload, 'owner') || '';

  const senderName =
    (participantName && participantName.trim()) || (isGroup ? null : phone || phoneFromJid || null);

  const messageId = (payload?.id ?? keyObj?.id ?? payload?.messageId ?? body?.id ?? chat?.id) || `${chatJid || from}_${Date.now()}`;
  const tsRaw = payload?.messageTimestamp ?? payload?.timestamp ?? body?.messageTimestamp ?? body?.timestamp;
  const ts = tsRaw != null
    ? new Date(Number(tsRaw) > 1e12 ? Number(tsRaw) : Number(tsRaw) * 1000).toISOString()
    : new Date().toISOString();
  const fromJid = chatJid || (phone ? `${phone}@s.whatsapp.net` : null) || 'unknown';
  const type = (payload?.type ?? body?.type ?? 'text') || 'text';

  return {
    from_jid: fromJid,
    chat_jid: fromJid !== 'unknown' ? fromJid : null,
    sender_jid: senderJid || null,
    sender_name: senderName,
    body: (bodyText || messageText || '').trim() || null,
    phone: phone || phoneFromJid || null,
    profile_pic_url: profilePicUrl || null,
    is_group: isGroup,
    group_name: groupName,
    message_id: String(messageId),
    msg_timestamp: ts,
    type,
  };
}
