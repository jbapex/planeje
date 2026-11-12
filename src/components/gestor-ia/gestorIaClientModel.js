import { buildClientEditUrl } from '@/lib/clientHubRoutes';
import { paidTrafficPaths } from '@/lib/paidTrafficRoutes';
import { number } from './GestorIaContext';
import { metricValue } from './gestorIaMetricModel';
import { goalAccountId } from './gestorIaMediaGoalData';

export const GESTOR_RASTREAMENTO_PATH = '/gestor-ia/rastreamento';

export const adPlatforms = [
  ['Meta Ads', 'metaAccounts', 'meta_account_id', 'meta_account_name'],
  ['Google Ads', 'googleAccounts', 'google_customer_id', 'google_customer_name'],
];

export function clientEditor(id, section) {
  return {
    pathname: buildClientEditUrl(encodeURIComponent(id)),
    search: section ? new URLSearchParams({ secao: section }).toString() : '',
  };
}

export function reportEditor(clientId, { since, until }) {
  return { pathname: paidTrafficPaths.relatorio(), search: new URLSearchParams({ cliente: clientId, desde: since, ate: until, origem: 'gestor-ia' }).toString() };
}

export function clientPage(id, searchParams, tab) {
  const params = new URLSearchParams(searchParams);
  for (const name of ['cliente', 'conta', 'tab', 'carteira_contas', 'editar_meta', 'decisao_origem', 'usar_memoria', 'versao_memoria', 'campanha']) params.delete(name);
  if (tab && tab !== 'metricas') params.set('tab', tab);
  return { pathname: `/gestor-ia/clientes/${encodeURIComponent(id)}`, search: params.toString() };
}

export function clientCampaignPage(clientId, accountId, period, campaignId) {
  const search = new URLSearchParams({ conta: accountId, periodo: 'custom', desde: period.since, ate: period.until,
    campanha: campaignId, mes_meta: period.since.slice(0, 7) });
  return { ...clientPage(clientId), search: search.toString() };
}

export function clientGoalPage(client, params, goal) {
  const path = clientPage(client.id, params, 'metas');
  if (!goal) return path;
  const account = client.metaAccounts?.find(({ meta_account_id }) => goalAccountId(meta_account_id) === goal.account_id);
  const search = new URLSearchParams(path.search);
  search.delete('mes_meta');
  if (account) search.set('conta', account.meta_account_id);
  return { ...path, search: search.toString() };
}

export function readClientTargets(client, canViewField) {
  return [
    ['meta_custo_mensagem', 'Custo por mensagem'], ['meta_custo_compra', 'Custo por compra'], ['roas_alvo', 'ROAS'],
  ].flatMap(([field, label]) => {
    const amount = canViewField?.(field) === true && metricValue(client, field);
    if (!(amount > 0)) return [];
    const value = field === 'roas_alvo' ? `${number(amount, 2)}×` : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    return [{ field, label, value, amount }];
  });
}

export function readClientGoalTargets(client, canViewField) {
  const goals = readClientTargets(client, canViewField);
  const objectiveVisible = canViewField?.('objetivo_meta') === true;
  const targetField = { mensagens: 'meta_custo_mensagem', compras: 'meta_custo_compra' }[client.objetivo_meta];
  const target = objectiveVisible ? goals.find((goal) => goal.field === targetField) : undefined;
  const limit = canViewField?.('valor') === true && canViewField?.('limite_meta') === true ? metricValue(client, 'limite_meta') : null;
  return { goals, target, limit, objectiveVisible };
}
