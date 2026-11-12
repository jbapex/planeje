export const DEFAULT_BRAND = {
  accent: '#f1b309',
  ink: '#111111',
  logo: '',
};

const BRAND_KEY = 'planeje.trafficReport.brand';

export function emptyDraft() {
  return { hiddenPages: [], hiddenAds: [], text: {} };
}

export function editStorageKey(clientId, period) {
  return `planeje.trafficReport.edit.${clientId}.${period}`;
}

const METRICS_KEY = 'planeje.trafficReport.visibleMetrics';
const SOCIAL_METRICS_KEY = 'planeje.trafficReport.visibleSocialMetrics';
const GOOGLE_METRICS_KEY = 'planeje.trafficReport.visibleGoogleMetrics';
const SCOPE_KEY = 'planeje.trafficReport.scope';
const CHANNEL_KEY = 'planeje.trafficReport.channel';

export function readVisibleMetrics() {
  const box = storage();
  if (!box) return null;
  try {
    return JSON.parse(box.getItem(METRICS_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeVisibleMetrics(list) {
  const box = storage();
  if (!box) return;
  box.setItem(METRICS_KEY, JSON.stringify(list));
}

export function readVisibleSocialMetrics() {
  const box = storage();
  if (!box) return null;
  try {
    return JSON.parse(box.getItem(SOCIAL_METRICS_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeVisibleSocialMetrics(list) {
  const box = storage();
  if (!box) return;
  box.setItem(SOCIAL_METRICS_KEY, JSON.stringify(list));
}

export function readReportScope() {
  const box = storage();
  if (!box) return 'both';
  const value = box.getItem(SCOPE_KEY);
  return value === 'paid' || value === 'social' || value === 'both' ? value : 'both';
}

export function writeReportScope(scope) {
  const box = storage();
  if (!box) return;
  if (scope === 'paid' || scope === 'social' || scope === 'both') box.setItem(SCOPE_KEY, scope);
}

export function readReportChannel() {
  const box = storage();
  if (!box) return 'meta';
  return box.getItem(CHANNEL_KEY) === 'google' ? 'google' : 'meta';
}

export function writeReportChannel(channel) {
  const box = storage();
  if (!box) return;
  box.setItem(CHANNEL_KEY, channel === 'google' ? 'google' : 'meta');
}

export function readVisibleGoogleMetrics() {
  const box = storage();
  if (!box) return null;
  try {
    return JSON.parse(box.getItem(GOOGLE_METRICS_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeVisibleGoogleMetrics(list) {
  const box = storage();
  if (!box) return;
  box.setItem(GOOGLE_METRICS_KEY, JSON.stringify(list));
}

export function inkOn(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!match) return '#111111';
  const raw = match[1];
  const channel = (start) => parseInt(raw.slice(start, start + 2), 16) / 255;
  const linear = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = (0.2126 * linear(channel(0))) + (0.7152 * linear(channel(2))) + (0.0722 * linear(channel(4)));
  const contrast = (back) => {
    const lighter = Math.max(luminance, back);
    const darker = Math.min(luminance, back);
    return (lighter + 0.05) / (darker + 0.05);
  };
  return contrast(0) >= contrast(1) ? '#111111' : '#ffffff';
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeBrand(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    accent: /^#[0-9a-fA-F]{6}$/.test(source.accent || '') ? source.accent : DEFAULT_BRAND.accent,
    ink: /^#[0-9a-fA-F]{6}$/.test(source.ink || '') ? source.ink : DEFAULT_BRAND.ink,
    logo: typeof source.logo === 'string' && source.logo.startsWith('data:image/') ? source.logo : '',
  };
}

function normalizeDraft(value) {
  const source = value && typeof value === 'object' ? value : {};
  const text = source.text && typeof source.text === 'object' ? source.text : {};
  return {
    hiddenPages: Array.isArray(source.hiddenPages) ? source.hiddenPages.filter((id) => typeof id === 'string') : [],
    hiddenAds: Array.isArray(source.hiddenAds) ? source.hiddenAds.filter((id) => typeof id === 'string') : [],
    text: Object.fromEntries(Object.entries(text).filter((entry) => typeof entry[1] === 'string')),
  };
}

export function readBrand() {
  const box = storage();
  if (!box) return { ...DEFAULT_BRAND };
  try {
    return normalizeBrand(JSON.parse(box.getItem(BRAND_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export function writeBrand(brand) {
  const box = storage();
  if (!box) return;
  box.setItem(BRAND_KEY, JSON.stringify(normalizeBrand(brand)));
}

export function readDraft(clientId, period) {
  const box = storage();
  if (!box || !clientId || !period) return emptyDraft();
  try {
    return normalizeDraft(JSON.parse(box.getItem(editStorageKey(clientId, period)) || 'null'));
  } catch {
    return emptyDraft();
  }
}

export function writeDraft(clientId, period, draft) {
  const box = storage();
  if (!box || !clientId || !period) return;
  box.setItem(editStorageKey(clientId, period), JSON.stringify(normalizeDraft(draft)));
}

export function readText(draft, id, fallback) {
  const value = draft?.text?.[id];
  return typeof value === 'string' ? value : fallback;
}

export function galleryPageId(page) {
  return `gallery:${(page || []).map((ad) => ad.id).join(',')}`;
}

function chunk(items, size) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

export function presentReport(report, draft) {
  const hiddenAds = new Set(draft?.hiddenAds || []);
  const hiddenPages = new Set(draft?.hiddenPages || []);
  const visible = (ad) => ad && !hiddenAds.has(ad.id);
  const campaigns = (report?.campaigns || []).map((campaign) => ({
    ...campaign,
    creatives: (campaign.creatives || []).filter(visible),
  })).filter((campaign) => !hiddenPages.has(`campaign:${campaign.id}`));
  const gallery = chunk((report?.gallery || []).flat().filter(visible), 3)
    .filter((page) => !hiddenPages.has(galleryPageId(page)));
  const socialChannels = (report?.social?.channels || [])
    .filter((channel) => !hiddenPages.has(`social:${channel.id}`));
  return {
    ...report,
    campaigns,
    gallery,
    social: report?.social
      ? { ...report.social, channels: socialChannels }
      : null,
    showCover: !hiddenPages.has('cover'),
    showAccount: !hiddenPages.has('account'),
    showSales: Boolean(report?.showSales) && !hiddenPages.has('sales'),
    showNotes: Boolean(report?.showNotes) && !hiddenPages.has('notes'),
    showEnd: !hiddenPages.has('end'),
    showSocial: Boolean(report?.social) && !hiddenPages.has('social'),
  };
}

export function hiddenPageLabel(report, id) {
  if (id === 'cover') return 'Capa';
  if (id === 'account') return 'Resultados da conta';
  if (id === 'sales') return 'Performance de vendas';
  if (id === 'notes') return 'O que foi feito';
  if (id === 'end') return 'Encerramento';
  if (id === 'social') return 'Redes sociais';
  if (String(id).startsWith('social:')) {
    const found = (report?.social?.channels || []).find((item) => item.id === String(id).slice('social:'.length));
    return found?.label || 'Rede social';
  }
  if (String(id).startsWith('social-audience:')) {
    const found = (report?.social?.channels || []).find((item) => item.id === String(id).slice('social-audience:'.length));
    return found ? `Audiência · ${found.label}` : 'Audiência';
  }
  if (String(id).startsWith('social-posts:')) {
    const rest = String(id).slice('social-posts:'.length);
    const [channelId, page] = rest.split(':');
    const found = (report?.social?.channels || []).find((item) => item.id === channelId);
    const label = found ? `Publicações · ${found.label}` : 'Publicações';
    return page ? `${label} · ${page}` : label;
  }
  if (id === 'google-days') return 'Dia a dia do Google';
  if (id === 'google-groups') return 'Grupos do Google';
  if (id === 'google-origem') return 'Canal e origem';
  if (id === 'google-keywords') return 'Palavras do Google';
  if (id === 'google-ads') return 'Anúncios do Google';
  if (id === 'google-analytics') return 'Analytics';
  if (String(id).startsWith('google-campaigns:')) return 'Campanhas do Google';
  if (String(id).startsWith('campaign:')) {
    const found = (report?.campaigns || []).find((item) => item.id === String(id).slice('campaign:'.length));
    return found?.name || 'Campanha';
  }
  if (String(id).startsWith('gallery:')) return 'Página de criativos';
  return 'Página';
}

export function hiddenAdLabel(report, id) {
  const ads = [
    ...(report?.campaigns || []).flatMap((item) => item.creatives || []),
    ...(report?.gallery || []).flat(),
  ];
  return ads.find((ad) => ad.id === id)?.name || 'Anúncio';
}
