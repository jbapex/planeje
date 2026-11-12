import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Eye, RefreshCw, Loader2, Calendar as CalendarIcon, Columns } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { format, isValid, startOfMonth, endOfMonth, subMonths, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildMetaSnapshot, saveClienteMetaResumo, readClienteMetaResumo, objectiveKpiCards, entityResultLine, extractEntityMetrics, OBJECTIVE_LABELS, readNestedAdsets, metaApiLimitMessage } from '@/lib/clienteMetaSnapshot';
import { shouldKeepPreviousMeta } from '@/lib/trafegoHojeCache';
import { formatAdsetAudience, formatAdsetAudienceFull } from '@/lib/metaAdsetAudience';

const ClientMetaDetailView = ({ client, onClose, initialDate = null }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('campanhas');
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState(null);
  const [date, setDate] = useState(() =>
    initialDate?.from && initialDate?.to
      ? initialDate
      : {
          from: new Date(new Date().setDate(new Date().getDate() - 30)),
          to: new Date(),
        }
  );
  
  // Estados de dados
  const [campaigns, setCampaigns] = useState([]);
  const [adsets, setAdsets] = useState([]);
  const [ads, setAds] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [loadingAds, setLoadingAds] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [adsetsError, setAdsetsError] = useState(null);
  const [adsetsByCampaign, setAdsetsByCampaign] = useState({});
  
  // Colunas visíveis (aplicadas a todas as abas)
  const [visibleColumns, setVisibleColumns] = useState({
    status: true,
    nome: true,
    objetivo: true,
    investimento: true,
    resultados: true,
    mensagens: true,
    compras: false,
    custoResultado: true,
    alcance: true,
    impressoes: false,
    cliques: true,
    ctr: true,
    cpm: false,
    roas: false,
    publicos: true,
  });
  
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  
  // Todas as colunas disponíveis (união de todas as abas)
  const allColumns = [
    { key: 'status', label: 'Status' },
    { key: 'nome', label: 'Nome' },
    { key: 'objetivo', label: 'Objetivo' },
    { key: 'investimento', label: 'Investimento' },
    { key: 'resultados', label: 'Resultados' },
    { key: 'mensagens', label: 'Mensagens' },
    { key: 'compras', label: 'Compras' },
    { key: 'custoResultado', label: 'Custo/Resultado' },
    { key: 'alcance', label: 'Alcance' },
    { key: 'impressoes', label: 'Impressões' },
    { key: 'cliques', label: 'Cliques' },
    { key: 'ctr', label: 'CTR' },
    { key: 'cpm', label: 'CPM' },
    { key: 'roas', label: 'ROAS' },
    { key: 'publicos', label: 'Públicos (conjuntos)' },
  ];
  
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  // Formatação
  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0,00%';
    return `${(value || 0).toFixed(2)}%`;
  };

  const formatROAS = (value) => {
    if (value === null || value === undefined || isNaN(value) || value === 0) return '0,00x';
    return `${(value || 0).toFixed(2)}x`;
  };

  const formatCostPerResult = (objective, item) => {
    const metrics = extractEntityMetrics(item);
    const result = entityResultLine(objective, metrics);
    if (!result.value) return '—';
    return formatCurrency(metrics.spend / result.value);
  };

  // Busca contas Meta vinculadas ao cliente
  const fetchLinkedAccounts = useCallback(async () => {
    if (!client?.id) return [];
    
    try {
      const { data, error } = await supabase
        .from('cliente_meta_accounts')
        .select('meta_account_id, meta_account_name')
        .eq('cliente_id', client.id)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Erro ao buscar contas vinculadas:', err);
      toast({
        title: 'Erro ao buscar contas',
        description: err.message,
        variant: 'destructive',
      });
      return [];
    }
  }, [client, toast]);

  // Busca campanhas
  const fetchCampaigns = useCallback(async () => {
    if (!client?.id || linkedAccounts.length === 0) return;

    setLoadingCampaigns(true);
    try {
      const timeRange = {
        since: date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        until: date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      };

      const allCampaigns = [];
      let totalSpend = 0;
      let totalMessages = 0;
      let totalPurchases = 0;
      let totalPurchaseValue = 0;
      let totalClicks = 0;
      let totalReach = 0;
      let totalLeads = 0;
      let totalEngagements = 0;

      for (const account of linkedAccounts) {
        await new Promise(resolve => setTimeout(resolve, 300)); // Delay entre contas

        const response = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-campaigns',
            adAccountId: account.meta_account_id,
            time_range: timeRange,
            metrics: ['spend', 'impressions', 'clicks', 'reach', 'results', 'actions', 'action_values'],
          },
        });

        if (response.error) {
          console.error(`Erro ao buscar campanhas da conta ${account.meta_account_id}:`, response.error);
          continue;
        }

        const campaignsData = response.data?.campaigns || [];
        
        // Debug: verifica se effective_status está presente nos dados recebidos
        if (campaignsData.length > 0) {
          const firstCampaign = campaignsData[0];
          console.log(`📊 Primeira campanha recebida do frontend:`, {
            id: firstCampaign.id,
            name: firstCampaign.name,
            status: firstCampaign.status,
            effective_status: firstCampaign.effective_status,
            allFields: Object.keys(firstCampaign)
          });
        }
        
        campaignsData.forEach(campaign => {
          if (campaign.insights?.data?.[0]) {
            const insights = campaign.insights.data[0];
            totalSpend += parseFloat(insights.spend || 0) || 0;
            totalClicks += parseFloat(insights.clicks || 0) || 0;
            totalReach += parseFloat(insights.reach || 0) || 0;
            
            // Processa mensagens
            if (Array.isArray(insights.actions)) {
              insights.actions.forEach(action => {
                const messagingTypes = [
                  'messaging_conversation_started',
                  'onsite_messaging_conversation_started',
                  'onsite_conversion.messaging_conversation_started_7d',
                  'messaging_message_received',
                  'messaging_replies',
                  'onsite_messaging_conversation',
                ];
                if (messagingTypes.includes(action?.action_type)) {
                  totalMessages += parseFloat(action.value || 0) || 0;
                }
                if (action?.action_type === 'omni_purchase') {
                  totalPurchases += parseFloat(action.value || 0) || 0;
                }
                if (String(action?.action_type || '').toLowerCase().includes('lead')) {
                  totalLeads += parseFloat(action.value || 0) || 0;
                }
                if (action?.action_type === 'post_engagement' || action?.action_type === 'page_engagement') {
                  totalEngagements += parseFloat(action.value || 0) || 0;
                }
              });
            }

            // Processa valor de compras
            if (Array.isArray(insights.action_values)) {
              insights.action_values.forEach(actionValue => {
                if (actionValue?.action_type === 'omni_purchase') {
                  totalPurchaseValue += parseFloat(actionValue.value || 0) || 0;
                }
              });
            }
          }
        });

        allCampaigns.push(...campaignsData);
      }

      // Debug: conta campanhas por status de veiculação (APENAS effective_status)
      const activeCampaigns = allCampaigns.filter(c => {
        // IMPORTANTE: Usa APENAS effective_status, nunca status
        return c.effective_status === 'ACTIVE';
      });
      
      console.log(`📊 Total de campanhas carregadas: ${allCampaigns.length}`);
      console.log(`✅ Campanhas em veiculação (effective_status = ACTIVE): ${activeCampaigns.length}`);
      
      // Log detalhado de todas as campanhas para debug
      console.log(`📋 Status de todas as campanhas:`, allCampaigns.map(c => ({
        id: c.id,
        name: c.name?.substring(0, 50),
        status: c.status, // Status de ativado/desativado (NÃO usar)
        effective_status: c.effective_status, // Status de veiculação (USAR ESTE)
        isActive: c.effective_status === 'ACTIVE'
      })));
      
      // Verifica se todas as campanhas têm effective_status
      const campaignsWithoutEffectiveStatus = allCampaigns.filter(c => !c.effective_status);
      if (campaignsWithoutEffectiveStatus.length > 0) {
        console.warn(`⚠️ ATENÇÃO: ${campaignsWithoutEffectiveStatus.length} campanhas SEM effective_status:`, campaignsWithoutEffectiveStatus.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status
        })));
      }
      
      if (activeCampaigns.length !== 3) {
        console.warn(`⚠️ ATENÇÃO: Esperado 3 campanhas em veiculação, mas encontrado ${activeCampaigns.length}`);
      }

      const nested = {};
      allCampaigns.forEach((campaign) => {
        const list = readNestedAdsets(campaign);
        if (list.length) nested[String(campaign.id)] = list;
      });
      setAdsetsByCampaign(nested);
      setCampaigns(allCampaigns);
      
      // Calcula resumo
      const costPerMessage = totalMessages > 0 ? totalSpend / totalMessages : 0;
      const costPerPurchase = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
      const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

      setSummary({
        spend: totalSpend,
        messages: totalMessages,
        purchases: totalPurchases,
        purchaseValue: totalPurchaseValue,
        clicks: totalClicks,
        reach: totalReach,
        leads: totalLeads,
        engagements: totalEngagements,
        costPerMessage,
        costPerPurchase,
        roas,
        activeCount: activeCampaigns.length,
      });
      const nextSnapshot = buildMetaSnapshot({ campaigns: allCampaigns, period: timeRange });
      const previous = readClienteMetaResumo(client);
      if (
        allCampaigns.length > 0 &&
        !shouldKeepPreviousMeta({ campaigns: allCampaigns }, previous)
      ) {
        saveClienteMetaResumo(client.id, nextSnapshot).catch((e) => console.warn('Não gravou meta_resumo', e));
      }
    } catch (err) {
      console.error('Erro ao buscar campanhas:', err);
      toast({
        title: 'Erro ao buscar campanhas',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingCampaigns(false);
    }
  }, [client, linkedAccounts, date, toast]);

  // Busca conjuntos de anúncios
  const fetchAdsets = useCallback(async () => {
    if (!selectedCampaignId) return;

    const cached = adsetsByCampaign[String(selectedCampaignId)];
    if (cached?.length) {
      setAdsetsError(null);
      setAdsets(cached);
      return;
    }

    setLoadingAdsets(true);
    setAdsetsError(null);
    try {
      const timeRange = {
        since: date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        until: date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      };

      const response = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-adsets',
          campaignId: selectedCampaignId,
          time_range: timeRange,
          metrics: ['spend', 'impressions', 'clicks', 'reach', 'actions', 'action_values'],
        },
      });

      if (response.error) throw response.error;

      const limitMsg = metaApiLimitMessage(response.data);
      if (limitMsg) {
        setAdsets([]);
        setAdsetsError(limitMsg);
        return;
      }

      let adsetsData = [];
      if (response.data?.adsets) {
        adsetsData = response.data.adsets;
      } else if (response.data?.data?.adsets) {
        adsetsData = response.data.data.adsets;
      } else if (Array.isArray(response.data)) {
        adsetsData = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        adsetsData = response.data.data;
      }

      setAdsets(adsetsData);
    } catch (err) {
      console.error('❌ Erro ao buscar conjuntos:', err);
      setAdsets([]);
      setAdsetsError(err.message || 'Não foi possível buscar os conjuntos.');
    } finally {
      setLoadingAdsets(false);
    }
  }, [selectedCampaignId, date, adsetsByCampaign]);

  // Busca anúncios
  const fetchAds = useCallback(async () => {
    if (!selectedAdsetId) return;

    setLoadingAds(true);
    try {
      const timeRange = {
        since: date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        until: date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      };

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-ads',
          adsetId: selectedAdsetId,
          time_range: timeRange,
          metrics: ['spend', 'impressions', 'clicks', 'reach', 'actions', 'action_values'],
        },
      });
      
      console.log('📦 [fetchAds] Resposta completa:', JSON.stringify(response, null, 2));

      if (response.error) throw response.error;
      setAds(response.data?.ads || []);
    } catch (err) {
      console.error('Erro ao buscar anúncios:', err);
      toast({
        title: 'Erro ao buscar anúncios',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingAds(false);
    }
  }, [selectedAdsetId, date, toast]);

  // Carrega contas ao abrir
  useEffect(() => {
    if (client?.id) {
      fetchLinkedAccounts().then(accounts => {
        setLinkedAccounts(accounts);
      });
    }
  }, [client, fetchLinkedAccounts]);

  // Carrega campanhas quando contas estão prontas
  useEffect(() => {
    if (linkedAccounts.length > 0) {
      fetchCampaigns();
    }
  }, [linkedAccounts, fetchCampaigns]);

  // Carrega conjuntos quando campanha é selecionada
  useEffect(() => {
    if (selectedCampaignId) {
      console.log('🔄 useEffect detectou selectedCampaignId:', selectedCampaignId);
      fetchAdsets();
    } else {
      console.log('🔄 useEffect: selectedCampaignId é null');
    }
  }, [selectedCampaignId, fetchAdsets]);

  // Carrega anúncios quando conjunto é selecionado
  useEffect(() => {
    if (selectedAdsetId && activeTab === 'anuncios') {
      fetchAds();
    }
  }, [selectedAdsetId, activeTab, fetchAds]);

  // Reseta seleções ao trocar de aba
  useEffect(() => {
    if (activeTab === 'campanhas') {
      setSelectedCampaignId(null);
      setSelectedAdsetId(null);
    } else if (activeTab === 'conjuntos') {
      setSelectedAdsetId(null);
    }
  }, [activeTab]);

  // Determina objetivo do cliente
  const isMessageGoal = () => {
    const obj = String(client?.objetivo_meta || '').toLowerCase();
    if (obj.includes('mensagem') || obj.includes('lead')) return true;
    if (obj.includes('compra') || obj.includes('e-commerce')) return false;
    const messages = Number(summary?.messages || 0);
    const purchases = Number(summary?.purchases || 0);
    return messages > purchases;
  };

  const campaignSnapshot = useMemo(() => buildMetaSnapshot({ campaigns }), [campaigns]);
  const kpiCards = useMemo(() => objectiveKpiCards(campaignSnapshot), [campaignSnapshot]);

  const getObjetivoLabel = () => {
    const obj = String(client?.objetivo_meta || '').toLowerCase();
    if (obj.includes('mensagem') || obj.includes('lead')) return 'Mensagens / Leads';
    if (obj.includes('compra') || obj.includes('e-commerce')) return 'Compras / E-commerce';
    if (obj === 'misto') return 'Misto';
    const snap = campaignSnapshot;
    if (snap.inferredGoal === 'misto') return 'Misto (pelas campanhas)';
    if (snap.inferredGoal && OBJECTIVE_LABELS[snap.inferredGoal]) {
      return `${OBJECTIVE_LABELS[snap.inferredGoal]} (pelas campanhas)`;
    }
    if (Number(summary?.purchases || 0) > 0) return 'Compras (pelas campanhas)';
    if (isMessageGoal()) return 'Mensagens (pelas campanhas)';
    return 'Objetivo não cadastrado';
  };

  // Filtra itens baseado no status selecionado
  const filterByStatus = (items, getStatusFn) => {
    if (statusFilter === 'all') return items;
    
    return items.filter(item => {
      const deliveryStatus = getStatusFn(item);
      
      if (statusFilter === 'active') {
        return deliveryStatus === 'ACTIVE';
      } else if (statusFilter === 'paused') {
        return deliveryStatus && deliveryStatus.includes('PAUSED');
      } else if (statusFilter === 'no-delivery') {
        return !deliveryStatus || deliveryStatus === 'UNKNOWN';
      }
      
      return true;
    });
  };

  // Traduz status de veiculação do Meta para português
  const translateDeliveryStatus = (effectiveStatus) => {
    if (!effectiveStatus) return 'Desconhecido';
    
    const status = effectiveStatus.toUpperCase();
    
    // Mapeamento de effective_status para português
    const statusMap = {
      'ACTIVE': 'Ativo',
      'PAUSED': 'Pausado',
      'DELETED': 'Excluído',
      'ARCHIVED': 'Arquivado',
      'CAMPAIGN_PAUSED': 'Campanha Pausada',
      'ADSET_PAUSED': 'Conjunto Pausado',
      'AD_PAUSED': 'Anúncio Pausado',
      'DISAPPROVED': 'Reprovado',
      'PREAPPROVED': 'Pré-aprovado',
      'PENDING_REVIEW': 'Aguardando Revisão',
      'WITH_ISSUES': 'Com Problemas',
      'INACTIVE': 'Inativo',
      'NO_ADS': 'Sem Anúncios',
    };
    
    // Tenta encontrar correspondência exata
    if (statusMap[status]) {
      return statusMap[status];
    }
    
    // Tenta correspondência parcial
    if (status.includes('PAUSED')) return 'Pausado';
    if (status.includes('ACTIVE')) return 'Ativo';
    if (status.includes('DELETED')) return 'Excluído';
    if (status.includes('ARCHIVED')) return 'Arquivado';
    if (status.includes('DISAPPROVED')) return 'Reprovado';
    if (status.includes('PENDING')) return 'Aguardando Revisão';
    if (status.includes('INACTIVE')) return 'Inativo';
    
    // Se não encontrar, retorna formatado
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toLowerCase());
  };

  // Traduz objetivo da campanha/conjunto/anúncio do Meta para português
  const translateObjective = (objective) => {
    if (!objective) return '-';
    
    const obj = objective.toUpperCase();
    
    // Mapeamento de objetivos do Meta para português
    const objectiveMap = {
      'OUTCOME_ENGAGEMENT': 'Engajamento',
      'OUTCOME_AWARENESS': 'Conscientização',
      'OUTCOME_TRAFFIC': 'Tráfego',
      'OUTCOME_LEADS': 'Geração de Leads',
      'OUTCOME_APP_PROMOTION': 'Promoção de App',
      'OUTCOME_SALES': 'Vendas',
      'LINK_CLICKS': 'Cliques no Link',
      'CONVERSIONS': 'Conversões',
      'MESSAGING': 'Mensagens',
      'MESSAGING_CONVERSATION': 'Conversas',
      'LEAD_GENERATION': 'Geração de Leads',
      'BRAND_AWARENESS': 'Conscientização da Marca',
      'REACH': 'Alcance',
      'TRAFFIC': 'Tráfego',
      'ENGAGEMENT': 'Engajamento',
      'APP_INSTALLS': 'Instalações de App',
      'VIDEO_VIEWS': 'Visualizações de Vídeo',
      'STORE_VISITS': 'Visitas à Loja',
      'PRODUCT_CATALOG_SALES': 'Vendas de Catálogo',
      'PURCHASE': 'Compra',
      'SALES': 'Vendas',
      'POST_ENGAGEMENT': 'Engajamento na Publicação',
      'PAGE_LIKES': 'Curtidas na Página',
      'EVENT_RESPONSES': 'Respostas a Eventos',
    };
    
    // Tenta encontrar correspondência exata
    if (objectiveMap[obj]) {
      return objectiveMap[obj];
    }
    
    // Tenta encontrar correspondência parcial
    for (const [key, value] of Object.entries(objectiveMap)) {
      if (obj.includes(key) || key.includes(obj)) {
        return value;
      }
    }
    
    // Se não encontrar, tenta traduzir palavras comuns
    if (obj.includes('ENGAGEMENT')) return 'Engajamento';
    if (obj.includes('TRAFFIC') || obj.includes('CLICKS')) return 'Tráfego';
    if (obj.includes('LEAD') || obj.includes('CADASTRO')) return 'Geração de Leads';
    if (obj.includes('SALES') || obj.includes('PURCHASE') || obj.includes('VENDAS')) return 'Vendas';
    if (obj.includes('MESSAGING') || obj.includes('MESSAGE')) return 'Mensagens';
    if (obj.includes('AWARENESS') || obj.includes('CONSCIENTIZAÇÃO')) return 'Conscientização';
    if (obj.includes('APP') || obj.includes('INSTALL')) return 'Promoção de App';
    if (obj.includes('VIDEO')) return 'Visualizações de Vídeo';
    if (obj.includes('REACH') || obj.includes('ALCANCE')) return 'Alcance';
    
    // Se não conseguir traduzir, retorna o original formatado
    return objective.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Determina o tipo de resultado baseado no objetivo da campanha/conjunto/anúncio
  const getResultTypeFromObjective = (objective) => {
    if (!objective) return 'results'; // Fallback para 'results' genérico
    
    const obj = objective.toUpperCase();
    
    // Objetivos de mensagem
    if (obj.includes('MESSAGING') || obj.includes('MESSAGE') || obj.includes('CONVERSATION')) {
      return 'messages';
    }

    if (obj.includes('LEAD')) {
      return 'leads';
    }

    if (
      obj.includes('ENGAGEMENT') ||
      obj.includes('COMMENT') ||
      obj.includes('REACTION') ||
      obj.includes('SHARE') ||
      obj.includes('POST_ENGAGEMENT') ||
      obj.includes('PAGE_LIKE')
    ) {
      return 'engagement';
    }
    
    // Objetivos de compra/venda/conversão
    if (obj.includes('PURCHASE') || obj.includes('SALES') || 
        obj.includes('CONVERSION') || obj.includes('STORE_VISIT') ||
        obj.includes('PRODUCT_CATALOG')) {
      return 'purchases';
    }
    
    // Objetivos de tráfego/cliques
    if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICKS') ||
        obj.includes('LANDING_PAGE')) {
      return 'clicks';
    }
    
    // Objetivos de alcance
    if (obj.includes('REACH') || obj.includes('BRAND_AWARENESS')) {
      return 'reach';
    }
    
    // Objetivos de vídeo
    if (obj.includes('VIDEO') || obj.includes('VIDEO_VIEWS')) {
      return 'video_views';
    }
    
    // App installs
    if (obj.includes('APP') || obj.includes('INSTALL')) {
      return 'app_installs';
    }
    
    // Default: resultados genéricos
    return 'results';
  };

  // Extrai o valor do resultado baseado no tipo e nos insights
  const extractResultValue = (resultType, insights) => {
    // PRIORIDADE MÁXIMA: Se tiver o campo 'results' do Meta, usa ele primeiro
    // Este é o valor oficial que o Meta calcula e mostra no Ads Manager
    if (insights.results !== undefined && insights.results !== null && insights.results !== '') {
      const resultsValue = parseFloat(insights.results || 0) || 0;
      console.log(`✅ [extractResultValue] Usando campo 'results' do Meta: ${resultsValue}`);
      return resultsValue;
    }
    
    console.log(`⚠️ [extractResultValue] Campo 'results' não disponível, usando fallback baseado em resultType: ${resultType}`);
    
    switch (resultType) {
      case 'messages':
        // Soma todas as ações de mensagem
        let messages = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            const messagingTypes = [
              'messaging_conversation_started',
              'onsite_messaging_conversation_started',
              'onsite_conversion.messaging_conversation_started_7d',
              'messaging_message_received',
              'messaging_replies',
              'onsite_messaging_conversation',
              'messaging_conversation',
            ];
            if (messagingTypes.includes(action?.action_type)) {
              messages += parseFloat(action.value || 0) || 0;
            }
          });
        }
        return messages;

      case 'leads':
        let leads = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            const t = String(action?.action_type || '').toLowerCase();
            if (t.includes('lead')) leads += parseFloat(action.value || 0) || 0;
          });
        }
        return leads;

      case 'engagement':
        let engagements = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            const t = String(action?.action_type || '');
            if (t === 'post_engagement' || t === 'page_engagement') {
              engagements += parseFloat(action.value || 0) || 0;
            }
          });
        }
        return engagements || parseFloat(insights.clicks || 0) || 0;
        
      case 'purchases':
        // Soma compras
        let purchases = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            if (action?.action_type === 'omni_purchase') {
              purchases += parseFloat(action.value || 0) || 0;
            }
          });
        }
        return purchases;
        
      case 'clicks':
        return parseFloat(insights.clicks || 0) || 0;
        
      case 'reach':
        return parseFloat(insights.reach || 0) || 0;
        
      case 'video_views':
        let videoViews = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            if (action?.action_type?.includes('video') || action?.action_type?.includes('VIDEO')) {
              videoViews += parseFloat(action.value || 0) || 0;
            }
          });
        }
        return videoViews || parseFloat(insights.video_views || 0) || 0;
        
      case 'app_installs':
        let appInstalls = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            if (action?.action_type?.includes('app') || action?.action_type?.includes('install')) {
              appInstalls += parseFloat(action.value || 0) || 0;
            }
          });
        }
        return appInstalls;
        
      default:
        // Tenta usar 'results' genérico ou soma todas as actions
        if (insights.results !== undefined) {
          return parseFloat(insights.results || 0) || 0;
        }
        // Se não tiver results, soma todas as actions
        let totalActions = 0;
        if (Array.isArray(insights.actions)) {
          insights.actions.forEach(action => {
            totalActions += parseFloat(action.value || 0) || 0;
          });
        }
        return totalActions;
    }
  };

  // Processa insights de uma campanha/conjunto/anúncio
  const processInsights = (item) => {
    if (!item.insights?.data?.[0]) {
      console.log('⚠️ [processInsights] Sem insights para:', item.name || item.id);
      return null;
    }
    const insights = item.insights.data[0];
    
    // Determina o tipo de resultado baseado no objetivo
    const objective = item.objective || item.campaign?.objective || '';
    const resultType = getResultTypeFromObjective(objective);
    const resultValue = extractResultValue(resultType, insights);
    
    let messages = 0;
    let purchases = 0;
    let purchaseValue = 0;
    let engagements = 0;
    let leads = 0;

    // Debug: log das actions disponíveis (apenas primeira vez)
    if (Array.isArray(insights.actions) && insights.actions.length > 0 && !window._loggedDetailActions) {
      console.log('📊 [processInsights] Actions disponíveis:', insights.actions.map(a => ({
        type: a.action_type,
        value: a.value
      })));
      window._loggedDetailActions = true;
    }

    if (Array.isArray(insights.actions)) {
      insights.actions.forEach(action => {
        // Lista completa de tipos de mensagem (igual ao ClientMetaList)
        const messagingTypes = [
          'messaging_conversation_started',
          'onsite_messaging_conversation_started',
          'onsite_conversion.messaging_conversation_started_7d',
          'messaging_message_received',
          'messaging_replies',
          'onsite_messaging_conversation',
          'messaging_conversation',
          'lead',
          'onsite_conversion.lead_7d'
        ];
        
        if (messagingTypes.includes(action?.action_type)) {
          const messageValue = parseFloat(action.value || 0) || 0;
          messages += messageValue;
          if (messageValue > 0) {
            console.log(`✅ [processInsights] Mensagem encontrada: ${action.action_type} = ${messageValue} em ${item.name || item.id}`);
          }
        }
        
        if (action?.action_type === 'omni_purchase') {
          const purchaseValueCount = parseFloat(action.value || 0) || 0;
          purchases += purchaseValueCount;
          if (purchaseValueCount > 0) {
            console.log(`✅ [processInsights] Compra encontrada: omni_purchase = ${purchaseValueCount} em ${item.name || item.id}`);
          }
        }
        if (action?.action_type === 'post_engagement' || action?.action_type === 'page_engagement') {
          engagements += parseFloat(action.value || 0) || 0;
        }
        if (String(action?.action_type || '').toLowerCase().includes('lead')) {
          leads += parseFloat(action.value || 0) || 0;
        }
      });
    } else {
      // Debug: se não há actions, pode ser que a API não esteja retornando
      if (insights && !insights.actions) {
        console.log('⚠️ [processInsights] Insights sem campo actions para:', item.name || item.id, 'Campos disponíveis:', Object.keys(insights));
      }
    }

    if (Array.isArray(insights.action_values)) {
      insights.action_values.forEach(actionValue => {
        if (actionValue?.action_type === 'omni_purchase') {
          const value = parseFloat(actionValue.value || 0) || 0;
          purchaseValue += value;
          if (value > 0) {
            console.log(`✅ [processInsights] Valor de compra encontrado: ${value} em ${item.name || item.id}`);
          }
        }
      });
    }

    const spend = parseFloat(insights.spend || 0) || 0;
    const impressions = parseFloat(insights.impressions || 0) || 0;
    const clicks = parseFloat(insights.clicks || 0) || 0;
    const reach = parseFloat(insights.reach || 0) || 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const costPerMessage = messages > 0 ? spend / messages : 0;
    const costPerPurchase = purchases > 0 ? spend / purchases : 0;
    const roas = spend > 0 ? purchaseValue / spend : 0;

    return {
      spend,
      impressions,
      clicks,
      reach,
      messages,
      purchases,
      purchaseValue,
      engagements,
      leads,
      ctr,
      cpm,
      costPerMessage,
      costPerPurchase,
      roas,
      resultType, // Tipo de resultado (messages, purchases, clicks, etc.)
      resultValue, // Valor do resultado baseado no objetivo
      objective, // Objetivo da campanha/conjunto/anúncio
    };
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex flex-col"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex-1 bg-white dark:bg-gray-800 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 p-6 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                  {client?.empresa || 'Campanhas Meta'}
                </h2>
                <Badge variant="outline" className="dark:border-gray-600 dark:text-white">
                  {getObjetivoLabel()}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Filtros e resumo */}
            <div className="flex items-center gap-4 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "dd/MM/yy", { locale: ptBR })} - {format(date.to, "dd/MM/yy", { locale: ptBR })}
                        </>
                      ) : (
                        format(date.from, "dd/MM/yy", { locale: ptBR })
                      )
                    ) : (
                      <span>Escolha o período</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="flex border rounded-lg">
                    <div className="border-r p-3 space-y-1 w-[180px] bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Atalhos Rápidos
                      </div>
                      <div className="space-y-0.5">
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfDay(new Date()), to: endOfDay(new Date()) })}>Hoje</Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) })}>Ontem</Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) })}>Últimos 7 dias</Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) })}>Últimos 30 dias</Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>Mês atual</Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2" onClick={() => setDate({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) })}>Mês passado</Button>
                      </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800">
                      <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} locale={ptBR} />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={showColumnSelector} onOpenChange={setShowColumnSelector}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                    <Columns className="h-4 w-4 mr-2" />
                    Colunas
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4 dark:bg-gray-800 dark:border-gray-700" align="end">
                  <div className="space-y-3">
                    <div className="font-semibold text-sm dark:text-white mb-2">Selecionar Colunas</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Aplica-se a todas as abas</div>
                    {allColumns.map((col) => (
                      <div key={col.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`col-${col.key}`}
                          checked={visibleColumns[col.key] ?? true}
                          onCheckedChange={() => toggleColumn(col.key)}
                          className="dark:border-gray-600"
                        />
                        <Label
                          htmlFor={`col-${col.key}`}
                          className="text-sm font-normal cursor-pointer dark:text-gray-300"
                        >
                          {col.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-700">
                  <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-600">
                    Todos os Status
                  </SelectItem>
                  <SelectItem value="active" className="dark:text-white dark:hover:bg-gray-600">
                    Só no ar
                  </SelectItem>
                  <SelectItem value="paused" className="dark:text-white dark:hover:bg-gray-600">
                    Pausado
                  </SelectItem>
                  <SelectItem value="no-delivery" className="dark:text-white dark:hover:bg-gray-600">
                    Sem Veiculação
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={fetchCampaigns} disabled={loadingCampaigns} variant="outline" size="sm" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingCampaigns ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {/* Cards de resumo */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Investimento</div>
                  <div className="text-lg font-semibold dark:text-white">{formatCurrency(summary.spend)}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Campanhas no ar</div>
                  <div className="text-lg font-semibold dark:text-white">{formatNumber(summary.activeCount || 0)}</div>
                </div>
                {kpiCards.map((card) => (
                  <div key={card.key} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400">{card.label}</div>
                    <div className="text-lg font-semibold dark:text-white">{card.value}</div>
                    {card.line ? (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{card.line}</div>
                    ) : null}
                  </div>
                ))}
                {Number(summary.reach || 0) > 0 && !kpiCards.some((c) => c.key === 'alcance') ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400">Alcance</div>
                    <div className="text-lg font-semibold dark:text-white">{formatNumber(summary.reach)}</div>
                  </div>
                ) : null}
                {Number(summary.clicks || 0) > 0 && !kpiCards.some((c) => c.key === 'trafego') ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400">Cliques</div>
                    <div className="text-lg font-semibold dark:text-white">{formatNumber(summary.clicks)}</div>
                  </div>
                ) : null}
                {Number(summary.messages || 0) > 0 && !kpiCards.some((c) => c.key === 'mensagens') ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400">Mensagens</div>
                    <div className="text-lg font-semibold dark:text-white">{formatNumber(summary.messages)}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Abas */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="dark:bg-gray-800 mx-6 mt-4">
                <TabsTrigger value="campanhas" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">
                  Campanhas
                </TabsTrigger>
                <TabsTrigger value="conjuntos" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white" disabled={!selectedCampaignId}>
                  Conjuntos
                </TabsTrigger>
                <TabsTrigger value="anuncios" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white" disabled={!selectedAdsetId}>
                  Anúncios
                </TabsTrigger>
              </TabsList>

              {/* Aba Campanhas */}
              <TabsContent value="campanhas" className="flex-1 overflow-auto mt-4 px-6 pb-6">
                {loadingCampaigns ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : campaigns.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Nenhuma campanha encontrada para este período.
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-x-auto">
                    <Table>
                      <TableHeader className="dark:bg-gray-900">
                        <TableRow className="dark:border-gray-700">
                          {visibleColumns.status && <TableHead className="dark:text-white">Status</TableHead>}
                          {visibleColumns.nome && <TableHead className="dark:text-white">Nome</TableHead>}
                          {visibleColumns.objetivo && <TableHead className="dark:text-white">Objetivo</TableHead>}
                          {visibleColumns.investimento && <TableHead className="dark:text-white">Investimento</TableHead>}
                          {visibleColumns.resultados && <TableHead className="dark:text-white">Resultados</TableHead>}
                          {visibleColumns.mensagens && <TableHead className="dark:text-white">Mensagens</TableHead>}
                          {visibleColumns.compras && <TableHead className="dark:text-white">Compras</TableHead>}
                          {visibleColumns.custoResultado && <TableHead className="dark:text-white">Custo/Resultado</TableHead>}
                          {visibleColumns.alcance && <TableHead className="dark:text-white">Alcance</TableHead>}
                          {visibleColumns.impressoes && <TableHead className="dark:text-white">Impressões</TableHead>}
                          {visibleColumns.cliques && <TableHead className="dark:text-white">Cliques</TableHead>}
                          {visibleColumns.ctr && <TableHead className="dark:text-white">CTR</TableHead>}
                          {visibleColumns.cpm && <TableHead className="dark:text-white">CPM</TableHead>}
                          {visibleColumns.roas && <TableHead className="dark:text-white">ROAS</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filterByStatus(campaigns, (campaign) => {
                          let deliveryStatus = campaign.effective_status;
                          if (!deliveryStatus) {
                            const insights = campaign.insights?.data?.[0];
                            const hasSpend = insights && parseFloat(insights.spend || 0) > 0;
                            const hasImpressions = insights && parseFloat(insights.impressions || 0) > 0;
                            if (campaign.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                              deliveryStatus = 'ACTIVE';
                            } else if (campaign.status === 'ACTIVE') {
                              deliveryStatus = 'PAUSED';
                            } else {
                              deliveryStatus = campaign.status || 'UNKNOWN';
                            }
                          }
                          return deliveryStatus;
                        }).map((campaign) => {
                          const insights = processInsights(campaign);
                          const isSelected = selectedCampaignId === campaign.id;
                          
                          return (
                            <TableRow
                              key={campaign.id}
                              className={`dark:border-gray-700 cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                              onClick={() => {
                                console.log('🎯 Campanha selecionada:', campaign.id, campaign.name);
                                setSelectedCampaignId(campaign.id);
                                setSelectedAdsetId(null); // Limpa seleção de conjunto
                                setAdsets([]); // Limpa conjuntos anteriores
                                setAds([]); // Limpa anúncios anteriores
                                setActiveTab('conjuntos');
                              }}
                            >
                              {visibleColumns.status && (
                                <TableCell className="dark:text-gray-300">
                                  {(() => {
                                    // PRIORIDADE ABSOLUTA: effective_status (status de veiculação) é o que realmente importa
                                    // Se não tiver effective_status, tenta determinar pelo status e insights
                                    let deliveryStatus = campaign.effective_status;
                                    
                                    // Se não tiver effective_status, tenta inferir pelo status e dados de insights
                                    if (!deliveryStatus) {
                                      const insights = campaign.insights?.data?.[0];
                                      const hasSpend = insights && parseFloat(insights.spend || 0) > 0;
                                      const hasImpressions = insights && parseFloat(insights.impressions || 0) > 0;
                                      
                                      // Se tem gastos ou impressões no período, provavelmente está em veiculação
                                      if (campaign.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                                        deliveryStatus = 'ACTIVE';
                                        console.log(`✅ [${campaign.name}] Inferindo veiculação: status=ACTIVE e tem dados (spend=${insights?.spend}, impressions=${insights?.impressions})`);
                                      } else if (campaign.status === 'ACTIVE' && !hasSpend && !hasImpressions) {
                                        // Ativa mas sem dados pode estar pausada ou sem veiculação
                                        deliveryStatus = 'PAUSED';
                                        console.log(`⚠️ [${campaign.name}] status=ACTIVE mas sem dados, considerando como PAUSED`);
                                      } else {
                                        deliveryStatus = campaign.status || 'UNKNOWN';
                                        console.warn(`⚠️ Campanha ${campaign.name} não tem effective_status! status=${campaign.status}, usando status como fallback`);
                                      }
                                    }
                                    
                                    // Se ainda não tiver, mostra "Sem veiculação"
                                    if (!deliveryStatus || deliveryStatus === 'UNKNOWN') {
                                      return (
                                        <Badge className="bg-gray-500">
                                          Sem veiculação
                                        </Badge>
                                      );
                                    }
                                    
                                    const statusText = translateDeliveryStatus(deliveryStatus);
                                    // Considera "Ativo" apenas se effective_status for ACTIVE
                                    const isActive = deliveryStatus === 'ACTIVE';
                                    
                                    // Debug: log quando status e effective_status são diferentes
                                    if (campaign.status && campaign.status !== deliveryStatus) {
                                      console.log(`📊 [${campaign.name}] status=${campaign.status}, effective_status=${deliveryStatus}, exibindo: ${statusText}`);
                                    }
                                    
                                    // Cores baseadas no status de veiculação
                                    let badgeColor = 'bg-gray-500'; // Padrão: cinza
                                    if (isActive) {
                                      badgeColor = 'bg-green-500'; // Ativo: verde
                                    } else if (deliveryStatus.includes('PAUSED')) {
                                      badgeColor = 'bg-yellow-500'; // Pausado: amarelo
                                    }
                                    
                                    return (
                                      <Badge className={badgeColor}>
                                        {statusText}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                              )}
                              {visibleColumns.nome && <TableCell className="font-medium dark:text-white">{campaign.name || '-'}</TableCell>}
                              {visibleColumns.objetivo && <TableCell className="dark:text-gray-300">{translateObjective(campaign.objective)}</TableCell>}
                              {visibleColumns.investimento && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.spend) : '-'}</TableCell>}
                              {visibleColumns.resultados && (
                                <TableCell className="dark:text-gray-300">
                                  {entityResultLine(campaign.objective, extractEntityMetrics(campaign)).line}
                                </TableCell>
                              )}
                              {visibleColumns.mensagens && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.messages || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.compras && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.purchases || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.custoResultado && (
                                <TableCell className="dark:text-gray-300">
                                  {formatCostPerResult(campaign.objective, campaign)}
                                </TableCell>
                              )}
                              {visibleColumns.alcance && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.reach) : '-'}</TableCell>}
                              {visibleColumns.impressoes && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.impressions) : '-'}</TableCell>}
                              {visibleColumns.cliques && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.clicks) : '-'}</TableCell>}
                              {visibleColumns.ctr && <TableCell className="dark:text-gray-300">{insights ? formatPercentage(insights.ctr) : '-'}</TableCell>}
                              {visibleColumns.cpm && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.cpm) : '-'}</TableCell>}
                              {visibleColumns.roas && <TableCell className="dark:text-gray-300">{insights ? formatROAS(insights.roas) : '-'}</TableCell>}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Aba Conjuntos */}
              <TabsContent value="conjuntos" className="flex-1 overflow-auto mt-4 px-6 pb-6">
                {!selectedCampaignId ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Selecione uma campanha na aba Campanhas para ver os conjuntos.
                  </div>
                ) : loadingAdsets ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : adsets.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    {adsetsError || 'Nenhum conjunto encontrado para esta campanha.'}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-x-auto">
                    <Table>
                      <TableHeader className="dark:bg-gray-900">
                        <TableRow className="dark:border-gray-700">
                          {visibleColumns.status && <TableHead className="dark:text-white">Status</TableHead>}
                          {visibleColumns.nome && <TableHead className="dark:text-white">Nome</TableHead>}
                          {visibleColumns.objetivo && <TableHead className="dark:text-white">Objetivo</TableHead>}
                          {visibleColumns.publicos && <TableHead className="dark:text-white min-w-[240px]">Públicos</TableHead>}
                          {visibleColumns.investimento && <TableHead className="dark:text-white">Investimento</TableHead>}
                          {visibleColumns.resultados && <TableHead className="dark:text-white">Resultados</TableHead>}
                          {visibleColumns.mensagens && <TableHead className="dark:text-white">Mensagens</TableHead>}
                          {visibleColumns.compras && <TableHead className="dark:text-white">Compras</TableHead>}
                          {visibleColumns.custoResultado && <TableHead className="dark:text-white">Custo/Resultado</TableHead>}
                          {visibleColumns.alcance && <TableHead className="dark:text-white">Alcance</TableHead>}
                          {visibleColumns.impressoes && <TableHead className="dark:text-white">Impressões</TableHead>}
                          {visibleColumns.cliques && <TableHead className="dark:text-white">Cliques</TableHead>}
                          {visibleColumns.ctr && <TableHead className="dark:text-white">CTR</TableHead>}
                          {visibleColumns.cpm && <TableHead className="dark:text-white">CPM</TableHead>}
                          {visibleColumns.roas && <TableHead className="dark:text-white">ROAS</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filterByStatus(adsets, (adset) => {
                          let deliveryStatus = adset.effective_status;
                          if (!deliveryStatus) {
                            const insights = processInsights(adset);
                            const hasSpend = insights && insights.spend > 0;
                            const hasImpressions = insights && insights.impressions > 0;
                            if (adset.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                              deliveryStatus = 'ACTIVE';
                            } else if (adset.status === 'ACTIVE') {
                              deliveryStatus = 'PAUSED';
                            } else {
                              deliveryStatus = adset.status || 'UNKNOWN';
                            }
                          }
                          return deliveryStatus;
                        }).map((adset) => {
                          const insights = processInsights(adset);
                          const isSelected = selectedAdsetId === adset.id;
                          
                          return (
                            <TableRow
                              key={adset.id}
                              className={`dark:border-gray-700 cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                              onClick={() => {
                                setSelectedAdsetId(adset.id);
                                setActiveTab('anuncios');
                              }}
                            >
                              {visibleColumns.status && (
                                <TableCell className="dark:text-gray-300">
                                  {(() => {
                                    // PRIORIDADE ABSOLUTA: effective_status (status de veiculação) é o que realmente importa
                                    let deliveryStatus = adset.effective_status;
                                    
                                    // Se não tiver effective_status, tenta inferir pelo status e dados de insights
                                    if (!deliveryStatus) {
                                      const hasSpend = insights && insights.spend > 0;
                                      const hasImpressions = insights && insights.impressions > 0;
                                      
                                      if (adset.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                                        deliveryStatus = 'ACTIVE';
                                      } else if (adset.status === 'ACTIVE') {
                                        deliveryStatus = 'PAUSED';
                                      } else {
                                        deliveryStatus = adset.status || 'UNKNOWN';
                                      }
                                    }
                                    
                                    if (!deliveryStatus || deliveryStatus === 'UNKNOWN') {
                                      return (
                                        <Badge className="bg-gray-500">
                                          Sem veiculação
                                        </Badge>
                                      );
                                    }
                                    
                                    const statusText = translateDeliveryStatus(deliveryStatus);
                                    const isActive = deliveryStatus === 'ACTIVE';
                                    
                                    // Cores baseadas no status de veiculação
                                    let badgeColor = 'bg-gray-500';
                                    if (isActive) {
                                      badgeColor = 'bg-green-500';
                                    } else if (deliveryStatus.includes('PAUSED')) {
                                      badgeColor = 'bg-yellow-500';
                                    }
                                    
                                    return (
                                      <Badge className={badgeColor}>
                                        {statusText}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                              )}
                              {visibleColumns.nome && <TableCell className="font-medium dark:text-white">{adset.name || '-'}</TableCell>}
                              {visibleColumns.objetivo && <TableCell className="dark:text-gray-300">{translateObjective(campaigns.find(c => c.id === adset.campaign_id)?.objective || adset.objective)}</TableCell>}
                              {visibleColumns.publicos && (
                                <TableCell className="dark:text-gray-300 max-w-[280px]">
                                  <span className="line-clamp-3" title={formatAdsetAudienceFull(adset.targeting)}>
                                    {formatAdsetAudience(adset.targeting) || formatAdsetAudienceFull(adset.targeting)}
                                  </span>
                                </TableCell>
                              )}
                              {visibleColumns.investimento && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.spend) : '-'}</TableCell>}
                              {visibleColumns.resultados && (
                                <TableCell className="dark:text-gray-300">
                                  {entityResultLine(
                                    campaigns.find((c) => String(c.id) === String(adset.campaign_id))?.objective || adset.objective,
                                    extractEntityMetrics(adset)
                                  ).line}
                                </TableCell>
                              )}
                              {visibleColumns.mensagens && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.messages || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.compras && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.purchases || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.custoResultado && (
                                <TableCell className="dark:text-gray-300">
                                  {formatCostPerResult(
                                    campaigns.find((c) => String(c.id) === String(adset.campaign_id))?.objective || adset.objective,
                                    adset
                                  )}
                                </TableCell>
                              )}
                              {visibleColumns.alcance && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.reach) : '-'}</TableCell>}
                              {visibleColumns.impressoes && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.impressions) : '-'}</TableCell>}
                              {visibleColumns.cliques && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.clicks) : '-'}</TableCell>}
                              {visibleColumns.ctr && <TableCell className="dark:text-gray-300">{insights ? formatPercentage(insights.ctr) : '-'}</TableCell>}
                              {visibleColumns.cpm && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.cpm) : '-'}</TableCell>}
                              {visibleColumns.roas && <TableCell className="dark:text-gray-300">{insights ? formatROAS(insights.roas) : '-'}</TableCell>}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Aba Anúncios */}
              <TabsContent value="anuncios" className="flex-1 overflow-auto mt-4 px-6 pb-6">
                {!selectedAdsetId ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Selecione um conjunto na aba Conjuntos para ver os anúncios.
                  </div>
                ) : loadingAds ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : ads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Nenhum anúncio encontrado para este conjunto.
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-x-auto">
                    <Table>
                      <TableHeader className="dark:bg-gray-900">
                        <TableRow className="dark:border-gray-700">
                          {visibleColumns.status && <TableHead className="dark:text-white">Status</TableHead>}
                          {visibleColumns.nome && <TableHead className="dark:text-white">Nome</TableHead>}
                          {visibleColumns.objetivo && <TableHead className="dark:text-white">Objetivo</TableHead>}
                          {visibleColumns.investimento && <TableHead className="dark:text-white">Investimento</TableHead>}
                          {visibleColumns.resultados && <TableHead className="dark:text-white">Resultados</TableHead>}
                          {visibleColumns.mensagens && <TableHead className="dark:text-white">Mensagens</TableHead>}
                          {visibleColumns.compras && <TableHead className="dark:text-white">Compras</TableHead>}
                          {visibleColumns.custoResultado && <TableHead className="dark:text-white">Custo/Resultado</TableHead>}
                          {visibleColumns.alcance && <TableHead className="dark:text-white">Alcance</TableHead>}
                          {visibleColumns.impressoes && <TableHead className="dark:text-white">Impressões</TableHead>}
                          {visibleColumns.cliques && <TableHead className="dark:text-white">Cliques</TableHead>}
                          {visibleColumns.ctr && <TableHead className="dark:text-white">CTR</TableHead>}
                          {visibleColumns.cpm && <TableHead className="dark:text-white">CPM</TableHead>}
                          {visibleColumns.roas && <TableHead className="dark:text-white">ROAS</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filterByStatus(ads, (ad) => {
                          let deliveryStatus = ad.effective_status;
                          if (!deliveryStatus) {
                            const insights = processInsights(ad);
                            const hasSpend = insights && insights.spend > 0;
                            const hasImpressions = insights && insights.impressions > 0;
                            if (ad.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                              deliveryStatus = 'ACTIVE';
                            } else if (ad.status === 'ACTIVE') {
                              deliveryStatus = 'PAUSED';
                            } else {
                              deliveryStatus = ad.status || 'UNKNOWN';
                            }
                          }
                          return deliveryStatus;
                        }).map((ad) => {
                          const insights = processInsights(ad);
                          
                          return (
                            <TableRow key={ad.id} className="dark:border-gray-700">
                              {visibleColumns.status && (
                                <TableCell className="dark:text-gray-300">
                                  {(() => {
                                    // PRIORIDADE ABSOLUTA: effective_status (status de veiculação) é o que realmente importa
                                    let deliveryStatus = ad.effective_status;
                                    
                                    // Se não tiver effective_status, tenta inferir pelo status e dados de insights
                                    if (!deliveryStatus) {
                                      const hasSpend = insights && insights.spend > 0;
                                      const hasImpressions = insights && insights.impressions > 0;
                                      
                                      if (ad.status === 'ACTIVE' && (hasSpend || hasImpressions)) {
                                        deliveryStatus = 'ACTIVE';
                                      } else if (ad.status === 'ACTIVE') {
                                        deliveryStatus = 'PAUSED';
                                      } else {
                                        deliveryStatus = ad.status || 'UNKNOWN';
                                      }
                                    }
                                    
                                    if (!deliveryStatus || deliveryStatus === 'UNKNOWN') {
                                      return (
                                        <Badge className="bg-gray-500">
                                          Sem veiculação
                                        </Badge>
                                      );
                                    }
                                    
                                    const statusText = translateDeliveryStatus(deliveryStatus);
                                    const isActive = deliveryStatus === 'ACTIVE';
                                    
                                    // Cores baseadas no status de veiculação
                                    let badgeColor = 'bg-gray-500';
                                    if (isActive) {
                                      badgeColor = 'bg-green-500';
                                    } else if (deliveryStatus.includes('PAUSED')) {
                                      badgeColor = 'bg-yellow-500';
                                    }
                                    
                                    return (
                                      <Badge className={badgeColor}>
                                        {statusText}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                              )}
                              {visibleColumns.nome && <TableCell className="font-medium dark:text-white">{ad.name || '-'}</TableCell>}
                              {visibleColumns.objetivo && <TableCell className="dark:text-gray-300">{translateObjective(campaigns.find(c => c.id === adsets.find(a => a.id === ad.adset_id)?.campaign_id)?.objective || ad.objective)}</TableCell>}
                              {visibleColumns.investimento && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.spend) : '-'}</TableCell>}
                              {visibleColumns.resultados && (
                                <TableCell className="dark:text-gray-300">
                                  {entityResultLine(
                                    campaigns.find((c) => c.id === adsets.find((a) => a.id === ad.adset_id)?.campaign_id)?.objective || ad.objective,
                                    extractEntityMetrics(ad)
                                  ).line}
                                </TableCell>
                              )}
                              {visibleColumns.mensagens && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.messages || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.compras && (
                                <TableCell className="dark:text-gray-300">
                                  {insights ? formatNumber(insights.purchases || 0) : '-'}
                                </TableCell>
                              )}
                              {visibleColumns.custoResultado && (
                                <TableCell className="dark:text-gray-300">
                                  {formatCostPerResult(
                                    campaigns.find((c) => c.id === adsets.find((a) => a.id === ad.adset_id)?.campaign_id)?.objective || ad.objective,
                                    ad
                                  )}
                                </TableCell>
                              )}
                              {visibleColumns.alcance && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.reach) : '-'}</TableCell>}
                              {visibleColumns.impressoes && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.impressions) : '-'}</TableCell>}
                              {visibleColumns.cliques && <TableCell className="dark:text-gray-300">{insights ? formatNumber(insights.clicks) : '-'}</TableCell>}
                              {visibleColumns.ctr && <TableCell className="dark:text-gray-300">{insights ? formatPercentage(insights.ctr) : '-'}</TableCell>}
                              {visibleColumns.cpm && <TableCell className="dark:text-gray-300">{insights ? formatCurrency(insights.cpm) : '-'}</TableCell>}
                              {visibleColumns.roas && <TableCell className="dark:text-gray-300">{insights ? formatROAS(insights.roas) : '-'}</TableCell>}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ClientMetaDetailView;

