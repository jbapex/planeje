import { supabase } from '@/lib/customSupabaseClient';
import { explainMetaTokenError } from '@/lib/metaAgencyToken';
import { catalogAccountKey, catalogFromCampaigns, catalogFromGoogleAds } from '@/lib/trafficSheetCatalog';

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export { catalogAccountKey, metaCatalogAccountKey } from '@/lib/trafficSheetCatalog';

export function emptyCatalogState(status = 'idle', error = '') {
  return { campaigns: [], status, error };
}

function fromMetaPayload(data, error) {
  const payload = error || data?.error;
  if (payload) {
    const code = String(payload.code || '');
    const status = code === 'TOKEN_NOT_FOUND' || /TOKEN_NOT_FOUND|not found in Vault/i.test(String(payload.message || ''))
      ? 'no-token'
      : 'error';
    return emptyCatalogState(status, explainMetaTokenError(payload));
  }
  return { campaigns: catalogFromCampaigns(data?.campaigns), status: 'ok', error: '' };
}

function fromGooglePayload(data, error) {
  const payload = error || data?.error;
  if (payload) {
    return emptyCatalogState('error', String(payload.message || payload || 'Não foi possível ler as campanhas do Google Ads.'));
  }
  return { campaigns: catalogFromGoogleAds(data?.campaigns, data?.adGroups), status: 'ok', error: '' };
}

export async function loadCampaignCatalog(accountId, platform = 'meta') {
  if (platform === 'google') {
    const key = catalogAccountKey(accountId, 'google');
    if (!key) return emptyCatalogState('idle');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const { data, error } = await supabase.functions.invoke('google-ads-api', {
      body: { action: 'list-campaign-catalog', customerId: key.replace(/^google:/, '') },
    });
    const value = fromGooglePayload(data, error);
    if (value.status === 'ok') cache.set(key, { at: Date.now(), value });
    return value;
  }
  if (platform && platform !== 'meta') return emptyCatalogState('skipped');
  const key = catalogAccountKey(accountId, 'meta');
  if (!key) return emptyCatalogState('idle');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const { data, error } = await supabase.functions.invoke('meta-ads-api', {
    body: { action: 'list-campaign-catalog', adAccountId: key },
  });
  const value = fromMetaPayload(data, error);
  if (value.status === 'ok') cache.set(key, { at: Date.now(), value });
  return value;
}
