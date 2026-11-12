/**
 * Rotas sob /paid-traffic (HashRouter: #/paid-traffic/...).
 *
 * Campanhas (padrão):
 *   /paid-traffic/campaigns/kanban
 *
 * Campanhas manuais:
 *   /paid-traffic/campaigns/list
 *   /paid-traffic/campaigns/{kanban|list}/new
 *   /paid-traffic/campaigns/{kanban|list}/c/:campaignId
 *   /paid-traffic/campaigns/{kanban|list}/request
 *
 * Dashboard:      /paid-traffic/dashboard
 * Hoje:           /paid-traffic/hoje
 * Situação:       /paid-traffic/situacao
 * Painel:         /paid-traffic/fila
 * Meta Insights:  /paid-traffic/meta-insights
 * Google Insights: /paid-traffic/google-insights
 * Relatório:      /paid-traffic/relatorio
 * Gerir status:   /paid-traffic/settings/status
 */

const BASE = '/paid-traffic';
const REDESIGN_TABS = new Set([
  'visao',
  'operacoes',
  'checkup',
  'clientes',
  'tarefas',
  'alertas',
  'criativos',
  'relatorios',
]);

export const paidTrafficPaths = {
  dashboard: () => `${BASE}/dashboard`,
  fila: () => `${BASE}/fila`,
  hoje: () => `${BASE}/hoje`,
  situacao: () => `${BASE}/situacao`,
  rotina: () => `${BASE}/rotina`,
  campaignsKanban: () => `${BASE}/campaigns/kanban`,
  campaignsList: () => `${BASE}/campaigns/list`,
  campaignNew: (view = 'kanban') => `${BASE}/campaigns/${view}/new`,
  campaignEdit: (id, view = 'kanban') =>
    `${BASE}/campaigns/${view}/c/${encodeURIComponent(String(id))}`,
  request: (view = 'kanban') => `${BASE}/campaigns/${view}/request`,
  metaInsights: () => `${BASE}/meta-insights`,
  googleInsights: () => `${BASE}/google-insights`,
  relatorio: () => `${BASE}/relatorio`,
  statusSettings: () => `${BASE}/settings/status`,
};

/**
 * @param {string} pathname — ex.: /paid-traffic/campaigns/kanban (React Router + HashRouter)
 */
export function parsePaidTrafficRoute(pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || BASE;
  if (!p.startsWith(BASE)) {
    return {
      trafficTab: 'dashboard',
      campaignView: 'kanban',
      overlay: null,
      editCampaignId: null,
      clientId: null,
      preview: false,
      redirectTo: paidTrafficPaths.dashboard(),
    };
  }
  const rest = p.length <= BASE.length ? '' : p.slice(BASE.length + 1);
  const parts = rest ? rest.split('/').filter(Boolean) : [];

  const out = {
    trafficTab: 'dashboard',
    campaignView: 'kanban',
    overlay: null,
    editCampaignId: null,
    clientId: null,
    preview: false,
    redirectTo: null,
  };

  if (parts.length === 0) {
    out.redirectTo = paidTrafficPaths.dashboard();
    return out;
  }

  const [a, b, c, d] = parts;

  if (a === 'preview') {
    out.preview = true;
    out.trafficTab = REDESIGN_TABS.has(b) ? b : 'visao';
    if (b === 'clientes' && c) out.clientId = decodeURIComponent(c);
    if (!b) out.redirectTo = `${BASE}/preview/visao`;
    return out;
  }

  if (REDESIGN_TABS.has(a)) {
    out.redirectTo = paidTrafficPaths.dashboard();
    return out;
  }

  if (a === 'dashboard') {
    out.trafficTab = 'dashboard';
    return out;
  }

  if (a === 'rotina') {
    out.trafficTab = 'rotina';
    return out;
  }

  if (a === 'fila') {
    out.trafficTab = 'fila';
    return out;
  }

  if (a === 'hoje') {
    out.trafficTab = 'hoje';
    return out;
  }

  if (a === 'situacao') {
    out.trafficTab = 'situacao';
    return out;
  }

  if (a === 'meta-insights') {
    out.trafficTab = 'meta-insights';
    return out;
  }

  if (a === 'google-insights') {
    out.trafficTab = 'google-insights';
    return out;
  }

  if (a === 'relatorio') {
    out.trafficTab = 'relatorio';
    return out;
  }

  if (a === 'settings' && b === 'status') {
    out.overlay = 'status';
    return out;
  }

  if (a !== 'campaigns') {
    out.redirectTo = paidTrafficPaths.dashboard();
    return out;
  }

  out.trafficTab = 'campaigns';

  if (b !== 'kanban' && b !== 'list') {
    out.redirectTo = paidTrafficPaths.campaignsKanban();
    return out;
  }

  out.campaignView = b;

  if (!c) {
    return out;
  }

  if (c === 'new') {
    out.overlay = 'form-new';
    return out;
  }

  if (c === 'request') {
    out.overlay = 'request';
    return out;
  }

  if (c === 'c' && d) {
    out.overlay = 'form-edit';
    out.editCampaignId = decodeURIComponent(d);
    return out;
  }

  out.redirectTo = `${BASE}/campaigns/${b}`;
  return out;
}
