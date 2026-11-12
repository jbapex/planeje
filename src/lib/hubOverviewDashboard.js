/**
 * Cockpit da Visão geral: investimento, conversas Meta vs reais, funil e série diária.
 * Espelha o produto TRACK sem copiar o núcleo PalmUP.
 */
import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { isoYmdToLocalDate, localDateToIsoYmd } from './contatosMessagePeriod.js';
import { ymdInSaoPaulo } from './rastreamentoPeriod.js';
import { actionMetric } from './metaInsightFields.js';
import { activeJourneyEvents, conversionEventLabel } from './rastreamentoConversionRules.js';

export const META_CONVERSATION_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_conversation_started',
  'onsite_messaging_conversation_started',
  'messaging_conversation_started',
];

export const CHECKOUT_ACTION_TYPES = [
  'omni_initiated_checkout',
  'offsite_conversion.fb_pixel_initiate_checkout',
  'onsite_conversion.initiate_checkout',
  'onsite_web_initiate_checkout',
  'initiate_checkout',
];

export const FUNNEL_STAGE_COLORS = ['#5eead4', '#0f766e', '#38bdf8', '#3b82f6', '#a78bfa', '#f59e0b'];

export const CAPI_EVENT_COUNT_ALIASES = {
  InitiateCheckout: ['InitiateCheckout', 'initiate_checkout', 'event_initiate_checkout'],
};

export function funnelStageColor(index) {
  return FUNNEL_STAGE_COLORS[index % FUNNEL_STAGE_COLORS.length];
}

export function funnelBadgeInk(color) {
  const hex = String(color || '').replace('#', '');
  if (hex.length !== 6) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55 ? '#04202a' : '#fff';
}

export function canonicalCapiEventName(name) {
  const raw = String(name || '').trim();
  for (const [canonical, aliases] of Object.entries(CAPI_EVENT_COUNT_ALIASES)) {
    if (aliases.includes(raw)) return canonical;
  }
  return raw;
}

export const FUNNEL_COST_LABELS = {
  meta: 'Custo por conversa Meta',
  real: 'Custo por lead',
  qual: 'Custo por lead qualificado',
  buy: 'Custo por compra',
  checkout: 'Custo por checkout iniciado',
};

export function countActionsByTypes(actions, types) {
  for (const type of types) {
    const value = actionMetric(actions, [type]);
    if (value > 0) return value;
  }
  return 0;
}

export function metaConversationsFromActions(actions) {
  return countActionsByTypes(actions, META_CONVERSATION_ACTION_TYPES);
}

export function checkoutsFromActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let best = 0;
  for (const item of actions) {
    const type = String(item?.action_type || '').toLowerCase();
    if (!type.includes('initiate_checkout')) continue;
    const n = Number(item?.value) || 0;
    if (n > best) best = n;
  }
  return best || countActionsByTypes(actions, CHECKOUT_ACTION_TYPES);
}

export function formatOverviewMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function funnelStageCaption(index, stages) {
  if (index === 0) return 'Base do funil';
  const previous = Number(stages[index - 1]?.value) || 0;
  if (previous <= 0) return 'Sem base anterior';
  const rate = Math.round(((Number(stages[index]?.value) || 0) / previous) * 100);
  return `${rate}% da etapa anterior`;
}

export function buildFunnelPaths(values, { width = 1000, height = 176 } = {}) {
  const stages = Array.isArray(values) ? values : [];
  const count = Math.max(stages.length, 1);
  const centerY = height / 2;
  const maxHalf = centerY - 14;
  const minHalf = 10;
  const visualBase = Math.max(Number(stages[0]) || 0, 1);
  const half = (value) =>
    Math.max(minHalf, Math.round(Math.min((Number(value) || 0) / visualBase, 1) * maxHalf));
  const boundaries = stages.map(half);
  const last = boundaries[boundaries.length - 1] ?? minHalf;
  boundaries.push(Math.max(6, Math.round(last * 0.52)));
  const segmentWidth = width / count;
  return stages.map((_, index) => {
    const startX = index * segmentWidth;
    const endX = (index + 1) * segmentWidth;
    const middleX = startX + segmentWidth / 2;
    const leftH = boundaries[index] ?? minHalf;
    const rightH = boundaries[index + 1] ?? minHalf;
    return {
      d: [
        `M ${startX} ${centerY - leftH}`,
        `C ${middleX} ${centerY - leftH} ${middleX} ${centerY - rightH} ${endX} ${centerY - rightH}`,
        `L ${endX} ${centerY + rightH}`,
        `C ${middleX} ${centerY + rightH} ${middleX} ${centerY + leftH} ${startX} ${centerY + leftH}`,
        'Z',
      ].join(' '),
      color: funnelStageColor(index),
    };
  });
}

export function localYmdFromTimestamp(value) {
  return ymdInSaoPaulo(value);
}

export function enumerateDays(sinceYmd, untilYmd) {
  const start = isoYmdToLocalDate(sinceYmd);
  const end = isoYmdToLocalDate(untilYmd);
  if (!start || !end || end < start) return [];
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(localDateToIsoYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function costPer(spend, count) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return (Number(spend) || 0) / n;
}

export function trackingRatePercent(real, meta) {
  const m = Number(meta) || 0;
  if (m <= 0) return null;
  return Math.round(((Number(real) || 0) / m) * 100);
}

export function formatRoasX(roas) {
  const n = Number(roas);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toFixed(2)}x`;
}

export function dailyDifferenceLabel(metaTotal, realTotal) {
  const difference = (Number(metaTotal) || 0) - (Number(realTotal) || 0);
  if (difference === 0) return 'Volumes iguais no período';
  if (difference > 0) {
    return `${difference} ${difference === 1 ? 'conversa' : 'conversas'} a mais na Meta`;
  }
  const extra = Math.abs(difference);
  return `${extra} ${extra === 1 ? 'conversa real' : 'conversas reais'} a mais`;
}

export function summarizeOverviewContacts(rows) {
  let realConversations = 0;
  let qualificados = 0;
  let vendas = 0;
  let valorTotal = 0;
  const realByDay = new Map();

  for (const row of rows || []) {
    if (!isMetaAdsContactForStats(row)) continue;
    realConversations += 1;
    if (row.qualificado === true) qualificados += 1;
    if (row.comprou === true) {
      vendas += 1;
      valorTotal += parseFloat(String(row.valor_venda ?? 0)) || 0;
    }
    const day = localYmdFromTimestamp(row.first_seen_at);
    if (!day) continue;
    realByDay.set(day, (realByDay.get(day) || 0) + 1);
  }

  return { realConversations, qualificados, vendas, valorTotal, realByDay };
}

export function aggregateInsightRows(rows) {
  const byDay = new Map();
  let spend = 0;
  let metaConversations = 0;
  let checkouts = 0;
  for (const row of rows || []) {
    const daySpend = Number(row?.spend) || 0;
    const dayMeta = metaConversationsFromActions(row?.actions);
    const dayCheckout = checkoutsFromActions(row?.actions);
    spend += daySpend;
    metaConversations += dayMeta;
    checkouts += dayCheckout;
    const day = String(row?.date_start || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const prev = byDay.get(day) || { spend: 0, metaConversations: 0 };
    prev.spend += daySpend;
    prev.metaConversations += dayMeta;
    byDay.set(day, prev);
  }
  return { spend, metaConversations, checkouts, byDay };
}

export function buildDailyComparison(days, metaByDay, realByDay) {
  return (days || []).map((date) => {
    const meta = metaByDay instanceof Map ? metaByDay.get(date) : metaByDay?.[date];
    return {
      date,
      metaConversations: Number(meta?.metaConversations) || 0,
      realConversations: Number(realByDay instanceof Map ? realByDay.get(date) : realByDay?.[date]) || 0,
      spend: Number(meta?.spend) || 0,
    };
  });
}

export function countJourneyEvent(eventName, { capiCounts = {}, contacts = {}, insightsCheckouts = 0 } = {}) {
  const capi = Number(capiCounts?.[eventName]) || 0;
  if (eventName === 'InitiateCheckout') return capi > 0 ? capi : Number(insightsCheckouts) || 0;
  if (eventName === 'QualifiedLead') return capi > 0 ? capi : Number(contacts.qualificados) || 0;
  if (eventName === 'Purchase') return capi > 0 ? capi : Number(contacts.vendas) || 0;
  return capi;
}

export function buildOverviewFunnel({
  spend = 0,
  metaConversations = 0,
  realConversations = 0,
  journey = [],
} = {}) {
  const stages = [
    {
      key: 'meta',
      label: 'Conversas Meta',
      costLabel: FUNNEL_COST_LABELS.meta,
      value: metaConversations,
      cost: costPer(spend, metaConversations),
    },
    {
      key: 'real',
      label: 'Conversas reais iniciadas',
      costLabel: FUNNEL_COST_LABELS.real,
      value: realConversations,
      cost: costPer(spend, realConversations),
    },
  ];
  for (const item of journey || []) {
    const label = item.label || conversionEventLabel(item.eventName);
    stages.push({
      key: `event:${item.eventName}`,
      eventName: item.eventName,
      label,
      hint: item.hint || '',
      costLabel: `Custo por ${label}`,
      value: Number(item.value) || 0,
      cost: costPer(spend, item.value),
    });
  }
  return stages;
}

export function buildOverviewDashboard({
  since,
  until,
  insightRows = [],
  contactRows = [],
  checkoutCount = 0,
  activeRules = [],
  capiCounts = {},
} = {}) {
  const days = enumerateDays(since, until);
  const insights = aggregateInsightRows(insightRows);
  const contacts = summarizeOverviewContacts(contactRows);
  const points = buildDailyComparison(days, insights.byDay, contacts.realByDay);
  const spend = insights.spend;
  const insightsCheckouts = Number(checkoutCount) > 0 ? Number(checkoutCount) : insights.checkouts || 0;
  const journey = activeJourneyEvents(activeRules).map((item) => ({
    ...item,
    value: countJourneyEvent(item.eventName, { capiCounts, contacts, insightsCheckouts }),
  }));
  const funnel = buildOverviewFunnel({
    spend,
    metaConversations: insights.metaConversations,
    realConversations: contacts.realConversations,
    journey,
  });
  const checkouts = journey.find((item) => item.eventName === 'InitiateCheckout')?.value ?? 0;
  const roas = spend > 0 ? contacts.valorTotal / spend : 0;
  return {
    spend,
    metaConversations: insights.metaConversations,
    realConversations: contacts.realConversations,
    qualificados: contacts.qualificados,
    vendas: contacts.vendas,
    checkouts,
    valorTotal: contacts.valorTotal,
    cpl: costPer(spend, contacts.realConversations),
    roas,
    trackedRate: trackingRatePercent(contacts.realConversations, insights.metaConversations),
    funnel,
    points,
    metaDailyTotal: points.reduce((sum, row) => sum + row.metaConversations, 0),
    realDailyTotal: points.reduce((sum, row) => sum + row.realConversations, 0),
  };
}

export async function fetchHubOverviewContacts(client, { clienteId, sinceIso, untilIso }) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from('cliente_whatsapp_contact')
      .select(
        'first_seen_at, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data, qualificado, comprou, valor_venda',
      )
      .eq('cliente_id', clienteId)
      .gte('first_seen_at', sinceIso)
      .lte('first_seen_at', untilIso)
      .range(from, from + 999);
    if (error) return { rows, error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
    if (from > 20000) break;
  }
  return { rows, error: null };
}

function capiNamesForQuery(eventNames) {
  const names = new Set();
  for (const eventName of eventNames || []) {
    const aliases = CAPI_EVENT_COUNT_ALIASES[eventName] || [eventName];
    aliases.forEach((alias) => names.add(alias));
  }
  return [...names];
}

function countCapiRows(rows, eventNames) {
  const counts = Object.fromEntries((eventNames || []).map((name) => [name, 0]));
  for (const row of rows || []) {
    const canonical = canonicalCapiEventName(row.event_name);
    if (canonical in counts) counts[canonical] += 1;
  }
  return counts;
}

export async function fetchHubCapiEventCounts(client, { clienteId, sinceIso, untilIso, eventNames }) {
  const wanted = [...new Set((eventNames || []).filter(Boolean))];
  if (!wanted.length) return { counts: {}, error: null };
  const queryNames = capiNamesForQuery(wanted);
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from('meta_conversion_event_log')
      .select('event_name')
      .eq('cliente_id', clienteId)
      .eq('success', true)
      .in('event_name', queryNames)
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso)
      .range(from, from + 999);
    if (error) return { counts: countCapiRows(rows, wanted), error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
    if (from > 20000) break;
  }
  return { counts: countCapiRows(rows, wanted), error: null };
}

export async function fetchHubCheckoutCount(client, { clienteId, sinceIso, untilIso }) {
  const { counts, error } = await fetchHubCapiEventCounts(client, {
    clienteId,
    sinceIso,
    untilIso,
    eventNames: ['InitiateCheckout'],
  });
  return { count: counts.InitiateCheckout || 0, error };
}

export async function fetchHubDailyInsights(invokeFn, { clienteId, adAccountIds, since, until }) {
  const ids = Array.isArray(adAccountIds) ? adAccountIds : [];
  if (!ids.length) return { rows: [], errors: [] };

  const results = await Promise.all(
    ids.map(async (adAccountId) => {
      const body = {
        action: 'get-campaign-insights',
        cliente_id: clienteId,
        ad_account_id: adAccountId,
        time_range: { since, until },
        metrics: ['spend', 'actions'],
        level: 'account',
        time_increment: 1,
        limit: 500,
      };
      const first = await invokeFn('meta-ads-api', { body });
      if (!first?.error && !first?.data?.error?.message) {
        return { rows: Array.isArray(first?.data?.campaigns) ? first.data.campaigns : [], error: null };
      }
      const fallback = await invokeFn('meta-ads-api', {
        body: { ...body, level: 'campaign' },
      });
      const err =
        fallback?.error?.message ||
        fallback?.data?.error?.message ||
        first?.error?.message ||
        first?.data?.error?.message ||
        null;
      return {
        rows: Array.isArray(fallback?.data?.campaigns) ? fallback.data.campaigns : [],
        error: fallback?.data?.campaigns?.length ? null : err,
      };
    }),
  );

  return {
    rows: results.flatMap((row) => row.rows),
    errors: results.map((row) => row.error).filter(Boolean),
  };
}
