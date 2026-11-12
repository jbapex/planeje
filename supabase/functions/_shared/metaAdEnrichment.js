export const META_AD_IDENTITY_FIELDS = 'id,name,account_id,campaign{id,name,account_id},adset{id,name}';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === 'string' ? value.trim() : '';
const present = (value) => value != null && value !== '' && (typeof value !== 'string' || value.trim() !== '');
const entityId = (value) => /^\d{1,32}$/.test(text(value)) ? text(value) : '';
export const metaAccountId = (value) => entityId(text(value).replace(/^act_/, ''));

export function metaAdIdentity(value) {
  const ad = object(value), campaign = object(ad.campaign), adset = object(ad.adset);
  return { id: entityId(ad.id) || null, name: text(ad.name) || null,
    account_id: metaAccountId(ad.account_id || campaign.account_id) || null,
    campaign: { id: entityId(campaign.id) || null, name: text(campaign.name) || null, account_id: metaAccountId(campaign.account_id || ad.account_id) || null },
    adset: ad.adset ? { id: entityId(adset.id) || null, name: text(adset.name) || null } : null };
}

export function metaAdIds(value) {
  const tracking = object(value), ad = object(object(tracking.meta_ad_details).ad);
  return [...new Set([tracking.source_id, tracking.ad_id, tracking.adId, tracking.sourceID, ad.id].filter(present).map((id) => typeof id === 'string' ? id.trim() : id))];
}

/** Identidade é aditiva: uma consulta posterior não troca a origem nem dados já registrados. */
export function mergeMetaAdEnrichment(value, details, fetchedAt = null) {
  const tracking = object(value), incoming = metaAdIdentity(details?.ad);
  const result = (status) => ({ status, tracking: value });
  if (!incoming.id || !incoming.account_id || !incoming.campaign.id || !incoming.adset?.id
    || incoming.account_id !== incoming.campaign.account_id) return result('invalid');
  const saved = object(tracking.meta_ad_details), ad = object(saved.ad), campaign = object(ad.campaign), adset = object(ad.adset);
  if ([[tracking, 'meta_ad_details'], [saved, 'ad'], [ad, 'campaign'], [ad, 'adset']]
    .some(([parent, key]) => present(parent[key]) && parent[key] !== object(parent[key]))) return result('conflict');
  const identities = [
    [metaAdIds(tracking), incoming.id, entityId],
    [[ad.account_id, campaign.account_id, tracking.account_id], incoming.account_id, metaAccountId],
    [[campaign.id, ad.campaign_id, saved.campaign_id, tracking.campaign_id, tracking.campaignId], incoming.campaign.id, entityId],
    [[adset.id, ad.adset_id, tracking.adset_id], incoming.adset.id, entityId],
  ];
  if (identities.some(([values, expected, normalize]) => values.some((id) => present(id) && normalize(id) !== expected))) return result('conflict');
  let changed = false;
  const fill = (existing, received) => {
    const next = { ...existing };
    for (const [key, value] of Object.entries(received)) if (!present(next[key]) && present(value)) { next[key] = value; changed = true; }
    return next;
  };
  const nextAd = fill(ad, { id: incoming.id, name: incoming.name, account_id: incoming.account_id });
  nextAd.campaign = fill(campaign, incoming.campaign);
  nextAd.adset = fill(adset, incoming.adset);
  const nextDetails = fill(saved, { accountName: text(details?.accountName), fetched_at: fetchedAt });
  if (!changed) return result('unchanged');
  return { status: 'changed', tracking: { ...tracking, meta_ad_details: { ...nextDetails, ad: nextAd } } };
}
