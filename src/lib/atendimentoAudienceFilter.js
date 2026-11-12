/** Filtros de audiência na inbox (Base / Comercial / Grupos). */

export const AUDIENCE_FILTER_ALL = 'all';
export const AUDIENCE_FILTER_BASE = 'base';
export const AUDIENCE_FILTER_COMMERCIAL = 'commercial';
export const AUDIENCE_FILTER_GROUPS = 'groups';
export const AUDIENCE_FILTER_BLOCKED = 'blocked';

export const AUDIENCE_FILTER_OPTIONS = [
  { value: AUDIENCE_FILTER_ALL, label: 'Todos' },
  { value: AUDIENCE_FILTER_BASE, label: 'Base' },
  { value: AUDIENCE_FILTER_COMMERCIAL, label: 'Comercial' },
  { value: AUDIENCE_FILTER_GROUPS, label: 'Grupos' },
  { value: AUDIENCE_FILTER_BLOCKED, label: 'Bloqueados' },
];

export function getConversationAudienceKind(conv, ctx) {
  if (conv?.is_group) return AUDIENCE_FILTER_GROUPS;
  if (ctx?.audienceType === AUDIENCE_FILTER_BASE) return AUDIENCE_FILTER_BASE;
  if (ctx?.audienceType === AUDIENCE_FILTER_COMMERCIAL) return AUDIENCE_FILTER_COMMERCIAL;
  return 'other';
}

export function matchesAudienceFilter(conv, ctx, filter) {
  if (filter === AUDIENCE_FILTER_BLOCKED) return Boolean(conv?.bloqueada);
  if (conv?.bloqueada) return false;
  if (!filter || filter === AUDIENCE_FILTER_ALL) return true;
  return getConversationAudienceKind(conv, ctx) === filter;
}

export function countConversationsByAudience(conversations, contextByConvId = {}) {
  const counts = {
    [AUDIENCE_FILTER_ALL]: conversations.filter((conv) => !conv?.bloqueada).length,
    [AUDIENCE_FILTER_BASE]: 0,
    [AUDIENCE_FILTER_COMMERCIAL]: 0,
    [AUDIENCE_FILTER_GROUPS]: 0,
    [AUDIENCE_FILTER_BLOCKED]: 0,
  };
  conversations.forEach((conv) => {
    if (conv?.bloqueada) {
      counts[AUDIENCE_FILTER_BLOCKED] += 1;
      return;
    }
    const kind = getConversationAudienceKind(conv, contextByConvId[conv.id]);
    if (kind === AUDIENCE_FILTER_BASE) counts[AUDIENCE_FILTER_BASE] += 1;
    else if (kind === AUDIENCE_FILTER_COMMERCIAL) counts[AUDIENCE_FILTER_COMMERCIAL] += 1;
    else if (kind === AUDIENCE_FILTER_GROUPS) counts[AUDIENCE_FILTER_GROUPS] += 1;
  });
  return counts;
}

export function emptyLabelForAudienceFilter(filter) {
  if (filter === AUDIENCE_FILTER_BASE) return 'Nenhum cliente da base nesta aba.';
  if (filter === AUDIENCE_FILTER_COMMERCIAL) return 'Nenhum lead comercial nesta aba.';
  if (filter === AUDIENCE_FILTER_GROUPS) return 'Nenhum grupo nesta aba.';
  if (filter === AUDIENCE_FILTER_BLOCKED) return 'Nenhuma conversa bloqueada.';
  return 'Nenhuma conversa nesta aba.';
}

export function audienceListTag(ctx, conv) {
  if (conv?.is_group || ctx?.audienceType === AUDIENCE_FILTER_GROUPS) {
    return { label: 'Grupo', className: 'wa-list-tag--group' };
  }
  if (ctx?.audienceType === AUDIENCE_FILTER_BASE) {
    return { label: 'Base', className: 'wa-list-tag--base' };
  }
  if (ctx?.audienceType === AUDIENCE_FILTER_COMMERCIAL) {
    return { label: 'Comercial', className: 'wa-list-tag--commercial' };
  }
  return null;
}
