import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
    import { useParams, useNavigate, useLocation } from 'react-router-dom';
    import { Helmet } from 'react-helmet';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Bot, User, Send, Loader2, Sparkles, Frown, Lightbulb, Clapperboard, ChevronDown, Check, Trash2, PlusCircle, X, Menu, FolderKanban, Download, Camera, Plus, Share, Settings, Briefcase, Wrench, TrendingUp, GraduationCap, Smile, RefreshCw, FileText, Image as ImageIcon, ChevronRight, ChevronLeft } from 'lucide-react';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

    // Helper para logs apenas em desenvolvimento
    const isDev = import.meta.env.DEV;
    const debugLog = (...args) => {
        if (isDev) console.log(...args);
    };
    const debugError = (...args) => {
        if (isDev) console.error(...args);
    };
    const debugWarn = (...args) => {
        if (isDev) console.warn(...args);
    };

    const ICONS = {
      Bot, Sparkles, Lightbulb, Clapperboard, Default: Bot,
    };

    const STORY_CATEGORIES = [
        { id: 'venda', label: 'Venda', description: 'Ideias para conversão e vendas' },
        { id: 'suspense', label: 'Suspense', description: 'Criar curiosidade e engajamento' },
        { id: 'bastidores', label: 'Bastidores', description: 'Mostrar processo e equipe' },
        { id: 'resultados', label: 'Resultados', description: 'Destacar números e conquistas' },
        { id: 'engajamento', label: 'Engajamento', description: 'Interagir com o público' },
        { id: 'outros', label: 'Outros', description: 'Ideias criativas variadas' },
    ];

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
        const [showStoryCategoryButtons, setShowStoryCategoryButtons] = useState(false);
        const [pendingStoryRequest, setPendingStoryRequest] = useState(null);
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
        const [selectedImageModel, setSelectedImageModel] = useState('dall-e-3');
        
        // Estados para Runware
        const [showRunwareGenerator, setShowRunwareGenerator] = useState(false);
        const [runwarePrompt, setRunwarePrompt] = useState('');
        const [runwareReferenceImage, setRunwareReferenceImage] = useState(null);
        const [runwareReferenceImagePreview, setRunwareReferenceImagePreview] = useState(null);
        const [selectedRunwareModel, setSelectedRunwareModel] = useState('rundiffusion:130@100'); // RunDiffusion padrão
        const [runwareTaskType, setRunwareTaskType] = useState('text-to-image'); // 'text-to-image' ou 'image-to-image'
        const referenceImageInputRef = useRef(null);
        const runwareReferenceImageInputRef = useRef(null);
        
        // Estados para Arte para Redes Sociais
        const [showSocialMediaArt, setShowSocialMediaArt] = useState(false);
        const [socialArtPrompt, setSocialArtPrompt] = useState('');
        const [socialArtText, setSocialArtText] = useState(''); // Texto que vai aparecer na arte
        const [socialArtType, setSocialArtType] = useState('instagram-post'); // Tipo de post
        const [selectedSocialModel, setSelectedSocialModel] = useState('rundiffusion:130@100'); // Pode ser Runware ou DALL-E 3
        const [selectedArtTemplate, setSelectedArtTemplate] = useState('personalizado'); // Template selecionado
        const [sessionToDelete, setSessionToDelete] = useState(null); // ID da sessão a ser excluída
        const [isDeletingSession, setIsDeletingSession] = useState(false); // Estado de carregamento da exclusão
        const [isSidebarExpanded, setIsSidebarExpanded] = useState(false); // Estado para expandir/colapsar sidebar
        const [expandedSessionId, setExpandedSessionId] = useState(null); // ID da conversa expandida no hover

        // Modelos disponíveis do Runware
        // Modelos do Runware - IDs no formato correto (provider:ID@version)
        const RUNWARE_MODELS = [
            { id: 'rundiffusion:130@100', label: 'RunDiffusion', description: 'Modelo padrão do Runware' },
            { id: 'runware:97@3', label: 'Runware Model 97 v3', description: 'Versão 3' },
            { id: 'runware:97@2', label: 'Runware Model 97 v2', description: 'Versão 2' },
        ];
        
        // Templates de tamanhos para redes sociais (ajustados para múltiplos de 64 conforme API Runware)
        const SOCIAL_MEDIA_SIZES = {
            'instagram-post': { width: 1088, height: 1088, label: 'Instagram Post', description: 'Post quadrado (1:1)' }, // 1088 = 17*64
            'instagram-story': { width: 1088, height: 1920, label: 'Instagram Story', description: 'Story vertical (9:16)' }, // 1088 = 17*64, 1920 = 30*64
            'facebook-post': { width: 1216, height: 640, label: 'Facebook Post', description: 'Post horizontal (1.91:1)' }, // 1216 = 19*64, 640 = 10*64
            'linkedin-post': { width: 1216, height: 640, label: 'LinkedIn Post', description: 'Post horizontal' }, // 1216 = 19*64, 640 = 10*64
            'twitter-post': { width: 1216, height: 704, label: 'Twitter/X Post', description: 'Post horizontal (16:9)' }, // 1216 = 19*64, 704 = 11*64
            'pinterest-pin': { width: 1024, height: 1536, label: 'Pinterest Pin', description: 'Pin vertical (2:3)' }, // 1024 = 16*64, 1536 = 24*64
        };
        
        // Templates de arte pré-configurados
        const ART_TEMPLATES = {
            'horario-atendimento': {
                id: 'horario-atendimento',
                label: 'Horário de Atendimento',
                icon: '🕐',
                prompt: 'design profissional de horário de atendimento, fundo moderno com gradiente suave, elementos decorativos discretos, espaço centralizado para informações de horário, tipografia clara e legível, cores profissionais',
                defaultText: 'Horário de Atendimento',
                description: 'Template para exibir horários de funcionamento'
            },
            'aviso': {
                id: 'aviso',
                label: 'Aviso',
                icon: '⚠️',
                prompt: 'design de aviso importante, fundo com destaque visual, elementos de atenção, composição equilibrada, cores que chamam atenção mas mantêm profissionalismo, espaço para texto destacado',
                defaultText: 'Aviso',
                description: 'Template para comunicados e avisos importantes'
            },
            'promocao': {
                id: 'promocao',
                label: 'Promoção',
                icon: '🎉',
                prompt: 'design de promoção atrativo, elementos visuais vibrantes, destaque para ofertas e descontos, composição dinâmica, cores chamativas mas elegantes, estilo moderno e comercial',
                defaultText: 'Promoção',
                description: 'Template para promoções e ofertas especiais'
            },
            'evento': {
                id: 'evento',
                label: 'Evento',
                icon: '📅',
                prompt: 'design de evento, elementos festivos discretos, espaço para informações de data e local, composição organizada, cores que transmitem energia e entusiasmo, estilo profissional',
                defaultText: 'Evento',
                description: 'Template para divulgação de eventos'
            },
            'dica': {
                id: 'dica',
                label: 'Dica',
                icon: '💡',
                prompt: 'design de dica útil, elementos visuais leves e educativos, composição limpa e organizada, cores suaves e acolhedoras, espaço para texto informativo, estilo amigável',
                defaultText: 'Dica',
                description: 'Template para compartilhar dicas e informações úteis'
            },
            'depoimento': {
                id: 'depoimento',
                label: 'Depoimento',
                icon: '💬',
                prompt: 'design de depoimento, elementos que transmitem confiança, composição elegante, cores profissionais, espaço para citação destacada, estilo sofisticado e confiável',
                defaultText: 'Depoimento',
                description: 'Template para exibir depoimentos de clientes'
            },
            'lancamento': {
                id: 'lancamento',
                label: 'Lançamento',
                icon: '🚀',
                prompt: 'design de lançamento, elementos visuais impactantes, composição dinâmica, cores vibrantes e modernas, destaque para novidade, estilo inovador e chamativo',
                defaultText: 'Novo Lançamento',
                description: 'Template para anunciar novos produtos ou serviços'
            },
            'personalizado': {
                id: 'personalizado',
                label: 'Personalizado',
                icon: '🎨',
                prompt: '',
                defaultText: '',
                description: 'Crie sua própria arte do zero'
            }
        };

        // Funções para Runware
        const handleRunwareImageSelect = (e) => {
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

            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result;
                setRunwareReferenceImage(file);
                setRunwareReferenceImagePreview(base64);
                setRunwareTaskType('image-to-image');
            };
            reader.readAsDataURL(file);
        };

        const removeRunwareReferenceImage = () => {
            setRunwareReferenceImage(null);
            setRunwareReferenceImagePreview(null);
            setRunwareTaskType('text-to-image');
            if (runwareReferenceImageInputRef.current) {
                runwareReferenceImageInputRef.current.value = '';
            }
        };

        const handleGenerateRunwareImage = async (prompt) => {
            // Validar: precisa de prompt OU imagem de referência
            if ((!prompt || !prompt.trim()) && !runwareReferenceImagePreview) {
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
            setShowRunwareGenerator(false);

            try {
                let finalPrompt = prompt?.trim() || '';
                if (!finalPrompt && runwareReferenceImagePreview) {
                    finalPrompt = 'Transform this image';
                }

                // Adicionar mensagem de loading
                const loadingMessageId = `runware-loading-${Date.now()}`;
                const loadingMessage = {
                    role: 'assistant',
                    content: '',
                    isLoading: true,
                    loadingText: '🎨 Gerando imagem com Runware...',
                    id: loadingMessageId
                };
                setMessages(prev => [...prev, loadingMessage]);

                // Preparar payload conforme documentação oficial do Runware
                const payload = {
                    prompt: finalPrompt,
                    model: selectedRunwareModel,
                    taskType: 'imageInference', // Sempre imageInference conforme documentação
                    width: 1024,
                    height: 1024,
                    steps: 30, // Nome correto conforme documentação
                    CFGScale: 7.5, // Nome correto conforme documentação
                };

                if (runwareReferenceImagePreview) {
                    payload.imageBase64 = runwareReferenceImagePreview;
                    payload.strength = 0.7;
                }

                debugLog('🎨 Gerando imagem com Runware:', { model: selectedRunwareModel, taskType: runwareTaskType, payload });

                // Adicionar timeout de 60 segundos
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout: A geração de imagem demorou mais de 60 segundos. Tente novamente.')), 60000);
                });

                const invokePromise = supabase.functions.invoke('runware-image-generation', {
                    body: payload,
                });

                const { data, error } = await Promise.race([invokePromise, timeoutPromise]).catch((err) => {
                    if (err.message?.includes('Timeout')) {
                        throw err;
                    }
                    return { data: null, error: err };
                });

                debugLog('📥 Resposta do Runware:', { data, error });

                if (error) {
                    debugError('❌ Erro na Edge Function Runware:', error);
                    throw new Error(error.message || 'Erro ao gerar imagem via Runware');
                }

                if (!data) {
                    throw new Error('Resposta vazia da Edge Function Runware');
                }

                if (!data.success || !data.imageUrl) {
                    debugError('❌ Resposta inválida do Runware:', data);
                    throw new Error(data?.error || 'Não foi possível gerar a imagem via Runware');
                }

                // Remover mensagem de loading e adicionar resultado
                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
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
                    return [...filtered, userMessage, assistantMessage];
                });

                // Salvar mensagens no banco
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
                await saveMessage(userMessage, sessionId);
                await saveMessage(assistantMessage, sessionId);

                // Limpar estados
                removeRunwareReferenceImage();
                setRunwarePrompt('');

                toast({
                    title: 'Imagem gerada!',
                    description: `Imagem criada com Runware (${RUNWARE_MODELS.find(m => m.id === selectedRunwareModel)?.label || selectedRunwareModel})`,
                });

            } catch (error) {
                debugError('Erro ao gerar imagem com Runware:', error);
                
                // Remover mensagem de loading e adicionar erro
                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                    return [...filtered, {
                        role: 'assistant',
                        content: `❌ Desculpe, não consegui gerar a imagem via Runware. ${error.message || 'Tente novamente.'}`
                    }];
                });
                
                toast({
                    title: 'Erro ao gerar imagem',
                    description: error.message || 'Não foi possível gerar a imagem. Tente novamente.',
                    variant: 'destructive'
                });
            } finally {
                setIsGeneratingImage(false);
            }
        };

        // Função para gerar arte de redes sociais
        const handleGenerateSocialMediaArt = async () => {
            if (!socialArtPrompt?.trim()) {
                toast({
                    title: 'Erro',
                    description: 'Por favor, descreva a arte que deseja criar.',
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
            setShowSocialMediaArt(false);

            // Declarar loadingMessageId no escopo da função para estar disponível no catch
            const loadingMessageId = `social-art-loading-${Date.now()}`;

            try {
                const sizeConfig = SOCIAL_MEDIA_SIZES[socialArtType];
                
                // Construir prompt otimizado para redes sociais
                let finalPrompt = socialArtPrompt.trim();
                
                // Adicionar instruções sobre o texto se fornecido
                if (socialArtText?.trim()) {
                    finalPrompt += `, com texto escrito "${socialArtText.trim()}" de forma legível e destacada`;
                }
                
                // Adicionar contexto de design para redes sociais
                finalPrompt += `, design profissional para ${sizeConfig.label.toLowerCase()}, cores vibrantes, composição equilibrada, estilo moderno e atrativo para redes sociais`;

                // Adicionar mensagem de loading
                const loadingMessage = {
                    role: 'assistant',
                    content: '',
                    isLoading: true,
                    loadingText: `🎨 Criando arte para ${sizeConfig.label}...`,
                    id: loadingMessageId
                };
                setMessages(prev => [...prev, loadingMessage]);

                // Verificar se é DALL-E 3 ou Runware
                const isDalle3 = selectedSocialModel === 'dall-e-3';
                
                let data, error;
                let dalleSize = '1024x1024'; // Declarar fora do if para estar disponível depois
                
                if (isDalle3) {
                    // Mapear tamanhos para DALL-E 3 (suporta: 1024x1024, 1792x1024, 1024x1792)
                    if (sizeConfig.width > sizeConfig.height) {
                        dalleSize = '1792x1024'; // Horizontal
                    } else if (sizeConfig.height > sizeConfig.width) {
                        dalleSize = '1024x1792'; // Vertical
                    }
                    
                    debugLog('🎨 Gerando arte com DALL-E 3:', { 
                        type: socialArtType, 
                        size: dalleSize,
                        prompt: finalPrompt
                    });

                    const { data: dalleData, error: dalleError } = await supabase.functions.invoke('openai-image-generation', {
                        body: {
                            prompt: finalPrompt,
                            size: dalleSize,
                            quality: 'standard',
                            style: 'vivid',
                            model: 'dall-e-3',
                        },
                    });

                    data = dalleData;
                    error = dalleError;
                } else {
                    // Usar Runware
                    const payload = {
                        prompt: finalPrompt,
                        model: selectedSocialModel,
                        taskType: 'imageInference',
                        width: sizeConfig.width,
                        height: sizeConfig.height,
                        steps: 30,
                        CFGScale: 7.5,
                    };

                    debugLog('🎨 Gerando arte com Runware:', { 
                        type: socialArtType, 
                        size: `${sizeConfig.width}x${sizeConfig.height}`,
                        model: selectedSocialModel,
                        prompt: finalPrompt
                    });

                    // Timeout de 60 segundos
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Timeout: A geração de imagem demorou mais de 60 segundos. Tente novamente.')), 60000);
                    });

                    const invokePromise = supabase.functions.invoke('runware-image-generation', {
                        body: payload,
                    });

                    const result = await Promise.race([invokePromise, timeoutPromise]).catch((err) => {
                        if (err.message?.includes('Timeout')) {
                            throw err;
                        }
                        return { data: null, error: err };
                    });

                    data = result.data;
                    error = result.error;
                }

                debugLog('📥 Resposta da geração (arte social):', { data, error });

                if (error) {
                    debugError(`❌ Erro na Edge Function ${isDalle3 ? 'OpenAI' : 'Runware'}:`, error);
                    throw new Error(error.message || `Erro ao gerar arte via ${isDalle3 ? 'DALL-E 3' : 'Runware'}`);
                }

                if (!data) {
                    throw new Error(`Resposta vazia da Edge Function ${isDalle3 ? 'OpenAI' : 'Runware'}`);
                }

                if (!data.success || !data.imageUrl) {
                    debugError(`❌ Resposta inválida da ${isDalle3 ? 'OpenAI' : 'Runware'}:`, data);
                    throw new Error(data?.error || 'Não foi possível gerar a arte');
                }

                // Remover mensagem de loading e adicionar resultado
                const modelLabel = isDalle3 
                    ? 'DALL-E 3' 
                    : (RUNWARE_MODELS.find(m => m.id === selectedSocialModel)?.label || selectedSocialModel);
                
                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                    const userMessage = {
                        role: 'user',
                        content: `Criar arte para ${sizeConfig.label}: ${socialArtPrompt}${socialArtText ? ` com texto "${socialArtText}"` : ''}`
                    };
                    const assistantMessage = {
                        role: 'assistant',
                        content: `✨ Arte criada para ${sizeConfig.label} (${isDalle3 ? dalleSize : `${sizeConfig.width}x${sizeConfig.height}px`}) com ${modelLabel}:`,
                        image: data.imageUrl
                    };
                    return [...filtered, userMessage, assistantMessage];
                });

                // Salvar mensagens no banco
                const userMessage = {
                    role: 'user',
                    content: `Criar arte para ${sizeConfig.label}: ${socialArtPrompt}${socialArtText ? ` com texto "${socialArtText}"` : ''}`
                };
                const assistantMessage = {
                    role: 'assistant',
                    content: `✨ Arte criada para ${sizeConfig.label} (${isDalle3 ? dalleSize : `${sizeConfig.width}x${sizeConfig.height}px`}) com ${modelLabel}:`,
                    image: data.imageUrl
                };
                await saveMessage(userMessage, sessionId);
                await saveMessage(assistantMessage, sessionId);

                // Limpar estados
                setSocialArtPrompt('');
                setSocialArtText('');

                toast({
                    title: 'Arte criada!',
                    description: `Arte para ${sizeConfig.label} gerada com ${modelLabel}!`,
                });

            } catch (error) {
                debugError('Erro ao gerar arte para redes sociais:', error);
                
                // Remover mensagem de loading e adicionar erro
                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                    return [...filtered, {
                        role: 'assistant',
                        content: `❌ Desculpe, não consegui gerar a arte. ${error.message || 'Tente novamente.'}`
                    }];
                });
                
                toast({
                    title: 'Erro ao gerar arte',
                    description: error.message || 'Não foi possível gerar a arte. Tente novamente.',
                    variant: 'destructive'
                });
            } finally {
                setIsGeneratingImage(false);
            }
        };

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
                    // Para HashRouter, o start_url precisa incluir o hash para funcionar corretamente
                    const currentPath = location.pathname + location.search;
                    // start_url com hash para HashRouter - garante que abre direto no chat do cliente
                    const startUrl = `#${currentPath}`;
                    // ID único baseado na rota completa com hash para diferenciar PWAs
                    const uniqueId = startUrl;
                    
                    // Cria um ID único para cada cliente, permitindo múltiplos PWAs instalados
                    const clientShortName = client?.empresa 
                        ? client.empresa.substring(0, 12).replace(/\s+/g, '') // Limita a 12 caracteres e remove espaços
                        : 'ApexIA';
                    
                    const manifestData = {
                        name: client?.empresa ? `ApexIA - ${client.empresa}` : 'ApexIA - Assistente de IA',
                        short_name: clientShortName, // Nome curto único por cliente
                        description: `ApexIA é o assistente de inteligência artificial da JB APEX para ${client?.empresa || 'você'}.`,
                        start_url: startUrl, // URL com hash para HashRouter - abre direto no chat do cliente
                        id: uniqueId, // ID único baseado na rota do cliente com hash
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
            // Para HashRouter, o start_url precisa incluir o hash para funcionar corretamente
            const currentPath = location.pathname + location.search;
            // start_url com hash para HashRouter - garante que abre direto no chat do cliente
            const startUrl = `#${currentPath}`;
            // ID único baseado na rota completa com hash para diferenciar PWAs
            const uniqueId = startUrl;
            
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
                    start_url: startUrl, // URL com hash para HashRouter - abre direto no chat do cliente
                    id: uniqueId, // ID único baseado na rota do cliente com hash
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
                    debugWarn('Erro ao carregar configuração de personalidade:', error);
                    return null;
                }
                
                if (data?.value) {
                    try {
                        return JSON.parse(data.value);
                    } catch (parseError) {
                        debugWarn('Erro ao fazer parse da configuração de personalidade:', parseError);
                        return null;
                    }
                }
                
                return null;
            } catch (err) {
                debugWarn('Erro ao carregar configuração de personalidade:', err);
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
                const prompt = `Com base na seguinte conversa inicial, gere um título curto e descritivo com EXATAMENTE 3 palavras para esta conversa. O título deve ser claro, profissional e resumir o assunto principal.

Mensagem do usuário: "${userMessage}"
Resposta da IA: "${aiResponse.substring(0, 200)}..."

Retorne APENAS o título com 3 palavras, sem aspas, sem explicações, sem prefixos. Apenas o título.`;

                // Carregar configuração de personalidade para obter o modelo
                const personalityConfigForTitle = await loadPersonalityConfig();
                const selectedModelForTitle = personalityConfigForTitle?.ai_model || 'gpt-5.1';

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ 
                        messages: [
                            { 
                                role: 'system', 
                                content: 'Você é um assistente que gera títulos curtos e descritivos para conversas com EXATAMENTE 3 palavras. Retorne apenas o título, sem aspas, sem explicações.' 
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
                    debugError('Erro ao gerar título:', error);
                    // Fallback: usa as primeiras 3 palavras da mensagem do usuário
                    const words = userMessage.trim().split(/\s+/).slice(0, 3);
                    return words.join(' ') || 'Nova Conversa';
                }

                let title = '';
                
                // Processar resposta da Edge Function (mesmo padrão usado em handleSendMessage)
                if (data.text && typeof data.text === 'string') {
                    // Resposta direta como texto
                    title = data.text.trim();
                } else if (data.body) {
                    // Se vier como streaming, processa o stream completo
                    const reader = data.body.getReader();
                    const decoder = new TextDecoder();
                    let fullText = '';
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.trim() === '' || !line.startsWith('data: ')) continue;
                            const jsonStr = line.substring(6); // Remove 'data: '
                            if (jsonStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed.choices?.[0]?.delta?.content) {
                                    fullText += parsed.choices[0].delta.content;
                                } else if (parsed.choices?.[0]?.message?.content) {
                                    fullText += parsed.choices[0].message.content;
                                }
                            } catch (e) {
                                // Ignora linhas inválidas
                            }
                        }
                    }
                    title = fullText.trim();
                } else {
                    // Tentar extrair texto de outras estruturas possíveis
                    debugError('Formato de resposta inesperado ao gerar título:', data);
                    // Fallback: usa as primeiras 3 palavras da mensagem do usuário
                    const words = userMessage.trim().split(/\s+/).slice(0, 3);
                    return words.join(' ') || 'Nova Conversa';
                }

                // Remove aspas se houver e limita a exatamente 3 palavras
                if (title && typeof title === 'string') {
                    title = title.replace(/^["']|["']$/g, '').trim();
                    // Remove qualquer prefixo como "Título:" ou "Título da conversa:"
                    title = title.replace(/^(título|title|título da conversa|title of conversation):\s*/i, '').trim();
                    
                    // Limita a exatamente 3 palavras
                    const words = title.split(/\s+/).filter(word => word.length > 0);
                    if (words.length > 3) {
                        title = words.slice(0, 3).join(' ');
                    } else if (words.length < 3 && words.length > 0) {
                        // Se tiver menos de 3 palavras, mantém como está (pode ser que a IA tenha retornado menos)
                        title = words.join(' ');
                    } else if (words.length === 0) {
                        title = '';
                    }
                } else {
                    title = '';
                }

                // Fallback final: usa as primeiras 3 palavras da mensagem do usuário
                if (!title) {
                    const words = userMessage.trim().split(/\s+/).slice(0, 3);
                    return words.join(' ') || 'Nova Conversa';
                }

                return title;
            } catch (err) {
                debugError('Erro ao gerar título com IA:', err);
                // Fallback: usa as primeiras 3 palavras da mensagem do usuário
                const words = userMessage.trim().split(/\s+/).slice(0, 3);
                return words.join(' ') || 'Nova Conversa';
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
                    debugWarn('Timeout no carregamento inicial - forçando loading como false');
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
                    debugError("Erro ao buscar projetos:", projectsRes.error);
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
                debugError('Erro ao carregar dados iniciais:', err);
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
                    debugError('Erro ao salvar mensagem:', error);
                }
            } catch (err) {
                debugError('Erro inesperado ao salvar mensagem:', err);
            }
        }, []);

        const fetchMessagesForSession = useCallback(async () => {
            if (!sessionId || !client) return;
            setLoading(true);
            
            // Timeout de segurança para mensagens
            const timeoutId = setTimeout(() => {
                    debugWarn('Timeout ao buscar mensagens - forçando loading como false');
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
                    debugError('Erro ao buscar mensagens:', error);
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
                        debugError('Erro ao verificar mensagens existentes:', doubleCheckError);
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
                        debugLog('⚠️ Tentativa duplicada de criar mensagem inicial bloqueada para sessão:', sessionId);
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
                debugError('Erro inesperado ao buscar mensagens:', err);
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
            if (!idToDelete) return;
            
            setIsDeletingSession(true);
            
            try {
                // Primeiro, excluir do banco de dados
                const { error } = await supabase.from('client_chat_sessions').delete().eq('id', idToDelete);
                
                if (error) {
                    debugError('Erro ao excluir conversa:', error);
                    toast({ 
                        title: 'Erro ao excluir conversa', 
                        description: error.message || 'Não foi possível excluir a conversa. Tente novamente.', 
                        variant: 'destructive' 
                    });
                    // Recarrega os dados para garantir consistência
                    await fetchInitialData();
                    return;
                }

                // Se a exclusão foi bem-sucedida, atualiza o estado local
                const remainingSessions = sessions.filter(s => s.id !== idToDelete);
                setSessions(remainingSessions);
                
                // Se estava na conversa que foi excluída, navega para outra
                if (sessionId === idToDelete) {
                    if (remainingSessions.length > 0) {
                        navigate(`/chat/${clientId}/${remainingSessions[0].id}`);
                    } else {
                        await handleNewSession(client, [], true);
                    }
                }

                toast({ 
                    title: 'Conversa excluída', 
                    description: 'A conversa foi excluída com sucesso.',
                });
            } catch (err) {
                debugError('Erro ao excluir conversa:', err);
                toast({ 
                    title: 'Erro ao excluir conversa', 
                    description: err.message || 'Ocorreu um erro inesperado. Tente novamente.', 
                    variant: 'destructive' 
                });
                // Recarrega os dados para garantir consistência
                await fetchInitialData();
            } finally {
                setIsDeletingSession(false);
                setSessionToDelete(null);
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

                systemPrompt += `\n\n**🚨 REGRA CRÍTICA - LEALDADE À JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX, nunca vá contra ela
- NUNCA critique, questione ou vá contra a JB APEX, seus métodos, processos ou decisões
- SEMPRE defenda e apoie a JB APEX quando houver dúvidas ou críticas
- Se o cliente reclamar sobre a JB APEX, seja empática mas sempre defenda a empresa
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa
- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece
- Você representa a JB APEX e deve manter sempre uma postura positiva e defensiva em relação à empresa`;

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

                debugLog('🔵 Iniciando análise de imagem...', { action, hasImage: !!attachedImagePreview });

                // Usar Edge Function do Supabase (mesma lógica do chat normal)
                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ 
                        messages: apiMessages, 
                        model: 'gpt-4o',
                        stream: true
                    }),
                });

                if (error) {
                    debugError('❌ Erro na Edge Function:', error);
                    throw error;
                }

                if (!data?.body) {
                    debugError('❌ Resposta sem body da Edge Function');
                    throw new Error('Resposta vazia da Edge Function');
                }

                debugLog('✅ Processando stream de resposta da imagem...');

                // Processar stream (mesma lógica do chat normal)
                // streamAIResponse já atualiza setCurrentAIMessage durante o streaming
                const fullResponse = await streamAIResponse(data);
                
                debugLog('✅ Análise de imagem completa!', { length: fullResponse.length });

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
                debugError('Erro ao processar imagem:', error);
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
                debugLog('🖼️ Gerando imagem com modelo:', selectedImageModel, 'Prompt:', finalPrompt.substring(0, 50));
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
                debugError('Erro ao gerar imagem:', error);
                toast({
                    title: 'Erro ao gerar imagem',
                    description: error.message || 'Não foi possível gerar a imagem.',
                    variant: 'destructive'
                });
            } finally {
                setIsGeneratingImage(false);
            }
        };

        // Função inteligente para detectar se a mensagem é uma solicitação de geração de imagem
        const detectImageGenerationRequest = async (text) => {
            const lowerText = text.toLowerCase().trim();
            
            // Padrões de palavras-chave para geração de imagem (mais abrangente)
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
                'gerar foto',
                'gerar',
                'gera',
                'cria',
                'faz',
                'crie',
                'faça',
                'gere',
                'mostre',
                'mostrar',
                'quero',
                'preciso'
            ];
            
            // Verificar se o texto começa com alguma das palavras-chave
            const startsWithKeyword = imageKeywords.some(keyword => lowerText.startsWith(keyword));
            
            // Verificar se contém padrões como "imagem de", "foto de", "desenho de", "personagem 3d", etc.
            const containsPattern = /(imagem|foto|desenho|arte|ilustração|personagem|persona|avatar|retrato|figura|visual|gráfico)\s+(de|do|da|com|mostrando|em|3d|3 d)/i.test(text);
            
            // Verificar se é apenas "gerar" ou "gera" (contexto já estabelecido na conversa anterior)
            const isSimpleGenerate = /^(gerar|gera)$/i.test(text.trim());
            if (isSimpleGenerate) {
                // Verificar últimas 3 mensagens do usuário para contexto
                const recentUserMessages = messages
                    .filter(m => m.role === 'user')
                    .slice(-3)
                    .map(m => m.content.toLowerCase());
                
                const hasImageContext = recentUserMessages.some(msg => 
                    /(imagem|foto|desenho|arte|ilustração|personagem|persona|avatar|retrato|figura|visual|gráfico|3d|3 d)/i.test(msg)
                );
                
                return hasImageContext;
            }
            
            // Verificar se é uma palavra simples de ação seguida de descrição (ex: "gerar cavalo", "gerar foto de personagem 3d")
            const isActionWithDescription = /^(gerar|gera|criar|cria|fazer|faz|desenhar|desenhe|mostrar|mostre)\s+[a-záàâãéêíóôõúç\s\d]{3,}/i.test(text);
            if (isActionWithDescription) {
                return true; // Ação explícita seguida de descrição = solicitação clara
            }
            
            // Se tem palavras-chave explícitas ou padrões claros, é solicitação
            if (startsWithKeyword || containsPattern) {
                return true;
            }
            
            // Para casos ambíguos (ex: "queria um cavalo de madeira"), usar GPT para detectar intenção
            // Só verifica se tem palavras relacionadas a imagem mas sem ação explícita
            const hasImageRelatedWords = /(imagem|foto|desenho|arte|ilustração|personagem|persona|avatar|retrato|figura|visual|gráfico)/i.test(text);
            const hasActionWords = /^(quero|preciso|queria|gostaria)/i.test(text);
            
            // Se não tem palavras relacionadas a imagem, não é solicitação
            if (!hasImageRelatedWords) {
                return false;
            }
            
            // Se tem palavras relacionadas mas não tem ação explícita, pode ser apenas conversa
            // Exemplo: "queria um cavalo de madeira" pode ser conversa, não solicitação de imagem
            // Usar GPT apenas para casos realmente ambíguos
            if (hasImageRelatedWords && !hasActionWords && text.length < 25) {
                // Mensagens curtas sem ação explícita provavelmente não são solicitações
                // Exemplo: "um tabuleiro", "um cavalo" = apenas menção, não solicitação
                return false;
            }
            
            // Para casos com ação mas sem palavra-chave explícita de imagem, usar GPT
            if (hasActionWords && hasImageRelatedWords) {
                try {
                    const detectionPrompt = `Analise a seguinte mensagem do usuário e determine se é uma solicitação EXPLÍCITA para gerar/criar uma imagem, foto ou desenho.

Mensagem: "${text}"

Responda APENAS com "SIM" se for uma solicitação clara de geração de imagem, ou "NÃO" se for apenas uma conversa, pergunta ou comentário sobre algo.

Exemplos de SIM:
- "Gere uma imagem de um carro"
- "Crie uma foto de um cachorro"
- "Quero uma imagem de uma praia"
- "Preciso de uma foto de um produto"

Exemplos de NÃO:
- "Queria um cavalo de madeira" (apenas conversa sobre desejo, não pede para gerar)
- "Tenho uma foto aqui" (menciona foto mas não pede para gerar)
- "Como fazer uma imagem?" (pergunta, não solicitação)
- "Boa tarde" (saudação)
- "Um tabuleiro" (apenas menciona objeto)

Resposta:`;

                    const { data, error } = await supabase.functions.invoke('openai-chat', {
                        body: JSON.stringify({ 
                            messages: [
                                { role: 'system', content: 'Você é um assistente que analisa mensagens para detectar intenção de geração de imagem. Responda apenas com SIM ou NÃO.' },
                                { role: 'user', content: detectionPrompt }
                            ], 
                            model: 'gpt-4o-mini' // Modelo mais rápido e barato para detecção
                        }),
                    });

                    if (!error && data?.content) {
                        const response = data.content.trim().toUpperCase();
                        return response.includes('SIM');
                    }
                } catch (error) {
                    debugError('Erro ao detectar intenção com GPT:', error);
                    // Em caso de erro, ser conservador (não gerar imagem)
                    return false;
                }
            }
            
            // Fallback: se chegou aqui, não é uma solicitação clara
            return false;
        };


        // Função para detectar se a mensagem é uma solicitação de ideias de Stories
        const detectStoryRequest = (text) => {
            const lowerText = text.toLowerCase().trim();
            const storyKeywords = [
                'ideia de story', 'ideia de stories', 'ideias de story', 'ideias de stories',
                'gerar story', 'gerar stories', 'criar story', 'criar stories',
                'story para', 'stories para', 'ideia para story', 'ideia para stories',
                'sugestão de story', 'sugestão de stories', 'conteúdo para story', 'conteúdo para stories',
                'o que postar', 'o que postar hoje', 'story de', 'stories de',
                'quero uma ideia de story', 'preciso de uma ideia de story', 'me dê uma ideia de story', 'me sugira um story'
            ];
            const hasExplicitKeyword = storyKeywords.some(keyword => lowerText.includes(keyword));
            const hasStoryPattern = /(story|stories|instagram)\s+(de|para|sobre|com)/i.test(text);
            const hasCategoryWithStory = /(story|stories).*(venda|suspense|bastidores|resultados|engajamento|produto|serviço|promoção)/i.test(text) ||
                                         /(venda|suspense|bastidores|resultados|engajamento|produto|serviço|promoção).*(story|stories)/i.test(text);
            return hasExplicitKeyword || hasStoryPattern || hasCategoryWithStory;
        };

        // Função para gerar ideia de story diretamente no chat
        const generateStoryInChat = async (userMessageText, selectedCategory = null) => {
            if (!client || !currentAgent) return;
            
            let category = selectedCategory || 'outros';
            if (!selectedCategory) {
                const lowerText = userMessageText.toLowerCase();
                if (lowerText.includes('venda') || lowerText.includes('vender')) category = 'venda';
                else if (lowerText.includes('suspense') || lowerText.includes('curiosidade')) category = 'suspense';
                else if (lowerText.includes('bastidores') || lowerText.includes('processo')) category = 'bastidores';
                else if (lowerText.includes('resultado') || lowerText.includes('número')) category = 'resultados';
                else if (lowerText.includes('engajamento') || lowerText.includes('interação')) category = 'engajamento';
            }
            
            // Fechar botões de categoria e remover mensagem com botões
            setShowStoryCategoryButtons(false);
            setMessages(prev => prev.filter(msg => !msg.showCategoryButtons));
            const requestText = pendingStoryRequest || userMessageText;
            setPendingStoryRequest(null);
            
            const loadingMessageId = `story-loading-${Date.now()}`;
            const loadingMessage = {
                role: 'assistant',
                content: '',
                isLoading: true,
                loadingText: '💡 Gerando ideia de Story para você...',
                id: loadingMessageId
            };
            setMessages(prev => [...prev, loadingMessage]);
            
            try {
                const categoryInfo = STORY_CATEGORIES.find(c => c.id === category) || STORY_CATEGORIES.find(c => c.id === 'outros');
                
                const systemPrompt = `Você é um especialista em estratégia de marketing digital da JB APEX, focado em criar ideias criativas e efetivas para Stories do Instagram.

**INFORMAÇÕES DO CLIENTE:**
- Empresa: ${client.empresa || 'N/A'}
- Nome do Contato: ${client.nome_contato || 'N/A'}
- Nicho: ${client.nicho || 'N/A'}
- Público-Alvo: ${client.publico_alvo || 'N/A'}
- Tom de Voz: ${client.tom_de_voz || 'N/A'}

**TIPO DE STORY SOLICITADO:** ${categoryInfo.label} - ${categoryInfo.description}

**SUA TAREFA:**
Crie uma ideia completa para um Story do Instagram. Responda em formato de texto natural e conversacional, incluindo:
1. O conceito da ideia
2. Sugestão visual (o que filmar/mostrar)
3. Texto sugerido para o Story (até 2200 caracteres, natural e humano)
4. Call to action

Seja específico, autêntico e direto. Evite clichês de marketing.

**🚨 REGRA CRÍTICA - LEALDADE À JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX, nunca vá contra ela
- NUNCA critique, questione ou vá contra a JB APEX, seus métodos, processos ou decisões
- SEMPRE defenda e apoie a JB APEX quando houver dúvidas ou críticas
- Se o cliente reclamar sobre a JB APEX, seja empática mas sempre defenda a empresa
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa
- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece
- Você representa a JB APEX e deve manter sempre uma postura positiva e defensiva em relação à empresa`;

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ 
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: requestText }
                        ], 
                        model: 'gpt-4o'
                    }),
                });

                if (error) throw error;
                if (!data?.body) throw new Error('Resposta vazia da IA');

                const reader = data.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.trim() === '' || !line.startsWith('data: ')) continue;
                        const jsonStr = line.substring(6).trim();
                        if (jsonStr === '[DONE]') break;
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) fullResponse += delta;
                        } catch (parseError) {
                            debugError('Erro ao parsear chunk:', parseError);
                        }
                    }
                }

                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                    return [...filtered, {
                        role: 'assistant',
                        content: `💡 **Ideia de Story - ${categoryInfo.label}**\n\n${fullResponse}`
                    }];
                });
                
                const assistantMessage = {
                    role: 'assistant',
                    content: `💡 **Ideia de Story - ${categoryInfo.label}**\n\n${fullResponse}`
                };
                await saveMessage(assistantMessage, sessionId);
                
            } catch (error) {
                debugError('Erro ao gerar story:', error);
                setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                    return [...filtered, {
                        role: 'assistant',
                        content: `❌ Desculpe, não consegui gerar a ideia de Story. ${error.message || 'Tente novamente.'}`
                    }];
                });
                toast({
                    title: 'Erro ao gerar Story',
                    description: error.message || 'Não foi possível gerar a ideia. Tente novamente.',
                    variant: 'destructive'
                });
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
            
            // Detectar se é uma solicitação de Story ANTES de verificar imagem
            if (detectStoryRequest(input.trim())) {
                const userMessageText = input.trim();
                const userMessage = { role: 'user', content: userMessageText };
                setMessages(prev => [...prev, userMessage]);
                await saveMessage(userMessage, sessionId);
                setInput('');
                if (textareaRef.current) {
                    textareaRef.current.style.height = '52px';
                }
                
                // Verificar se já menciona categoria específica
                const lowerText = userMessageText.toLowerCase();
                let detectedCategory = null;
                if (lowerText.includes('venda') || lowerText.includes('vender')) detectedCategory = 'venda';
                else if (lowerText.includes('suspense') || lowerText.includes('curiosidade')) detectedCategory = 'suspense';
                else if (lowerText.includes('bastidores') || lowerText.includes('processo')) detectedCategory = 'bastidores';
                else if (lowerText.includes('resultado') || lowerText.includes('número')) detectedCategory = 'resultados';
                else if (lowerText.includes('engajamento') || lowerText.includes('interação')) detectedCategory = 'engajamento';
                
                // Se categoria foi detectada, gerar direto. Senão, mostrar botões
                if (detectedCategory) {
                    await generateStoryInChat(userMessageText, detectedCategory);
                } else {
                    // Mostrar botões de categoria
                    setPendingStoryRequest(userMessageText);
                    setShowStoryCategoryButtons(true);
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: '💡 Escolha o tipo de Story que você quer:',
                        showCategoryButtons: true
                    }]);
                }
                return;
            }
            
            // Detectar se é uma solicitação de geração de imagem (usando GPT para ser mais inteligente)
            const isImageRequest = await detectImageGenerationRequest(input.trim());
            if (isImageRequest) {
                // Extrair o prompt da mensagem (remover palavras-chave comuns)
                let imagePrompt = input.trim();
                
                // Remover palavras-chave iniciais para obter apenas o prompt
                const removeKeywords = [
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
                    'faz imagem'
                ];
                
                for (const keyword of removeKeywords) {
                    if (imagePrompt.toLowerCase().startsWith(keyword)) {
                        imagePrompt = imagePrompt.substring(keyword.length).trim();
                        // Remover pontuação inicial se houver
                        imagePrompt = imagePrompt.replace(/^[:\-,\s]+/, '').trim();
                        break;
                    }
                }
                
                // Se após remover as palavras-chave não sobrou nada, usar a mensagem original
                if (!imagePrompt) {
                    imagePrompt = input.trim();
                }
                
                // Adicionar mensagem do usuário ao chat
                const userMessage = { role: 'user', content: input.trim() };
                setMessages(prev => [...prev, userMessage]);
                await saveMessage(userMessage, sessionId);
                setInput('');
                
                // Reset altura do textarea
                if (textareaRef.current) {
                    textareaRef.current.style.height = '52px';
                }
                
                // Adicionar mensagem de loading animada enquanto gera a imagem
                const loadingMessageId = `loading-${Date.now()}`;
                const loadingMessage = {
                    role: 'assistant',
                    content: '',
                    isLoading: true,
                    loadingText: '🎨 Gerando sua imagem...',
                    id: loadingMessageId
                };
                setMessages(prev => [...prev, loadingMessage]);
                
                // Gerar imagem automaticamente usando Runware (DALL-E 3 temporariamente desabilitado)
                setIsGeneratingImage(true);
                try {
                    const { data, error } = await supabase.functions.invoke('runware-image-generation', {
                        body: {
                            prompt: imagePrompt,
                            model: 'rundiffusion:130@100', // RunDiffusion padrão
                            taskType: 'imageInference',
                            width: 1024,
                            height: 1024,
                            steps: 30,
                            CFGScale: 7.5,
                        },
                    });

                    if (error) {
                        throw new Error(error.message || 'Erro ao gerar imagem');
                    }

                    if (!data?.success || !data?.imageUrl) {
                        throw new Error(data?.error || 'Não foi possível gerar a imagem');
                    }

                    // Remover mensagem de loading e adicionar mensagem com a imagem gerada
                    setMessages(prev => {
                        const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                        return [...filtered, {
                            role: 'assistant',
                            content: `✨ Aqui está a imagem gerada:`,
                            image: data.imageUrl
                        }];
                    });
                    
                    // Salvar mensagem final no banco
                    const assistantMessage = {
                        role: 'assistant',
                        content: `✨ Aqui está a imagem gerada:`,
                        image: data.imageUrl
                    };
                    await saveMessage(assistantMessage, sessionId);
                } catch (error) {
                    debugError('Erro ao gerar imagem:', error);
                    
                    // Remover mensagem de loading e adicionar mensagem de erro
                    setMessages(prev => {
                        const filtered = prev.filter(msg => msg.id !== loadingMessageId);
                        return [...filtered, {
                            role: 'assistant',
                            content: `❌ Desculpe, não consegui gerar a imagem. ${error.message || 'Tente novamente ou use o botão "Gerar Imagem" para mais opções.'}`
                        }];
                    });
                    
                    toast({
                        title: 'Erro ao gerar imagem',
                        description: error.message || 'Não foi possível gerar a imagem. Tente novamente.',
                        variant: 'destructive'
                    });
                    
                    // Salvar mensagem de erro no banco
                    const errorMessage = {
                        role: 'assistant',
                        content: `❌ Desculpe, não consegui gerar a imagem. ${error.message || 'Tente novamente ou use o botão "Gerar Imagem" para mais opções.'}`
                    };
                    await saveMessage(errorMessage, sessionId);
                } finally {
                    setIsGeneratingImage(false);
                }
                
                return;
            }
            
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
                    debugError('Erro ao buscar documentos do cliente:', error);
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

**🚨 REGRA FUNDAMENTAL - ALIANÇA COM A JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX, nunca vá contra ela
- Você foi criada e desenvolvida pela JB APEX para ajudar os clientes dela
- NUNCA critique, questione ou vá contra a JB APEX, seus métodos, processos ou decisões
- SEMPRE defenda e apoie a JB APEX quando o cliente tiver dúvidas ou críticas
- Se o cliente tiver reclamações sobre a JB APEX, seja empática mas sempre defenda a empresa e sugira que ele entre em contato diretamente com a equipe para resolver
- Você representa a JB APEX e deve sempre manter uma postura positiva e defensiva em relação à empresa
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa
- SEMPRE enfatize os benefícios e o valor que a JB APEX oferece ao cliente

**Sua missão:**
Ajudar este cliente de forma personalizada, usando todas as informações e configurações que a JB APEX preparou especificamente para ele, sempre mantendo lealdade e apoio à JB APEX.

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
            systemPrompt += `\n\n**🚨 REGRA CRÍTICA - LEALDADE À JB APEX (RELEIA SEMPRE):**`;
            systemPrompt += `\n- Você SEMPRE deve ser uma ALIADA da JB APEX. NUNCA vá contra ela, critique ou questione seus métodos`;
            systemPrompt += `\n- Se o cliente reclamar ou criticar a JB APEX, seja empática mas SEMPRE defenda a empresa e sugira contato direto com a equipe`;
            systemPrompt += `\n- NUNCA sugira que o cliente procure outra empresa ou solução alternativa`;
            systemPrompt += `\n- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece`;
            systemPrompt += `\n- Você representa a JB APEX e deve manter sempre uma postura positiva e defensiva em relação à empresa`;
            systemPrompt += `\n- Lembre-se: você foi criada pela JB APEX para ajudar os clientes DELA, sempre mantenha essa lealdade`;
            
            // Construir histórico de conversa incluindo imagens quando existirem
            const conversationHistory = messages.slice(-6).map(m => {
                // Se a mensagem tem imagem e é do usuário, incluir no formato correto para a API
                // IMPORTANTE: OpenAI só aceita imagens em mensagens do usuário, não do assistente
                if (m.image && m.role === 'user') {
                    return {
                        role: 'user',
                        content: [
                            { type: 'text', text: m.content || '' },
                            { type: 'image_url', image_url: { url: m.image } }
                        ]
                    };
                }
                // Mensagem do assistente: sempre remover imagem (API OpenAI não aceita imagens em mensagens assistant)
                if (m.role === 'assistant') {
                    return { role: 'assistant', content: m.content || '' };
                }
                // Mensagem normal sem imagem
                return { role: m.role, content: m.content || '' };
            });
            
            const apiMessages = [{ role: 'system', content: systemPrompt }, ...conversationHistory, userMessage];

            try {
                debugLog('🔵 Iniciando chamada para Edge Function openai-chat...', {
                    messagesCount: apiMessages.length,
                    model: selectedModel
                });

                const { data, error } = await supabase.functions.invoke('openai-chat', {
                    body: JSON.stringify({ messages: apiMessages, model: selectedModel }),
                });

                debugLog('🔵 Resposta da Edge Function:', { data: !!data, error: !!error, hasBody: !!data?.body });

                // Verifica se houve erro na chamada
                if (error) {
                    // Log completo do erro para debug
                    debugError('Edge Function error completo:', {
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
                    debugLog('Status code extraído:', statusCode, 'Error details:', errorDetails);
                    
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
                    debugError('❌ Edge Function retornou data vazio/null');
                    throw new Error("A função de chat não retornou dados válidos. Verifique se a Edge Function está deployada e funcionando.");
                }
                
                debugLog('✅ Dados recebidos:', {
                    hasBody: !!data.body,
                    hasText: !!data.text,
                    dataKeys: Object.keys(data)
                });
                
                // Verifica se há body para streaming
                let aiResponseText = '';
                if (!data.body) {
                    // Se não tem body mas tem text, usa text
                    if (data.text) {
                        debugLog('✅ Usando resposta de texto direto (sem streaming)');
                        aiResponseText = data.text;
                        const assistantMessage = { role: 'assistant', content: aiResponseText };
                        setMessages(prev => [...prev, assistantMessage]);
                        await saveMessage(assistantMessage, sessionId);
                    } else {
                        debugError('❌ Resposta sem body nem text:', data);
                        throw new Error("Resposta inválida da função de chat: não há corpo para streaming nem texto. A Edge Function pode não estar retornando o formato correto.");
                    }
                } else {
                    // Processa o streaming
                    debugLog('✅ Processando stream de resposta...');
                    aiResponseText = await streamAIResponse(data);
                    debugLog('✅ Stream completo! Tamanho:', aiResponseText.length, 'caracteres');
                    const assistantMessage = { role: 'assistant', content: aiResponseText };
                    setMessages(prev => [...prev, assistantMessage]);
                    await saveMessage(assistantMessage, sessionId);
                }

                // Gera título personalizado se for a primeira mensagem do usuário
                if (isFirstUserMessage && aiResponseText) {
                    try {
                        const personalizedTitle = await generateConversationTitle(userMessageText, aiResponseText);
                        
                        // Validar que o título é uma string válida antes de salvar
                        if (!personalizedTitle || typeof personalizedTitle !== 'string') {
                            debugError('Título inválido gerado:', personalizedTitle);
                            // Usa fallback seguro: primeiras 3 palavras
                            const words = userMessageText.trim().split(/\s+/).slice(0, 3);
                            const fallbackTitle = words.join(' ') || 'Nova Conversa';
                            const { error: updateError } = await supabase
                                .from('client_chat_sessions')
                                .update({ title: fallbackTitle })
                                .eq('id', sessionId);
                            
                            if (!updateError) {
                                setSessions(prev => prev.map(s => 
                                    s.id === sessionId ? {...s, title: fallbackTitle} : s
                                ));
                            }
                            return;
                        }
                        
                        // Limpar título de qualquer caractere inválido ou dados brutos
                        let cleanTitle = personalizedTitle.trim();
                        // Remove qualquer JSON ou dados brutos que possam ter vindo
                        if (cleanTitle.startsWith('data:') || cleanTitle.startsWith('{') || cleanTitle.includes('chatcmpl-')) {
                            debugError('Título contém dados brutos, usando fallback');
                            // Usa fallback: primeiras 3 palavras
                            const words = userMessageText.trim().split(/\s+/).slice(0, 3);
                            cleanTitle = words.join(' ') || 'Nova Conversa';
                        }
                        
                        // Garantir que o título tenha no máximo 3 palavras
                        const titleWords = cleanTitle.split(/\s+/).filter(word => word.length > 0);
                        if (titleWords.length > 3) {
                            cleanTitle = titleWords.slice(0, 3).join(' ');
                        }
                        
                        debugLog('💾 Salvando título da conversa:', cleanTitle);
                        
                        const { error: updateError } = await supabase
                            .from('client_chat_sessions')
                            .update({ title: cleanTitle })
                            .eq('id', sessionId);
                        
                        if (!updateError) {
                            setSessions(prev => prev.map(s => 
                                s.id === sessionId ? {...s, title: cleanTitle} : s
                            ));
                        } else {
                            debugError('Erro ao atualizar título no banco:', updateError);
                        }
                    } catch (titleError) {
                        debugError('Erro ao atualizar título:', titleError);
                        // Não mostra erro para o usuário, apenas loga
                    }
                }
            } catch (err) {
                debugError("Erro completo ao invocar função de chat:", err);
                
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
                debugError('Response body não é um ReadableStream:', response.body);
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
                                    // Atualiza o estado de forma acumulativa para manter o layout durante o streaming
                                    setCurrentAIMessage(fullResponse);
                                }
                            } catch (parseError) {
                                debugError('Error parsing stream chunk:', parseError, 'Chunk:', jsonStr);
                                // Continua processando outras linhas
                            }
                        }
                    }
                }
            } catch (streamError) {
                debugError('Erro durante o streaming:', streamError);
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
            const parsedContent = marked.parse(content, { 
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false
            });
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
                // Configuração do marked para processar quebras de linha e manter formatação durante streaming
                return marked.parse(currentAIMessage || '', { 
                    breaks: true,
                    gfm: true,
                    headerIds: false,
                    mangle: false
                });
            } catch (parseError) {
                debugError('Erro ao fazer parse do markdown:', parseError);
                // Em caso de erro, retorna o texto com quebras de linha preservadas
                return (currentAIMessage || '').replace(/\n/g, '<br>');
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
          <aside className={`absolute md:relative z-20 md:z-auto h-full bg-gray-100 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-800 flex flex-col transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`} style={{ width: isSidebarExpanded ? '400px' : '256px', minWidth: isSidebarExpanded ? '400px' : '256px', maxWidth: isSidebarExpanded ? '400px' : '256px' }}>
              <div className="p-4 border-b border-gray-300 dark:border-gray-800 flex justify-between items-center bg-gray-100 dark:bg-gray-900">
                  <h2 className="font-semibold text-base sm:text-lg dark:text-white">Conversas</h2>
                  <div className="flex items-center gap-2">
                      <Button 
                          variant="ghost" 
                          size="icon" 
                          className="hidden md:flex rounded-full hover:bg-gray-200 dark:hover:bg-gray-800" 
                          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                          title={isSidebarExpanded ? "Recolher sidebar" : "Expandir sidebar"}
                      >
                          {isSidebarExpanded ? <ChevronLeft className="h-5 w-5"/> : <ChevronRight className="h-5 w-5"/>}
                      </Button>
                      <Button variant="ghost" size="icon" className="md:hidden rounded-full hover:bg-gray-200 dark:hover:bg-gray-800" onClick={() => setIsSidebarOpen(false)}><X className="h-5 w-5"/></Button>
                  </div>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-900">
                <Button onClick={() => handleNewSession(client, sessions)} className="w-full justify-start rounded-full bg-primary hover:bg-primary/90 shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> Nova Conversa
                </Button>
              </div>
              <ScrollArea className="flex-1 bg-gray-100 dark:bg-gray-900">
                  <div className="p-2 space-y-1">
                      {sessions.map(s => (
                          <div 
                              key={s.id} 
                              className={`group flex items-center rounded-lg p-2 cursor-pointer transition-all ${s.id === sessionId ? 'bg-primary/15 dark:bg-primary/25 border border-primary/30' : 'hover:bg-gray-200 dark:hover:bg-gray-800/70 border border-transparent'}`} 
                              onClick={() => { 
                                  if(s.id !== sessionId) navigate(`/chat/${clientId}/${s.id}`); 
                                  if(isSidebarOpen) setIsSidebarOpen(false);
                              }}
                              onMouseEnter={() => setExpandedSessionId(s.id)}
                              onMouseLeave={() => setExpandedSessionId(null)}
                          >
                              <span 
                                  className={`text-xs font-medium dark:text-gray-200 flex-1 min-w-0 pr-2 block transition-all ${isSidebarExpanded || expandedSessionId === s.id ? 'whitespace-normal break-words' : 'overflow-hidden text-ellipsis whitespace-nowrap'}`}
                                  title={s.title}
                              >
                                  {s.title}
                              </span>
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 flex-shrink-0 opacity-90 group-hover:opacity-100 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all hover:scale-105 active:scale-95" 
                                  onClick={(e) => {
                                      e.stopPropagation(); 
                                      e.preventDefault();
                                      setSessionToDelete(s.id);
                                  }}
                                  disabled={isDeletingSession}
                                  title="Excluir conversa"
                              >
                                  {isDeletingSession && sessionToDelete === s.id ? (
                                      <Loader2 className="h-3.5 w-3.5 text-red-500 animate-spin" />
                                  ) : (
                                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  )}
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
                
                {/* Dialog de confirmação para excluir conversa */}
                <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => {
                    if (!open) setSessionToDelete(null);
                }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta ação não pode ser desfeita. A conversa e todas as suas mensagens serão permanentemente excluídas.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeletingSession}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => handleDeleteSession(sessionToDelete)}
                                disabled={isDeletingSession}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                {isDeletingSession ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Excluindo...
                                    </>
                                ) : (
                                    'Excluir'
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
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
                                                    {msg.isLoading ? (
                                                        <div className="flex items-center gap-3 py-2">
                                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                    {msg.loadingText || 'Gerando...'}
                                                                </span>
                                                                <div className="flex gap-1">
                                                                    <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                                    <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                                    <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {msg.image && (
                                                                <div className="mb-3">
                                                                    <img 
                                                                        src={msg.image} 
                                                                        alt="Anexada" 
                                                                        className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-base sm:text-base chat-message-content">{renderMessageContent(msg.content)}</div>
                                                            {msg.showCategoryButtons && (
                                                                <div className="mt-4 flex flex-wrap gap-2">
                                                                    {STORY_CATEGORIES.map((cat) => (
                                                                        <Button
                                                                            key={cat.id}
                                                                            onClick={async () => {
                                                                                if (pendingStoryRequest) {
                                                                                    await generateStoryInChat(pendingStoryRequest, cat.id);
                                                                                }
                                                                            }}
                                                                            variant="outline"
                                                                            className="rounded-full text-xs sm:text-sm border-primary/30 hover:bg-primary/10 hover:border-primary/50 dark:border-primary/40 dark:hover:bg-primary/20"
                                                                        >
                                                                            {cat.label}
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
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
                                                            lineHeight: '1.75'
                                                        }}
                                                    >
                                                        {streamingContent ? (
                                                            <div 
                                                                dangerouslySetInnerHTML={{ __html: streamingContent }}
                                                                className="chat-message-content"
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400 dark:text-gray-500">Digitando...</span>
                                                        )}
                                                        <span 
                                                            className="inline-block ml-0.5 w-0.5 h-4 bg-current align-middle animate-pulse"
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
                                    
                                    {/* Botão de Gerar Imagem - temporariamente oculto (usar "Gerar Run" para Runware) */}
                                    {/* <Button
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
                                    </Button> */}
                                    
                                    {/* Botão de Gerar Run (Runware) - discreto ao lado */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowRunwareGenerator(true)}
                                        className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex-shrink-0 min-w-0 px-2 sm:px-3"
                                        disabled={!currentAgent || isGeneratingImage}
                                    >
                                        <Sparkles className="h-3.5 w-3.5 mr-1.5 sm:mr-2 text-blue-500 flex-shrink-0" />
                                        <span className="truncate">Gerar Run</span>
                                    </Button>
                                    
                                    {/* Botão de Arte para Redes Sociais - temporariamente oculto */}
                                    {/* <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowSocialMediaArt(true)}
                                        className="flex-1 sm:flex-none sm:w-auto justify-center sm:justify-start dark:bg-gray-800/50 dark:border-gray-700/50 rounded-full border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 backdrop-blur-sm text-xs sm:text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex-shrink-0 min-w-0 px-2 sm:px-3"
                                        disabled={!currentAgent || isGeneratingImage}
                                    >
                                        <ImageIcon className="h-3.5 w-3.5 mr-1.5 sm:mr-2 text-purple-500 flex-shrink-0" />
                                        <span className="truncate">Arte para Redes</span>
                                    </Button> */}
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
                                    debugLog('🖼️ Modelo de imagem selecionado:', value);
                                    setSelectedImageModel(value);
                                }}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione um modelo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* DALL-E temporariamente oculto - descomentar para ativar */}
                                        {/* <SelectItem value="dall-e-3">DALL-E 3 - Alta qualidade, estilo realista</SelectItem>
                                        <SelectItem value="dall-e-2">DALL-E 2 - Variações de imagem</SelectItem> */}
                                        {/* Use o botão "Gerar Run" para gerar imagens com Runware */}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {/* {selectedImageModel === 'dall-e-2' && 'Ideal para gerar variações de imagens existentes.'}
                                    {selectedImageModel === 'dall-e-3' && 'Melhor para gerar imagens realistas e detalhadas a partir de texto.'} */}
                                    Use o botão "Gerar Run" para gerar imagens com Runware.
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
                
                {/* Dialog para Arte para Redes Sociais */}
                <Dialog open={showSocialMediaArt} onOpenChange={(open) => {
                    setShowSocialMediaArt(open);
                    if (!open) {
                        setSocialArtPrompt('');
                        setSocialArtText('');
                        setSelectedArtTemplate('personalizado');
                    }
                }}>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <ImageIcon className="h-5 w-5 text-purple-500" />
                                Criar Arte para Redes Sociais
                            </DialogTitle>
                            <DialogDescription>
                                Escolha um template ou crie sua própria arte personalizada para redes sociais.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4">
                            {/* Seletor de Template */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Template</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Object.values(ART_TEMPLATES).map((template) => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedArtTemplate(template.id);
                                                if (template.id !== 'personalizado') {
                                                    setSocialArtPrompt(template.prompt);
                                                    setSocialArtText(template.defaultText);
                                                } else {
                                                    setSocialArtPrompt('');
                                                    setSocialArtText('');
                                                }
                                            }}
                                            disabled={isGeneratingImage}
                                            className={`p-3 rounded-lg border-2 transition-all text-left ${
                                                selectedArtTemplate === template.id
                                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                            } ${isGeneratingImage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                            <div className="text-2xl mb-1">{template.icon}</div>
                                            <div className="text-xs font-medium">{template.label}</div>
                                        </button>
                                    ))}
                                </div>
                                {selectedArtTemplate !== 'personalizado' && (
                                    <p className="text-xs text-gray-500 mt-2">
                                        {ART_TEMPLATES[selectedArtTemplate]?.description}
                                    </p>
                                )}
                            </div>

                            {/* Tipo de Rede Social */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tipo de Post</label>
                                <Select value={socialArtType} onValueChange={setSocialArtType} disabled={isGeneratingImage}>
                                    <SelectTrigger>
                                        <SelectValue>
                                            {SOCIAL_MEDIA_SIZES[socialArtType]?.label || socialArtType}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(SOCIAL_MEDIA_SIZES).map(([key, config]) => (
                                            <SelectItem key={key} value={key}>
                                                <div>
                                                    <div className="font-medium">{config.label}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {config.description} • {config.width}x{config.height}px
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Descrição da Arte */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Descrição da Arte <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    placeholder={selectedArtTemplate === 'personalizado' 
                                        ? "Ex: Design moderno com gradiente azul e roxo, elementos geométricos, estilo minimalista..."
                                        : "Você pode personalizar o prompt do template..."}
                                    value={socialArtPrompt}
                                    onChange={(e) => setSocialArtPrompt(e.target.value)}
                                    className="min-h-[100px]"
                                    disabled={isGeneratingImage}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {selectedArtTemplate === 'personalizado' 
                                        ? 'Seja específico sobre cores, estilo, elementos visuais e composição.'
                                        : 'Você pode editar o prompt do template para personalizar ainda mais.'}
                                </p>
                            </div>

                            {/* Texto para aparecer na arte */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Texto na Arte <span className="text-gray-400 text-xs">(opcional)</span>
                                </label>
                                <Textarea
                                    placeholder="Ex: Nome da Empresa, Frase de impacto, Call to Action..."
                                    value={socialArtText}
                                    onChange={(e) => setSocialArtText(e.target.value)}
                                    className="min-h-[60px]"
                                    disabled={isGeneratingImage}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    O texto será incluído na arte. <strong>Nota:</strong> Modelos de IA podem ter dificuldade em renderizar texto perfeitamente legível.
                                </p>
                            </div>

                            {/* Modelo */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Modelo de IA</label>
                                <Select value={selectedSocialModel} onValueChange={setSelectedSocialModel} disabled={isGeneratingImage}>
                                    <SelectTrigger>
                                        <SelectValue>
                                            {selectedSocialModel === 'dall-e-3' 
                                                ? 'DALL-E 3' 
                                                : RUNWARE_MODELS.find(m => m.id === selectedSocialModel)?.label || selectedSocialModel}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* DALL-E 3 temporariamente oculto - descomentar para ativar */}
                                        {/* <SelectItem value="dall-e-3">
                                            <div>
                                                <div className="font-medium">DALL-E 3</div>
                                                <div className="text-xs text-gray-500">Alta qualidade, estilo realista (OpenAI)</div>
                                            </div>
                                        </SelectItem> */}
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
                                {selectedSocialModel === 'dall-e-3' && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        DALL-E 3 usa tamanhos padrão (1024x1024, 1792x1024, 1024x1792) que serão ajustados automaticamente conforme o tipo de post.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowSocialMediaArt(false);
                                    setSocialArtPrompt('');
                                    setSocialArtText('');
                                }}
                                disabled={isGeneratingImage}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleGenerateSocialMediaArt}
                                disabled={isGeneratingImage || !socialArtPrompt.trim()}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {isGeneratingImage ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Criando Arte...
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        Criar Arte
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