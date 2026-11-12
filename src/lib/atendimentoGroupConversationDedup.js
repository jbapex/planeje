/**
 * Grupos WhatsApp existem uma vez por canal (UNIQUE cliente+config+chat_jid).
 * Vários números da operação no mesmo grupo geram conversas duplicadas na lista.
 * Com filtro "todos os canais", exibimos uma entrada por chat_jid.
 */

import {
  getInboxRowDedupeVariants,
  getThreadMessageDedupeVariants,
  inboxRowContentFingerprint,
  sentRowContentFingerprint,
  threadMessageContentFingerprint,
} from '@/lib/atendimentoMessageUtils';

function conversationActivityTs(conv) {
  const t = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

const STATUS_PRIORITY = { em_atendimento: 3, aguardando: 2, resolvido: 1 };

function pickPrimaryGroupConversation(candidates = []) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const sa = STATUS_PRIORITY[a.status] || 0;
    const sb = STATUS_PRIORITY[b.status] || 0;
    if (sb !== sa) return sb - sa;
    const unreadDiff = (Number(b.unread_count) || 0) - (Number(a.unread_count) || 0);
    if (unreadDiff !== 0) return unreadDiff;
    return conversationActivityTs(b) - conversationActivityTs(a);
  })[0];
}

export function shouldDedupeGroupConversations(channelFilter) {
  return !channelFilter || channelFilter === 'all';
}

export function getGroupConversationUpdateIds(conversation) {
  if (!conversation?.id) return [];
  const ids = [conversation.id];
  if (Array.isArray(conversation._groupAliasIds)) {
    conversation._groupAliasIds.forEach((id) => {
      if (id) ids.push(id);
    });
  }
  return [...new Set(ids)];
}

/**
 * @param {object[]} conversations
 * @param {{ channelFilter?: string }} options
 */
export function mergeGroupConversationsForList(conversations = [], { channelFilter } = {}) {
  if (!shouldDedupeGroupConversations(channelFilter)) return conversations;

  const groupsByJid = new Map();
  const others = [];

  for (const conv of conversations) {
    if (conv?.archived_at) continue;
    if (!conv?.is_group || !conv.chat_jid) {
      others.push(conv);
      continue;
    }
    const key = `${conv.cliente_id || ''}:${String(conv.chat_jid).toLowerCase()}`;
    if (!groupsByJid.has(key)) groupsByJid.set(key, []);
    groupsByJid.get(key).push(conv);
  }

  const merged = [...others];

  for (const group of groupsByJid.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const primary = pickPrimaryGroupConversation(group);
    const latest = group.reduce(
      (best, c) => (conversationActivityTs(c) > conversationActivityTs(best) ? c : best),
      group[0],
    );
    const aliasIds = group.filter((c) => c.id !== primary.id).map((c) => c.id);
    const totalUnread = group.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);
    const displayName = group.map((c) => c.display_name).find(Boolean) || primary.display_name;
    const profilePic = group.map((c) => c.profile_pic_url).find(Boolean) || primary.profile_pic_url;

    merged.push({
      ...primary,
      display_name: displayName,
      profile_pic_url: profilePic,
      unread_count: totalUnread,
      last_message_at: latest.last_message_at ?? primary.last_message_at,
      last_message_preview: latest.last_message_preview ?? primary.last_message_preview,
      last_customer_message_at:
        group
          .map((c) => c.last_customer_message_at)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? primary.last_customer_message_at,
      awaiting_response_since:
        group
          .map((c) => c.awaiting_response_since)
          .filter(Boolean)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? primary.awaiting_response_since,
      _groupAliasIds: aliasIds,
      _groupMergedCount: group.length,
      _groupWhatsappConfigIds: [...new Set(group.map((c) => c.whatsapp_config_id).filter(Boolean))],
    });
  }

  return merged.sort((a, b) => conversationActivityTs(b) - conversationActivityTs(a));
}

function registerVariants(variantToSlot, slotIdx, variants) {
  variants.forEach((v) => {
    if (v) variantToSlot.set(v, slotIdx);
  });
}

function preferInboxRow(candidate, existing, preferConfigId) {
  if (!existing) return candidate;
  if (!preferConfigId) return existing;
  const candMatch = candidate.whatsapp_config_id === preferConfigId;
  const existMatch = existing.whatsapp_config_id === preferConfigId;
  if (candMatch && !existMatch) return candidate;
  return existing;
}

function threadMessagePreferScore(msg) {
  if (!msg) return 0;
  let score = 0;
  if (msg.direction === 'out' && !msg.optimistic) score += 2;
  if (msg.ack && msg.ack !== 'sent') score += 2;
  if (msg.uazapiInternalId) score += 1;
  if (msg.media && !msg.mediaPurged) score += 1;
  return score;
}

function preferThreadMessage(candidate, existing, preferConfigId) {
  if (!existing) return candidate;
  if (!candidate.deleted && existing.deleted) return existing;
  if (candidate.deleted && !existing.deleted) return candidate;

  const candScore = threadMessagePreferScore(candidate);
  const existScore = threadMessagePreferScore(existing);
  if (candScore !== existScore) return candScore > existScore ? candidate : existing;

  if (preferConfigId) {
    if (candidate.whatsappConfigId === preferConfigId && existing.whatsappConfigId !== preferConfigId) {
      return candidate;
    }
    if (existing.whatsappConfigId === preferConfigId && candidate.whatsappConfigId !== preferConfigId) {
      return existing;
    }
  }
  return existing;
}

function dedupeItems(items, { getVariants, getFingerprint, prefer, sort }) {
  const slots = [];
  const variantToSlot = new Map();
  const fingerprintToSlot = new Map();

  for (const item of items) {
    const variants = getVariants(item);
    const fingerprint = getFingerprint(item);
    let slotIdx = null;

    for (const variant of variants) {
      if (variantToSlot.has(variant)) {
        slotIdx = variantToSlot.get(variant);
        break;
      }
    }
    if (slotIdx == null && fingerprint && fingerprintToSlot.has(fingerprint)) {
      slotIdx = fingerprintToSlot.get(fingerprint);
    }

    if (slotIdx == null) {
      slotIdx = slots.length;
      slots.push(item);
      registerVariants(variantToSlot, slotIdx, variants);
      if (fingerprint) fingerprintToSlot.set(fingerprint, slotIdx);
      continue;
    }

    slots[slotIdx] = prefer(item, slots[slotIdx]);
    registerVariants(variantToSlot, slotIdx, variants);
    if (fingerprint) fingerprintToSlot.set(fingerprint, slotIdx);
  }

  return slots.sort(sort);
}

/** Remove mensagens repetidas do mesmo grupo recebidas em vários canais. */
export function dedupeInboxRowsForGroup(rows = [], { preferWhatsappConfigId } = {}) {
  return dedupeItems(rows, {
    getVariants: (row) => getInboxRowDedupeVariants(row),
    getFingerprint: (row) => inboxRowContentFingerprint(row),
    prefer: (candidate, existing) => preferInboxRow(candidate, existing, preferWhatsappConfigId),
    sort: (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  });
}

export function dedupeSentRowsForGroup(rows = [], { preferWhatsappConfigId } = {}) {
  return dedupeItems(rows, {
    getVariants: (row) => getInboxRowDedupeVariants(row),
    getFingerprint: (row) => sentRowContentFingerprint(row),
    prefer: (candidate, existing) => preferInboxRow(candidate, existing, preferWhatsappConfigId),
    sort: (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  });
}

/** Última passagem na thread: mesma mensagem de canais diferentes ou inbox+sent. */
export function dedupeThreadMessagesForGroup(messages = [], { preferWhatsappConfigId } = {}) {
  return dedupeItems(messages, {
    getVariants: (msg) => getThreadMessageDedupeVariants(msg),
    getFingerprint: (msg) => threadMessageContentFingerprint(msg),
    prefer: (candidate, existing) => preferThreadMessage(candidate, existing, preferWhatsappConfigId),
    sort: (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime(),
  });
}

export function isGroupChatJid(chatJid) {
  return String(chatJid || '').toLowerCase().includes('@g.us');
}

export function applyGroupThreadDedupe(messages, conversation) {
  if (!conversation?.is_group && !isGroupChatJid(conversation?.chat_jid)) return messages;
  return dedupeThreadMessagesForGroup(messages, {
    preferWhatsappConfigId: conversation?.whatsapp_config_id || null,
  });
}
