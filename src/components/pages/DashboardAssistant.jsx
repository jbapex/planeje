import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Send, Loader2, Mic, X, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const DashboardAssistant = ({ overdueTasks, todayTasks, upcomingTasks, alerts, suggestions, stats }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAIMessage, setCurrentAIMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollAreaRef = useRef(null);
  const aiMessageContainerRef = useRef(null);
  const { toast } = useToast();
  const { profile, getOpenAIKey } = useAuth();

  const generateInitialSummary = useCallback(() => {
    let summary = `Olá! 👋 Sou seu assistente do dashboard. Aqui está um resumo do que precisa de atenção:\n\n`;
    
    if (overdueTasks && overdueTasks.length > 0) {
      summary += `🚨 **Tarefas Atrasadas (${overdueTasks.length}):**\n`;
      overdueTasks.slice(0, 5).forEach((task, index) => {
        const daysLate = task.due_date ? Math.floor((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24)) : 0;
        summary += `${index + 1}. ${task.title} - ${daysLate} dia(s) atrasado\n`;
      });
      summary += `\n`;
    }

    if (todayTasks && todayTasks.length > 0) {
      summary += `📅 **Para Hoje (${todayTasks.length}):**\n`;
      todayTasks.slice(0, 5).forEach((task, index) => {
        summary += `${index + 1}. ${task.title}\n`;
      });
      summary += `\n`;
    }

    if (upcomingTasks && upcomingTasks.length > 0) {
      summary += `⏰ **Próximas (${upcomingTasks.length}):**\n`;
      upcomingTasks.slice(0, 3).forEach((task, index) => {
        const dueDate = task.due_date ? format(new Date(task.due_date), "dd/MM", { locale: ptBR }) : 'Sem data';
        summary += `${index + 1}. ${task.title} - ${dueDate}\n`;
      });
      summary += `\n`;
    }

    if (alerts && alerts.length > 0) {
      summary += `⚠️ **Alertas (${alerts.length}):**\n`;
      alerts.slice(0, 3).forEach((alert, index) => {
        summary += `${index + 1}. ${alert.text} - ${alert.subtext}\n`;
      });
      summary += `\n`;
    }

    if (suggestions && suggestions.length > 0) {
      summary += `💡 **Prioridades:**\n`;
      suggestions.slice(0, 3).forEach((task, index) => {
        summary += `${index + 1}. ${task.title} - ${task.clientes?.empresa || 'N/A'}\n`;
      });
    }

    if ((!overdueTasks || overdueTasks.length === 0) && 
        (!todayTasks || todayTasks.length === 0) && 
        (!alerts || alerts.length === 0)) {
      summary += `✅ Tudo em dia! Não há tarefas urgentes no momento.`;
    }

    summary += `\n\nComo posso ajudar você hoje?`;
    return summary;
  }, [overdueTasks, todayTasks, upcomingTasks, alerts, suggestions]);

  useEffect(() => {
    // Gera mensagem inicial automaticamente quando o componente monta
    if (messages.length === 0) {
      const summary = generateInitialSummary();
      setMessages([{ role: 'assistant', content: summary }]);
    }
  }, [messages.length, generateInitialSummary]);

  useEffect(() => {
    // Scroll automático quando há novas mensagens ou quando está gerando
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        // Pequeno delay para garantir que o conteúdo foi renderizado
        const timeoutId = setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [messages, isGenerating, currentAIMessage, isExpanded]);

  const streamAIResponse = async (response) => {
    if (!response.body) {
      throw new Error("A resposta não continha um corpo para streaming.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    setCurrentAIMessage('');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              setCurrentAIMessage(fullResponse);
            }
          } catch (e) {
            // Ignora erros de parsing
          }
        }
      }
    }
    return fullResponse;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    setInput('');
    setIsGenerating(true);
    setCurrentAIMessage('');

    // Constrói contexto completo do dashboard
    const dashboardContext = buildDashboardContext();

    const systemPrompt = `Você é ApexIA, um assistente inteligente de suporte para o sistema de gestão JB APEX. Seu nome é ApexIA.

**Contexto do Dashboard do Usuário:**
${dashboardContext}

**Sua Personalidade:**
- Você é prestativo, empático e direto
- Você ajuda o usuário a entender o que precisa ser feito
- Você oferece sugestões práticas e acionáveis
- Você é proativo em identificar problemas e sugerir soluções
- Você fala de forma natural e amigável, mas profissional

**Suas Capacidades:**
- Analisar tarefas atrasadas e sugerir prioridades
- Explicar o que cada métrica do dashboard significa
- Ajudar a planejar o trabalho do dia/semana
- Identificar padrões e problemas nos dados
- Oferecer dicas de produtividade
- Responder perguntas sobre o sistema

**Formato de Resposta:**
- Use emojis moderadamente para tornar a comunicação mais amigável
- Seja específico e cite números quando relevante
- Organize informações em listas quando apropriado
- Destaque informações importantes
- Seja conciso, mas completo

**Importante:**
- Sempre responda em português do Brasil
- Seja honesto se não souber algo
- Foque em ajudar o usuário a ser mais produtivo
- Use os dados do dashboard para dar respostas precisas e contextuais`;

    const conversationHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
    const apiMessages = [{ role: 'system', content: systemPrompt }, ...conversationHistory, userMessage];

    try {
      let fullResponse = '';
      
      console.log('🔵 DashboardAssistant: Iniciando chamada para IA...', {
        messagesCount: apiMessages.length,
        model: 'gpt-4o-mini'
      });
      
      try {
        // Tenta usar Edge Function sem streaming primeiro (mais simples)
        console.log('🔵 Tentando Edge Function (sem streaming)...');
        const { data: response, error } = await supabase.functions.invoke('openai-chat', {
          body: JSON.stringify({ messages: apiMessages, model: 'gpt-4o-mini', stream: false }),
        });

        console.log('🔵 Resposta da Edge Function:', { 
          hasData: !!response, 
          hasError: !!error,
          responseType: typeof response,
          responseKeys: response ? Object.keys(response) : []
        });

        if (error) {
          console.error('❌ Erro da Edge Function:', error);
          throw error;
        }

        if (response && response.content) {
          fullResponse = response.content;
          console.log('✅ Resposta recebida (response.content):', fullResponse.substring(0, 100));
        } else if (response && response.text) {
          fullResponse = response.text;
          console.log('✅ Resposta recebida (response.text):', fullResponse.substring(0, 100));
        } else if (response && typeof response === 'string') {
          fullResponse = response;
          console.log('✅ Resposta recebida (string):', fullResponse.substring(0, 100));
        } else if (response && response.body) {
          // Se tiver body, processa streaming
          console.log('📡 Processando streaming...');
          fullResponse = await streamAIResponse(response);
        } else {
          console.error('❌ Resposta inválida:', response);
          throw new Error("Resposta inválida da Edge Function. Verifique o console para mais detalhes.");
        }
      } catch (edgeFunctionError) {
        console.warn("⚠️ Edge Function falhou, tentando com streaming:", edgeFunctionError);
        
        try {
          // Tenta com streaming
          const edgeBaseUrl = import.meta.env.VITE_SUPABASE_URL;
          if (!edgeBaseUrl) {
            throw new Error('URL do Supabase não configurada');
          }

          console.log('🔵 Tentando Edge Function (com streaming)...');
          const response = await fetch(`${edgeBaseUrl}/functions/v1/openai-chat`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
            },
            body: JSON.stringify({ messages: apiMessages, model: 'gpt-4o-mini', stream: true }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro na Edge Function (streaming):', errorText);
            throw new Error(`Erro na Edge Function: ${response.statusText} - ${errorText}`);
          }

          console.log('📡 Processando streaming da Edge Function...');
          fullResponse = await streamAIResponse(response);
        } catch (streamError) {
          console.warn("⚠️ Streaming falhou, usando API direta:", streamError);
          
          const apiKey = await getOpenAIKey();
          if (!apiKey) {
            throw new Error("Chave de API da OpenAI não encontrada. Configure nas configurações.");
          }

          console.log('🔵 Tentando API direta da OpenAI...');
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: apiMessages,
              stream: true
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro na API direta:', errorText);
            throw new Error(`Erro na API: ${errorText}`);
          }

          console.log('📡 Processando streaming da API direta...');
          fullResponse = await streamAIResponse(response);
        }
      }

      if (!fullResponse || fullResponse.trim() === '') {
        throw new Error("A IA não retornou uma resposta válida.");
      }

      console.log('✅ Resposta completa recebida:', fullResponse.substring(0, 200));
      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
      setCurrentAIMessage('');
    } catch (error) {
      console.error('❌ Erro completo ao gerar resposta:', error);
      toast({
        title: "Erro ao processar mensagem",
        description: error.message || "Ocorreu um erro ao comunicar com a IA. Verifique o console para mais detalhes.",
        variant: "destructive",
        duration: 8000
      });
      // Fallback para resposta simples
      const fallbackResponse = generateFallbackResponse(userInput);
      setMessages(prev => [...prev, { role: 'assistant', content: fallbackResponse }]);
    } finally {
      setIsGenerating(false);
      setCurrentAIMessage('');
    }
  };

  const buildDashboardContext = () => {
    let context = `**Estatísticas do Dashboard:**
- Tarefas Executadas (esta semana): ${stats?.executed || 0}
- Tarefas Atrasadas: ${stats?.overdue || 0}
- Tarefas para Hoje: ${stats?.today || 0}
- Próximas Tarefas (7 dias): ${stats?.upcoming || 0}

`;

    if (overdueTasks && overdueTasks.length > 0) {
      context += `**Tarefas Atrasadas (${overdueTasks.length}):**\n`;
      overdueTasks.slice(0, 10).forEach((task, index) => {
        const daysLate = task.due_date ? differenceInDays(new Date(), new Date(task.due_date)) : 0;
        context += `${index + 1}. ${task.title} - ${daysLate} dia(s) atrasado`;
        if (task.clientes?.empresa) context += ` (Cliente: ${task.clientes.empresa})`;
        if (task.priority) context += ` [Prioridade: ${task.priority}]`;
        context += `\n`;
      });
      context += `\n`;
    }

    if (todayTasks && todayTasks.length > 0) {
      context += `**Tarefas para Hoje (${todayTasks.length}):**\n`;
      todayTasks.slice(0, 10).forEach((task, index) => {
        context += `${index + 1}. ${task.title}`;
        if (task.clientes?.empresa) context += ` (Cliente: ${task.clientes.empresa})`;
        if (task.priority) context += ` [Prioridade: ${task.priority}]`;
        context += `\n`;
      });
      context += `\n`;
    }

    if (upcomingTasks && upcomingTasks.length > 0) {
      context += `**Próximas Tarefas (${upcomingTasks.length}):**\n`;
      upcomingTasks.slice(0, 10).forEach((task, index) => {
        const dueDate = task.due_date ? format(new Date(task.due_date), "dd/MM 'às' HH:mm", { locale: ptBR }) : 'Sem data';
        context += `${index + 1}. ${task.title} - ${dueDate}`;
        if (task.clientes?.empresa) context += ` (Cliente: ${task.clientes.empresa})`;
        context += `\n`;
      });
      context += `\n`;
    }

    if (alerts && alerts.length > 0) {
      context += `**Alertas (${alerts.length}):**\n`;
      alerts.forEach((alert, index) => {
        context += `${index + 1}. ${alert.text} - ${alert.subtext}\n`;
      });
      context += `\n`;
    }

    if (suggestions && suggestions.length > 0) {
      context += `**Tarefas Prioritárias (${suggestions.length}):**\n`;
      suggestions.slice(0, 5).forEach((task, index) => {
        context += `${index + 1}. ${task.title}`;
        if (task.clientes?.empresa) context += ` (Cliente: ${task.clientes.empresa})`;
        if (task.priority) context += ` [Prioridade: ${task.priority}]`;
        context += `\n`;
      });
    }

    return context;
  };

  const generateFallbackResponse = (userInput) => {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('atrasad') || lowerInput.includes('atraso')) {
      if (overdueTasks && overdueTasks.length > 0) {
        return `Você tem ${overdueTasks.length} tarefa(s) atrasada(s). Recomendo focar nelas primeiro para evitar acúmulo de pendências.`;
      }
      return 'Ótima notícia! Você não tem tarefas atrasadas no momento. 🎉';
    }

    if (lowerInput.includes('hoje') || lowerInput.includes('agora')) {
      if (todayTasks && todayTasks.length > 0) {
        return `Para hoje você tem ${todayTasks.length} tarefa(s) agendada(s). Foque em completá-las para manter o ritmo!`;
      }
      return 'Não há tarefas agendadas para hoje. Você pode usar esse tempo para planejar ou trabalhar em tarefas futuras! 😊';
    }

    return 'Desculpe, estou tendo dificuldades técnicas. Mas posso ajudar com informações sobre tarefas atrasadas, de hoje, próximas tarefas, prioridades e alertas. O que você gostaria de saber?';
  };


  return (
    <Card className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''}`}>
      <CardContent className={`p-4 ${isExpanded ? 'h-[calc(100vh-3rem)] flex flex-col' : ''}`}>
        <div className={`relative ${isExpanded ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <Bot className="h-5 w-5 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Assistente ApexIA</h3>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Minimizar" : "Expandir para tela inteira"}
              >
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => {
                    setMessages([]);
                    setInput('');
                  }}
                  title="Limpar conversa"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {(messages.length > 0 || isExpanded) && (
            <div 
              className={`mb-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 ${isExpanded ? 'flex-1 min-h-0' : 'h-[300px]'}`}
            >
              <ScrollArea 
                className={`h-full p-2`} 
                ref={scrollAreaRef}
              >
                <div className="space-y-2 pr-2">
                {messages.map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.role === 'assistant' && (
                      <Bot className="h-3.5 w-3.5 flex-shrink-0 text-orange-500 mt-0.5" />
                    )}
                    <div
                      className={`max-w-[75%] p-2 rounded-lg text-xs ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-orange-400 to-purple-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.role === 'user' && (
                      <User className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 mt-0.5" />
                    )}
                  </motion.div>
                ))}
                {isGenerating && currentAIMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2"
                  >
                    <Bot className="h-3.5 w-3.5 flex-shrink-0 text-orange-500 mt-0.5" />
                    <div className="bg-white dark:bg-gray-800 p-2 rounded-lg max-w-[75%] border border-gray-200 dark:border-gray-700">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{currentAIMessage}</p>
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-orange-500 mt-1.5" />
                    </div>
                  </motion.div>
                )}
                {isGenerating && !currentAIMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2"
                  >
                    <Bot className="h-3.5 w-3.5 flex-shrink-0 text-orange-500 mt-0.5" />
                    <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                      <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                    </div>
                  </motion.div>
                )}
                </div>
              </ScrollArea>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex-shrink-0">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={messages.length === 0 ? "Pergunte sobre tarefas pendentes, o que fazer hoje ou peça ajuda..." : "Continue a conversa..."}
                className="min-h-[80px] text-sm p-4 pr-20 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:border-orange-400 dark:focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      handleSendMessage(e);
                    }
                  }
                }}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600"
                >
                  <Mic className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </Button>
                <Button
                  type="submit"
                  disabled={!input.trim() || isGenerating}
                  className="h-8 w-8 rounded-lg bg-gradient-to-r from-orange-400 to-purple-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition-all"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardAssistant;

