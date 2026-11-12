import { campaignRates } from './googleAdsInsightsView.js';
import { formatCount, formatMoney, periodLabels } from './trafficPerformanceReport.js';

export const GOOGLE_REPORT_METRICS = [
  { key: 'impressions', label: 'Impressões' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'spend', label: 'Investimento' },
  { key: 'conversions', label: 'Conversões' },
  { key: 'cost', label: 'Custo por conversão' },
  { key: 'value', label: 'Valor das conversões' },
  { key: 'roas', label: 'ROAS' },
];

const LEGACY_GOOGLE_METRICS = ['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'cost'];

export const DEFAULT_VISIBLE_GOOGLE_METRICS = GOOGLE_REPORT_METRICS.map((item) => item.key);

const GOOGLE_KEYS = new Set(GOOGLE_REPORT_METRICS.map((item) => item.key));

export function normalizeVisibleGoogleMetrics(list) {
  const picked = [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || '').trim())
    .filter((key) => GOOGLE_KEYS.has(key)))];
  if (!picked.length) return [...DEFAULT_VISIBLE_GOOGLE_METRICS];
  const legacy = LEGACY_GOOGLE_METRICS.every((key) => picked.includes(key)) && picked.length === LEGACY_GOOGLE_METRICS.length;
  return legacy ? [...DEFAULT_VISIBLE_GOOGLE_METRICS] : picked;
}

export function isGoogleMetricVisible(visible, key) {
  return normalizeVisibleGoogleMetrics(visible).includes(key);
}

export function toggleVisibleGoogleMetric(visible, key, on) {
  const current = normalizeVisibleGoogleMetrics(visible);
  if (!GOOGLE_KEYS.has(key)) return current;
  if (on) return normalizeVisibleGoogleMetrics([...current, key]);
  const next = current.filter((item) => item !== key);
  return next.length ? next : [...DEFAULT_VISIBLE_GOOGLE_METRICS];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function formatRoas(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatGoogleMetric(key, row) {
  if (key === 'ctr') return formatPercent(row?.ctr);
  if (key === 'roas') return formatRoas(row?.roas);
  if (key === 'spend' || key === 'cost' || key === 'cpc' || key === 'value') {
    return row?.[key] == null ? '—' : formatMoney(row[key]);
  }
  return formatCount(row?.[key]);
}

const MATCH_LABEL = { EXACT: 'Exata', PHRASE: 'Frase', BROAD: 'Ampla' };

const CHANNEL_KIND = {
  SEARCH: 'Pesquisa',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Vídeo',
  PERFORMANCE_MAX: 'Performance Max',
  DEMAND_GEN: 'Demand Gen',
  DISCOVERY: 'Demand Gen',
  LOCAL: 'Local',
  SMART: 'Smart',
  MULTI_CHANNEL: 'Várias redes',
};

export function googleChannelKind(value) {
  const key = String(value || '').trim().toUpperCase();
  return CHANNEL_KIND[key] || '';
}

function delivered(row) {
  return num(row?.impressions) + num(row?.clicks) + num(row?.spend) + num(row?.conversions) > 0;
}

export function collectGoogleEvidence(details) {
  const keywords = new Map();
  const ads = [];
  const groups = new Map();
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail) continue;
    for (const row of detail.keywords || []) {
      const text = String(row.text || '').trim();
      if (!text) continue;
      const matchType = String(row.matchType || '');
      const key = `${text.toLowerCase()}|${matchType}`;
      const prev = keywords.get(key) || {
        text,
        match: MATCH_LABEL[matchType] || matchType || '—',
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
      };
      prev.impressions += num(row.impressions);
      prev.clicks += num(row.clicks);
      prev.spend += num(row.spend);
      prev.conversions += num(row.conversions);
      keywords.set(key, prev);
    }
    for (const row of detail.ads || []) {
      const headlines = Array.isArray(row.headlines) ? row.headlines.filter(Boolean) : [];
      const title = headlines[0] || String(row.name || '').trim();
      if (!title && !delivered(row)) continue;
      ads.push({
        id: String(row.id || ads.length),
        title: title || 'Anúncio sem título',
        group: String(row.adGroupName || '').trim(),
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        spend: num(row.spend),
        conversions: num(row.conversions),
      });
    }
    for (const row of detail.adGroups || []) pushGroup(groups, row, 'Grupo');
    for (const row of detail.assetGroups || []) pushGroup(groups, row, 'Performance Max');
  }
  const byClicks = (a, b) => b.clicks - a.clicks || b.spend - a.spend;
  const bySpend = (a, b) => b.spend - a.spend || b.clicks - a.clicks;
  return {
    keywords: [...keywords.values()].filter(delivered).sort(byClicks).slice(0, 12),
    ads: ads.filter(delivered).sort(byClicks).slice(0, 8),
    groups: [...groups.values()].filter(delivered).sort(bySpend).slice(0, 10),
  };
}

function pushGroup(groups, row, kind) {
  const name = String(row?.name || '').trim();
  if (!name) return;
  const key = `${kind}|${name.toLowerCase()}`;
  const prev = groups.get(key) || { name, kind, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
  prev.impressions += num(row.impressions);
  prev.clicks += num(row.clicks);
  prev.spend += num(row.spend);
  prev.conversions += num(row.conversions);
  groups.set(key, prev);
}

export function foldGoogleDaily(accounts) {
  const byDate = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    for (const point of account?.daily || []) {
      const date = String(point?.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const prev = byDate.get(date) || { date, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      prev.spend += num(point.spend);
      prev.clicks += num(point.clicks);
      prev.impressions += num(point.impressions);
      prev.conversions += num(point.conversions);
      byDate.set(date, prev);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function googleCampaignPages(campaigns, size = 8) {
  const rows = Array.isArray(campaigns) ? campaigns : [];
  const pages = [];
  for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size));
  return pages;
}

export function buildGoogleReport({ clientName, range, accounts, note = '' }) {
  const linked = Array.isArray(accounts) ? accounts : [];
  const campaigns = [];
  for (const account of linked) {
    const accountName = account?.name || account?.id || 'Google Ads';
    for (const row of account?.campaigns || []) {
      const impressions = num(row.impressions);
      const clicks = num(row.clicks);
      const spend = num(row.spend);
      const conversions = num(row.conversions);
      const value = num(row.conversionValue);
      if (impressions + clicks + spend + conversions + value <= 0) continue;
      const rates = campaignRates({ spend, clicks, impressions, conversions });
      campaigns.push({
        id: `${account.id || 'conta'}-${row.id || campaigns.length}`,
        sourceId: String(row.id || ''),
        customerId: String(account.id || ''),
        name: linked.length > 1 ? `${row.name || 'Campanha'} · ${accountName}` : (row.name || 'Campanha'),
        kind: googleChannelKind(row.channelType),
        impressions,
        clicks,
        spend,
        conversions,
        value,
        ctr: rates.ctr,
        cpc: rates.cpc,
        cost: rates.costPerConversion,
        roas: spend > 0 ? value / spend : null,
      });
    }
  }
  campaigns.sort((a, b) => b.spend - a.spend || b.clicks - a.clicks);
  const totalsRaw = campaigns.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    spend: sum.spend + row.spend,
    conversions: sum.conversions + row.conversions,
    value: sum.value + row.value,
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, value: 0 });
  const rates = campaignRates(totalsRaw);
  return {
    channel: 'google',
    clientName: clientName || '',
    range,
    labels: periodLabels(range),
    note: String(note || '').trim(),
    analytics: null,
    analyticsNote: '',
    keywords: [],
    ads: [],
    groups: [],
    daily: foldGoogleDaily(linked),
    totals: {
      ...totalsRaw,
      ctr: rates.ctr,
      cpc: rates.cpc,
      cost: rates.costPerConversion,
      roas: totalsRaw.spend > 0 ? totalsRaw.value / totalsRaw.spend : null,
    },
    campaigns,
    includePaid: false,
    social: null,
    showSales: false,
    showNotes: false,
    showCampaignSlides: false,
  };
}
