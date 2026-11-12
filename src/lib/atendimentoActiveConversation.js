/** Conversa aberta na tela Conversas (para suprimir popup visual redundante). */
let activeChatJid = null;
let activeConversationId = null;

export function setAtendimentoActiveConversation(conversation) {
  if (!conversation) {
    activeChatJid = null;
    activeConversationId = null;
    return;
  }
  activeChatJid = conversation.chat_jid || null;
  activeConversationId = conversation.id || null;
}

export function clearAtendimentoActiveConversation() {
  activeChatJid = null;
  activeConversationId = null;
}

export function isAtendimentoConversationFocused({ chatJid = null, conversationId = null } = {}) {
  if (conversationId && activeConversationId && conversationId === activeConversationId) {
    return true;
  }
  if (chatJid && activeChatJid && chatJid === activeChatJid) {
    return true;
  }
  return false;
}
