import { NODE_CONFIG } from '@/components/funil/nodeConfig';

/** @typedef {Object} FunilMetaLink
 * @property {string} [accountId]
 * @property {string} [accountName]
 * @property {string} [campaignId]
 * @property {string} [campaignName]
 * @property {string} [adSetId]
 * @property {string} [adSetName]
 * @property {string} [adId]
 * @property {string} [adName]
 * @property {Object} [metrics]
 * @property {string} [metricsFetchedAt]
 * @property {string} [utmSource]
 * @property {string} [utmMedium]
 * @property {string} [utmCampaign]
 */

export const META_CONNECT_CATEGORIES = ['Tráfego', 'Criativos', 'Rastreamento'];

export function isMetaConnectableNode(node) {
  if (!node?.data?.type) return false;
  const cfg = NODE_CONFIG[node.data.type];
  if (!cfg) return false;
  const type = node.data.type;
  if (type === 'pixel-meta' || type === 'gtm' || type === 'ga4' || type === 'meta-adset') return false;
  if (['meta', 'facebook', 'instagram'].includes(type)) return true;
  if (type === 'meta') return true;
  if (['video-ad', 'image-ad', 'story-ad', 'copy-text'].includes(type)) return true;
  if (META_CONNECT_CATEGORIES.includes(cfg.category) && type !== 'google' && type !== 'pixel-meta') return true;
  return false;
}

/** Formulário completo conta+campanha (nó meta raiz). */
export function isMetaCampaignEditorNode(node) {
  return node?.data?.type === 'meta' && !node?.data?.linkSource?.parentNodeId;
}

/** Herda Meta do pai — canal ou criativo. */
export function isMetaInheritedChildNode(node) {
  if (!node?.data?.type) return false;
  return !!node.data?.linkSource?.parentNodeId;
}

export function hasMetaLink(metaLink) {
  return !!(metaLink?.accountId || metaLink?.campaignId || metaLink?.adId);
}

export function isMetaLinkComplete(metaLink) {
  return !!(metaLink?.accountId && metaLink?.campaignId);
}

export function countNodesWithMetaLink(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.filter((n) => hasMetaLink(n.data?.metaLink)).length;
}

/** Gera slug UTM a partir do nome da campanha. */
export function slugifyUtmCampaign(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export function buildDefaultMetaLinkFromCampaign(account, campaign) {
  const campaignName = campaign?.name || '';
  return {
    accountId: account?.meta_account_id || account?.id || '',
    accountName: account?.meta_account_name || account?.name || '',
    campaignId: campaign?.id || '',
    campaignName,
    campaignStatus: campaign?.status || null,
    adSetId: null,
    adSetName: null,
    adSetStatus: null,
    adId: null,
    adName: null,
    adStatus: null,
    utmSource: 'meta',
    utmMedium: 'paid',
    utmCampaign: slugifyUtmCampaign(campaignName) || '',
  };
}

export function buildDefaultMetaLinkFromAdSet(account, campaign, adSet) {
  const base = buildDefaultMetaLinkFromCampaign(account, campaign);
  return {
    ...base,
    adSetId: adSet?.id || null,
    adSetName: adSet?.name || null,
    adSetStatus: adSet?.status || null,
    adId: null,
    adName: null,
    adStatus: null,
  };
}

export function buildDefaultMetaLinkFromAd(account, campaign, ad, adSet) {
  const base = buildDefaultMetaLinkFromCampaign(account, campaign);
  return {
    ...base,
    adSetId: adSet?.id || ad?.adset_id || null,
    adSetName: adSet?.name || null,
    adSetStatus: adSet?.status || base.adSetStatus || null,
    adId: ad?.id || null,
    adName: ad?.name || null,
    adStatus: ad?.status || null,
  };
}
