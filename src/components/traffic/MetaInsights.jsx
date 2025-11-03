import React, { useState, useEffect, useCallback, Fragment, useMemo } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { Badge } from '@/components/ui/badge';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Calendar as CalendarIcon, DollarSign, ChevronDown, ChevronRight, ShoppingCart, Target, TrendingUp } from 'lucide-react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
    import { Calendar } from "@/components/ui/calendar";
    import { format, isValid, parseISO } from "date-fns";
    import { ptBR } from "date-fns/locale";

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

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value || 0);
    const formatDecimal = (value) => (value || 0).toFixed(2);
    const formatPercentage = (value) => `${(value || 0).toFixed(2)}%`;
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
                return formatNumber(value);
        }
    };

    const DataRow = ({ level, data, onToggle, isExpanded, type, selectedMetrics }) => {
        const insights = data.insights?.data[0];
        return (
            <TableRow className={`dark:border-gray-700 ${level > 0 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}>
                <TableCell style={{ paddingLeft: `${10 + level * 20}px` }}>
                    <div className="flex items-center gap-2">
                        {onToggle && (
                            <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6">
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
        const [selectedAccount, setSelectedAccount] = useState(null);
        const [campaigns, setCampaigns] = useState({});
        const [headerInsights, setHeaderInsights] = useState(null);
        const [loadingAccounts, setLoadingAccounts] = useState(true);
        const [loading, setLoading] = useState(false);
        const [selectedMetrics, setSelectedMetrics] = useState(['spend', 'results', 'actions:omni_purchase', 'action_values:omni_purchase']);
        const [expandedRows, setExpandedRows] = useState({});
        const [date, setDate] = useState({
          from: new Date(new Date().setDate(new Date().getDate() - 30)),
          to: new Date(),
        });
        const [selectedCampaignFilter, setSelectedCampaignFilter] = useState('all');
        const [selectedAdSetFilter, setSelectedAdSetFilter] = useState('all');
        const [selectedAdFilter, setSelectedAdFilter] = useState('all');
        const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
        
        const [adSetOptions, setAdSetOptions] = useState([]);
        const [adOptions, setAdOptions] = useState([]);

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
                
                const requestBody = { ...body, metrics: body.metrics || selectedMetrics, time_range };
                
                const { data, error } = await supabase.functions.invoke('meta-ads-api', { body: requestBody });

                if (error) throw error;
                if (data.error) throw new Error(data.error);
                return data;
            } catch (err) {
                toast({ title: `Erro ao buscar ${action}`, description: err.message, variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        }, [toast, selectedMetrics, date]);
        
        useEffect(() => {
            setLoadingAccounts(true);
            const fetchInitialAccounts = async () => {
                 try {
                    const { data, error } = await supabase.functions.invoke('meta-ads-api', { body: { action: 'get-ad-accounts' } });
                    if (error) throw error;
                    if (data.error) throw new Error(data.error);

                    if (data?.adAccounts) {
                        setAdAccounts(data.adAccounts);
                    }
                } catch (err) {
                    toast({ title: 'Erro ao buscar contas', description: err.message, variant: 'destructive' });
                } finally {
                    setLoadingAccounts(false);
                }
            };
            fetchInitialAccounts();
        }, [toast]); 

        const fetchAllDataForAccount = useCallback(async () => {
            if (!selectedAccount || !date?.from || !date?.to) return;
            
            setCampaigns({});
            setHeaderInsights(null);
            setExpandedRows({});
            setSelectedCampaignFilter('all');
            setSelectedAdSetFilter('all');
            setSelectedAdFilter('all');
            setAdSetOptions([]);
            setAdOptions([]);


            const campaignsData = await fetchData('campanhas', { action: 'get-campaigns', adAccountId: selectedAccount });
            if (campaignsData?.campaigns) {
                const activeCampaigns = campaignsData.campaigns.filter(c => c.insights && c.insights.data.length > 0);
                const campaignsObj = activeCampaigns.reduce((acc, c) => ({...acc, [c.id]: {...c, children: {}}}), {});
                setCampaigns(campaignsObj);
            }

            const headerMetrics = ['spend', 'results', 'actions', 'action_values', 'website_purchase_roas'];
            const accountInsightsData = await fetchData('insights gerais', { action: 'get-account-insights', adAccountId: selectedAccount, metrics: headerMetrics });
            if(accountInsightsData?.insights) {
                setHeaderInsights(accountInsightsData.insights);
            }
        }, [selectedAccount, date, fetchData]);
        
        useEffect(() => {
            fetchAllDataForAccount();
        }, [fetchAllDataForAccount]);

        const fetchAdSetsForCampaign = useCallback(async (campaignId) => {
            if (campaignId === 'all') {
                setAdSetOptions([]);
                setSelectedAdSetFilter('all');
                return;
            }
            const data = await fetchData('conjuntos de anúncios', { action: 'get-adsets', campaignId: campaignId });
            setAdSetOptions(data?.adsets.filter(c => c.insights && c.insights.data.length > 0) || []);
            setSelectedAdSetFilter('all');
        }, [fetchData]);

        const fetchAdsForAdSet = useCallback(async (adsetId) => {
            if (adsetId === 'all') {
                setAdOptions([]);
                setSelectedAdFilter('all');
                return;
            }
            const data = await fetchData('anúncios', { action: 'get-ads', adsetId: adsetId });
            setAdOptions(data?.ads.filter(c => c.insights && c.insights.data.length > 0) || []);
            setSelectedAdFilter('all');
        }, [fetchData]);

        const handleToggle = async (type, parentId, id) => {
            const rowKey = `${type}-${id}`;
            const isExpanded = !!expandedRows[rowKey];
            setExpandedRows(prev => ({ ...prev, [rowKey]: !isExpanded }));

            if (!isExpanded) {
                let childrenData = [];
                let action = '';
                let body = {};

                if (type === 'campaign') {
                    action = 'get-adsets';
                    body = { action, campaignId: id };
                } else if (type === 'adset') {
                    action = 'get-ads';
                    body = { action, adsetId: id };
                }
                
                if(action){
                    const data = await fetchData(action.replace('-', ' '), body);
                    const dataKey = action.split('-')[1];
                    childrenData = data?.[dataKey]?.filter(c => c.insights && c.insights.data.length > 0) || [];
                
                    if (childrenData.length > 0) {
                        const children = childrenData.reduce((acc, item) => ({...acc, [item.id]: {...item, children: {}}}), {});
                        setCampaigns(prev => {
                            const newCampaigns = JSON.parse(JSON.stringify(prev));
                            if (type === 'campaign') {
                                if (newCampaigns[id]) newCampaigns[id].children = children;
                            } else if (type === 'adset' && parentId && newCampaigns[parentId] && newCampaigns[parentId].children[id]) {
                                newCampaigns[parentId].children[id].children = children;
                            }
                            return newCampaigns;
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

        const renderRows = (data, level = 0, parentId = null) => {
            return Object.values(data).flatMap(item => {
                const rowKey = `${item.type || 'campaign'}-${item.id}`;
                const isExpanded = !!expandedRows[rowKey];
                return (
                    <Fragment key={item.id}>
                        <DataRow
                            level={level}
                            data={item}
                            onToggle={item.type !== 'ad' ? () => handleToggle(item.type || 'campaign', parentId, item.id) : null}
                            isExpanded={isExpanded}
                            type={item.type || 'campaign'}
                            selectedMetrics={selectedMetrics}
                        />
                        {isExpanded && item.children && renderRows(item.children, level + 1, item.id)}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                         <Select onValueChange={setSelectedAccount} value={selectedAccount || ''} disabled={loadingAccounts}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder={loadingAccounts ? "Carregando..." : "Selecione uma conta"} />
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
                        <Select value={selectedCampaignFilter} onValueChange={(value) => { setSelectedCampaignFilter(value); fetchAdSetsForCampaign(value); }} disabled={!selectedAccount}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Campanha" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todas as Campanhas</SelectItem>
                                {Object.values(campaigns).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={selectedAdSetFilter} onValueChange={(value) => { setSelectedAdSetFilter(value); fetchAdsForAdSet(value); }} disabled={selectedCampaignFilter === 'all' || adSetOptions.length === 0}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Conj. de Anúncios" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Conjuntos</SelectItem>
                                {adSetOptions.map(adset => <SelectItem key={adset.id} value={adset.id}>{adset.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        
                        <Select value={selectedAdFilter} onValueChange={setSelectedAdFilter} disabled={selectedAdSetFilter === 'all' || adOptions.length === 0}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                                <SelectValue placeholder="Filtrar por Anúncio" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:text-white">
                                <SelectItem value="all">Todos os Anúncios</SelectItem>
                                {adOptions.map(ad => <SelectItem key={ad.id} value={ad.id}>{ad.name}</SelectItem>)}
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

                        {loading && Object.keys(campaigns).length === 0 ? (
                            <p className="text-center py-10 dark:text-gray-300">Carregando dados...</p>
                        ) : (
                            <Card className="dark:bg-gray-800">
                                <CardHeader>
                                    <CardTitle className="dark:text-white">Detalhes das Campanhas</CardTitle>
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