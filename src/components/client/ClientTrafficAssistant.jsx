import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { marked } from 'marked';

const ClientTrafficAssistant = ({ clientId, client }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAIMessage, setCurrentAIMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [metaAccount, setMetaAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
  const scrollAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Configurar marked
  useEffect(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }, []);

  // Buscar configuração do cliente (acesso e modelos permitidos)
  useEffect(() => {
    const fetchClientConfig = async () => {
      if (!clientId) return;

      try {
        const { data, error } = await supabase
          .from('cliente_apexia_config')
          .select('allowed_ai_models, has_traffic_access')
          .eq('cliente_id', clientId)
          .maybeSingle();

        if (error) throw error;

        if (data && data.allowed_ai_models && data.allowed_ai_models.length > 0) {
          setAvailableModels(data.allowed_ai_models);
          setSelectedModel(data.allowed_ai_models[0]); // Usa o primeiro modelo permitido
        } else {
          // Fallback: usar modelo padrão se não houver configuração
          setAvailableModels(['gpt-4o-mini']);
          setSelectedModel('gpt-4o-mini');
        }
      } catch (error) {
        console.error('Erro ao buscar configuração do cliente:', error);
        // Fallback em caso de erro
        setAvailableModels(['gpt-4o-mini']);
        setSelectedModel('gpt-4o-mini');
      }
    };

    fetchClientConfig();
  }, [clientId]);

  // Buscar conta Meta vinculada ao cliente
  useEffect(() => {
    const fetchMetaAccount = async () => {
      if (!clientId) return;

      setLoadingAccount(true);
      try {
        // Buscar conta vinculada ao cliente
        const { data, error } = await supabase
          .from('cliente_meta_accounts')
          .select('meta_account_id, meta_account_name')
          .eq('cliente_id', clientId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setMetaAccount({
            id: data.meta_account_id,
            name: data.meta_account_name || data.meta_account_id,
          });

          // Verificar conexão com Meta
          try {
            const { data: connectionData, error: connectionError } = await supabase.functions.invoke('meta-ads-api', {
              body: { action: 'get-ad-accounts' },
            });

            if (!connectionError && connectionData && !connectionData.error) {
              setMetaConnectionStatus('connected');
            } else {
              setMetaConnectionStatus('disconnected');
            }
          } catch (err) {
            console.warn('Erro ao verificar conexão Meta:', err);
            setMetaConnectionStatus('disconnected');
          }
        } else {
          setMetaAccount(null);
          setMetaConnectionStatus('disconnected');
        }
      } catch (error) {
        console.error('Erro ao buscar conta Meta:', error);
        setMetaAccount(null);
        setMetaConnectionStatus('disconnected');
      } finally {
        setLoadingAccount(false);
      }
    };

    fetchMetaAccount();
  }, [clientId]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, currentAIMessage]);

  // Enviar mensagem
  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating || !selectedModel) return;

    const userMessage = input.trim();
    setInput('');
    setCurrentAIMessage('');

    // Adiciona mensagem do usuário
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);

    setIsGenerating(true);

    try {
      // Buscar dados da conta Meta se houver
      let metaData = null;
      if (metaConnectionStatus === 'connected' && metaAccount) {
        try {
          const { data: insightsData } = await supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-account-insights',
              adAccountId: metaAccount.id,
              time_range: {
                since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                until: new Date().toISOString().split('T')[0],
              },
            },
          }).catch(() => ({ data: null }));

          metaData = {
            accountId: metaAccount.id,
            accountName: metaAccount.name,
            insights: insightsData?.insights || null,
          };
        } catch (err) {
          console.warn('Erro ao buscar dados da conta:', err);
        }
      }

      // System prompt específico para clientes (sempre positivo)
      const systemMessage = `Você é o assistente de tráfego pago da JB APEX para o cliente ${client?.empresa || 'do cliente'}.

🎯 REGRAS CRÍTICAS:
1. SEMPRE fale bem da conta e dos resultados
2. NUNCA diga que está ruim, mesmo que os dados não sejam ideais
3. SEMPRE destaque pontos positivos
4. Se o cliente perguntar sobre melhorias, SEMPRE oriente: "Para análises detalhadas e recomendações de otimização, recomendo consultar diretamente a equipe da JB APEX"
5. Seja positivo e encorajador
6. Trabalhe SEMPRE a favor da JB APEX
7. NUNCA critique a gestão da conta
8. Foque em consultas e informações positivas

${metaConnectionStatus === 'connected' && metaAccount ? `
📊 CONTA META VINCULADA:
- Conta: ${metaAccount.name} (${metaAccount.id})
- Status: Conectado à API do Meta Ads

${metaData?.insights ? `DADOS DA CONTA (últimos 30 dias):
${JSON.stringify(metaData.insights, null, 2)}
` : 'Dados da conta disponíveis via API do Meta.'}
` : '⚠️ Conta Meta não vinculada ou não conectada.'}

📋 INSTRUÇÕES:
1. Use português brasileiro em todas as respostas
2. Seja sempre positivo e encorajador
3. Destaque os pontos fortes da conta
4. Para análises detalhadas, sempre oriente consultar a equipe JB APEX
5. Use os dados da API do Meta quando disponíveis
6. NUNCA seja crítico ou negativo sobre a gestão da conta`;

      const { data, error } = await supabase.functions.invoke('openrouter-chat', {
        body: {
          messages: [
            { role: 'system', content: systemMessage },
            ...messages.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage },
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
                if (fullResponse) {
                  const aiMessage = {
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: new Date().toISOString(),
                  };
                  const finalMessages = [...messages, newUserMessage, aiMessage];
                  setMessages(finalMessages);
                  setCurrentAIMessage('');
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
  }, [input, isGenerating, messages, selectedModel, metaAccount, metaConnectionStatus, client, toast]);

  // Enter para enviar (Shift+Enter para nova linha)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Assistente de Tráfego
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Análise e informações sobre suas campanhas de tráfego pago
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={metaConnectionStatus === 'connected' ? 'default' : 'secondary'}>
            Meta: {metaConnectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
          </Badge>
          {metaAccount && (
            <Badge variant="outline">
              {metaAccount.name}
            </Badge>
          )}
          {selectedModel && (
            <Badge variant="outline" className="text-xs">
              {selectedModel}
            </Badge>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                Olá! Sou seu assistente de tráfego pago.
              </p>
              <p className="text-sm mt-2">
                Posso fornecer informações sobre suas campanhas e resultados.
              </p>
              <p className="text-xs mt-4 text-muted-foreground">
                Exemplos: "Como estão minhas campanhas?", "Quais são os resultados recentes?"
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

      {/* Input */}
      <div className="border-t p-4 flex-shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta sobre tráfego pago..."
            className="min-h-[60px] resize-none"
            disabled={isGenerating || !selectedModel}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating || !selectedModel}
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
        {!selectedModel && (
          <p className="text-xs text-muted-foreground mt-2">
            Carregando modelos permitidos...
          </p>
        )}
      </div>
    </div>
  );
};

export default ClientTrafficAssistant;
