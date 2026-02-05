/**
 * Normaliza o payload recebido da uazapi (webhook ou SSE) para inserir em cliente_whatsapp_inbox.
 * @param {Record<string, unknown>} body - Body bruto (pode ter chat, data, from, body, etc.)
 * @returns {{ from_jid: string, sender_name: string | null, body: string | null, phone: string | null, profile_pic_url: string | null, is_group: boolean, group_name: string | null, message_id: string, msg_timestamp: string }}
 */
export function normalizeUazapiPayload(body) {
  const payload = (body?.data && typeof body.data === 'object' ? body.data : body) || {};
  const chat = (body?.chat ?? payload?.chat) || {};
  const from = (chat.wa_chatid ?? payload.from ?? payload.remoteJid ?? payload.chatId ?? body.from ?? '') || '';
  const extractPhoneFromJid = (jid) => {
    if (!jid || typeof jid !== 'string') return '';
    return String(jid).replace(/@.*$/, '').trim();
  };
  const phoneFromJid = extractPhoneFromJid(from);
  const phone = (chat.owner ?? chat.phone ?? payload.owner ?? payload.phone ?? phoneFromJid ?? '') || '';
  const bodyText = (payload.body ?? payload.text ?? payload.content ?? body.body ?? body.text ?? '') || '';
  const name = (chat.name ?? chat.wa_name ?? payload.name ?? payload.pushName ?? payload.senderName ?? payload.contactName ?? body.name ?? '') || '';
  const senderName = (name && name.trim()) || phone || phoneFromJid || null;
  const profilePicUrl = (chat.imagePreview ?? chat.image ?? payload.imagePreview ?? payload.image ?? '') || null;
  const isGroup = !!(chat.wa_isGroup ?? payload.isGroup ?? payload.is_group ?? body.isGroup ?? body.is_group);
  const groupName = (chat.name ?? chat.wa_name ?? payload.groupName ?? payload.subject ?? body.groupName ?? null) || null;
  const messageId = (payload.id ?? payload.key?.id ?? payload.messageId ?? body.id ?? chat.id ?? `${from}_${Date.now()}`) || `${from}_${Date.now()}`;
  const ts = (payload.timestamp ?? body.timestamp)
    ? new Date(((payload.timestamp ?? body.timestamp) * 1000)).toISOString()
    : new Date().toISOString();
  const fromJid = from || (phone ? `${phone}@s.whatsapp.net` : null) || 'unknown';
  const type = (payload.type ?? body?.type ?? 'text') || 'text';
  return {
    from_jid: fromJid,
    sender_name: senderName,
    body: bodyText || null,
    phone: phone || null,
    profile_pic_url: profilePicUrl,
    is_group: isGroup,
    group_name: groupName,
    message_id: String(messageId),
    msg_timestamp: ts,
    type,
  };
}
