/** Quantas mensagens a conversa pede de cada vez. O restante sobe com a rolagem. */
export const ATENDIMENTO_THREAD_PAGE_SIZE = 40;

/** Até quantas páginas buscar para alcançar a primeira não lida, sem puxar o histórico inteiro. */
export const ATENDIMENTO_THREAD_UNREAD_MAX_PAGES = 6;

function createdTime(message) {
  const raw = message?.createdAt || message?.at || 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function oldestCreatedAt(messages) {
  let oldest = null;
  let oldestTime = Infinity;
  (messages || []).forEach((message) => {
    if (!message || message.optimistic || message.upload || message.kind === 'note') return;
    const raw = message.createdAt || message.at;
    if (!raw) return;
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time) || time >= oldestTime) return;
    oldestTime = time;
    oldest = raw;
  });
  return oldest;
}

export function inboundCount(messages) {
  return (messages || []).filter(
    (message) => message
      && message.direction === 'in'
      && message.kind !== 'note'
      && !message.optimistic
      && !message.upload,
  ).length;
}

/** A primeira mensagem ainda não lida, contando as últimas falas recebidas. */
export function firstUnreadMessageId(messages, unreadCount) {
  const pending = Number(unreadCount) || 0;
  if (pending <= 0) return null;
  const inbound = (messages || []).filter(
    (message) => message
      && message.direction === 'in'
      && message.kind !== 'note'
      && !message.optimistic
      && !message.upload,
  );
  if (!inbound.length) return null;
  const index = Math.max(0, inbound.length - pending);
  return inbound[index]?.id ?? null;
}

/**
 * Fica com as mais novas. Se várias nasceram no mesmo instante, nenhuma delas
 * fica de fora — senão a página seguinte, que pede “antes deste instante”, as perderia.
 */
export function takeNewestByCreatedAt(messages, limit) {
  const sorted = [...(messages || [])].sort((a, b) => createdTime(a) - createdTime(b));
  const size = Math.max(1, Number(limit) || sorted.length || 1);
  if (sorted.length <= size) return { page: sorted, truncated: false };
  const cut = sorted.length - size;
  const boundary = createdTime(sorted[cut]);
  let start = cut;
  while (start > 0 && createdTime(sorted[start - 1]) === boundary) start -= 1;
  return { page: sorted.slice(start), truncated: start > 0 };
}

export function mergeThreadPages(older, newer) {
  const byId = new Map();
  (older || []).forEach((message) => {
    if (message?.id) byId.set(message.id, message);
  });
  (newer || []).forEach((message) => {
    if (message?.id) byId.set(message.id, message);
  });
  return [...byId.values()].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
}

/**
 * Atualiza a janela recente e conserva o que já foi carregado ao rolar para cima.
 * O que sumiu da janela recente (apagado) sai. O histórico antigo permanece.
 */
export function applyLatestWindow(previous, latest, previousWindowIds) {
  const latestIds = new Set((latest || []).map((message) => message?.id).filter(Boolean));
  const drop = previousWindowIds instanceof Set ? previousWindowIds : new Set(previousWindowIds || []);
  const kept = (previous || []).filter((message) => {
    if (!message?.id) return false;
    if (latestIds.has(message.id)) return false;
    if (message.optimistic || message.upload) return true;
    if (drop.has(message.id)) return false;
    return true;
  });
  return mergeThreadPages(kept, latest);
}

export function tailMessages(messages, size) {
  const list = (messages || []).filter((message) => message && !message.optimistic && !message.upload);
  const limit = Math.max(1, Number(size) || list.length || 1);
  if (list.length <= limit) return list;
  return list.slice(-limit);
}

export function pageHasOlder(sourceLengths, pageSize, uniqueCount) {
  if ((Number(uniqueCount) || 0) > pageSize) return true;
  return (sourceLengths || []).some((count) => (Number(count) || 0) >= pageSize);
}
