/** Rotas da inbox principal (substitui WhatsApp no dia a dia). */

import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import {
  AUDIENCE_FILTER_ALL,
  AUDIENCE_FILTER_BASE,
  AUDIENCE_FILTER_COMMERCIAL,
  AUDIENCE_FILTER_GROUPS,
  AUDIENCE_FILTER_BLOCKED,
} from '@/lib/atendimentoAudienceFilter';

export const CONVERSAS_PATH = '/conversas';
export const CONVERSAS_CONFIG_PATH = '/conversas/config';
export const CONVERSAS_ENVIOS_PATH = '/conversas/envios';
export const CONVERSAS_LEMBRETES_PATH = '/conversas/lembretes';
export const CONVERSAS_CANAIS_PATH = '/conversas/canais';

/** Configuração de filas/permissões do atendimento — somente superadmin. */
export function canManageConversasConfig(role) {
  return role === 'superadmin';
}

export const CONVERSAS_DEFAULT_STATUS = ATENDIMENTO_STATUS.EM_ATENDIMENTO;

/** Slug na URL → status no banco */
export const CONVERSAS_SLUG_TO_STATUS = {
  aguardando: ATENDIMENTO_STATUS.AGUARDANDO,
  'em-atendimento': ATENDIMENTO_STATUS.EM_ATENDIMENTO,
  resolvidos: ATENDIMENTO_STATUS.RESOLVIDO,
};

/** Status no banco → slug na URL */
export const CONVERSAS_STATUS_TO_SLUG = {
  [ATENDIMENTO_STATUS.AGUARDANDO]: 'aguardando',
  [ATENDIMENTO_STATUS.EM_ATENDIMENTO]: 'em-atendimento',
  [ATENDIMENTO_STATUS.RESOLVIDO]: 'resolvidos',
};

export const CONVERSAS_STATUS_TABS = [
  { value: ATENDIMENTO_STATUS.EM_ATENDIMENTO, label: 'Em atendimento', slug: 'em-atendimento' },
  { value: ATENDIMENTO_STATUS.AGUARDANDO, label: 'Aguardando', slug: 'aguardando' },
  { value: ATENDIMENTO_STATUS.RESOLVIDO, label: 'Resolvidos', slug: 'resolvidos' },
];

export const CONVERSAS_DEFAULT_PATH = `/conversas/${CONVERSAS_STATUS_TO_SLUG[CONVERSAS_DEFAULT_STATUS]}`;

const AUDIENCE_QUERY_TO_FILTER = {
  todos: AUDIENCE_FILTER_ALL,
  base: AUDIENCE_FILTER_BASE,
  comercial: AUDIENCE_FILTER_COMMERCIAL,
  grupos: AUDIENCE_FILTER_GROUPS,
  bloqueados: AUDIENCE_FILTER_BLOCKED,
};

const AUDIENCE_FILTER_TO_QUERY = {
  [AUDIENCE_FILTER_ALL]: null,
  [AUDIENCE_FILTER_BASE]: 'base',
  [AUDIENCE_FILTER_COMMERCIAL]: 'comercial',
  [AUDIENCE_FILTER_GROUPS]: 'grupos',
  [AUDIENCE_FILTER_BLOCKED]: 'bloqueados',
};

export function parseConversasStatusSlug(slug) {
  if (!slug) return null;
  return CONVERSAS_SLUG_TO_STATUS[String(slug).trim()] || null;
}

export function conversasStatusToSlug(status) {
  return CONVERSAS_STATUS_TO_SLUG[status] || CONVERSAS_STATUS_TO_SLUG[CONVERSAS_DEFAULT_STATUS];
}

export function parseConversasAudienceQuery(value) {
  if (!value) return AUDIENCE_FILTER_ALL;
  return AUDIENCE_QUERY_TO_FILTER[String(value).trim()] || AUDIENCE_FILTER_ALL;
}

export function conversasAudienceToQuery(filter) {
  return AUDIENCE_FILTER_TO_QUERY[filter] || null;
}

export function buildConversasUrl({ statusTab, chatJid, audienceFilter, clienteId, csGroup } = {}) {
  const status = statusTab || CONVERSAS_DEFAULT_STATUS;
  const slug = conversasStatusToSlug(status);
  const path = `${CONVERSAS_PATH}/${slug}`;
  const params = new URLSearchParams();

  if (csGroup) {
    params.set('cliente_id', csGroup.waClientId);
    params.set('cs_cliente', csGroup.clientId);
    params.set('grupo_conversa', csGroup.conversationId);
    params.set('grupo_canal', csGroup.channelId);
  } else {
    if (chatJid) params.set('chat', chatJid);
    if (clienteId) params.set('cliente_id', String(clienteId));
  }

  const audienceQuery = conversasAudienceToQuery(audienceFilter);
  if (audienceQuery) params.set('audiencia', audienceQuery);

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function isConversasInboxPath(pathname = '') {
  const path = String(pathname || '');
  if (path === CONVERSAS_PATH) return true;
  const segment = path.replace(`${CONVERSAS_PATH}/`, '').split('/')[0];
  return Boolean(parseConversasStatusSlug(segment));
}

export function isConversasPath(pathname = '') {
  return pathname === CONVERSAS_PATH || pathname.startsWith(`${CONVERSAS_PATH}/`);
}
