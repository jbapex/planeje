import { readChatvoltPayload } from './chatvoltIngress.js';
import { extractMatchCode } from './rastreamentoHiddenMatchCode.js';

const text = value => typeof value === 'string' ? value.trim() : '';

/** A conversa autentica o vínculo; frase, nome e proximidade de horário não identificam um clique. */
export async function lookupChatvoltConversationAttribution(supabase, { clienteId, body } = {}) {
  const incoming = readChatvoltPayload(body);
  const conversationId = text(body?.conversationId), organizationId = text(body?.organizationId);
  if (!clienteId || !incoming || incoming.fromMe || incoming.isGroup || !incoming.messageId ||
      incoming.channel !== 'whatsapp' || !conversationId || !organizationId ||
      conversationId.length > 200 || organizationId.length > 200 ||
      (!incoming.phone && !extractMatchCode(incoming.messageText))) return null;
  if (incoming.phone && !/^\d{10,15}$/.test(incoming.phone)) return null;

  const { data, error } = await supabase.from('cliente_whatsapp_webhook_log')
    .select('from_jid,created_at,event:raw_payload->>eventType,phone:raw_payload->>userPhoneNumber,name:raw_payload->>userName,message:raw_payload->>userMessage,message_id:raw_payload->>messageId,message_at:raw_payload->>createdAt,conversation_id:raw_payload->>conversationId,organization_id:raw_payload->>organizationId,channel:raw_payload->>channel')
    .eq('cliente_id', clienteId).eq('source', 'chatvolt')
    .eq('raw_payload->>conversationId', conversationId).eq('raw_payload->>organizationId', organizationId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(201);
  // Um recorte truncado não comprova que telefone e código sejam únicos na conversa.
  if (error || !Array.isArray(data) || !data.length || data.length >= 201) return null;

  const phones = new Set(), codes = new Map(), messageCodes = new Map();
  let name = '';
  for (const row of data) {
    if (row.conversation_id !== conversationId || row.organization_id !== organizationId || row.channel !== 'whatsapp') return null;
    const message = readChatvoltPayload({ eventType: row.event, userPhoneNumber: row.phone, userName: row.name,
      userMessage: row.message, messageId: row.message_id, channel: row.channel });
    if (!message || message.isGroup) return null;
    if (message.phone) {
      if (!/^\d{10,15}$/.test(message.phone) || row.from_jid !== `${message.phone}@s.whatsapp.net`) return null;
      phones.add(message.phone);
      if (!name && message.name) name = message.name;
    } else if (!row.from_jid && !message.fromMe && message.messageId) {
      const code = extractMatchCode(message.messageText);
      if (code) {
        if (messageCodes.has(message.messageId) && messageCodes.get(message.messageId) !== code) return null;
        messageCodes.set(message.messageId,code);
        codes.set(code, { matchCode: code, messageId: message.messageId, messageAt:row.message_at, receivedAt:row.created_at });
      }
    }
  }
  if (phones.size !== 1 || !codes.size) return null;
  const phone = [...phones][0];
  if (incoming.phone && incoming.phone !== phone) return null;
  const directCode = extractMatchCode(incoming.messageText);
  if (directCode && !codes.has(directCode)) return null;
  const matches = directCode ? [codes.get(directCode)] : [...codes.values()].reverse();
  return { phone, matches, ...(name ? { name } : {}) };
}
