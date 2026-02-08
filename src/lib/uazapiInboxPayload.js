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
  const phoneFromJid = extractPhoneFromJid(from);
  const phone = get(chat, 'owner', 'phone') || get(payload, 'owner', 'phone', 'number') || phoneFromJid || '';

  const bodyText = get(payload, 'body', 'text', 'content') || get(body, 'body', 'text') || '';
  const message = payload?.message ?? body?.message;
  const messageText = typeof message === 'string'
    ? message
    : (message && (message.conversation || message.text || (message.extendedTextMessage?.text ?? '')));

  const name = get(chat, 'name', 'wa_name') ||
    get(payload, 'notifyName', 'pushName', 'senderName', 'contactName', 'name', 'verifiedName') ||
    get(body, 'notifyName', 'pushName', 'name') || '';
  const senderName = (name && name.trim()) || phone || phoneFromJid || null;

  const profilePicUrl = get(chat, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl') ||
    get(payload, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar') || null;

  const isGroup = !!(chat?.wa_isGroup ?? payload?.isGroup ?? payload?.is_group ?? body?.isGroup ?? body?.is_group);
  const groupName = (chat?.name ?? chat?.wa_name ?? payload?.groupName ?? payload?.subject ?? body?.groupName ?? null) || null;
  const messageId = (payload?.id ?? keyObj?.id ?? payload?.messageId ?? body?.id ?? chat?.id) || `${from}_${Date.now()}`;
  const ts = (payload?.timestamp ?? body?.timestamp)
    ? new Date(((payload?.timestamp ?? body?.timestamp) * 1000)).toISOString()
    : new Date().toISOString();
  const fromJid = from || (phone ? `${phone}@s.whatsapp.net` : null) || 'unknown';
  const type = (payload?.type ?? body?.type ?? 'text') || 'text';

  return {
    from_jid: fromJid,
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
