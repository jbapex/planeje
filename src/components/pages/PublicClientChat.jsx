import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
    import { useParams, useNavigate, useLocation } from 'react-router-dom';
    import { Helmet } from 'react-helmet';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Bot, User, Send, Loader2, Sparkles, Frown, Lightbulb, Clapperboard, ChevronDown, Check, Trash2, PlusCircle, X, Menu, FolderKanban, Download, Camera, Plus } from 'lucide-react';
import StoryIdeasGenerator from './StoryIdeasGenerator';
import ImageAnalyzer from './ImageAnalyzer';
    import { Button } from '@/components/ui/button';
    import { Textarea } from '@/components/ui/textarea';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { marked } from 'marked';
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

    const ICONS = {
      Bot, Sparkles, Lightbulb, Clapperboard, Default: Bot,
    };

    const PublicClientChat = () => {
        const { clientId, sessionId } = useParams();
        const navigate = useNavigate();
        const location = useLocation();
        const { toast } = useToast();
        const { getOpenAIKey } = useAuth();
        const [client, setClient] = useState(null);
        const [projects, setProjects] = useState([]);
        const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
        const [agents, setAgents] = useState([]);
        const [sessions, setSessions] = useState([]);
        const [currentAgent, setCurrentAgent] = useState(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [messages, setMessages] = useState([]);
        const [input, setInput] = useState('');
        const [isGenerating, setIsGenerating] = useState(false);
        
        // Auto-resize do textarea (estilo ChatGPT)
        useEffect(() => {
            if (textareaRef.current) {
                // Reset height para calcular corretamente
                textareaRef.current.style.height = '52px';
                const scrollHeight = textareaRef.current.scrollHeight;
                const maxHeight = 200; // Limite máximo em pixels (~8 linhas)
                const newHeight = Math.min(scrollHeight, maxHeight);
                textareaRef.current.style.height = `${newHeight}px`;
                
                // Se ultrapassou o limite, permite scroll
                if (scrollHeight > maxHeight) {
                    textareaRef.current.style.overflowY = 'auto';
                } else {
                    textareaRef.current.style.overflowY = 'hidden';
                }
            }
        }, [input]);
        const [currentAIMessage, setCurrentAIMessage] = useState('');
        const [isSidebarOpen, setIsSidebarOpen] = useState(false);
        const scrollAreaRef = useRef(null);
        const [installPrompt, setInstallPrompt] = useState(null);
        const [isStoryIdeasOpen, setIsStoryIdeasOpen] = useState(false);
        const [isImageAnalyzerOpen, setIsImageAnalyzerOpen] = useState(false);
        const [isFooterButtonsExpanded, setIsFooterButtonsExpanded] = useState(false); // Opções começam escondidas, aparecem ao clicar no +
        const [logoError, setLogoError] = useState(false);
        const textareaRef = useRef(null);

        useEffect(() => {
            // Salva a URL atual no localStorage para o PWA saber para onde voltar
            localStorage.setItem('lastPublicChatUrl', location.pathname);
            
            // Atualiza o manifest para a rota do chat
            const updateManifest = () => {
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (manifestLink && clientId) {
                    // Cria um novo manifest dinâmico baseado na rota atual
                    const currentPath = location.pathname;
                    const manifestData = {
                        name: client?.empresa ? `ApexIA - ${client.empresa}` : 'ApexIA - Assistente de IA',
                        short_name: 'ApexIA',
                        description: `ApexIA é o assistente de inteligência artificial da JB APEX para ${client?.empresa || 'você'}.`,
                        start_url: currentPath,
                        display: 'standalone',
                        background_color: '#111827',
                        theme_color: '#8B5CF6',
                        orientation: 'portrait-primary',
                        icons: [
                            {
                                src: '/icon-192x192.png',
                                sizes: '192x192',
                                type: 'image/png'
                            },
                            {
                                src: '/icon-512x512.png',
                                sizes: '512x512',
                                type: 'image/png'
                            }
                        ]
                    };
                    
                    // Cria um blob URL com o manifest
                    const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    manifestLink.href = url;
                }
            };
            
            // Atualiza o manifest quando a rota ou cliente mudar
            updateManifest();
        }, [location.pathname, client, clientId]);

        useEffect(() => {
            const handleBeforeInstallPrompt = (e) => {
                e.preventDefault();
                setInstallPrompt(e);
            };
    
            window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
            return () => {
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            };
        }, []);
    
        const handleInstallClick = async () => {
            if (!installPrompt) return;
            
            // Garante que o manifest está atualizado antes de instalar
            const currentPath = location.pathname;
            const manifestLink = document.querySelector('link[rel="manifest"]');
            if (manifestLink && client) {
                const manifestData = {
                    name: client.empresa ? `ApexIA - ${client.empresa}` : 'ApexIA - Assistente de IA',
                    short_name: 'ApexIA',
                    description: `ApexIA é o assistente de inteligência artificial da JB APEX para ${client.empresa || 'você'}.`,
                    start_url: currentPath,
                    display: 'standalone',
                    background_color: '#111827',
                    theme_color: '#8B5CF6',
                    orientation: 'portrait-primary',
                    icons: [
                        {
                            src: '/icon-192x192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: '/icon-512x512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        }
                    ]
                };
                
                const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                manifestLink.href = url;
            }
    
            installPrompt.prompt();
    
            installPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    toast({ 
                        title: 'App instalado!', 
                        description: `O ApexIA para ${client?.empresa || 'você'} foi adicionado à sua tela inicial e abrirá direto no chat.` 
                    });
                }
                setInstallPrompt(null);
            });
        };

        const generateConversationTitle = useCallback(async (userMessage, aiResponse) => {
            try {
                const prompt = `Com base na seguinte conversa inicial, gere um título curto e descritivo (máximo 50 caracteres) para esta conversa. O título deve ser claro, profissional e resumir o assunto principal.

Mensagem do usuário: "${userMessage}"
Resposta da IA: "${aiResponse.substring(0, 200)}..."

Retorne APENAS o título, sem aspas, sem explicações, sem prefixos. Apenas o título.`;

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ 
                        messages: [
                            { 
                                role: 'system', 
                                content: 'Você é um assistente que gera títulos curtos e descritivos para conversas. Retorne apenas o título, sem aspas, sem explicações.' 
                            },
                            { 
                                role: 'user', 
                                content: prompt 
                            }
                        ], 
                        model: 'gpt-4o',
                        stream: false
                    }),
                });

                if (error || !data) {
                    console.error('Erro ao gerar título:', error);
                    // Fallback: usa os primeiros 40 caracteres da mensagem do usuário
                    return userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
                }

                let title = '';
                if (data.text) {
                    title = data.text.trim();
                } else if (data.body) {
                    // Se vier como streaming, pega o primeiro chunk
                    const reader = data.body.getReader();
                    const decoder = new TextDecoder();
                    const { value } = await reader.read();
                    if (value) {
                        const chunk = decoder.decode(value);
                        title = chunk.trim();
                    }
                }

                // Remove aspas se houver e limita a 50 caracteres
                title = title.replace(/^["']|["']$/g, '').trim();
                if (title.length > 50) {
                    title = title.substring(0, 47) + '...';
                }

                return title || (userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage);
            } catch (err) {
                console.error('Erro ao gerar título com IA:', err);
                // Fallback: usa os primeiros 40 caracteres da mensagem do usuário
                return userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
            }
        }, []);

        const handleNewSession = useCallback(async (clientData, currentSessions, replace = false) => {
            if (!clientData) return null;

            if (clientData.max_chat_sessions !== null && currentSessions.length >= clientData.max_chat_sessions) {
                toast({ title: 'Limite de conversas atingido', description: 'Você atingiu o número máximo de conversas permitidas.', variant: 'destructive' });
                return null;
            }

            if (clientData.daily_chat_limit !== null) {
                const today = new Date().toISOString().split('T')[0];
                const { count, error: countError } = await supabase
                    .from('client_chat_sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('client_id', clientId)
                    .gte('created_at', `${today}T00:00:00.000Z`);

                if (countError) {
                    toast({ title: 'Erro ao verificar limite diário', description: countError.message, variant: 'destructive' });
                    return null;
                }
                
                if (count >= clientData.daily_chat_limit) {
                    toast({ title: 'Limite diário de conversas atingido', description: 'Você atingiu o número máximo de novas conversas por hoje.', variant: 'destructive' });
                    return null;
                }
            }
        
            const { data, error } = await supabase.from('client_chat_sessions').insert({ client_id: clientId, title: 'Nova Conversa' }).select().single();
            if (error) {
                toast({ title: 'Erro ao criar nova conversa', description: error.message, variant: 'destructive' });
                return null;
            } else {
                navigate(`/chat/${clientId}/${data.id}`, { replace });
                setSessions(prev => [data, ...prev]);
                if (isSidebarOpen) setIsSidebarOpen(false);
                return data;
            }
        }, [clientId, navigate, toast, isSidebarOpen]);

        const fetchInitialData = useCallback(async () => {
            if (!clientId) {
                setError("ID do cliente não fornecido.");
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const [clientRes, agentsRes, projectsRes, sessionsRes] = await Promise.all([
                    supabase.from('clientes').select('id, empresa, nome_contato, nicho, publico_alvo, tom_de_voz, max_chat_sessions, daily_chat_limit, logo_urls').eq('id', clientId).single(),
                    supabase.from('ai_agents').select('*').eq('is_active', true).order('created_at'),
                    supabase.from('projetos').select('id, name, status, mes_referencia').eq('client_id', clientId),
                    supabase.from('client_chat_sessions').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
                ]);

                if (clientRes.error || !clientRes.data) throw new Error("Cliente não encontrado ou acesso não permitido.");
                const clientData = clientRes.data;
                setClient(clientData);
                setLogoError(false); // Reset logo error quando cliente muda

                if (agentsRes.error) throw new Error("Não foi possível carregar os agentes de IA.");
                const agentsData = agentsRes.data || [];
                setAgents(agentsData);
                
                if (agentsData.length === 0) {
                    throw new Error("Nenhum agente de IA foi configurado. Por favor, entre em contato com o administrador.");
                }
                
                const defaultAgent = agentsData.find(a => a.icon === 'Bot') || agentsData[0];
                setCurrentAgent(defaultAgent);
                
                if (projectsRes.error) {
                    console.error("Erro ao buscar projetos:", projectsRes.error);
                } else {
                    setProjects(projectsRes.data);
                    setSelectedProjectIds(new Set(projectsRes.data.map(p => p.id)));
                }

                const fetchedSessions = sessionsRes.data || [];
                setSessions(fetchedSessions);

                if (!sessionId && fetchedSessions.length > 0) {
                    navigate(`/chat/${clientId}/${fetchedSessions[0].id}`, { replace: true });
                } else if (!sessionId && fetchedSessions.length === 0) {
                    await handleNewSession(clientData, fetchedSessions, true);
                }

            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        }, [clientId, sessionId, navigate, handleNewSession]);

        const fetchMessagesForSession = useCallback(async () => {
            if (!sessionId || !client) return;
            setLoading(true);
            const { data, error } = await supabase.from('client_chat_messages').select('role, content').eq('session_id', sessionId).order('created_at');
            if (error) {
                toast({ title: "Erro ao buscar mensagens", description: error.message, variant: "destructive" });
                setMessages([]);
            } else if (data.length > 0) {
                setMessages(data);
            } else {
                 const initialMessage = {
                    role: 'assistant',
                    content: `Olá, ${client.nome_contato}! Eu sou o **ApexIA**, seu assistente de inteligência artificial da **JB APEX**. Selecione um agente abaixo e me diga como posso ser útil hoje.`
                };
                setMessages([initialMessage]);
                await saveMessage(initialMessage, sessionId);
            }
            setLoading(false);
        }, [sessionId, client, toast]);

        useEffect(() => {
            fetchInitialData();
        }, [fetchInitialData]); 

        useEffect(() => {
            if (client) {
                fetchMessagesForSession();
            }
        }, [sessionId, client, fetchMessagesForSession]);
        
        useEffect(() => {
            if (scrollAreaRef.current) {
                const scrollContainer = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
                if (scrollContainer) scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            }
        }, [messages, currentAIMessage]);

        const saveMessage = useCallback(async (message, currentSessionId) => {
            if(!currentSessionId) return;
            await supabase.from('client_chat_messages').insert({
                session_id: currentSessionId,
                role: message.role,
                content: message.content,
            });
        }, []);
        
        const handleDeleteSession = async (idToDelete) => {
            const remainingSessions = sessions.filter(s => s.id !== idToDelete);
            setSessions(remainingSessions);
            
            if (sessionId === idToDelete) {
                if (remainingSessions.length > 0) {
                    navigate(`/chat/${clientId}/${remainingSessions[0].id}`);
                } else {
                    await handleNewSession(client, [], true);
                }
            }

            const { error } = await supabase.from('client_chat_sessions').delete().eq('id', idToDelete);
            if (error) {
                toast({ title: 'Erro ao excluir conversa', description: error.message, variant: 'destructive' });
                fetchInitialData(); 
            }
        };

        const handleSendMessage = async (e) => {
            e.preventDefault();
            if (!input.trim() || isGenerating || !currentAgent || !sessionId) return;
            
            const userMessage = { role: 'user', content: input };
            const userMessageText = input; // Salva o texto antes de limpar
            setMessages(prev => [...prev, userMessage]);
            await saveMessage(userMessage, sessionId);
            setInput('');
            // Reset altura do textarea após enviar
            if (textareaRef.current) {
                textareaRef.current.style.height = '52px';
            }
            setIsGenerating(true);
            setCurrentAIMessage('');
            const isFirstUserMessage = messages.length === 1 && messages[0].role === 'assistant';
            
            const selectedProjects = projects.filter(p => selectedProjectIds.has(p.id));
            const projectsInfo = selectedProjects.length > 0 
                ? selectedProjects.map(p => `- Projeto: "${p.name}", Status: ${p.status}, Mês: ${p.mes_referencia}`).join('\n') 
                : "Nenhum projeto selecionado para o contexto.";

            let systemPrompt = currentAgent.prompt
                .replace('{client_name}', client.empresa || '')
                .replace('{contact_name}', client.nome_contato || '')
                .replace('{client_niche}', client.nicho || '')
                .replace('{client_target_audience}', client.publico_alvo || '')
                .replace('{client_tone}', client.tom_de_voz || '');
            systemPrompt += `\n\n**Informações de Contexto (se necessário):**\n**Projetos Atuais Selecionados:**\n${projectsInfo}`;
            systemPrompt += `\n\n**Instrução Importante:** Se o usuário precisar de ajuda humana ou você não souber a resposta, primeiro pergunte se ele gostaria de criar uma solicitação para a equipe. Use o shortcode **[CONFIRMAR_SOLICITACAO]** ao final da sua pergunta. Exemplo: "Para isso, o ideal é falar com nossa equipe. Você gostaria de criar uma solicitação agora? [CONFIRMAR_SOLICITACAO]"`;
            const conversationHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
            const apiMessages = [{ role: 'system', content: systemPrompt }, ...conversationHistory, userMessage];

            try {
                console.log('🔵 Iniciando chamada para Edge Function openai-chat...', {
                    messagesCount: apiMessages.length,
                    model: 'gpt-4o'
                });

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ messages: apiMessages, model: 'gpt-4o' }),
                });

                console.log('🔵 Resposta da Edge Function:', { data: !!data, error: !!error, hasBody: !!data?.body });

                // Verifica se houve erro na chamada
                if (error) {
                    // Log completo do erro para debug
                    console.error('Edge Function error completo:', {
                        error,
                        message: error.message,
                        name: error.name,
                        status: error.status,
                        statusCode: error.statusCode,
                        code: error.code,
                        context: error.context,
                        toString: error.toString(),
                        keys: Object.keys(error),
                        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
                    });
                    
                    // Extrai status code de várias possíveis propriedades
                    let statusCode = null;
                    if (error.status !== undefined) statusCode = error.status;
                    else if (error.statusCode !== undefined) statusCode = error.statusCode;
                    else if (error.code !== undefined && typeof error.code === 'number') statusCode = error.code;
                    else if (error.message) {
                        // Tenta extrair do texto da mensagem
                        const statusMatch = error.message.match(/\b([45]\d{2})\b/);
                        if (statusMatch) statusCode = parseInt(statusMatch[1]);
                    }
                    
                    // Extrai mensagem de erro
                    let errorDetails = error.message || "Erro desconhecido";
                    if (error.context?.message) errorDetails = error.context.message;
                    else if (error.context?.error) errorDetails = error.context.error;
                    else if (typeof error.context === 'string') errorDetails = error.context;
                    
                    // Log do status code encontrado
                    console.log('Status code extraído:', statusCode, 'Error details:', errorDetails);
                    
                    // Erros específicos por status code
                    if (statusCode === 404 || error.message?.includes('Function not found') || error.message?.includes('404')) {
                        throw new Error("A função de chat não está configurada no servidor. Por favor, contate o administrador.");
                    }
                    
                    if (statusCode === 401 || statusCode === 403 || error.message?.includes('401') || error.message?.includes('403')) {
                        throw new Error("A configuração da chave de API da IA parece estar ausente ou incorreta. Por favor, contate o administrador.");
                    }
                    
                    if (statusCode === 500 || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
                        throw new Error("Erro interno do servidor. Por favor, tente novamente mais tarde ou contate o administrador.");
                    }
                    
                    if (statusCode === 429 || error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('quota')) {
                        throw new Error("Limite de requisições excedido. Por favor, aguarde um momento e tente novamente.");
                    }
                    
                    // Erro genérico de status code não-2xx ou erro "non-2xx"
                    if (statusCode || error.message?.includes('non-2xx') || error.message?.toLowerCase().includes('status code')) {
                        const codeDisplay = statusCode ? statusCode : 'erro do servidor';
                        throw new Error(`O servidor retornou um erro${statusCode ? ` (código: ${statusCode})` : ''}. ${errorDetails !== error.message ? `Detalhes: ${errorDetails}` : ''} Por favor, contate o administrador ou tente novamente mais tarde.`);
                    }
                    
                    // Se não tem status code mas tem mensagem específica
                    if (errorDetails !== "Erro desconhecido") {
                        throw new Error(errorDetails);
                    }
                    
                    // Último recurso: mensagem genérica com instruções de diagnóstico
                    const diagnosticMessage = `
Falha ao comunicar com o servidor: ${error.message || 'Erro desconhecido'}

📋 DIAGNÓSTICO:
1. Verifique se a Edge Function 'openai-chat' está deployada no Supabase
2. Verifique se a API key da OpenAI está configurada
3. Veja os logs da Edge Function no Dashboard do Supabase

🔧 Para corrigir:
- Acesse: Supabase Dashboard → Edge Functions → Deploy a função
- Configure: OPENAI_API_KEY nas Settings da Edge Function
`;
                    throw new Error(diagnosticMessage.trim());
                }
                
                // Verifica se há dados válidos
                if (!data) {
                    console.error('❌ Edge Function retornou data vazio/null');
                    throw new Error("A função de chat não retornou dados válidos. Verifique se a Edge Function está deployada e funcionando.");
                }
                
                console.log('✅ Dados recebidos:', {
                    hasBody: !!data.body,
                    hasText: !!data.text,
                    dataKeys: Object.keys(data)
                });
                
                // Verifica se há body para streaming
                let aiResponseText = '';
                if (!data.body) {
                    // Se não tem body mas tem text, usa text
                    if (data.text) {
                        console.log('✅ Usando resposta de texto direto (sem streaming)');
                        aiResponseText = data.text;
                        const assistantMessage = { role: 'assistant', content: aiResponseText };
                        setMessages(prev => [...prev, assistantMessage]);
                        await saveMessage(assistantMessage, sessionId);
                    } else {
                        console.error('❌ Resposta sem body nem text:', data);
                        throw new Error("Resposta inválida da função de chat: não há corpo para streaming nem texto. A Edge Function pode não estar retornando o formato correto.");
                    }
                } else {
                    // Processa o streaming
                    console.log('✅ Processando stream de resposta...');
                    aiResponseText = await streamAIResponse(data);
                    console.log('✅ Stream completo! Tamanho:', aiResponseText.length, 'caracteres');
                    const assistantMessage = { role: 'assistant', content: aiResponseText };
                    setMessages(prev => [...prev, assistantMessage]);
                    await saveMessage(assistantMessage, sessionId);
                }

                // Gera título personalizado se for a primeira mensagem do usuário
                if (isFirstUserMessage && aiResponseText) {
                    try {
                        const personalizedTitle = await generateConversationTitle(userMessageText, aiResponseText);
                        const { error: updateError } = await supabase
                            .from('client_chat_sessions')
                            .update({ title: personalizedTitle })
                            .eq('id', sessionId);
                        
                        if (!updateError) {
                            setSessions(prev => prev.map(s => 
                                s.id === sessionId ? {...s, title: personalizedTitle} : s
                            ));
                        }
                    } catch (titleError) {
                        console.error('Erro ao atualizar título:', titleError);
                        // Não mostra erro para o usuário, apenas loga
                    }
                }
            } catch (err) {
                console.error("Erro completo ao invocar função de chat:", err);
                
                let errorMessageText = err.message || "Erro desconhecido ao comunicar com a IA.";
                
                // Melhora as mensagens de erro para o usuário
                if (err.message?.includes("API key") || err.message?.includes("chave de API") || err.message?.includes("401") || err.message?.includes("403")) {
                    errorMessageText = "A configuração da chave de API da IA parece estar ausente ou incorreta. Por favor, contate o administrador.";
                } else if (err.message?.includes("Function not found") || err.message?.includes("404")) {
                    errorMessageText = "A função de chat não está configurada no servidor. Por favor, contate o administrador.";
                } else if (err.message?.includes("non-2xx") || err.message?.includes("retornou um erro")) {
                    // Já tem a mensagem correta do throw acima
                    errorMessageText = err.message;
                } else if (err.message?.includes("network") || err.message?.includes("fetch") || err.message?.includes("conexão")) {
                    errorMessageText = "Erro de conexão. Verifique sua internet e tente novamente.";
                } else if (err.message?.includes("timeout") || err.message?.includes("tempo")) {
                    errorMessageText = "A solicitação demorou muito para responder. Por favor, tente novamente.";
                }
                
                toast({ 
                    title: "Erro na comunicação com a IA", 
                    description: errorMessageText, 
                    variant: "destructive",
                    duration: 5000
                });
                
                const clientName = client?.nome_contato || 'cliente';
                const errorMessage = { 
                    role: 'assistant', 
                    content: `Desculpe, ${clientName}. ${errorMessageText}` 
                };
                setMessages(prev => [...prev, errorMessage]);
                await saveMessage(errorMessage, sessionId);
            } finally {
                setIsGenerating(false);
                setCurrentAIMessage('');
            }
        };

        const streamAIResponse = async (response) => {
            if (!response.body) {
                throw new Error("A resposta da função não continha um corpo para streaming.");
            }
            
            // Verifica se response.body é um ReadableStream
            if (!(response.body instanceof ReadableStream)) {
                console.error('Response body não é um ReadableStream:', response.body);
                throw new Error("O formato da resposta não é compatível com streaming.");
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6).trim();
                            if (jsonStr === '[DONE]') {
                                return fullResponse;
                            }
                            
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const delta = parsed.choices?.[0]?.delta?.content;
                                if (delta) {
                                    fullResponse += delta;
                                    setCurrentAIMessage(prev => prev + delta);
                                }
                            } catch (parseError) {
                                console.error('Error parsing stream chunk:', parseError, 'Chunk:', jsonStr);
                                // Continua processando outras linhas
                            }
                        }
                    }
                }
            } catch (streamError) {
                console.error('Erro durante o streaming:', streamError);
                // Se já coletou alguma resposta parcial, retorna ela
                if (fullResponse.length > 0) {
                    return fullResponse;
                }
                throw new Error(`Erro ao processar a resposta da IA: ${streamError.message}`);
            } finally {
                reader.releaseLock();
            }
            
            return fullResponse;
        };

        const handleCreateRequest = async () => {
            const lastMessages = messages.slice(-3).map(m => `**${m.role === 'user' ? client.nome_contato : 'ApexIA'}**: ${m.content.replace(/\[CONFIRMAR_SOLICITACAO\]/g, '')}`).join('\n\n');
            const description = `Solicitação gerada via ApexIA.\n\n**Últimos trechos da conversa:**\n${lastMessages}`;
            const { error } = await supabase.from('solicitacoes').insert({ client_id: clientId, title: 'Solicitação via Assistente ApexIA', description: description, origem: 'ApexIA', status: 'aberta', priority: 'media' });
            if (error) {
                toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
            } else {
                toast({ title: "Solicitação enviada!", description: "A equipe da JB APEX foi notificada e entrará em contato em breve." });
                const confirmationMessage = { role: 'assistant', content: 'Sua solicitação foi criada com sucesso! Nossa equipe entrará em contato em breve.' };
                setMessages(prev => [...prev, confirmationMessage]);
                await saveMessage(confirmationMessage, sessionId);
            }
        };

        const handleRequestConfirmation = async (confirm) => {
            if (confirm) {
                const userMessage = { role: 'user', content: 'Sim, quero criar a solicitação.' };
                setMessages(prev => [...prev, userMessage]);
                await saveMessage(userMessage, sessionId);
                await handleCreateRequest();
            } else {
                const userMessage = { role: 'user', content: 'Não, obrigado.' };
                const assistantMessage = { role: 'assistant', content: 'Entendido. Como mais posso ajudar?' };
                setMessages(prev => [...prev, userMessage, assistantMessage]);
                await saveMessage(userMessage, sessionId);
                await saveMessage(assistantMessage, sessionId);
            }
        };

        const renderMessageContent = (content) => {
            const parsedContent = marked.parse(content);
            if (/\[CONFIRMAR_SOLICITACAO\]/g.test(parsedContent)) {
                const finalContent = parsedContent.replace(/\[CONFIRMAR_SOLICITACAO\]/g, '');
                return (
                    <div>
                        <div dangerouslySetInnerHTML={{ __html: finalContent }} />
                        <div className="flex gap-2 mt-4">
                            <Button onClick={() => handleRequestConfirmation(true)} size="sm">Sim, criar solicitação</Button>
                            <Button onClick={() => handleRequestConfirmation(false)} size="sm" variant="outline">Não, obrigado</Button>
                        </div>
                    </div>
                );
            }
            return <div dangerouslySetInnerHTML={{ __html: parsedContent }} />;
        };

        const handleAgentChange = async (agent) => {
            setCurrentAgent(agent);
            const agentMessage = { role: 'assistant', content: `Agente **${agent.name}** ativado! ${agent.description} Como posso ajudar?` };
            setMessages(prev => [...prev, agentMessage]);
            await saveMessage(agentMessage, sessionId);
        };

        const handleProjectSelection = (projectId) => {
            const newSelection = new Set(selectedProjectIds);
            if (newSelection.has(projectId)) {
                newSelection.delete(projectId);
            } else {
                newSelection.add(projectId);
            }
            setSelectedProjectIds(newSelection);
        };
        
        // IMPORTANTE: useMemo deve ser chamado ANTES de qualquer early return
        // para seguir as regras dos Hooks do React (ordem consistente)
        const streamingContent = useMemo(() => {
            if (!currentAIMessage) return '';
            try {
                return marked.parse(currentAIMessage || '');
            } catch (parseError) {
                console.error('Erro ao fazer parse do markdown:', parseError);
                return currentAIMessage || '';
            }
        }, [currentAIMessage]);
        
        // Verificações de segurança para evitar tela em branco
        if (loading) { 
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                    <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                    <p className="mt-4 text-lg">Carregando assistente...</p>
                </div>
            ); 
        }
        
        if (error) { 
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-center p-4">
                    <Frown className="h-12 w-12 text-red-500" />
                    <h1 className="mt-4 text-2xl font-bold text-gray-800 dark:text-white">Acesso Inválido</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">{error.message || 'Erro desconhecido'}</p>
                    <Button onClick={() => window.location.href = '/'} className="mt-6">Voltar</Button>
                </div>
            ); 
        }
        
        // Verificação adicional: se não tem cliente ou agentes, mostra loading
        if (!client || !agents || agents.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                    <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                    <p className="mt-4 text-lg">Carregando dados do cliente...</p>
                </div>
            );
        }
        
        const CurrentAgentIcon = currentAgent ? (ICONS[currentAgent.icon] || ICONS.Default) : Sparkles;

        const SessionSidebar = () => (
          <aside className={`absolute md:relative z-20 md:z-auto h-full w-64 bg-gray-100 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-800 flex flex-col transition-transform transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
              <div className="p-4 border-b border-gray-300 dark:border-gray-800 flex justify-between items-center bg-gray-100 dark:bg-gray-900">
                  <h2 className="font-semibold text-lg dark:text-white">Conversas</h2>
                  <Button variant="ghost" size="icon" className="md:hidden rounded-full hover:bg-gray-200 dark:hover:bg-gray-800" onClick={() => setIsSidebarOpen(false)}><X className="h-5 w-5"/></Button>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-900">
                <Button onClick={() => handleNewSession(client, sessions)} className="w-full justify-start rounded-full bg-primary hover:bg-primary/90 shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> Nova Conversa
                </Button>
              </div>
              <ScrollArea className="flex-1 bg-gray-100 dark:bg-gray-900">
                  <div className="p-2 space-y-0.5">
                      {sessions.map(s => (
                          <div key={s.id} className={`group flex items-center justify-between rounded-xl p-2.5 cursor-pointer transition-all ${s.id === sessionId ? 'bg-primary/15 dark:bg-primary/25 border border-primary/30' : 'hover:bg-gray-200 dark:hover:bg-gray-800/70 border border-transparent'}`} onClick={() => { if(s.id !== sessionId) navigate(`/chat/${clientId}/${s.id}`); if(isSidebarOpen) setIsSidebarOpen(false); }}>
                              <span className="truncate text-sm font-medium dark:text-gray-200">{s.title}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20" onClick={(e) => {e.stopPropagation(); handleDeleteSession(s.id);}}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                          </div>
                      ))}
                  </div>
              </ScrollArea>
              <footer className="p-3 border-t border-gray-300 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900">
                  JB APEX
              </footer>
          </aside>
        );

        return (
            <>
                <Helmet><title>ApexIA - Assistente para {client?.empresa || 'Cliente'}</title></Helmet>
                <div className="flex h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 overflow-hidden" style={{ height: '100dvh', maxHeight: '100dvh' }}>
                    <SessionSidebar />
                    <div className="flex flex-col flex-1 min-w-0" style={{ height: '100%', maxHeight: '100%' }}>
                        <header className="p-4 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between flex-shrink-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
                            <div className="flex items-center gap-3 min-w-0">
                               <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full" onClick={() => setIsSidebarOpen(true)}><Menu className="h-5 w-5"/></Button>
                               <div className="rounded-2xl flex-shrink-0 shadow-sm overflow-hidden w-11 h-11 relative">
                                   {client?.logo_urls && client.logo_urls.length > 0 && !logoError ? (
                                       <img 
                                           src={client.logo_urls[0]} 
                                           alt={client?.empresa || 'Cliente'} 
                                           className="absolute inset-0 w-full h-full object-cover rounded-2xl"
                                           onError={() => setLogoError(true)}
                                       />
                                   ) : (
                                       <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center">
                                           <CurrentAgentIcon className="h-6 w-6 text-primary" />
                                       </div>
                                   )}
                               </div>
                               <div className="min-w-0"><h1 className="font-semibold text-lg dark:text-white">ApexIA</h1><p className="text-sm text-gray-500 dark:text-gray-400 truncate">para {client?.empresa || 'Cliente'}</p></div>
                            </div>
                             {installPrompt && (
                                <Button variant="outline" size="sm" onClick={handleInstallClick} className="flex items-center gap-2 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <Download className="h-4 w-4" />
                                    Instalar App
                                </Button>
                            )}
                        </header>
                        <main className="flex-1 overflow-hidden bg-transparent">
                            <ScrollArea className="h-full px-4 py-6" ref={scrollAreaRef}>
                                <div className="max-w-3xl mx-auto space-y-8">
                                    <AnimatePresence initial={false}>
                                        {messages.map((msg, index) => (
                                            <motion.div key={`${sessionId}-${index}`} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className={`flex items-start w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div 
                                                    className={`relative group max-w-xl px-4 py-3 rounded-3xl shadow-sm ${msg.role === 'user' 
                                                        ? 'rounded-br-md' 
                                                        : 'bg-white dark:bg-gray-800/50 dark:text-gray-200 border border-gray-200/50 dark:border-gray-700/30 rounded-bl-md backdrop-blur-sm'}`}
                                                    style={{
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word',
                                                        ...(msg.role === 'user' ? {
                                                            backgroundColor: '#E6F7FF',
                                                            color: '#1A4A6E'
                                                        } : {})
                                                    }}
                                                >
                                                    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">{renderMessageContent(msg.content)}</div>
                                                </div>
                                            </motion.div>
                                        ))}
                                        {isGenerating && currentAIMessage && (
                                            <motion.div 
                                                key="streaming-message"
                                                layout={false}
                                                initial={{ opacity: 0 }} 
                                                animate={{ opacity: 1 }} 
                                                transition={{ duration: 0.1 }}
                                                className="flex items-start gap-3 w-full"
                                                style={{
                                                    minHeight: '48px',
                                                    contain: 'layout style paint'
                                                }}
                                            >
                                                <div 
                                                    className="max-w-xl px-4 py-3 rounded-3xl rounded-bl-md bg-white dark:bg-gray-800/50 dark:text-gray-200 flex-shrink-0 shadow-sm border border-gray-200/50 dark:border-gray-700/30 backdrop-blur-sm"
                                                    style={{
                                                        minHeight: '48px',
                                                        width: '100%',
                                                        maxWidth: '36rem',
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word',
                                                        contain: 'layout style'
                                                    }}
                                                >
                                                    <div 
                                                        className="prose prose-sm dark:prose-invert max-w-none"
                                                        style={{
                                                            minHeight: '1.5em',
                                                            lineHeight: '1.75',
                                                            whiteSpace: 'pre-wrap'
                                                        }}
                                                    >
                                                        {streamingContent ? (
                                                            <div 
                                                                dangerouslySetInnerHTML={{ __html: streamingContent }} 
                                                                style={{
                                                                    display: 'inline'
                                                                }}
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400 dark:text-gray-500">Digitando...</span>
                                                        )}
                                                        <span 
                                                            className="inline-block ml-0.5 w-0.5 h-4 bg-current align-middle"
                                                            style={{
                                                                animation: 'blink 1s infinite',
                                                                verticalAlign: 'middle'
                                                            }}
                                                            aria-hidden="true"
                                                        />
                                                    </div>
                                                </div>
                                                <style>{`
                                                    @keyframes blink {
                                                        0%, 49% { opacity: 1; }
                                                        50%, 100% { opacity: 0.3; }
                                                    }
                                                `}</style>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </ScrollArea>
                        </main>
                        <footer className="p-4 border-t border-gray-200/50 dark:border-gray-800/50 flex-shrink-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm" style={{ 
                            paddingBottom: 'max(0.75rem, calc(0.5rem + env(safe-area-inset-bottom, 0px)))',
                            paddingTop: '1rem',
                            paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                            paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))'
                        }}>
                            <div className="max-w-3xl mx-auto w-full">
                                {/* Container dos botões - controlado por botão + (estilo ChatGPT) */}
                                <AnimatePresence>
                                    {isFooterButtonsExpanded && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col sm:flex-row items-center gap-2 mb-3 overflow-hidden"
                                        >
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full sm:w-auto flex-1 justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm">
                                                <CurrentAgentIcon className="h-4 w-4 mr-2" />
                                                <span className="truncate">{currentAgent?.name || "Selecione um Agente"}</span>
                                                <ChevronDown className="h-4 w-4 ml-auto opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] dark:bg-gray-800/95 dark:border-gray-700/50 rounded-2xl border-gray-200/50 backdrop-blur-sm">
                                            {agents.map(agent => {const AgentIcon = ICONS[agent.icon] || ICONS.Default; return (<DropdownMenuItem key={agent.id} onClick={() => handleAgentChange(agent)} className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg"><AgentIcon className="h-4 w-4 mr-2" /><span>{agent.name}</span>{currentAgent?.id === agent.id && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>);})}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full sm:w-auto flex-1 justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm">
                                                <FolderKanban className="h-4 w-4 mr-2" />
                                                <span className="truncate">{selectedProjectIds.size} projeto(s) selecionado(s)</span>
                                                <ChevronDown className="h-4 w-4 ml-auto opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] dark:bg-gray-800/95 dark:border-gray-700/50 rounded-2xl border-gray-200/50 backdrop-blur-sm">
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setSelectedProjectIds(new Set(projects.map(p => p.id)))} className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg">Selecionar Todos</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setSelectedProjectIds(new Set())} className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg">Limpar Seleção</DropdownMenuItem>
                                            <DropdownMenuSeparator className="dark:bg-gray-700/50" />
                                            {projects.map(project => (
                                                <DropdownMenuCheckboxItem
                                                    key={project.id}
                                                    checked={selectedProjectIds.has(project.id)}
                                                    onCheckedChange={() => handleProjectSelection(project.id)}
                                                    onSelect={(e) => e.preventDefault()}
                                                    className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg"
                                                >
                                                    {project.name}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                        variant="outline"
                                        className="w-full sm:w-auto flex-1 justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm"
                                        onClick={() => setIsStoryIdeasOpen(true)}
                                    >
                                        <Lightbulb className="h-4 w-4 mr-2" />
                                        <span className="truncate">Ideias de Stories</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full sm:w-auto flex-1 justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm"
                                        onClick={() => setIsImageAnalyzerOpen(true)}
                                    >
                                        <Camera className="h-4 w-4 mr-2" />
                                        <span className="truncate">Análise de Imagem</span>
                                    </Button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                
                                <form onSubmit={handleSendMessage} className="relative">
                                    <div className={`relative bg-white dark:bg-gray-800/50 rounded-3xl border shadow-sm backdrop-blur-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all overflow-hidden ${!input.trim() ? 'border-glow-animation border-primary/40' : 'border-gray-200/50 dark:border-gray-700/30'}`}>
                                        {/* Botão + para expandir opções (estilo ChatGPT) */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setIsFooterButtonsExpanded(!isFooterButtonsExpanded)}
                                            className="absolute left-2 bottom-2.5 h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all z-10 flex-shrink-0"
                                            disabled={isGenerating || !currentAgent}
                                        >
                                            {isFooterButtonsExpanded ? (
                                                <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                            ) : (
                                                <Plus className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                            )}
                                        </Button>
                                        
                                        <Textarea 
                                            ref={textareaRef}
                                            value={input} 
                                            onChange={(e) => setInput(e.target.value)} 
                                            placeholder={currentAgent ? `Pergunte ao ${currentAgent.name}...` : 'Selecione um agente para começar.'} 
                                            className="pr-14 pl-12 py-3 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-3xl min-h-[52px] max-h-[200px] overflow-y-auto" 
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}} 
                                            disabled={isGenerating || !currentAgent} 
                                            rows={1}
                                            style={{ height: 'auto', minHeight: '52px', maxHeight: '200px' }}
                                        />
                                        <Button 
                                            type="submit" 
                                            size="icon" 
                                            className="absolute right-2 bottom-2.5 h-9 w-9 rounded-full bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all z-10 flex-shrink-0" 
                                            disabled={isGenerating || !input.trim() || !currentAgent}
                                        >
                                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                    <style>{`
                                        @keyframes glow {
                                            0%, 100% {
                                                border-color: rgba(59, 130, 246, 0.4);
                                                box-shadow: 0 0 5px rgba(59, 130, 246, 0.2), 0 0 10px rgba(59, 130, 246, 0.1), 0 0 15px rgba(59, 130, 246, 0.05);
                                            }
                                            50% {
                                                border-color: rgba(59, 130, 246, 0.7);
                                                box-shadow: 0 0 10px rgba(59, 130, 246, 0.4), 0 0 20px rgba(59, 130, 246, 0.2), 0 0 30px rgba(59, 130, 246, 0.1);
                                            }
                                        }
                                        .border-glow-animation {
                                            animation: glow 2s ease-in-out infinite;
                                        }
                                    `}</style>
                                </form>
                                <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2 mb-0">ApexIA é um assistente da JB APEX. Ocasionalmente, pode cometer erros.</p>
                            </div>
                        </footer>
                    </div>
                </div>
                <StoryIdeasGenerator
                    client={client}
                    isOpen={isStoryIdeasOpen}
                    onClose={() => setIsStoryIdeasOpen(false)}
                    currentAgent={currentAgent}
                />
                <ImageAnalyzer
                    client={client}
                    isOpen={isImageAnalyzerOpen}
                    onClose={() => setIsImageAnalyzerOpen(false)}
                    currentAgent={currentAgent}
                />
            </>
        );
    };

    export default PublicClientChat;