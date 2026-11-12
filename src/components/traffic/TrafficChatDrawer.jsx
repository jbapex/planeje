import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Send, X, Loader2, Settings2, Search, Globe, Maximize2, Minimize2, History, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import ModelSelector from '@/components/chat/ModelSelector';
import { getAvailableModels, getDefaultModel } from '@/lib/assistantProjectConfig';
import { searchGoogle, formatSearchResults } from '@/lib/googleSearch';
import { marked } from 'marked';
import {
  getMetaAdAccountsErrorMessage,
  isMetaNoAdAccountsError,
  isMetaNoAdAccountsResponse,
} from '@/lib/metaAdAccountsResponse';
import { loadRoutineBrief, routineBriefPrompt, routineSearchRange, routineWeekRange } from '@/lib/routineAssistantBrief';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import { displayDate } from '@/lib/trafficWeeklyReview';
import { DayField } from '@/components/pages/MiniCrmFollowUp';

const TrafficChatDrawer = ({ open, onOpenChange, campaigns = [], metaConnectionStatus = 'disconnected', conversationId: initialConversationId = null, routineContext = null }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [workNote, setWorkNote] = useState('');
  const [currentAIMessage, setCurrentAIMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek/deepseek-r1-0528');
  const [availableModels, setAvailableModels] = useState(['deepseek/deepseek-r1-0528']);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [linkedClient, setLinkedClient] = useState(null);
  const [clientDocuments, setClientDocuments] = useState([]);
  const [loadingClientData, setLoadingClientData] = useState(false);
  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(initialConversationId);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leadFicha, setLeadFicha] = useState(null);
  const [searchSince, setSearchSince] = useState('');
  const [searchUntil, setSearchUntil] = useState('');
  const [searchScope, setSearchScope] = useState('sheet');

  const openLeadConversation = useCallback(async (lead) => {
    const clienteId = routineContext?.clientId;
    if (!lead?.id || !clienteId) {
      if (lead?.href) navigate(lead.href);
      return;
    }
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, phone, from_jid, sender_name, first_seen_at, last_message_at, tracking_data, utm_campaign, utm_medium, utm_content, qualificado, comprou, valor_venda, mini_crm')
      .eq('id', lead.id)
      .eq('cliente_id', clienteId)
      .maybeSingle();
    if (error || !data) {
      if (lead?.href) navigate(lead.href);
      return;
    }
    setLeadFicha(data);
  }, [navigate, routineContext?.clientId]);

  useEffect(() => {
    const week = routineWeekRange(routineContext?.weekStart);
    setSearchSince(week?.since || '');
    setSearchUntil(week?.until || '');
    setSearchScope('sheet');
  }, [routineContext?.clientId, routineContext?.weekStart]);

  // Configurar marked
  useEffect(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }, []);

  // Buscar histórico de conversas (até 3 mais recentes)
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select('*')
        .eq('owner_id', user.id)
        .eq('mode', 'traffic_assistant')
        .order('updated_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
    }
  }, [user]);

  // Carregar conversa específica
  const loadConversation = useCallback(async (convId) => {
    if (!user || !convId) return;

    setLoadingConversation(true);
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select('*')
        .eq('id', convId)
        .eq('owner_id', user.id)
        .eq('mode', 'traffic_assistant')
        .single();

      if (error) throw error;
      
      if (data && data.messages) {
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setCurrentConversationId(data.id);
        setShowHistory(false);
        
        // Atualizar URL com o ID da conversa
        const url = new URL(window.location.href);
        url.searchParams.set('assistant', data.id);
        window.history.replaceState({}, '', url);
      }
    } catch (error) {
      console.error('Erro ao carregar conversa:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a conversa.',
        variant: 'destructive',
      });
    } finally {
      setLoadingConversation(false);
    }
  }, [user, toast]);

  // Carregar conversa se houver conversationId na URL
  useEffect(() => {
    if (!user || !initialConversationId || !open) return;
    loadConversation(initialConversationId);
  }, [user, initialConversationId, open, loadConversation]);

  // Buscar conversas quando abrir o drawer
  useEffect(() => {
    if (open && user) {
      fetchConversations();
    }
  }, [open, user, fetchConversations]);

  // Deletar conversa
  const handleDeleteConversation = useCallback(async (convId, e) => {
    e.stopPropagation();
    
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('assistant_project_conversations')
        .delete()
        .eq('id', convId)
        .eq('owner_id', user.id);

      if (error) throw error;
      
      setConversations(prev => prev.filter(conv => conv.id !== convId));
      
      // Se a conversa deletada era a atual, limpar
      if (currentConversationId === convId) {
        setMessages([]);
        setCurrentConversationId(null);
        const url = new URL(window.location.href);
        url.searchParams.set('assistant', 'new');
        window.history.replaceState({}, '', url);
      }
      
      toast({
        title: 'Conversa deletada',
        description: 'A conversa foi removida com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao deletar conversa:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar a conversa.',
        variant: 'destructive',
      });
    }
  }, [user, currentConversationId, toast]);

  // Nova conversa
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setShowHistory(false);
    
    // Atualizar URL para nova conversa
    const url = new URL(window.location.href);
    url.searchParams.set('assistant', 'new');
    window.history.replaceState({}, '', url);
  }, []);

  // Salvar conversa
  const saveConversation = useCallback(async (messagesToSave) => {
    if (!user || messagesToSave.length === 0) return;

    try {
      const conversationData = {
        owner_id: user.id,
        mode: 'traffic_assistant',
        messages: messagesToSave,
        updated_at: new Date().toISOString(),
      };

      if (currentConversationId) {
        // Atualizar conversa existente
        const { error } = await supabase
          .from('assistant_project_conversations')
          .update(conversationData)
          .eq('id', currentConversationId);

        if (error) throw error;
        
        // Atualizar na lista de conversas
        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, ...conversationData, updated_at: conversationData.updated_at }
            : conv
        ).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 3));
      } else {
        // Criar nova conversa
        const title = messagesToSave[0]?.content?.split(' ').slice(0, 3).join(' ') || 'Assistente de Tráfego';
        const { data, error } = await supabase
          .from('assistant_project_conversations')
          .insert({ ...conversationData, title })
          .select()
          .single();

        if (error) throw error;
        setCurrentConversationId(data.id);
        
        // Atualizar lista de conversas
        setConversations(prev => {
          const updated = [data, ...prev].slice(0, 3); // Mantém apenas as 3 mais recentes
          return updated;
        });
        
        // Atualizar URL com query param sem mudar a rota
        const url = new URL(window.location.href);
        url.searchParams.set('assistant', data.id);
        window.history.replaceState({}, '', url);
      }
    } catch (error) {
      console.error('Erro ao salvar conversa:', error);
    }
  }, [user, currentConversationId, navigate]);

  const [openRouterReady, setOpenRouterReady] = useState(false);
  const modelPickedRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('openrouter-chat', { body: { probe: true } });
        if (cancel) return;
        if (!error && data?.ready && data?.provider === 'openrouter') {
          const [models, defaultModel] = await Promise.all([
            getAvailableModels(),
            getDefaultModel(),
          ]);
          if (cancel) return;
          const list = Array.isArray(models) && models.length > 0 ? models : ['openai/gpt-4o-mini'];
          setAvailableModels(list);
          setSelectedModel((current) => {
            if (modelPickedRef.current && list.includes(current)) return current;
            modelPickedRef.current = true;
            return list.includes(defaultModel) ? defaultModel : list[0];
          });
          setOpenRouterReady(true);
          return;
        }
      } catch (err) {
        console.warn('OpenRouter indisponível para a lista de modelos', err);
      }
      if (cancel) return;
      setSelectedModel('openai/gpt-4o-mini');
      setAvailableModels(['openai/gpt-4o-mini']);
      setOpenRouterReady(false);
    })();
    return () => { cancel = true; };
  }, [open]);

  const lastDrawerAccountsErrorRef = useRef(null);
  const emptyDrawerMetaAccountsToastShownRef = useRef(false);

  // Buscar contas do Meta quando o drawer abrir e Meta estiver conectado
  useEffect(() => {
    if (!open || metaConnectionStatus !== 'connected') {
      setMetaAccounts([]);
      return;
    }

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-ad-accounts' },
        });
        
        if (error) throw error;
        
        if (data?.error) {
          if (isMetaNoAdAccountsResponse(data)) {
            lastDrawerAccountsErrorRef.current = null;
            setMetaAccounts([]);
            if (!emptyDrawerMetaAccountsToastShownRef.current) {
              emptyDrawerMetaAccountsToastShownRef.current = true;
              console.warn(
                '[TrafficChatDrawer] Sem contas de anúncio no Meta:',
                getMetaAdAccountsErrorMessage(data)
              );
              toast({
                title: 'Nenhuma conta de anúncio no Meta',
                description:
                  'O System User precisa de acesso a contas act_… no Business Manager (ou ajuste META_BUSINESS_ID).',
                variant: 'default',
              });
            }
            return;
          }
          const errorMessage = getMetaAdAccountsErrorMessage(data);
          throw new Error(errorMessage);
        }

        if (data?.adAccounts && Array.isArray(data.adAccounts)) {
          lastDrawerAccountsErrorRef.current = null;
          emptyDrawerMetaAccountsToastShownRef.current = false;
          // Usa o mesmo formato que MetaInsights (id e name diretamente)
          setMetaAccounts(data.adAccounts);

          // Se não há conta selecionada e há contas disponíveis, mantém "all"
          // O usuário pode escolher depois
        } else {
          console.warn('Nenhuma conta de anúncio encontrada');
          setMetaAccounts([]);
        }
      } catch (error) {
        const errorMessage = error?.message || error?.error?.message || 'Erro desconhecido ao buscar contas';
        if (isMetaNoAdAccountsError(error)) {
          lastDrawerAccountsErrorRef.current = null;
          setMetaAccounts([]);
          if (!emptyDrawerMetaAccountsToastShownRef.current) {
            emptyDrawerMetaAccountsToastShownRef.current = true;
            console.warn('[TrafficChatDrawer] Sem contas de anúncio no Meta:', errorMessage);
            toast({
              title: 'Nenhuma conta de anúncio no Meta',
              description:
                'O System User precisa de acesso a contas act_… no Business Manager (ou ajuste META_BUSINESS_ID).',
              variant: 'default',
            });
          }
        } else {
          console.error('Erro ao buscar contas do Meta:', error);
          if (lastDrawerAccountsErrorRef.current !== errorMessage) {
            lastDrawerAccountsErrorRef.current = errorMessage;
            toast({
              title: 'Erro ao buscar contas',
              description: errorMessage,
              variant: 'destructive',
            });
          }
          setMetaAccounts([]);
        }
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
    // toast omitido: evita novo fetch quando a referência do hook muda
  }, [open, metaConnectionStatus]);

  // Buscar cliente vinculado e documentos quando conta é selecionada
  useEffect(() => {
    const fetchLinkedClient = async () => {
      if (!selectedAccount || selectedAccount === 'all' || metaConnectionStatus !== 'connected') {
        setLinkedClient(null);
        setClientDocuments([]);
        return;
      }

      setLoadingClientData(true);
      try {
        // Normalizar o ID da conta (pode vir com ou sem "act_")
        // A API do Meta retorna IDs com "act_", mas podem estar salvos sem
        const accountIdWithAct = selectedAccount.startsWith('act_') 
          ? selectedAccount 
          : `act_${selectedAccount}`;
        const accountIdWithoutAct = selectedAccount.startsWith('act_')
          ? selectedAccount.replace('act_', '')
          : selectedAccount;
        
        // Buscar vinculação da conta com cliente
        // Tenta com e sem "act_" para garantir que encontra
        const { data: linkData, error: linkError } = await supabase
          .from('cliente_meta_accounts')
          .select('cliente_id, clientes(id, empresa, nome_contato, nicho, publico_alvo, tom_de_voz, sobre_empresa, produtos_servicos)')
          .or(`meta_account_id.eq.${accountIdWithAct},meta_account_id.eq.${accountIdWithoutAct},meta_account_id.eq.${selectedAccount}`)
          .eq('is_active', true)
          .maybeSingle();

        if (linkError) throw linkError;

        if (linkData && linkData.cliente_id) {
          const client = linkData.clientes;
          setLinkedClient({
            id: client.id,
            empresa: client.empresa,
            nome_contato: client.nome_contato,
            nicho: client.nicho,
            publico_alvo: client.publico_alvo,
            tom_de_voz: client.tom_de_voz,
            sobre_empresa: client.sobre_empresa,
            produtos_servicos: client.produtos_servicos,
          });

          // Buscar documentos do cliente
          const { data: documents, error: docsError } = await supabase
            .from('client_documents')
            .select('id, title, content, created_at')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false })
            .limit(50);

          if (docsError) {
            console.warn('Erro ao buscar documentos:', docsError);
          } else {
            setClientDocuments(documents || []);
          }
        } else {
          setLinkedClient(null);
          setClientDocuments([]);
        }
      } catch (error) {
        console.error('Erro ao buscar cliente vinculado:', error);
        setLinkedClient(null);
        setClientDocuments([]);
      } finally {
        setLoadingClientData(false);
      }
    };

    fetchLinkedClient();
  }, [selectedAccount, metaConnectionStatus]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, currentAIMessage, workNote]);

  // Construir contexto sobre tráfego pago
  const buildTrafficContext = useCallback(() => {
    const context = {
      metaConnectionStatus,
      note: 'A fila do gestor está na aba Hoje (Fazer agora). Solicitações não são a fila do dia. O Painel mostra uma conta Meta por vez.',
      totalCampaigns: 0,
      campaigns: [],
      campaignsByStatus: {},
    };

    return JSON.stringify(context, null, 2);
  }, [metaConnectionStatus]);

  // Função para fazer pesquisa no Google
  const handleDeepResearch = useCallback(async () => {
    if (!input.trim() || isSearching) return;

    setIsSearching(true);
    try {
      const query = input.trim();
      const results = await searchGoogle(query, 8); // Busca 8 resultados para deep research
      
      if (results.length > 0) {
        setSearchResults(results);
        setIsDeepResearch(true);
        toast({
          title: 'Pesquisa realizada',
          description: `${results.length} resultados encontrados. A pesquisa será incluída na resposta.`,
        });
      } else {
        toast({
          title: 'Nenhum resultado',
          description: 'Não foram encontrados resultados para esta pesquisa.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Erro ao pesquisar:', error);
      toast({
        title: 'Erro na pesquisa',
        description: 'Não foi possível realizar a pesquisa no Google.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  }, [input, isSearching, toast]);

  // Enviar mensagem
  const handleSend = useCallback(async (preset) => {
    const userMessage = (typeof preset === 'string' ? preset : input).trim();
    if (!userMessage || isGenerating) return;
    setInput('');
    setCurrentAIMessage('');
    
    // Limpar pesquisa após enviar
    const currentSearchResults = isDeepResearch ? searchResults : [];
    setIsDeepResearch(false);
    setSearchResults([]);

    // Adiciona mensagem do usuário
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    
    // Salvar conversa após adicionar mensagem do usuário
    saveConversation(updatedMessages);

    setIsGenerating(true);
    setWorkNote(routineContext?.clientId ? 'Lendo as conversas do período…' : 'Pensando na resposta…');

    let routineBrief = null;
    let routinePrompt = '';
    try {
      const searchRange = routineSearchRange(searchSince, searchUntil);
      if (routineContext?.clientId && !searchRange) {
        routineBrief = { error: 'Escolha a data inicial e a final da pesquisa.' };
      } else if (routineContext?.clientId && searchRange) {
        routineBrief = await loadRoutineBrief(supabase, {
          ...routineContext,
          since: searchRange.since,
          until: searchRange.until,
          scope: searchScope,
        });
        routinePrompt = routineBrief && !routineBrief.error ? routineBriefPrompt(routineBrief) : '';
        if (routineBrief && !routineBrief.error && Array.isArray(routineBrief.leads)) {
          const strip = (lead) => {
            const { thread, ...card } = lead;
            return card;
          };
          routineBrief = {
            ...routineBrief,
            leads: routineBrief.leads.map(strip),
            groups: (routineBrief.groups || []).map((group) => ({ ...group, leads: (group.leads || []).map(strip) })),
          };
        }
      }
    } catch (briefError) {
      routineBrief = { error: briefError.message || 'Não foi possível ler o Rastreamento.' };
    }
    if (routineContext?.clientId) setWorkNote('Pensando na resposta…');

    try {
      // Busca dados da conta selecionada se houver
      let metaData = null;
      if (metaConnectionStatus === 'connected' && selectedAccount && selectedAccount !== 'all') {
        try {
          const selectedAccountData = metaAccounts.find(acc => acc.id === selectedAccount);
          if (selectedAccountData) {
            // Buscar insights da conta selecionada
            try {
              const { data: insightsData } = await supabase.functions.invoke('meta-ads-api', {
                body: {
                  action: 'get-account-insights',
                  adAccountId: selectedAccount, // Usa adAccountId como no MetaInsights
                  time_range: {
                    since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    until: new Date().toISOString().split('T')[0],
                  },
                },
              });
              
              metaData = {
                selectedAccount: selectedAccountData,
                accounts: metaAccounts,
                totalAccounts: metaAccounts.length,
                insights: insightsData?.insights || null,
              };
            } catch (err) {
              // Se não conseguir insights, pelo menos passa os dados da conta
              metaData = {
                selectedAccount: selectedAccountData,
                accounts: metaAccounts,
                totalAccounts: metaAccounts.length,
              };
            }
          }
        } catch (err) {
          console.warn('Erro ao buscar dados da conta selecionada:', err);
        }
      } else if (metaConnectionStatus === 'connected') {
        // Se "Todas" está selecionado, passa todas as contas
        metaData = {
          accounts: metaAccounts,
          totalAccounts: metaAccounts.length,
        };
      }

      // Construir contexto completo
      const trafficContext = buildTrafficContext();
      const metaContext = metaData ? JSON.stringify(metaData, null, 2) : 'Conexão com Meta Ads não está ativa.';

      // Construir contexto do cliente se houver vinculação
      let clientContext = '';
      if (linkedClient) {
        clientContext = `\n\n4. CLIENTE VINCULADO À CONTA:
**Empresa:** ${linkedClient.empresa || 'N/A'}
**Contato:** ${linkedClient.nome_contato || 'N/A'}
${linkedClient.nicho ? `**Nicho:** ${linkedClient.nicho}\n` : ''}
${linkedClient.publico_alvo ? `**Público-Alvo:** ${linkedClient.publico_alvo}\n` : ''}
${linkedClient.tom_de_voz ? `**Tom de Voz:** ${linkedClient.tom_de_voz}\n` : ''}
${linkedClient.sobre_empresa ? `**Sobre a Empresa:** ${linkedClient.sobre_empresa}\n` : ''}
${linkedClient.produtos_servicos ? `**Produtos/Serviços:** ${linkedClient.produtos_servicos}\n` : ''}

${clientDocuments.length > 0 ? `**Documentos do Cliente (${clientDocuments.length} disponíveis):**\n` : ''}
${clientDocuments.slice(0, 10).map((doc, idx) => {
  let text = '';
  if (typeof doc.content === 'string') {
    text = doc.content.replace(/<[^>]*>/g, '').trim().substring(0, 500);
  } else if (doc.content && typeof doc.content === 'object') {
    text = JSON.stringify(doc.content).replace(/<[^>]*>/g, '').trim().substring(0, 500);
  }
  return `${idx + 1}. ${doc.title || 'Documento'}: ${text}${text.length >= 500 ? '...' : ''}`;
}).join('\n')}
`;
      }

      // Mensagem do sistema com contexto e instruções para consultas em tempo real
      const systemMessage = `Você é um assistente especializado em gestão de tráfego pago e marketing digital. 

🎯 PRINCÍPIO FUNDAMENTAL:
A API DO META É A BASE DE CONSULTA PRINCIPAL. Todos os dados devem vir diretamente da API do Meta em tempo real, não de cache ou contexto estático.

CONTEXTO DE REFERÊNCIA (apenas para contexto geral):

1. STATUS DA CONEXÃO META:
${metaConnectionStatus === 'connected' ? '✅ Conectado à API do Meta Ads - DADOS EM TEMPO REAL DISPONÍVEIS' : '❌ Não conectado à API do Meta Ads'}

2. CAMPANHAS DE TRÁFEGO PAGO (Sistema Interno - apenas referência):
${trafficContext}

3. CONTA SELECIONADA:
${selectedAccount && selectedAccount !== 'all' ? `
- ID da Conta: ${selectedAccount}
- Nome: ${metaAccounts.find(acc => acc.id === selectedAccount)?.name || 'N/A'}
- ⚠️ IMPORTANTE: Todos os dados devem ser consultados em tempo real desta conta na API do Meta
` : 'Todas as contas (nenhuma específica selecionada)'}
${clientContext}

📋 INSTRUÇÕES CRÍTICAS:
1. BASE DE CONSULTA: A API do Meta é a ÚNICA fonte confiável de dados
2. DADOS EM TEMPO REAL: Sempre use dados consultados diretamente da API, nunca dados em cache
3. CONTEXTO DO CLIENTE: Se a conta estiver vinculada a um cliente, use as informações e documentos do cliente para personalizar análises e recomendações
4. ANÁLISE: Forneça insights valiosos baseados APENAS em dados reais e atualizados da API
5. RECOMENDAÇÕES: Sugira melhorias baseadas nos dados reais consultados
6. IDIOMA: Use português brasileiro em todas as respostas
7. PRECISÃO: Seja objetivo, prático e baseado em dados reais

⚠️ REGRA DE OURO: 
Quando dados da API do Meta forem fornecidos na seção "DADOS CONSULTADOS EM TEMPO REAL", 
use APENAS esses dados. Ignore qualquer informação anterior ou em cache.

${routinePrompt}
${routineBrief?.error ? `RASTREAMENTO: ${routineBrief.error}` : ''}
${routineContext?.clientName ? `A Rotina aberta é de ${routineContext.clientName}. A pesquisa pedida é ${searchScope === 'all' ? 'de todo o Rastreamento' : 'só das campanhas da tela'}, de ${searchSince || routineContext.weekStart} a ${searchUntil || ''}. Use esse período, não outro.` : 'Se não houver cliente da Rotina no contexto, peça para abrir a ficha do cliente na Rotina semanal.'}`;

      // SEMPRE fazer consulta em tempo real à API do Meta quando houver conta selecionada
      // A API do Meta é a base de consulta principal
      let enhancedUserMessage = userMessage;
      let shouldQueryMeta = false;
      
      // Se tiver conta selecionada e Meta conectado, SEMPRE consultar em tempo real
      if (selectedAccount && selectedAccount !== 'all' && metaConnectionStatus === 'connected' && !routineBrief) {
        shouldQueryMeta = true;
        
        // Adicionar instrução para usar dados em tempo real
        enhancedUserMessage = `${userMessage}\n\n[IMPORTANTE: Use APENAS dados consultados em tempo real da API do Meta. A base de consulta é a própria API do Meta, não dados em cache ou contexto anterior. Sempre busque dados atualizados para responder.]`;
      }

      // SEMPRE fazer consulta em tempo real à API do Meta quando houver conta selecionada
      // A API do Meta é a BASE DE CONSULTA PRINCIPAL
      let realTimeDataContext = '';
      if (shouldQueryMeta && selectedAccount && selectedAccount !== 'all') {
        setWorkNote('Consultando a conta na Meta…');
        try {
          // Buscar dados atualizados em tempo real da API do Meta
          // Esta é a fonte principal de dados, não o contexto estático
          const [insightsResponse, campaignsResponse] = await Promise.all([
            supabase.functions.invoke('meta-ads-api', {
              body: {
                action: 'get-account-insights',
                adAccountId: selectedAccount,
                time_range: {
                  since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  until: new Date().toISOString().split('T')[0],
                },
              },
            }).catch((err) => {
              console.warn('Erro ao buscar insights:', err);
              return { data: null, error: err };
            }),
            supabase.functions.invoke('meta-ads-api', {
              body: {
                action: 'get-campaigns',
                adAccountId: selectedAccount,
              },
            }).catch((err) => {
              console.warn('Erro ao buscar campanhas:', err);
              return { data: null, error: err };
            }),
          ]);

          // Preparar contexto com dados em tempo real da API
          const realTimeData = {
            accountId: selectedAccount,
            accountName: metaAccounts.find(acc => acc.id === selectedAccount)?.name || 'N/A',
            insights: insightsResponse.data?.insights || null,
            campaigns: campaignsResponse.data?.campaigns || null,
            timestamp: new Date().toLocaleString('pt-BR'),
            source: 'API_META_REAL_TIME',
          };

          realTimeDataContext = `\n\n═══════════════════════════════════════════════════════════
📊 DADOS CONSULTADOS EM TEMPO REAL DA API DO META
═══════════════════════════════════════════════════════════
Conta: ${realTimeData.accountName} (${realTimeData.accountId})
Data/Hora da Consulta: ${realTimeData.timestamp}
Fonte: API Meta Ads (dados atualizados em tempo real)

${realTimeData.insights ? `INSIGHTS DA CONTA:\n${JSON.stringify(realTimeData.insights, null, 2)}\n` : ''}
${realTimeData.campaigns ? `CAMPANHAS ATIVAS:\n${JSON.stringify(realTimeData.campaigns, null, 2)}\n` : ''}

⚠️ INSTRUÇÃO CRÍTICA: 
Estes são os dados OFICIAIS e ATUALIZADOS da API do Meta.
Use APENAS estes dados para responder ao usuário.
IGNORE qualquer informação anterior ou em cache.
A API do Meta é a ÚNICA fonte confiável de dados.
═══════════════════════════════════════════════════════════`;
        } catch (queryError) {
          console.warn('Erro ao consultar API em tempo real:', queryError);
          realTimeDataContext = '\n\n[⚠️ AVISO: Não foi possível consultar dados em tempo real da API do Meta. Tente novamente ou use os dados do contexto disponível.]';
        }
        setWorkNote('Pensando na resposta…');
      }

      // Adicionar resultados da pesquisa do Google se houver
      let googleSearchContext = '';
      if (searchResults.length > 0 && isDeepResearch) {
        googleSearchContext = formatSearchResults(searchResults);
        // Adicionar nota sobre pesquisa ativa
        googleSearchContext += '\n\n🔍 DEEP RESEARCH ATIVO: O usuário ativou pesquisa na web. Combine os dados da API do Meta com essas informações da web para fornecer uma análise completa e atualizada.';
      }

      const finalSystemMessage = systemMessage + realTimeDataContext + googleSearchContext;

      const { data, error } = await supabase.functions.invoke('openrouter-chat', {
        body: {
          messages: [
            { role: 'system', content: finalSystemMessage },
            ...messages.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: enhancedUserMessage },
          ],
          model: selectedModel,
          stream: true,
          temperature: 0.7,
        },
      });

      if (error) throw error;

      // Processar streaming
      let fullResponse = '';
      if (data && typeof data === 'object' && 'body' in data) {
        const reader = data.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              if (jsonStr === '[DONE]') {
                // Streaming terminou
                if (fullResponse) {
                  const aiMessage = {
                    role: 'assistant',
                    content: fullResponse,
                    brief: routineBrief && !routineBrief.error ? routineBrief : null,
                  timestamp: new Date().toISOString(),
                };
                const finalMessages = [...messages, newUserMessage, aiMessage];
                setMessages(finalMessages);
                setCurrentAIMessage('');
                
                // Salvar conversa após resposta do assistente
                saveConversation(finalMessages);
              }
              continue;
              }

              try {
                const chunk = JSON.parse(jsonStr);
                if (chunk.choices?.[0]?.delta?.content) {
                  fullResponse += chunk.choices[0].delta.content;
                  setWorkNote('Escrevendo a resposta…');
                  setCurrentAIMessage(fullResponse);
                }
              } catch (e) {
                // Ignora erros de parsing
              }
            }
          }
        }
      } else if (data?.content) {
        // Resposta não-streaming
        const aiMessage = {
          role: 'assistant',
          content: data.content,
          brief: routineBrief && !routineBrief.error ? routineBrief : null,
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...messages, newUserMessage, aiMessage];
        setMessages(finalMessages);
        
        // Salvar conversa após resposta do assistente
        saveConversation(finalMessages);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      if (routineBrief && !routineBrief.error) {
        const aiMessage = {
          role: 'assistant',
          content: 'O modelo não respondeu. Os números do Rastreamento estão abaixo. Escolha outro modelo no topo e pergunte de novo se quiser o texto.',
          brief: routineBrief,
          timestamp: new Date().toISOString(),
        };
        setMessages([...messages, newUserMessage, aiMessage]);
      }
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
    } finally {
      setWorkNote('');
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, selectedModel, selectedAccount, metaAccounts, linkedClient, clientDocuments, isDeepResearch, searchResults, buildTrafficContext, metaConnectionStatus, toast, saveConversation, routineContext, searchSince, searchUntil, searchScope]);

  // Enter para enviar (Shift+Enter para nova linha)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Limpar mensagens quando fechar (mas não limpar se estiver em rota dedicada)
  useEffect(() => {
    if (!open && !initialConversationId) {
      setMessages([]);
      setCurrentAIMessage('');
      setInput('');
      setIsDeepResearch(false);
      setSearchResults([]);
      setIsExpanded(false);
      setCurrentConversationId(null);
    }
  }, [open, initialConversationId]);

  const leadFichaDialog = (
    <RastreamentoLeadFicha
      open={Boolean(leadFicha)}
      onOpenChange={(next) => { if (!next) setLeadFicha(null); }}
      clienteId={routineContext?.clientId || ''}
      contact={leadFicha}
      lead={null}
    />
  );

  // Se expandido, renderizar como modal fixo centralizado (fora do workbench)
  if (isExpanded && open) {
    const expandedUi = (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div className="w-full h-full max-w-7xl mx-auto bg-background border shadow-lg flex flex-col">
          {/* Header */}
          <div className="border-b p-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Assistente de Tráfego
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Análise da fila do Hoje e da conta no Painel
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(!showSettings)}
                  className="h-8 w-8"
                  title="Configurações"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(!showHistory)}
                  className="h-8 w-8"
                  title="Histórico de conversas"
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="h-8 w-8"
                  title="Minimizar"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsExpanded(false);
                    onOpenChange(false);
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={metaConnectionStatus === 'connected' ? 'default' : 'secondary'}>
                Meta: {metaConnectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </Badge>
              <Badge variant="outline">Fila do dia: aba Hoje</Badge>
            </div>

            {/* Histórico de Conversas (modo expandido) */}
            {showHistory && (
              <div className="mt-4 p-3 bg-muted rounded-lg border space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Histórico (últimas 3)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewConversation}
                    className="h-6 text-xs"
                  >
                    Nova conversa
                  </Button>
                </div>
                {conversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhuma conversa anterior
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group p-2 rounded-md cursor-pointer transition-colors ${
                        currentConversationId === conv.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-background border border-transparent'
                      }`}
                      onClick={() => loadConversation(conv.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {conv.title || 'Sem título'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(conv.updated_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          title="Deletar conversa"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Painel de Configurações */}
            {showSettings && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-4 border">
                <div className="space-y-2">
                  <Label htmlFor="model-selector" className="text-sm font-medium">
                    Modelo de IA
                  </Label>
                  <ModelSelector
                    selectedModel={selectedModel}
                    availableModels={availableModels}
                    onModelChange={(id) => { modelPickedRef.current = true; setSelectedModel(id); }}
                    compact
                    className="w-full"
                  />
                </div>
                
                {metaConnectionStatus === 'connected' && (
                  <div className="space-y-2">
                    <Label htmlFor="account-selector" className="text-sm font-medium">
                      Conta de Anúncios
                    </Label>
                    {linkedClient && (
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                          📎 Vinculada ao cliente: {linkedClient.empresa}
                        </p>
                        {clientDocuments.length > 0 && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            {clientDocuments.length} documento{clientDocuments.length !== 1 ? 's' : ''} disponível{clientDocuments.length !== 1 ? 'eis' : ''} no contexto
                          </p>
                        )}
                      </div>
                    )}
                    <Select
                      value={selectedAccount}
                      onValueChange={setSelectedAccount}
                      disabled={loadingAccounts}
                    >
                      <SelectTrigger id="account-selector" className="w-full">
                        <SelectValue>
                          {loadingAccounts ? (
                            'Carregando...'
                          ) : selectedAccount === 'all' ? (
                            'Todas as contas'
                          ) : (
                            metaAccounts.find(acc => acc.id === selectedAccount)?.name || 
                            metaAccounts.find(acc => acc.id === selectedAccount)?.id ||
                            'Selecione uma conta'
                          )
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as contas</SelectItem>
                      {metaAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{account.name || account.id}</span>
                            {account.id && (
                              <span className="text-xs text-muted-foreground">
                                ID: {account.id}
                              </span>
                            )}
                            {account.currency && (
                              <span className="text-xs text-muted-foreground">
                                {account.currency}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {metaAccounts.length === 0 && !loadingAccounts && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma conta encontrada. Verifique a conexão com o Meta.
                    </p>
                  )}
                </div>
                )}
              </div>
            )}
          </div>

          {/* Conteúdo centralizado */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-base">
                    Olá! Sou seu assistente de tráfego pago.
                  </p>
                  <p className="text-sm mt-2">
                    Posso olhar a fila do Hoje, o Painel da conta e o que a Meta está mostrando.
                  </p>
                  <p className="text-xs mt-4 text-muted-foreground">
                    Exemplos: "O que fazer agora?", "Quem está acima do teto?", "Como vincular a Meta?"
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(msg.content),
                        }}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {isGenerating ? <ChatWorkStatus note={workNote || 'Pensando na resposta…'} /> : null}
              {isGenerating && currentAIMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg p-4 bg-muted">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(currentAIMessage),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              {isDeepResearch && searchResults.length > 0 && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Deep Research Ativo ({searchResults.length} resultados)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsDeepResearch(false);
                        setSearchResults([]);
                      }}
                      className="h-6 px-2 ml-auto"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 max-h-20 overflow-y-auto">
                    {searchResults.slice(0, 3).map((result, idx) => (
                      <div key={idx} className="truncate">
                        • {result.title}
                      </div>
                    ))}
                    {searchResults.length > 3 && (
                      <div className="text-blue-600 dark:text-blue-400">
                        +{searchResults.length - 3} mais resultados...
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite sua pergunta sobre tráfego pago..."
                    className="min-h-[60px] resize-none"
                    disabled={isGenerating || isSearching}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleDeepResearch}
                      disabled={!input.trim() || isSearching || isGenerating}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Pesquisando...
                        </>
                      ) : (
                        <>
                          <Search className="h-3 w-3" />
                          Deep Research
                        </>
                      )}
                    </Button>
                    {isDeepResearch && (
                      <Badge variant="secondary" className="text-xs">
                        Pesquisa ativa
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isGenerating}
                  size="icon"
                  className="h-[60px] w-[60px]"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
    return (
      <>
        <aside className="planeje-trafego-assistant-dock" aria-hidden style={{ visibility: 'hidden', pointerEvents: 'none' }} />
        {typeof document !== 'undefined' ? createPortal(expandedUi, document.body) : null}
        {leadFichaDialog}
      </>
    );
  }

  if (!open) return null;

  const screenWeek = routineWeekRange(routineContext?.weekStart);
  const periodMatchesScreen = Boolean(screenWeek && searchSince === screenWeek.since && searchUntil === screenWeek.until);

  // Terceiro quadro ao lado do conteúdo (sem overlay)
  return (
    <>
    <aside
      className="planeje-trafego-assistant-dock bg-background border-border"
      role="complementary"
      aria-label="Assistente de Tráfego"
    >
      <div className="planeje-trafego-assistant-dock-header border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold leading-none tracking-tight flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Assistente de Tráfego
              </h2>
              <p className="planeje-trafego-assistant-dock-sub text-sm text-muted-foreground mt-1">
                Análise da fila do Hoje e da conta no Painel
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory(!showHistory)}
                className="h-8 w-8"
                title="Histórico de conversas"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="h-8 w-8"
                title="Configurações"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-2">
            <ModelSelector
              selectedModel={selectedModel}
              availableModels={availableModels}
              onModelChange={(id) => { modelPickedRef.current = true; setSelectedModel(id); }}
              compact
              className="w-full"
            />
            {openRouterReady ? null : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Claude e os outros modelos entram quando a chave do OpenRouter estiver em Configurações → Integrações.
              </p>
            )}
          </div>
          {routineContext?.clientId ? (
            <div className="routine-search">
              <div className="routine-search-dates">
                <label>De
                  <DayField value={searchSince} onChange={setSearchSince} ariaLabel="Data inicial, dia mês ano" />
                </label>
                <label>Até
                  <DayField value={searchUntil} onChange={setSearchUntil} ariaLabel="Data final, dia mês ano" />
                </label>
              </div>
              <div className="routine-search-scope" role="group" aria-label="O que pesquisar">
                <button type="button" className={searchScope === 'sheet' ? 'is-on' : ''} onClick={() => setSearchScope('sheet')}>Só o que está na tela</button>
                <button type="button" className={searchScope === 'all' ? 'is-on' : ''} onClick={() => setSearchScope('all')}>Pesquisar tudo</button>
              </div>
              {periodMatchesScreen ? (
                <p>Semana que está na tela.</p>
              ) : (
                <button type="button" className="routine-search-reset" onClick={() => { setSearchSince(screenWeek?.since || ''); setSearchUntil(screenWeek?.until || ''); }}>
                  Usar a semana da tela{screenWeek ? ` (${screenWeek.label})` : ''}
                </button>
              )}
            </div>
          ) : null}
          {routineContext?.clientId ? null : (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={metaConnectionStatus === 'connected' ? 'default' : 'secondary'}>
              Meta: {metaConnectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
            </Badge>
            <Badge variant="outline">Fila do dia: aba Hoje</Badge>
          </div>
          )}

          {/* Histórico de Conversas */}
          {showHistory && (
            <div className="mt-4 p-3 bg-muted rounded-lg border space-y-2 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Histórico (últimas 3)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewConversation}
                  className="h-6 text-xs"
                >
                  Nova conversa
                </Button>
              </div>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhuma conversa anterior
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group p-2 rounded-md cursor-pointer transition-colors ${
                      currentConversationId === conv.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-background border border-transparent'
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {conv.title || 'Sem título'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(conv.updated_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        title="Deletar conversa"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {/* Painel de Configurações */}
          {showSettings && (
            <div className="mt-4 p-4 bg-muted rounded-lg space-y-4 border">
              <div className="space-y-2">
                <Label htmlFor="model-selector" className="text-sm font-medium">
                  Modelo de IA
                </Label>
                <ModelSelector
                  selectedModel={selectedModel}
                  availableModels={availableModels}
                  onModelChange={(id) => { modelPickedRef.current = true; setSelectedModel(id); }}
              compact
                  className="w-full"
                />
              </div>
              
              {metaConnectionStatus === 'connected' && (
                <div className="space-y-2">
                  <Label htmlFor="account-selector" className="text-sm font-medium">
                    Conta de Anúncios
                  </Label>
                  {linkedClient && (
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                        📎 Vinculada ao cliente: {linkedClient.empresa}
                      </p>
                      {clientDocuments.length > 0 && (
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {clientDocuments.length} documento{clientDocuments.length !== 1 ? 's' : ''} disponível{clientDocuments.length !== 1 ? 'eis' : ''} no contexto
                        </p>
                      )}
                    </div>
                  )}
                  <Select
                    value={selectedAccount}
                    onValueChange={setSelectedAccount}
                    disabled={loadingAccounts}
                  >
                    <SelectTrigger id="account-selector" className="w-full">
                      <SelectValue>
                        {loadingAccounts ? (
                          'Carregando...'
                        ) : selectedAccount === 'all' ? (
                          'Todas as contas'
                        ) : (
                          metaAccounts.find(acc => acc.id === selectedAccount)?.name || 
                          metaAccounts.find(acc => acc.id === selectedAccount)?.id ||
                          'Selecione uma conta'
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {metaAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{account.name || account.id}</span>
                          {account.id && (
                            <span className="text-xs text-muted-foreground">
                              ID: {account.id}
                            </span>
                          )}
                          {account.currency && (
                            <span className="text-xs text-muted-foreground">
                              {account.currency}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {metaAccounts.length === 0 && !loadingAccounts && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma conta encontrada. Verifique a conexão com o Meta.
                  </p>
                )}
              </div>
              )}
            </div>
          )}
      </div>

        <ScrollArea ref={scrollAreaRef} className="planeje-trafego-assistant-dock-scroll flex-1 min-h-0 p-3">
          <div className="space-y-3">
            {messages.length === 0 && (
              <div className={routineContext?.clientId ? 'routine-empty' : 'text-center py-4 text-muted-foreground'}>
                {routineContext?.clientId ? null : <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />}
                <p className="text-sm">
                  Olá! Sou seu assistente de tráfego pago.
                </p>
                <p className="text-sm mt-2">
                  {routineContext?.clientName
                    ? `Estou na Rotina de ${routineContext.clientName}. A pesquisa usa ${searchSince && searchUntil ? `${displayDate(searchSince)} a ${displayDate(searchUntil)}` : 'o período escolhido acima'}${searchScope === 'all' ? ', em todo o Rastreamento' : ', só nas campanhas da tela'}.`
                    : 'Abra um cliente na Rotina semanal para eu ler agendamentos, mensagens e vendas.'}
                </p>
                {routineContext?.clientId ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {['Quantos agendamentos teve neste período?', 'Quem agendou, em que data, e quem comprou?', 'Quantas mensagens por campanha e conjunto?'].map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        className="routine-hint"
                        disabled={isGenerating}
                        onClick={() => handleSend(hint)}
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  } ${msg.brief ? 'routine-brief-bubble' : ''}`}
                >
                  {msg.role === 'assistant' ? (
                    <>
                    {msg.brief && msg.content ? (
                    <div
                      className="routine-brief-read prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                    />
                    ) : null}
                    {msg.brief ? null : (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(msg.content),
                      }}
                    />
                    )}
                    {msg.brief ? <RoutineBriefCards brief={msg.brief} onOpenLead={openLeadConversation} /> : null}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isGenerating ? <ChatWorkStatus note={workNote || 'Pensando na resposta…'} /> : null}
            {isGenerating && currentAIMessage && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(currentAIMessage),
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-3 py-2.5 flex-shrink-0">
          {isDeepResearch && searchResults.length > 0 && (
            <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                  Deep Research ({searchResults.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsDeepResearch(false);
                    setSearchResults([]);
                  }}
                  className="h-6 px-2 ml-auto"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={routineContext?.clientId ? 'Pergunte sobre este período…' : 'Digite sua pergunta sobre tráfego pago...'}
                className="min-h-[44px] max-h-[88px] resize-none"
                disabled={isGenerating || isSearching}
              />
              {routineContext?.clientId ? null : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDeepResearch}
                  disabled={!input.trim() || isSearching || isGenerating}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-7 text-xs"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Pesquisando...
                    </>
                  ) : (
                    <>
                      <Search className="h-3 w-3" />
                      Deep Research
                    </>
                  )}
                </Button>
                {isDeepResearch && (
                  <Badge variant="secondary" className="text-xs">
                    Pesquisa ativa
                  </Badge>
                )}
              </div>
              )}
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              size="icon"
              className="h-11 w-11 shrink-0"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
    </aside>
    {leadFichaDialog}
    </>
  );
};

function ChatWorkStatus({ note }) {
  return (
    <div className="routine-work" role="status" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      <span>{note}</span>
    </div>
  );
}

function RoutineBriefCards({ brief, onOpenLead }) {
  if (!brief?.found && brief?.found !== 0) return null;
  const fill = brief.fillCount ?? brief.scheduled ?? 0;
  const apply = () => {
    window.dispatchEvent(new CustomEvent('planeje-routine-apply-results', {
      detail: {
        clientId: brief.clientId,
        weekStart: brief.since,
        results: String(fill),
        contacts: String(brief.found),
      },
    }));
  };
  const groups = brief.groups || [];
  return (
    <div className="routine-brief">
      <p className="routine-brief-totals">{brief.weekLabel ? `${brief.weekLabel}. ` : ''}{brief.summary || `${brief.found} contatos`}</p>
      {brief.canApply ? (
        <button type="button" className="routine-brief-apply" onClick={apply}>
          Colocar {fill} em {brief.resultLabel || 'Agendamentos'}
        </button>
      ) : null}
      {groups.map((group) => {
        const booked = (group.leads || []).filter((lead) => lead.scheduled || lead.bookedInChat);
        const shown = group.onSheet === false ? [] : booked.slice(0, 20);
        const rest = group.onSheet === false ? 0 : booked.length - shown.length;
        const unread = (group.leads || []).length - booked.length;
        return (
          <section key={`${group.campaign}-${group.adset}`} className="routine-brief-group">
            <p className="routine-brief-title">
              <strong>{group.campaign}</strong>
              {group.adset ? ` / ${group.adset}` : ''}
              {group.spend !== '' && group.spend != null ? ` · gasto ${group.spend}` : ''}
            </p>
            <p className="routine-brief-meta">
              {group.onSheet === false
                ? `${group.recognized} contatos sem campanha na ficha. Não entram no número.`
                : `${group.recognized} mensagens reconhecidas · ${group.appointments} agendaram`}
            </p>
            {group.appointments === 0 ? <p className="routine-brief-set">Não teve agendamento.</p> : null}
            <ul className="routine-brief-leads">
              {shown.filter((lead) => group.onSheet === false ? false : (lead.scheduled || lead.bookedInChat)).map((lead) => (
                <li key={lead.id || lead.phone}>
                  <strong className="routine-brief-name">{lead.name}</strong>
                  <span className="routine-brief-phone">{lead.phone || 'sem telefone'}</span>
                  <span className="routine-brief-mark">
                    {lead.scheduled ? `Agendado no CRM${lead.appointmentDate ? ` ${displayDate(lead.appointmentDate)}` : ''}` : (lead.bookedInChat ? 'Agendou na conversa' : 'Não agendou')}
                    {lead.sold ? ' · Venda' : ''}
                  </span>
                  {lead.snippets?.[0] ? <em className="routine-brief-quote">{lead.snippets[0]}</em> : null}
                  {lead.id || lead.href ? (
                    <button type="button" className="routine-brief-open" onClick={() => onOpenLead(lead)}>Abrir conversa</button>
                  ) : null}
                </li>
              ))}
            </ul>
            {rest > 0 ? <p className="routine-brief-set">E mais {rest} que agendaram neste conjunto.</p> : null}
            {group.onSheet === false ? null : (unread > 0 ? <p className="routine-brief-set">{unread} conversas lidas não marcaram horário.</p> : null)}
          </section>
        );
      })}
    </div>
  );
}

export default TrafficChatDrawer;
