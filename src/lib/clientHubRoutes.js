import { buildConversasUrl } from '@/lib/conversasRoutes';
import { AUDIENCE_FILTER_GROUPS } from '@/lib/atendimentoAudienceFilter';

export function buildClientHubUrl(clienteId) {
  if (!clienteId) return '/clients';
  return `/clients/${clienteId}`;
}

export function buildClientAtlasDemandsUrl(clienteId, demandId) {
  const query = new URLSearchParams({ aba: 'demandas', origem: 'cs' });
  if (demandId) query.set('demanda', demandId);
  return `${buildClientHubUrl(encodeURIComponent(clienteId))}?${query}`;
}

export function buildClientEditUrl(clienteId) {
  if (!clienteId) return '/clients/new';
  return `/clients/${clienteId}/edit`;
}

export function buildClientConversasUrl(clienteId) {
  if (!clienteId) return buildConversasUrl();
  return buildConversasUrl({ clienteId });
}

export function buildClientCrmUrl(clienteId) {
  if (!clienteId) return '/crm/contatos';
  return `/crm/contatos?cliente_id=${encodeURIComponent(clienteId)}`;
}

export function buildClientProjectsUrl(clienteId) {
  if (!clienteId) return '/projects';
  return `/projects?client_id=${encodeURIComponent(clienteId)}`;
}

export function buildClientTasksUrl(clienteId) {
  if (!clienteId) return '/tasks/list';
  return `/tasks/list?client_id=${encodeURIComponent(clienteId)}`;
}

export function buildClientAssistantUrl(clienteId) {
  if (!clienteId) return '/assistant';
  return `/assistant/client/${clienteId}`;
}

export function buildClientTrafficUrl(clienteId) {
  if (!clienteId) return '/paid-traffic/fila';
  return `/paid-traffic/fila?client_id=${encodeURIComponent(clienteId)}`;
}

export function buildClientGrupoUrl(grupo) {
  if (!grupo?.chat_jid) return null;
  return buildConversasUrl({
    chatJid: grupo.chat_jid,
    audienceFilter: AUDIENCE_FILTER_GROUPS,
    clienteId: grupo.wa_cliente_id || undefined,
  });
}

export function buildClientCoberturaUrl() {
  return '/cobertura';
}

export function buildClientRastreamentoUrl(clienteId) {
  if (!clienteId) return '/rastreamento';
  return `/rastreamento?cliente_id=${encodeURIComponent(clienteId)}`;
}
