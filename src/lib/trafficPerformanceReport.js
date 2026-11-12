import { isAllowedThumbnailUrl, rewriteStoredThumbUrl } from './adThumbnail.js';
import { normalizeAccountInsights } from './trafegoFila.js';

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const OBJECTIVE_LABELS = {
  mensagens: 'Mensagens',
  leads: 'Leads',
  compras: 'Compras',
  trafego: 'Tráfego',
  engajamento: 'Engajamento',
  alcance: 'Alcance',
  app: 'App',
  outros: 'Outros',
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseYmd(value) {
  const match = YMD.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day, ymd: `${match[1]}-${match[2]}-${match[3]}`, stamp };
}

export function monthRange(ym) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    since: `${match[1]}-${match[2]}-01`,
    until: `${match[1]}-${match[2]}-${pad2(last)}`,
    year,
    month,
  };
}

/** Intervalo livre (data inicial e final). Aceita mês cheio ou recorte. */
export function dateRange(since, until) {
  const start = parseYmd(since);
  const end = parseYmd(until);
  if (!start || !end || start.stamp > end.stamp) return null;
  return {
    since: start.ymd,
    until: end.ymd,
    year: end.year,
    month: end.month,
  };
}

export function readReportPrefill(searchParams) {
  return {
    clientId: searchParams.get('cliente')?.trim() || '',
    period: dateRange(searchParams.get('desde'), searchParams.get('ate')),
  };
}

export function isFullMonthRange(range) {
  if (!range?.since || !range?.until) return false;
  const start = parseYmd(range.since);
  const end = parseYmd(range.until);
  if (!start || !end) return false;
  if (start.year !== end.year || start.month !== end.month || start.day !== 1) return false;
  const last = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
  return end.day === last;
}

/** Mês civil atual em America/Sao_Paulo. */
export function defaultReportPeriod(now = new Date()) {
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(now).slice(0, 7);
  return monthRange(ym);
}

export function periodKey(range) {
  if (!range?.since || !range?.until) return '';
  return `${range.since}_${range.until}`;
}

export function periodLabels(range) {
  if (!range) return { start: '', end: '', title: '' };
  const stamp = (ymd) => {
    const [year, month, day] = String(ymd).split('-');
    return `${day}.${month}.${year}`;
  };
  const start = stamp(range.since);
  const end = stamp(range.until);
  let title = `${start} a ${end}`;
  if (isFullMonthRange(range) && range.month >= 1 && range.month <= 12) {
    title = `${MONTHS[range.month - 1]} de ${range.year}`;
  }
  return { start, end, title };
}

export const REPORT_METRICS = [
  { key: 'reach', label: 'Alcance' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'result', label: 'Resultado' },
  { key: 'cost', label: 'Custo por resultado' },
  { key: 'spend', label: 'Investimento' },
  { key: 'messages', label: 'Mensagens iniciadas' },
  { key: 'leads', label: 'Leads' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
];

export const DEFAULT_VISIBLE_METRICS = ['reach', 'impressions', 'result', 'cost', 'spend'];

const METRIC_KEYS = new Set(REPORT_METRICS.map((item) => item.key));

export function normalizeVisibleMetrics(list) {
  const picked = [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || '').trim())
    .filter((key) => METRIC_KEYS.has(key)))];
  return picked.length ? picked : [...DEFAULT_VISIBLE_METRICS];
}

export function isMetricVisible(visible, key) {
  return normalizeVisibleMetrics(visible).includes(key);
}

export function toggleVisibleMetric(visible, key, on) {
  const current = normalizeVisibleMetrics(visible);
  if (!METRIC_KEYS.has(key)) return current;
  if (on) return normalizeVisibleMetrics([...current, key]);
  const next = current.filter((item) => item !== key);
  return next.length ? next : [...DEFAULT_VISIBLE_METRICS];
}

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('pt-BR');
}

export function formatMoney(value, currency = 'BRL') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency });
}

export function unitCost(spend, count) {
  const total = Number(spend);
  const results = Number(count);
  if (!Number.isFinite(total) || !Number.isFinite(results) || results <= 0) return null;
  return total / results;
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function objectiveLabel(objective) {
  const o = String(objective || '').toUpperCase();
  if (!o) return '';
  if (o.includes('MESSAGE') || o.includes('CONVERSATION')) return OBJECTIVE_LABELS.mensagens;
  if (o.includes('LEAD')) return OBJECTIVE_LABELS.leads;
  if (o.includes('SALE') || o.includes('PURCHASE') || o.includes('CATALOG') || o.includes('CONVERSION')) return OBJECTIVE_LABELS.compras;
  if (o.includes('TRAFFIC') || o.includes('LINK_CLICK')) return OBJECTIVE_LABELS.trafego;
  if (o.includes('ENGAGE') || o.includes('POST') || o.includes('PAGE_LIKE')) return OBJECTIVE_LABELS.engajamento;
  if (o.includes('AWARENESS') || o.includes('REACH') || o.includes('VIDEO') || o.includes('BRAND')) return OBJECTIVE_LABELS.alcance;
  if (o.includes('APP')) return OBJECTIVE_LABELS.app;
  return OBJECTIVE_LABELS.outros;
}

export function metricsFromInsight(row) {
  const base = normalizeAccountInsights(row || {});
  const plays = Array.isArray(row?.video_play_actions)
    ? row.video_play_actions.reduce((sum, item) => sum + (Number(item?.value) || 0), 0)
    : 0;
  const views = plays || base.videoViews || 0;
  return {
    ...base,
    views,
    viewCount: views > 0 ? views : base.impressions,
    viewLabel: views > 0 ? 'views' : 'impressões',
  };
}

export function reportResultSpec(resultLabel, totals = {}) {
  const folded = fold(resultLabel);
  if (/compr|venda|fatur|receita/.test(folded)) {
    return { key: 'purchases', label: 'Vendas', costLabel: 'Custo por Compra' };
  }
  if (/mensagem|whats|wpp|agend/.test(folded)) {
    return { key: 'messages', label: 'Mensagens iniciadas', costLabel: 'Custo por mensagem iniciada' };
  }
  if (/lead/.test(folded)) {
    return { key: 'leads', label: 'Leads', costLabel: 'Custo por Lead' };
  }
  const ranked = [
    ['purchases', Number(totals.purchases) || 0, 'Vendas', 'Custo por Compra'],
    ['leads', Number(totals.leads) || 0, 'Leads', 'Custo por Lead'],
    ['messages', Number(totals.messages) || 0, 'Mensagens iniciadas', 'Custo por mensagem iniciada'],
  ].sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0) {
    return { key: ranked[0][0], label: ranked[0][2], costLabel: ranked[0][3] };
  }
  return { key: 'leads', label: resultLabel || 'Resultados', costLabel: 'Custo por resultado' };
}

export function resultCount(metrics, key) {
  if (key === 'purchases') return Number(metrics?.purchases) || 0;
  if (key === 'messages') return Number(metrics?.messages) || 0;
  return Number(metrics?.leads) || 0;
}

function emptyTotals() {
  return {
    spend: 0, impressions: 0, clicks: 0, reach: 0, messages: 0, leads: 0,
    purchases: 0, purchaseValue: 0, views: 0,
  };
}

function addMetrics(target, metrics) {
  target.spend += metrics.spend || 0;
  target.impressions += metrics.impressions || 0;
  target.clicks += metrics.clicks || 0;
  target.reach += metrics.reach || 0;
  target.messages += metrics.messages || 0;
  target.leads += metrics.leads || 0;
  target.purchases += metrics.purchases || 0;
  target.purchaseValue += metrics.purchaseValue || 0;
  target.views += metrics.views || 0;
  return target;
}

export function reportAccountTotals(rows, measuredReach = false) {
  const totals = emptyTotals();
  for (const row of rows) addMetrics(totals, metricsFromInsight(row));
  if (measuredReach && (rows.length !== 1 || rows[0].reach == null)) totals.reach = null;
  return totals;
}

export function reportMetricNumber(totals, key) {
  if (key === 'ctr') return totals.impressions > 0 ? totals.clicks / totals.impressions : null;
  if (key === 'cpc') return unitCost(totals.spend, totals.clicks);
  return totals[key] ?? null;
}

function delivered(metrics) {
  return metrics.spend > 0 || metrics.impressions > 0 || metrics.reach > 0;
}

function chunk(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function mapCampaignInsight(row) {
  const metrics = metricsFromInsight(row);
  return {
    id: String(row?.campaign_id || row?.id || ''),
    name: String(row?.campaign_name || row?.name || 'Campanha'),
    objective: objectiveLabel(row?.objective),
    metrics,
  };
}

export function mapAdInsight(row) {
  const metrics = metricsFromInsight(row);
  return {
    id: String(row?.ad_id || row?.id || ''),
    name: String(row?.ad_name || row?.name || 'Anúncio'),
    campaignId: String(row?.campaign_id || ''),
    campaignName: String(row?.campaign_name || ''),
    metrics,
    thumbnailUrl: '',
  };
}

export function salesBlock({ vendas = [], metaPurchases = 0, metaPurchaseValue = 0, spend = 0 } = {}) {
  const rows = Array.isArray(vendas) ? vendas : [];
  const recorded = rows.reduce((sum, row) => sum + (Number(row?.valor_total) || 0), 0);
  const count = rows.length > 0 ? rows.length : Number(metaPurchases) || 0;
  const value = rows.length > 0 ? recorded : Number(metaPurchaseValue) || 0;
  return {
    count,
    value,
    ticket: count > 0 && value > 0 ? value / count : null,
    roi: spend > 0 && value > 0 ? value / spend : null,
    spend: Number(spend) || 0,
    source: rows.length > 0 ? 'vendas' : count > 0 || value > 0 ? 'meta' : 'none',
  };
}

export function routineNotes(reviews = []) {
  const done = [];
  const next = [];
  for (const row of reviews || []) {
    const week = row?.week_start || '';
    const analysis = String(row?.analysis || '').trim();
    const note = String(row?.data_note || '').trim();
    const title = String(row?.action_draft?.title || '').trim();
    if (analysis) done.push({ week, text: analysis });
    if (note) done.push({ week, text: note });
    if (title) next.push({ week, text: title });
  }
  return { done, next };
}

export function creativeUrls(ad) {
  const source = String(ad?.thumbnail_source_url || '').trim();
  const stored = rewriteStoredThumbUrl(ad?.thumbnail_stored_url || ad?.thumbnail_url || '');
  const live = source && isAllowedThumbnailUrl(source) ? source : '';
  return { thumbnailUrl: stored || live, fallbackUrl: stored && live && stored !== live ? live : '' };
}

export function coverIntro(clientName, monthTitle, resultLabel) {
  const who = String(clientName || 'o cliente').trim();
  const when = String(monthTitle || 'o período').trim();
  const what = String(resultLabel || 'resultado').trim().toLowerCase();
  return `Este relatório reúne as campanhas de tráfego pago de ${who}, o resultado de ${when} e os criativos que mais geraram ${what}.`;
}

function decorate(metrics, resultKey) {
  const result = resultCount(metrics, resultKey);
  return {
    ...metrics,
    result,
    cost: unitCost(metrics.spend, result),
  };
}

export function buildPerformanceReport({
  clientName = '',
  range = null,
  resultLabel = '',
  accountRows = [],
  campaignRows = [],
  adRows = [],
  vendas = [],
  reviews = [],
  accountNote = '',
  savedMeta = null,
  currency = 'BRL',
} = {}) {
  const labels = periodLabels(range);
  const totals = reportAccountTotals(accountRows || [], Boolean(savedMeta));
  const result = reportResultSpec(resultLabel, totals);
  const campaigns = (campaignRows || [])
    .map((row) => {
      const campaign = mapCampaignInsight(row);
      if (savedMeta && row.reach == null) campaign.metrics.reach = null;
      return campaign;
    })
    .filter((row) => row.id && delivered(row.metrics))
    .map((row) => ({ ...row, ...decorate(row.metrics, result.key), creatives: [] }))
    .sort((a, b) => b.result - a.result || b.spend - a.spend);

  const ads = (adRows || [])
    .map(mapAdInsight)
    .filter((row) => row.id && delivered(row.metrics))
    .map((row) => ({ ...row, ...decorate(row.metrics, result.key) }))
    .sort((a, b) => b.result - a.result || b.viewCount - a.viewCount || b.spend - a.spend);

  const used = new Set();
  const perCampaign = campaigns.length >= 2 || Boolean(savedMeta && campaigns.length);
  const campaignSlides = campaigns.map((campaign) => {
    if (!perCampaign) return { ...campaign, creatives: [] };
    const creatives = ads.filter((ad) => ad.campaignId === campaign.id && !used.has(ad.id)).slice(0, 2);
    creatives.forEach((ad) => used.add(ad.id));
    return { ...campaign, creatives };
  });
  const gallerySource = perCampaign ? ads.filter((ad) => !used.has(ad.id)) : ads;

  const decoratedTotals = decorate(totals, result.key);
  const sales = salesBlock({
    vendas,
    metaPurchases: totals.purchases,
    metaPurchaseValue: totals.purchaseValue,
    spend: totals.spend,
  });
  if (savedMeta && sales.source === 'vendas') sales.roi = null;
  const notes = routineNotes(reviews);

  return {
    clientName: String(clientName || '').trim(),
    range,
    labels,
    result,
    currency,
    savedMeta,
    intro: coverIntro(clientName, labels.title, result.label),
    totals: decoratedTotals,
    campaigns: campaignSlides,
    gallery: chunk(gallerySource, 3),
    sales,
    notes,
    accountNote: String(accountNote || '').trim(),
    showCampaignSlides: perCampaign,
    showSales: sales.source !== 'none',
    showNotes: false,
  };
}
