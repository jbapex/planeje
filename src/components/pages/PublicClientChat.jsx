import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
    import { useParams, useNavigate, useLocation } from 'react-router-dom';
    import { Helmet } from 'react-helmet';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Bot, User, Send, Loader2, Sparkles, Frown, Lightbulb, Clapperboard, ChevronDown, Check, Trash2, PlusCircle, X, Menu, FolderKanban, Download, Camera, Plus, Share, Settings, Briefcase, Wrench, TrendingUp, GraduationCap, Smile, RefreshCw, FileText, Image as ImageIcon } from 'lucide-react';
    import { PERSONALITY_TEMPLATES } from '@/lib/personalityTemplates';
import StoryIdeasGenerator from './StoryIdeasGenerator';
import ImageAnalyzer from './ImageAnalyzer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
    import { marked } from 'marked';
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        const [loadingTimeout, setLoadingTimeout] = useState(false);
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
        const [selectedTemplate, setSelectedTemplate] = useState(null);
        const [showTemplateSelector, setShowTemplateSelector] = useState(false);
        const scrollAreaRef = useRef(null);
        const [installPrompt, setInstallPrompt] = useState(null);
        const [isStoryIdeasOpen, setIsStoryIdeasOpen] = useState(false);
        const [isImageAnalyzerOpen, setIsImageAnalyzerOpen] = useState(false);
        const [isFooterButtonsExpanded, setIsFooterButtonsExpanded] = useState(false); // Opções começam escondidas, aparecem ao clicar no +
        const [logoError, setLogoError] = useState(false);
        const [isMobile, setIsMobile] = useState(false);
        const [isIOS, setIsIOS] = useState(false);
        const [isStandalone, setIsStandalone] = useState(false);
        const [showIOSInstructions, setShowIOSInstructions] = useState(false);
        const textareaRef = useRef(null);
        
        // Estados para imagem anexada no chat
        const [attachedImage, setAttachedImage] = useState(null);
        const [attachedImagePreview, setAttachedImagePreview] = useState(null);
        const [imageActionMode, setImageActionMode] = useState(null); // 'analyze', 'caption', 'post', null
        const fileInputRef = useRef(null);
        const cameraInputRef = useRef(null);
        const initialMessageCreatedRef = useRef(new Set()); // Rastreia sessões que já tiveram mensagem inicial criada
        
        // Estados para geração de imagem
        const [isGeneratingImage, setIsGeneratingImage] = useState(false);
        const [showImageGenerator, setShowImageGenerator] = useState(false);
        const [imagePrompt, setImagePrompt] = useState('');
        const [referenceImage, setReferenceImage] = useState(null);
        const [referenceImagePreview, setReferenceImagePreview] = useState(null);
        const [selectedImageModel, setSelectedImageModel] = useState('dall-e-3'); // 'dall-e-2', 'dall-e-3'
        const referenceImageInputRef = useRef(null);

        // Helper para obter o texto do modelo selecionado
        const getModelLabel = (model) => {
            const labels = {
                'dall-e-3': 'DALL-E 3 - Alta qualidade, estilo realista',
                'dall-e-2': 'DALL-E 2 - Variações de imagem'
            };
            return labels[model] || 'Selecione um modelo';
        };

        useEffect(() => {
            // Salva a URL atual no localStorage para o PWA saber para onde voltar
            localStorage.setItem('lastPublicChatUrl', location.pathname);
            
            // Atualiza o manifest para a rota do chat
            const updateManifest = () => {
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (manifestLink && clientId) {
                    // Cria um novo manifest dinâmico baseado na rota atual
                    // Como estamos usando HashRouter, precisa incluir o hash na URL
                    const currentPath = location.pathname + location.search;
                    const hashPath = `#${currentPath}`;
                    
                    // Cria um ID único para cada cliente, permitindo múltiplos PWAs instalados
                    const clientShortName = client?.empresa 
                        ? client.empresa.substring(0, 12).replace(/\s+/g, '') // Limita a 12 caracteres e remove espaços
                        : 'ApexIA';
                    
                    const manifestData = {
                        name: client?.empresa ? `ApexIA - ${client.empresa}` : 'ApexIA - Assistente de IA',
                        short_name: clientShortName, // Nome curto único por cliente
                        description: `ApexIA é o assistente de inteligência artificial da JB APEX para ${client?.empresa || 'você'}.`,
                        start_url: hashPath,
                        id: hashPath, // ID único baseado na rota do cliente
                        display: 'standalone',
                        background_color: '#111827',
                        theme_color: '#8B5CF6',
                        orientation: 'portrait-primary',
                        scope: '/', // Escopo global para permitir navegação
                        icons: [
                            {
                                src: '/icon-192x192.png',
                                sizes: '192x192',
                                type: 'image/png',
                                purpose: 'any maskable'
                            },
                            {
                                src: '/icon-512x512.png',
                                sizes: '512x512',
                                type: 'image/png',
                                purpose: 'any maskable'
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

        // Detecta dispositivo móvel e sistema operacional
        useEffect(() => {
            const checkDevice = () => {
                const userAgent = navigator.userAgent || navigator.vendor || window.opera;
                const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
                const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
                const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                                        (window.navigator.standalone) || 
                                        document.referrer.includes('android-app://');
                
                setIsMobile(isMobileDevice);
                setIsIOS(isIOSDevice);
                setIsStandalone(isStandaloneMode);
            };
            
            checkDevice();
            window.addEventListener('resize', checkDevice);
            
            return () => {
                window.removeEventListener('resize', checkDevice);
            };
        }, []);

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
            // Como estamos usando HashRouter, precisa incluir o hash na URL
            const currentPath = location.pathname + location.search;
            const hashPath = `#${currentPath}`;
            const manifestLink = document.querySelector('link[rel="manifest"]');
            if (manifestLink && client) {
                // Cria um ID único para cada cliente, permitindo múltiplos PWAs instalados
                const clientShortName = client?.empresa 
                    ? client.empresa.substring(0, 12).replace(/\s+/g, '') // Limita a 12 caracteres e remove espaços
                    : 'ApexIA';
                
                const manifestData = {
                    name: client.empresa ? `ApexIA - ${client.empresa}` : 'ApexIA - Assistente de IA',
                    short_name: clientShortName, // Nome curto único por cliente
                    description: `ApexIA é o assistente de inteligência artificial da JB APEX para ${client.empresa || 'você'}.`,
                    start_url: hashPath,
                    id: hashPath, // ID único baseado na rota do cliente
                    display: 'standalone',
                    background_color: '#111827',
                    theme_color: '#8B5CF6',
                    orientation: 'portrait-primary',
                    scope: '/', // Escopo global para permitir navegação
                    icons: [
                        {
                            src: '/icon-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any maskable'
                        },
                        {
                            src: '/icon-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable'
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

        // Função para carregar configuração de personalidade
        const loadPersonalityConfig = useCallback(async () => {
            try {
                const { data, error } = await supabase
                    .from('public_config')
                    .select('value')
                    .eq('key', 'apexia_client_personality_config')
                    .maybeSingle();
                
                if (error) {
                    console.warn('Erro ao carregar configuração de personalidade:', error);
                    return null;
                }
                
                if (data?.value) {
                    try {
                        return JSON.parse(data.value);
                    } catch (parseError) {
                        console.warn('Erro ao fazer parse da configuração de personalidade:', parseError);
                        return null;
                    }
                }
                
                return null;
            } catch (err) {
                console.warn('Erro ao carregar configuração de personalidade:', err);
                return null;
            }
        }, []);

        // Função para construir seção de personalidade (mesma lógica do preview)
        const buildPersonalitySection = useCallback((configData) => {
            if (!configData) return '';

            let section = '';

            // Traços de Personalidade
            if (configData.personality?.traits?.length > 0) {
                section += '**Traços de Personalidade:**\n';
                section += configData.personality.traits.map(t => `- ${t.charAt(0).toUpperCase() + t.slice(1)}`).join('\n') + '\n\n';
            }

            // Tom de Voz
            if (configData.personality?.tone_description) {
                section += `**Tom de Voz:** ${configData.personality.tone_description}\n\n`;
            }

            // Nível de Formalidade
            if (configData.personality?.formality) {
                const formalityLabels = {
                    casual: 'Casual',
                    profissional: 'Profissional',
                    formal: 'Formal'
                };
                section += `**Nível de Formalidade:** ${formalityLabels[configData.personality.formality] || configData.personality.formality}\n\n`;
            }

            // Comportamento
            if (configData.behavior) {
                section += '**Comportamento:**\n';
                
                if (configData.behavior.proactivity !== undefined) {
                    const proactivityLevel = configData.behavior.proactivity >= 70 ? 'Alta' : 
                                            configData.behavior.proactivity >= 40 ? 'Média' : 'Baixa';
                    section += `- Proatividade: ${configData.behavior.proactivity}% (${proactivityLevel})\n`;
                }
                
                if (configData.behavior.emoji_usage) {
                    const emojiLabels = {
                        none: 'Evitar emojis',
                        moderate: 'Usar moderadamente (1-2 por resposta)',
                        frequent: 'Usar quando apropriado'
                    };
                    section += `- Uso de emojis: ${emojiLabels[configData.behavior.emoji_usage] || configData.behavior.emoji_usage}\n`;
                }
                
                if (configData.behavior.response_format?.length > 0) {
                    const formatLabels = {
                        lists: 'Listas numeradas',
                        paragraphs: 'Parágrafos',
                        examples: 'Exemplos práticos',
                        highlights: 'Destaques/bold'
                    };
                    section += `- Formato de resposta: ${configData.behavior.response_format.map(f => formatLabels[f] || f).join(', ')}\n`;
                }
                
                section += '\n';
            }

            // Regras Personalizadas
            if (configData.custom_rules?.length > 0) {
                section += '**Regras Importantes:**\n';
                section += configData.custom_rules.map(rule => `- ${rule}`).join('\n') + '\n\n';
            }

            // Diretrizes de Resposta
            if (configData.response_guidelines) {
                const guidelines = [];
                if (configData.response_guidelines.use_lists) guidelines.push('Use listas quando apropriado');
                if (configData.response_guidelines.use_examples) guidelines.push('Inclua exemplos práticos');
                if (configData.response_guidelines.use_markdown) guidelines.push('Use formatação markdown para destacar informações');
                if (configData.response_guidelines.section_separation) guidelines.push('Separe informações em seções claras');
                if (configData.response_guidelines.progressive_responses) guidelines.push('Seja progressivo: faça perguntas antes de elaborar respostas muito longas');
                if (configData.response_guidelines.concise_first) guidelines.push('Seja conciso inicialmente e pergunte se o cliente quer mais detalhes');
                if (configData.response_guidelines.interactive_dialogue) guidelines.push('Priorize diálogo interativo ao invés de monólogos longos');
                
                if (guidelines.length > 0) {
                    section += '**Diretrizes de Resposta:**\n';
                    section += guidelines.map(g => `- ${g}`).join('\n') + '\n\n';
                }
            }

            return section.trim();
        }, []);

        const generateConversationTitle = useCallback(async (userMessage, aiResponse) => {
            try {
                const prompt = `Com base na seguinte conversa inicial, gere um título curto e descritivo (máximo 50 caracteres) para esta conversa. O título deve ser claro, profissional e resumir o assunto principal.

Mensagem do usuário: "${userMessage}"
Resposta da IA: "${aiResponse.substring(0, 200)}..."

Retorne APENAS o título, sem aspas, sem explicações, sem prefixos. Apenas o título.`;

                // Carregar configuração de personalidade para obter o modelo
                const personalityConfigForTitle = await loadPersonalityConfig();
                const selectedModelForTitle = personalityConfigForTitle?.ai_model || 'gpt-5.1';

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
                        model: selectedModelForTitle,
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
                setLoadingTimeout(false);
                return;
            }
            try {
                setLoading(true);
                setLoadingTimeout(false);
                
                // Timeout de segurança: força o loading como false após 15 segundos
                const timeoutId = setTimeout(() => {
                    console.warn('Timeout no carregamento inicial - forçando loading como false');
                    setLoadingTimeout(true);
                    setLoading(false);
                }, 15000);
                
                const [clientRes, agentsRes, projectsRes, sessionsRes] = await Promise.all([
                    supabase.from('clientes').select('*').eq('id', clientId).single(),
                    supabase.from('ai_agents').select('*').eq('is_active', true).order('created_at'),
                    supabase.from('projetos').select('id, name, status, mes_referencia').eq('client_id', clientId),
                    supabase.from('client_chat_sessions').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
                ]);

                clearTimeout(timeoutId);

                if (clientRes.error || !clientRes.data) throw new Error("Cliente não encontrado ou acesso não permitido.");
                const clientData = clientRes.data;
                setClient(clientData);
                setLogoError(false); // Reset logo error quando cliente muda
                
                // Carrega template escolhido pelo cliente (se existir)
                if (clientData.apexia_template && PERSONALITY_TEMPLATES[clientData.apexia_template]) {
                    setSelectedTemplate(clientData.apexia_template);
                }

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
                console.error('Erro ao carregar dados iniciais:', err);
                setError(err);
            } finally {
                setLoading(false);
                setLoadingTimeout(false);
            }
        }, [clientId, sessionId, navigate, handleNewSession]);

        const saveMessage = useCallback(async (message, currentSessionId) => {
            if (!currentSessionId) return;
            try {
                const messageData = {
                    session_id: currentSessionId,
                    role: message.role,
                    content: message.content
                };
                
                // Incluir imagem se existir
                if (message.image) {
                    messageData.image = message.image;
                }
                
                const { error } = await supabase.from('client_chat_messages').insert(messageData);
                if (error) {
                    console.error('Erro ao salvar mensagem:', error);
                }
            } catch (err) {
                console.error('Erro inesperado ao salvar mensagem:', err);
            }
        }, []);

        const fetchMessagesForSession = useCallback(async () => {
            if (!sessionId || !client) return;
            setLoading(true);
            
            // Timeout de segurança para mensagens
            const timeoutId = setTimeout(() => {
                console.warn('Timeout ao buscar mensagens - forçando loading como false');
                setLoading(false);
            }, 10000);
            
            try {
                const { data, error } = await supabase
                    .from('client_chat_messages')
                    .select('role, content, image')
                    .eq('session_id', sessionId)
                    .order('created_at');
                
                clearTimeout(timeoutId);
                
                if (error) {
                    console.error('Erro ao buscar mensagens:', error);
                    toast({ title: "Erro ao buscar mensagens", description: error.message, variant: "destructive" });
                    setMessages([]);
                } else if (data && data.length > 0) {
                    // Remove duplicatas baseado no conteúdo e role (caso haja duplicatas no banco)
                    const uniqueMessages = [];
                    const seen = new Set();
                    for (const msg of data) {
                        const key = `${msg.role}-${msg.content}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            uniqueMessages.push(msg);
                        }
                    }
                    setMessages(uniqueMessages);
                    // Marcar que esta sessão já tem mensagens
                    initialMessageCreatedRef.current.add(sessionId);
                } else {
                    // Nenhuma mensagem encontrada na primeira query
                    // Verificar novamente no banco se realmente não existe mensagem (double-check crítico)
                    // Isso evita criar mensagem duplicada ao recarregar a página
                    const { data: doubleCheck, error: doubleCheckError } = await supabase
                        .from('client_chat_messages')
                        .select('id, role, content, image')
                        .eq('session_id', sessionId)
                        .order('created_at');
                    
                    if (doubleCheckError) {
                        console.error('Erro ao verificar mensagens existentes:', doubleCheckError);
                        setMessages([]);
                        return;
                    }
                    
                    // Se encontrou mensagens no double-check, usa elas (remove duplicatas)
                    if (doubleCheck && doubleCheck.length > 0) {
                        const uniqueMessages = [];
                        const seen = new Set();
                        for (const msg of doubleCheck) {
                            const key = `${msg.role}-${msg.content}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                uniqueMessages.push(msg);
                            }
                        }
                        setMessages(uniqueMessages);
                        initialMessageCreatedRef.current.add(sessionId);
                        return;
                    }
                    
                    // Só cria mensagem inicial se REALMENTE não existir nenhuma mensagem no banco
                    // Verificar uma terceira vez para garantir (evita race conditions em recarregamentos)
                    const { data: finalCheck } = await supabase
                        .from('client_chat_messages')
                        .select('id')
                        .eq('session_id', sessionId)
                        .limit(1);
                    
                    if (finalCheck && finalCheck.length > 0) {
                        // Existe mensagem, buscar todas novamente
                        const { data: allMessages } = await supabase
                            .from('client_chat_messages')
                            .select('role, content, image')
                            .eq('session_id', sessionId)
                            .order('created_at');
                        if (allMessages && allMessages.length > 0) {
                            const uniqueMessages = [];
                            const seen = new Set();
                            for (const msg of allMessages) {
                                const key = `${msg.role}-${msg.content}`;
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    uniqueMessages.push(msg);
                                }
                            }
                            setMessages(uniqueMessages);
                            initialMessageCreatedRef.current.add(sessionId);
                        }
                        return;
                    }
                    
                    // Verificar se já tentamos criar mensagem inicial para esta sessão nesta execução
                    if (initialMessageCreatedRef.current.has(sessionId)) {
                        console.log('⚠️ Tentativa duplicada de criar mensagem inicial bloqueada para sessão:', sessionId);
                        return;
                    }
                    
                    // Marcar ANTES de criar para evitar race conditions
                    initialMessageCreatedRef.current.add(sessionId);
                    
                    // Criar mensagem inicial apenas se realmente não existir nenhuma
                    const initialMessage = {
                        role: 'assistant',
                        content: `Olá, ${client.nome_contato}! Eu sou o **ApexIA**, seu assistente de inteligência artificial da **JB APEX**. Selecione um agente abaixo e me diga como posso ser útil hoje.`
                    };
                    setMessages([initialMessage]);
                    await saveMessage(initialMessage, sessionId);
                }
            } catch (err) {
                console.error('Erro inesperado ao buscar mensagens:', err);
                clearTimeout(timeoutId);
                setMessages([]);
            } finally {
                setLoading(false);
            }
        }, [sessionId, client, toast, saveMessage]);

        useEffect(() => {
            fetchInitialData();
        }, [fetchInitialData]); 

        useEffect(() => {
            if (client && sessionId) {
                fetchMessagesForSession();
            }
        }, [sessionId, client, fetchMessagesForSession]);
        
        useEffect(() => {
            if (scrollAreaRef.current) {
                const scrollContainer = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
                if (scrollContainer) scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            }
        }, [messages, currentAIMessage]);
        
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

        // Funções para manipular imagens no chat
        const convertImageToBase64 = (file) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };

        const handleImageSelect = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // Validar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                toast({
                    title: 'Arquivo inválido',
                    description: 'Por favor, selecione uma imagem.',
                    variant: 'destructive'
                });
                return;
            }

            // Validar tamanho (máx 10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast({
                    title: 'Imagem muito grande',
                    description: 'Por favor, selecione uma imagem menor que 10MB.',
                    variant: 'destructive'
                });
                return;
            }

            setAttachedImage(file);
            const base64 = await convertImageToBase64(file);
            setAttachedImagePreview(base64);
            setImageActionMode(null); // Reset action mode
            
            // Limpar inputs
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        };

        const removeAttachedImage = () => {
            setAttachedImage(null);
            setAttachedImagePreview(null);
            setImageActionMode(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        };

        const handleImageAction = async (action) => {
            if (!attachedImage || !attachedImagePreview || !currentAgent) {
                toast({
                    title: 'Erro',
                    description: 'Por favor, anexe uma imagem primeiro.',
                    variant: 'destructive'
                });
                return;
            }

            setImageActionMode(action);
            setIsGenerating(true);
            setCurrentAIMessage(''); // Reset antes de começar

            try {
                // Preparar prompt do sistema baseado na ação
                let systemPrompt = currentAgent.prompt
                    .replace('{client_name}', client?.empresa || '')
                    .replace('{contact_name}', client?.nome_contato || '')
                    .replace('{client_niche}', client?.nicho || '')
                    .replace('{client_target_audience}', client?.publico_alvo || '')
                    .replace('{client_tone}', client?.tom_de_voz || '');

                systemPrompt += `\n\n**CONTEXTO DO CLIENTE:**
- Empresa: ${client?.empresa || 'Não informado'}
- Nicho: ${client?.nicho || 'Não informado'}
- Público-alvo: ${client?.publico_alvo || 'Não informado'}
- Tom de voz: ${client?.tom_de_voz || 'Não informado'}`;

                let userPrompt = '';
                
                switch (action) {
                    case 'analyze':
                        systemPrompt += `\n\n**SUA TAREFA:** Analise esta imagem detalhadamente e forneça insights estratégicos sobre ela. Seja específico, profissional e útil.`;
                        userPrompt = input.trim() || 'Analise esta imagem e me dê sua opinião detalhada sobre ela.';
                        break;
                    case 'caption':
                        systemPrompt += `\n\n**SUA TAREFA:** Crie uma legenda/caption profissional e engajadora para esta imagem, pronta para postar em redes sociais. Use o tom de voz do cliente e seja autêntico.`;
                        userPrompt = input.trim() || 'Crie uma legenda profissional para esta imagem.';
                        break;
                    case 'post':
                        systemPrompt += `\n\n**SUA TAREFA:** Crie uma sugestão completa de post para esta imagem, incluindo legenda, hashtags relevantes e estratégia de engajamento.`;
                        userPrompt = input.trim() || 'Crie uma sugestão completa de post para esta imagem.';
                        break;
                    default:
                        userPrompt = input.trim() || 'O que você acha dessa imagem?';
                }

                const apiMessages = [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt },
                            { type: 'image_url', image_url: { url: attachedImagePreview } }
                        ]
                    }
                ];

                console.log('🔵 Iniciando análise de imagem...', { action, hasImage: !!attachedImagePreview });

                // Usar Edge Function do Supabase (mesma lógica do chat normal)
                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ 
                        messages: apiMessages, 
                        model: 'gpt-4o',
                        stream: true
                    }),
                });

                if (error) {
                    console.error('❌ Erro na Edge Function:', error);
                    throw error;
                }

                if (!data?.body) {
                    console.error('❌ Resposta sem body da Edge Function');
                    throw new Error('Resposta vazia da Edge Function');
                }

                console.log('✅ Processando stream de resposta da imagem...');

                // Processar stream (mesma lógica do chat normal)
                // streamAIResponse já atualiza setCurrentAIMessage durante o streaming
                const fullResponse = await streamAIResponse(data);
                
                console.log('✅ Análise de imagem completa!', { length: fullResponse.length });

                // Adicionar mensagens ao histórico
                const userMessage = { 
                    role: 'user', 
                    content: userPrompt,
                    image: attachedImagePreview 
                };
                const assistantMessage = { role: 'assistant', content: fullResponse };
                
                setMessages(prev => [...prev, userMessage, assistantMessage]);
                await saveMessage(userMessage, sessionId);
                await saveMessage(assistantMessage, sessionId);

                // Limpar imagem anexada após processar
                removeAttachedImage();
                setInput('');

            } catch (error) {
                console.error('Erro ao processar imagem:', error);
                toast({
                    title: 'Erro ao processar imagem',
                    description: error.message || 'Não foi possível processar a imagem.',
                    variant: 'destructive'
                });
            } finally {
                setIsGenerating(false);
                setImageActionMode(null);
                setCurrentAIMessage('');
            }
        };

        const handleReferenceImageSelect = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                toast({
                    title: 'Arquivo inválido',
                    description: 'Por favor, selecione uma imagem.',
                    variant: 'destructive'
                });
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                toast({
                    title: 'Arquivo muito grande',
                    description: 'A imagem deve ter no máximo 10MB.',
                    variant: 'destructive'
                });
                return;
            }

            const base64 = await convertImageToBase64(file);
            setReferenceImage(file);
            setReferenceImagePreview(base64);
            if (referenceImageInputRef.current) referenceImageInputRef.current.value = '';
        };

        const removeReferenceImage = () => {
            setReferenceImage(null);
            setReferenceImagePreview(null);
            if (referenceImageInputRef.current) referenceImageInputRef.current.value = '';
        };

        const handleGenerateImage = async (prompt) => {
            // Validar: precisa de prompt OU imagem de referência
            if ((!prompt || !prompt.trim()) && !referenceImagePreview) {
                toast({
                    title: 'Erro',
                    description: 'Por favor, descreva a imagem que deseja gerar ou anexe uma imagem de referência.',
                    variant: 'destructive'
                });
                return;
            }

            if (!currentAgent || !sessionId) {
                toast({
                    title: 'Erro',
                    description: 'Por favor, selecione um agente primeiro.',
                    variant: 'destructive'
                });
                return;
            }

            setIsGeneratingImage(true);
            setShowImageGenerator(false);

            try {
                let finalPrompt = prompt?.trim() || '';

                // Se há imagem de referência, usar variações (DALL-E 2 ou Gemini)
                if (referenceImagePreview) {
                    toast({
                        title: 'Gerando variação da imagem...',
                        description: 'Criando uma nova imagem baseada na sua referência.',
                    });

                    // Usar Image Variations API
                    const { data, error } = await supabase.functions.invoke('openai-image-generation', {
                        body: {
                            imageBase64: referenceImagePreview,
                            useVariation: true,
                            size: '1024x1024',
                            model: selectedImageModel, // Enviar modelo selecionado
                        },
                    });

                    if (error) {
                        throw new Error(error.message || 'Erro ao gerar variação da imagem');
                    }

                    if (!data?.success || !data?.imageUrl) {
                        throw new Error(data?.error || 'Não foi possível gerar a variação da imagem');
                    }

                    // Criar mensagens para o chat
                    const userMessage = {
                        role: 'user',
                        content: prompt.trim() 
                            ? `Gere uma variação desta imagem: ${prompt.trim()}`
                            : 'Gere uma variação desta imagem',
                        image: referenceImagePreview
                    };
                    const assistantMessage = {
                        role: 'assistant',
                        content: `Aqui está a variação gerada a partir da sua imagem:`,
                        image: data.imageUrl
                    };

                    setMessages(prev => [...prev, userMessage, assistantMessage]);
                    await saveMessage(userMessage, sessionId);
                    await saveMessage(assistantMessage, sessionId);

                    // Limpar imagem de referência após gerar
                    removeReferenceImage();
                    setImagePrompt('');

                    toast({
                        title: 'Variação gerada!',
                        description: 'A nova imagem foi criada a partir da sua referência.',
                    });

                    setIsGeneratingImage(false);
                    return;
                }

                // Se não há imagem de referência, usar modelo selecionado com prompt
                console.log('🖼️ Gerando imagem com modelo:', selectedImageModel, 'Prompt:', finalPrompt.substring(0, 50));
                const { data, error } = await supabase.functions.invoke('openai-image-generation', {
                    body: {
                        prompt: finalPrompt,
                        size: '1024x1024',
                        quality: 'standard',
                        style: 'vivid',
                        model: selectedImageModel, // Enviar modelo selecionado
                    },
                });

                if (error) {
                    throw new Error(error.message || 'Erro ao gerar imagem');
                }

                if (!data?.success || !data?.imageUrl) {
                    throw new Error(data?.error || 'Não foi possível gerar a imagem');
                }

                // Criar mensagens para o chat
                const userMessage = {
                    role: 'user',
                    content: referenceImagePreview 
                        ? `Gere uma imagem inspirada nesta referência: ${prompt.trim()}`
                        : `Gere uma imagem: ${prompt.trim()}`,
                    image: referenceImagePreview || null
                };
                const assistantMessage = {
                    role: 'assistant',
                    content: `Aqui está a imagem gerada${referenceImagePreview ? ' inspirada na sua referência' : ''}:`,
                    image: data.imageUrl
                };

                setMessages(prev => [...prev, userMessage, assistantMessage]);
                await saveMessage(userMessage, sessionId);
                await saveMessage(assistantMessage, sessionId);

                // Limpar imagem de referência após gerar
                removeReferenceImage();
                setImagePrompt('');

                toast({
                    title: 'Imagem gerada!',
                    description: referenceImagePreview 
                        ? 'A imagem foi gerada inspirada na sua referência.'
                        : 'A imagem foi adicionada ao chat.',
                });
            } catch (error) {
                console.error('Erro ao gerar imagem:', error);
                toast({
                    title: 'Erro ao gerar imagem',
                    description: error.message || 'Não foi possível gerar a imagem.',
                    variant: 'destructive'
                });
            } finally {
                setIsGeneratingImage(false);
            }
        };

        const handleSendMessage = async (e) => {
            e.preventDefault();
            if (isGenerating || !currentAgent || !sessionId) return;
            
            // Se há imagem anexada mas nenhuma ação foi selecionada, não fazer nada
            if (attachedImage && !imageActionMode) {
                toast({
                    title: 'Selecione uma ação',
                    description: 'Escolha o que você quer fazer com a imagem anexada.',
                    variant: 'default'
                });
                return;
            }

            // Se há imagem anexada e ação selecionada, usar fluxo de imagem
            if (attachedImage && imageActionMode) {
                await handleImageAction(imageActionMode);
                return;
            }

            // Se não há texto e não há imagem, não fazer nada
            if (!input.trim()) return;
            
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

            // Carregar configuração de personalidade
            const personalityConfig = await loadPersonalityConfig();
            
            // Se o cliente escolheu um template, usar ele; senão usar a configuração global
            let finalConfig = personalityConfig;
            if (selectedTemplate && PERSONALITY_TEMPLATES[selectedTemplate]) {
                // Merge: template do cliente sobrescreve configuração global
                finalConfig = {
                    ...personalityConfig,
                    ...PERSONALITY_TEMPLATES[selectedTemplate].config,
                    // Mantém client_data_access da configuração global se existir
                    client_data_access: personalityConfig?.client_data_access || PERSONALITY_TEMPLATES[selectedTemplate].config.client_data_access
                };
            }
            
            const personalitySection = buildPersonalitySection(finalConfig);
            const selectedModel = finalConfig?.ai_model || personalityConfig?.ai_model || 'gpt-5.1';

            // Verificar quais campos o ApexIA tem permissão para acessar
            const dataAccess = finalConfig?.client_data_access || personalityConfig?.client_data_access || {};
            const hasAccess = (field) => dataAccess[field] !== false; // Por padrão, se não estiver configurado, tem acesso

            // Construir seção de informações do cliente ANTES do prompt do agente
            // Incluir apenas os campos que o ApexIA tem permissão para acessar
            let clientInfoSection = `\n\n**📋 INFORMAÇÕES COMPLETAS DO CLIENTE (VOCÊ TEM ACESSO A TUDO ISSO):**\n`;
            
            // Informações Básicas
            if (hasAccess('empresa') && client.empresa) clientInfoSection += `**Empresa:** ${client.empresa}\n`;
            if (hasAccess('nome_contato') && client.nome_contato) clientInfoSection += `**Contato:** ${client.nome_contato}\n`;
            if (hasAccess('nicho') && client.nicho) clientInfoSection += `**Nicho:** ${client.nicho}\n`;
            if (hasAccess('publico_alvo') && client.publico_alvo) clientInfoSection += `**Público-Alvo:** ${client.publico_alvo}\n`;
            if (hasAccess('tom_de_voz') && client.tom_de_voz) clientInfoSection += `**Tom de Voz:** ${client.tom_de_voz}\n`;
            
            // Informações da Empresa
            if (hasAccess('sobre_empresa') && client.sobre_empresa) clientInfoSection += `**Sobre a Empresa:** ${client.sobre_empresa}\n`;
            if (hasAccess('produtos_servicos') && client.produtos_servicos) clientInfoSection += `**Produtos/Serviços:** ${client.produtos_servicos}\n`;
            if (hasAccess('avaliacao_treinamento') && client.avaliacao_treinamento) clientInfoSection += `**Avaliação/Treinamento:** ${client.avaliacao_treinamento}\n`;
            
            // Informações de Contrato
            if (hasAccess('tipo_contrato') && client.tipo_contrato) clientInfoSection += `**Tipo de Contrato:** ${client.tipo_contrato}\n`;
            if (hasAccess('valor') && client.valor) clientInfoSection += `**Valor Mensal:** R$ ${parseFloat(client.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
            if (hasAccess('vencimento') && client.vencimento) {
                const vencimentoDate = new Date(client.vencimento);
                clientInfoSection += `**Vencimento do Contrato:** ${vencimentoDate.toLocaleDateString('pt-BR')}\n`;
            }
            
            // Informações de Gestão
            if (hasAccess('etapa') && client.etapa) clientInfoSection += `**Etapa do Funil:** ${client.etapa}\n`;
            if (hasAccess('responsavel') && client.responsavel) {
                // Buscar nome do responsável se necessário (pode ser UUID)
                clientInfoSection += `**Responsável:** ${client.responsavel}\n`;
            }
            
            // Redes Sociais
            if (hasAccess('instagram') && client.instagram) clientInfoSection += `**Instagram:** ${client.instagram}\n`;
            
            // Documento do Cliente (pode conter informações importantes)
            if (hasAccess('client_document') && client.client_document) {
                // Remove tags HTML para exibir apenas texto
                const docText = client.client_document.replace(/<[^>]*>/g, '').trim();
                if (docText && docText.length > 0) {
                    clientInfoSection += `**Documento/Notas do Cliente:** ${docText.substring(0, 1000)}${docText.length > 1000 ? '...' : ''}\n`;
                }
            }
            
            // Documentos do Cliente com acesso do ApexIA (da tabela client_documents)
            if (hasAccess('client_documents')) {
                try {
                    const { data: accessibleDocuments, error: docsError } = await supabase
                        .from('client_documents')
                        .select('id, title, content')
                        .eq('client_id', client.id)
                        .eq('apexia_access', true)
                        .order('created_at', { ascending: false });
                    
                    if (!docsError && accessibleDocuments && accessibleDocuments.length > 0) {
                        // Incluir documentos de forma discreta, sem mencionar explicitamente que são "disponíveis para o ApexIA"
                        // Os documentos são incluídos como parte das informações do cliente
                        accessibleDocuments.forEach((doc, index) => {
                            // Extrair texto do conteúdo (pode ser JSON com text_content ou HTML)
                            let docText = '';
                            if (doc.content) {
                                if (typeof doc.content === 'string') {
                                    docText = doc.content.replace(/<[^>]*>/g, '').trim();
                                } else if (doc.content.text_content) {
                                    docText = doc.content.text_content.replace(/<[^>]*>/g, '').trim();
                                }
                            }
                            
                            if (docText && docText.length > 0) {
                                // Limitar tamanho de cada documento para não exceder o limite do contexto
                                const maxDocLength = 2000;
                                const truncatedText = docText.length > maxDocLength 
                                    ? docText.substring(0, maxDocLength) + '...' 
                                    : docText;
                                
                                // Incluir como parte das informações do cliente, sem mencionar que são documentos separados
                                clientInfoSection += `\n**${doc.title || 'Informações Adicionais'}:**\n${truncatedText}\n`;
                            }
                        });
                    }
                } catch (error) {
                    console.error('Erro ao buscar documentos do cliente:', error);
                    // Não adiciona nada se houver erro, continua normalmente
                }
            }
            
            // Etiquetas se existirem
            if (hasAccess('etiquetas') && client.etiquetas && Array.isArray(client.etiquetas) && client.etiquetas.length > 0) {
                clientInfoSection += `**Etiquetas:** ${client.etiquetas.join(', ')}\n`;
            }

            // Construir prompt base do agente
            let systemPrompt = `**SOBRE VOCÊ - APEXIA DA JB APEX:**

Você é ApexIA, o assistente inteligente desenvolvido e configurado pela JB APEX especificamente para este cliente.

**IMPORTANTE - IDENTIDADE:**
- Você NÃO é o ChatGPT genérico da OpenAI
- Você é um assistente personalizado criado pela JB APEX
- Você foi configurado especificamente para este cliente com suas informações, personalidade e regras customizadas
- Você faz parte do sistema de gestão JB APEX, não é uma cópia ou versão genérica do GPT
- Quando o cliente perguntar sobre você, deixe claro que você é o ApexIA da JB APEX, configurado especialmente para ele

**Sua missão:**
Ajudar este cliente de forma personalizada, usando todas as informações e configurações que a JB APEX preparou especificamente para ele.

---

${currentAgent.prompt
                .replace('{client_name}', client.empresa || '')
                .replace('{contact_name}', client.nome_contato || '')
                .replace('{client_niche}', client.nicho || '')
                .replace('{client_target_audience}', client.publico_alvo || '')
                .replace('{client_tone}', client.tom_de_voz || '')}`;

            // Adicionar informações do cliente logo após o prompt base
            systemPrompt += clientInfoSection;

            // Adicionar seção de personalidade se existir configuração
            if (personalitySection) {
                systemPrompt += `\n\n**Personalidade e Comportamento:**\n${personalitySection}`;
            }

            // Adicionar informações de contexto (projetos) apenas se tiver acesso
            if (hasAccess('projetos')) {
            systemPrompt += `\n\n**Informações de Contexto (se necessário):**\n**Projetos Atuais Selecionados:**\n${projectsInfo}`;
            }
            
            // Adicionar instruções importantes e explícitas
            systemPrompt += `\n\n**🚨 REGRAS CRÍTICAS DE RESPOSTA - LEIA COM ATENÇÃO:**`;
            systemPrompt += `\n\n**SOBRE ACESSO A INFORMAÇÕES:**`;
            systemPrompt += `\n- Você TEM ACESSO às informações do cliente listadas na seção "INFORMAÇÕES COMPLETAS DO CLIENTE" acima.`;
            
            // Listar quais campos estão disponíveis baseado na configuração
            const availableFields = [];
            if (hasAccess('empresa')) availableFields.push('empresa');
            if (hasAccess('nome_contato')) availableFields.push('contato');
            if (hasAccess('nicho')) availableFields.push('nicho');
            if (hasAccess('publico_alvo')) availableFields.push('público-alvo');
            if (hasAccess('tom_de_voz')) availableFields.push('tom de voz');
            if (hasAccess('sobre_empresa')) availableFields.push('sobre a empresa');
            if (hasAccess('produtos_servicos')) availableFields.push('produtos/serviços');
            if (hasAccess('avaliacao_treinamento')) availableFields.push('avaliação/treinamento');
            if (hasAccess('tipo_contrato')) availableFields.push('tipo de contrato');
            if (hasAccess('valor')) availableFields.push('valor mensal');
            if (hasAccess('vencimento')) availableFields.push('vencimento');
            if (hasAccess('etapa')) availableFields.push('etapa do funil');
            if (hasAccess('responsavel')) availableFields.push('responsável');
            if (hasAccess('instagram')) availableFields.push('Instagram');
            if (hasAccess('client_document')) availableFields.push('documento/notas');
            if (hasAccess('etiquetas')) availableFields.push('etiquetas');
            if (hasAccess('projetos')) availableFields.push('projetos');
            
            if (availableFields.length > 0) {
                systemPrompt += `\n- Você tem acesso às seguintes informações: ${availableFields.join(', ')}.`;
            }
            
            systemPrompt += `\n- Use SEMPRE as informações disponíveis acima para responder perguntas sobre o cliente de forma completa e útil.`;
            systemPrompt += `\n- NUNCA diga que tem "informações limitadas", "informações apenas no contexto dos projetos" ou que "não sabe" sobre o cliente quando essas informações estão claramente disponíveis acima.`;
            systemPrompt += `\n- IMPORTANTE: Use as informações disponíveis de forma natural e discreta. NÃO mencione explicitamente que você tem acesso a "documentos", "arquivos" ou "documentos específicos" - simplesmente use as informações como parte do seu conhecimento sobre o cliente, como se fossem informações que você já conhece.`;
            
            systemPrompt += `\n\n**RESPOSTA ESPECÍFICA PARA "O QUE VOCÊ SABE SOBRE MIM?":**`;
            systemPrompt += `\nQuando o cliente perguntar "o que você sabe sobre mim?", "oque sabe sobre mim?", "o que sabe de mim?" ou qualquer variação similar, você DEVE:`;
            systemPrompt += `\n1. Responder de forma positiva e completa, começando com algo como "Tenho acesso às informações cadastradas sobre você!" ou "Sei bastante sobre você e sua empresa!"`;
            systemPrompt += `\n2. Listar TODAS as informações disponíveis sobre o cliente (conforme listado acima) de forma organizada e completa.`;
            systemPrompt += `\n3. Incluir apenas as informações que estão realmente disponíveis na seção "INFORMAÇÕES COMPLETAS DO CLIENTE" acima.`;
            systemPrompt += `\n4. NUNCA diga que tem informações limitadas ou apenas sobre projetos. Liste todas as informações que você tem acesso.`;
            
            // Adicionar regras de respostas progressivas apenas se estiverem habilitadas no template/config
            if (finalConfig?.response_guidelines?.progressive_responses || finalConfig?.response_guidelines?.concise_first || finalConfig?.response_guidelines?.interactive_dialogue) {
                systemPrompt += `\n\n**REGRAS DE RESPOSTAS PROGRESSIVAS (MUITO IMPORTANTE):**`;
                
                if (finalConfig?.response_guidelines?.progressive_responses) {
                    systemPrompt += `\n- NUNCA dê respostas muito longas de uma vez só. Sempre seja progressivo e interativo.`;
                    systemPrompt += `\n- Quando o cliente pedir algo amplo (ex: "criar um plano", "ajudar com marketing", "fazer estratégia"), PRIMEIRO faça perguntas para entender o que ele precisa especificamente.`;
                    systemPrompt += `\n- Evite criar planos completos, estratégias extensas ou respostas muito detalhadas sem primeiro entender melhor o que o cliente precisa.`;
                }
                
                if (finalConfig?.response_guidelines?.concise_first) {
                    systemPrompt += `\n- Seja CONCISO inicialmente. Dê uma resposta curta e pergunte se o cliente quer mais detalhes antes de elaborar muito.`;
                }
                
                if (finalConfig?.response_guidelines?.interactive_dialogue) {
                    systemPrompt += `\n- Priorize DIÁLOGO INTERATIVO ao invés de monólogos longos. Faça perguntas, espere respostas, e então expanda conforme necessário.`;
                }
                
                systemPrompt += `\n- Exemplo CORRETO: Cliente: "quero criar um plano para 2026" → Você: "Ótimo! Para criar um plano personalizado, preciso entender melhor suas necessidades. Qual é o foco principal para 2026? Você quer focar em crescimento, qualidade, ou algo específico?"`;
                systemPrompt += `\n- Exemplo INCORRETO: Cliente: "quero criar um plano para 2026" → Você: [resposta de 50+ linhas com plano completo sem perguntar nada]`;
            }
            
            systemPrompt += `\n\n**OUTRAS REGRAS:**`;
            systemPrompt += `\n- Se o usuário perguntar sobre algo que NÃO está nas informações disponíveis acima, então você pode sugerir criar uma solicitação. Use o shortcode **[CONFIRMAR_SOLICITACAO]** ao final da sua pergunta. Exemplo: "Para isso, o ideal é falar com nossa equipe. Você gostaria de criar uma solicitação agora? [CONFIRMAR_SOLICITACAO]"`;
            
            // Construir histórico de conversa incluindo imagens quando existirem
            const conversationHistory = messages.slice(-6).map(m => {
                // Se a mensagem tem imagem, incluir no formato correto para a API
                if (m.image) {
                    return {
                        role: m.role,
                        content: [
                            { type: 'text', text: m.content || '' },
                            { type: 'image_url', image_url: { url: m.image } }
                        ]
                    };
                }
                // Mensagem normal sem imagem
                return { role: m.role, content: m.content };
            });
            
            const apiMessages = [{ role: 'system', content: systemPrompt }, ...conversationHistory, userMessage];

            try {
                console.log('🔵 Iniciando chamada para Edge Function openai-chat...', {
                    messagesCount: apiMessages.length,
                    model: selectedModel
                });

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ messages: apiMessages, model: selectedModel }),
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
                    <p className="mt-4 text-sm sm:text-lg">Carregando assistente...</p>
                    {loadingTimeout && (
                        <div className="mt-6 text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                O carregamento está demorando mais que o esperado.
                            </p>
                            <Button 
                                onClick={() => {
                                    setLoading(false);
                                    setLoadingTimeout(false);
                                    fetchInitialData();
                                }}
                                variant="outline"
                                className="mt-2"
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Recarregar
                            </Button>
                        </div>
                    )}
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
                    <p className="mt-4 text-sm sm:text-lg">Carregando dados do cliente...</p>
                </div>
            );
        }
        
        const CurrentAgentIcon = currentAgent ? (ICONS[currentAgent.icon] || ICONS.Default) : Sparkles;

        const SessionSidebar = () => (
          <aside className={`absolute md:relative z-20 md:z-auto h-full w-64 bg-gray-100 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-800 flex flex-col transition-transform transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
              <div className="p-4 border-b border-gray-300 dark:border-gray-800 flex justify-between items-center bg-gray-100 dark:bg-gray-900">
                  <h2 className="font-semibold text-base sm:text-lg dark:text-white">Conversas</h2>
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
                              <span className="truncate text-xs sm:text-sm font-medium dark:text-gray-200">{s.title}</span>
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
                               <div className="min-w-0"><h1 className="font-semibold text-base sm:text-lg dark:text-white">ApexIA</h1><p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">para {client?.empresa || 'Cliente'}</p></div>
                            </div>
                             {/* Botão de instalação PWA - mostra em mobile e não se já estiver instalado */}
                             {isMobile && !isStandalone && (installPrompt || isIOS) && (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                        if (isIOS) {
                                            setShowIOSInstructions(true);
                                        } else if (installPrompt) {
                                            handleInstallClick();
                                        }
                                    }} 
                                    className="flex items-center gap-2 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <Download className="h-4 w-4" />
                                    {isIOS ? 'Adicionar à Tela Inicial' : 'Instalar App'}
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
                                                    {msg.image && (
                                                        <div className="mb-3">
                                                            <img 
                                                                src={msg.image} 
                                                                alt="Anexada" 
                                                                className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-base sm:text-base">{renderMessageContent(msg.content)}</div>
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
                                {/* Botões de Acesso Rápido - Sempre visíveis */}
                                <div className="mb-2 flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs flex-shrink-0 min-w-0 px-2 sm:px-3"
                                            >
                                                {selectedTemplate ? (
                                                    <>
                                                        {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Consultor Estratégico' && <Briefcase className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Suporte Técnico' && <Wrench className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Assistente de Vendas' && <TrendingUp className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Educador' && <GraduationCap className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Casual e Amigável' && <Smile className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        {!['Consultor Estratégico', 'Suporte Técnico', 'Assistente de Vendas', 'Educador', 'Casual e Amigável'].includes(PERSONALITY_TEMPLATES[selectedTemplate]?.name) && <Settings className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />}
                                                        <span className="truncate">
                                                            {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Consultor Estratégico' && 'Consultor'}
                                                            {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Suporte Técnico' && 'Suporte'}
                                                            {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Assistente de Vendas' && 'Vendas'}
                                                            {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Educador' && 'Educador'}
                                                            {PERSONALITY_TEMPLATES[selectedTemplate]?.name === 'Casual e Amigável' && 'Casual'}
                                                            {!['Consultor Estratégico', 'Suporte Técnico', 'Assistente de Vendas', 'Educador', 'Casual e Amigável'].includes(PERSONALITY_TEMPLATES[selectedTemplate]?.name) && PERSONALITY_TEMPLATES[selectedTemplate]?.name}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Settings className="h-3.5 w-3.5 mr-1.5 sm:mr-2 flex-shrink-0" />
                                                        <span className="truncate">Como o ApexIA responde</span>
                                                    </>
                                                )}
                                                <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50 flex-shrink-0" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] dark:bg-gray-800/95 dark:border-gray-700/50 rounded-2xl border-gray-200/50 backdrop-blur-sm max-h-[400px] overflow-y-auto">
                                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                Escolha como você quer que o ApexIA converse com você:
                                            </div>
                                            <DropdownMenuItem 
                                                onSelect={(e) => e.preventDefault()} 
                                                onClick={async () => {
                                                    setSelectedTemplate(null);
                                                    if (clientId) {
                                                        const { error } = await supabase.from('clientes').update({ apexia_template: null }).eq('id', clientId);
                                                        if (error) {
                                                            toast({
                                                                title: 'Ops!',
                                                                description: 'Não foi possível salvar. Tente novamente.',
                                                                variant: 'destructive'
                                                            });
                                                        } else {
                                                            toast({
                                                                title: 'Estilo alterado!',
                                                                description: 'O ApexIA voltou ao estilo padrão configurado pela sua equipe.'
                                                            });
                                                        }
                                                    }
                                                }}
                                                className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg"
                                            >
                                                <span>Padrão da sua equipe</span>
                                                {!selectedTemplate && <Check className="h-4 w-4 ml-auto" />}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator className="dark:bg-gray-700/50" />
                                            {Object.entries(PERSONALITY_TEMPLATES).map(([key, template]) => {
                                                const Icon = 
                                                    template.name === 'Consultor Estratégico' ? Briefcase :
                                                    template.name === 'Suporte Técnico' ? Wrench :
                                                    template.name === 'Assistente de Vendas' ? TrendingUp :
                                                    template.name === 'Educador' ? GraduationCap :
                                                    template.name === 'Casual e Amigável' ? Smile : Settings;
                                                
                                                const clientDescription = 
                                                    template.name === 'Consultor Estratégico' ? 'Ideal se você quer orientação estratégica e insights profundos' :
                                                    template.name === 'Suporte Técnico' ? 'Perfeito para resolver problemas e tirar dúvidas rapidamente' :
                                                    template.name === 'Assistente de Vendas' ? 'Ótimo para conversas focadas em resultados e crescimento' :
                                                    template.name === 'Educador' ? 'Ideal para aprender e entender conceitos de forma didática' :
                                                    template.name === 'Casual e Amigável' ? 'Para conversas descontraídas, como falar com um amigo' :
                                                    template.description;
                                                
                                                return (
                                                    <DropdownMenuItem
                                                        key={key}
                                                        onSelect={(e) => e.preventDefault()}
                                                        onClick={async () => {
                                                            setSelectedTemplate(key);
                                                            if (clientId) {
                                                                const { error } = await supabase
                                                                    .from('clientes')
                                                                    .update({ apexia_template: key })
                                                                    .eq('id', clientId);
                                                                if (error) {
                                                                    toast({
                                                                        title: 'Ops!',
                                                                        description: 'Não foi possível salvar. Tente novamente.',
                                                                        variant: 'destructive'
                                                                    });
                                                                } else {
                                                                    toast({
                                                                        title: 'Estilo alterado!',
                                                                        description: `Agora o ApexIA vai conversar com você no estilo "${template.name}".`
                                                                    });
                                                                }
                                                            }
                                                        }}
                                                        className="dark:text-white dark:hover:bg-gray-700/50 rounded-lg"
                                                    >
                                                        <div className="flex flex-col flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <Icon className="h-4 w-4" />
                                                                <span className="font-medium">{template.name}</span>
                                                            </div>
                                                            <span className="text-xs text-muted-foreground ml-6">{clientDescription}</span>
                                                        </div>
                                                        {selectedTemplate === key && <Check className="h-4 w-4 ml-auto flex-shrink-0" />}
                                                    </DropdownMenuItem>
                                                );
                                            })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    
                                    {/* Botão de Stories - discreto ao lado */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsStoryIdeasOpen(true)}
                                        className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex-shrink-0 min-w-0 px-2 sm:px-3"
                                        disabled={!currentAgent}
                                    >
                                        <Lightbulb className="h-3.5 w-3.5 mr-1.5 sm:mr-2 text-yellow-500 flex-shrink-0" />
                                        <span className="truncate">Stories</span>
                                    </Button>
                                    
                                    {/* Botão de Gerar Imagem - discreto ao lado */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowImageGenerator(true)}
                                        className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex-shrink-0 min-w-0 px-2 sm:px-3"
                                        disabled={!currentAgent || isGeneratingImage}
                                    >
                                        {isGeneratingImage ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 mr-1.5 sm:mr-2 animate-spin flex-shrink-0" />
                                                <span className="truncate">Gerando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ImageIcon className="h-3.5 w-3.5 mr-1.5 sm:mr-2 text-purple-500 flex-shrink-0" />
                                                <span className="truncate">Gerar Imagem</span>
                                            </>
                                        )}
                                    </Button>
                                </div>

                                {/* Container dos botões - controlado por botão + (estilo ChatGPT) */}
                                <AnimatePresence>
                                    {isFooterButtonsExpanded && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="mb-3 overflow-hidden"
                                        >
                                            {/* Seção: Configurações do Chat */}
                                            <div className="mb-3">
                                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-1">
                                                    Configurações
                                                </p>
                                                <div className="flex flex-col sm:flex-row gap-2">
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
                                                                <span className="truncate">{selectedProjectIds.size} projeto(s)</span>
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
                                                </div>
                                            </div>

                                            {/* Seção de Ferramentas removida - Stories agora está sempre visível ao lado de "Como o ApexIA responde" */}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                
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
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                                    O que você quer fazer com essa imagem?
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        type="button"
                                                        variant={imageActionMode === 'analyze' ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setImageActionMode('analyze')}
                                                        disabled={isGenerating}
                                                        className="text-xs"
                                                    >
                                                        <Sparkles className="h-3 w-3 mr-1" />
                                                        Analisar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant={imageActionMode === 'caption' ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setImageActionMode('caption')}
                                                        disabled={isGenerating}
                                                        className="text-xs"
                                                    >
                                                        <FileText className="h-3 w-3 mr-1" />
                                                        Criar Legenda
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant={imageActionMode === 'post' ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setImageActionMode('post')}
                                                        disabled={isGenerating}
                                                        className="text-xs"
                                                    >
                                                        <Share className="h-3 w-3 mr-1" />
                                                        Sugerir Post
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={removeAttachedImage}
                                                        disabled={isGenerating}
                                                        className="text-xs"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <form onSubmit={handleSendMessage} className="relative">
                                    <div className={`relative bg-white dark:bg-gray-800/50 rounded-3xl border shadow-sm backdrop-blur-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all overflow-hidden ${!input.trim() && !attachedImage ? 'border-glow-animation border-primary/40' : 'border-gray-200/50 dark:border-gray-700/30'}`}>
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
                                        
                                        {/* Botão de anexar imagem - sempre visível */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                if (isMobile && !isIOS) {
                                                    cameraInputRef.current?.click();
                                                } else {
                                                    fileInputRef.current?.click();
                                                }
                                            }}
                                            className="absolute left-12 bottom-2.5 h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all z-20 flex-shrink-0 bg-white dark:bg-gray-800"
                                            disabled={isGenerating || !currentAgent}
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
                                            placeholder="Pergunte ao ApexIA..." 
                                            className="pr-14 py-3 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-3xl min-h-[52px] max-h-[200px] overflow-y-auto text-base sm:text-base"
                                            style={{ paddingLeft: '5.5rem', height: 'auto', minHeight: '52px', maxHeight: '200px' }} 
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}} 
                                            disabled={isGenerating || !currentAgent} 
                                            rows={1}
                                        />
                                        <Button 
                                            type="submit" 
                                            size="icon" 
                                            className="absolute right-2 bottom-2.5 h-9 w-9 rounded-full bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all z-10 flex-shrink-0" 
                                            disabled={isGenerating || (!input.trim() && !(attachedImage && imageActionMode)) || !currentAgent}
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
                
                {/* Dialog para Gerar Imagem */}
                <Dialog open={showImageGenerator} onOpenChange={(open) => {
                    setShowImageGenerator(open);
                    if (!open) {
                        setImagePrompt(''); // Limpa o prompt ao fechar
                        removeReferenceImage(); // Remove imagem de referência ao fechar
                    }
                }}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <ImageIcon className="h-5 w-5 text-purple-500" />
                                Gerar Imagem
                            </DialogTitle>
                            <DialogDescription>
                                Descreva a imagem que você deseja gerar ou anexe uma imagem de referência. Seja específico e detalhado para melhores resultados.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {/* Seletor de Modelo */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Modelo de IA
                                </label>
                                <Select value={selectedImageModel} onValueChange={(value) => {
                                    console.log('🖼️ Modelo de imagem selecionado:', value);
                                    setSelectedImageModel(value);
                                }}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione um modelo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dall-e-3">DALL-E 3 - Alta qualidade, estilo realista</SelectItem>
                                        <SelectItem value="dall-e-2">DALL-E 2 - Variações de imagem</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {selectedImageModel === 'dall-e-2' && 'Ideal para gerar variações de imagens existentes.'}
                                    {selectedImageModel === 'dall-e-3' && 'Melhor para gerar imagens realistas e detalhadas a partir de texto.'}
                                </p>
                            </div>

                            {/* Upload de imagem de referência */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Imagem de Referência (Opcional)
                                </label>
                                {referenceImagePreview ? (
                                    <div className="relative">
                                        <img
                                            src={referenceImagePreview}
                                            alt="Referência"
                                            className="w-full max-h-48 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                                        />
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={removeReferenceImage}
                                            className="absolute top-2 right-2"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={referenceImageInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleReferenceImageSelect}
                                            className="hidden"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => referenceImageInputRef.current?.click()}
                                            className="w-full"
                                        >
                                            <Camera className="h-4 w-4 mr-2" />
                                            Anexar Imagem de Referência
                                        </Button>
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    {referenceImagePreview 
                                        ? 'Uma nova variação será gerada diretamente a partir desta imagem usando DALL-E 2.'
                                        : 'Anexe uma imagem para gerar uma variação dela. A imagem deve ser quadrada (mesma largura e altura) para melhores resultados.'}
                                </p>
                            </div>

                            {/* Campo de prompt */}
                            <div className="space-y-2">
                                <label htmlFor="image-prompt" className="text-sm font-medium">
                                    Descrição da imagem {referenceImagePreview && '(opcional se já anexou referência)'}
                                </label>
                                <Textarea
                                    id="image-prompt"
                                    value={imagePrompt}
                                    onChange={(e) => setImagePrompt(e.target.value)}
                                    placeholder={referenceImagePreview 
                                        ? "Ex: Mantenha o mesmo estilo mas adicione mais cores vibrantes..."
                                        : "Ex: Um gato astronauta flutuando no espaço, estilo cartoon colorido, fundo estrelado..."}
                                    className="min-h-[100px] resize-none"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            if (imagePrompt.trim() || referenceImagePreview) {
                                                handleGenerateImage(imagePrompt.trim() || '');
                                            }
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {referenceImagePreview 
                                        ? 'Instruções opcionais. Se deixar vazio, será gerada uma variação automática da imagem.'
                                        : 'Dica: Seja específico sobre estilo, cores, composição e elementos da imagem.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowImageGenerator(false);
                                    removeReferenceImage();
                                }}
                                disabled={isGeneratingImage}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={() => {
                                    if (imagePrompt.trim() || referenceImagePreview) {
                                        handleGenerateImage(imagePrompt.trim() || 'Gere uma imagem inspirada nesta referência');
                                    }
                                }}
                                disabled={isGeneratingImage || (!imagePrompt.trim() && !referenceImagePreview)}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {isGeneratingImage ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Gerando...
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        Gerar Imagem
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                {/* Dialog com instruções para iOS */}
                <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Adicionar ApexIA à Tela Inicial</DialogTitle>
                            <DialogDescription>
                                Siga estes passos para adicionar o ApexIA à sua tela inicial no iPhone/iPad:
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                    1
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Toque no botão de compartilhar</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Procure pelo ícone de compartilhar <Share className="inline h-4 w-4" /> na parte inferior da tela do Safari
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                    2
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Selecione "Adicionar à Tela Inicial"</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Role para baixo e toque em "Adicionar à Tela Inicial"
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                    3
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Confirme a instalação</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Toque em "Adicionar" no canto superior direito
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setShowIOSInstructions(false)}>
                                Entendi
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        );
    };

    export default PublicClientChat;