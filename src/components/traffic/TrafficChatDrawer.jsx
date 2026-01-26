import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, X, Loader2, Settings2, Search, Globe, Maximize2, Minimize2, History, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getDefaultModelCached, getAvailableModelsCached } from '@/lib/assistantProjectConfig';
import ModelSelector from '@/components/chat/ModelSelector';
import { searchGoogle, formatSearchResults } from '@/lib/googleSearch';
import { marked } from 'marked';

const TrafficChatDrawer = ({ open, onOpenChange, campaigns = [], metaConnectionStatus = 'disconnected', conversationId: initialConversationId = null }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Carregar modelo padrão e modelos disponíveis
  useEffect(() => {
    const loadModel = async () => {
      const [defaultModel, models] = await Promise.all([
        getDefaultModelCached(),
        getAvailableModelsCached(),
      ]);
      if (defaultModel) {
        setSelectedModel(defaultModel);
      }
      if (models && models.length > 0) {
        setAvailableModels(models);
      }
    };
    loadModel();
  }, []);

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
          const errorMessage = typeof data.error === 'string' 
            ? data.error 
            : data.error?.message || JSON.stringify(data.error);
          throw new Error(errorMessage);
        }
        
        if (data?.adAccounts && Array.isArray(data.adAccounts)) {
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
        console.error('Erro ao buscar contas do Meta:', error);
        toast({
          title: 'Erro ao buscar contas',
          description: errorMessage,
          variant: 'destructive',
        });
        setMetaAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, [open, metaConnectionStatus, toast]);

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
  }, [messages, currentAIMessage]);

  // Construir contexto sobre tráfego pago
  const buildTrafficContext = useCallback(() => {
    const context = {
      metaConnectionStatus,
      totalCampaigns: campaigns.length,
      campaigns: campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name || campaign.campaign_name,
        status: campaign.status,
        client: campaign.clientes?.empresa || 'N/A',
        assignee: campaign.profiles?.full_name || 'N/A',
        budget: campaign.budget,
        objective: campaign.objective,
        created_at: campaign.created_at,
      })),
      campaignsByStatus: campaigns.reduce((acc, camp) => {
        acc[camp.status] = (acc[camp.status] || 0) + 1;
        return acc;
      }, {}),
    };

    return JSON.stringify(context, null, 2);
  }, [campaigns, metaConnectionStatus]);

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
  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage = input.trim();
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
use APENAS esses dados. Ignore qualquer informação anterior ou em cache.`;

      // SEMPRE fazer consulta em tempo real à API do Meta quando houver conta selecionada
      // A API do Meta é a base de consulta principal
      let enhancedUserMessage = userMessage;
      let shouldQueryMeta = false;
      
      // Se tiver conta selecionada e Meta conectado, SEMPRE consultar em tempo real
      if (selectedAccount && selectedAccount !== 'all' && metaConnectionStatus === 'connected') {
        shouldQueryMeta = true;
        
        // Adicionar instrução para usar dados em tempo real
        enhancedUserMessage = `${userMessage}\n\n[IMPORTANTE: Use APENAS dados consultados em tempo real da API do Meta. A base de consulta é a própria API do Meta, não dados em cache ou contexto anterior. Sempre busque dados atualizados para responder.]`;
      }

      // SEMPRE fazer consulta em tempo real à API do Meta quando houver conta selecionada
      // A API do Meta é a BASE DE CONSULTA PRINCIPAL
      let realTimeDataContext = '';
      if (shouldQueryMeta && selectedAccount && selectedAccount !== 'all') {
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
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...messages, newUserMessage, aiMessage];
        setMessages(finalMessages);
        
        // Salvar conversa após resposta do assistente
        saveConversation(finalMessages);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, selectedModel, selectedAccount, metaAccounts, linkedClient, clientDocuments, isDeepResearch, searchResults, buildTrafficContext, metaConnectionStatus, toast, saveConversation]);

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

  // Se expandido, renderizar como modal fixo centralizado
  if (isExpanded && open) {
    return (
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
                  Análise e recomendações sobre suas campanhas
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
              <Badge variant="outline">
                {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}
              </Badge>
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
                    onModelChange={setSelectedModel}
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
                    Posso analisar suas campanhas, fornecer insights e recomendações.
                  </p>
                  <p className="text-xs mt-4 text-muted-foreground">
                    Exemplos: "Analise minhas campanhas", "Como melhorar o ROI?", "Quais campanhas precisam de atenção?"
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

              {isGenerating && currentAIMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg p-4 bg-muted">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(currentAIMessage),
                      }}
                    />
                    <Loader2 className="h-4 w-4 animate-spin mt-2 inline-block" />
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
  }

  // Drawer normal (lateral) - divide a tela como TaskDetail
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-2xl ml-auto h-full">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Assistente de Tráfego
              </DrawerTitle>
              <DrawerDescription className="mt-1">
                Análise e recomendações sobre suas campanhas
              </DrawerDescription>
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
                onClick={() => setIsExpanded(true)}
                className="h-8 w-8"
                title="Expandir para tela inteira"
              >
                <Maximize2 className="h-4 w-4" />
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
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={metaConnectionStatus === 'connected' ? 'default' : 'secondary'}>
              Meta: {metaConnectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
            </Badge>
            <Badge variant="outline">
              {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}
            </Badge>
          </div>

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
                  onModelChange={setSelectedModel}
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
        </DrawerHeader>

        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">
                  Olá! Sou seu assistente de tráfego pago.
                </p>
                <p className="text-sm mt-2">
                  Posso analisar suas campanhas, fornecer insights e recomendações.
                </p>
                <p className="text-xs mt-4 text-muted-foreground">
                  Exemplos: "Analise minhas campanhas", "Como melhorar o ROI?", "Quais campanhas precisam de atenção?"
                </p>
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

            {isGenerating && currentAIMessage && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(currentAIMessage),
                    }}
                  />
                  <Loader2 className="h-4 w-4 animate-spin mt-2 inline-block" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
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
      </DrawerContent>
    </Drawer>
  );
};

export default TrafficChatDrawer;
