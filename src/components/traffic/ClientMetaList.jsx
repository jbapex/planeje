import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ClientMetaDetailView from './ClientMetaDetailView';
import { RefreshCw, Loader2, Filter, Calendar as CalendarIcon, Edit2, Check, X, MessageSquare, Plus, Send, Eye } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { format, isValid, startOfMonth, endOfMonth, subMonths, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Constantes para cache
const CACHE_PREFIX = 'meta_ads_cache_';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 horas em milissegundos

// Funções auxiliares para gerenciar cache
const getCacheKey = (accountId, dateFrom, dateTo) => {
  const fromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '';
  const toStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : '';
  return `${CACHE_PREFIX}${accountId}_${fromStr}_${toStr}`;
};

const getCachedData = (cacheKey) => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const now = Date.now();
    const cacheAge = now - parsed.timestamp;
    
    // Verifica se o cache ainda é válido (menos de 4 horas)
    if (cacheAge < CACHE_DURATION_MS) {
      console.log(`✅ Cache válido encontrado para ${cacheKey} (${Math.round(cacheAge / 1000 / 60)}min atrás)`);
      // Converte lastUpdate de string para Date se necessário
      if (parsed.data && parsed.data.lastUpdate) {
        parsed.data.lastUpdate = parsed.data.lastUpdate instanceof Date 
          ? parsed.data.lastUpdate 
          : new Date(parsed.data.lastUpdate);
      }
      return parsed.data;
    } else {
      console.log(`⏰ Cache expirado para ${cacheKey} (${Math.round(cacheAge / 1000 / 60)}min atrás)`);
      localStorage.removeItem(cacheKey);
      return null;
    }
  } catch (err) {
    console.error('Erro ao ler cache:', err);
    return null;
  }
};

const setCachedData = (cacheKey, data) => {
  try {
    const cacheEntry = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    console.log(`💾 Dados salvos no cache: ${cacheKey}`);
  } catch (err) {
    console.error('Erro ao salvar cache:', err);
    // Se o localStorage estiver cheio, tenta limpar caches antigos
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      if (keys.length > 50) {
        // Remove os 10 mais antigos
        const sortedKeys = keys.map(key => ({
          key,
          timestamp: JSON.parse(localStorage.getItem(key))?.timestamp || 0
        })).sort((a, b) => a.timestamp - b.timestamp).slice(0, 10);
        sortedKeys.forEach(({ key }) => localStorage.removeItem(key));
        console.log('🧹 Limpeza de cache antigo realizada');
      }
    } catch (cleanErr) {
      console.error('Erro ao limpar cache:', cleanErr);
    }
  }
};

const ClientMetaList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientData, setClientData] = useState({}); // { clientId: { metrics, loading, error } }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'paused', 'no-data' - padrão: todos (mas apenas com contas vinculadas)
  const [linkedAccountsMap, setLinkedAccountsMap] = useState({}); // { clientId: [accounts] }
  const hasLoadedRef = useRef(false); // Flag para evitar carregamento múltiplo
  const [date, setDate] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [editingLimit, setEditingLimit] = useState(null); // { clientId: value }
  const [limitValue, setLimitValue] = useState(''); // Valor temporário durante edição
  const [observationsDialog, setObservationsDialog] = useState(null); // { clientId, clientName }
  const [observations, setObservations] = useState({}); // { clientId: [observations] }
  const [newObservation, setNewObservation] = useState('');
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [detailViewClient, setDetailViewClient] = useState(null);
  const autoRefreshIntervalRef = useRef(null); // Referência para intervalo de atualização automática
  const lastDateRangeRef = useRef(null); // Referência para o último período carregado

  // Busca observações de um cliente
  const fetchObservations = useCallback(async (clientId) => {
    if (!clientId) return;
    
    setLoadingObservations(true);
    try {
      const { data, error } = await supabase
        .from('cliente_meta_observations')
        .select('*, profiles(full_name, avatar_url)')
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setObservations(prev => ({
        ...prev,
        [clientId]: data || []
      }));
    } catch (err) {
      console.error('Erro ao buscar observações:', err);
      toast({
        title: 'Erro ao buscar observações',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingObservations(false);
    }
  }, [toast]);

  // Adiciona uma nova observação
  const addObservation = useCallback(async (clientId) => {
    if (!newObservation.trim() || !user?.id) {
      toast({
        title: 'Erro',
        description: 'A observação não pode estar vazia e você precisa estar logado.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('cliente_meta_observations')
        .insert({
          cliente_id: clientId,
          user_id: user.id,
          observation: newObservation.trim()
        });

      if (error) throw error;

      toast({
        title: 'Observação adicionada',
        description: 'A observação foi salva com sucesso.',
        variant: 'default',
      });

      setNewObservation('');
      await fetchObservations(clientId);
    } catch (err) {
      console.error('Erro ao adicionar observação:', err);
      toast({
        title: 'Erro ao adicionar observação',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [newObservation, user, toast, fetchObservations]);

  // Abre o dialog de observações
  const openObservationsDialog = useCallback((client) => {
    setObservationsDialog({ clientId: client.id, clientName: client.empresa });
    fetchObservations(client.id);
  }, [fetchObservations]);

  // Busca todos os clientes
  const fetchClients = useCallback(async () => {
    try {
      // Tenta buscar com limite_meta primeiro, se falhar usa apenas valor (fallback para antes da migration)
      let query = supabase
        .from('clientes')
        .select('id, empresa, valor, limite_meta, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo')
        .order('empresa', { ascending: true });
      
      let { data, error } = await query;
      
      // Se erro for porque limite_meta não existe, busca sem esse campo e adiciona null
      if (error && error.message?.includes('limite_meta')) {
        console.warn('⚠️ Coluna limite_meta não existe. Execute a migration EXECUTAR_MIGRATION_LIMITE_META.sql');
        const { data: fallbackData, error: fallbackError } = await supabase
        .from('clientes')
        .select('id, empresa, valor, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo')
        .order('empresa', { ascending: true });
        
        if (fallbackError) throw fallbackError;
        
        // Adiciona limite_meta como null para todos os clientes
        data = (fallbackData || []).map(client => ({ ...client, limite_meta: null }));
        error = null;
      }

      if (error) throw error;
      // Debug: ver objetivos vindos do banco
      console.log('🧾 Clientes (objetivo_meta):', (data || []).map(c => ({
        empresa: c.empresa,
        objetivo_meta: c.objetivo_meta,
      })));
      setClients(data || []);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
      toast({
        title: 'Erro ao buscar clientes',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Atualiza limite de gasto no Meta do cliente (limite_meta, não valor)
  const updateClientLimit = useCallback(async (clientId, newLimit) => {
    try {
      const limitNumber = parseFloat(newLimit.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      
      const { error } = await supabase
        .from('clientes')
        .update({ limite_meta: limitNumber })
        .eq('id', clientId);

      // Se erro for porque limite_meta não existe, mostra aviso para executar migration
      const errorMessage = error?.message || JSON.stringify(error || '');
      if (error && (
        errorMessage.includes('limite_meta') || 
        errorMessage.includes('Could not find') ||
        errorMessage.includes('does not exist') ||
        error?.code === 'PGRST204'
      )) {
        toast({
          title: '⚠️ Migration necessária',
          description: 'A coluna limite_meta ainda não existe. Execute a migration EXECUTAR_MIGRATION_LIMITE_META.sql no Supabase SQL Editor para habilitar esta funcionalidade.',
          variant: 'destructive',
        });
        setEditingLimit(null);
        setLimitValue('');
        return; // Não lança erro, apenas cancela a edição
      }

      if (error) throw error;

      // Atualiza localmente
      setClients(prev => prev.map(client => 
        client.id === clientId ? { ...client, limite_meta: limitNumber } : client
      ));

      toast({
        title: 'Limite atualizado',
        description: 'O limite do cliente foi atualizado com sucesso.',
        variant: 'default',
      });

      setEditingLimit(null);
      setLimitValue('');
    } catch (err) {
      // Se já foi tratado acima (coluna não existe), não mostra erro duplicado
      if (err.message?.includes('limite_meta') || err.message?.includes('Could not find')) {
        return; // Já foi tratado acima
      }
      
      console.error('Erro ao atualizar limite:', err);
      toast({
        title: 'Erro ao atualizar limite',
        description: err.message,
        variant: 'destructive',
      });
      setEditingLimit(null);
      setLimitValue('');
    }
  }, [toast]);

  // Inicia edição do limite de gasto no Meta
  const startEditingLimit = useCallback((client) => {
    setEditingLimit(client.id);
    // Usa o limite_meta (limite de gasto no Meta), não o valor (quanto o cliente paga)
    if (client.limite_meta) {
      // Converte para string e formata com vírgula como separador decimal
      const valueStr = client.limite_meta.toString();
      setLimitValue(valueStr.includes('.') ? valueStr.replace('.', ',') : valueStr);
    } else {
      setLimitValue('');
    }
  }, []);

  // Cancela edição
  const cancelEditingLimit = useCallback(() => {
    setEditingLimit(null);
    setLimitValue('');
  }, []);

  // Salva edição
  const saveEditingLimit = useCallback((clientId) => {
    if (limitValue.trim()) {
      updateClientLimit(clientId, limitValue);
    } else {
      cancelEditingLimit();
    }
  }, [limitValue, updateClientLimit, cancelEditingLimit]);

  // Busca contas vinculadas de um cliente
  const fetchLinkedAccounts = useCallback(async (clientId) => {
    try {
      const { data, error } = await supabase
        .from('cliente_meta_accounts')
        .select('meta_account_id, meta_account_name')
        .eq('cliente_id', clientId)
        .eq('is_active', true);

      if (error) throw error;
      const accounts = data || [];
      
      // Armazena no mapa para uso no filtro
      setLinkedAccountsMap(prev => ({
        ...prev,
        [clientId]: accounts,
      }));
      
      return accounts;
    } catch (err) {
      console.error(`Erro ao buscar contas vinculadas do cliente ${clientId}:`, err);
      setLinkedAccountsMap(prev => ({
        ...prev,
        [clientId]: [],
      }));
      return [];
    }
  }, []);

  // Busca dados do Meta para uma conta (com cache)
  const fetchMetaData = useCallback(async (accountId, forceRefresh = false) => {
    try {
      // Usa o período selecionado pelo usuário
      const timeRange = {
        since: date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        until: date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      };

      // Verifica cache antes de buscar da API
      const cacheKey = getCacheKey(accountId, date?.from, date?.to);
      if (!forceRefresh) {
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
          return cachedData;
        }
      } else {
        console.log(`🔄 Forçando atualização (ignorando cache) para conta ${accountId}`);
      }

      // Busca apenas campanhas (que já incluem insights) - sempre busca da API quando forceRefresh
      const campaignsResponse = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-campaigns',
          adAccountId: accountId,
          time_range: timeRange,
          metrics: ['spend', 'impressions', 'clicks', 'reach', 'actions', 'action_values'],
        },
      });

      if (campaignsResponse.error) {
        throw campaignsResponse.error;
      }

      const campaignsData = campaignsResponse.data;

      // Agrega dados de campanhas
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalReach = 0;
      let totalMessages = 0;
      let totalPurchases = 0;
      let totalPurchaseValue = 0;
      let hasActiveCampaigns = false;
      let activeCampaignsCount = 0;
      let lastUpdate = null;

      if (campaignsData?.campaigns && Array.isArray(campaignsData.campaigns)) {
        campaignsData.campaigns.forEach(campaign => {
          // Conta campanhas ativas (em veiculação)
          const isActive = campaign.effective_status === 'ACTIVE' || 
                          (campaign.status === 'ACTIVE' && campaign.insights?.data?.[0] && 
                           (parseFloat(campaign.insights.data[0].spend || 0) > 0 || 
                            parseFloat(campaign.insights.data[0].impressions || 0) > 0));
          
          if (isActive) {
            hasActiveCampaigns = true;
            activeCampaignsCount++;
          }
          
          if (campaign.updated_time) {
            try {
              const updateDate = new Date(campaign.updated_time);
              if (!isNaN(updateDate.getTime()) && (!lastUpdate || updateDate > lastUpdate)) {
                lastUpdate = updateDate;
              }
            } catch (e) {
              // Ignora erros de data
            }
          }

          if (campaign.insights?.data?.[0]) {
            const insights = campaign.insights.data[0];
            totalSpend += parseFloat(insights.spend || 0) || 0;
            totalImpressions += parseFloat(insights.impressions || 0) || 0;
            totalClicks += parseFloat(insights.clicks || 0) || 0;
            totalReach += parseFloat(insights.reach || 0) || 0;

            // Processa actions para mensagens e compras
            if (Array.isArray(insights.actions) && insights.actions.length > 0) {
              // Debug: log de todas as actions para identificar tipos disponíveis (apenas primeira vez)
              if (!window._loggedActions) {
                console.log('📊 Actions disponíveis na API:', insights.actions.map(a => ({
                  type: a.action_type,
                  value: a.value
                })));
                window._loggedActions = true;
              }
              
              insights.actions.forEach(action => {
                // Verifica múltiplos tipos de ações de mensagem
                const messagingActionTypes = [
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
                
                if (messagingActionTypes.includes(action?.action_type)) {
                  const messageValue = parseFloat(action.value || 0) || 0;
                  totalMessages += messageValue;
                  if (messageValue > 0) {
                    console.log(`✅ Mensagem encontrada: ${action.action_type} = ${messageValue}`);
                  }
                }
                if (action?.action_type === 'omni_purchase') {
                  totalPurchases += parseFloat(action.value || 0) || 0;
                }
              });
            } else {
              // Debug: se não há actions, pode ser que a API não esteja retornando
              if (insights && !insights.actions) {
                console.log('⚠️ Insights sem campo actions:', Object.keys(insights));
              }
            }

            // Processa action_values para valor de compras
            if (Array.isArray(insights.action_values)) {
              insights.action_values.forEach(actionValue => {
                if (actionValue?.action_type === 'omni_purchase') {
                  totalPurchaseValue += parseFloat(actionValue.value || 0) || 0;
                }
              });
            }
          }
        });
      }

      const result = {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        reach: totalReach,
        messages: totalMessages,
        purchases: totalPurchases,
        purchaseValue: totalPurchaseValue,
        hasActiveCampaigns,
        activeCampaignsCount,
        lastUpdate,
      };

      // Salva no cache (atualiza com dados novos)
      setCachedData(cacheKey, result);
      
      if (forceRefresh) {
        console.log(`✅ Dados atualizados em tempo real para conta ${accountId}`);
      }

      return result;
    } catch (err) {
      console.error(`Erro ao buscar dados do Meta para conta ${accountId}:`, err);
      throw err;
    }
  }, [date]);

  // Carrega dados de um cliente
  const loadClientData = useCallback(async (client, forceRefresh = false) => {
    // Verifica se já tem dados válidos e não está forçando refresh
    const existingData = clientData[client.id];
    if (!forceRefresh && existingData && !existingData.loading && existingData.metrics !== null) {
      console.log(`⏭️  Pulando carregamento do cliente ${client.empresa} - dados já disponíveis`);
      return; // Já tem dados válidos, não recarrega
    }

    // Verifica cache antes de mostrar loading
    if (!forceRefresh) {
      try {
        const linkedAccounts = await fetchLinkedAccounts(client.id);
        if (linkedAccounts.length > 0) {
          // Tenta carregar do cache primeiro
          const cachedResults = await Promise.all(
            linkedAccounts.map(async (account) => {
              const cacheKey = getCacheKey(account.meta_account_id, date?.from, date?.to);
              return getCachedData(cacheKey);
            })
          );

            // Se todos os dados estão em cache, usa eles
          if (cachedResults.every(result => result !== null)) {
            const aggregated = cachedResults.reduce((acc, data) => {
              if (!data) return acc;
              
              // Converte lastUpdate para Date se necessário
              const accLastUpdate = acc.lastUpdate instanceof Date 
                ? acc.lastUpdate 
                : (acc.lastUpdate ? new Date(acc.lastUpdate) : null);
              const dataLastUpdate = data.lastUpdate instanceof Date 
                ? data.lastUpdate 
                : (data.lastUpdate ? new Date(data.lastUpdate) : null);
              
              return {
                spend: acc.spend + (data.spend || 0),
                impressions: acc.impressions + (data.impressions || 0),
                clicks: acc.clicks + (data.clicks || 0),
                reach: acc.reach + (data.reach || 0),
                messages: acc.messages + (data.messages || 0),
                purchases: acc.purchases + (data.purchases || 0),
                purchaseValue: acc.purchaseValue + (data.purchaseValue || 0),
                hasActiveCampaigns: acc.hasActiveCampaigns || data.hasActiveCampaigns,
                activeCampaignsCount: acc.activeCampaignsCount + (data.activeCampaignsCount || 0),
                lastUpdate: accLastUpdate && dataLastUpdate
                  ? new Date(Math.max(accLastUpdate.getTime(), dataLastUpdate.getTime()))
                  : (accLastUpdate || dataLastUpdate),
              };
            }, {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0,
              messages: 0,
              purchases: 0,
              purchaseValue: 0,
              hasActiveCampaigns: false,
              activeCampaignsCount: 0,
              lastUpdate: null,
            });

            setClientData(prev => ({
              ...prev,
              [client.id]: {
                loading: false,
                error: null,
                metrics: aggregated,
              },
            }));
            console.log(`✅ Dados carregados do cache para ${client.empresa}`);
            return; // Dados do cache, não precisa buscar da API
          }
        }
      } catch (err) {
        console.error('Erro ao verificar cache:', err);
        // Continua para buscar da API
      }
    }

    setClientData(prev => ({
      ...prev,
      [client.id]: { loading: true, error: null, metrics: null },
    }));

    try {
      const linkedAccounts = await fetchLinkedAccounts(client.id);

      if (linkedAccounts.length === 0) {
        setClientData(prev => ({
          ...prev,
          [client.id]: {
            loading: false,
            error: null,
            metrics: null, // Sem contas vinculadas
          },
        }));
        return;
      }

      // Busca dados de todas as contas vinculadas
      const accountDataPromises = linkedAccounts.map(account =>
        fetchMetaData(account.meta_account_id, forceRefresh).catch(err => {
          console.error(`Erro ao buscar dados da conta ${account.meta_account_id}:`, err);
          return null;
        })
      );

      const accountDataResults = await Promise.all(accountDataPromises);
      
      // Agrega dados de todas as contas
      const aggregated = accountDataResults.reduce((acc, data) => {
        if (!data) return acc;
        
        // Converte lastUpdate para Date se necessário
        const accLastUpdate = acc.lastUpdate instanceof Date 
          ? acc.lastUpdate 
          : (acc.lastUpdate ? new Date(acc.lastUpdate) : null);
        const dataLastUpdate = data.lastUpdate instanceof Date 
          ? data.lastUpdate 
          : (data.lastUpdate ? new Date(data.lastUpdate) : null);
        
        return {
          spend: acc.spend + (data.spend || 0),
          impressions: acc.impressions + (data.impressions || 0),
          clicks: acc.clicks + (data.clicks || 0),
          reach: acc.reach + (data.reach || 0),
          messages: acc.messages + (data.messages || 0),
          purchases: acc.purchases + (data.purchases || 0),
          purchaseValue: acc.purchaseValue + (data.purchaseValue || 0),
          hasActiveCampaigns: acc.hasActiveCampaigns || data.hasActiveCampaigns,
          activeCampaignsCount: acc.activeCampaignsCount + (data.activeCampaignsCount || 0),
          lastUpdate: accLastUpdate && dataLastUpdate
            ? new Date(Math.max(accLastUpdate.getTime(), dataLastUpdate.getTime()))
            : (accLastUpdate || dataLastUpdate),
        };
      }, {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        messages: 0,
        purchases: 0,
        purchaseValue: 0,
        hasActiveCampaigns: false,
        activeCampaignsCount: 0,
        lastUpdate: null,
      });

      setClientData(prev => ({
        ...prev,
        [client.id]: {
          loading: false,
          error: null,
          metrics: aggregated,
        },
      }));
    } catch (err) {
      console.error(`Erro ao carregar dados do cliente ${client.id}:`, err);
      setClientData(prev => ({
        ...prev,
        [client.id]: {
          loading: false,
          error: err.message,
          metrics: null,
        },
      }));
    }
  }, [fetchLinkedAccounts, fetchMetaData, clientData, date]);

  // Carrega dados de todos os clientes (otimizado com processamento em paralelo)
  const loadAllClientsData = useCallback(async (forceRefresh = false) => {
    setRefreshing(true);
    if (forceRefresh) {
      setClientData({});
    }
    hasLoadedRef.current = false; // Reseta flag ao atualizar manualmente

    // Filtra apenas clientes com contas vinculadas
    const clientsWithAccounts = clients.filter(client => {
      const accounts = linkedAccountsMap[client.id];
      return accounts && accounts.length > 0;
    });

    if (clientsWithAccounts.length === 0) {
      setRefreshing(false);
      hasLoadedRef.current = true;
      return;
    }

    // Processa TODOS os clientes em paralelo (sem batches) para máxima velocidade
    // A edge function já tem rate limiting interno, então podemos processar tudo junto
    if (forceRefresh) {
      console.log(`🔄 Atualizando dados em tempo real de ${clientsWithAccounts.length} clientes (ignorando cache - buscando da API Meta)...`);
    } else {
      console.log(`📊 Carregando dados de ${clientsWithAccounts.length} clientes em paralelo (usando cache quando disponível)...`);
    }

    // Processa todos os clientes simultaneamente
    const allPromises = clientsWithAccounts.map(client => 
      loadClientData(client, forceRefresh).catch(err => {
        console.error(`Erro ao carregar dados do cliente ${client.id}:`, err);
        return null; // Continua mesmo com erro
      })
    );
    
    await Promise.all(allPromises);

    setRefreshing(false);
    hasLoadedRef.current = true; // Marca como carregado após atualização manual
    if (forceRefresh) {
      console.log(`✅ Atualização em tempo real concluída! ${clientsWithAccounts.length} clientes atualizados com dados novos da API Meta.`);
    } else {
      console.log(`✅ Todos os dados carregados! ${clientsWithAccounts.length} clientes processados.`);
    }
  }, [clients, loadClientData, linkedAccountsMap]);

  // Inicializa
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Busca contas vinculadas de todos os clientes ao carregar
  const fetchAllLinkedAccounts = useCallback(async () => {
    if (clients.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('cliente_meta_accounts')
        .select('cliente_id, meta_account_id, meta_account_name')
        .eq('is_active', true);

      if (error) throw error;
      
      // Agrupa por cliente
      const accountsByClient = {};
      (data || []).forEach(link => {
        if (!accountsByClient[link.cliente_id]) {
          accountsByClient[link.cliente_id] = [];
        }
        accountsByClient[link.cliente_id].push({
          meta_account_id: link.meta_account_id,
          meta_account_name: link.meta_account_name,
        });
      });
      
      setLinkedAccountsMap(accountsByClient);
    } catch (err) {
      console.error('Erro ao buscar contas vinculadas:', err);
    }
  }, [clients]);

  // Busca contas vinculadas quando clientes são carregados
  useEffect(() => {
    if (clients.length > 0) {
      fetchAllLinkedAccounts();
    }
  }, [clients.length, fetchAllLinkedAccounts]);

  // Carrega dados apenas de clientes com contas vinculadas (apenas uma vez)
  useEffect(() => {
    if (clients.length > 0 && !loading && Object.keys(linkedAccountsMap).length > 0 && !hasLoadedRef.current) {
      // Filtra apenas clientes com contas vinculadas
      const clientsWithAccounts = clients.filter(client => {
        const accounts = linkedAccountsMap[client.id];
        return accounts && accounts.length > 0;
      });
      
      if (clientsWithAccounts.length > 0) {
        hasLoadedRef.current = true; // Marca como carregado ANTES de verificar dados
        
        // Verifica se já temos dados válidos no estado para esses clientes
        const clientsNeedingData = clientsWithAccounts.filter(client => {
          const data = clientData[client.id];
          // Precisa carregar se não tem dados ou se está em loading
          return !data || data.loading || (data.metrics === null && !data.error);
        });

        // Se todos já têm dados válidos, não recarrega
        if (clientsNeedingData.length === 0) {
          console.log('✅ Todos os dados já estão carregados, usando estado existente');
          return;
        }

        // Carrega dados apenas dos clientes que precisam (otimizado - todos em paralelo)
        // Usa cache quando disponível, então não precisa resetar o estado
        const loadClientsWithAccounts = async () => {
          setRefreshing(true);
          // Não reseta clientData aqui - deixa os dados existentes enquanto carrega do cache
          
          // Processa TODOS os clientes simultaneamente para máxima velocidade
          console.log(`📊 Carregando dados de ${clientsNeedingData.length} clientes em paralelo (usando cache quando disponível)...`);
          
          const allPromises = clientsNeedingData.map(client => 
            loadClientData(client, false).catch(err => {
              console.error(`Erro ao carregar dados do cliente ${client.id}:`, err);
              return null; // Continua mesmo com erro
            })
          );
          
          await Promise.all(allPromises);
          
          setRefreshing(false);
          console.log(`✅ Dados carregados! ${clientsNeedingData.length} clientes processados.`);
        };
        
        loadClientsWithAccounts();
      }
    }
  }, [clients.length, loading, linkedAccountsMap, loadClientData]);

  useEffect(() => {
    setLoading(false);
  }, []);

  // Configura atualização automática a cada 4 horas
  useEffect(() => {
    // Limpa intervalo anterior se existir
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
    }

    // Configura intervalo para atualizar automaticamente a cada 4 horas
    autoRefreshIntervalRef.current = setInterval(() => {
      console.log('🔄 Atualização automática do cache (4 horas)');
      if (clients.length > 0 && Object.keys(linkedAccountsMap).length > 0) {
        loadAllClientsData(true); // Força atualização ignorando cache
      }
    }, CACHE_DURATION_MS);

    // Limpa intervalo ao desmontar componente
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [clients.length, linkedAccountsMap, loadAllClientsData]);

  // Formatação de valores
  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
  };

  const formatDecimal = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0,00';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0,00%';
    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };

  // Calcula métricas derivadas
  // limite = limite_meta (limite de gasto no Meta Ads), não valor (quanto o cliente paga)
  const calculateMetrics = (metrics, limite, client) => {
    if (!metrics) return null;

    const costPerMessage = metrics.messages > 0 ? metrics.spend / metrics.messages : 0;
    const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
    const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
    const costPerPurchase = metrics.purchases > 0 ? metrics.spend / metrics.purchases : 0;
    const roas = metrics.spend > 0 ? metrics.purchaseValue / metrics.spend : 0;
    const ticketMedio = metrics.purchases > 0 ? metrics.purchaseValue / metrics.purchases : 0;

    // Determina cores para V. Acumulado
    const limiteNum = parseFloat(limite) || 0;
    const acumuladoColor = limiteNum > 0
      ? metrics.spend >= limiteNum
        ? 'bg-red-500/20 text-red-700 dark:text-red-400'
        : metrics.spend >= limiteNum * 0.9
        ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
        : 'bg-green-500/20 text-green-700 dark:text-green-400'
      : '';

    // Cor para C/ Mensagens com base na meta do cliente (se existir)
    let costPerMessageColor = '';
    const metaMensagem = client?.meta_custo_mensagem ? Number(client.meta_custo_mensagem) : null;
    if (metaMensagem && costPerMessage > 0) {
      if (costPerMessage <= metaMensagem) {
        costPerMessageColor = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      } else if (costPerMessage <= metaMensagem * 1.2) {
        costPerMessageColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      } else {
        costPerMessageColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      }
    }

    // Cor para C/ compra com base na meta ou ROAS alvo
    let costPerPurchaseColor = '';
    const metaCompra = client?.meta_custo_compra ? Number(client.meta_custo_compra) : null;
    const roasAlvo = client?.roas_alvo ? Number(client.roas_alvo) : null;

    if (metaCompra && costPerPurchase > 0) {
      if (costPerPurchase <= metaCompra) {
        costPerPurchaseColor = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      } else if (costPerPurchase <= metaCompra * 1.2) {
        costPerPurchaseColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      } else {
        costPerPurchaseColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      }
    } else if (roasAlvo && roas > 0) {
      if (roas >= roasAlvo) {
        costPerPurchaseColor = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      } else if (roas >= roasAlvo * 0.7) {
        costPerPurchaseColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      } else {
        costPerPurchaseColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      }
    }

    // Saúde geral da conta
    let healthStatus = 'OK';
    let healthColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    const limitUsage = limiteNum > 0 ? metrics.spend / limiteNum : 0;
    const objetivoRaw = (client?.objetivo_meta || '').toString().toLowerCase();
    const objetivoMensagens = objetivoRaw.startsWith('mensagem') || objetivoRaw.includes('lead');
    const objetivoCompras = objetivoRaw.startsWith('compra') || objetivoRaw.includes('e-commerce');
    const objetivoMisto = objetivoRaw.startsWith('misto');

    if (objetivoMensagens) {
      if (!metaMensagem || metrics.messages === 0) {
        healthStatus = 'Atenção';
        healthColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      } else if (costPerMessage > metaMensagem * 1.2 || limitUsage > 1.1) {
        healthStatus = 'Crítico';
        healthColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      } else if (costPerMessage > metaMensagem || limitUsage > 1) {
        healthStatus = 'Atenção';
        healthColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      }
    } else if (objetivoCompras) {
      if (!roasAlvo && !metaCompra) {
        healthStatus = 'Atenção';
        healthColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      } else if ((roasAlvo && roas < roasAlvo * 0.7) || (metaCompra && costPerPurchase > metaCompra * 1.2) || limitUsage > 1.1) {
        healthStatus = 'Crítico';
        healthColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      } else if ((roasAlvo && roas < roasAlvo) || (metaCompra && costPerPurchase > metaCompra) || limitUsage > 1) {
        healthStatus = 'Atenção';
        healthColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      }
    } else if (objetivoMisto || objetivoRaw) {
      // Misto ou não definido: avalia principalmente uso de limite
      if (limitUsage > 1.1) {
        healthStatus = 'Crítico';
        healthColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      } else if (limitUsage > 1) {
        healthStatus = 'Atenção';
        healthColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      }
    }

    return {
      ...metrics,
      costPerMessage,
      ctr,
      cpm,
      costPerPurchase,
      roas,
      ticketMedio,
      acumuladoColor,
      costPerMessageColor,
      costPerPurchaseColor,
      healthStatus,
      healthColor,
    };
  };

  // Determina status META
  const getMetaStatus = (metrics) => {
    if (!metrics) return { label: 'SEM DADOS', color: 'bg-gray-500 text-white', value: 'no-data' };
    if (metrics.hasActiveCampaigns) return { label: 'META ATIVO', color: 'bg-green-500 text-white', value: 'active' };
    return { label: 'META PAUSADO', color: 'bg-yellow-500 text-white', value: 'paused' };
  };

  // Filtra clientes baseado no status e contas vinculadas
  const filteredClients = useMemo(() => {
    // Por padrão, mostra apenas clientes com contas vinculadas
    let filtered = clients.filter(client => {
      const hasLinkedAccounts = linkedAccountsMap[client.id] && linkedAccountsMap[client.id].length > 0;
      return hasLinkedAccounts;
    });
    
    // Aplica filtro de status (mesmo 'all' mostra apenas clientes com contas vinculadas)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => {
        const data = clientData[client.id];
        const status = getMetaStatus(data?.metrics);
        return status.value === statusFilter;
      });
    }
    
    return filtered;
  }, [clients, clientData, statusFilter, linkedAccountsMap]);

  // Funções para atalhos de período
  const setPeriodShortcut = useCallback((shortcut) => {
    const today = new Date();
    let from, to;

    switch (shortcut) {
      case 'hoje':
        from = startOfDay(today);
        to = endOfDay(today);
        break;
      case 'ontem':
        const yesterday = subDays(today, 1);
        from = startOfDay(yesterday);
        to = endOfDay(yesterday);
        break;
      case '7dias':
        from = subDays(today, 7);
        to = today;
        break;
      case '15dias':
        from = subDays(today, 15);
        to = today;
        break;
      case '30dias':
        from = subDays(today, 30);
        to = today;
        break;
      case '90dias':
        from = subDays(today, 90);
        to = today;
        break;
      case 'mes-atual':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case 'mes-passado':
        const lastMonth = subMonths(today, 1);
        from = startOfMonth(lastMonth);
        to = endOfMonth(lastMonth);
        break;
      default:
        return;
    }

    setDate({ from, to });
  }, []);

  // Reseta flag quando período muda para recarregar dados (usa cache quando disponível)
  useEffect(() => {
    if (!date?.from || !date?.to || !isValid(date.from) || !isValid(date.to) || !hasLoadedRef.current) {
      return;
    }

    // Cria uma chave única para o período atual
    const currentDateRange = `${date.from.getTime()}_${date.to.getTime()}`;
    
    // Só recarrega se o período realmente mudou
    if (lastDateRangeRef.current === currentDateRange) {
      return; // Período não mudou, não precisa recarregar
    }

    lastDateRangeRef.current = currentDateRange;
    hasLoadedRef.current = false;
    
    // Recarrega dados quando período muda (usa cache quando disponível)
    if (clients.length > 0 && Object.keys(linkedAccountsMap).length > 0) {
      const clientsWithAccounts = clients.filter(client => {
        const accounts = linkedAccountsMap[client.id];
        return accounts && accounts.length > 0;
      });
      
      if (clientsWithAccounts.length > 0) {
        const loadClientsWithAccounts = async () => {
          setRefreshing(true);
          setClientData({});
          
          // Processa em paralelo (cache será verificado automaticamente)
          console.log(`📊 Recarregando dados para novo período (usando cache quando disponível)...`);
          const allPromises = clientsWithAccounts.map(client => 
            loadClientData(client, false).catch(err => {
              console.error(`Erro ao carregar dados do cliente ${client.id}:`, err);
              return null;
            })
          );
          
          await Promise.all(allPromises);
          
          setRefreshing(false);
          hasLoadedRef.current = true;
          console.log(`✅ Dados recarregados para novo período!`);
        };
        
        loadClientsWithAccounts();
      }
    }
  }, [date?.from?.getTime(), date?.to?.getTime()]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-semibold dark:text-white">Clientes - Dados Meta Ads</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('hoje')}
                    >
                      Hoje
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('ontem')}
                    >
                      Ontem
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('7dias')}
                    >
                      Últimos 7 dias
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('15dias')}
                    >
                      Últimos 15 dias
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('30dias')}
                    >
                      Últimos 30 dias
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('90dias')}
                    >
                      Últimos 90 dias
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('mes-atual')}
                    >
                      Mês atual
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-xs dark:text-gray-300 dark:hover:bg-gray-800 h-7 px-2"
                      onClick={() => setPeriodShortcut('mes-passado')}
                    >
                      Mês passado
                    </Button>
                  </div>
                </div>
                <div className="p-4 bg-white dark:bg-gray-800">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <Filter className="text-gray-500 dark:text-gray-400" size={20} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700">
                <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-600">
                  Todos os Status
                </SelectItem>
                <SelectItem value="active" className="dark:text-white dark:hover:bg-gray-600">
                  META ATIVO
                </SelectItem>
                <SelectItem value="paused" className="dark:text-white dark:hover:bg-gray-600">
                  META PAUSADO
                </SelectItem>
                <SelectItem value="no-data" className="dark:text-white dark:hover:bg-gray-600">
                  SEM DADOS
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              console.log('🔄 Atualização manual solicitada - buscando dados em tempo real da API Meta...');
              loadAllClientsData(true);
            }}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            title="Força atualização em tempo real ignorando cache (busca dados novos da API Meta)"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="dark:bg-gray-900">
            <TableRow className="dark:border-gray-700">
              <TableHead className="dark:text-white">Clientes</TableHead>
              <TableHead className="dark:text-white">Objetivo</TableHead>
              <TableHead className="dark:text-white">Campanhas Ativas</TableHead>
              <TableHead className="dark:text-white">D. ATUALIZAÇÃO</TableHead>
              <TableHead className="dark:text-white">Limite R$</TableHead>
              <TableHead className="dark:text-white">V. Acumulado</TableHead>
              <TableHead className="dark:text-white">Mensagens</TableHead>
              <TableHead className="dark:text-white">C/ Mensagens</TableHead>
              <TableHead className="dark:text-white">Alcance</TableHead>
              <TableHead className="dark:text-white">Cliques</TableHead>
              <TableHead className="dark:text-white">Impressões</TableHead>
              <TableHead className="dark:text-white">CTR</TableHead>
              <TableHead className="dark:text-white">CPM</TableHead>
              <TableHead className="dark:text-white">Compra</TableHead>
              <TableHead className="dark:text-white">Retorno</TableHead>
              <TableHead className="dark:text-white">C/ compra</TableHead>
              <TableHead className="dark:text-white">ROAS</TableHead>
              <TableHead className="dark:text-white">Ticket Médio</TableHead>
              <TableHead className="dark:text-white">Saúde</TableHead>
              <TableHead className="dark:text-white">META</TableHead>
              <TableHead className="dark:text-white">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.map(client => {
              const data = clientData[client.id];
              const metrics = data?.metrics ? calculateMetrics(data.metrics, client.limite_meta, client) : null;
              const status = getMetaStatus(data?.metrics);

              return (
                <TableRow key={client.id} className="dark:border-gray-700">
                  <TableCell className="font-medium dark:text-white">{client.empresa}</TableCell>
                  <TableCell className="dark:text-gray-300">
                    {(() => {
                      const raw = (client.objetivo_meta || '').toString().toLowerCase();
                      if (!raw) return 'Não definido';
                      if (raw.startsWith('mensagem') || raw.includes('lead')) return 'Mensagens / Leads';
                      if (raw.startsWith('compra') || raw.includes('e-commerce')) return 'Compras / E-commerce';
                      if (raw.startsWith('misto')) return 'Misto';
                      // Qualquer outro valor não vazio
                      return client.objetivo_meta;
                    })()}
                  </TableCell>
                  <TableCell className="dark:text-gray-300 text-center">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    ) : metrics?.activeCampaignsCount !== undefined ? (
                      <Badge variant={metrics.activeCampaignsCount > 0 ? 'default' : 'secondary'} className={metrics.activeCampaignsCount > 0 ? 'bg-green-500' : 'bg-gray-500'}>
                        {metrics.activeCampaignsCount}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics?.lastUpdate ? (
                      (() => {
                        try {
                          // Garante que lastUpdate é um Date object válido
                          const updateDate = metrics.lastUpdate instanceof Date 
                            ? metrics.lastUpdate 
                            : new Date(metrics.lastUpdate);
                          if (isValid(updateDate)) {
                            return format(updateDate, 'dd/MM/yyyy', { locale: ptBR });
                          }
                          return '-';
                        } catch (err) {
                          console.error('Erro ao formatar data:', err);
                          return '-';
                        }
                      })()
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {editingLimit === client.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={limitValue}
                          onChange={(e) => setLimitValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveEditingLimit(client.id);
                            } else if (e.key === 'Escape') {
                              cancelEditingLimit();
                            }
                          }}
                          className="w-24 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
                          autoFocus
                          placeholder="0,00"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => saveEditingLimit(client.id)}
                        >
                          <Check className="h-3 w-3 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={cancelEditingLimit}
                        >
                          <X className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span>{client.limite_meta ? formatCurrency(client.limite_meta) : '-'}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startEditingLimit(client)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`dark:text-gray-300 ${metrics?.acumuladoColor || ''}`}>
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatCurrency(metrics.spend)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatNumber(metrics.messages)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className={`dark:text-gray-300 ${metrics?.costPerMessageColor || ''}`}>
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatCurrency(metrics.costPerMessage)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatNumber(metrics.reach)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatNumber(metrics.clicks)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatNumber(metrics.impressions)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatPercentage(metrics.ctr)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatCurrency(metrics.cpm)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatNumber(metrics.purchases)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatCurrency(metrics.purchaseValue)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      formatCurrency(metrics.costPerPurchase)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics ? (
                      `${formatDecimal(metrics.roas)}x`
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {data?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : metrics && metrics.ticketMedio > 0 ? (
                      formatCurrency(metrics.ticketMedio)
                    ) : (
                      'Sem Dados'
                    )}
                  </TableCell>
                  <TableCell className={`dark:text-gray-300`}>
                    {data?.loading || !metrics ? (
                      data?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sem Dados'
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${metrics.healthColor || ''}`}>
                        {metrics.healthStatus || 'OK'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={status.color}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setDetailViewClient(client)}
                        title="Ver detalhes das campanhas"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Dialog open={observationsDialog?.clientId === client.id} onOpenChange={(open) => {
                        if (!open) {
                          setObservationsDialog(null);
                          setNewObservation('');
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 relative"
                            onClick={() => openObservationsDialog(client)}
                            title="Observações"
                          >
                            <MessageSquare className="h-4 w-4" />
                            {observations[client.id]?.length > 0 && (
                              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {observations[client.id].length}
                              </span>
                            )}
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto dark:bg-gray-800">
                        <DialogHeader>
                          <DialogTitle className="dark:text-white">
                            Observações - {observationsDialog?.clientName}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="sr-only">
                          Dialog para adicionar e visualizar observações sobre ações realizadas para o cliente
                        </div>
                        <div className="space-y-4">
                          {/* Lista de observações */}
                          <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {loadingObservations ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : observations[client.id]?.length > 0 ? (
                              observations[client.id].map((obs) => (
                                <div
                                  key={obs.id}
                                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                                >
                                  <div className="flex items-start gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={obs.profiles?.avatar_url} />
                                      <AvatarFallback>
                                        {obs.profiles?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium dark:text-white">
                                          {obs.profiles?.full_name || 'Usuário'}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          {format(new Date(obs.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {obs.observation}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                                Nenhuma observação ainda. Seja o primeiro a adicionar!
                              </p>
                            )}
                          </div>

                          {/* Formulário para nova observação */}
                          <div className="border-t pt-4 dark:border-gray-700">
                            <div className="space-y-2">
                              <Textarea
                                placeholder="Adicione uma observação sobre o que foi feito para este cliente..."
                                value={newObservation}
                                onChange={(e) => setNewObservation(e.target.value)}
                                className="min-h-[100px] dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    addObservation(client.id);
                                  }
                                }}
                              />
                              <div className="flex justify-end">
                                <Button
                                  onClick={() => addObservation(client.id)}
                                  disabled={!newObservation.trim() || loadingObservations}
                                  className="dark:bg-blue-600 dark:hover:bg-blue-700"
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Adicionar Observação
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Tela de detalhes */}
      {detailViewClient && (
        <ClientMetaDetailView
          client={detailViewClient}
          onClose={() => setDetailViewClient(null)}
        />
      )}
    </div>
  );
};

export default ClientMetaList;

