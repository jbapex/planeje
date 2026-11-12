const CHANNEL_LABEL = {
  SEARCH: 'Pesquisa',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Vídeo',
  MULTI_CHANNEL: 'App',
  LOCAL: 'Local',
  SMART: 'Smart',
  PERFORMANCE_MAX: 'Performance Max',
  DISCOVERY: 'Demand Gen',
  DEMAND_GEN: 'Demand Gen',
  HOTEL: 'Hotel',
  TRAVEL: 'Viagem',
  LOCAL_SERVICES: 'Serviços locais',
};

const STATUS_LABEL = {
  ENABLED: 'Ativa',
  PAUSED: 'Pausada',
  REMOVED: 'Removida',
};

const PRIMARY_STATUS_LABEL = {
  ELIGIBLE: 'No ar',
  PAUSED: 'Pausada',
  PENDING: 'Pendente',
  ENDED: 'Encerrada',
  LIMITED: 'Limitada',
  LEARNING: 'Aprendizado',
  NOT_ELIGIBLE: 'Fora do ar',
  MISCONFIGURED: 'Configurar',
  REMOVED: 'Removida',
};

export function microsToMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000;
}

export function googleAdsChannelLabel(type) {
  const key = String(type || '').toUpperCase();
  return CHANNEL_LABEL[key] || (key && key !== 'UNSPECIFIED' && key !== 'UNKNOWN' ? key : '—');
}

export function googleAdsStatusLabel(status, primaryStatus) {
  const primary = PRIMARY_STATUS_LABEL[String(primaryStatus || '').toUpperCase()];
  if (primary) return primary;
  return STATUS_LABEL[String(status || '').toUpperCase()] || status || '—';
}

export function accountBalanceFromBudgets(budgets = []) {
  const rows = Array.isArray(budgets) ? budgets : [];
  const approved = rows.filter((row) => String(row.status || '').toUpperCase() === 'APPROVED');
  const source = approved.length ? approved : rows;
  if (!source.length) {
    return { available: false, unlimited: false, remaining: null, limit: null, served: null };
  }
  let unlimited = false;
  let limit = 0;
  let served = 0;
  let hasFinite = false;
  for (const row of source) {
    const type = String(row.limitType || row.limit_type || '').toUpperCase();
    const servedMoney = microsToMoney(row.servedMicros ?? row.served_micros ?? row.served);
    served += servedMoney;
    if (type === 'INFINITE') {
      unlimited = true;
      continue;
    }
    const rawLimit = row.limitMicros ?? row.limit_micros ?? row.limit;
    if (rawLimit == null || rawLimit === '') continue;
    hasFinite = true;
    limit += microsToMoney(rawLimit);
  }
  if (unlimited && !hasFinite) {
    return { available: true, unlimited: true, remaining: null, limit: null, served };
  }
  if (!hasFinite) {
    return { available: false, unlimited: false, remaining: null, limit: null, served: served || null };
  }
  return {
    available: true,
    unlimited: false,
    remaining: Math.max(0, limit - served),
    limit,
    served,
  };
}

export function campaignRates(campaign = {}) {
  const spend = Number(campaign.spend) || 0;
  const clicks = Number(campaign.clicks) || 0;
  const impressions = Number(campaign.impressions) || 0;
  const conversions = Number(campaign.conversions) || 0;
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    costPerConversion: conversions > 0 ? spend / conversions : null,
  };
}

export function addOneDay(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const next = new Date(year, month - 1, day + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

export function fillDailySeries(since, until, points = []) {
  const byDate = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    const date = String(point.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const current = byDate.get(date) || { date, spend: 0, clicks: 0, conversions: 0, impressions: 0 };
    current.spend += Number(point.spend) || 0;
    current.clicks += Number(point.clicks) || 0;
    current.conversions += Number(point.conversions) || 0;
    current.impressions += Number(point.impressions) || 0;
    byDate.set(date, current);
  }
  const series = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(until || '')) || since > until) {
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  for (let date = since; date <= until && series.length < 400; date = addOneDay(date)) {
    series.push(byDate.get(date) || { date, spend: 0, clicks: 0, conversions: 0, impressions: 0 });
  }
  return series;
}

export function googleAdsKeywordMatchLabel(type) {
  const key = String(type || '').toUpperCase();
  if (key === 'EXACT') return 'Exata';
  if (key === 'PHRASE') return 'Frase';
  if (key === 'BROAD' || key === 'BROAD_MATCH') return 'Ampla';
  return key && key !== 'UNSPECIFIED' && key !== 'UNKNOWN' ? key : '—';
}

const AD_TYPE_LABEL = {
  RESPONSIVE_SEARCH_AD: 'RSA',
  EXPANDED_TEXT_AD: 'Texto',
  RESPONSIVE_DISPLAY_AD: 'Display',
  VIDEO_RESPONSIVE_AD: 'Vídeo',
  DEMAND_GEN_MULTI_ASSET_AD: 'Demand Gen',
  DEMAND_GEN_CAROUSEL_AD: 'Demand Gen',
  DEMAND_GEN_VIDEO_RESPONSIVE_AD: 'Demand Gen',
  APP_AD: 'App',
  CALL_AD: 'Ligação',
  IMAGE_AD: 'Imagem',
  SHOPPING_PRODUCT_AD: 'Shopping',
  SMART_CAMPAIGN_AD: 'Smart',
};

export function googleAdsAdTypeLabel(type) {
  const key = String(type || '').toUpperCase();
  return AD_TYPE_LABEL[key] || (key && key !== 'UNSPECIFIED' && key !== 'UNKNOWN' ? key : 'Anúncio');
}

export function googleAdsAdLabel(ad = {}) {
  const name = String(ad.name || '').trim();
  if (name) return name;
  const headlines = Array.isArray(ad.headlines) ? ad.headlines.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (headlines.length) return headlines.slice(0, 2).join(' · ');
  return googleAdsAdTypeLabel(ad.type);
}

export function googleAdsKeywordsEmptyCopy(channelType) {
  const key = String(channelType || '').toUpperCase();
  if (key === 'PERFORMANCE_MAX') {
    return 'Performance Max não usa palavras-chave. Os grupos de assets aparecem acima, se a Google listar.';
  }
  if (key === 'SMART') {
    return 'Campanha Smart não lista palavras-chave neste relatório.';
  }
  if (key === 'DEMAND_GEN' || key === 'DISCOVERY') {
    return 'Demand Gen não usa palavras-chave de pesquisa.';
  }
  return 'Nenhuma palavra-chave neste período.';
}

export function dailyBarHeight(spend, maxSpend) {
  const value = Number(spend) || 0;
  const max = Number(maxSpend) || 0;
  if (max <= 0) return 4;
  return Math.max(4, Math.round((value / max) * 100));
}

export function googleAdsDailyHover(point = {}) {
  const date = String(point?.date || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return {
    heading: match ? `${match[3]}/${match[2]}/${match[1]}` : (date || '—'),
    spend: Number(point?.spend) || 0,
    clicks: Number(point?.clicks) || 0,
    conversions: Number(point?.conversions) || 0,
    impressions: Number(point?.impressions) || 0,
  };
}

export function mergeGoogleAdsCampaigns(attributes = [], metrics = []) {
  const byId = new Map();
  for (const row of Array.isArray(attributes) ? attributes : []) {
    const id = String(row.id || '');
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(row.name || id),
      status: String(row.status || 'UNKNOWN'),
      primaryStatus: String(row.primaryStatus || row.primary_status || ''),
      channelType: String(row.channelType || row.channel_type || ''),
      dailyBudget: Number(row.dailyBudget ?? row.daily_budget) || 0,
      totalBudget: Number(row.totalBudget ?? row.total_budget) || 0,
      budgetShared: Boolean(row.budgetShared ?? row.budget_shared),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      conversionValue: 0,
    });
  }
  for (const row of Array.isArray(metrics) ? metrics : []) {
    const id = String(row.id || '');
    if (!id) continue;
    const current = byId.get(id) || {
      id,
      name: String(row.name || id),
      status: String(row.status || 'UNKNOWN'),
      primaryStatus: '',
      channelType: '',
      dailyBudget: 0,
      totalBudget: 0,
      budgetShared: false,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      conversionValue: 0,
    };
    current.impressions += Number(row.impressions) || 0;
    current.clicks += Number(row.clicks) || 0;
    current.spend += Number(row.spend) || 0;
    current.conversions += Number(row.conversions) || 0;
    current.conversionValue += Number(row.conversionValue ?? row.conversion_value) || 0;
    if (row.name) current.name = String(row.name);
    if (row.status) current.status = String(row.status);
    byId.set(id, current);
  }
  return [...byId.values()].sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name, 'pt'));
}
