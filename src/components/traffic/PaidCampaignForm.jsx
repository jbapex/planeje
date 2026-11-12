import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Save, Building, User, DollarSign, Layers, Plus, FileText, Package, Box, Calendar as CalendarIcon, Repeat, Coins, Link as LinkIcon, Paperclip, Info, Target, Trash2, DownloadCloud, RefreshCw, Loader2, Link2, AlertTriangle } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Calendar } from "@/components/ui/calendar";
    import { Textarea } from '@/components/ui/textarea';
    import { format } from "date-fns";
    import { cn } from "@/lib/utils";
    import { supabase } from '@/lib/customSupabaseClient';
    import {
      getMetaGraphRateLimitHint,
      isMetaGraphRateLimited,
      isMetaGraphRateLimitMessage,
    } from '@/lib/metaAdAccountsResponse';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Badge } from '@/components/ui/badge';
    import { resolvePrimaryCampaignTaskId } from '@/lib/paidCampaignTaskLinks';

    function normalizeActId(id) {
      if (!id) return '';
      const s = String(id);
      return s.startsWith('act_') ? s : `act_${s.replace(/^act_/, '')}`;
    }

    /** IDs do Graph (campanha, conjunto, anúncio) como string — evita Radix Select sem valor correspondente. */
    function normalizeGraphId(id) {
      if (id == null || id === '') return '';
      return String(id);
    }

    /** Pré-preenche cache Meta a partir do vínculo já gravado no anúncio (sem chamar o Graph ao reabrir). */
    function buildMetaCacheSnapshotFromLinkedAd(main) {
      if (!main?.meta_account_id || !main.meta_campaign_id || !main.meta_adset_id || !main.meta_ad_id) {
        return null;
      }
      const acct = normalizeActId(main.meta_account_id);
      const campN = normalizeGraphId(main.meta_campaign_id);
      const adsetN = normalizeGraphId(main.meta_adset_id);
      const adN = normalizeGraphId(main.meta_ad_id);
      return {
        [acct]: {
          snapOnly: true,
          campaigns: [
            {
              id: campN,
              name: main.meta_campaign_name || `Campanha ${campN}`,
              effective_status: 'ACTIVE',
              status: 'ACTIVE',
            },
          ],
          campaignsLoaded: true,
          adsetsByCampaign: {
            [campN]: {
              loaded: true,
              snapshot: true,
              adsets: [
                {
                  id: adsetN,
                  name: main.meta_adset_name || `Conjunto ${adsetN}`,
                  effective_status: 'ACTIVE',
                  status: 'ACTIVE',
                },
              ],
            },
          },
          adsByAdset: {
            [adsetN]: {
              loaded: true,
              snapshot: true,
              ads: [
                {
                  id: adN,
                  name: main.meta_ad_name || `Anúncio ${adN}`,
                  effective_status: main.meta_ad_status || 'ACTIVE',
                  status: 'ACTIVE',
                },
              ],
            },
          },
        },
      };
    }

    /** Evita chamar get-ad a cada abertura se já sincronizou há pouco. */
    function isMetaAdSyncedRecently(main, maxAgeMs = 8 * 60 * 60 * 1000) {
      if (!main?.meta_ad_synced_at) return false;
      const t = new Date(main.meta_ad_synced_at).getTime();
      if (Number.isNaN(t)) return false;
      return Date.now() - t < maxAgeMs;
    }

    function locateAdIndices(adSets, adId) {
      if (!Array.isArray(adSets) || adSets.length === 0) return { setIdx: 0, adIdx: 0 };
      for (let si = 0; si < adSets.length; si++) {
        const ads = adSets[si]?.ads || [];
        for (let ai = 0; ai < ads.length; ai++) {
          if (adId && ads[ai].id === adId) return { setIdx: si, adIdx: ai };
        }
      }
      return { setIdx: 0, adIdx: 0 };
    }

    /** Garante que o ID gravado na BD aparece no Select mesmo se estiver pausado ou a API não devolver a linha. */
    function mergeLinkedMetaPickerRow(rawList, filteredList, linkedId, linkedName) {
      if (!linkedId) return filteredList;
      const row = rawList.find((x) => String(x.id) === String(linkedId));
      if (row && !filteredList.some((x) => String(x.id) === String(linkedId))) {
        return [...filteredList, row];
      }
      if (!row && linkedName) {
        return [
          ...filteredList,
          {
            id: linkedId,
            name: linkedName,
            effective_status: '—',
            status: '—',
          },
        ];
      }
      return filteredList;
    }

    const PaidCampaignForm = ({
      campaign,
      clients = [],
      users = [],
      tasks = [],
      tasksById = {},
      onSave,
      onClose,
      campaigns: allCampaigns,
      onDataChange,
    }) => {
      const [formData, setFormData] = useState({});
      const [selectedCampaignId, setSelectedCampaignId] = useState('');
      const [selectedAdSetId, setSelectedAdSetId] = useState('');
      const [newCampaignName, setNewCampaignName] = useState('');
      const [newAdSetName, setNewAdSetName] = useState('');
      const [selectedAd, setSelectedAd] = useState(null);
      const [kpis, setKpis] = useState([]);
      const [isFetchingAttachments, setIsFetchingAttachments] = useState(false);
      const [isCreating, setIsCreating] = useState(false);
      const { toast } = useToast();
      const { user } = useAuth();
      const campaignRef = useRef(campaign);
      useEffect(() => {
        campaignRef.current = campaign;
      }, [campaign]);

      const [metaLinkedAccounts, setMetaLinkedAccounts] = useState([]);
      const [selectedMetaAccountId, setSelectedMetaAccountId] = useState('');
      const [selectedMetaCampaignId, setSelectedMetaCampaignId] = useState('');
      const [selectedMetaAdsetId, setSelectedMetaAdsetId] = useState('');
      const [selectedMetaAdId, setSelectedMetaAdId] = useState('');
      const [metaCache, setMetaCache] = useState({});
      const [includePausedMeta, setIncludePausedMeta] = useState(false);
      const [loadingMetaCampaigns, setLoadingMetaCampaigns] = useState(false);
      const [loadingMetaAdsets, setLoadingMetaAdsets] = useState(false);
      const [loadingMetaAds, setLoadingMetaAds] = useState(false);
      const metaCacheRef = useRef({});
      const prevMetaClientIdRef = useRef(null);
      const backfillAdsetKeyRef = useRef(null);
      const selectedAdRef = useRef(null);
      const metaAdsetFetchTimerRef = useRef(null);
      const metaAdsFetchTimerRef = useRef(null);

      const invokeMetaAdsApiWithRetry = useCallback(async (body) => {
        const maxAttempts = 3;
        let last = { data: null, error: null };
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
          const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });
          last = { data, error };
          if (!error && !data?.error) return { data, error: null };
          const msg =
            error?.message ||
            (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
            '';
          const limited = isMetaGraphRateLimited(data) || isMetaGraphRateLimitMessage(msg);
          if (!limited) return { data, error };
        }
        return last;
      }, []);
      useEffect(() => {
        metaCacheRef.current = metaCache;
      }, [metaCache]);
      useEffect(() => {
        selectedAdRef.current = selectedAd;
      }, [selectedAd]);

      const clientTasks = useMemo(() => {
        if (!formData.client_id) return [];
        return tasks.filter(t => t.client_id === formData.client_id);
      }, [formData.client_id, tasks]);

      const clientCampaigns = useMemo(() => {
        if (!formData.client_id) return [];
        return allCampaigns.filter(c => c.client_id === formData.client_id);
      }, [formData.client_id, allCampaigns]);

      /** Garante que a campanha aberta no editor aparece no select mesmo fora do slice de allCampaigns. */
      const clientCampaignsForSelect = useMemo(() => {
        if (!formData.client_id) return [];
        const list = allCampaigns.filter((c) => c.client_id === formData.client_id);
        if (campaign?.id && campaign.client_id === formData.client_id && !list.some((c) => c.id === campaign.id)) {
          return [campaign, ...list];
        }
        if (campaign?.id && campaign.client_id === formData.client_id) {
          return list.map((c) => (c.id === campaign.id ? { ...c, ...campaign } : c));
        }
        return list;
      }, [formData.client_id, allCampaigns, campaign?.id, campaign?.client_id, campaign]);

      const adSetsForSelectedCampaign = useMemo(() => {
        if (selectedCampaignId === 'new' || !selectedCampaignId) return [];
        if (campaign?.id === selectedCampaignId && Array.isArray(campaign.ad_sets)) {
          return campaign.ad_sets;
        }
        const foundCampaign = clientCampaignsForSelect.find((c) => c.id === selectedCampaignId);
        return foundCampaign?.ad_sets || [];
      }, [selectedCampaignId, clientCampaignsForSelect, campaign?.id, campaign?.ad_sets]);

      const getInitialAd = (campaign) => {
        if (campaign?.ad_sets?.length > 0 && campaign.ad_sets[0].ads?.length > 0) {
          return campaign.ad_sets[0].ads[0];
        }
        return null;
      };

      useEffect(() => {
        const initialAd = getInitialAd(campaign);
        setSelectedAd(initialAd);

        setFormData({
            client_id: campaign?.client_id || '',
            assignee_id: campaign?.assignee_id || '',
            task_id: resolvePrimaryCampaignTaskId(campaign) || '',
            ad_name: initialAd?.name || '',
            description: initialAd?.description || '',
            attachments: initialAd?.attachments || [],
            budget: initialAd?.budget || campaign?.budget || '',
            budget_level: initialAd?.budget_level || 'campaign',
            budget_type: initialAd?.budget_type || 'total',
            start_date: initialAd?.start_date ? new Date(initialAd.start_date) : null,
            end_date: initialAd?.end_date ? new Date(initialAd.end_date) : null,
        });
        setKpis(campaign?.kpis || []);
        setSelectedCampaignId(campaign?.id || '');
        setSelectedAdSetId(campaign?.ad_sets?.[0]?.id || '');
      }, [campaign]);

      const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
      };
      
      const handleKpiChange = (index, field, value) => {
        const newKpis = [...kpis];
        newKpis[index][field] = value;
        setKpis(newKpis);
      };

      const addKpi = () => {
        setKpis([...kpis, { name: '', target: '', current: '' }]);
      };

      const removeKpi = (index) => {
        const newKpis = kpis.filter((_, i) => i !== index);
        setKpis(newKpis);
      };
      
      const fetchAttachments = useCallback(async () => {
        if (!formData.task_id) return;
        setIsFetchingAttachments(true);
        const { data, error } = await supabase
            .from('task_attachments')
            .select('name, url')
            .eq('task_id', formData.task_id);

        if (!error && data) {
            handleChange('attachments', data);
        }
        setIsFetchingAttachments(false);
      }, [formData.task_id]);

      const applyMetaAdPatch = useCallback(
        async (patch, { silent = false, refresh = true } = {}) => {
          const c = campaignRef.current;
          if (!c?.id) return { error: new Error('Sem campanha') };
          const adSets = JSON.parse(JSON.stringify(c.ad_sets || []));
          const { setIdx, adIdx } = locateAdIndices(adSets, selectedAdRef.current?.id);
          if (!adSets[setIdx]?.ads?.[adIdx]) {
            const err = new Error('Anúncio não encontrado na estrutura');
            if (!silent) toast({ title: 'Erro', description: err.message, variant: 'destructive' });
            return { error: err };
          }
          adSets[setIdx].ads[adIdx] = { ...adSets[setIdx].ads[adIdx], ...patch };
          const { error } = await supabase.from('paid_campaigns').update({ ad_sets: adSets }).eq('id', c.id);
          if (error) {
            if (!silent) toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
            return { error };
          }
          if (refresh && onDataChange) await onDataChange();
          return { error: null };
        },
        [toast, onDataChange]
      );

      useEffect(() => {
        const main = getInitialAd(campaign);
        if (!campaign?.id || !main?.meta_ad_id || main.meta_adset_id) return;
        const key = `${campaign.id}:${normalizeGraphId(main.meta_ad_id)}`;
        if (backfillAdsetKeyRef.current?.startsWith(key)) return;
        let cancelled = false;
        (async () => {
          const { data, error } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-ad', adId: normalizeGraphId(main.meta_ad_id) },
          });
          if (cancelled) return;
          if (error || data?.error || !data?.ad?.adset_id) {
            backfillAdsetKeyRef.current = `${key}:failed`;
            return;
          }
          backfillAdsetKeyRef.current = key;
          const adsetId = normalizeGraphId(data.ad.adset_id);
          setSelectedMetaAdsetId(adsetId);
          await applyMetaAdPatch(
            { meta_adset_id: adsetId, meta_ad_synced_at: new Date().toISOString() },
            { silent: true, refresh: true }
          );
        })();
        return () => {
          cancelled = true;
        };
      }, [campaign?.id, campaign?.ad_sets, applyMetaAdPatch]);

      const fetchMetaCampaigns = useCallback(async (rawAccountId, { force = false } = {}) => {
        if (!rawAccountId || !campaignRef.current?.id) return;
        const acct = normalizeActId(rawAccountId);
        if (!force && metaCacheRef.current[acct]?.campaignsLoaded) return;
        setLoadingMetaCampaigns(true);
        try {
          const { data, error } = await invokeMetaAdsApiWithRetry({
            action: 'get-campaigns',
            adAccountId: acct,
          });
          if (error) throw error;
          if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message);
          const list = Array.isArray(data?.campaigns) ? data.campaigns : [];
          setMetaCache((prev) => ({
            ...prev,
            [acct]: {
              ...prev[acct],
              snapOnly: false,
              campaigns: list,
              campaignsLoaded: true,
              adsetsByCampaign: prev[acct]?.adsetsByCampaign || {},
              adsByAdset: prev[acct]?.adsByAdset || {},
            },
          }));
        } catch (e) {
          console.warn('[PaidCampaignForm] get-campaigns:', e);
          toast({
            title: 'Erro ao carregar campanhas Meta',
            description: isMetaGraphRateLimitMessage(e?.message)
              ? getMetaGraphRateLimitHint()
              : e?.message || 'Falha na API',
            variant: 'destructive',
          });
        } finally {
          setLoadingMetaCampaigns(false);
        }
      }, [toast, invokeMetaAdsApiWithRetry]);

      const fetchMetaAdsets = useCallback(async (rawAccountId, campaignGraphId, { force = false } = {}) => {
        if (!rawAccountId || !campaignGraphId || !campaignRef.current?.id) return;
        const acct = normalizeActId(rawAccountId);
        const campKey = normalizeGraphId(campaignGraphId);
        if (!force && metaCacheRef.current[acct]?.adsetsByCampaign?.[campKey]?.loaded) return;
        setLoadingMetaAdsets(true);
        try {
          const { data, error } = await invokeMetaAdsApiWithRetry({
            action: 'get-adsets',
            campaignId: campaignGraphId,
            skipInsights: true,
          });
          if (error) throw error;
          if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message);
          const list = Array.isArray(data?.adsets) ? data.adsets : [];
          setMetaCache((prev) => ({
            ...prev,
            [acct]: {
              ...prev[acct],
              snapOnly: false,
              campaigns: prev[acct]?.campaigns || [],
              campaignsLoaded: prev[acct]?.campaignsLoaded,
              adsetsByCampaign: {
                ...(prev[acct]?.adsetsByCampaign || {}),
                [campKey]: { adsets: list, loaded: true },
              },
              adsByAdset: prev[acct]?.adsByAdset || {},
            },
          }));
        } catch (e) {
          console.warn('[PaidCampaignForm] get-adsets:', e);
          toast({
            title: 'Erro ao carregar conjuntos Meta',
            description: isMetaGraphRateLimitMessage(e?.message)
              ? getMetaGraphRateLimitHint()
              : e?.message || 'Falha na API',
            variant: 'destructive',
          });
        } finally {
          setLoadingMetaAdsets(false);
        }
      }, [toast, invokeMetaAdsApiWithRetry]);

      const fetchMetaAds = useCallback(async (rawAccountId, adsetGraphId, { force = false } = {}) => {
        if (!rawAccountId || !adsetGraphId || !campaignRef.current?.id) return;
        const acct = normalizeActId(rawAccountId);
        const adsetKey = normalizeGraphId(adsetGraphId);
        if (!force && metaCacheRef.current[acct]?.adsByAdset?.[adsetKey]?.loaded) return;
        setLoadingMetaAds(true);
        try {
          const { data, error } = await invokeMetaAdsApiWithRetry({
            action: 'get-ads',
            adsetId: adsetKey,
            skipInsights: true,
          });
          if (error) throw error;
          if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message);
          const list = Array.isArray(data?.ads) ? data.ads : [];
          setMetaCache((prev) => ({
            ...prev,
            [acct]: {
              ...prev[acct],
              snapOnly: false,
              campaigns: prev[acct]?.campaigns || [],
              campaignsLoaded: prev[acct]?.campaignsLoaded,
              adsetsByCampaign: prev[acct]?.adsetsByCampaign || {},
              adsByAdset: {
                ...(prev[acct]?.adsByAdset || {}),
                [adsetKey]: { ads: list, loaded: true },
              },
            },
          }));
        } catch (e) {
          console.warn('[PaidCampaignForm] get-ads:', e);
          toast({
            title: 'Erro ao carregar anúncios Meta',
            description: isMetaGraphRateLimitMessage(e?.message)
              ? getMetaGraphRateLimitHint()
              : e?.message || 'Falha na API',
            variant: 'destructive',
          });
        } finally {
          setLoadingMetaAds(false);
        }
      }, [toast, invokeMetaAdsApiWithRetry]);

      useEffect(() => {
        backfillAdsetKeyRef.current = null;
        setIncludePausedMeta(false);
        if (!campaign?.id) {
          setMetaCache({});
          return;
        }
        const main = getInitialAd(campaign);
        const snap = buildMetaCacheSnapshotFromLinkedAd(main);
        if (snap) {
          const acct = Object.keys(snap)[0];
          setMetaCache((prev) => {
            const cur = prev[acct];
            if (cur?.campaignsLoaded && cur.snapOnly !== true) {
              return prev;
            }
            return { ...prev, ...snap };
          });
          return;
        }
        setMetaCache({});
      }, [campaign?.id, campaign?.ad_sets]);

      useEffect(() => {
        const prev = prevMetaClientIdRef.current;
        prevMetaClientIdRef.current = formData.client_id;
        if (prev && formData.client_id && prev !== formData.client_id) {
          setMetaCache({});
          setSelectedMetaAccountId('');
          setSelectedMetaCampaignId('');
          setSelectedMetaAdsetId('');
          setSelectedMetaAdId('');
          setIncludePausedMeta(false);
        }
      }, [formData.client_id]);

      useEffect(() => {
        if (!campaign?.id || !formData.client_id) {
          setMetaLinkedAccounts([]);
          return;
        }
        let cancelled = false;
        (async () => {
          const { data, error } = await supabase
            .from('cliente_meta_accounts')
            .select('meta_account_id, meta_account_name')
            .eq('cliente_id', formData.client_id)
            .eq('is_active', true);
          if (cancelled) return;
          if (error) {
            console.warn(error);
            setMetaLinkedAccounts([]);
            return;
          }
          setMetaLinkedAccounts(data || []);
        })();
        return () => {
          cancelled = true;
        };
      }, [campaign?.id, formData.client_id]);

      useEffect(() => {
        if (campaign?.id && metaLinkedAccounts.length === 1 && !selectedMetaAccountId) {
          setSelectedMetaAccountId(normalizeActId(metaLinkedAccounts[0].meta_account_id));
        }
      }, [campaign?.id, metaLinkedAccounts, selectedMetaAccountId]);

      useEffect(() => {
        const main = getInitialAd(campaign);
        if (!campaign?.id || !main) return;
        if (main.meta_account_id) setSelectedMetaAccountId(normalizeActId(main.meta_account_id));
        if (main.meta_campaign_id != null && main.meta_campaign_id !== '') {
          setSelectedMetaCampaignId(normalizeGraphId(main.meta_campaign_id));
        }
        if (main.meta_adset_id != null && main.meta_adset_id !== '') {
          setSelectedMetaAdsetId(normalizeGraphId(main.meta_adset_id));
        }
        if (main.meta_ad_id != null && main.meta_ad_id !== '') {
          setSelectedMetaAdId(normalizeGraphId(main.meta_ad_id));
        }
      }, [campaign?.id, campaign?.ad_sets]);

      useEffect(() => {
        if (!campaign?.id || !selectedMetaAccountId) return;
        fetchMetaCampaigns(selectedMetaAccountId, { force: false });
      }, [campaign?.id, selectedMetaAccountId, fetchMetaCampaigns]);

      useEffect(() => {
        if (!campaign?.id || !selectedMetaAccountId || !selectedMetaCampaignId) return;
        if (metaAdsetFetchTimerRef.current) clearTimeout(metaAdsetFetchTimerRef.current);
        metaAdsetFetchTimerRef.current = setTimeout(() => {
          metaAdsetFetchTimerRef.current = null;
          fetchMetaAdsets(selectedMetaAccountId, selectedMetaCampaignId, { force: false });
        }, 450);
        return () => {
          if (metaAdsetFetchTimerRef.current) {
            clearTimeout(metaAdsetFetchTimerRef.current);
            metaAdsetFetchTimerRef.current = null;
          }
        };
      }, [campaign?.id, selectedMetaAccountId, selectedMetaCampaignId, fetchMetaAdsets]);

      useEffect(() => {
        if (!campaign?.id || !selectedMetaAccountId || !selectedMetaAdsetId) return;
        if (metaAdsFetchTimerRef.current) clearTimeout(metaAdsFetchTimerRef.current);
        metaAdsFetchTimerRef.current = setTimeout(() => {
          metaAdsFetchTimerRef.current = null;
          fetchMetaAds(selectedMetaAccountId, selectedMetaAdsetId, { force: false });
        }, 450);
        return () => {
          if (metaAdsFetchTimerRef.current) {
            clearTimeout(metaAdsFetchTimerRef.current);
            metaAdsFetchTimerRef.current = null;
          }
        };
      }, [campaign?.id, selectedMetaAccountId, selectedMetaAdsetId, fetchMetaAds]);

      const staleMetaAdId = useMemo(
        () => campaign?.ad_sets?.[0]?.ads?.[0]?.meta_ad_id ?? null,
        [campaign?.id, campaign?.ad_sets]
      );

      useEffect(() => {
        const main = getInitialAd(campaign);
        if (!campaign?.id || !main?.meta_ad_id || !staleMetaAdId) return;
        if (isMetaAdSyncedRecently(main) && !main.meta_ad_broken) {
          return;
        }
        let cancelled = false;
        (async () => {
          const { data, error } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-ad', adId: main.meta_ad_id },
          });
          if (cancelled) return;
          if (error || data?.error || !data?.ad) {
            await applyMetaAdPatch(
              { meta_ad_broken: true, meta_ad_synced_at: new Date().toISOString() },
              { silent: true, refresh: false }
            );
            return;
          }
          const ad = data.ad;
          if (ad.adset_id && (!main.meta_adset_id || String(main.meta_adset_id) !== String(ad.adset_id))) {
            await applyMetaAdPatch(
              { meta_adset_id: ad.adset_id, meta_ad_synced_at: new Date().toISOString() },
              { silent: true, refresh: false }
            );
          }
          const nameChanged = (ad.name || '') !== (main.meta_ad_name || '');
          const stChanged = (ad.effective_status || '') !== (main.meta_ad_status || '');
          if (!nameChanged && !stChanged) {
            await applyMetaAdPatch(
              { meta_ad_synced_at: new Date().toISOString() },
              { silent: true, refresh: false }
            );
            return;
          }
          await applyMetaAdPatch(
            {
              meta_ad_name: ad.name,
              meta_ad_status: ad.effective_status,
              meta_ad_synced_at: new Date().toISOString(),
              meta_ad_broken: false,
            },
            { silent: true, refresh: false }
          );
          toast({
            title: 'Anúncio Meta atualizado',
            description: 'Nome ou status sincronizados com o Meta.',
            variant: 'default',
          });
        })();
        return () => {
          cancelled = true;
        };
      }, [campaign?.id, staleMetaAdId, applyMetaAdPatch, toast]);

      const metaAcctKey = selectedMetaAccountId ? normalizeActId(selectedMetaAccountId) : '';
      const rawMetaCampaigns = metaAcctKey ? metaCache[metaAcctKey]?.campaigns || [] : [];
      const rawMetaAdsets =
        metaAcctKey && selectedMetaCampaignId
          ? metaCache[metaAcctKey]?.adsetsByCampaign?.[normalizeGraphId(selectedMetaCampaignId)]?.adsets || []
          : [];
      const rawMetaAds =
        metaAcctKey && selectedMetaAdsetId
          ? metaCache[metaAcctKey]?.adsByAdset?.[normalizeGraphId(selectedMetaAdsetId)]?.ads || []
          : [];

      const linkedMainAd = useMemo(() => getInitialAd(campaign), [campaign?.id, campaign?.ad_sets]);

      const displayMetaCampaigns = useMemo(() => {
        const base = includePausedMeta
          ? rawMetaCampaigns
          : rawMetaCampaigns.filter((c) => c.effective_status === 'ACTIVE');
        return mergeLinkedMetaPickerRow(
          rawMetaCampaigns,
          base,
          linkedMainAd?.meta_campaign_id,
          linkedMainAd?.meta_campaign_name
        );
      }, [rawMetaCampaigns, includePausedMeta, linkedMainAd?.meta_campaign_id, linkedMainAd?.meta_campaign_name]);

      const displayMetaAdsets = useMemo(() => {
        const base = includePausedMeta
          ? rawMetaAdsets
          : rawMetaAdsets.filter((s) => s.effective_status === 'ACTIVE');
        return mergeLinkedMetaPickerRow(
          rawMetaAdsets,
          base,
          linkedMainAd?.meta_adset_id,
          linkedMainAd?.meta_adset_name
        );
      }, [rawMetaAdsets, includePausedMeta, linkedMainAd?.meta_adset_id, linkedMainAd?.meta_adset_name]);

      const displayMetaAds = useMemo(() => {
        const base = includePausedMeta
          ? rawMetaAds
          : rawMetaAds.filter((a) => a.effective_status === 'ACTIVE');
        return mergeLinkedMetaPickerRow(rawMetaAds, base, linkedMainAd?.meta_ad_id, linkedMainAd?.meta_ad_name);
      }, [rawMetaAds, includePausedMeta, linkedMainAd?.meta_ad_id, linkedMainAd?.meta_ad_name]);

      useEffect(() => {
        if (!campaign?.id || !linkedMainAd?.meta_campaign_id) return;
        const acct =
          (linkedMainAd.meta_account_id && normalizeActId(linkedMainAd.meta_account_id)) ||
          (selectedMetaAccountId && normalizeActId(selectedMetaAccountId));
        if (!acct) return;
        const list = metaCache[acct]?.campaigns;
        if (!list?.length) return;
        const c = list.find((x) => String(x.id) === String(linkedMainAd.meta_campaign_id));
        if (c && c.effective_status !== 'ACTIVE') setIncludePausedMeta(true);
      }, [campaign?.id, linkedMainAd?.meta_campaign_id, linkedMainAd?.meta_account_id, metaCache, selectedMetaAccountId]);

      const metaActiveCounts = useMemo(() => {
        const cAct = rawMetaCampaigns.filter((c) => c.effective_status === 'ACTIVE').length;
        const sAct = rawMetaAdsets.filter((s) => s.effective_status === 'ACTIVE').length;
        const aAct = rawMetaAds.filter((a) => a.effective_status === 'ACTIVE').length;
        return {
          c: `${cAct} ativas / ${rawMetaCampaigns.length} total`,
          s: `${sAct} ativos / ${rawMetaAdsets.length} total`,
          a: `${aAct} ativos / ${rawMetaAds.length} total`,
        };
      }, [rawMetaCampaigns, rawMetaAdsets, rawMetaAds]);

      /** Cache usa `normalizeGraphId` nas chaves; IDs do Graph podem vir como número — comparar com String(). */
      const buildMetaPersistPatch = useCallback(() => {
        if (!selectedMetaAccountId || !selectedMetaCampaignId || !selectedMetaAdsetId) return null;
        const acct = normalizeActId(selectedMetaAccountId);
        const campN = normalizeGraphId(selectedMetaCampaignId);
        const adsetN = normalizeGraphId(selectedMetaAdsetId);
        const adN = selectedMetaAdId ? normalizeGraphId(selectedMetaAdId) : '';
        const cList = metaCache[acct]?.campaigns || [];
        const cObj = cList.find((c) => String(c.id) === String(campN));
        const adsetList = metaCache[acct]?.adsetsByCampaign?.[campN]?.adsets || [];
        const adsetObj = adsetList.find((s) => String(s.id) === String(adsetN));
        const base = {
          meta_account_id: acct,
          meta_campaign_id: campN,
          meta_campaign_name: cObj?.name || '',
          meta_adset_id: adsetN,
          meta_adset_name: adsetObj?.name || '',
          meta_ad_synced_at: new Date().toISOString(),
          meta_ad_broken: false,
        };
        if (!adN) return base;
        const adsList = metaCache[acct]?.adsByAdset?.[adsetN]?.ads || [];
        const adObj = adsList.find((a) => String(a.id) === String(adN));
        return {
          ...base,
          meta_ad_id: adN,
          meta_ad_name: adObj?.name || adN,
          meta_ad_status: adObj?.effective_status || '',
          meta_linked_at: new Date().toISOString(),
        };
      }, [
        metaCache,
        selectedMetaAccountId,
        selectedMetaCampaignId,
        selectedMetaAdsetId,
        selectedMetaAdId,
      ]);

      const handleMetaLink = async () => {
        if (!selectedMetaAccountId || !selectedMetaCampaignId || !selectedMetaAdsetId || !selectedMetaAdId) {
          toast({ title: 'Selecione conta, campanha, conjunto e anúncio Meta', variant: 'destructive' });
          return;
        }
        const patch = buildMetaPersistPatch();
        if (!patch?.meta_ad_id) {
          toast({ title: 'Não foi possível montar o vínculo Meta', variant: 'destructive' });
          return;
        }
        const { error } = await applyMetaAdPatch(patch, { refresh: true });
        if (!error) {
          toast({ title: 'Vínculo Meta salvo', description: 'Anúncio ligado ao registro.', variant: 'default' });
        }
      };

      const handleMetaUnlink = async () => {
        const patch = {
          meta_account_id: null,
          meta_campaign_id: null,
          meta_campaign_name: null,
          meta_adset_id: null,
          meta_adset_name: null,
          meta_ad_id: null,
          meta_ad_name: null,
          meta_ad_status: null,
          meta_linked_at: null,
          meta_ad_synced_at: null,
          meta_ad_broken: false,
        };
        const { error } = await applyMetaAdPatch(patch, { refresh: true });
        if (!error) {
          setMetaCache({});
          setSelectedMetaCampaignId('');
          setSelectedMetaAdsetId('');
          setSelectedMetaAdId('');
          toast({ title: 'Vínculo Meta removido', variant: 'default' });
        }
      };

      useEffect(() => {
        const selectedTask = tasks.find(t => t.id === formData.task_id);
        if (selectedTask) {
            const currentAd = getInitialAd(campaign);
            const isNewAd = !currentAd;

            let description = isNewAd ? selectedTask.description : (currentAd.description || selectedTask.description);
            let attachments = isNewAd ? [] : (currentAd.attachments || []);

            if(isNewAd) {
                handleChange('ad_name', selectedTask.title);
            }

            setFormData(prev => ({
                ...prev,
                description,
                attachments
            }));
        }
      }, [formData.task_id, tasks, campaign]);

      const handleCreateCampaign = async () => {
        if (!newCampaignName.trim() || !formData.client_id) return;
        setIsCreating(true);
        const { data, error } = await supabase
          .from('paid_campaigns')
          .insert({
            name: newCampaignName,
            client_id: formData.client_id,
            owner_id: user.id,
            status: 'planning',
            ad_sets: [],
            kpis: []
          })
          .select()
          .single();
        
        if (error) {
          toast({ title: "Erro ao criar campanha", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Campanha criada com sucesso!" });
          setNewCampaignName('');
          await onDataChange();
          setSelectedCampaignId(data.id);
        }
        setIsCreating(false);
      };

      const handleCreateAdSet = async () => {
        if (!newAdSetName.trim() || !selectedCampaignId) return;
        setIsCreating(true);
        
        const targetCampaign = allCampaigns.find(c => c.id === selectedCampaignId);
        if (!targetCampaign) {
            toast({ title: "Campanha não encontrada", variant: "destructive" });
            setIsCreating(false);
            return;
        }

        const newAdSet = { id: crypto.randomUUID(), name: newAdSetName, ads: [] };
        const updatedAdSets = [...(targetCampaign.ad_sets || []), newAdSet];

        const { error } = await supabase
            .from('paid_campaigns')
            .update({ ad_sets: updatedAdSets })
            .eq('id', selectedCampaignId);

        if (error) {
            toast({ title: "Erro ao criar conjunto de anúncios", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Conjunto de anúncios criado com sucesso!" });
            setNewAdSetName('');
            await onDataChange();
            setSelectedAdSetId(newAdSet.id);
        }
        setIsCreating(false);
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        const finalData = {
            ...formData,
            kpis,
            isNewCampaign: selectedCampaignId === 'new',
            newCampaignName: newCampaignName,
            selectedCampaignId: campaign?.id || selectedCampaignId,
            isNewAdSet: selectedAdSetId === 'new',
            newAdSetName: newAdSetName,
            selectedAdSetId: campaign?.id ? (campaign.ad_sets?.[0]?.id || selectedAdSetId) : selectedAdSetId,
        };
        try {
          await Promise.resolve(onSave?.(finalData));
        } catch (err) {
          console.warn('[PaidCampaignForm] onSave:', err);
          return;
        }
        // A RPC `create_ad_from_structure` pode regravar `ad_sets` sem os campos Meta — reaplica o vínculo depois do save.
        const metaPatch = campaign?.id ? buildMetaPersistPatch() : null;
        if (metaPatch) {
          const { error } = await applyMetaAdPatch(metaPatch, { silent: true, refresh: true });
          if (error) {
            toast({
              title: 'Dados salvos, mas o Meta não sincronizou',
              description: error.message,
              variant: 'destructive',
            });
          }
        }
      };
      
      const isSaveDisabled = useMemo(() => {
        if (!formData.client_id || !formData.task_id) return true;
        if (campaign?.id) return false;
        if (!selectedCampaignId || selectedCampaignId === 'new') return true;
        if (!selectedAdSetId || selectedAdSetId === 'new') return true;
        return false;
      }, [formData, selectedCampaignId, selectedAdSetId, campaign]);


      return (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex justify-end">
            <motion.div initial={{ x: '100%' }} animate={{ x: '0%' }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="w-full max-w-3xl bg-gray-50 dark:bg-gray-800 h-full shadow-2xl">
              <form onSubmit={handleSubmit} className="h-full flex flex-col">
                <div className="flex justify-between items-center p-6 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{campaign?.id ? 'Detalhes do Anúncio' : 'Novo Anúncio'}</h2>
                  <Button type="button" variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
                </div>
                
                <div className="flex-grow p-6 overflow-y-auto space-y-6">
                  <div className="space-y-4 p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800/50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-white"><Layers className="w-5 h-5 text-blue-500"/> Etapa 1: Estrutura</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                      Organização interna no Planeje (cliente, campanha e conjunto do sistema). O vínculo com campanha/conjunto/anúncio reais do Meta fica na secção abaixo, em &quot;Vincular anúncio Meta Ads&quot;.
                    </p>
                    {campaign?.id &&
                      linkedMainAd &&
                      (linkedMainAd.meta_campaign_id || linkedMainAd.meta_ad_id) && (
                        <div className="rounded-md border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-xs text-gray-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-gray-200 space-y-1">
                          <div className="font-semibold text-violet-900 dark:text-violet-100 flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            Vínculo Meta (resumo gravado)
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Conta:</span>{' '}
                            {linkedMainAd.meta_account_id || '—'}
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Campanha Meta:</span>{' '}
                            {linkedMainAd.meta_campaign_name || linkedMainAd.meta_campaign_id || '—'}
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Conjunto Meta:</span>{' '}
                            {linkedMainAd.meta_adset_name || linkedMainAd.meta_adset_id || '—'}
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Anúncio Meta:</span>{' '}
                            {linkedMainAd.meta_ad_name || linkedMainAd.meta_ad_id || '—'}
                          </div>
                        </div>
                      )}
                    <div className="space-y-2">
                       <Label htmlFor="client_id" className="flex items-center gap-2 dark:text-gray-300"><Building className="w-4 h-4" /> Cliente</Label>
                       <Select value={formData.client_id} onValueChange={v => handleChange('client_id', v)}>
                         <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                         <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{clients.map(c => <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">{c.empresa}</SelectItem>)}</SelectContent>
                       </Select>
                    </div>

                    {formData.client_id && (
                        <>
                        <div className="space-y-2">
                           <Label className="flex items-center gap-2 dark:text-gray-300"><Package className="w-4 h-4" /> Campanha</Label>
                            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione ou crie uma campanha" /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="new" className="text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4 mr-2 inline-block"/>Criar Nova Campanha</SelectItem>
                                    {clientCampaignsForSelect.map((c) => (
                                      <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                           {selectedCampaignId === 'new' && (
                               <div className="flex items-center gap-2 mt-2">
                                   <Input value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} placeholder="Nome da nova campanha" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"/>
                                   <Button type="button" onClick={handleCreateCampaign} disabled={!newCampaignName.trim() || isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                                       {isCreating ? 'Criando...' : 'Criar'}
                                   </Button>
                               </div>
                           )}
                        </div>

                         <div className="space-y-2">
                           <Label className="flex items-center gap-2 dark:text-gray-300"><Box className="w-4 h-4" /> Conjunto de Anúncios</Label>
                            <Select value={selectedAdSetId} onValueChange={setSelectedAdSetId} disabled={!selectedCampaignId || selectedCampaignId === 'new'}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione ou crie um conjunto" /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="new" className="text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4 mr-2 inline-block"/>Criar Novo Conjunto</SelectItem>
                                    {adSetsForSelectedCampaign.map(as => <SelectItem key={as.id} value={as.id} className="dark:text-white dark:hover:bg-gray-600">{as.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                           {selectedAdSetId === 'new' && (
                               <div className="flex items-center gap-2 mt-2">
                                   <Input value={newAdSetName} onChange={e => setNewAdSetName(e.target.value)} placeholder="Nome do novo conjunto" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"/>
                                   <Button type="button" onClick={handleCreateAdSet} disabled={!newAdSetName.trim() || isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                                       {isCreating ? 'Criando...' : 'Criar'}
                                   </Button>
                               </div>
                           )}
                        </div>
                        </>
                    )}
                  </div>

                  <div className="space-y-6 p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800/50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-white"><FileText className="w-5 h-5 text-blue-500"/> Etapa 2: Detalhes do Anúncio</h3>
                    <div className="space-y-2">
                        <Label htmlFor="task_id" className="dark:text-gray-300">Tarefa Vinculada</Label>
                        <Select value={formData.task_id} onValueChange={v => handleChange('task_id', v)}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione a tarefa para este anúncio" /></SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{clientTasks.map(t => <SelectItem key={t.id} value={t.id} className="dark:text-white dark:hover:bg-gray-600">{t.title}</SelectItem>)}</SelectContent>
                        </Select>
                        {formData.task_id && (tasksById[formData.task_id]?.title || tasks.find((t) => t.id === formData.task_id)?.title) && (
                          <Badge variant="outline" className="text-xs font-normal dark:border-gray-500 dark:text-gray-200">
                            📎 {tasksById[formData.task_id]?.title || tasks.find((t) => t.id === formData.task_id)?.title}
                          </Badge>
                        )}
                    </div>

                    {campaign?.id && formData.client_id && (
                      <div className="space-y-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-4">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-5 w-5 text-blue-500 shrink-0" />
                          <h4 className="text-base font-semibold dark:text-white">Vincular anúncio Meta Ads</h4>
                        </div>
                        {linkedMainAd?.meta_ad_broken && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Vínculo Meta quebrado — o anúncio não existe mais ou o token perdeu acesso. Escolha outro anúncio abaixo e vincule de novo.</span>
                          </div>
                        )}
                        {linkedMainAd?.meta_ad_id && !linkedMainAd?.meta_ad_broken && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Vinculado: <span className="font-medium">{linkedMainAd.meta_campaign_name || '—'}</span>
                            {' · '}
                            <span className="font-medium">
                              {linkedMainAd.meta_adset_name || linkedMainAd.meta_adset_id || '—'}
                            </span>
                            {' · '}
                            <span className="font-medium">{linkedMainAd.meta_ad_name || linkedMainAd.meta_ad_id}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <Checkbox
                            id="includePausedMeta"
                            checked={includePausedMeta}
                            onCheckedChange={(v) => setIncludePausedMeta(Boolean(v))}
                          />
                          <Label htmlFor="includePausedMeta" className="text-sm cursor-pointer dark:text-gray-300">
                            Incluir pausadas / finalizadas
                          </Label>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Campanhas: {metaActiveCounts.c} · Conjuntos: {metaActiveCounts.s} · Anúncios:{' '}
                            {metaActiveCounts.a}
                          </span>
                        </div>
                        {metaLinkedAccounts.length === 0 ? (
                          <p className="text-sm text-amber-800 dark:text-amber-300">
                            Cliente sem conta Meta vinculada. Configure em Clientes → Contas de Anúncios Meta.
                          </p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label className="dark:text-gray-300">Conta de anúncios</Label>
                              <Select
                                value={selectedMetaAccountId}
                                onValueChange={(v) => {
                                  setSelectedMetaAccountId(v);
                                  setSelectedMetaCampaignId('');
                                  setSelectedMetaAdsetId('');
                                  setSelectedMetaAdId('');
                                }}
                              >
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                  <SelectValue placeholder="Conta act_…" />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-gray-700">
                                  {metaLinkedAccounts.map((row) => {
                                    const v = normalizeActId(row.meta_account_id);
                                    return (
                                      <SelectItem key={v} value={v} className="dark:text-white dark:hover:bg-gray-600">
                                        {row.meta_account_name || v}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="dark:text-gray-300 shrink-0">Campanha Meta</Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 dark:border-gray-600"
                                  disabled={!selectedMetaAccountId || loadingMetaCampaigns}
                                  onClick={() => fetchMetaCampaigns(selectedMetaAccountId, { force: true })}
                                >
                                  {loadingMetaCampaigns ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                </Button>
                              </div>
                              <Select
                                value={selectedMetaCampaignId ? String(selectedMetaCampaignId) : ''}
                                onValueChange={(v) => {
                                  setSelectedMetaCampaignId(normalizeGraphId(v));
                                  setSelectedMetaAdsetId('');
                                  setSelectedMetaAdId('');
                                }}
                                disabled={!selectedMetaAccountId || loadingMetaCampaigns}
                              >
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                  <SelectValue
                                    placeholder={loadingMetaCampaigns ? 'Carregando…' : 'Selecione a campanha'}
                                  />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 max-h-64 overflow-y-auto">
                                  {displayMetaCampaigns.map((c) => {
                                    const cid = String(c.id);
                                    return (
                                      <SelectItem key={cid} value={cid} className="dark:text-white dark:hover:bg-gray-600">
                                        {c.name} ({c.effective_status || c.status})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="dark:text-gray-300 shrink-0">Conjunto Meta (ad set)</Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 dark:border-gray-600"
                                  disabled={!selectedMetaCampaignId || loadingMetaAdsets}
                                  onClick={() =>
                                    fetchMetaAdsets(selectedMetaAccountId, selectedMetaCampaignId, { force: true })
                                  }
                                >
                                  {loadingMetaAdsets ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                              <Select
                                value={selectedMetaAdsetId ? String(selectedMetaAdsetId) : ''}
                                onValueChange={(v) => {
                                  setSelectedMetaAdsetId(normalizeGraphId(v));
                                  setSelectedMetaAdId('');
                                }}
                                disabled={!selectedMetaCampaignId || loadingMetaAdsets}
                              >
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                  <SelectValue
                                    placeholder={loadingMetaAdsets ? 'Carregando…' : 'Selecione o conjunto'}
                                  />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 max-h-64 overflow-y-auto">
                                  {displayMetaAdsets.map((s) => {
                                    const sid = String(s.id);
                                    return (
                                      <SelectItem key={sid} value={sid} className="dark:text-white dark:hover:bg-gray-600">
                                        {s.name} ({s.effective_status || s.status})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Até ~20 conjuntos por pedido (limite do servidor).
                              </p>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="dark:text-gray-300 shrink-0">Anúncio Meta</Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 dark:border-gray-600"
                                  disabled={!selectedMetaAdsetId || loadingMetaAds}
                                  onClick={() => fetchMetaAds(selectedMetaAccountId, selectedMetaAdsetId, { force: true })}
                                >
                                  {loadingMetaAds ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                </Button>
                              </div>
                              <Select
                                value={selectedMetaAdId ? String(selectedMetaAdId) : ''}
                                onValueChange={(v) => setSelectedMetaAdId(normalizeGraphId(v))}
                                disabled={!selectedMetaAdsetId || loadingMetaAds}
                              >
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                  <SelectValue placeholder={loadingMetaAds ? 'Carregando…' : 'Selecione o anúncio'} />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 max-h-64 overflow-y-auto">
                                  {displayMetaAds.map((a) => {
                                    const aid = String(a.id);
                                    return (
                                      <SelectItem key={aid} value={aid} className="dark:text-white dark:hover:bg-gray-600">
                                        {a.name} ({a.effective_status || a.status})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Até ~20 anúncios por pedido (limite do servidor).
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                              <Button type="button" onClick={handleMetaLink} disabled={!selectedMetaAdId}>
                                Vincular ao Planeje
                              </Button>
                              {linkedMainAd?.meta_ad_id && (
                                <Button type="button" variant="outline" onClick={handleMetaUnlink}>
                                  Desvincular Meta
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                     <div className="space-y-2">
                        <Label htmlFor="ad_name" className="dark:text-gray-300">Nome do Anúncio</Label>
                        <Input id="ad_name" value={formData.ad_name} onChange={e => handleChange('ad_name', e.target.value)} placeholder="Nome personalizado do anúncio" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                    </div>

                    {formData.description && (
                         <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Info className="w-4 h-4" /> Briefing da Tarefa</Label>
                            <Textarea value={formData.description} readOnly className="dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600" rows={3}/>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Paperclip className="w-4 h-4" /> Anexos da Tarefa</Label>
                            {formData.task_id && (
                                <Button type="button" variant="link" size="sm" onClick={fetchAttachments} disabled={isFetchingAttachments}>
                                    <DownloadCloud className="w-4 h-4 mr-2"/>
                                    {isFetchingAttachments ? 'Buscando...' : 'Puxar Anexos'}
                                </Button>
                            )}
                        </div>
                        {formData.attachments && formData.attachments.length > 0 && (
                            <div className="space-y-1 rounded-md border p-2 dark:border-gray-600">
                            {formData.attachments.map((att, index) => (
                                <a key={index} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                    <LinkIcon size={14} /> {att.name}
                                </a>
                            ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="budget" className="flex items-center gap-2 dark:text-gray-300"><DollarSign className="w-4 h-4" /> Orçamento</Label>
                          <Input id="budget" type="number" value={formData.budget} onChange={e => handleChange('budget', e.target.value)} placeholder="500.00" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="assignee_id" className="flex items-center gap-2 dark:text-gray-300"><User className="w-4 h-4" /> Responsável</Label>
                           <Select value={formData.assignee_id} onValueChange={v => handleChange('assignee_id', v)}>
                             <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                             <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                               {users.map(u => (
                                 <SelectItem key={u.id} value={u.id} className="dark:text-white dark:hover:bg-gray-600">
                                   <div className="flex items-center gap-2">
                                     <Avatar className="h-6 w-6"><AvatarImage src={u.avatar_url} /><AvatarFallback className="dark:bg-gray-600">{u.full_name ? u.full_name.charAt(0) : '?'}</AvatarFallback></Avatar>
                                     <span>{u.full_name}</span>
                                   </div>
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Coins className="w-4 h-4" /> Nível do Orçamento</Label>
                            <Select value={formData.budget_level} onValueChange={v => handleChange('budget_level', v)}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="campaign" className="dark:text-white dark:hover:bg-gray-600">Campanha</SelectItem>
                                    <SelectItem value="ad_set" className="dark:text-white dark:hover:bg-gray-600">Conjunto de Anúncios</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Repeat className="w-4 h-4" /> Tipo de Orçamento</Label>
                            <Select value={formData.budget_type} onValueChange={v => handleChange('budget_type', v)}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="total" className="dark:text-white dark:hover:bg-gray-600">Total</SelectItem>
                                    <SelectItem value="daily" className="dark:text-white dark:hover:bg-gray-600">Diário</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><CalendarIcon className="w-4 h-4" /> Data de Início</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600", !formData.start_date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formData.start_date ? format(formData.start_date, "PPP") : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 dark:bg-gray-700">
                                    <Calendar mode="single" selected={formData.start_date} onSelect={(date) => handleChange('start_date', date)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><CalendarIcon className="w-4 h-4" /> Data de Término (Opcional)</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600", !formData.end_date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formData.end_date ? format(formData.end_date, "PPP") : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 dark:bg-gray-700">
                                    <Calendar mode="single" selected={formData.end_date} onSelect={(date) => handleChange('end_date', date)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                      <Label className="flex items-center gap-2 text-base font-semibold dark:text-white"><Target className="w-5 h-5 text-blue-500" /> KPIs da Campanha</Label>
                      {kpis.map((kpi, index) => (
                        <div key={index} className="flex items-end gap-2">
                          <div className="flex-1">
                            <Label className="text-xs dark:text-gray-400">Nome do KPI</Label>
                            <Input value={kpi.name} onChange={(e) => handleKpiChange(index, 'name', e.target.value)} placeholder="Ex: Cliques no Link" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <div className="w-28">
                            <Label className="text-xs dark:text-gray-400">Meta</Label>
                            <Input type="number" value={kpi.target} onChange={(e) => handleKpiChange(index, 'target', e.target.value)} placeholder="1000" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <div className="w-28">
                            <Label className="text-xs dark:text-gray-400">Atual</Label>
                            <Input type="number" value={kpi.current} onChange={(e) => handleKpiChange(index, 'current', e.target.value)} placeholder="0" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeKpi(index)} className="text-red-500 dark:hover:bg-gray-700"><Trash2 className="w-4 h-4"/></Button>
                        </div>
                      ))}
                       <Button type="button" variant="outline" onClick={addKpi} className="w-full dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><Plus className="w-4 h-4 mr-2" /> Adicionar KPI</Button>
                    </div>

                  </div>
                </div>

                <div className="p-6 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-teal-500 text-white" disabled={isSaveDisabled}>
                    <Save className="mr-2 h-4 w-4" /> {campaign?.id ? 'Salvar Alterações' : 'Criar Anúncio'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      );
    };

    export default PaidCampaignForm;