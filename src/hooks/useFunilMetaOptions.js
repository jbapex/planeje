import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const campaignsCache = new Map();
const adSetsCache = new Map();
const adsCache = new Map();

function cacheKey(prefix, ...parts) {
  return `${prefix}:${parts.filter(Boolean).join(':')}`;
}

/**
 * Contas Meta vinculadas ao cliente + campanhas/anúncios via meta-ads-api.
 */
export function useFunilMetaOptions(clienteId) {
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [adSets, setAdSets] = useState([]);
  const [loadingAdSets, setLoadingAdSets] = useState(false);
  const [adSetsError, setAdSetsError] = useState(null);
  const [ads, setAds] = useState([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [campaignsError, setCampaignsError] = useState(null);
  const [adsError, setAdsError] = useState(null);

  const fetchLinkedAccounts = useCallback(async () => {
    if (!clienteId) {
      setLinkedAccounts([]);
      return [];
    }
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from('cliente_meta_accounts')
        .select('id, meta_account_id, meta_account_name')
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data || []).map((row) => ({
        id: row.meta_account_id,
        meta_account_id: row.meta_account_id,
        meta_account_name: row.meta_account_name,
        linkId: row.id,
      }));
      setLinkedAccounts(list);
      return list;
    } catch (err) {
      console.error('[useFunilMetaOptions] accounts', err);
      setLinkedAccounts([]);
      return [];
    } finally {
      setLoadingAccounts(false);
    }
  }, [clienteId]);

  useEffect(() => {
    fetchLinkedAccounts();
  }, [fetchLinkedAccounts]);

  const fetchCampaigns = useCallback(
    async (accountId, { force = false } = {}) => {
      if (!accountId) {
        setCampaigns([]);
        return [];
      }
      const key = cacheKey('campaigns', accountId);
      if (!force && campaignsCache.has(key)) {
        const cached = campaignsCache.get(key);
        setCampaigns(cached);
        return cached;
      }

      setLoadingCampaigns(true);
      setCampaignsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-campaigns',
            adAccountId: accountId,
            metrics: 'spend',
          },
        });

        if (error) throw error;
        if (data?.error?.message) {
          throw new Error(data.error.message);
        }

        const list = (data?.campaigns || []).map((c) => ({
          id: c.id,
          name: c.name || c.id,
          status: c.effective_status || c.status,
        }));
        campaignsCache.set(key, list);
        setCampaigns(list);
        return list;
      } catch (err) {
        setCampaignsError(err.message || 'Erro ao carregar campanhas');
        setCampaigns([]);
        return [];
      } finally {
        setLoadingCampaigns(false);
      }
    },
    []
  );

  const fetchAdSets = useCallback(
    async (campaignId, { force = false } = {}) => {
      if (!campaignId) {
        setAdSets([]);
        return [];
      }
      const key = cacheKey('adsets', campaignId);
      if (!force && adSetsCache.has(key)) {
        const cached = adSetsCache.get(key);
        setAdSets(cached);
        return cached;
      }

      setLoadingAdSets(true);
      setAdSetsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-adsets', campaignId, skipInsights: true },
        });
        if (error) throw error;
        if (data?.error?.message) throw new Error(data.error.message);

        const list = (data?.adsets || data?.ad_sets || []).map((a) => ({
          id: a.id,
          name: a.name || a.id,
          status: a.effective_status || a.status,
        }));
        adSetsCache.set(key, list);
        setAdSets(list);
        return list;
      } catch (err) {
        setAdSetsError(err.message || 'Erro ao carregar conjuntos');
        setAdSets([]);
        return [];
      } finally {
        setLoadingAdSets(false);
      }
    },
    []
  );

  const fetchAds = useCallback(
    async (campaignId, { force = false, adSetId } = {}) => {
      if (!campaignId) {
        setAds([]);
        return [];
      }
      const key = cacheKey('ads', campaignId);
      if (!force && adsCache.has(key)) {
        const cached = adsCache.get(key);
        setAds(cached);
        return cached;
      }

      setLoadingAds(true);
      setAdsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-ads',
            campaignId,
            adSetId: adSetId || undefined,
            skipInsights: true,
          },
        });

        if (error) throw error;
        if (data?.error?.message) {
          throw new Error(data.error.message);
        }

        const list = (data?.ads || []).map((a) => ({
          id: a.id,
          name: a.name || a.id,
          status: a.effective_status || a.status,
        }));
        adsCache.set(key, list);
        setAds(list);
        return list;
      } catch (err) {
        setAdsError(err.message || 'Erro ao carregar anúncios');
        setAds([]);
        return [];
      } finally {
        setLoadingAds(false);
      }
    },
    []
  );

  const clearCampaigns = useCallback(() => {
    setCampaigns([]);
    setCampaignsError(null);
  }, []);

  const clearAdSets = useCallback(() => {
    setAdSets([]);
    setAdSetsError(null);
  }, []);

  const clearAds = useCallback(() => {
    setAds([]);
    setAdsError(null);
  }, []);

  const invalidateCache = useCallback(() => {
    campaignsCache.clear();
    adSetsCache.clear();
    adsCache.clear();
  }, []);

  return {
    linkedAccounts,
    loadingAccounts,
    campaigns,
    loadingCampaigns,
    campaignsError,
    adSets,
    loadingAdSets,
    adSetsError,
    ads,
    loadingAds,
    adsError,
    fetchLinkedAccounts,
    fetchCampaigns,
    fetchAdSets,
    fetchAds,
    clearCampaigns,
    clearAdSets,
    clearAds,
    invalidateCache,
    hasLinkedAccounts: linkedAccounts.length > 0,
  };
}
