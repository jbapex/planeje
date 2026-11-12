const ARCHIVED = new Set(['DELETED', 'ARCHIVED']);

export function normalizeSheetName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function catalogFromCampaigns(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((campaign) => ({
      id: String(campaign?.id || ''),
      name: String(campaign?.name || ''),
      status: String(campaign?.effective_status || campaign?.status || ''),
      adsets: (Array.isArray(campaign?.adsets) ? campaign.adsets : []).map((adset) => ({
        id: String(adset?.id || ''),
        name: String(adset?.name || ''),
        status: String(adset?.effective_status || adset?.status || ''),
        campaign_id: String(adset?.campaign_id || campaign?.id || ''),
        campaign_name: String(campaign?.name || ''),
      })),
    }))
    .filter((campaign) => campaign.id && campaign.name);
}

export function googleAdsStatusToSheet(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'ENABLED') return 'ACTIVE';
  if (value === 'PAUSED') return 'PAUSED';
  if (value === 'REMOVED') return 'DELETED';
  return value;
}

export function metaCatalogAccountKey(accountId) {
  const raw = String(accountId || '').trim();
  const digits = raw.replace(/^act_/i, '').replace(/\D/g, '');
  return digits || raw;
}

export function catalogAccountKey(accountId, platform = 'meta') {
  if (platform === 'google') {
    const id = String(accountId || '').replace(/-/g, '').replace(/\D/g, '');
    return id ? `google:${id}` : '';
  }
  return metaCatalogAccountKey(accountId);
}

export function catalogFromGoogleAds(campaigns = [], adGroups = []) {
  const groups = new Map();
  for (const group of Array.isArray(adGroups) ? adGroups : []) {
    const campaignId = String(group?.campaignId || group?.campaign_id || '');
    const id = String(group?.id || '');
    const name = String(group?.name || '');
    if (!campaignId || !id || !name) continue;
    if (!groups.has(campaignId)) groups.set(campaignId, []);
    groups.get(campaignId).push({
      id,
      name,
      status: googleAdsStatusToSheet(group.status),
      campaign_id: campaignId,
      campaign_name: String(group.campaignName || group.campaign_name || ''),
    });
  }
  return catalogFromCampaigns((Array.isArray(campaigns) ? campaigns : []).map((campaign) => ({
    id: campaign?.id,
    name: campaign?.name,
    status: googleAdsStatusToSheet(campaign?.status),
    adsets: groups.get(String(campaign?.id || '')) || [],
  })));
}

function statusScore(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'ACTIVE') return 20;
  if (value === 'PAUSED' || value === 'CAMPAIGN_PAUSED') return 10;
  if (ARCHIVED.has(value)) return -20;
  return 0;
}

export function deliveryLabel(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'ACTIVE') return 'no ar';
  if (value === 'PAUSED') return 'pausada';
  if (value === 'CAMPAIGN_PAUSED') return 'campanha pausada';
  if (value === 'ARCHIVED' || value === 'DELETED') return 'encerrada';
  return value ? value.toLowerCase().replace(/_/g, ' ') : '';
}

function suggestionScore(name, needle) {
  if (!needle) return 50;
  if (name === needle) return 1000;
  const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes(needle)) return 800;
  if (name.startsWith(`${needle} `) || name.startsWith(`${needle}-`) || name.startsWith(`${needle} -`)) return 700;
  if (name.startsWith(needle)) return needle.length >= 3 ? 500 : 80;
  if (needle.length >= 3 && name.includes(needle)) return 200;
  return -1;
}

export function rankSuggestions(query, items = [], limit = 12) {
  const needle = normalizeSheetName(query);
  const scored = [];
  for (const item of items) {
    const name = normalizeSheetName(item?.name);
    if (!name) continue;
    const status = String(item.status || '').toUpperCase();
    if (!needle && ARCHIVED.has(status)) continue;
    const score = suggestionScore(name, needle);
    if (score < 0) continue;
    scored.push({ item, score: score + statusScore(status), name });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt'));
  return scored.slice(0, limit).map((entry) => entry.item);
}

export function matchName(query, items = []) {
  const needle = normalizeSheetName(query);
  const suggestions = rankSuggestions(query, items);
  if (!needle) return { status: 'empty', exact: null, suggestions };
  const exact = items.filter((item) => normalizeSheetName(item.name) === needle);
  if (exact.length === 1) return { status: 'exact', exact: exact[0], suggestions };
  if (exact.length > 1) return { status: 'ambiguous', exact: null, suggestions: exact };
  if (suggestions.length) return { status: 'partial', exact: null, suggestions };
  return { status: 'unknown', exact: null, suggestions: [] };
}

export function campaignForRow(row = {}, catalog = []) {
  if (row.campaign_id) {
    const byId = catalog.find((campaign) => campaign.id === String(row.campaign_id));
    if (byId) return byId;
  }
  return matchName(row.campaign_name, catalog).exact;
}

export function adsetCatalogForRow(row = {}, catalog = []) {
  const campaign = campaignForRow(row, catalog);
  if (campaign) return campaign.adsets;
  return catalog.flatMap((item) => item.adsets || []);
}

export function applyCampaignPick(row = {}, campaign) {
  if (!campaign) return row;
  const adsetMatch = matchName(row.adset_name, campaign.adsets || []);
  const keepAdset = adsetMatch.status === 'exact' || (row.adset_id && (campaign.adsets || []).some((adset) => adset.id === row.adset_id));
  const next = { ...row, campaign_id: campaign.id, campaign_name: campaign.name };
  if (!keepAdset) {
    next.adset_id = '';
    if (row.adset_id) next.adset_name = '';
  } else if (adsetMatch.exact) {
    next.adset_id = adsetMatch.exact.id;
    next.adset_name = adsetMatch.exact.name;
  }
  return next;
}

export function applyAdsetPick(row = {}, adset, campaign) {
  if (!adset) return row;
  const parent = campaign || (adset.campaign_id ? { id: adset.campaign_id, name: adset.campaign_name || row.campaign_name } : null);
  return {
    ...row,
    adset_id: adset.id,
    adset_name: adset.name,
    ...(parent?.id ? { campaign_id: parent.id, campaign_name: parent.name || row.campaign_name } : {}),
  };
}

function clearStaleCampaign(row, catalog) {
  if (!row.campaign_id || !String(row.campaign_name || '').trim()) return row;
  const byId = catalog.find((campaign) => campaign.id === String(row.campaign_id));
  if (byId && normalizeSheetName(byId.name) !== normalizeSheetName(row.campaign_name)) {
    return { ...row, campaign_id: '', adset_id: '' };
  }
  return row;
}

export function attachCatalogIds(rows = [], catalog = []) {
  if (!catalog.length) return rows;
  return rows.map((row) => {
    const campaignMatch = matchName(row.campaign_name, catalog);
    if (campaignMatch.status !== 'exact') return clearStaleCampaign(row, catalog);
    const withCampaign = applyCampaignPick(row, campaignMatch.exact);
    if (!row.adset_name) return withCampaign;
    const adsetMatch = matchName(row.adset_name, campaignMatch.exact.adsets || []);
    if (adsetMatch.status === 'exact') return applyAdsetPick(withCampaign, adsetMatch.exact, campaignMatch.exact);
    if (withCampaign.adset_id && !(campaignMatch.exact.adsets || []).some((adset) => adset.id === withCampaign.adset_id)) {
      return { ...withCampaign, adset_id: '' };
    }
    return withCampaign;
  });
}

export function catalogRowKey(row = {}) {
  return `${row.campaign_id || ''}|${row.campaign_name || ''}|${row.adset_id || ''}|${row.adset_name || ''}`;
}

export function catalogsChanged(before = [], after = []) {
  if (before.length !== after.length) return true;
  return before.some((row, index) => catalogRowKey(row) !== catalogRowKey(after[index]));
}
