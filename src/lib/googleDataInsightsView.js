export function parseGa4PropertyId(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/properties\/(\d+)/i) || text.match(/^(\d{6,})$/);
  return match ? match[1] : '';
}

export function ga4PropertyResource(raw) {
  const id = parseGa4PropertyId(raw);
  return id ? `properties/${id}` : '';
}

export function parseGtmIds(accountId, containerId) {
  const account = String(accountId || '').replace(/\D/g, '');
  const container = String(containerId || '').replace(/\D/g, '');
  return { account, container };
}

export function metricNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CHANNEL_LABELS = {
  Direct: 'Direto',
  'Organic Search': 'Pesquisa orgânica',
  'Paid Search': 'Pesquisa paga',
  'Organic Social': 'Social orgânico',
  'Paid Social': 'Social pago',
  Referral: 'Referência',
  Email: 'E-mail',
  Display: 'Display',
  Affiliates: 'Afiliados',
  Video: 'Vídeo',
  'Cross-network': 'Várias redes',
  Unassigned: 'Não atribuído',
  'AI Assistant': 'Assistente de IA',
  'Paid Other': 'Outros pagos',
  'Organic Shopping': 'Compras orgânicas',
  'Paid Shopping': 'Compras pagas',
  'Organic Video': 'Vídeo orgânico',
  'Paid Video': 'Vídeo pago',
};

const DEVICE_LABELS = {
  desktop: 'Computador',
  mobile: 'Celular',
  tablet: 'Tablet',
  smarttv: 'TV',
};

const TAG_TYPE_LABELS = {
  gaawc: 'GA4 · configuração',
  gaawe: 'GA4 · evento',
  googtag: 'Tag do Google',
  html: 'HTML personalizado',
  img: 'Pixel de imagem',
  awct: 'Conversão do Google Ads',
  sp: 'Remarketing do Google Ads',
  flc: 'Floodlight · contador',
  fls: 'Floodlight · vendas',
  hjtc: 'Hotjar',
  baut: 'Microsoft Ads',
};

const TRIGGER_TYPE_LABELS = {
  pageview: 'Página vista',
  domReady: 'DOM pronto',
  windowLoaded: 'Janela carregada',
  click: 'Clique',
  linkClick: 'Clique em link',
  formSubmission: 'Envio de formulário',
  customEvent: 'Evento personalizado',
  timer: 'Timer',
  historyChange: 'Mudança de histórico',
  scrollDepth: 'Rolagem',
  elementVisibility: 'Elemento visível',
  youTubeVideo: 'Vídeo do YouTube',
  jsError: 'Erro de JavaScript',
  triggerGroup: 'Grupo de acionadores',
  always: 'Todos os eventos',
};

const VARIABLE_TYPE_LABELS = {
  v: 'Camada de dados',
  jsm: 'JavaScript personalizado',
  j: 'Variável JavaScript',
  k: 'Cookie próprio',
  c: 'Constante',
  u: 'URL',
  aev: 'Evento automático',
  remm: 'Tabela regex',
  smm: 'Tabela de pesquisa',
  gas: 'Configuração do Google Analytics',
  dbg: 'Modo de depuração',
};

function labeled(map, raw) {
  const key = String(raw || '').trim();
  if (!key || key === '(not set)') return 'Não informado';
  return map[key] || key;
}

export function analyticsChannelLabel(channel) {
  return labeled(CHANNEL_LABELS, channel);
}

export function analyticsDeviceLabel(device) {
  return labeled(DEVICE_LABELS, String(device || '').toLowerCase());
}

export function analyticsPlaceLabel(city) {
  return labeled({}, city);
}

export function analyticsSourceLabel(source) {
  const text = String(source || '').trim();
  if (!text || text === '(not set)' || text === '(data not available)') return 'Não informado';
  if (text === '(direct) / (none)') return 'Direto';
  return text;
}

export function analyticsPageLabel(page) {
  const text = String(page || '').trim();
  if (!text || text === '(not set)') return 'Não informado';
  return text;
}

export function tagManagerTypeLabel(type) {
  return labeled(TAG_TYPE_LABELS, type);
}

export function tagManagerTriggerLabel(type) {
  return labeled(TRIGGER_TYPE_LABELS, type);
}

export function tagManagerVariableLabel(type) {
  return labeled(VARIABLE_TYPE_LABELS, type);
}

export function formatDurationSeconds(value) {
  const total = Math.round(Number(value) || 0);
  if (!Number.isFinite(Number(value)) || total <= 0) return '—';
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!minutes) return `${seconds} s`;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

export function formatRatioPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n * 100)}%`;
}

export function shareOf(part, total) {
  const whole = Number(total) || 0;
  if (!whole) return 0;
  return Math.max(0, Math.min(100, ((Number(part) || 0) / whole) * 100));
}

function addAnalyticsDay(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function fillAnalyticsDays(since, until, points = []) {
  const byDate = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    const date = String(point.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byDate.set(date, {
      date,
      sessions: metricNumber(point.sessions),
      users: metricNumber(point.users),
      conversions: metricNumber(point.conversions),
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(until || '')) || since > until) {
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  const series = [];
  for (let date = since; date <= until && series.length < 400; date = addAnalyticsDay(date)) {
    series.push(byDate.get(date) || { date, sessions: 0, users: 0, conversions: 0 });
  }
  return series;
}

function rankedRows(rows, labelKey, fields) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = { [labelKey]: String(row[labelKey] || '—').trim() || '—' };
      fields.forEach((field) => { item[field] = metricNumber(row[field]); });
      return item;
    })
    .filter((row) => row[labelKey] && row[labelKey] !== '—')
    .sort((a, b) => (b.sessions ?? b.count ?? 0) - (a.sessions ?? a.count ?? 0) || String(a[labelKey]).localeCompare(String(b[labelKey]), 'pt-BR'));
}

export function analyticsDelta(current, previous) {
  const now = Number(current);
  const then = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(then) || then <= 0) return null;
  return ((now - then) / then) * 100;
}

export function formatSignedPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const rounded = Math.round(Number(value));
  return `${rounded > 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR').format(rounded)}%`;
}

export function analyticsCampaignLabel(value) {
  const text = String(value || '').trim();
  if (!text || text === '(not set)' || text === '(not provided)') return 'Não informado';
  if (text === '(direct)' || text === '(none)') return 'Direto';
  return text;
}

export function mapAnalyticsReport(payload = {}) {
  const totals = payload.totals && typeof payload.totals === 'object' ? payload.totals : {};
  const sourceRows = Array.isArray(payload.channels) && payload.channels.length ? payload.channels : payload.rows;
  const channels = rankedRows(sourceRows, 'channel', ['sessions', 'users', 'conversions', 'engagementRate']);
  const previous = payload.previous && typeof payload.previous === 'object' ? payload.previous : null;
  return {
    sessions: metricNumber(totals.sessions ?? payload.sessions),
    users: metricNumber(totals.users ?? totals.activeUsers ?? payload.users),
    newUsers: metricNumber(totals.newUsers),
    engagedSessions: metricNumber(totals.engagedSessions),
    engagementRate: Number.isFinite(Number(totals.engagementRate)) ? Number(totals.engagementRate) : 0,
    averageSessionDuration: Number.isFinite(Number(totals.averageSessionDuration)) ? Number(totals.averageSessionDuration) : 0,
    conversions: metricNumber(totals.conversions ?? totals.keyEvents ?? payload.conversions),
    channels,
    daily: fillAnalyticsDays(payload.since, payload.until, payload.daily),
    sources: rankedRows(payload.sources, 'source', ['sessions', 'users', 'conversions']).slice(0, 12),
    pages: rankedRows(payload.pages, 'page', ['sessions', 'users', 'conversions']).slice(0, 15),
    devices: rankedRows(payload.devices, 'device', ['sessions', 'users', 'conversions']),
    cities: rankedRows(payload.cities, 'city', ['sessions', 'users']).slice(0, 10),
    events: rankedRows(payload.events, 'event', ['count', 'users']).slice(0, 15),
    campaigns: rankedRows(payload.campaigns, 'campaign', ['sessions', 'users', 'conversions']).slice(0, 12),
    previous: previous ? {
      since: String(previous.since || ''),
      until: String(previous.until || ''),
      sessions: metricNumber(previous.sessions),
      users: metricNumber(previous.users),
      conversions: metricNumber(previous.conversions),
    } : null,
  };
}

export function mapBusinessPerformance(payload = {}) {
  const totals = payload.totals && typeof payload.totals === 'object' ? payload.totals : payload;
  return {
    impressions: metricNumber(totals.impressions ?? totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH ?? totals.search),
    maps: metricNumber(totals.maps ?? totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS ?? totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS),
    calls: metricNumber(totals.calls ?? totals.CALL_CLICKS),
    directions: metricNumber(totals.directions ?? totals.BUSINESS_DIRECTION_REQUESTS),
    website: metricNumber(totals.website ?? totals.WEBSITE_CLICKS),
    reviews: metricNumber(totals.reviews ?? payload.reviewCount),
    rating: Number.isFinite(Number(totals.rating ?? payload.averageRating))
      ? Number(totals.rating ?? payload.averageRating)
      : null,
  };
}

export function mapBusinessBoard(payload = {}) {
  const totals = mapBusinessPerformance(payload);
  const daily = (Array.isArray(payload.daily) ? payload.daily : [])
    .map((row) => ({
      date: String(row.date || '').slice(0, 10),
      impressions: metricNumber(row.impressions),
      maps: metricNumber(row.maps),
      calls: metricNumber(row.calls),
      directions: metricNumber(row.directions),
      website: metricNumber(row.website),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...totals, daily };
}

function countField(value, list) {
  if (Number.isFinite(Number(value)) && !Array.isArray(value)) return Number(value);
  return Array.isArray(list) ? list.length : 0;
}

export function mapTagManagerOverview(payload = {}) {
  return {
    accountName: String(payload.accountName || payload.account || '').trim(),
    containerName: String(payload.containerName || payload.name || '').trim(),
    publicId: String(payload.publicId || payload.public_id || '').trim(),
    versionName: String(payload.versionName || '').trim(),
    tagManagerUrl: String(payload.tagManagerUrl || '').trim(),
    tags: countField(payload.tags ?? payload.tagCount, payload.tagList),
    triggers: countField(payload.triggers ?? payload.triggerCount, payload.triggerList),
    variables: countField(payload.variables ?? payload.variableCount, payload.variableList),
  };
}

export function mapTagManagerInventory(payload = {}) {
  const summary = mapTagManagerOverview(payload);
  const tagList = (Array.isArray(payload.tagList) ? payload.tagList : []).map((row) => ({
    name: String(row.name || 'Sem nome').trim() || 'Sem nome',
    type: String(row.type || '').trim(),
    typeLabel: tagManagerTypeLabel(row.type),
    paused: Boolean(row.paused),
    fires: (Array.isArray(row.fires) ? row.fires : []).map((name) => String(name || '').trim()).filter(Boolean),
    measurementId: String(row.measurementId || '').trim(),
    snippet: String(row.snippet || '').trim().slice(0, 180),
    notes: (Array.isArray(row.notes) ? row.notes : []).map((note) => String(note || '').trim()).filter(Boolean).slice(0, 3),
  })).sort((a, b) => Number(a.paused) - Number(b.paused) || a.name.localeCompare(b.name, 'pt-BR'));
  const triggerList = (Array.isArray(payload.triggerList) ? payload.triggerList : []).map((row) => ({
    name: String(row.name || 'Sem nome').trim() || 'Sem nome',
    type: String(row.type || '').trim(),
    typeLabel: tagManagerTriggerLabel(row.type),
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const variableList = (Array.isArray(payload.variableList) ? payload.variableList : []).map((row) => ({
    name: String(row.name || 'Sem nome').trim() || 'Sem nome',
    type: String(row.type || '').trim(),
    typeLabel: tagManagerVariableLabel(row.type),
    value: String(row.value || '').trim().slice(0, 120),
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const byType = new Map();
  tagList.forEach((tag) => byType.set(tag.typeLabel, (byType.get(tag.typeLabel) || 0) + 1));
  return {
    ...summary,
    tagList,
    triggerList,
    variableList,
    activeTags: tagList.filter((tag) => !tag.paused).length,
    pausedTags: tagList.filter((tag) => tag.paused).length,
    typeCounts: [...byType.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
  };
}

export function googleDataProductErrorCopy(raw) {
  const text = String(raw || '');
  if (/API has not been used|has not been enabled|accessNotConfigured/i.test(text)) {
    return 'Ative esta API no mesmo projeto Cloud do OAuth (Biblioteca de APIs).';
  }
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|Request had insufficient/i.test(text)) {
    return 'Essa conta Google não tem permissão neste produto. Autorize de novo e aceite as três caixas.';
  }
  if (/PERMISSION_DENIED|not authorized|403/i.test(text)) {
    return 'Sem permissão nesta conta. Peça acesso de leitura no Analytics, na ficha do Meu Negócio ou no GTM.';
  }
  return text.trim();
}
