import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const campaignsCache = new Map();
const adGroupsCache = new Map();
const keywordsCache = new Map();

function cacheKey(prefix, ...parts) {
  return `${prefix}:${parts.filter(Boolean).join(':')}`;
}

/**
 * Contas Google Ads vinculadas ao cliente + campanhas via google-ads-api.
 */
export function useFunilGoogleOptions(clienteId) {
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState(null);
  const [adGroups, setAdGroups] = useState([]);
  const [loadingAdGroups, setLoadingAdGroups] = useState(false);
  const [adGroupsError, setAdGroupsError] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsError, setKeywordsError] = useState(null);

  const fetchLinkedAccounts = useCallback(async () => {
    if (!clienteId) {
      setLinkedAccounts([]);
      return [];
    }
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from('cliente_google_ads_accounts')
        .select('id, google_customer_id, google_customer_name')
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data || []).map((row) => ({
        id: row.google_customer_id,
        google_customer_id: row.google_customer_id,
        google_customer_name: row.google_customer_name,
        linkId: row.id,
      }));
      setLinkedAccounts(list);
      return list;
    } catch (err) {
      console.error('[useFunilGoogleOptions] accounts', err);
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
    async (customerId, { force = false } = {}) => {
      if (!customerId) {
        setCampaigns([]);
        return [];
      }
      const key = cacheKey('gads-campaigns', customerId);
      if (!force && campaignsCache.has(key)) {
        const cached = campaignsCache.get(key);
        setCampaigns(cached);
        return cached;
      }

      setLoadingCampaigns(true);
      setCampaignsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('google-ads-api', {
          body: {
            action: 'get-campaigns',
            customerId: String(customerId).replace(/\D/g, ''),
          },
        });

        if (error) throw error;
        if (data?.error?.message) {
          throw new Error(data.error.message);
        }

        const list = (data?.campaigns || []).map((c) => ({
          id: String(c.id),
          name: c.name || c.id,
          status: c.status,
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

  const fetchAdGroups = useCallback(
    async (customerId, campaignId, { force = false } = {}) => {
      if (!customerId || !campaignId) {
        setAdGroups([]);
        return [];
      }
      const key = cacheKey('gads-adgroups', customerId, campaignId);
      if (!force && adGroupsCache.has(key)) {
        const cached = adGroupsCache.get(key);
        setAdGroups(cached);
        return cached;
      }
      setLoadingAdGroups(true);
      setAdGroupsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('google-ads-api', {
          body: {
            action: 'get-ad-groups',
            customerId: String(customerId).replace(/\D/g, ''),
            campaignId: String(campaignId),
          },
        });
        if (error) throw error;
        if (data?.error?.message) throw new Error(data.error.message);
        const list = (data?.adGroups || []).map((g) => ({
          id: String(g.id),
          name: g.name || g.id,
          status: g.status,
        }));
        adGroupsCache.set(key, list);
        setAdGroups(list);
        return list;
      } catch (err) {
        setAdGroupsError(err.message || 'Erro ao carregar grupos');
        setAdGroups([]);
        return [];
      } finally {
        setLoadingAdGroups(false);
      }
    },
    []
  );

  const fetchKeywords = useCallback(
    async (customerId, campaignId, adGroupId, { force = false } = {}) => {
      if (!customerId || !campaignId) {
        setKeywords([]);
        return [];
      }
      const key = cacheKey('gads-kw', customerId, campaignId, adGroupId);
      if (!force && keywordsCache.has(key)) {
        const cached = keywordsCache.get(key);
        setKeywords(cached);
        return cached;
      }
      setLoadingKeywords(true);
      setKeywordsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('google-ads-api', {
          body: {
            action: 'get-keywords',
            customerId: String(customerId).replace(/\D/g, ''),
            campaignId: String(campaignId),
            adGroupId: adGroupId ? String(adGroupId) : undefined,
          },
        });
        if (error) throw error;
        if (data?.error?.message) throw new Error(data.error.message);
        const list = (data?.keywords || []).map((k) => ({
          id: String(k.id || k.text),
          text: k.text,
          matchType: k.matchType,
        }));
        keywordsCache.set(key, list);
        setKeywords(list);
        return list;
      } catch (err) {
        setKeywordsError(err.message || 'Erro ao carregar keywords');
        setKeywords([]);
        return [];
      } finally {
        setLoadingKeywords(false);
      }
    },
    []
  );

  const clearCampaigns = useCallback(() => {
    setCampaigns([]);
    setCampaignsError(null);
  }, []);

  const clearAdGroups = useCallback(() => {
    setAdGroups([]);
    setAdGroupsError(null);
  }, []);

  const clearKeywords = useCallback(() => {
    setKeywords([]);
    setKeywordsError(null);
  }, []);

  const invalidateCache = useCallback(() => {
    campaignsCache.clear();
    adGroupsCache.clear();
    keywordsCache.clear();
  }, []);

  return {
    linkedAccounts,
    loadingAccounts,
    campaigns,
    loadingCampaigns,
    campaignsError,
    adGroups,
    loadingAdGroups,
    adGroupsError,
    keywords,
    loadingKeywords,
    keywordsError,
    fetchLinkedAccounts,
    fetchCampaigns,
    fetchAdGroups,
    fetchKeywords,
    clearCampaigns,
    clearAdGroups,
    clearKeywords,
    invalidateCache,
    hasLinkedAccounts: linkedAccounts.length > 0,
  };
}
