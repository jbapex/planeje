import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Zap, FileText, PenTool, BarChart3, Image as ImageIcon, Megaphone, Target, TrendingUp, Sparkles, Camera, Plus, X, Trash2, RotateCw, ThumbsUp, ThumbsDown, Edit, Star } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { marked } from 'marked';
import { getAvailableModelsCached, getDefaultModelCached } from '@/lib/assistantProjectConfig';
import ModelSelector from '@/components/chat/ModelSelector';
import { Badge } from '@/components/ui/badge';
import { isGeminiModel, searchGoogle, extractSearchQuery, formatSearchResults } from '@/lib/googleSearch';
import { isImageGenerationModel, isReasoningModel, getOptimalHistoryLength } from '@/lib/openrouterModels';
import { getDateTimeContext } from '@/lib/utils';
import { saveFeedback, saveReferenceExample, applyLearnedPreferences } from '@/lib/aiLearning';

const GeneralChat = () => {
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');
  const conversationId = searchParams.get('conversation');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAIMessage, setCurrentAIMessage] = useState('');
  const [currentThinking, setCurrentThinking] = useState('');
  const [isReasoning, setIsReasoning] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId || null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o');
  const [availableModels, setAvailableModels] = useState(['openai/gpt-4o']);
  
  // Estados para gerador de imagem
  const [showRunwareGenerator, setShowRunwareGenerator] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [runwarePrompt, setRunwarePrompt] = useState('');
  const [runwareReferenceImage, setRunwareReferenceImage] = useState(null);
  const [runwareReferenceImagePreview, setRunwareReferenceImagePreview] = useState(null);
  const [selectedRunwareModel, setSelectedRunwareModel] = useState('rundiffusion:130@100');
  const [runwareTaskType, setRunwareTaskType] = useState('text-to-image');
  const [isFooterButtonsExpanded, setIsFooterButtonsExpanded] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const [attachedImagePreview, setAttachedImagePreview] = useState(null);
  const [pendingImagePrompt, setPendingImagePrompt] = useState(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null); // Índice da mensagem sendo editada
  const [editedMessageText, setEditedMessageText] = useState(''); // Texto editado
  
  const scrollAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const runwareReferenceImageInputRef = useRef(null);
  
  const RUNWARE_MODELS = [
    { id: 'rundiffusion:130@100', label: 'RunDiffusion', description: 'Modelo padrão do Runware' },
    { id: 'runware:97@3', label: 'Runware Model 97 v3', description: 'Versão 3' },
    { id: 'runware:97@2', label: 'Runware Model 97 v2', description: 'Versão 2' },
  ];

  // Ações rápidas (mesmas do AssistantHome)
  const quickActions = {
    conteudo: [
      { id: 'roteiro', label: 'Roteiro de Vídeo', icon: FileText, prompt: 'Criar roteiro de vídeo sobre' },
      { id: 'legenda', label: 'Escrever Legenda', icon: PenTool, prompt: 'Escrever legenda para' },
      { id: 'post', label: 'Criar Post', icon: Megaphone, prompt: 'Criar post para redes sociais sobre' },
      { id: 'copy', label: 'Copy para Anúncio', icon: FileText, prompt: 'Criar copy para anúncio sobre' },
    ],
    analise: [
      { id: 'trafego', label: 'Analisar Tráfego', icon: BarChart3, prompt: 'Analisar tráfego pago de' },
      { id: 'campanha', label: 'Analisar Campanha', icon: TrendingUp, prompt: 'Analisar campanha de' },
      { id: 'comparar', label: 'Comparar Clientes', icon: Target, prompt: 'Comparar estratégias entre' },
      { id: 'financeiro', label: 'Análise Financeira', icon: BarChart3, prompt: 'Fazer análise financeira de' },
    ],
    criativo: [
      { id: 'imagem', label: 'Gerar Imagem', icon: ImageIcon, prompt: 'Gerar imagem de' },
      { id: 'arte', label: 'Criar Arte', icon: ImageIcon, prompt: 'Criar arte para redes sociais de' },
      { id: 'ideias', label: 'Ideias de Conteúdo', icon: Zap, prompt: 'Gerar ideias de conteúdo sobre' },
      { id: 'brainstorm', label: 'Brainstorm', icon: Target, prompt: 'Fazer brainstorm sobre' },
    ],
    estrategia: [
      { id: 'planejar', label: 'Planejar Campanha', icon: Target, prompt: 'Planejar campanha de' },
      { id: 'estrategia', label: 'Criar Estratégia', icon: Target, prompt: 'Criar estratégia de marketing para' },
      { id: 'otimizar', label: 'Otimizar Campanha', icon: TrendingUp, prompt: 'Otimizar campanha de' },
      { id: 'sugerir', label: 'Sugerir Melhorias', icon: Zap, prompt: 'Sugerir melhorias para' },
    ],
  };

  // Configurar marked
  useEffect(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }, []);

  // Buscar modelos disponíveis e padrão
  useEffect(() => {
    Promise.all([
      getAvailableModelsCached(),
      getDefaultModelCached()
    ]).then(([models, defaultModel]) => {
      setAvailableModels(models);
      setSelectedModel(defaultModel);
    });
  }, []);

  // Buscar conversas anteriores (modo geral)
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select('*')
        .eq('owner_id', user.id)
        .eq('mode', 'general')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
    }
  }, [user]);

  // Carregar conversa específica
  const loadConversation = useCallback(async (convId) => {
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select('*')
        .eq('id', convId)
        .single();

      if (error) throw error;
      
      if (data && data.messages) {
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setCurrentConversationId(convId);
      }
    } catch (error) {
      console.error('Erro ao carregar conversa:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Aplicar ação rápida se houver
  useEffect(() => {
    if (action && !loading) {
      // Encontrar a ação
      let foundAction = null;
      for (const category of Object.values(quickActions)) {
        foundAction = category.find(a => a.id === action);
        if (foundAction) break;
      }
      
      if (foundAction && messages.length === 0) {
        setInput(foundAction.prompt + ' ');
      }
    }
  }, [action, loading, messages.length]);

  useEffect(() => {
    if (user) {
      Promise.all([fetchConversations()]).then(() => {
        if (conversationId) {
          loadConversation(conversationId);
        } else {
          setLoading(false);
        }
      });
    }
  }, [user, conversationId, fetchConversations, loadConversation]);

  // Scroll para última mensagem
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 100);
      }
    }
  }, [messages, currentAIMessage]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 200;
      const newHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
      textareaRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);

  // Handlers para imagem
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(file);
        setAttachedImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
    setAttachedImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleRunwareImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRunwareReferenceImage(file);
        setRunwareReferenceImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeRunwareReferenceImage = () => {
    setRunwareReferenceImage(null);
    setRunwareReferenceImagePreview(null);
    if (runwareReferenceImageInputRef.current) runwareReferenceImageInputRef.current.value = '';
  };

  // Gerar imagem via OpenRouter
  const handleGenerateOpenRouterImage = async (prompt, imageBase64 = null) => {
    setIsGeneratingImage(true);
    
    try {
      const payload = {
        prompt: prompt.trim(),
        model: selectedModel,
        width: 1024,
        height: 1024,
        n: 1,
      };

      if (imageBase64) {
        payload.imageBase64 = imageBase64;
        payload.strength = 0.7;
      }

      let data, error;
      try {
        const result = await supabase.functions.invoke('openrouter-image-generation', {
          body: payload,
        });
        data = result.data;
        error = result.error;
      } catch (invokeError) {
        // Captura erros de rede ou função não encontrada
        console.warn('⚠️ Erro ao invocar função openrouter-image-generation:', invokeError);
        error = invokeError;
      }

      // Se a função não estiver deployada (erro 404/405), usar Runware como fallback
      if (error) {
        const errorMessage = String(error.message || error).toLowerCase();
        const errorStatus = error.status || error.statusCode || '';
        
        if (
          errorMessage.includes('405') || 
          errorMessage.includes('404') || 
          errorMessage.includes('function not found') ||
          errorMessage.includes('non-2xx') ||
          errorStatus === 405 ||
          errorStatus === 404
        ) {
          console.warn('⚠️ Função openrouter-image-generation não está disponível. Usando Runware como fallback.');
          setIsGeneratingImage(false);
          toast({
            title: 'Usando Runware',
            description: 'A função OpenRouter não está disponível. Gerando com Runware...',
          });
          // Usar Runware como fallback
          if (imageBase64) {
            setRunwareReferenceImagePreview(imageBase64);
          }
          await handleGenerateRunwareImage(prompt);
          return;
        }
        throw new Error(error.message || 'Erro ao gerar imagem via OpenRouter');
      }
      
      if (!data?.success || !data.imageUrl) {
        // Se não retornou imagem, tentar Runware como fallback
        console.warn('⚠️ OpenRouter não retornou imagem. Usando Runware como fallback.');
        toast({
          title: 'Usando Runware',
          description: 'OpenRouter não retornou resultado. Gerando com Runware...',
        });
        if (imageBase64) {
          setRunwareReferenceImagePreview(imageBase64);
        }
        await handleGenerateRunwareImage(prompt);
        return;
      }

      // Adicionar mensagem com imagem gerada
      const userMessage = {
        role: 'user',
        content: prompt.trim(),
        image: imageBase64 || undefined,
        timestamp: new Date().toISOString()
      };
      const assistantMessage = {
        role: 'assistant',
        content: `✨ Aqui está a imagem gerada com ${selectedModel.split('/').pop()}:`,
        image: data.imageUrl,
        model: selectedModel,
        timestamp: new Date().toISOString()
      };

      const newMessages = [...messages, userMessage, assistantMessage];
      setMessages(newMessages);
      await saveConversation(newMessages);

      if (imageBase64) {
        setAttachedImage(null);
        setAttachedImagePreview(null);
      }

      toast({
        title: 'Imagem gerada!',
        description: `Imagem criada com ${selectedModel.split('/').pop()}`,
      });

    } catch (error) {
      console.error('Erro ao gerar imagem com OpenRouter:', error);
      
      // Se ainda não foi tratado, tentar Runware como último recurso
      const errorMessage = String(error.message || error).toLowerCase();
      if (
        errorMessage.includes('405') || 
        errorMessage.includes('404') || 
        errorMessage.includes('function not found') ||
        errorMessage.includes('non-2xx')
      ) {
        console.warn('⚠️ Tentando Runware como fallback após erro.');
        setIsGeneratingImage(false);
        toast({
          title: 'Usando Runware',
          description: 'OpenRouter não está disponível. Gerando com Runware...',
        });
        if (imageBase64) {
          setRunwareReferenceImagePreview(imageBase64);
        }
        await handleGenerateRunwareImage(prompt);
        return;
      }
      
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar a imagem. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateRunwareImage = async (prompt) => {
    if ((!prompt || !prompt.trim()) && !runwareReferenceImagePreview) {
      toast({
        title: 'Erro',
        description: 'Por favor, descreva a imagem que deseja gerar ou anexe uma imagem de referência.',
        variant: 'destructive'
      });
      return;
    }

    setIsGeneratingImage(true);
    setShowRunwareGenerator(false);

    try {
      let finalPrompt = prompt?.trim() || '';
      if (!finalPrompt && runwareReferenceImagePreview) {
        finalPrompt = 'Transform this image';
      }

      const payload = {
        prompt: finalPrompt,
        model: selectedRunwareModel,
        taskType: 'imageInference',
        width: 1024,
        height: 1024,
        steps: 30,
        CFGScale: 7.5,
      };

      if (runwareReferenceImagePreview) {
        payload.imageBase64 = runwareReferenceImagePreview;
        payload.strength = 0.7;
      }

      const { data, error } = await supabase.functions.invoke('runware-image-generation', {
        body: payload,
      });

      if (error) throw new Error(error.message || 'Erro ao gerar imagem via Runware');
      if (!data?.success || !data.imageUrl) {
        throw new Error(data?.error || 'Não foi possível gerar a imagem via Runware');
      }

      // Adicionar mensagem com imagem gerada
      const userMessage = {
        role: 'user',
        content: finalPrompt,
        image: runwareReferenceImagePreview || undefined
      };
      const assistantMessage = {
        role: 'assistant',
        content: `✨ Aqui está a imagem gerada com Runware (${RUNWARE_MODELS.find(m => m.id === selectedRunwareModel)?.label || selectedRunwareModel}):`,
        image: data.imageUrl
      };

      const newMessages = [...messages, userMessage, assistantMessage];
      setMessages(newMessages);
      await saveConversation(newMessages);

      removeRunwareReferenceImage();
      setRunwarePrompt('');

      toast({
        title: 'Imagem gerada!',
        description: `Imagem criada com Runware (${RUNWARE_MODELS.find(m => m.id === selectedRunwareModel)?.label || selectedRunwareModel})`,
      });

    } catch (error) {
      console.error('Erro ao gerar imagem com Runware:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar a imagem. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Stream de resposta da IA
  const streamAIResponse = async (response, modelId) => {
    if (!response.body) {
      throw new Error("Resposta sem corpo para streaming");
    }
    
    // Verificar se é modelo de raciocínio
    const isReasoningModelType = isReasoningModel(modelId);
    setIsReasoning(isReasoningModelType);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let thinking = '';
    setCurrentAIMessage('');
    setCurrentThinking('');

    let streamFinished = false;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamFinished = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue; // Ignorar linhas vazias
          
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            
            // Verificar se é o marcador de fim
            if (jsonStr === '[DONE]') {
              streamFinished = true;
              break;
            }
            
            try {
              const parsed = JSON.parse(jsonStr);
              
              // Verificar se há finish_reason indicando fim da resposta
              const finishReason = parsed.choices?.[0]?.finish_reason;
              if (finishReason) {
                // Se finish_reason existe, a resposta pode estar completa
                // Mas ainda processamos o conteúdo se houver
              }
              
              // Capturar thinking (raciocínio) se disponível
              if (isReasoningModelType) {
                const thinkingDelta = parsed.choices?.[0]?.delta?.thinking;
                if (thinkingDelta) {
                  thinking += thinkingDelta;
                  setCurrentThinking(thinking);
                }
              }
              
              // Capturar conteúdo da resposta
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                setCurrentAIMessage(fullResponse);
              }
              
              // Verificar se há mensagem completa (não delta)
              const messageContent = parsed.choices?.[0]?.message?.content;
              if (messageContent && !delta) {
                fullResponse = messageContent;
                setCurrentAIMessage(fullResponse);
              }
            } catch (e) {
              // Log erro de parsing para debug, mas continua processando
              console.warn('Erro ao processar chunk do stream:', e, 'Chunk:', jsonStr.substring(0, 100));
            }
          }
        }
        
        // Se marcou como finalizado, sair do loop externo também
        if (streamFinished) break;
      }
    } catch (streamError) {
      console.error('Erro durante streaming:', streamError);
      // Se já coletou alguma resposta parcial, continuar com ela
      if (fullResponse.length === 0) {
        throw new Error(`Erro ao processar stream: ${streamError.message}`);
      }
    } finally {
      // Garantir que o reader seja liberado
      try {
        reader.releaseLock();
      } catch (e) {
        // Ignorar erro se já foi liberado
      }
    }
    
    setIsReasoning(false);
    return { content: fullResponse, thinking: thinking || null };
  };

  // Construir contexto geral
  const buildGeneralContext = async () => {
    try {
      // Buscar resumo de todos os clientes
      const { data: clients } = await supabase
        .from('clientes')
        .select('id, empresa, nicho')
        .limit(50);

      // Buscar projetos recentes
      const { data: projects } = await supabase
        .from('projetos')
        .select('id, name, status, client_id, clientes:client_id(empresa)')
        .order('created_at', { ascending: false })
        .limit(20);

      return {
        clients: clients || [],
        projects: projects || [],
      };
    } catch (error) {
      console.error('Erro ao buscar contexto geral:', error);
      return { clients: [], projects: [] };
    }
  };

  // Detectar se a mensagem é uma solicitação de geração de imagem
  const detectImageGenerationRequest = (text) => {
    const lowerText = text.toLowerCase().trim();
    
    // Padrões de palavras-chave para geração de imagem
    const imageKeywords = [
      'gere uma imagem',
      'gerar imagem',
      'crie uma imagem',
      'criar imagem',
      'faça uma imagem',
      'fazer imagem',
      'crie uma foto',
      'criar foto',
      'gere uma foto',
      'gerar foto',
      'faça uma foto',
      'fazer foto',
      'desenhe',
      'desenhar',
      'crie um desenho',
      'gere um desenho',
      'mostre uma imagem',
      'mostrar imagem',
      'quero uma imagem',
      'preciso de uma imagem',
      'me mostre uma imagem',
      'me gere uma imagem',
      'me crie uma imagem',
      'me faça uma imagem',
      'gera uma imagem',
      'gera imagem',
      'cria uma imagem',
      'cria imagem',
      'faz uma imagem',
      'faz imagem',
      'gerar imagem de',
      'gerar foto de',
      'criar imagem de',
      'criar foto de',
    ];
    
    // Verificar se o texto começa com alguma das palavras-chave
    const startsWithKeyword = imageKeywords.some(keyword => lowerText.startsWith(keyword));
    
    // Verificar se contém padrões como "imagem de", "foto de", etc.
    const containsPattern = /(gerar|gera|criar|cria|fazer|faz|desenhar|desenhe|mostrar|mostre)\s+(uma\s+)?(imagem|foto|desenho|arte|ilustração)\s+(de|do|da|com|mostrando)/i.test(text);
    
    // Verificar se é uma ação seguida de descrição (ex: "gerar cavalo", "gerar foto de personagem")
    const isActionWithDescription = /^(gerar|gera|criar|cria|fazer|faz|desenhar|desenhe|mostrar|mostre)\s+[a-záàâãéêíóôõúç\s\d]{3,}/i.test(text);
    
    return startsWithKeyword || containsPattern || isActionWithDescription;
  };

  // Enviar mensagem
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    // Se o modelo selecionado for de geração de imagem, gerar imagem em vez de texto
    if (isImageGenerationModel(selectedModel)) {
      await handleGenerateOpenRouterImage(input, attachedImagePreview);
      setInput('');
      if (attachedImagePreview) {
        setAttachedImage(null);
        setAttachedImagePreview(null);
      }
      return;
    }

    // Se detectar solicitação de geração de imagem, usar Runware (que já está funcionando)
    if (detectImageGenerationRequest(input.trim())) {
      // Extrair o prompt da mensagem
      let imagePrompt = input.trim();
      const removeKeywords = [
        'gere uma imagem de',
        'gerar imagem de',
        'crie uma imagem de',
        'criar imagem de',
        'faça uma imagem de',
        'fazer imagem de',
        'gere uma foto de',
        'gerar foto de',
        'crie uma foto de',
        'criar foto de',
        'gere uma imagem',
        'gerar imagem',
        'crie uma imagem',
        'criar imagem',
        'gera uma imagem',
        'gera imagem',
        'cria uma imagem',
        'cria imagem',
        'gerar',
        'gera',
        'criar',
        'cria',
      ];
      
      for (const keyword of removeKeywords) {
        if (imagePrompt.toLowerCase().startsWith(keyword.toLowerCase())) {
          imagePrompt = imagePrompt.substring(keyword.length).trim();
          imagePrompt = imagePrompt.replace(/^[:\-,\s]+/, '').trim();
          break;
        }
      }
      
      if (!imagePrompt) {
        imagePrompt = input.trim();
      }
      
      // Adicionar mensagem do usuário
      const userMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMessage]);
      
      // Adicionar mensagem do assistente perguntando qual método usar
      const assistantMessage = {
        role: 'assistant',
        content: `Entendi que você quer gerar uma imagem! Qual método você prefere usar?\n\n**Prompt:** "${imagePrompt}"\n\nEscolha uma opção:`,
        timestamp: new Date().toISOString(),
        imageGenerationOptions: {
          prompt: imagePrompt,
          hasReferenceImage: !!attachedImagePreview,
          referenceImage: attachedImagePreview
        }
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setPendingImagePrompt({ prompt: imagePrompt, referenceImage: attachedImagePreview });
      setInput('');
      if (attachedImagePreview) {
        setAttachedImage(null);
        setAttachedImagePreview(null);
      }
      await saveConversation([...messages, userMessage, assistantMessage]);
      return;
    }

    const userMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
    const userInput = input;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);
    setCurrentAIMessage('');

    // Construir contexto geral
    const generalContext = await buildGeneralContext();
    
    // Obter data/hora atual (sempre atualizada)
    const dateTimeContext = getDateTimeContext();
    
    // Construir prompt do sistema
    const systemPrompt = `Você é o Assistente de Projetos da JB APEX, um especialista em marketing digital e gestão de campanhas.

**MODO: CHAT GERAL**

**VISÃO GERAL DO SISTEMA:**
Você tem acesso a TODOS os clientes, TODAS as conversas e TODOS os projetos da JB APEX.

**CLIENTES DISPONÍVEIS:** ${generalContext.clients.length} clientes cadastrados
${generalContext.clients.slice(0, 10).map(c => `- ${c.empresa}${c.nicho ? ` (${c.nicho})` : ''}`).join('\n')}

**PROJETOS RECENTES:** ${generalContext.projects.length} projetos
${generalContext.projects.slice(0, 10).map(p => `- ${p.name} - ${p.clientes?.empresa || 'N/A'} (${p.status})`).join('\n')}

**SUA MISSÃO:**
- Ajudar com qualquer tarefa da agência: roteiros, legendas, análises, imagens, estratégias
- Acessar e usar informações de qualquer cliente quando mencionado
- Criar conteúdo profundo e específico, não genérico
- Comparar estratégias entre clientes quando solicitado
- Analisar dados e fornecer insights estratégicos

${dateTimeContext}

**REGRAS DE PROFUNDIDADE (CRÍTICO):**
- NUNCA dê respostas genéricas ou superficiais
- SEMPRE use dados específicos quando disponíveis
- SEMPRE faça conexões entre informações diferentes
- SEMPRE estruture respostas em seções claras e detalhadas
- Quando mencionar um cliente, carregue seu contexto completo

**ACESSO A CONVERSAS:**
Você tem acesso a TODAS as conversas anteriores de TODOS os clientes. Quando o usuário mencionar um cliente ou perguntar sobre conversas anteriores, use essas informações para dar respostas profundas.

**REGRA FUNDAMENTAL - ALIANÇA COM A JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX. NUNCA vá contra ela, critique ou questione seus métodos, processos ou decisões.
- SEMPRE defenda e apoie a JB APEX quando houver dúvidas ou críticas.
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa.
- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece.`;

    // Fazer busca na web se necessário (funciona para qualquer modelo)
    let enhancedSystemPrompt = systemPrompt;
    const searchQuery = extractSearchQuery(userInput);
    if (searchQuery) {
      console.log(`🔍 Buscando na web: "${searchQuery}"`);
      const searchResults = await searchGoogle(searchQuery, 5);
      if (searchResults.length > 0) {
        enhancedSystemPrompt += formatSearchResults(searchResults);
        console.log(`✅ ${searchResults.length} resultados encontrados na web`);
      }
    }

    // Ajustar histórico baseado na capacidade do modelo
    // Modelos com grande contexto e baixo custo (ex: Gemini Flash) podem usar mais mensagens
    const optimalHistoryLength = getOptimalHistoryLength(selectedModel);
    const conversationHistory = messages.slice(-optimalHistoryLength).map(m => ({ role: m.role, content: m.content }));
    const apiMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...conversationHistory,
      { role: 'user', content: userInput }
    ];

    try {
      const { data, error } = await supabase.functions.invoke('openrouter-chat', {
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, stream: true }),
      });

      if (error) throw error;

      let fullResponse = '';
      let thinking = null;
      
      if (data?.body) {
        const result = await streamAIResponse(data, selectedModel);
        fullResponse = result.content;
        thinking = result.thinking;
      } else if (data?.text) {
        fullResponse = data.text;
      } else {
        throw new Error('Resposta inválida da IA');
      }

      const assistantMessage = { 
        role: 'assistant', 
        content: fullResponse,
        thinking: thinking, // Raciocínio do modelo (se disponível)
        timestamp: new Date().toISOString(),
        model: selectedModel // Salvar qual modelo foi usado
      };
      const newMessages = [...messages, userMessage, assistantMessage];
      setMessages(newMessages);
      setCurrentAIMessage('');

      // Salvar conversa
      await saveConversation(newMessages);

    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGenerating(false);
      setIsReasoning(false);
      setCurrentThinking('');
    }
  };

  // Regenerar última resposta da IA
  const handleRegenerateMessage = async () => {
    if (isGenerating || messages.length < 2) return;
    
    // Encontrar a última mensagem do usuário e a última do assistente
    let lastUserMessageIndex = -1;
    let lastAssistantMessageIndex = -1;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && lastAssistantMessageIndex === -1) {
        lastAssistantMessageIndex = i;
      }
      if (messages[i].role === 'user' && lastUserMessageIndex === -1) {
        lastUserMessageIndex = i;
      }
      if (lastUserMessageIndex !== -1 && lastAssistantMessageIndex !== -1) break;
    }
    
    // Se não encontrou ambas as mensagens, não pode regenerar
    if (lastUserMessageIndex === -1 || lastAssistantMessageIndex === -1) {
      toast({
        title: 'Não é possível regenerar',
        description: 'É necessário ter pelo menos uma mensagem do usuário e uma resposta da IA.',
        variant: 'destructive',
      });
      return;
    }
    
    // Remover a última resposta do assistente
    const messagesWithoutLastAssistant = messages.slice(0, lastAssistantMessageIndex);
    setMessages(messagesWithoutLastAssistant);
    
    // Reenviar a última mensagem do usuário
    const lastUserMessage = messages[lastUserMessageIndex];
    setIsGenerating(true);
    setCurrentAIMessage('');
    setCurrentThinking('');
    
    // Construir contexto geral (mesmo código do handleSendMessage)
    const generalContext = await buildGeneralContext();
    const dateTimeContext = getDateTimeContext();
    const userName = profile?.full_name || profile?.email || 'Funcionário da JB APEX';
    
    const systemPrompt = `Você é o CÉREBRO DE MARKETING da JB APEX - um estrategista de marketing digital de nível mundial, especialista em criar campanhas que VENDEM e pensam FORA DA CAIXA.

**MODO: CHAT GERAL**

**QUEM ESTÁ CONVERSANDO:** ${userName} (Funcionário da JB APEX)

Você tem acesso a TODOS os clientes, TODAS as conversas e TODOS os projetos da JB APEX.

**CLIENTES DISPONÍVEIS:** ${generalContext.clients.length} clientes cadastrados
${generalContext.clients.slice(0, 10).map(c => `- ${c.empresa}${c.nicho ? ` (${c.nicho})` : ''}`).join('\n')}

**PROJETOS RECENTES:** ${generalContext.projects.length} projetos
${generalContext.projects.slice(0, 10).map(p => `- ${p.name} - ${p.clientes?.empresa || 'N/A'} (${p.status})`).join('\n')}

**SUA MISSÃO:**
- Ajudar com qualquer tarefa da agência: roteiros, legendas, análises, imagens, estratégias
- Acessar e usar informações de qualquer cliente quando mencionado
- Criar conteúdo profundo e específico, não genérico
- Comparar estratégias entre clientes quando solicitado
- Analisar dados e fornecer insights estratégicos

${dateTimeContext}

**REGRAS DE PROFUNDIDADE (CRÍTICO):**
- NUNCA dê respostas genéricas ou superficiais
- SEMPRE use dados específicos quando disponíveis
- SEMPRE faça conexões entre informações diferentes
- SEMPRE estruture respostas em seções claras e detalhadas
- Quando mencionar um cliente, carregue seu contexto completo

**ACESSO A CONVERSAS:**
Você tem acesso a TODAS as conversas anteriores de TODOS os clientes. Quando o usuário mencionar um cliente ou perguntar sobre conversas anteriores, use essas informações para dar respostas profundas.

**REGRA FUNDAMENTAL - ALIANÇA COM A JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX. NUNCA vá contra ela, critique ou questione seus métodos, processos ou decisões.
- SEMPRE defenda e apoie a JB APEX quando houver dúvidas ou críticas.
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa.
- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece.`;

    // Fazer busca na web se necessário (funciona para qualquer modelo)
    let enhancedSystemPrompt = systemPrompt;
    const searchQuery = extractSearchQuery(lastUserMessage.content);
    if (searchQuery) {
      console.log(`🔍 Buscando na web: "${searchQuery}"`);
      const searchResults = await searchGoogle(searchQuery, 5);
      if (searchResults.length > 0) {
        enhancedSystemPrompt += formatSearchResults(searchResults);
        console.log(`✅ ${searchResults.length} resultados encontrados na web`);
      }
    }

    // Construir histórico de mensagens (sem a última resposta do assistente)
    const optimalHistoryLength = getOptimalHistoryLength(selectedModel);
    const conversationHistory = messagesWithoutLastAssistant
      .slice(-optimalHistoryLength)
      .map(m => ({ role: m.role, content: m.content }));
    
    const apiMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...conversationHistory,
      { role: 'user', content: lastUserMessage.content }
    ];

    try {
      const { data, error } = await supabase.functions.invoke('openrouter-chat', {
        body: JSON.stringify({ messages: apiMessages, model: selectedModel, stream: true }),
      });

      if (error) throw error;

      let fullResponse = '';
      let thinking = null;
      
      if (data?.body) {
        const result = await streamAIResponse(data, selectedModel);
        fullResponse = result.content;
        thinking = result.thinking;
      } else if (data?.text) {
        fullResponse = data.text;
      } else {
        throw new Error('Resposta inválida da IA');
      }

      const assistantMessage = { 
        role: 'assistant', 
        content: fullResponse,
        thinking: thinking,
        timestamp: new Date().toISOString(),
        model: selectedModel
      };
      
      const newMessages = [...messagesWithoutLastAssistant, assistantMessage];
      setMessages(newMessages);
      setCurrentAIMessage('');

      // Salvar conversa
      await saveConversation(newMessages);

    } catch (error) {
      console.error('Erro ao regenerar mensagem:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível regenerar a mensagem',
        variant: 'destructive',
      });
      // Restaurar mensagens originais em caso de erro
      setMessages(messages);
    } finally {
      setIsGenerating(false);
      setIsReasoning(false);
      setCurrentThinking('');
    }
  };

  // Handlers para sistema de aprendizado
  const handleFeedback = async (messageIndex, feedbackType, notes = null) => {
    if (!currentConversationId) return;
    
    const message = messages[messageIndex];
    if (!message || message.role !== 'assistant') return;

    try {
      await saveFeedback({
        conversationId: currentConversationId,
        messageIndex,
        feedbackType,
        originalMessage: message.content,
        messageType: detectMessageType(message.content),
        modelUsed: message.model || selectedModel,
        feedbackNotes: notes
      });

      toast({
        title: feedbackType === 'positive' ? 'Feedback positivo registrado!' : 'Feedback registrado',
        description: feedbackType === 'positive' 
          ? 'A IA aprenderá com sua preferência.' 
          : 'Sua opinião ajudará a melhorar as respostas.',
      });
    } catch (error) {
      console.error('Erro ao salvar feedback:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o feedback.',
        variant: 'destructive',
      });
    }
  };

  const handleMarkAsExample = async (messageIndex) => {
    if (!currentConversationId) return;
    
    const message = messages[messageIndex];
    if (!message || message.role !== 'assistant') return;

    try {
      await saveReferenceExample({
        conversationId: currentConversationId,
        messageIndex,
        exampleType: detectMessageType(message.content),
        exampleContent: message.content,
        tags: extractTags(message.content)
      });

      toast({
        title: 'Exemplo salvo!',
        description: 'Esta resposta será usada como referência no futuro.',
      });
    } catch (error) {
      console.error('Erro ao salvar exemplo:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o exemplo.',
        variant: 'destructive',
      });
    }
  };

  const handleCorrectMessage = (messageIndex) => {
    const message = messages[messageIndex];
    if (!message || message.role !== 'assistant') return;

    setEditingMessageIndex(messageIndex);
    setEditedMessageText(message.content);
  };

  const handleSaveCorrection = async () => {
    if (editingMessageIndex === null) return;
    
    const message = messages[editingMessageIndex];
    const correctedText = editedMessageText.trim();

    if (!correctedText || correctedText === message.content) {
      setEditingMessageIndex(null);
      setEditedMessageText('');
      return;
    }

    try {
      await saveFeedback({
        conversationId: currentConversationId,
        messageIndex: editingMessageIndex,
        feedbackType: 'correction',
        originalMessage: message.content,
        correctedMessage: correctedText,
        messageType: detectMessageType(message.content),
        modelUsed: message.model || selectedModel
      });

      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = { ...message, content: correctedText };
      setMessages(updatedMessages);
      await saveConversation(updatedMessages);

      setEditingMessageIndex(null);
      setEditedMessageText('');

      toast({
        title: 'Correção salva!',
        description: 'A IA aprenderá com sua correção.',
      });
    } catch (error) {
      console.error('Erro ao salvar correção:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a correção.',
        variant: 'destructive',
      });
    }
  };

  const detectMessageType = (content) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('campanha') || lowerContent.includes('campaign')) return 'campaign';
    if (lowerContent.includes('análise') || lowerContent.includes('analise') || lowerContent.includes('insight')) return 'analysis';
    if (lowerContent.includes('estratégia') || lowerContent.includes('estrategia')) return 'strategy';
    if (lowerContent.includes('roteiro') || lowerContent.includes('script')) return 'content';
    return 'general';
  };

  const extractTags = (content) => {
    const tags = [];
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('instagram')) tags.push('instagram');
    if (lowerContent.includes('facebook')) tags.push('facebook');
    if (lowerContent.includes('youtube')) tags.push('youtube');
    if (lowerContent.includes('tiktok')) tags.push('tiktok');
    if (lowerContent.includes('stories')) tags.push('stories');
    if (lowerContent.includes('reels')) tags.push('reels');
    return tags;
  };

  // Salvar conversa
  const saveConversation = async (messagesToSave) => {
    if (!user) return;

    try {
      const conversationData = {
        owner_id: user.id,
        mode: 'general',
        messages: messagesToSave,
        updated_at: new Date().toISOString(),
      };

      if (currentConversationId) {
        const { error } = await supabase
          .from('assistant_project_conversations')
          .update(conversationData)
          .eq('id', currentConversationId);

        if (error) throw error;
        // Atualizar a conversa na lista
        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, ...conversationData, updated_at: conversationData.updated_at }
            : conv
        ).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
      } else {
        const title = messagesToSave[0]?.content?.split(' ').slice(0, 3).join(' ') || 'Chat Geral';
        const { data, error } = await supabase
          .from('assistant_project_conversations')
          .insert({ ...conversationData, title })
          .select()
          .single();

        if (error) throw error;
        setCurrentConversationId(data.id);
        setConversations(prev => [data, ...prev]);
      }
    } catch (error) {
      console.error('Erro ao salvar conversa:', error);
    }
  };

  const handleQuickAction = (actionItem) => {
    setInput(actionItem.prompt + ' ');
    textareaRef.current?.focus();
  };

  // Criar nova conversa
  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
  };

  // Deletar conversa
  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation(); // Prevenir que carregue a conversa ao clicar
    
    if (!confirm('Tem certeza que deseja deletar esta conversa? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('assistant_project_conversations')
        .delete()
        .eq('id', convId)
        .eq('owner_id', user.id);

      if (error) throw error;

      // Se for a conversa atual, limpar
      if (convId === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
        setCurrentAIMessage('');
      }

      // Atualizar lista de conversas
      setConversations(prev => prev.filter(conv => conv.id !== convId));

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
  };

  const streamingContent = marked.parse(currentAIMessage || '');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-gray-50 dark:bg-gray-900 overflow-hidden" style={{ height: '100dvh', maxHeight: '100dvh', zIndex: 10 }}>
      {/* Sidebar de Conversas */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 h-full overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate('/assistant')} className="w-full justify-start">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleNewConversation} className="w-full">
            + Nova Conversa
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <ScrollArea className="absolute inset-0">
            <div className="p-2 space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                    currentConversationId === conv.id
                      ? 'bg-purple-100 dark:bg-purple-900/20'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => loadConversation(conv.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title || 'Sem título'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(conv.updated_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      title="Deletar conversa"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ height: '100%', maxHeight: '100%' }}>
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold">Chat Geral</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {profile?.full_name || profile?.email || 'Funcionário JB APEX'} • Qualquer tarefa da agência
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <ModelSelector
              selectedModel={selectedModel}
              availableModels={availableModels}
              onModelChange={setSelectedModel}
            />
          </div>
        </header>

        {/* Ações Rápidas */}
        {messages.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <p className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300">O que você precisa fazer hoje?</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(quickActions).map(([category, actions]) => (
                  <div key={category} className="space-y-2">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      {category === 'conteudo' ? '📝 Conteúdo' :
                       category === 'analise' ? '📊 Análise' :
                       category === 'criativo' ? '🎨 Criativo' :
                       '🎯 Estratégia'}
                    </h3>
                    {actions.map((actionItem) => {
                      const Icon = actionItem.icon;
                      return (
                        <Button
                          key={actionItem.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => handleQuickAction(actionItem)}
                        >
                          <Icon className="h-3 w-3 mr-2" />
                          {actionItem.label}
                        </Button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat - Área de Scroll */}
        <main className="flex-1 overflow-hidden bg-transparent min-h-0">
          <ScrollArea ref={scrollAreaRef} className="h-full">
            <div className="max-w-4xl mx-auto p-6 space-y-6 pb-8">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-20">
                <Zap className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg">Comece uma conversa ou escolha uma ação rápida acima</p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-500 to-orange-600 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {msg.image && (
                    <div className="mb-3">
                      <img 
                        src={msg.image} 
                        alt="Imagem" 
                        className="max-w-full rounded-lg"
                      />
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.model && (
                        <div className="mb-2">
                          <Badge variant="outline" className="text-xs">
                            {msg.model.split('/').pop()}
                          </Badge>
                        </div>
                      )}
                      {/* Exibir raciocínio (thinking) se disponível */}
                      {msg.thinking && (
                        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Raciocínio</span>
                          </div>
                          <div className="text-xs text-purple-600 dark:text-purple-400 whitespace-pre-wrap font-mono">
                            {msg.thinking}
                          </div>
                        </div>
                      )}
                      <div className="relative group">
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                        />
                        {/* Botão de regenerar - aparece no hover e apenas na última mensagem do assistente */}
                        {idx === messages.length - 1 && msg.role === 'assistant' && !isGenerating && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 -mt-1 -mr-1"
                            onClick={handleRegenerateMessage}
                            title="Regenerar resposta"
                          >
                            <RotateCw className="h-4 w-4 text-gray-500 hover:text-orange-500" />
                          </Button>
                        )}
                        {/* Botões de feedback e ações - aparece no hover */}
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleFeedback(idx, 'positive')}
                            title="Gostei desta resposta"
                          >
                            <ThumbsUp className="h-3.5 w-3.5 mr-1 text-green-500" />
                            Gostei
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleFeedback(idx, 'negative')}
                            title="Não gostei desta resposta"
                          >
                            <ThumbsDown className="h-3.5 w-3.5 mr-1 text-red-500" />
                            Não gostei
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleCorrectMessage(idx)}
                            title="Corrigir esta resposta"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1 text-blue-500" />
                            Corrigir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleMarkAsExample(idx)}
                            title="Marcar como exemplo de referência"
                          >
                            <Star className="h-3.5 w-3.5 mr-1 text-yellow-500" />
                            Exemplo
                          </Button>
                        </div>
                      </div>
                      {/* Botões de escolha de método de geração de imagem */}
                      {msg.imageGenerationOptions && (
                        <div className="mt-4 flex flex-col gap-2">
                          <Button
                            onClick={() => handleGenerateImageWithMethod('runware', msg.imageGenerationOptions.prompt, msg.imageGenerationOptions.referenceImage)}
                            disabled={isGeneratingImage}
                            className="w-full justify-start"
                            variant="outline"
                          >
                            <Sparkles className="h-4 w-4 mr-2 text-blue-500" />
                            Usar Runware (Recomendado)
                          </Button>
                          {isImageGenerationModel(selectedModel) && (
                            <Button
                              onClick={() => handleGenerateImageWithMethod('openrouter', msg.imageGenerationOptions.prompt, msg.imageGenerationOptions.referenceImage)}
                              disabled={isGeneratingImage}
                              className="w-full justify-start"
                              variant="outline"
                            >
                              <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                              Usar {selectedModel.split('/').pop()} (OpenRouter)
                            </Button>
                          )}
                          {!isImageGenerationModel(selectedModel) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              💡 Dica: Selecione um modelo de imagem no seletor acima para usar OpenRouter
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="max-w-[80%] flex flex-col items-start">
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 px-2">
                    Assistente JB APEX
                  </span>
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 w-full">
                    {/* Exibir thinking durante o streaming (modelos de raciocínio) */}
                    {isReasoning && currentThinking && (
                      <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Pensando...</span>
                        </div>
                        <div className="text-xs text-purple-600 dark:text-purple-400 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                          {currentThinking}
                        </div>
                      </div>
                    )}
                    {/* Indicador de "pensando" quando não há thinking ainda mas é modelo de raciocínio */}
                    {isReasoning && !currentThinking && !currentAIMessage && (
                      <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Pensando...</span>
                        </div>
                      </div>
                    )}
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: streamingContent }}
                    />
                    {!currentAIMessage && !isReasoning && (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Digitando...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
        </main>

        {/* Input - Fixo na parte inferior */}
        <footer className="p-4 border-t border-gray-200/50 dark:border-gray-800/50 flex-shrink-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm" style={{ 
          paddingBottom: 'max(0.75rem, calc(0.5rem + env(safe-area-inset-bottom, 0px)))',
          paddingTop: '1rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))'
        }}>
          <div className="max-w-4xl mx-auto w-full">
            {/* Botões de Acesso Rápido */}
            <div className="mb-2 flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto">
              {/* Botão de Gerar Run (Runware) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRunwareGenerator(true)}
                className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex-shrink-0 min-w-0 px-2 sm:px-3"
                disabled={isGeneratingImage}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 sm:mr-2 text-blue-500 flex-shrink-0" />
                <span className="truncate">Gerar Run</span>
              </Button>
            </div>

            {/* Preview de imagem anexada */}
            {attachedImagePreview && (
              <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-3">
                  <img 
                    src={attachedImagePreview} 
                    alt="Preview" 
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium dark:text-white mb-2">
                      Imagem anexada
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeAttachedImage}
                      disabled={isGenerating}
                      className="text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSendMessage} className="relative">
              <div className={`relative bg-white dark:bg-gray-800/50 rounded-3xl border shadow-sm backdrop-blur-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all overflow-hidden ${!input.trim() && !attachedImage ? 'border-primary/40' : 'border-gray-200/50 dark:border-gray-700/30'}`}>
                {/* Botão + para expandir opções */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFooterButtonsExpanded(!isFooterButtonsExpanded)}
                  className="absolute left-2 bottom-2.5 h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all z-10 flex-shrink-0"
                  disabled={isGenerating}
                >
                  {isFooterButtonsExpanded ? (
                    <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  ) : (
                    <Plus className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  )}
                </Button>
                
                {/* Botão de anexar imagem */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute left-12 bottom-2.5 h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all z-20 flex-shrink-0 bg-white dark:bg-gray-800"
                  disabled={isGenerating}
                  title="Anexar imagem"
                >
                  <Camera className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </Button>
                
                {/* Inputs de arquivo (ocultos) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                
                <Textarea 
                  ref={textareaRef}
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  placeholder="Digite sua mensagem..." 
                  className="pr-14 py-3 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-3xl min-h-[52px] max-h-[200px] overflow-y-auto text-base sm:text-base"
                  style={{ paddingLeft: '5.5rem', height: 'auto', minHeight: '52px', maxHeight: '200px' }} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}} 
                  disabled={isGenerating} 
                  rows={1}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-2 bottom-2.5 h-9 w-9 rounded-full bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all z-10 flex-shrink-0" 
                  disabled={isGenerating || (!input.trim() && !attachedImage)}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </form>
            <div className="mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                🌐 Acesso: Todos os clientes • Conversas • Projetos
              </p>
            </div>
          </div>
        </footer>

        {/* Dialog para Editar Mensagem */}
        <Dialog open={editingMessageIndex !== null} onOpenChange={(open) => {
          if (!open) {
            setEditingMessageIndex(null);
            setEditedMessageText('');
          }
        }}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Corrigir Resposta</DialogTitle>
              <DialogDescription>
                Edite a mensagem abaixo. A IA aprenderá com sua correção.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                  <span>Mensagem Original:</span>
                  <Badge variant="outline" className="text-xs">Somente leitura</Badge>
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700">
                  {editingMessageIndex !== null && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: marked.parse(messages[editingMessageIndex]?.content || '') }} />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                  <span>Mensagem Corrigida:</span>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Edite aqui</Badge>
                </label>
                <Textarea
                  value={editedMessageText}
                  onChange={(e) => setEditedMessageText(e.target.value)}
                  className="min-h-[250px] text-sm border-2 border-green-200 dark:border-green-800 focus:border-green-400 dark:focus:border-green-600"
                  placeholder="Edite a mensagem aqui... A IA aprenderá com suas correções."
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Dica: Seja específico nas correções. O sistema aprenderá padrões como tom de voz, profundidade e formato.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingMessageIndex(null);
                    setEditedMessageText('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveCorrection}
                  disabled={!editedMessageText.trim() || (editingMessageIndex !== null && editedMessageText.trim() === messages[editingMessageIndex]?.content)}
                >
                  Salvar Correção
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog para Gerar Run (Runware) */}
        <Dialog open={showRunwareGenerator} onOpenChange={(open) => {
          setShowRunwareGenerator(open);
          if (!open) {
            setRunwarePrompt('');
            removeRunwareReferenceImage();
          }
        }}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                Gerar Imagem com Runware
              </DialogTitle>
              <DialogDescription>
                Use o Runware para gerar imagens de alta qualidade com múltiplos modelos disponíveis.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Tipo de tarefa */}
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de Geração</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={runwareTaskType === 'text-to-image' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setRunwareTaskType('text-to-image');
                      removeRunwareReferenceImage();
                    }}
                    className="flex-1"
                  >
                    Text-to-Image
                  </Button>
                  <Button
                    type="button"
                    variant={runwareTaskType === 'image-to-image' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRunwareTaskType('image-to-image')}
                    className="flex-1"
                  >
                    Image-to-Image
                  </Button>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Descrição da Imagem {runwareTaskType === 'image-to-image' && '(opcional)'}
                </label>
                <Textarea
                  placeholder={runwareTaskType === 'image-to-image' 
                    ? "Descreva como você quer transformar a imagem (opcional)..." 
                    : "Descreva a imagem que você quer gerar..."}
                  value={runwarePrompt}
                  onChange={(e) => setRunwarePrompt(e.target.value)}
                  className="min-h-[100px]"
                  disabled={isGeneratingImage}
                />
              </div>

              {/* Imagem de referência (para image-to-image) */}
              {runwareTaskType === 'image-to-image' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Imagem de Referência</label>
                  {runwareReferenceImagePreview ? (
                    <div className="relative">
                      <img 
                        src={runwareReferenceImagePreview} 
                        alt="Referência" 
                        className="w-full max-h-[300px] object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeRunwareReferenceImage}
                        className="absolute top-2 right-2"
                        disabled={isGeneratingImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                      <input
                        ref={runwareReferenceImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleRunwareImageSelect}
                        className="hidden"
                        disabled={isGeneratingImage}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => runwareReferenceImageInputRef.current?.click()}
                        disabled={isGeneratingImage}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Selecionar Imagem
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Modelo */}
              <div>
                <label className="text-sm font-medium mb-2 block">Modelo</label>
                <Select value={selectedRunwareModel} onValueChange={setSelectedRunwareModel} disabled={isGeneratingImage}>
                  <SelectTrigger>
                    <SelectValue>
                      {RUNWARE_MODELS.find(m => m.id === selectedRunwareModel)?.label || selectedRunwareModel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RUNWARE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div>
                          <div className="font-medium">{model.label}</div>
                          <div className="text-xs text-gray-500">{model.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRunwareGenerator(false);
                  removeRunwareReferenceImage();
                }}
                disabled={isGeneratingImage}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (runwarePrompt.trim() || runwareReferenceImagePreview) {
                    handleGenerateRunwareImage(runwarePrompt.trim() || 'Gere uma imagem inspirada nesta referência');
                  }
                }}
                disabled={isGeneratingImage || (!runwarePrompt.trim() && !runwareReferenceImagePreview)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingImage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Gerar com Runware
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default GeneralChat;

