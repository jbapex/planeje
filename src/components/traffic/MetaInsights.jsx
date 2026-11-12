import React, { useState, useEffect, useCallback, Fragment, useMemo, useRef } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { Badge } from '@/components/ui/badge';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Calendar as CalendarIcon, DollarSign, ChevronDown, ChevronRight, ShoppingCart, Target, TrendingUp, RefreshCw } from 'lucide-react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
    import { Calendar } from "@/components/ui/calendar";
    import { format, isValid, parseISO } from "date-fns";
    import { ptBR } from "date-fns/locale";
    import {
        getMetaAdAccountsErrorMessage,
        isMetaNoAdAccountsError,
        isMetaNoAdAccountsResponse,
    } from '@/lib/metaAdAccountsResponse';

    const METRICS_OPTIONS = {
      'Desempenho': [
        { id: 'spend', label: 'Investimento' },
        { id: 'impressions', label: 'Impressões' },
        { id: 'clicks', label: 'Cliques' },
        { id: 'reach', label: 'Alcance' },
        { id: 'frequency', label: 'Frequência' },
        { id: 'cpc', label: 'CPC (Custo por Clique)' },
        { id: 'cpm', label: 'CPM (Custo por 1k Impressões)' },
        { id: 'cpp', label: 'CPP (Custo por 1k Pessoas)' },
        { id: 'ctr', label: 'CTR (Taxa de Cliques) (%)' },
      ],
      'Resultados': [
        { id: 'results', label: 'Resultados' },
        { id: 'cost_per_result', label: 'Custo por Resultado' },
        { id: 'actions:omni_purchase', label: 'Compras' },
        { id: 'action_values:omni_purchase', label: 'Valor de Compra (Conversão)' },
        { id: 'cost_per_action_type:omni_purchase', label: 'Custo por Compra' },
        { id: 'actions:omni_add_to_cart', label: 'Adições ao Carrinho' },
        { id: 'cost_per_action_type:omni_add_to_cart', label: 'Custo por Adição ao Carrinho' },
        { id: 'actions:onsite_conversion.messaging_conversation_started_7d', label: 'Conversas por Mensagem' },
        { id: 'cost_per_action_type:onsite_conversion.messaging_conversation_started_7d', label: 'Custo por Mensagem' },
      ],
      'Engajamento': [
        { id: 'post_engagement', label: 'Engajamento com a publicação' },
        { id: 'post_reactions', label: 'Reações na publicação' },
        { id: 'post_comments', label: 'Comentários na publicação' },
        { id: 'post_shares', label: 'Compartilhamentos' },
      ],
      'Vídeo': [
        { id: 'video_p25_watched_actions', label: 'Visualizaram 25% do vídeo' },
        { id: 'video_p50_watched_actions', label: 'Visualizaram 50% do vídeo' },
        { id: 'video_p100_watched_actions', label: 'Visualizaram 100% do vídeo' },
        { id: 'cost_per_thruplay', label: 'Custo por ThruPlay' },
      ],
      'Conversões (Avançado)': [
        { id: 'actions:link_click', label: 'Cliques no link' },
        { id: 'website_purchase_roas', label: 'ROAS de Compras no site' },
      ]
    };

    const ALL_METRICS_FLAT = Object.values(METRICS_OPTIONS).flat();

    const formatCurrency = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
    };
    const formatNumber = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return new Intl.NumberFormat('pt-BR').format(num);
    };
    const formatDecimal = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return num.toFixed(2);
    };
    const formatPercentage = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return `${num.toFixed(2)}%`;
    };
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'dd/MM/yyyy');
        } catch (error) {
            return 'Data inválida';
        }
    };

    const getFormattedValue = (insights, metricId) => {
        if (!insights) return 'N/A';
        
        if (metricId.startsWith('actions:')) {
            const actionType = metricId.split(':')[1];
            const action = (insights.actions || []).find(a => a.action_type === actionType);
            return formatNumber(action?.value);
        }
        
        if (metricId.startsWith('action_values:')) {
            const actionType = metricId.split(':')[1];
            const action = (insights.action_values || []).find(a => a.action_type === actionType);
            return formatCurrency(action?.value);
        }

        if (metricId.startsWith('cost_per_action_type:')) {
            const actionType = metricId.split(':')[1];
            const action = (insights.cost_per_action_type || []).find(a => a.action_type === actionType);
            return formatCurrency(action?.value);
        }

        if (metricId === 'website_purchase_roas') {
           const roas = (insights.website_purchase_roas || []).find(r => r.action_type === 'omni_purchase');
           return roas ? `${formatDecimal(roas.value)}x` : 'N/A';
        }

        const value = insights[metricId];

        switch (metricId) {
            case 'spend':
            case 'cpc':
            case 'cpm':
            case 'cpp':
            case 'cost_per_thruplay':
            case 'cost_per_result':
                return formatCurrency(value);
            case 'ctr':
                return formatPercentage(value);
            case 'frequency':
                return formatDecimal(value);
            default:
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) { return 'N/A'; }
                if (Array.isArray(value)) {
                     const metric = value.find(v => v.action_type === metricId);
                     return formatNumber(metric?.value);
                }
                // Garante que value seja um número antes de formatar
                if (value === null || value === undefined || value === '') {
                    return 'N/A';
                }
                const numValue = typeof value === 'number' ? value : parseFloat(value);
                if (isNaN(numValue)) {
                    return 'N/A';
                }
                return formatNumber(numValue);
        }
    };

    const DataRow = ({ level, data, onToggle, isExpanded, type, selectedMetrics }) => {
        const insights = data.insights?.data[0];
        const handleRowClick = (e) => {
            // Evita toggle se clicar diretamente no botão da seta
            if (e.target.closest('button')) {
                return;
            }
            if (onToggle) {
                onToggle();
            }
        };
        
        return (
            <TableRow 
                className={`dark:border-gray-700 ${level > 0 ? 'bg-gray-50 dark:bg-gray-800/50' : ''} ${onToggle ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50' : ''}`}
                onClick={handleRowClick}
            >
                <TableCell style={{ paddingLeft: `${10 + level * 20}px` }}>
                    <div className="flex items-center gap-2">
                        {onToggle && (
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onToggle(); }} className="h-6 w-6">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                        )}
                        <span className="font-medium dark:text-white">{data.name}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <Badge variant={type === 'campaign' ? 'default' : 'secondary'} className={type === 'campaign' ? '' : 'dark:bg-gray-600'}>{type}</Badge>
                </TableCell>
                <TableCell>
                    <Badge variant={data.status === 'ACTIVE' ? 'success' : 'secondary'} className={data.status === 'ACTIVE' ? 'bg-green-500' : 'dark:bg-gray-600'}>
                        {data.status}
                    </Badge>
                </TableCell>
                <TableCell className="dark:text-gray-300">{formatDate(data.start_time)}</TableCell>
                {selectedMetrics.map(metricId => (
                    <TableCell key={metricId} className="text-right dark:text-gray-300">
                        {getFormattedValue(insights, metricId)}
                    </TableCell>
                ))}
            </TableRow>
        )
    };


    const MetaInsights = () => {
        const [adAccounts, setAdAccounts] = useState([]);
        const [allAdAccounts, setAllAdAccounts] = useState([]); // Todas as contas do Meta
        const [selectedAccount, setSelectedAccount] = useState(null);
        const [campaigns, setCampaigns] = useState({});
        const [headerInsights, setHeaderInsights] = useState(null);
        const [loadingAccounts, setLoadingAccounts] = useState(true);
        const [loading, setLoading] = useState(false);
        const [selectedMetrics, setSelectedMetrics] = useState(['spend', 'results', 'actions', 'action_values']);
        const [expandedRows, setExpandedRows] = useState({});
        const [date, setDate] = useState({
          from: new Date(new Date().setDate(new Date().getDate() - 30)),
          to: new Date(),
        });
        const [selectedCampaignFilter, setSelectedCampaignFilter] = useState('all');
        const [selectedAdSetFilter, setSelectedAdSetFilter] = useState('all');
        const [selectedAdFilter, setSelectedAdFilter] = useState('all');
        const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
        
        // Filtro por cliente
        const [selectedClient, setSelectedClient] = useState('all');
        const [clients, setClients] = useState([]);
        const [linkedAccounts, setLinkedAccounts] = useState([]);
        const [loadingClients, setLoadingClients] = useState(false);
        
        const [adSetOptions, setAdSetOptions] = useState([]);
        const [adOptions, setAdOptions] = useState([]);
        const [rateLimitCooldown, setRateLimitCooldown] = useState(false);
        const [lastRateLimitTime, setLastRateLimitTime] = useState(null);
        const [loadingProgress, setLoadingProgress] = useState(null);
        const [loadAllCampaigns, setLoadAllCampaigns] = useState(false);
        const [totalCampaignsAvailable, setTotalCampaignsAvailable] = useState(null);

        const { toast } = useToast();

        const fetchData = useCallback(async (action, body) => {
            setLoading(true);
            try {
                if (!date?.from || !isValid(date.from) || !date?.to || !isValid(date.to)) {
                  throw new Error("Período inválido");
                }
                const time_range = {
                    since: format(date.from, 'yyyy-MM-dd'),
                    until: format(date.to, 'yyyy-MM-dd'),
                };
                
                // Filtra métricas inválidas e converte para formato da API
                const metricsToSend = (body.metrics || selectedMetrics)
                    .filter(m => {
                        // Remove métricas no formato actions:xxx que não são válidas
                        if (m.includes(':') && (m.startsWith('actions:') || m.startsWith('action_values:') || m.startsWith('cost_per_action_type:'))) {
                            return false;
                        }
                        return true;
                    })
                    // Adiciona actions e action_values se necessário
                    .concat(
                        (body.metrics || selectedMetrics).some(m => m.includes('omni_purchase') || m.includes('omni_add_to_cart') || m.includes('messaging'))
                            ? ['actions', 'action_values']
                            : []
                    )
                    // Remove duplicatas
                    .filter((v, i, a) => a.indexOf(v) === i);
                
                const requestBody = { ...body, metrics: metricsToSend, time_range };
                
                const { data, error } = await supabase.functions.invoke('meta-ads-api', { body: requestBody });

                if (error) throw error;
                
                if (data?.error) {
                    const errorMessage = typeof data.error === 'string' 
                        ? data.error 
                        : data.error?.message || JSON.stringify(data.error);
                    throw new Error(errorMessage);
                }
                
                // Processa os dados para extrair métricas específicas de actions
                if (data?.campaigns) {
                    data.campaigns = data.campaigns.map(campaign => {
                        if (campaign.insights?.data?.[0]) {
                            const insight = campaign.insights.data[0];
                            // Extrai omni_purchase do array actions
                            if (insight.actions) {
                                const purchaseAction = insight.actions.find(a => a.action_type === 'omni_purchase');
                                if (purchaseAction) {
                                    insight['actions:omni_purchase'] = purchaseAction.value;
                                }
                                const addToCartAction = insight.actions.find(a => a.action_type === 'omni_add_to_cart');
                                if (addToCartAction) {
                                    insight['actions:omni_add_to_cart'] = addToCartAction.value;
                                }
                            }
                            // Extrai omni_purchase do array action_values
                            if (insight.action_values) {
                                const purchaseValue = insight.action_values.find(a => a.action_type === 'omni_purchase');
                                if (purchaseValue) {
                                    insight['action_values:omni_purchase'] = purchaseValue.value;
                                }
                            }
                        }
                        return campaign;
                    });
                }
                
                // Processa adsets e ads também
                if (data?.adsets) {
                    data.adsets = data.adsets.map(adset => {
                        if (adset.insights?.data?.[0]) {
                            const insight = adset.insights.data[0];
                            if (insight.actions) {
                                const purchaseAction = insight.actions.find(a => a.action_type === 'omni_purchase');
                                if (purchaseAction) {
                                    insight['actions:omni_purchase'] = purchaseAction.value;
                                }
                            }
                            if (insight.action_values) {
                                const purchaseValue = insight.action_values.find(a => a.action_type === 'omni_purchase');
                                if (purchaseValue) {
                                    insight['action_values:omni_purchase'] = purchaseValue.value;
                                }
                            }
                        }
                        return adset;
                    });
                }
                
                if (data?.ads) {
                    data.ads = data.ads.map(ad => {
                        if (ad.insights?.data?.[0]) {
                            const insight = ad.insights.data[0];
                            if (insight.actions) {
                                const purchaseAction = insight.actions.find(a => a.action_type === 'omni_purchase');
                                if (purchaseAction) {
                                    insight['actions:omni_purchase'] = purchaseAction.value;
                                }
                            }
                            if (insight.action_values) {
                                const purchaseValue = insight.action_values.find(a => a.action_type === 'omni_purchase');
                                if (purchaseValue) {
                                    insight['action_values:omni_purchase'] = purchaseValue.value;
                                }
                            }
                        }
                        return ad;
                    });
                }
                
                // Processa account insights também
                if (data?.insights) {
                    const insight = data.insights;
                    if (insight.actions) {
                        const purchaseAction = insight.actions.find(a => a.action_type === 'omni_purchase');
                        if (purchaseAction) {
                            insight['actions:omni_purchase'] = purchaseAction.value;
                        }
                    }
                    if (insight.action_values) {
                        const purchaseValue = insight.action_values.find(a => a.action_type === 'omni_purchase');
                        if (purchaseValue) {
                            insight['action_values:omni_purchase'] = purchaseValue.value;
                        }
                    }
                }
                
                return data;
            } catch (err) {
                const errorMessage = err?.message || err?.error?.message || `Erro desconhecido ao buscar ${action}`;
                const isRateLimit = errorMessage.includes('limit') || 
                                   errorMessage.includes('rate') || 
                                   errorMessage.includes('User request limit');
                
                console.error(`Erro ao buscar ${action}:`, err);
                
                // Não mostra toast para rate limit (será tratado no carregamento automático)
                // Apenas loga o erro para debug
                if (!isRateLimit) {
                    toast({ 
                        title: `Erro ao buscar ${action}`, 
                        description: errorMessage, 
                        variant: 'destructive' 
                    });
                } else {
                    console.warn(`⚠️ Rate limit detectado ao buscar ${action} - silenciado`);
                }
                
                return null;
            } finally {
                setLoading(false);
            }
        }, [toast, selectedMetrics, date]);
        
        // Busca clientes e contas vinculadas
        useEffect(() => {
            const fetchClients = async () => {
                setLoadingClients(true);
                try {
                    const { data, error } = await supabase
                        .from('clientes')
                        .select('id, empresa')
                        .eq('etapa', 'closed')
                        .order('empresa', { ascending: true });

                    if (error) throw error;
                    setClients(data || []);
                } catch (err) {
                    console.error('Erro ao buscar clientes:', err);
                } finally {
                    setLoadingClients(false);
                }
            };
            fetchClients();
        }, []);

        /** Evita toast/console duplicados se o mesmo erro ocorrer em sequência (ex.: hot reload). */
        const lastAccountsErrorRef = useRef(null);
        const emptyMetaAccountsToastShownRef = useRef(false);

        // Uma sequência só: contas ligadas no Supabase (se cliente específico) + get-ad-accounts uma vez.
        // Depende apenas de selectedClient — não de linkedAccounts — para não disparar 2× ao trocar cliente.
        useEffect(() => {
            let cancelled = false;

            const run = async () => {
                setLoadingAccounts(true);
                let linked = [];

                if (selectedClient === 'all') {
                    if (!cancelled) setLinkedAccounts([]);
                } else {
                    try {
                        const { data, error } = await supabase
                            .from('cliente_meta_accounts')
                            .select('meta_account_id, meta_account_name')
                            .eq('cliente_id', selectedClient)
                            .eq('is_active', true);

                        if (error) throw error;
                        linked = data || [];
                        if (!cancelled) setLinkedAccounts(linked);
                    } catch (err) {
                        console.error('Erro ao buscar contas vinculadas:', err);
                        linked = [];
                        if (!cancelled) setLinkedAccounts([]);
                    }
                }

                if (cancelled) return;

                try {
                    const { data, error } = await supabase.functions.invoke('meta-ads-api', {
                        body: { action: 'get-ad-accounts' },
                    });
                    if (error) throw error;

                    if (data?.error) {
                        const errorMessage = getMetaAdAccountsErrorMessage(data);
                        if (isMetaNoAdAccountsResponse(data)) {
                            lastAccountsErrorRef.current = null;
                            if (!cancelled) {
                                setAllAdAccounts([]);
                                setAdAccounts([]);
                            }
                            if (!emptyMetaAccountsToastShownRef.current) {
                                emptyMetaAccountsToastShownRef.current = true;
                                console.warn('[MetaInsights] Sem contas de anúncio no Meta:', errorMessage);
                                toast({
                                    title: 'Nenhuma conta de anúncio no Meta',
                                    description:
                                        'O token responde, mas o System User não vê contas act_… Atribua contas no Business Manager ou ajuste META_BUSINESS_ID.',
                                    variant: 'default',
                                });
                            }
                            return;
                        }
                        throw new Error(errorMessage);
                    }

                    if (data?.adAccounts && Array.isArray(data.adAccounts)) {
                        emptyMetaAccountsToastShownRef.current = false;
                        lastAccountsErrorRef.current = null;
                        if (!cancelled) setAllAdAccounts(data.adAccounts);

                        if (selectedClient === 'all' || linked.length === 0) {
                            if (!cancelled) setAdAccounts(data.adAccounts);
                        } else {
                            const linkedIds = linked.map((link) => link.meta_account_id);
                            const filtered = data.adAccounts.filter((acc) => linkedIds.includes(acc.id));
                            if (!cancelled) {
                                setAdAccounts(filtered);
                                setSelectedAccount((prev) =>
                                    prev && !filtered.some((acc) => acc.id === prev) ? null : prev
                                );
                            }
                        }
                    } else {
                        if (!cancelled) {
                            setAdAccounts([]);
                            setAllAdAccounts([]);
                        }
                    }
                } catch (err) {
                    const errorMessage =
                        err?.message || err?.error?.message || 'Erro desconhecido ao buscar contas';
                    if (isMetaNoAdAccountsError(err)) {
                        lastAccountsErrorRef.current = null;
                        if (!cancelled) {
                            setAllAdAccounts([]);
                            setAdAccounts([]);
                        }
                        if (!emptyMetaAccountsToastShownRef.current) {
                            emptyMetaAccountsToastShownRef.current = true;
                            console.warn('[MetaInsights] Sem contas de anúncio no Meta:', errorMessage);
                            toast({
                                title: 'Nenhuma conta de anúncio no Meta',
                                description:
                                    'O token responde, mas o System User não vê contas act_… Atribua contas no Business Manager ou ajuste META_BUSINESS_ID.',
                                variant: 'default',
                            });
                        }
                    } else {
                        console.error('Erro ao buscar contas:', err);
                        if (lastAccountsErrorRef.current !== errorMessage) {
                            lastAccountsErrorRef.current = errorMessage;
                            toast({
                                title: 'Erro ao buscar contas',
                                description: errorMessage,
                                variant: 'destructive',
                            });
                        }
                        if (!cancelled) {
                            setAdAccounts([]);
                            setAllAdAccounts([]);
                        }
                    }
                } finally {
                    if (!cancelled) setLoadingAccounts(false);
                }
            };

            run();
            return () => {
                cancelled = true;
            };
            // toast é intencionalmente omitido: evita re-fetch ao mudar referência do hook
        }, [selectedClient]);

        const fetchAllDataForAccount = useCallback(async (loadAll = false) => {
            if (!selectedAccount || !date?.from || !date?.to) return;
            
            setCampaigns({});
            setHeaderInsights(null);
            setExpandedRows({});
            setSelectedCampaignFilter('all');
            setSelectedAdSetFilter('all');
            setSelectedAdFilter('all');
            setAdSetOptions([]);
            setAdOptions([]);
            setLoadingProgress({ current: 0, total: 0, message: 'Carregando campanhas...' });

            try {
                // 1. Carrega campanhas
            const campaignsData = await fetchData('campanhas', { action: 'get-campaigns', adAccountId: selectedAccount });
                console.log('📊 Campaigns data received:', campaignsData);
                
                if (!campaignsData?.campaigns || campaignsData.campaigns.length === 0) {
                    console.warn('⚠️ Nenhuma campanha encontrada');
                    setCampaigns({});
                    setLoadingProgress(null);
                    return;
                }
                
                // Filtra campanhas baseado no modo selecionado
                let campaignsToProcess = [];
                
                if (loadAll) {
                    // Carrega TODAS as campanhas (ativas, pausadas, arquivadas, etc.)
                    campaignsToProcess = campaignsData.campaigns.filter(c => {
                        const hasValidInsights = c.insights && 
                               c.insights.data && 
                               Array.isArray(c.insights.data) && 
                               c.insights.data.length > 0;
                        
                        if (!hasValidInsights && c.insights?.error) {
                            console.error(`❌ Campaign ${c.id} (${c.name}) error:`, JSON.stringify(c.insights.error, null, 2));
                        }
                        
                        return hasValidInsights;
                    });
                    console.log(`✅ Total de campanhas (todas): ${campaignsToProcess.length}`);
                } else {
                    // Carrega APENAS campanhas ATIVAS (mais rápido)
                    campaignsToProcess = campaignsData.campaigns.filter(c => {
                        // Verifica se está ativa E tem insights válidos
                        const isActive = c.status === 'ACTIVE';
                        const hasValidInsights = c.insights && 
                               c.insights.data && 
                               Array.isArray(c.insights.data) && 
                               c.insights.data.length > 0;
                        
                        if (!hasValidInsights && c.insights?.error) {
                            console.error(`❌ Campaign ${c.id} (${c.name}) error:`, JSON.stringify(c.insights.error, null, 2));
                        }
                        
                        return isActive && hasValidInsights;
                    });
                    console.log(`✅ Total de campanhas ativas: ${campaignsToProcess.length}`);
                }
                
                // Ordena por data de atualização (mais recentes primeiro) para priorizar campanhas ativas
                campaignsToProcess.sort((a, b) => {
                    const dateA = a.updated_time ? new Date(a.updated_time) : new Date(0);
                    const dateB = b.updated_time ? new Date(b.updated_time) : new Date(0);
                    return dateB - dateA; // Mais recentes primeiro
                });
                
                // Limita o número de campanhas processadas inicialmente para contas com muitos dados
                // Isso melhora significativamente o tempo de carregamento para contas grandes
                const MAX_CAMPAIGNS_INITIAL = 50; // Limite inicial de campanhas
                const totalAvailable = campaignsToProcess.length;
                const hasManyCampaigns = totalAvailable > MAX_CAMPAIGNS_INITIAL;
                
                // Armazena o total disponível para mostrar no botão
                setTotalCampaignsAvailable(totalAvailable);
                
                if (hasManyCampaigns && !loadAll) {
                    // Para contas com muitas campanhas, carrega apenas as primeiras N (mais recentes)
                    const initialCampaigns = campaignsToProcess.slice(0, MAX_CAMPAIGNS_INITIAL);
                    const remainingCount = totalAvailable - MAX_CAMPAIGNS_INITIAL;
                    
                    console.log(`⚠️ Conta com muitas campanhas (${totalAvailable}). Carregando apenas as ${MAX_CAMPAIGNS_INITIAL} mais recentes inicialmente.`);
                    
                    toast({
                        title: 'Muitas campanhas detectadas',
                        description: `Esta conta tem ${totalAvailable} campanhas. Carregando as ${MAX_CAMPAIGNS_INITIAL} mais recentes. Use "Carregar Todas" para ver todas (${remainingCount} restantes).`,
                        variant: 'default',
                        duration: 6000,
                    });
                    
                    campaignsToProcess = initialCampaigns;
                } else {
                    // Se não há limite ou se está carregando todas, limpa o estado
                    setTotalCampaignsAvailable(null);
                }
                
                if (campaignsToProcess.length === 0) {
                    console.warn(`⚠️ Nenhuma campanha ${loadAll ? '' : 'ativa'} encontrada`);
                    setCampaigns({});
                    setLoadingProgress(null);
                    toast({
                        title: loadAll ? 'Nenhuma campanha encontrada' : 'Nenhuma campanha ativa encontrada',
                        description: loadAll 
                            ? 'Não há campanhas com dados disponíveis.' 
                            : 'Não há campanhas ativas. Clique em "Carregar Todas" para ver campanhas pausadas e arquivadas.',
                        variant: 'default',
                        duration: 5000,
                    });
                    return;
                }
                
                // Inicializa campanhas com children vazios
                let campaignsObj = campaignsToProcess.reduce((acc, c) => ({...acc, [c.id]: {...c, children: {}}}), {});
                setCampaigns(campaignsObj);
                
                // 2. Carrega header insights em paralelo (não bloqueia o carregamento)
                const headerMetrics = ['spend', 'results', 'actions', 'action_values', 'website_purchase_roas'];
                fetchData('insights gerais', { action: 'get-account-insights', adAccountId: selectedAccount, metrics: headerMetrics })
                    .then(accountInsightsData => {
                        if(accountInsightsData?.insights) {
                            setHeaderInsights(accountInsightsData.insights);
                        }
                    })
                    .catch(err => console.warn('Erro ao carregar header insights:', err));
                
                // 3. Carrega TODOS os ad sets e ads de forma controlada
                const totalCampaigns = campaignsToProcess.length;
                let rateLimitDetected = false;
                let loadedCampaigns = 0;
                const adSetsList = [];
                const adsList = [];
                
                setLoadingProgress({
                    current: 0,
                    total: totalCampaigns,
                    message: `Carregando conjuntos e anúncios de ${totalCampaigns} campanha(s)...`
                });
                
                toast({
                    title: 'Carregando dados completos',
                    description: `Carregando todos os conjuntos e anúncios de ${totalCampaigns} campanha(s) ${loadAll ? '(todas)' : '(ativas)'}. Isso pode levar alguns minutos...`,
                    variant: 'default',
                    duration: 5000,
                });
                
                for (let i = 0; i < campaignsToProcess.length; i++) {
                    const campaign = campaignsToProcess[i];
                    
                    // Verifica rate limit antes de continuar
                    if (rateLimitDetected) {
                        console.warn('⚠️ Rate limit detectado. Pausando carregamento automático.');
                        toast({
                            title: 'Rate limit atingido',
                            description: `Carregados ${loadedCampaigns} de ${totalCampaigns} campanhas. Aguarde alguns minutos antes de tentar novamente.`,
                            variant: 'destructive',
                            duration: 8000,
                        });
                        break;
                    }
                    
                    // Delay entre campanhas (reduzido para 500ms - mais rápido)
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    setLoadingProgress({
                        current: i + 1,
                        total: totalCampaigns,
                        message: `Carregando campanha ${i + 1}/${totalCampaigns}: ${campaign.name?.substring(0, 30)}...`
                    });
                    
                    try {
                        console.log(`📦 [${i + 1}/${totalCampaigns}] Carregando ad sets da campanha ${campaign.id}...`);
                        
                        // Aguarda antes de fazer a requisição (reduzido para 300ms - mais rápido)
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // Carrega ad sets da campanha
                        let adsetsData = null;
                        try {
                            adsetsData = await fetchData('conjuntos de anúncios', { 
                                action: 'get-adsets', 
                                campaignId: campaign.id 
                            });
                            
                            // Se fetchData retornou null, pode ser rate limit
                            // Mas continua tentando as próximas campanhas (não para tudo)
                            if (!adsetsData) {
                                console.warn(`⚠️ Nenhum dado retornado para campanha ${campaign.id} - pode ser rate limit`);
                                // Não para tudo, apenas marca e continua
                                if (!rateLimitDetected) {
                                    rateLimitDetected = true;
                                    setRateLimitCooldown(true);
                                    setLastRateLimitTime(Date.now());
                                }
                                // Continua com próxima campanha ao invés de break
                                loadedCampaigns++;
                                continue;
                            }
                        } catch (fetchErr) {
                            const errorMsg = fetchErr.message || '';
                            if (errorMsg.includes('limit') || errorMsg.includes('rate') || errorMsg.includes('User request limit')) {
                                console.warn(`⚠️ Rate limit detectado na campanha ${campaign.id}`);
                                if (!rateLimitDetected) {
                                    rateLimitDetected = true;
                                    setRateLimitCooldown(true);
                                    setLastRateLimitTime(Date.now());
                                }
                                // Continua com próxima campanha ao invés de break
                                loadedCampaigns++;
                                continue;
                            }
                            // Se não for rate limit, continua tentando
                            adsetsData = null;
                            loadedCampaigns++;
                            continue;
                        }
                        
                        console.log(`📊 Ad sets recebidos para campanha ${campaign.id}:`, adsetsData?.adsets?.length || 0, adsetsData);
                        
                        if (!adsetsData) {
                            console.warn(`⚠️ Nenhum dado retornado para campanha ${campaign.id}`);
                            // Adiciona campanha mesmo sem ad sets
                            setCampaigns(prev => ({
                                ...prev,
                                [campaign.id]: {
                                    ...prev[campaign.id],
                                    children: {}
                                }
                            }));
                            loadedCampaigns++;
                            continue;
                        }
                        
                        // Sempre inicializa o objeto de ad sets, mesmo que vazio
                        const adSetsObj = {};
                        
                        if (adsetsData?.adsets && adsetsData.adsets.length > 0) {
                            console.log(`✅ Processando ${adsetsData.adsets.length} ad sets da campanha ${campaign.id}`);
                            
                            // Processa cada ad set
                            for (let j = 0; j < adsetsData.adsets.length; j++) {
                                const adset = adsetsData.adsets[j];
                                
                                // Verifica rate limit antes de continuar
                                if (rateLimitDetected) {
                                    console.warn(`⚠️ Rate limit detectado ao processar ad set ${j + 1}/${adsetsData.adsets.length}`);
                                    break;
                                }
                                
                                // Delay entre ad sets (reduzido para 300ms - mais rápido)
                                if (j > 0) {
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                }
                                
                                try {
                                    console.log(`  📦 [${j + 1}/${adsetsData.adsets.length}] Carregando ads do adset ${adset.id}...`);
                                    
                                    // Aguarda antes de fazer a requisição (reduzido para 200ms - mais rápido)
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    
                                    // Carrega ads do ad set
                                    let adsData = null;
                                    try {
                                        adsData = await fetchData('anúncios', { 
                                            action: 'get-ads', 
                                            adsetId: adset.id 
                                        });
                                    } catch (adFetchErr) {
                                        const errorMsg = adFetchErr.message || '';
                                        if (errorMsg.includes('limit') || errorMsg.includes('rate') || errorMsg.includes('User request limit')) {
                                            if (!rateLimitDetected) {
                                                rateLimitDetected = true;
                                                setRateLimitCooldown(true);
                                                setLastRateLimitTime(Date.now());
                                            }
                                            console.warn(`  ⚠️ Rate limit ao buscar ads do adset ${adset.id} - continuando com próximo adset`);
                                            // Continua com próximo adset ao invés de break
                                            // Adiciona adset mesmo sem ads
                                            adSetsObj[adset.id] = {
                                                ...adset,
                                                type: 'adset',
                                                children: {}
                                            };
                                            adSetsList.push({
                                                id: adset.id,
                                                name: adset.name,
                                                campaign_id: campaign.id
                                            });
                                            continue;
                                        }
                                        console.warn(`  ⚠️ Erro ao buscar ads do adset ${adset.id}:`, adFetchErr.message);
                                        adsData = null;
                                    }
                                    
                                    const adsObj = {};
                                    if (adsData?.ads && adsData.ads.length > 0) {
                                        adsData.ads.forEach(ad => {
                                            adsObj[ad.id] = {
                                                ...ad,
                                                type: 'ad',
                                                children: {}
                                            };
                                            
                                            // Adiciona à lista de ads para o filtro
                                            adsList.push({
                                                id: ad.id,
                                                name: ad.name,
                                                adset_id: adset.id
                                            });
                                        });
                                        console.log(`  ✅ ${adsData.ads.length} ads carregados para adset ${adset.id}`);
                                    } else {
                                        console.log(`  ⚠️ Nenhum ad encontrado para adset ${adset.id}`);
                                    }
                                    
                                    // Adiciona adset mesmo sem ads (importante!)
                                    adSetsObj[adset.id] = {
                                        ...adset,
                                        type: 'adset',
                                        children: adsObj
                                    };
                                    
                                    // Adiciona à lista de ad sets para o filtro
                                    adSetsList.push({
                                        id: adset.id,
                                        name: adset.name,
                                        campaign_id: campaign.id
                                    });
                                    
                                    console.log(`  ✅ Adset ${adset.id} adicionado (${Object.keys(adsObj).length} ads)`);
                                    
                                } catch (adErr) {
                                    const errorMsg = adErr.message || '';
                                    if (errorMsg.includes('limit') || errorMsg.includes('rate') || errorMsg.includes('User request limit')) {
                                        rateLimitDetected = true;
                                        console.warn(`  ⚠️ Rate limit ao carregar ads do adset ${adset.id}`);
                                        // Adiciona adset mesmo sem ads
                                        adSetsObj[adset.id] = {
                                            ...adset,
                                            type: 'adset',
                                            children: {}
                                        };
                                        adSetsList.push({
                                            id: adset.id,
                                            name: adset.name,
                                            campaign_id: campaign.id
                                        });
                                        break;
                                    } else {
                                        console.warn(`  ⚠️ Erro ao carregar ads do adset ${adset.id}:`, adErr.message);
                                        // Adiciona adset mesmo sem ads em caso de erro
                                        adSetsObj[adset.id] = {
                                            ...adset,
                                            type: 'adset',
                                            children: {}
                                        };
                                        adSetsList.push({
                                            id: adset.id,
                                            name: adset.name,
                                            campaign_id: campaign.id
                                        });
                                    }
                                }
                            }
                            
                            // Atualiza o estado da campanha com os ad sets carregados (IMPORTANTE: sempre atualiza)
                            setCampaigns(prev => ({
                                ...prev,
                                [campaign.id]: {
                                    ...prev[campaign.id],
                                    children: adSetsObj
                                }
                            }));
                            
                            // Atualiza adSetOptions imediatamente (mesmo que vazio)
                            if (adSetsList.length > 0) {
                                setAdSetOptions(prev => {
                                    const filtered = prev.filter(adset => adset.campaign_id !== campaign.id);
                                    return [...filtered, ...adSetsList];
                                });
                                console.log(`✅ AdSetOptions atualizado: ${adSetsList.length} ad sets adicionados`);
                            }
                            
                            // Atualiza adOptions imediatamente
                            if (adsList.length > 0) {
                                setAdOptions(prev => {
                                    const filtered = prev.filter(ad => !adSetsList.some(adset => adset.id === ad.adset_id));
                                    return [...filtered, ...adsList];
                                });
                                console.log(`✅ AdOptions atualizado: ${adsList.length} ads adicionados`);
                            }
                            
                            if (Object.keys(adSetsObj).length > 0) {
                                console.log(`✅ Campanha ${campaign.id}: ${Object.keys(adSetsObj).length} ad sets carregados com sucesso`);
                            } else {
                                console.warn(`⚠️ Campanha ${campaign.id}: Nenhum ad set carregado (pode estar vazia ou erro)`);
                            }
                            
                            loadedCampaigns++;
                        } else {
                            // Campanha sem ad sets retornados, mas marca como carregada
                            console.warn(`⚠️ Campanha ${campaign.id}: Sem ad sets retornados (pode estar vazia)`);
                            // Garante que a campanha tenha children vazio
                            setCampaigns(prev => ({
                                ...prev,
                                [campaign.id]: {
                                    ...prev[campaign.id],
                                    children: {}
                                }
                            }));
                            loadedCampaigns++;
                        }
                        
                    } catch (adsetErr) {
                        const errorMsg = adsetErr.message || '';
                        // Não mostra toast de erro aqui - será tratado no final
                        if (errorMsg.includes('limit') || errorMsg.includes('rate') || errorMsg.includes('User request limit')) {
                            rateLimitDetected = true;
                            console.warn(`⚠️ Rate limit ao carregar ad sets da campanha ${campaign.id}`);
                            setRateLimitCooldown(true);
                            setLastRateLimitTime(Date.now());
                            break;
                        } else {
                            console.warn(`⚠️ Erro ao carregar ad sets da campanha ${campaign.id}:`, adsetErr.message);
                            // Continua com a próxima campanha mesmo se der erro (mas não rate limit)
                            loadedCampaigns++;
                        }
                    }
                }
                
                // Atualiza os filtros com todos os dados carregados
                setAdSetOptions(adSetsList);
                setAdOptions(adsList);
                
                setLoadingProgress(null);
                
                if (loadedCampaigns > 0) {
                    const successMessage = rateLimitDetected
                        ? `Carregados ${loadedCampaigns} de ${totalCampaigns} campanhas. Rate limit detectado - alguns dados podem estar incompletos.`
                        : `✅ Todos os dados carregados! ${loadedCampaigns} campanha(s), ${adSetsList.length} conjunto(s) e ${adsList.length} anúncio(s).`;
                    
                    toast({
                        title: rateLimitDetected ? 'Carregamento parcial' : 'Carregamento concluído',
                        description: successMessage,
                        variant: rateLimitDetected ? 'default' : 'default',
                        duration: 6000,
                    });
                    
                    console.log(`✅ Carregamento concluído: ${loadedCampaigns} campanhas, ${adSetsList.length} ad sets, ${adsList.length} ads`);
                }
                
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
                setLoadingProgress(null);
                toast({
                    title: 'Erro ao carregar dados',
                    description: error.message || 'Erro desconhecido',
                    variant: 'destructive',
                });
            }
        }, [selectedAccount, date, fetchData, toast]);
        
        // Função para recarregar com todas as campanhas
        const handleLoadAllCampaigns = useCallback(() => {
            setLoadAllCampaigns(true);
            fetchAllDataForAccount(true);
        }, [fetchAllDataForAccount]);
        
        useEffect(() => {
            // Reseta para carregar só ativas quando mudar conta ou data
            setLoadAllCampaigns(false);
            fetchAllDataForAccount(false);
        }, [selectedAccount, date]);

        const fetchAdSetsForCampaign = useCallback(async (campaignId) => {
            if (campaignId === 'all') {
                setAdSetOptions([]);
                setSelectedAdSetFilter('all');
                return;
            }
            const data = await fetchData('conjuntos de anúncios', { action: 'get-adsets', campaignId: campaignId });
            setAdSetOptions(data?.adsets?.filter(c => {
                return c.insights && 
                       c.insights.data && 
                       Array.isArray(c.insights.data) && 
                       c.insights.data.length > 0;
            }) || []);
            setSelectedAdSetFilter('all');
        }, [fetchData]);

        const fetchAdsForAdSet = useCallback(async (adsetId) => {
            if (adsetId === 'all') {
                setAdOptions([]);
                setSelectedAdFilter('all');
                return;
            }
            const data = await fetchData('anúncios', { action: 'get-ads', adsetId: adsetId });
            setAdOptions(data?.ads?.filter(c => {
                return c.insights && 
                       c.insights.data && 
                       Array.isArray(c.insights.data) && 
                       c.insights.data.length > 0;
            }) || []);
            setSelectedAdFilter('all');
        }, [fetchData]);

        const handleToggle = async (type, parentId, id) => {
            const rowKey = `${type}-${id}`;
            const isExpanded = !!expandedRows[rowKey];
            
            // Verifica se já tem dados carregados (cache)
            let hasLoadedData = false;
            if (type === 'campaign' && campaigns[id]?.children && Object.keys(campaigns[id].children).length > 0) {
                hasLoadedData = true;
            } else if (type === 'adset' && parentId && campaigns[parentId]?.children?.[id]?.children && Object.keys(campaigns[parentId].children[id].children).length > 0) {
                hasLoadedData = true;
            }
            
            // Se já tem dados, apenas expande/colapsa (sem fazer requisição)
            if (hasLoadedData) {
                setExpandedRows(prev => ({ ...prev, [rowKey]: !isExpanded }));
                return;
            }
            
            // Se está colapsando, apenas fecha sem fazer requisição
            if (isExpanded) {
                setExpandedRows(prev => ({ ...prev, [rowKey]: false }));
                return;
            }
            
            // Verifica rate limit cooldown (reduzido para 20 segundos)
            if (rateLimitCooldown) {
                const timeSinceLastLimit = Date.now() - (lastRateLimitTime || 0);
                const cooldownTime = 20000; // 20 segundos (reduzido de 30)
                if (timeSinceLastLimit < cooldownTime) {
                    const remainingSeconds = Math.ceil((cooldownTime - timeSinceLastLimit) / 1000);
                    toast({
                        title: 'Aguarde antes de tentar novamente',
                        description: `Rate limit ativo. Aguarde ${remainingSeconds} segundos antes de expandir novamente.`,
                        variant: 'destructive',
                        duration: 5000,
                    });
                    return;
                } else {
                    // Cooldown expirado, reseta
                    setRateLimitCooldown(false);
                    setLastRateLimitTime(null);
                }
            }
            
            // Expande a linha antes de carregar (feedback visual imediato)
            setExpandedRows(prev => ({ ...prev, [rowKey]: true }));

            // Carrega dados apenas se estiver expandindo
            let childrenData = [];
            let action = '';
            let body = {};
            let dataKey = '';

            if (type === 'campaign') {
                action = 'get-adsets';
                body = { action, campaignId: id };
                dataKey = 'adsets';
            } else if (type === 'adset') {
                action = 'get-ads';
                body = { action, adsetId: id };
                dataKey = 'ads';
            }
            
            if (action && dataKey) {
                let data = null;
                try {
                    // Aguarda mais tempo antes de fazer a requisição para evitar rate limit (aumentado para 1.5s)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        data = await fetchData(action.replace('-', ' '), body);
                        
                        // Mostra todos os ad sets/ads, mesmo sem insights válidos
                        childrenData = data?.[dataKey] || [];
                        
                        console.log(`📊 ${dataKey} recebidos:`, childrenData.length);
                        console.log(`📊 Dados completos:`, data?.[dataKey]);
                        
                        // Filtra apenas se houver muitos itens (para performance)
                        // Mas mostra todos, mesmo sem insights
                    if (childrenData.length > 0) {
                            // Log para debug
                            childrenData.forEach((item, idx) => {
                                const hasInsights = item.insights && 
                                                   item.insights.data && 
                                                   Array.isArray(item.insights.data) && 
                                                   item.insights.data.length > 0;
                                if (!hasInsights) {
                                    console.log(`⚠️ ${dataKey}[${idx}] (${item.name || item.id}) sem insights válidos`);
                                }
                            });
                        }
                    } catch (err) {
                        // Se for rate limit, ativa cooldown e fecha a expansão
                        const isRateLimit = err.message?.includes('limit') || 
                                          err.message?.includes('rate') || 
                                          err.message?.includes('User request limit');
                        
                        if (isRateLimit) {
                            // Fecha a expansão e ativa cooldown
                            setExpandedRows(prev => ({ ...prev, [rowKey]: false }));
                            setRateLimitCooldown(true);
                            setLastRateLimitTime(Date.now());
                            
                            // Mostra toast informativo
                            toast({
                                title: 'Rate limit atingido',
                                description: 'Aguarde alguns segundos antes de tentar expandir novamente. Os dados podem já estar carregados - tente novamente em breve.',
                                variant: 'destructive',
                                duration: 6000,
                            });
                            console.warn('⚠️ Rate limit detectado ao expandir. Aguarde alguns segundos.');
                        } else {
                            console.error(`Erro ao buscar ${action}:`, err);
                            // Não mostra toast para erros não relacionados a rate limit se já tem dados
                            if (!hasLoadedData) {
                                toast({
                                    title: `Erro ao buscar ${action.replace('-', ' ')}`,
                                    description: err.message || 'Erro desconhecido',
                                    variant: 'destructive',
                                    duration: 5000,
                                });
                            }
                        }
                        childrenData = [];
                    }
                
                    if (childrenData.length > 0 && dataKey) {
                        console.log(`✅ Adicionando ${childrenData.length} ${dataKey} à ${type} ${id}`);
                        const children = childrenData.reduce((acc, item) => {
                            // Garante que o tipo está correto
                            const itemType = dataKey === 'adsets' ? 'adset' : dataKey === 'ads' ? 'ad' : item.type || 'adset';
                            return {
                                ...acc, 
                                [item.id]: {
                                    ...item, 
                                    type: itemType,
                                    children: {}
                                }
                            };
                        }, {});
                        setCampaigns(prev => {
                            const newCampaigns = JSON.parse(JSON.stringify(prev));
                            if (type === 'campaign') {
                                if (newCampaigns[id]) {
                                    newCampaigns[id].children = children;
                                    console.log(`✅ Children adicionados à campanha ${id}:`, Object.keys(children).length);
                                    
                                    // Popula adSetOptions quando ad sets são carregados
                                    if (dataKey === 'adsets') {
                                        const adSetsList = Object.values(children).map(item => ({
                                            id: item.id,
                                            name: item.name,
                                            campaign_id: id
                                        }));
                                        setAdSetOptions(prev => {
                                            // Remove ad sets antigos da mesma campanha e adiciona os novos
                                            const filtered = prev.filter(adset => adset.campaign_id !== id);
                                            return [...filtered, ...adSetsList];
                                        });
                                        console.log(`✅ AdSetOptions atualizado com ${adSetsList.length} ad sets da campanha ${id}`);
                                    }
                                } else {
                                    console.warn(`⚠️ Campanha ${id} não encontrada no estado`);
                                }
                            } else if (type === 'adset' && parentId) {
                                // parentId é o campaignId quando type é 'adset'
                                const campaignId = parentId;
                                if (newCampaigns[campaignId] && newCampaigns[campaignId].children[id]) {
                                    newCampaigns[campaignId].children[id].children = children;
                                    console.log(`✅ Children adicionados ao adset ${id} da campanha ${campaignId}:`, Object.keys(children).length);
                                    
                                    // Popula adOptions quando ads são carregados
                                    if (dataKey === 'ads') {
                                        const adsList = Object.values(children).map(item => ({
                                            id: item.id,
                                            name: item.name,
                                            adset_id: id
                                        }));
                                        setAdOptions(prev => {
                                            // Remove ads antigos do mesmo adset e adiciona os novos
                                            const filtered = prev.filter(ad => ad.adset_id !== id);
                                            return [...filtered, ...adsList];
                                        });
                                        console.log(`✅ AdOptions atualizado com ${adsList.length} ads do adset ${id}`);
                                    }
                                } else {
                                    console.warn(`⚠️ Adset ${id} não encontrado na campanha ${campaignId}`);
                                }
                            }
                            return newCampaigns;
                        });
                    } else if (dataKey) {
                        // Só mostra mensagem se realmente não há dados e não foi erro de rate limit
                        if (data && data[dataKey] && data[dataKey].length === 0) {
                            toast({
                                title: `Nenhum ${dataKey === 'adsets' ? 'conjunto de anúncios' : 'anúncio'} encontrado`,
                                description: `Esta ${type === 'campaign' ? 'campanha' : 'conjunto'} não possui ${dataKey === 'adsets' ? 'conjuntos de anúncios' : 'anúncios'}.`,
                                variant: 'default',
                                duration: 3000,
                            });
                        }
                    }
                }
        };
        
        const filteredData = useMemo(() => {
            let filtered = Object.values(campaigns);

            if (selectedStatusFilter !== 'all') {
                filtered = filtered.filter(c => c.status === selectedStatusFilter);
            }
            if (selectedCampaignFilter !== 'all') {
                filtered = filtered.filter(c => c.id === selectedCampaignFilter);
            }
            if (selectedAdSetFilter !== 'all') {
                filtered = filtered.map(c => {
                    const filteredChildren = Object.values(c.children).filter(adset => adset.id === selectedAdSetFilter);
                    return { ...c, children: filteredChildren.reduce((acc, adset) => ({ ...acc, [adset.id]: adset }), {}) };
                }).filter(c => Object.keys(c.children).length > 0);
            }
            if (selectedAdFilter !== 'all') {
                 filtered = filtered.map(c => {
                    const newChildren = Object.fromEntries(
                        Object.entries(c.children).map(([adsetId, adset]) => {
                            const filteredAds = Object.values(adset.children).filter(ad => ad.id === selectedAdFilter);
                            const newAdset = { ...adset, children: filteredAds.reduce((acc, ad) => ({...acc, [ad.id]: ad}), {})};
                            return [adsetId, newAdset];
                        }).filter(([, adset]) => Object.keys(adset.children).length > 0)
                    );
                    return { ...c, children: newChildren };
                }).filter(c => Object.keys(c.children).length > 0);
            }

            return filtered.reduce((acc, c) => ({...acc, [c.id]: c}), {});
        }, [campaigns, selectedCampaignFilter, selectedAdSetFilter, selectedAdFilter, selectedStatusFilter]);

        const renderRows = (data, level = 0, parentId = null, campaignId = null) => {
            if (!data || Object.keys(data).length === 0) {
                return null;
            }
            
            return Object.values(data).flatMap(item => {
                const rowKey = `${item.type || 'campaign'}-${item.id}`;
                const isExpanded = !!expandedRows[rowKey];
                const hasChildren = item.children && Object.keys(item.children).length > 0;
                
                // Determina o campaignId correto baseado no nível
                let currentCampaignId = campaignId;
                if (level === 0) {
                    // É uma campanha
                    currentCampaignId = item.id;
                } else if (level === 1) {
                    // É um adset, mantém o campaignId do parent
                    currentCampaignId = campaignId || parentId;
                } else {
                    // É um ad, mantém o campaignId
                    currentCampaignId = campaignId;
                }
                
                if (level > 0) {
                    console.log(`🔍 Renderizando ${item.type || 'campaign'} ${item.id} (level ${level}):`, {
                        hasChildren,
                        childrenCount: hasChildren ? Object.keys(item.children).length : 0,
                        isExpanded,
                        parentId,
                        campaignId: currentCampaignId
                    });
                }
                
                return (
                    <Fragment key={item.id}>
                        <DataRow
                            level={level}
                            data={item}
                            onToggle={item.type !== 'ad' ? () => handleToggle(item.type || 'campaign', currentCampaignId, item.id) : null}
                            isExpanded={isExpanded}
                            type={item.type || 'campaign'}
                            selectedMetrics={selectedMetrics}
                        />
                        {isExpanded && hasChildren && renderRows(item.children, level + 1, item.id, currentCampaignId)}
                    </Fragment>
                )
            });
        };

        const handleMetricChange = (metricId) => {
            setSelectedMetrics(prev => 
                prev.includes(metricId) 
                    ? prev.filter(id => id !== metricId)
                    : [...prev, metricId]
            );
        };

        const StatCard = ({ title, value, icon, formatFn }) => (
            <Card className="dark:bg-gray-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium dark:text-gray-300">{title}</CardTitle>
                    {icon}
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold dark:text-white">{formatFn ? formatFn(value) : value}</div>
                </CardContent>
            </Card>
        );
        
        return (
            <div className="space-y-6">
                 <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Filtro por Cliente */}
                        <Select 
                            onValueChange={setSelectedClient} 
                            value={selectedClient || 'all'} 
                            disabled={loadingClients}
                        >
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder={loadingClients ? "Carregando..." : "Filtrar por Cliente"} />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all" className="dark:hover:bg-gray-600">
                                    Todos os Clientes
                                </SelectItem>
                                {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id} className="dark:hover:bg-gray-600">
                                        {client.empresa}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                         <Select onValueChange={setSelectedAccount} value={selectedAccount || ''} disabled={loadingAccounts || (selectedClient !== 'all' && linkedAccounts.length === 0)}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue 
                                    placeholder={
                                        loadingAccounts 
                                            ? "Carregando..." 
                                            : selectedClient !== 'all' && linkedAccounts.length === 0
                                            ? "Nenhuma conta vinculada"
                                            : "Selecione uma conta"
                                    } 
                                />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                {adAccounts.map(account => (
                                    <SelectItem key={account.id} value={account.id} className="dark:hover:bg-gray-600">{account.name} ({account.id})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id="date"
                                variant={"outline"}
                                className="w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600"
                              >
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
                                  <span>Escolha um período</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={date?.from}
                                selected={date}
                                onSelect={setDate}
                                numberOfMonths={2}
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                    Métricas da Tabela
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 h-96 overflow-y-auto dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                               {Object.entries(METRICS_OPTIONS).map(([group, metrics]) => (
                                   <div key={group} className="p-2">
                                       <h4 className="font-medium leading-none mb-2">{group}</h4>
                                        {metrics.map((metric) => (
                                            <div key={metric.id} className="flex items-center space-x-2 my-1">
                                                <Checkbox
                                                    id={metric.id}
                                                    checked={selectedMetrics.includes(metric.id)}
                                                    onCheckedChange={() => handleMetricChange(metric.id)}
                                                    className="dark:border-gray-500 data-[state=checked]:dark:bg-blue-500"
                                                />
                                                <label htmlFor={metric.id} className="text-sm leading-none">{metric.label}</label>
                                            </div>
                                        ))}
                                   </div>
                               ))}
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Select value={selectedCampaignFilter} onValueChange={(value) => { 
                            setSelectedCampaignFilter(value); 
                            // Não busca ad sets automaticamente para evitar rate limiting
                            // Os ad sets serão buscados apenas quando o usuário expandir a campanha na tabela
                            setAdSetOptions([]);
                            setSelectedAdSetFilter('all');
                        }} disabled={!selectedAccount}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Campanha" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todas as Campanhas</SelectItem>
                                {Object.values(campaigns).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={selectedAdSetFilter} onValueChange={(value) => { 
                            setSelectedAdSetFilter(value); 
                            // Não busca ads automaticamente para evitar rate limiting
                            // Os ads serão buscados apenas quando o usuário expandir o ad set na tabela
                            setAdOptions([]);
                            setSelectedAdFilter('all');
                        }} disabled={selectedCampaignFilter === 'all'}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Conj. de Anúncios" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Conjuntos</SelectItem>
                                {(() => {
                                    // Usa adSetOptions se disponível, senão busca dos campaigns carregados
                                    let availableAdSets = adSetOptions;
                                    if (availableAdSets.length === 0 && selectedCampaignFilter !== 'all') {
                                        const selectedCampaign = campaigns[selectedCampaignFilter];
                                        if (selectedCampaign?.children) {
                                            availableAdSets = Object.values(selectedCampaign.children).map(adset => ({
                                                id: adset.id,
                                                name: adset.name,
                                                campaign_id: selectedCampaignFilter
                                            }));
                                        }
                                    }
                                    return availableAdSets.map(adset => (
                                        <SelectItem key={adset.id} value={adset.id}>{adset.name}</SelectItem>
                                    ));
                                })()}
                            </SelectContent>
                        </Select>
                        
                        <Select value={selectedAdFilter} onValueChange={setSelectedAdFilter} disabled={selectedAdSetFilter === 'all'}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Anúncio" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Anúncios</SelectItem>
                                {(() => {
                                    // Usa adOptions se disponível, senão busca dos campaigns carregados
                                    let availableAds = adOptions;
                                    if (availableAds.length === 0 && selectedCampaignFilter !== 'all' && selectedAdSetFilter !== 'all') {
                                        const selectedCampaign = campaigns[selectedCampaignFilter];
                                        const selectedAdSet = selectedCampaign?.children?.[selectedAdSetFilter];
                                        if (selectedAdSet?.children) {
                                            availableAds = Object.values(selectedAdSet.children).map(ad => ({
                                                id: ad.id,
                                                name: ad.name,
                                                adset_id: selectedAdSetFilter
                                            }));
                                        }
                                    }
                                    return availableAds.map(ad => (
                                        <SelectItem key={ad.id} value={ad.id}>{ad.name}</SelectItem>
                                    ));
                                })()}
                            </SelectContent>
                        </Select>

                        <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter} disabled={!selectedAccount}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Status" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Status</SelectItem>
                                <SelectItem value="ACTIVE">Ativo</SelectItem>
                                <SelectItem value="PAUSED">Pausado</SelectItem>
                                <SelectItem value="ARCHIVED">Arquivado</SelectItem>
                                <SelectItem value="IN_PROCESS">Em processo</SelectItem>
                                <SelectItem value="WITH_ISSUES">Com problemas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <AnimatePresence>
                {selectedAccount && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                            <StatCard title="Investimento" value={headerInsights?.spend} icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} formatFn={formatCurrency} />
                            <StatCard title="Resultados" value={headerInsights?.results} icon={<Target className="h-4 w-4 text-muted-foreground" />} formatFn={formatNumber} />
                            <StatCard title="Valor de Compra" value={getFormattedValue(headerInsights, 'action_values:omni_purchase')} icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />} />
                            <StatCard title="ROAS" value={getFormattedValue(headerInsights, 'website_purchase_roas')} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
                        </div>

                        {loadingProgress !== null ? (
                            <Card className="dark:bg-gray-800">
                                <CardContent className="pt-6">
                                    <div className="text-center py-10">
                                        <p className="text-lg font-medium dark:text-gray-300 mb-2">
                                            {loadingProgress.message || 'Carregando dados...'}
                                        </p>
                                        <div className="w-full max-w-md mx-auto bg-gray-700 rounded-full h-2.5 mt-4">
                                            <div 
                                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                                style={{ 
                                                    width: `${(loadingProgress.current / loadingProgress.total) * 100}%` 
                                                }}
                                            />
                                        </div>
                                        <p className="text-sm text-gray-400 mt-2">
                                            {loadingProgress.current} de {loadingProgress.total} campanhas processadas
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : loading && Object.keys(campaigns).length === 0 ? (
                            <Card className="dark:bg-gray-800">
                                <CardContent className="pt-6">
                            <p className="text-center py-10 dark:text-gray-300">Carregando dados...</p>
                                </CardContent>
                            </Card>
                        ) : Object.keys(campaigns).length === 0 ? (
                            <Card className="dark:bg-gray-800">
                                <CardContent className="pt-6">
                                    <p className="text-center py-10 dark:text-gray-300">Nenhuma campanha encontrada</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="dark:bg-gray-800">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                    <CardTitle className="dark:text-white">Detalhes das Campanhas</CardTitle>
                                        {!loadAllCampaigns && Object.keys(campaigns).length > 0 && totalCampaignsAvailable && totalCampaignsAvailable > Object.keys(campaigns).length && (
                                            <Button
                                                onClick={handleLoadAllCampaigns}
                                                variant="outline"
                                                size="sm"
                                                className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
                                                disabled={loadingProgress !== null}
                                            >
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                Carregar Todas as Campanhas ({totalCampaignsAvailable} total)
                                            </Button>
                                        )}
                                        {loadAllCampaigns && (
                                            <Badge variant="secondary" className="dark:bg-gray-700 dark:text-gray-300">
                                                Mostrando todas as campanhas
                                            </Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="dark:border-gray-700">
                                                <TableHead className="dark:text-white w-[30%]">Nome</TableHead>
                                                <TableHead className="dark:text-white">Tipo</TableHead>
                                                <TableHead className="dark:text-white">Status</TableHead>
                                                <TableHead className="dark:text-white">Data de Início</TableHead>
                                                {selectedMetrics.map(metricId => (
                                                    <TableHead key={metricId} className="text-right dark:text-white">
                                                        {ALL_METRICS_FLAT.find(m => m.id === metricId)?.label || metricId}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.keys(filteredData).length > 0 ? renderRows(filteredData) : (
                                                <TableRow>
                                                    <TableCell colSpan={selectedMetrics.length + 4} className="h-24 text-center dark:text-gray-400">
                                                        Nenhum dado encontrado para os filtros selecionados.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
        );
    };

    export default MetaInsights;