import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';

/** Une snapshot da lista ao vivo com dados recarregados (badge usa o maior unread). */
export function mergeConversationForFavorito(stored, live) {
  if (!stored) return live || null;
  if (!live) return stored;
  const ua = Number(stored.unread_count) || 0;
  const ub = Number(live.unread_count) || 0;
  const ta = new Date(stored.last_message_at || 0).getTime();
  const tb = new Date(live.last_message_at || 0).getTime();
  const newer = tb >= ta ? live : stored;
  const older = newer === live ? stored : live;
  const unread = Math.max(ua, ub);
  return {
    ...older,
    ...newer,
    unread_count: unread,
    status: newer.status ?? older.status,
    last_message_at: newer.last_message_at ?? older.last_message_at,
    last_message_preview: newer.last_message_preview ?? older.last_message_preview,
    display_name: newer.display_name || older.display_name,
    profile_pic_url: newer.profile_pic_url || older.profile_pic_url,
  };
}

/** Badge numérico no atalho: mensagens não lidas; se aguardando sem não lidas, mostra 1. */
export function favoritoShortcutBadge(conv) {
  if (!conv) return 0;
  const unread = Number(conv.unread_count) || 0;
  if (unread > 0) return unread > 99 ? 99 : unread;
  if (conv.status === ATENDIMENTO_STATUS.AGUARDANDO) return 1;
  return 0;
}

export function favoritoDisplayName(conv) {
  if (!conv) return 'Conversa';
  return conv.display_name || conv.chat_jid?.replace(/@.*$/, '') || 'Sem nome';
}
