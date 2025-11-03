import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { Helmet } from 'react-helmet';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Calendar as CalendarIcon, DollarSign, ShoppingCart, Target, TrendingUp, BarChart, MousePointerClick, Eye, Users, Settings2, Check, MessageSquare } from 'lucide-react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
    import { Calendar } from "@/components/ui/calendar";
    import { format, isValid } from "date-fns";
    import { ptBR } from "date-fns/locale";
    import { Checkbox } from "@/components/ui/checkbox";
    import { Label } from "@/components/ui/label";

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
    const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
    const formatDecimal = (value) => (Number(value) || 0).toFixed(2);

    const ALL_METRICS_CONFIG = [
        { id: 'spend', label: 'Investimento', format: formatCurrency, icon: <DollarSign className="h-4 w-4 text-muted-foreground" />, apiField: 'spend' },
        { id: 'valor_compras', label: 'Valor em Compras', format: formatCurrency, icon: <ShoppingCart className="h-4 w-4 text-muted-foreground" />, apiField: 'action_values:omni_purchase' },
        { id: 'results', label: 'Resultados', format: formatNumber, icon: <Target className="h-4 w-4 text-muted-foreground" />, apiField: 'results' },
        { id: 'add_to_cart', label: 'Adições ao carrinho', format: formatNumber, icon: <ShoppingCart className="h-4 w-4 text-muted-foreground" />, apiField: 'actions:omni_add_to_cart' },
        { id: 'mensagens_iniciadas', label: 'Mensagens Iniciadas', format: formatNumber, icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />, apiField: 'actions:onsite_messaging_conversation_started' },
        { id: 'custo_mensagens_iniciadas', label: 'Custo por Mensagem Iniciada', format: formatCurrency, icon: <DollarSign className="h-4 w-4 text-muted-foreground" />, apiField: 'cost_per_action_type:onsite_messaging_conversation_started' },
        { id: 'conversations', label: 'Conversas', format: formatNumber, icon: <Users className="h-4 w-4 text-muted-foreground" />, apiField: 'actions:onsite_messaging_conversation' },
        { id: 'roas', label: 'ROAS', format: (val) => `${formatDecimal(val)}x`, icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, apiField: 'website_purchase_roas' },
        { id: 'compras', label: 'Compras', format: formatNumber, icon: <ShoppingCart className="h-4 w-4 text-muted-foreground" />, apiField: 'actions:omni_purchase' },
        { id: 'cpa', label: 'CPA Médio (Compra)', format: formatCurrency, icon: <Target className="h-4 w-4 text-muted-foreground" />, apiField: 'cost_per_action_type:omni_purchase' },
        { id: 'ticket_medio', label: 'Ticket Médio', format: formatCurrency, icon: <DollarSign className="h-4 w-4 text-muted-foreground" />, isCalculated: true },
        { id: 'cost_per_conversation', label: 'Custo por Conversa', format: formatCurrency, icon: <Users className="h-4 w-4 text-muted-foreground" />, apiField: 'cost_per_action_type:onsite_messaging_conversation' },
        { id: 'leads', label: 'Leads', format: formatNumber, icon: <Users className="h-4 w-4 text-muted-foreground" />, apiField: 'actions:lead' },
        { id: 'cost_per_lead', label: 'Custo por Lead', format: formatCurrency, icon: <Users className="h-4 w-4 text-muted-foreground" />, apiField: 'cost_per_action_type:lead' },
        { id: 'impressions', label: 'Impressões', format: formatNumber, icon: <Eye className="h-4 w-4 text-muted-foreground" />, apiField: 'impressions' },
        { id: 'reach', label: 'Alcance', format: formatNumber, icon: <Users className="h-4 w-4 text-muted-foreground" />, apiField: 'reach' },
        { id: 'clicks_all', label: 'Cliques (Todos)', format: formatNumber, icon: <MousePointerClick className="h-4 w-4 text-muted-foreground" />, apiField: 'clicks' },
        { id: 'clicks_link', label: 'Total de cliques no link', format: formatNumber, icon: <MousePointerClick className="h-4 w-4 text-muted-foreground" />, apiField: 'inline_link_clicks' },
        { id: 'ctr_all', label: 'CTR (Todos)', format: (val) => `${formatDecimal(val)}%`, icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, apiField: 'ctr' },
        { id: 'ctr_link', label: 'CTR (Cliques no link)', format: (val) => `${formatDecimal(val)}%`, icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, apiField: 'inline_link_click_ctr' },
        { id: 'cpm', label: 'CPM Médio', format: formatCurrency, icon: <Eye className="h-4 w-4 text-muted-foreground" />, apiField: 'cpm' },
        { id: 'cpc_all', label: 'CPC Médio (Todos)', format: formatCurrency, icon: <MousePointerClick className="h-4 w-4 text-muted-foreground" />, apiField: 'cpc' },
        { id: 'cpc_link', label: 'CPC Médio (No link)', format: formatCurrency, icon: <MousePointerClick className="h-4 w-4 text-muted-foreground" />, apiField: 'inline_link_cpc' },
        { id: 'frequency', label: 'Frequência', format: formatDecimal, icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, apiField: 'frequency' },
    ];
    
    const DEFAULT_METRIC_IDS = ['spend', 'compras', 'valor_compras', 'roas', 'results'];

    const getFormattedValue = (insights, metricId, config) => {
        if (!insights) return 'N/A';
        const metricConfig = config.find(m => m.id === metricId);
        if (!metricConfig) return 'N/A';

        if (metricConfig.isCalculated) {
            if (metricId === 'ticket_medio') {
                const totalValue = (insights.action_values || []).find(a => a.action_type === 'omni_purchase')?.value || 0;
                const totalPurchases = (insights.actions || []).find(a => a.action_type === 'omni_purchase')?.value || 0;
                return totalPurchases > 0 ? totalValue / totalPurchases : 0;
            }
            return 'N/A';
        }
        
        const apiField = metricConfig.apiField;
        
        if (apiField.includes(':')) {
            const [base, type] = apiField.split(':');
            const action = (insights[base] || []).find(a => a.action_type === type);
            return action?.value || 0;
        }
        
        if (apiField === 'website_purchase_roas') {
           const roas = (insights.website_purchase_roas || []).find(r => r.action_type === 'omni_purchase');
           return roas ? roas.value : 0;
        }

        return insights[apiField] || 0;
    };

    const StatCard = ({ title, value, icon, formatFn }) => {
       const formattedValue = formatFn ? formatFn(value) : value;
       return (
        <Card className="dark:bg-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium dark:text-gray-300">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold dark:text-white">{value === 'N/A' ? 'N/A' : formattedValue}</div>
            </CardContent>
        </Card>
    )};

    const MetaAdsReporter = () => {
        const [adAccounts, setAdAccounts] = useState([]);
        const [campaigns, setCampaigns] = useState([]);
        const [adSets, setAdSets] = useState([]);

        const [selectedAccount, setSelectedAccount] = useState(null);
        const [selectedCampaign, setSelectedCampaign] = useState('all');
        const [selectedAdSet, setSelectedAdSet] = useState('all');
        
        const [insights, setInsights] = useState(null);
        const [loading, setLoading] = useState(false);
        const [date, setDate] = useState({
          from: new Date(new Date().setDate(new Date().getDate() - 30)),
          to: new Date(),
        });
        
        const [selectedMetrics, setSelectedMetrics] = useState(() => {
            const saved = localStorage.getItem('metaReporterMetrics');
            return saved ? JSON.parse(saved) : DEFAULT_METRIC_IDS;
        });

        const { toast } = useToast();
        
        const apiMetricsToFetch = useMemo(() => {
            const fields = new Set();
            selectedMetrics.forEach(metricId => {
                const config = ALL_METRICS_CONFIG.find(m => m.id === metricId);
                if (config && config.apiField) {
                    fields.add(config.apiField);
                } else if (metricId === 'ticket_medio') {
                    fields.add('action_values:omni_purchase');
                    fields.add('actions:omni_purchase');
                }
            });
            return Array.from(fields);
        }, [selectedMetrics]);
        
        const fetchData = useCallback(async (action, body, showToast = true) => {
            setLoading(true);
            try {
                if (!date?.from || !isValid(date.from) || !date?.to || !isValid(date.to)) {
                  throw new Error("Período inválido");
                }
                const time_range = {
                    since: format(date.from, 'yyyy-MM-dd'),
                    until: format(date.to, 'yyyy-MM-dd'),
                };
                
                const requestBody = { ...body, time_range, metrics: apiMetricsToFetch };
                
                const { data, error } = await supabase.functions.invoke('meta-ads-api', { body: requestBody });

                if (error) throw error;
                if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
                return data;
            } catch (err) {
                if (showToast) {
                    toast({ title: `Erro ao buscar ${action}`, description: err.message, variant: 'destructive' });
                }
                return null;
            } finally {
                setLoading(false);
            }
        }, [toast, date, apiMetricsToFetch]);

        useEffect(() => {
            const fetchInitialAccounts = async () => {
                const data = await fetchData('contas de anúncio', { action: 'get-ad-accounts' }, false);
                if (data?.adAccounts) {
                    setAdAccounts(data.adAccounts);
                }
            };
            fetchInitialAccounts();
        }, []); 

        useEffect(() => {
            const fetchCampaignsForAccount = async () => {
                if(selectedAccount) {
                    const data = await fetchData('campanhas', { action: 'get-campaigns', adAccountId: selectedAccount });
                    if(data?.campaigns) {
                        setCampaigns(data.campaigns);
                    }
                }
            };
            fetchCampaignsForAccount();
        }, [selectedAccount, fetchData]);

        useEffect(() => {
            const fetchAdSetsForCampaign = async () => {
                if (selectedCampaign && selectedCampaign !== 'all') {
                    const data = await fetchData('conjuntos de anúncio', { action: 'get-adsets', campaignId: selectedCampaign });
                     if(data?.adsets) {
                        setAdSets(data.adsets);
                    }
                }
            };
            fetchAdSetsForCampaign();
        }, [selectedCampaign, fetchData]);
        
        useEffect(() => {
            const fetchInsightsData = async () => {
                if (!selectedAccount) {
                    setInsights(null);
                    return;
                }

                let action = 'get-account-insights';
                let body = { adAccountId: selectedAccount };
                
                if (selectedAdSet && selectedAdSet !== 'all') {
                    action = 'get-adset-insights';
                    body = { adsetId: selectedAdSet };
                } else if (selectedCampaign && selectedCampaign !== 'all') {
                    action = 'get-campaign-insights';
                    body = { campaignId: selectedCampaign };
                }
                
                const data = await fetchData('insights', { action, ...body });
                
                if (data?.insights && Object.keys(data.insights).length > 0) {
                    setInsights(data.insights);
                } else {
                    setInsights(null);
                    if (selectedAccount) {
                        toast({ title: "Nenhum dado encontrado", description: "Não foram encontrados insights para a seleção e período informados."});
                    }
                }
            };

            fetchInsightsData();
        }, [selectedAccount, selectedCampaign, selectedAdSet, date, fetchData, toast]);

        const handleAccountChange = (accountId) => {
            setSelectedAccount(accountId);
            setSelectedCampaign('all');
            setSelectedAdSet('all');
            setCampaigns([]);
            setAdSets([]);
            setInsights(null);
        };

        const handleCampaignChange = (campaignId) => {
            setSelectedCampaign(campaignId);
            setSelectedAdSet('all');
            setAdSets([]);
        };

        const handleSaveMetrics = (newMetrics) => {
            setSelectedMetrics(newMetrics);
            localStorage.setItem('metaReporterMetrics', JSON.stringify(newMetrics));
        };
        
        const displayedMetrics = ALL_METRICS_CONFIG.filter(m => selectedMetrics.includes(m.id));

        return (
            <>
            <Helmet>
                <title>Relatório Rápido de Meta Ads - JB APEX</title>
                <meta name="description" content="Analise o desempenho dos seus conjuntos de anúncios do Meta Ads." />
            </Helmet>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      <BarChart className="h-8 w-8 text-blue-500" />
                      <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Relatório Rápido de Meta Ads</h1>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                       <Button variant="outline">
                          <Settings2 className="mr-2 h-4 w-4" />
                          Personalizar Métricas
                       </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl dark:bg-gray-800">
                      <DialogHeader>
                          <DialogTitle className="dark:text-white">Selecione as Métricas</DialogTitle>
                      </DialogHeader>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4 max-h-[60vh] overflow-y-auto">
                           {ALL_METRICS_CONFIG.map((metric) => (
                               <div key={metric.id} className="flex items-center space-x-2">
                                   <Checkbox 
                                     id={metric.id}
                                     checked={selectedMetrics.includes(metric.id)}
                                     onCheckedChange={(checked) => {
                                         const newMetrics = checked
                                           ? [...selectedMetrics, metric.id]
                                           : selectedMetrics.filter((id) => id !== metric.id);
                                         handleSaveMetrics(newMetrics);
                                     }}
                                   />
                                   <Label htmlFor={metric.id} className="dark:text-gray-300">{metric.label}</Label>
                               </div>
                           ))}
                       </div>
                    </DialogContent>
                  </Dialog>
                </div>

                 <div className="space-y-4 p-4 border rounded-lg dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Select onValueChange={handleAccountChange} value={selectedAccount || ''} disabled={loading}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder={loading ? "Carregando..." : "Selecione a Conta"} />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                {adAccounts.map(account => (
                                    <SelectItem key={account.id} value={account.id} className="dark:hover:bg-gray-600">{account.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                              <Button id="date" variant={"outline"} className="w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600" >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date?.from ? ( date.to ? `${format(date.from, "dd/MM/yy", { locale: ptBR })} - ${format(date.to, "dd/MM/yy", { locale: ptBR })}` : format(date.from, "dd/MM/yy", { locale: ptBR })) : (<span>Escolha o período</span>) }
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} locale={ptBR} />
                            </PopoverContent>
                          </Popover>
                        <Select onValueChange={handleCampaignChange} value={selectedCampaign || 'all'} disabled={!selectedAccount || loading}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Campanha" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todas as Campanhas</SelectItem>
                                {campaigns.map(campaign => (
                                    <SelectItem key={campaign.id} value={campaign.id} className="dark:hover:bg-gray-600">{campaign.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select onValueChange={setSelectedAdSet} value={selectedAdSet || 'all'} disabled={!selectedCampaign || selectedCampaign === 'all' || loading}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Conjunto" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Conjuntos</SelectItem>
                                {adSets.map(adSet => (
                                    <SelectItem key={adSet.id} value={adSet.id} className="dark:hover:bg-gray-600">{adSet.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <AnimatePresence>
                {insights && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }}>
                         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {displayedMetrics.map(metric => (
                               <StatCard
                                  key={metric.id}
                                  title={metric.label}
                                  value={getFormattedValue(insights, metric.id, ALL_METRICS_CONFIG)}
                                  icon={metric.icon}
                                  formatFn={metric.format}
                               />
                            ))}
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>
                {!insights && !loading && selectedMetrics.length > 0 && (
                    <div className="text-center py-10 dark:text-gray-400">
                        <p>Selecione uma conta e um período para ver os resultados.</p>
                    </div>
                )}
                {!insights && !loading && selectedMetrics.length === 0 && (
                     <div className="text-center py-10 dark:text-gray-400">
                        <p>Nenhuma métrica selecionada. Clique em "Personalizar Métricas" para escolher o que exibir.</p>
                    </div>
                )}
                 {loading && (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <p className="ml-3 dark:text-gray-400">Buscando dados...</p>
                    </div>
                )}
            </div>
            </>
        );
    };

    export default MetaAdsReporter;