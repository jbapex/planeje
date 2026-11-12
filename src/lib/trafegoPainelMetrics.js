/** Métricas e colunas personalizáveis do Painel de tráfego. */

import { entityResultLine, extractEntityMetrics } from '@/lib/clienteMetaSnapshot';
import { formatMoney, normalizeAccountInsights } from '@/lib/trafegoFila';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function insightRow(item) {
  const raw = item?.insights?.data?.[0] || item?.insights?.[0] || item?.insights || {};
  return raw && !Array.isArray(raw) ? raw : {};
}

function sumActionTypes(actions, types) {
  if (!Array.isArray(actions)) return 0;
  const wanted = (types || []).map((t) => String(t).toLowerCase());
  let total = 0;
  for (const action of actions) {
    const t = String(action?.action_type || '').toLowerCase();
    if (wanted.some((w) => t === w || t.includes(w))) {
      total += num(action?.value);
    }
  }
  return total;
}

function sumProfileVisitActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    const t = String(action?.action_type || '').toLowerCase();
    if (t.includes('profile') && (t.includes('visit') || t.includes('view')) && !t.includes('follow')) {
      total += num(action?.value);
    }
  }
  return total;
}

function isProfileVisitOptimization(item) {
  const goal = String(item?.optimization_goal || '').toLowerCase();
  return (
    goal.includes('profile_visit') ||
    goal.includes('visit_instagram') ||
    goal.includes('instagram_profile') ||
    goal === 'profile_visit'
  );
}

const CONVERSATION_TYPES = [
  'messaging_conversation_started',
  'onsite_messaging_conversation_started',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_messaging_conversation',
  'messaging_conversation',
];

const CONTACT_TYPES = [
  'click_to_call',
  'contact',
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
  'onsite_conversion.total_messaging_connection',
];

const PROFILE_VISIT_TYPES = [
  'profile_visit',
  'profile_visits',
  'instagram_profile_visit',
  'instagram_profile_visits',
  'omni_profile_visit',
  'onsite_conversion.profile_visit',
  'onsite_conversion.profile_visit_view',
  'onsite_conversion.profile_visits',
];

/** Campos de insights pedidos à Meta para o Painel (inclui visitas ao perfil). */
export const PAINEL_META_INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'results',
  'instagram_profile_visits',
  'actions',
  'action_values',
];

function insightScalar(ins, key) {
  const v = ins?.[key];
  if (v === undefined || v === null || v === '') return 0;
  if (Array.isArray(v)) {
    if (v[0]?.value != null) return num(v[0].value);
    return 0;
  }
  return num(v);
}

function profileVisitsFromInsight(ins, item, actions, metaResults) {
  const direct =
    insightScalar(ins, 'instagram_profile_visits') ||
    sumActionTypes(actions, PROFILE_VISIT_TYPES) ||
    sumProfileVisitActions(actions);
  if (direct > 0) return direct;
  if (metaResults > 0 && isProfileVisitOptimization(item)) return metaResults;
  return 0;
}

const FOLLOWER_TYPES = ['follow', 'page_like', 'onsite_conversion.follow', 'like'];

export function extractPainelMetrics(item) {
  const ins = insightRow(item);
  const actions = ins.actions || [];
  const base = normalizeAccountInsights(ins);
  const spend = num(base.spend);
  const impressions = num(base.impressions);
  const clicks = num(base.clicks);
  const conversations = sumActionTypes(actions, CONVERSATION_TYPES) || num(base.messages);
  const contacts = sumActionTypes(actions, CONTACT_TYPES);
  const leads = num(base.leads) || sumActionTypes(actions, ['lead', 'onsite_conversion.lead']);
  const purchases = num(base.purchases);
  const videoViews = num(base.videoViews) || sumActionTypes(actions, ['video_view']);
  const metaResults = num(ins.results);
  const profileVisits = profileVisitsFromInsight(ins, item, actions, metaResults);
  const followers = sumActionTypes(actions, FOLLOWER_TYPES);

  return {
    spend,
    impressions,
    clicks,
    reach: num(base.reach),
    engagements: num(base.engagements),
    conversations,
    contacts,
    leads,
    purchases,
    purchaseValue: num(base.purchaseValue),
    videoViews,
    profileVisits,
    followers,
    metaResults,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    costPerConversation: conversations > 0 ? spend / conversations : 0,
    costPerLead: leads > 0 ? spend / leads : 0,
    costPerPurchase: purchases > 0 ? spend / purchases : 0,
    roas: spend > 0 ? num(base.purchaseValue) / spend : 0,
  };
}

export const PAINEL_COLUMN_GROUPS = ['Operação', 'Investimento', 'Resultados'];

export const PAINEL_COLUMNS = [
  { key: 'ligado', label: 'Ligado', group: 'Operação', fixed: true },
  { key: 'nome', label: 'Campanha / conjunto', group: 'Operação', fixed: true },
  {
    key: 'veiculacao',
    label: 'Veiculação',
    group: 'Operação',
    tip: 'Status de entrega na Meta (no ar, pausado, com problema).',
  },
  { key: 'objetivo', label: 'Objetivo', group: 'Operação', tip: 'Objetivo configurado na campanha.' },
  {
    key: 'publicos',
    label: 'Públicos',
    group: 'Operação',
    tip: 'Segmentação do conjunto de anúncios.',
  },
  { key: 'verba', label: 'Verba', group: 'Operação', tip: 'Alterar orçamento diário do conjunto.' },
  { key: 'gasto', label: 'Gasto', group: 'Investimento', tip: 'Investimento no período selecionado.' },
  { key: 'cpm', label: 'CPM', group: 'Investimento', tip: 'Custo por mil impressões.' },
  { key: 'cpc', label: 'CPC', group: 'Investimento', tip: 'Custo por clique.' },
  { key: 'ctr', label: 'CTR', group: 'Investimento', tip: 'Taxa de cliques sobre impressões.' },
  {
    key: 'vv',
    label: 'VV (visualizações)',
    group: 'Resultados',
    tip: 'Visualizações de vídeo reportadas pela Meta.',
  },
  {
    key: 'conversas',
    label: 'Conversas iniciadas',
    group: 'Resultados',
    tip: 'Conversas por mensagem iniciadas no período.',
  },
  {
    key: 'contatos',
    label: 'Contatos iniciados',
    group: 'Resultados',
    tip: 'Primeiro contato ou clique para conversar (WhatsApp/ligação).',
  },
  { key: 'leads', label: 'Leads', group: 'Resultados', tip: 'Total de leads no período.' },
  { key: 'compras', label: 'Conversões (compras)', group: 'Resultados', tip: 'Compras atribuídas.' },
  {
    key: 'valor_compra',
    label: 'Valor da compra',
    group: 'Resultados',
    tip: 'Receita atribuída às compras no período (action_values purchase/omni_purchase).',
  },
  {
    key: 'custo_conversa',
    label: 'Custo por conversa iniciada',
    group: 'Resultados',
    tip: 'Gasto dividido pelas conversas iniciadas.',
  },
  { key: 'custo_lead', label: 'Custo por lead', group: 'Resultados', tip: 'Gasto dividido pelos leads.' },
  {
    key: 'custo_conversao',
    label: 'Custo por conversão',
    group: 'Resultados',
    tip: 'Gasto dividido pelas compras.',
  },
  {
    key: 'visitas_perfil',
    label: 'Visitas ao perfil',
    group: 'Resultados',
    tip: 'Visitas ao perfil do Instagram após interação com o anúncio (métrica instagram_profile_visits da Meta).',
  },
  {
    key: 'seguidores',
    label: 'Novos seguidores',
    group: 'Resultados',
    tip: 'Curtidas/seguir página ou perfil.',
  },
  {
    key: 'resultado_meta',
    label: 'Resultado Meta',
    group: 'Resultados',
    tip: 'Campo oficial results quando a Meta envia.',
  },
  {
    key: 'resultado_resumo',
    label: 'Resultado resumido',
    group: 'Resultados',
    tip: 'Linha automática por objetivo (msgs, leads, cliques…).',
  },
  { key: 'roas', label: 'ROAS', group: 'Resultados', tip: 'Retorno sobre investimento em compras.' },
];

export const DEFAULT_PAINEL_COLUMNS = [
  'ligado',
  'nome',
  'veiculacao',
  'gasto',
  'visitas_perfil',
  'conversas',
  'custo_conversa',
  'leads',
  'compras',
  'valor_compra',
  'vv',
];

const COLUMN_MAP = Object.fromEntries(PAINEL_COLUMNS.map((c) => [c.key, c]));

export function normalizePainelColumnKeys(keys) {
  const list = Array.isArray(keys) ? keys : [];
  const fixed = PAINEL_COLUMNS.filter((c) => c.fixed).map((c) => c.key);
  const merged = [...fixed];
  const source = list.length ? list : DEFAULT_PAINEL_COLUMNS;
  for (const key of source) {
    if (COLUMN_MAP[key] && !merged.includes(key)) merged.push(key);
  }
  return merged.filter((key) => COLUMN_MAP[key]);
}

function fmtNumber(n) {
  return num(n).toLocaleString('pt-BR');
}

function fmtPct(n) {
  return `${num(n).toFixed(2).replace('.', ',')}%`;
}

function fmtMoneyOrDash(n) {
  if (!n || n <= 0) return '—';
  return formatMoney(n);
}

export function formatPainelMetricValue(key, metrics) {
  switch (key) {
    case 'gasto':
      return fmtMoneyOrDash(metrics.spend);
    case 'cpm':
      return metrics.impressions > 0 ? fmtMoneyOrDash(metrics.cpm) : '—';
    case 'cpc':
      return metrics.clicks > 0 ? fmtMoneyOrDash(metrics.cpc) : '—';
    case 'ctr':
      return metrics.impressions > 0 ? fmtPct(metrics.ctr) : '—';
    case 'vv':
      return metrics.videoViews > 0 ? fmtNumber(metrics.videoViews) : '—';
    case 'conversas':
      return metrics.conversations > 0 ? fmtNumber(metrics.conversations) : '—';
    case 'contatos':
      return metrics.contacts > 0 ? fmtNumber(metrics.contacts) : '—';
    case 'leads':
      return metrics.leads > 0 ? fmtNumber(metrics.leads) : '—';
    case 'compras':
      return metrics.purchases > 0 ? fmtNumber(metrics.purchases) : '—';
    case 'valor_compra':
      return metrics.purchaseValue > 0 ? fmtMoneyOrDash(metrics.purchaseValue) : '—';
    case 'custo_conversa':
      return metrics.conversations > 0 ? fmtMoneyOrDash(metrics.costPerConversation) : '—';
    case 'custo_lead':
      return metrics.leads > 0 ? fmtMoneyOrDash(metrics.costPerLead) : '—';
    case 'custo_conversao':
      return metrics.purchases > 0 ? fmtMoneyOrDash(metrics.costPerPurchase) : '—';
    case 'visitas_perfil':
      return metrics.profileVisits > 0 ? fmtNumber(metrics.profileVisits) : '—';
    case 'seguidores':
      return metrics.followers > 0 ? fmtNumber(metrics.followers) : '—';
    case 'resultado_meta':
      return metrics.metaResults > 0 ? fmtNumber(metrics.metaResults) : '—';
    case 'roas':
      return metrics.purchases > 0 && metrics.roas > 0 ? `${metrics.roas.toFixed(2).replace('.', ',')}x` : '—';
    default:
      return '—';
  }
}

export function painelMetricForItem(key, item, objective) {
  if (key === 'resultado_resumo') {
    return entityResultLine(objective || item.campaign_objective || item.objective, extractEntityMetrics(item)).line;
  }
  const metrics = extractPainelMetrics(item);
  return formatPainelMetricValue(key, metrics);
}

export function isPainelStructuralColumn(key) {
  return ['ligado', 'nome', 'veiculacao', 'objetivo', 'publicos', 'verba'].includes(key);
}
