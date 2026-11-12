/**
 * Métricas normalizadas para nós do funil (Meta / Google Ads).
 */
import { resolveEffectiveLink } from '@/lib/funilNodeGraph';

export function emptyFunilMetrics() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    ctr: 0,
    cpc: 0,
    fetchedAt: null,
  };
}

export function formatFunilSpend(value) {
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatFunilCompactNumber(value) {
  const n = typeof value === 'number' ? value : parseInt(value, 10) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Uma linha curta para badge no nó */
export function formatFunilMetricsKpi(metrics) {
  if (!metrics || metrics.error) return null;
  const parts = [];
  if (metrics.spend > 0) parts.push(formatFunilSpend(metrics.spend));
  if (metrics.clicks > 0) parts.push(`${formatFunilCompactNumber(metrics.clicks)} cliques`);
  else if (metrics.impressions > 0) parts.push(`${formatFunilCompactNumber(metrics.impressions)} imp.`);
  if (parts.length === 0 && metrics.conversions > 0) {
    parts.push(`${formatFunilCompactNumber(metrics.conversions)} conv.`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function defaultMetricsDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from,
    to,
    since: from.toISOString().split('T')[0],
    until: to.toISOString().split('T')[0],
  };
}

export function buildMetricsPayload(nodes, edges = []) {
  return (nodes || [])
    .map((n) => {
      const { metaLink, googleLink } = resolveEffectiveLink(n, nodes, edges);
      return {
        node: n,
        metaLink,
        googleLink,
      };
    })
    .filter((row) => row.metaLink?.campaignId || row.googleLink?.campaignId)
    .map((row) => ({
      nodeId: row.node.id,
      metaLink: row.metaLink || undefined,
      googleLink: row.googleLink || undefined,
    }));
}

function digitsOnly(id) {
  if (id == null || id === '') return '';
  return String(id).replace(/\D/g, '');
}

export function buildAttributionPayload(nodes, edges = []) {
  return (nodes || []).map((n) => {
    const { metaLink, googleLink } = resolveEffectiveLink(n, nodes, edges);
    return {
      nodeId: n.id,
      utmCampaign: metaLink?.utmCampaign || googleLink?.utmCampaign || '',
      utmSource: metaLink?.utmSource || googleLink?.utmSource || '',
      nodeType: n.data?.type || '',
      metaCampaignId: digitsOnly(metaLink?.campaignId) || undefined,
      metaAdSetId: digitsOnly(metaLink?.adSetId) || undefined,
      metaAdId: digitsOnly(metaLink?.adId) || undefined,
      googleCampaignId: googleLink?.campaignId ? String(googleLink.campaignId) : undefined,
      googleAdGroupId: googleLink?.adGroupId ? String(googleLink.adGroupId) : undefined,
    };
  });
}

/** Nós raiz de campanha (evita somar leads duplicados no resumo do hub). */
export function getCampaignAnchorNodes(nodes, edges = []) {
  return (nodes || []).filter((n) => {
    const type = n.data?.type;
    if (type !== 'meta' && type !== 'google') return false;
    const { metaLink, googleLink } = resolveEffectiveLink(n, nodes, edges);
    return !!(metaLink?.campaignId || googleLink?.campaignId);
  });
}

export function aggregateSpendFromCampaignNodes(nodes, edges = []) {
  let meta = 0;
  let google = 0;
  for (const n of getCampaignAnchorNodes(nodes, edges)) {
    const m = n.data?.metrics;
    if (!m || m.error) continue;
    const spend = Number(m.spend) || 0;
    if (n.data?.type === 'google') google += spend;
    else meta += spend;
  }
  return { meta, google, total: meta + google };
}
