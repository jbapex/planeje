/**
 * Número do menu Conversas: uma conversa da fila aberta.
 * Resolvida não entra — mensagem nova do contato volta para Aguardando.
 * O número não soma as mensagens não lidas de cada chat.
 */

export function computeSidebarBadge(conversations = []) {
  let unreadConversations = 0;
  let aguardandoOnly = 0;
  let pendingConversations = 0;

  conversations.forEach((conv) => {
    if (!conv || conv.archived_at || conv.bloqueada) return;
    if (conv.status === 'resolvido') return;

    const unread = Number(conv.unread_count) || 0;
    const isAguardando = conv.status === 'aguardando';
    const needsAttention = unread > 0 || isAguardando;
    if (!needsAttention) return;

    pendingConversations += 1;
    if (unread > 0) unreadConversations += 1;
    else if (isAguardando) aguardandoOnly += 1;
  });

  return {
    unreadConversations,
    aguardandoOnly,
    badgeTotal: pendingConversations,
  };
}
