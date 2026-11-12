import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import { slugifyUtmCampaign } from '@/lib/funilMetaLink';

/** @typedef {Object} FunilGoogleLink
 * @property {string} [customerId]
 * @property {string} [customerName]
 * @property {string} [campaignId]
 * @property {string} [campaignName]
 * @property {string} [campaignType]
 * @property {string} [adGroupId]
 * @property {string} [adGroupName]
 * @property {string} [keywordPreview]
 * @property {Object} [metrics]
 * @property {string} [utmSource]
 * @property {string} [utmMedium]
 * @property {string} [utmCampaign]
 */

export const GOOGLE_CONNECT_CATEGORIES = ['Tráfego', 'Criativos', 'Rastreamento'];

export function isGoogleConnectableNode(node) {
  if (!node?.data?.type) return false;
  const cfg = NODE_CONFIG[node.data.type];
  if (!cfg) return false;
  const type = node.data.type;
  if (type === 'google') return true;
  if (['video-ad', 'image-ad', 'story-ad', 'copy-text'].includes(type)) return true;
  if (GOOGLE_CONNECT_CATEGORIES.includes(cfg.category) && type !== 'meta') return true;
  return false;
}

export function isGoogleCampaignEditorNode(node) {
  return node?.data?.type === 'google' && !node?.data?.linkSource?.parentNodeId;
}

export function isGoogleInheritedChildNode(node) {
  return !!node?.data?.linkSource?.parentNodeId;
}

export function hasGoogleLink(googleLink) {
  return !!(googleLink?.customerId || googleLink?.campaignId);
}

export function isGoogleLinkComplete(googleLink) {
  return !!(googleLink?.customerId && googleLink?.campaignId);
}

export function countNodesWithGoogleLink(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.filter((n) => hasGoogleLink(n.data?.googleLink)).length;
}

export function buildDefaultGoogleLinkFromCampaign(customer, campaign) {
  const campaignName = campaign?.name || '';
  return {
    customerId: customer?.google_customer_id || customer?.id || '',
    customerName: customer?.google_customer_name || customer?.name || '',
    campaignId: campaign?.id || '',
    campaignName,
    campaignStatus: campaign?.status || null,
    campaignType: campaign?.channelType || campaign?.type || null,
    adGroupId: null,
    adGroupName: null,
    keywordPreview: null,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: slugifyUtmCampaign(campaignName) || '',
  };
}

export function buildDefaultGoogleLinkFromAdGroup(customer, campaign, adGroup) {
  const base = buildDefaultGoogleLinkFromCampaign(customer, campaign);
  return {
    ...base,
    adGroupId: adGroup?.id || null,
    adGroupName: adGroup?.name || null,
    adGroupStatus: adGroup?.status || null,
  };
}

/** String de UTMs para colar nos anúncios Google */
export function formatGoogleUtmQueryString(googleLink) {
  if (!googleLink) return '';
  const params = new URLSearchParams();
  if (googleLink.utmSource) params.set('utm_source', googleLink.utmSource);
  if (googleLink.utmMedium) params.set('utm_medium', googleLink.utmMedium);
  if (googleLink.utmCampaign) params.set('utm_campaign', googleLink.utmCampaign);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
