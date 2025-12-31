import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Loader2, Lightbulb, TrendingUp, Film, BarChart3, MessageSquare, Sparkles, Heart, RefreshCw, Copy, Eye, Trash2, Calendar, Check, User, Settings, Edit, XCircle } from 'lucide-react';
import { marked } from 'marked';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const STORY_CATEGORIES = [
    { id: 'venda', icon: TrendingUp, label: 'Venda', description: 'Ideias para conversão e vendas' },
    { id: 'suspense', icon: Film, label: 'Suspense', description: 'Criar curiosidade e engajamento' },
    { id: 'bastidores', icon: Eye, label: 'Bastidores', description: 'Mostrar processo e equipe' },
    { id: 'resultados', icon: BarChart3, label: 'Resultados', description: 'Destacar números e conquistas' },
    { id: 'engajamento', icon: MessageSquare, label: 'Engajamento', description: 'Interagir com o público' },
    { id: 'outros', icon: Sparkles, label: 'Outros', description: 'Ideias criativas variadas' },
];

const StoryIdeasGenerator = ({ client, isOpen, onClose, currentAgent }) => {
    const { toast } = useToast();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [context, setContext] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedIdea, setGeneratedIdea] = useState(null);
    const [savedIdeas, setSavedIdeas] = useState([]);
    const [isLoadingSaved, setIsLoadingSaved] = useState(false);
    
    // Fluxo simplificado - apenas perguntas essenciais
    const [step, setStep] = useState(1); // 1: categoria, 2: pergunta rápida, 3: gerar
    const [clientWantsToAppear, setClientWantsToAppear] = useState('indiferente'); // 'sim', 'nao', 'indiferente'
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false); // Opções avançadas colapsadas
    
    // Opções avançadas (escondidas por padrão)
    const [storyFormat, setStoryFormat] = useState('indiferente');
    const [contentFocus, setContentFocus] = useState('indiferente');
    const [toneOfVoice, setToneOfVoice] = useState('indiferente');
    
    // Estados para correção/contextualização
    const [isCorrectingOpen, setIsCorrectingOpen] = useState(false);
    const [correctingField, setCorrectingField] = useState(null);
    const [correctionContext, setCorrectionContext] = useState('');
    const [isCorrecting, setIsCorrecting] = useState(false);

    // Carregar ideias salvas ao abrir
    useEffect(() => {
        if (isOpen && client) {
            fetchSavedIdeas();
        }
    }, [isOpen, client]);

    // Limpar estado ao fechar
    useEffect(() => {
        if (!isOpen) {
            setSelectedCategory(null);
            setContext('');
            setGeneratedIdea(null);
            setStep(1);
            setClientWantsToAppear('indiferente');
            setShowAdvancedOptions(false);
            setStoryFormat('indiferente');
            setContentFocus('indiferente');
            setToneOfVoice('indiferente');
            setIsCorrectingOpen(false);
            setCorrectingField(null);
            setCorrectionContext('');
        }
    }, [isOpen]);
    
    // Resetar step quando categoria mudar
    useEffect(() => {
        if (!selectedCategory && step > 1) {
            setStep(1);
        }
    }, [selectedCategory, step]);

    const fetchSavedIdeas = async () => {
        if (!client?.id) return;
        setIsLoadingSaved(true);
        try {
            const { data, error } = await supabase
                .from('story_ideas')
                .select('*')
                .eq('client_id', client.id)
                .eq('is_active', true)
                .gte('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(7);

            if (error) throw error;
            
            // Filtrar apenas os últimos 7 dias
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const filtered = (data || []).filter(idea => 
                new Date(idea.created_at) >= sevenDaysAgo
            );
            setSavedIdeas(filtered.slice(0, 7));
        } catch (error) {
            console.error('Erro ao buscar ideias salvas:', error);
        } finally {
            setIsLoadingSaved(false);
        }
    };

    const generateIdea = async () => {
        if (!selectedCategory || !client) return;

        setIsGenerating(true);
        setGeneratedIdea(null);

        try {
            const category = STORY_CATEGORIES.find(c => c.id === selectedCategory);
            
            const systemPrompt = `Você é um especialista em estratégia de marketing digital da JB APEX, focado em criar ideias criativas e efetivas para Stories do Instagram.

**INFORMAÇÕES DO CLIENTE:**
- Empresa: ${client.empresa || 'N/A'}
- Nome do Contato: ${client.nome_contato || 'N/A'}
- Nicho: ${client.nicho || 'N/A'}
- Público-Alvo: ${client.publico_alvo || 'N/A'}
- Tom de Voz: ${client.tom_de_voz || 'N/A'}

**TIPO DE STORY SOLICITADO:** ${category.label} - ${category.description}

${context ? `**CONTEXTO ADICIONAL:** ${context}` : ''}

**FILTROS E PREFERÊNCIAS:**
${clientWantsToAppear !== 'indiferente' ? `- Cliente quer aparecer no story: ${clientWantsToAppear === 'sim' ? 'SIM, o cliente vai aparecer falando/aparecendo' : 'NÃO, o cliente não vai aparecer (focar em produto, ambiente, texto, gráficos)'}` : ''}
${storyFormat !== 'indiferente' ? `- Formato preferido: ${storyFormat === 'foto' ? 'Foto estática' : storyFormat === 'video' ? 'Vídeo curto (15 segundos)' : 'Carrossel de imagens'}` : ''}
${contentFocus !== 'indiferente' ? `- Foco do conteúdo: ${contentFocus === 'produto' ? 'Destaque para produto' : contentFocus === 'servico' ? 'Destaque para serviço' : contentFocus === 'dica' ? 'Dica educativa' : 'Promoção/oferta especial'}` : ''}
${toneOfVoice !== 'indiferente' ? `- Tom de voz específico: ${toneOfVoice === 'casual' ? 'Casual e descontraído, como falar com um amigo' : toneOfVoice === 'profissional' ? 'Profissional mas acessível, mantendo credibilidade' : toneOfVoice === 'inspirador' ? 'Inspirador e motivador, que gera conexão emocional' : toneOfVoice === 'divertido' ? 'Divertido e leve, com humor quando apropriado' : 'Conversacional e natural, como uma conversa real'}` : ''}

**SUA TAREFA:**
Crie uma ideia completa para um Story do Instagram no formato JSON estruturado abaixo:

{
  "concept": "Descrição detalhada do conceito da ideia em 2-3 parágrafos separados por quebras de linha duplas (\\n\\n)",
  "visual_suggestion": "Descrição clara do que filmar/mostrar, cores, elementos visuais, layout",
  "caption": "Texto completo sugerido para o Story. IMPORTANTE: Use quebras de linha duplas (\\n\\n) para separar parágrafos. O texto deve parecer natural e humano, escrito por uma pessoa real. NÃO use emojis em excesso - use no máximo 1-2 emojis por parágrafo se realmente necessário, mas prefira texto sem emojis. O texto deve fluir naturalmente como se fosse escrito por um humano real, não por IA. Use até 2200 caracteres.",
  "cta": "Call to action específico e direto (ex: 'Toque para saber mais', 'Deslize para ver promoção')"
}

**DIRETRIZES CRÍTICAS:**
${clientWantsToAppear === 'nao' ? '- IMPORTANTE: O cliente NÃO vai aparecer. Foque em produto, ambiente, textos gráficos, animações, ou outros elementos visuais. NÃO sugira que o cliente apareça.' : clientWantsToAppear === 'sim' ? '- IMPORTANTE: O cliente VAI aparecer. Inclua sugestões de como ele pode falar/aparecer naturalmente.' : ''}
${storyFormat !== 'indiferente' ? `- Formato: ${storyFormat === 'foto' ? 'Crie para foto estática - texto deve ser pensado para imagem fixa' : storyFormat === 'video' ? 'Crie para vídeo curto - texto deve ser pensado para movimento e ação' : 'Crie para carrossel - texto pode ser dividido em várias imagens'}` : ''}
${contentFocus !== 'indiferente' ? `- Foco principal: ${contentFocus === 'produto' ? 'O produto é o protagonista - destaque características, benefícios, uso' : contentFocus === 'servico' ? 'O serviço é o protagonista - destaque valor entregue, processo' : contentFocus === 'dica' ? 'Foco em educar e agregar valor ao público' : 'Foco em comunicar oferta/promoção de forma clara e atrativa'}` : ''}
${toneOfVoice !== 'indiferente' ? `- Tom de voz: ${toneOfVoice === 'casual' ? 'Use linguagem casual, descontraída, como uma conversa com amigo próximo. Seja direto e sem formalidade desnecessária.' : toneOfVoice === 'profissional' ? 'Use tom profissional mas acessível. Mantenha credibilidade sem soar distante ou frio.' : toneOfVoice === 'inspirador' ? 'Use tom inspirador e motivador. Crie conexão emocional sem soar piegas ou genérico.' : toneOfVoice === 'divertido' ? 'Use tom leve e divertido. Pode usar humor sutil quando apropriado, mas sempre natural.' : 'Use tom conversacional natural. Como se estivesse falando pessoalmente, sem artificialidade.'}` : ''}

**O QUE NÃO FAZER (EXEMPLOS DE TEXTO RUIM):**
- NÃO use frases genéricas como "Olá a todos!", "Estamos aqui para", "não vai querer perder", "super desconto"
- NÃO use exagero ou urgência artificial: "Corra porque não dura", "você não vai querer perder", "oferecemos"
- NÃO seja vago ou genérico: "explorar um pouco", "conhecer mais sobre o que fazemos", "lugar perfeito"
- NÃO use linguagem de call-center ou marketing tradicional: "ficaremos felizes em responder", "deixe suas perguntas nos comentários"
- NÃO termine com frases genéricas: "Mal posso esperar para ver sua visita", "Aproveite para"

**O QUE FAZER (EXEMPLOS DE TEXTO BOM):**
- Seja ESPECÍFICO e DIRETO: "Lançamos nosso novo queijo artesanal hoje"
- Use linguagem PESSOAL e REAL: "Fizemos isso aqui no rancho", "Essa foi nossa produção de ontem"
- Conte uma HISTÓRIA ou mostre PROCESSO: "Olha como ficou depois de 30 dias de maturação"
- Seja AUTÊNTICO: "Gente, vocês precisam experimentar isso", "Confesso que fiquei impressionado com o resultado"
- Termine de forma NATURAL: "Quem quiser saber mais, me chama no direct", "Qual vocês querem experimentar primeiro?"

**REGRAS GERAIS:**
- O texto deve parecer 100% humano e autêntico - como se fosse escrito por uma pessoa real, não por IA
- EVITE emojis em excesso - use no máximo 1-2 por todo o texto, ou prefira não usar emojis
- SEMPRE separe parágrafos com quebras de linha duplas (\\n\\n) para melhor legibilidade
- O texto deve ser ESPECÍFICO sobre o que está sendo mostrado/vendido
- Use linguagem DIRETA e PESSOAL, como alguém falando com alguém que conhece
- EVITE clichês de marketing e linguagem corporativa genérica
- Seja AUTÊNTICO - prefira "Fizemos" ao invés de "Oferecemos", "Aqui no rancho" ao invés de "Em nosso estabelecimento"
- Inclua hashtags relevantes apenas se fizer sentido no contexto
- O visual deve ser descrito de forma clara e específica para fácil execução
- O CTA deve ser claro e direcionar para ação sem soar robótico`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Gere uma ideia de Story do tipo ${category.label} para hoje.` }
            ];

            console.log('🔵 Gerando ideia de story...', { category: category.label, client: client.empresa });

            const { data, error } = await supabase.functions.invoke('openai-chat', {
                body: JSON.stringify({ messages, model: 'gpt-4o' }),
            });

            if (error) throw error;

            if (!data?.body) {
                throw new Error('Resposta vazia da IA');
            }

            // Processar streaming
            const reader = data.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6).trim();
                        if (jsonStr === '[DONE]') break;
                        
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullResponse += delta;
                            }
                        } catch (parseError) {
                            console.error('Erro ao parsear chunk:', parseError);
                        }
                    }
                }
            }

            // Tentar extrair JSON da resposta
            let ideaData;
            try {
                // Procurar por bloco JSON na resposta
                const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    ideaData = JSON.parse(jsonMatch[0]);
                } else {
                    // Se não encontrar JSON, criar estrutura a partir do texto
                    ideaData = {
                        concept: fullResponse.split('\n\n')[0] || fullResponse.substring(0, 500),
                        visual_suggestion: 'Crie um visual atrativo e alinhado com a marca',
                        caption: fullResponse.length > 500 ? fullResponse.substring(500) : fullResponse,
                        cta: 'Toque para saber mais'
                    };
                }
            } catch (parseError) {
                // Fallback: usar a resposta completa
                ideaData = {
                    concept: fullResponse || 'Ideia gerada pela IA',
                    visual_suggestion: 'Crie um visual atrativo e alinhado com a marca',
                    caption: fullResponse || 'Conteúdo gerado',
                    cta: 'Toque para saber mais'
                };
            }

            // Processar o texto para garantir formatação correta
            const processText = (text) => {
                if (!text) return '';
                // Normalizar quebras de linha duplas
                let processed = text.replace(/\n\n+/g, '\n\n');
                // Garantir que parágrafos estejam separados
                processed = processed.replace(/\n/g, '\n');
                // Remover emojis excessivos (mais de 2 emojis consecutivos)
                processed = processed.replace(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]){3,}/gu, '');
                // Limpar espaços extras mas manter quebras de parágrafo
                processed = processed.replace(/[ \t]+/g, ' ').trim();
                return processed;
            };

            // Processar caption e concept para garantir formatação adequada
            if (ideaData.caption) {
                ideaData.caption = processText(ideaData.caption);
            }
            if (ideaData.concept) {
                ideaData.concept = processText(ideaData.concept);
            }

            setGeneratedIdea({
                ...ideaData,
                category: category.id,
                categoryLabel: category.label
            });
            
            // Avançar para mostrar resultado
            setStep(3);

        } catch (error) {
            console.error('Erro ao gerar ideia:', error);
            toast({
                title: 'Erro ao gerar ideia',
                description: error.message || 'Não foi possível gerar a ideia. Tente novamente.',
                variant: 'destructive'
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveIdea = async () => {
        if (!generatedIdea || !client?.id) return;

        // Verificar limite de 7 ideias
        if (savedIdeas.length >= 7) {
            toast({
                title: 'Limite atingido',
                description: 'Você já tem 7 ideias salvas. Exclua uma para salvar nova.',
                variant: 'destructive'
            });
            return;
        }

        try {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const { error } = await supabase
                .from('story_ideas')
                .insert({
                    client_id: client.id,
                    category: generatedIdea.category,
                    concept: generatedIdea.concept,
                    visual_suggestion: generatedIdea.visual_suggestion,
                    caption: generatedIdea.caption,
                    cta: generatedIdea.cta,
                    context: context || null,
                    expires_at: expiresAt.toISOString(),
                    is_active: true
                });

            if (error) throw error;

            toast({
                title: 'Ideia salva!',
                description: 'A ideia foi salva e estará disponível por 7 dias.'
            });

            await fetchSavedIdeas();
        } catch (error) {
            console.error('Erro ao salvar ideia:', error);
            toast({
                title: 'Erro ao salvar',
                description: error.message || 'Não foi possível salvar a ideia.',
                variant: 'destructive'
            });
        }
    };

    const handleDeleteIdea = async (ideaId) => {
        try {
            const { error } = await supabase
                .from('story_ideas')
                .update({ is_active: false })
                .eq('id', ideaId);

            if (error) throw error;

            toast({
                title: 'Ideia excluída',
                description: 'A ideia foi removida da sua lista.'
            });

            await fetchSavedIdeas();
        } catch (error) {
            console.error('Erro ao excluir ideia:', error);
            toast({
                title: 'Erro ao excluir',
                description: error.message || 'Não foi possível excluir a ideia.',
                variant: 'destructive'
            });
        }
    };

    const handleCopyCaption = () => {
        if (!generatedIdea?.caption) return;
        navigator.clipboard.writeText(generatedIdea.caption);
        toast({
            title: 'Copiado!',
            description: 'Texto copiado para a área de transferência.'
        });
    };

    const handleOpenCorrectDialog = (field) => {
        setCorrectingField(field);
        setIsCorrectingOpen(true);
        setCorrectionContext('');
    };

    const handleCorrectField = async () => {
        if (!correctingField || !correctionContext.trim() || !generatedIdea) return;

        setIsCorrecting(true);
        try {
            const fieldNames = {
                'concept': 'Conceito',
                'visual_suggestion': 'Sugestão de Visual',
                'caption': 'Texto / Caption',
                'cta': 'Call to Action'
            };

            const currentValue = generatedIdea[correctingField] || '';
            const category = STORY_CATEGORIES.find(cat => cat.id === generatedIdea.category);

            const systemPrompt = `Você é um especialista em estratégia de conteúdo para Instagram Stories, trabalhando para a agência JB Apex.

**TAREFA:** Você precisa corrigir ou contextualizar o campo "${fieldNames[correctingField]}" de uma ideia de story já gerada.

**CONTEXTO DO CLIENTE:**
- Nome: ${client?.nome || 'Cliente'}
- Negócio: ${client?.negócio || 'Não informado'}
- Setor: ${client?.setor || 'Não informado'}
- Público-alvo: ${client?.público_alvo || 'Não informado'}

**CONTEÚDO ATUAL DO CAMPO "${fieldNames[correctingField]}":**
${currentValue}

**SOLICITAÇÃO DE CORREÇÃO/CONTEXTUALIZAÇÃO:**
${correctionContext}

**INSTRUÇÕES:**
1. Mantenha o contexto e o estilo do cliente.
2. Aplique a correção/contextualização solicitada.
3. Se for "Conceito" ou "Texto / Caption":
   - Use no máximo 1-2 emojis por texto (prefira nenhum).
   - SEMPRE separe parágrafos com duas quebras de linha (\n\n).
   - Seja natural, humano e específico.
   - Evite clichês genéricos de marketing.
4. Se for "Sugestão de Visual", seja claro e prático.
5. Se for "Call to Action", seja direto e acionável.

**RESPONDA APENAS COM O CONTEÚDO CORRIGIDO**, sem explicações extras, sem JSON, apenas o texto final do campo.`;

            const { data, error: invokeError } = await supabase.functions.invoke('openai-chat', {
                body: {
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Por favor, corrija o campo "${fieldNames[correctingField]}" conforme minha solicitação: ${correctionContext}` }
                    ],
                    model: 'gpt-4o-mini'
                }
            });

            if (invokeError) {
                throw invokeError;
            }

            let correctedText = '';
            
            if (data?.body) {
                // Streaming response
                const reader = data.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') break;
                            
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
                                if (content) {
                                    correctedText += content;
                                }
                            } catch (e) {
                                // Ignorar linhas inválidas
                            }
                        }
                    }
                }
            } else if (data?.text) {
                correctedText = data.text;
            } else {
                throw new Error('Resposta inválida da IA');
            }

            // Processar o texto
            const processText = (text) => {
                if (!text) return '';
                let processed = text.replace(/\n\n+/g, '\n\n');
                processed = processed.replace(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]){3,}/gu, '');
                processed = processed.replace(/[ \t]+/g, ' ').trim();
                return processed;
            };

            correctedText = processText(correctedText.trim());

            // Atualizar apenas o campo corrigido
            setGeneratedIdea({
                ...generatedIdea,
                [correctingField]: correctedText
            });

            setIsCorrectingOpen(false);
            setCorrectingField(null);
            setCorrectionContext('');
            
            toast({
                title: 'Correção aplicada!',
                description: `O campo "${fieldNames[correctingField]}" foi atualizado com sucesso.`
            });

        } catch (error) {
            console.error('Erro ao corrigir campo:', error);
            toast({
                title: 'Erro ao corrigir',
                description: error.message || 'Não foi possível aplicar a correção. Tente novamente.',
                variant: 'destructive'
            });
        } finally {
            setIsCorrecting(false);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Hoje';
        if (diffDays === 1) return 'Ontem';
        return `${diffDays} dias atrás`;
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <>
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="w-full h-full max-w-none ml-0 dark:bg-gray-900">
                <div className="flex flex-col h-full">
                    <DrawerHeader className="border-b dark:border-gray-800 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="h-5 w-5" />
                                </Button>
                                <div>
                                    <DrawerTitle className="dark:text-white text-xl flex items-center gap-2">
                                        <Lightbulb className="h-5 w-5 text-yellow-500" />
                                        Ideias de Stories do Instagram
                                    </DrawerTitle>
                                    <DrawerDescription className="dark:text-gray-400">
                                        {client ? `Para: ${client.empresa}` : 'Carregando...'}
                                    </DrawerDescription>
                                </div>
                            </div>
                            <DrawerClose asChild>
                                <Button variant="ghost" size="icon">
                                    <X className="h-5 w-5" />
                                </Button>
                            </DrawerClose>
                        </div>
                    </DrawerHeader>

                    <ScrollArea className="flex-1 p-6">
                        <div className="max-w-4xl mx-auto space-y-6">
                            {/* Pergunta Principal */}
                            <div className="bg-primary/10 dark:bg-primary/20 p-6 rounded-lg border dark:border-gray-800">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-primary/20 rounded-full">
                                        <Lightbulb className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-semibold dark:text-white mb-2">
                                            O que posso postar hoje no meu Stories do Instagram?
                                        </h2>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Selecione um tipo de story abaixo e deixe a IA gerar uma ideia personalizada para você.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Passo 1: Seleção de Categoria */}
                            {step === 1 && (
                                <div>
                                    <h3 className="text-sm font-medium mb-4 dark:text-gray-300 uppercase tracking-wide">
                                        Passo 1: Selecione o tipo de Story
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {STORY_CATEGORIES.map((category) => {
                                            const CategoryIcon = category.icon;
                                            const isSelected = selectedCategory === category.id;
                                            return (
                                                <button
                                                    key={category.id}
                                                    onClick={() => {
                                                        setSelectedCategory(category.id);
                                                        setStep(2); // Avança para próximo passo
                                                    }}
                                                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                                                        isSelected
                                                            ? 'border-primary bg-primary/10 dark:bg-primary/20 dark:border-primary shadow-sm'
                                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <CategoryIcon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}`} />
                                                        <div className="font-semibold dark:text-white">{category.label}</div>
                                                    </div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                                        {category.description}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Passo 2: Pergunta Rápida */}
                            {step === 2 && selectedCategory && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setStep(1)}
                                            className="text-xs"
                                        >
                                            ← Voltar
                                        </Button>
                                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Passo 2 de 2</span>
                                    </div>

                                    <div className="bg-primary/10 dark:bg-primary/20 p-6 rounded-lg border dark:border-gray-800">
                                        <h3 className="text-lg font-semibold dark:text-white mb-3">
                                            Você vai aparecer no story?
                                        </h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                            Isso ajuda a criar uma ideia mais personalizada para você.
                                        </p>
                                        <div className="flex flex-wrap gap-3">
                                            <Button
                                                variant={clientWantsToAppear === 'sim' ? 'default' : 'outline'}
                                                onClick={() => setClientWantsToAppear('sim')}
                                                className="flex-1 min-w-[120px]"
                                            >
                                                Sim, vou aparecer
                                            </Button>
                                            <Button
                                                variant={clientWantsToAppear === 'nao' ? 'default' : 'outline'}
                                                onClick={() => setClientWantsToAppear('nao')}
                                                className="flex-1 min-w-[120px]"
                                            >
                                                Não, não vou aparecer
                                            </Button>
                                            <Button
                                                variant={clientWantsToAppear === 'indiferente' ? 'default' : 'outline'}
                                                onClick={() => setClientWantsToAppear('indiferente')}
                                                className="flex-1 min-w-[120px]"
                                            >
                                                Tanto faz
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Opções Avançadas (Colapsadas) */}
                                    <div className="border-t dark:border-gray-800 pt-4">
                                        <Button
                                            variant="ghost"
                                            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                            className="w-full justify-between"
                                        >
                                            <span className="text-sm dark:text-gray-300">
                                                {showAdvancedOptions ? 'Ocultar' : 'Mostrar'} opções avançadas
                                            </span>
                                            <Settings className={`h-4 w-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                                        </Button>

                                        {showAdvancedOptions && (
                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                                <div>
                                                    <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                                        Formato do Story
                                                    </label>
                                                    <Select value={storyFormat} onValueChange={setStoryFormat}>
                                                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                            <SelectItem value="indiferente">Indiferente</SelectItem>
                                                            <SelectItem value="foto">Foto estática</SelectItem>
                                                            <SelectItem value="video">Vídeo curto</SelectItem>
                                                            <SelectItem value="carrossel">Carrossel</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                                        Foco do Conteúdo
                                                    </label>
                                                    <Select value={contentFocus} onValueChange={setContentFocus}>
                                                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                            <SelectItem value="indiferente">Indiferente</SelectItem>
                                                            <SelectItem value="produto">Produto</SelectItem>
                                                            <SelectItem value="servico">Serviço</SelectItem>
                                                            <SelectItem value="dica">Dica educativa</SelectItem>
                                                            <SelectItem value="promocao">Promoção/Oferta</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                                        Tom de Voz
                                                    </label>
                                                    <Select value={toneOfVoice} onValueChange={setToneOfVoice}>
                                                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                            <SelectItem value="indiferente">Indiferente (usar tom do cliente)</SelectItem>
                                                            <SelectItem value="casual">Casual e descontraído</SelectItem>
                                                            <SelectItem value="conversacional">Conversacional e natural</SelectItem>
                                                            <SelectItem value="profissional">Profissional mas acessível</SelectItem>
                                                            <SelectItem value="inspirador">Inspirador e motivador</SelectItem>
                                                            <SelectItem value="divertido">Divertido e leve</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Contexto Adicional (Opcional) */}
                                    <div>
                                        <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                            Contexto adicional (opcional)
                                        </label>
                                        <Textarea
                                            value={context}
                                            onChange={(e) => setContext(e.target.value)}
                                            placeholder="Ex: Quero destacar nosso novo produto de queijo artesanal..."
                                            className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                            rows={3}
                                        />
                                    </div>

                                    {/* Botões de Ação */}
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <Button
                                            onClick={generateIdea}
                                            disabled={isGenerating}
                                            className="flex-1"
                                            size="lg"
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Gerando...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="h-4 w-4 mr-2" />
                                                    Gerar Ideia Agora
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Resultado Gerado */}
                            {generatedIdea && (
                                <div className="border-t dark:border-gray-800 pt-6 mt-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setGeneratedIdea(null);
                                                setStep(1);
                                                setSelectedCategory(null);
                                                setClientWantsToAppear('indiferente');
                                                setContext('');
                                            }}
                                            className="text-xs"
                                        >
                                            ← Gerar Nova Ideia
                                        </Button>
                                    </div>
                                    <div className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 p-6 rounded-lg border dark:border-gray-800">
                                        <div className="flex items-center gap-3 mb-6 pb-4 border-b dark:border-gray-800">
                                            <Lightbulb className="h-5 w-5 text-primary" />
                                            <div>
                                                <div className="font-semibold dark:text-white text-base">
                                                    Ideia Gerada
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                    {generatedIdea.categoryLabel} • {new Date().toLocaleDateString('pt-BR')}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-5">
                                            <div>
                                                <h4 className="font-semibold mb-2 dark:text-white text-sm uppercase tracking-wide">Conceito</h4>
                                                <div 
                                                    className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                                                    style={{
                                                        whiteSpace: 'pre-wrap',
                                                        lineHeight: '1.75'
                                                    }}
                                                >
                                                    {(generatedIdea.concept || '').split('\n\n').map((paragraph, idx) => (
                                                        <div key={idx} className="mb-4 last:mb-0">
                                                            {paragraph.split('\n').map((line, lineIdx) => (
                                                                <React.Fragment key={lineIdx}>
                                                                    {line}
                                                                    {lineIdx < paragraph.split('\n').length - 1 && <br />}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="font-semibold mb-2 dark:text-white text-sm uppercase tracking-wide">Sugestão de Visual</h4>
                                                <div 
                                                    className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                                                    style={{
                                                        whiteSpace: 'pre-wrap',
                                                        lineHeight: '1.75'
                                                    }}
                                                >
                                                    {(generatedIdea.visual_suggestion || '').split('\n\n').map((paragraph, idx) => (
                                                        <div key={idx} className="mb-4 last:mb-0">
                                                            {paragraph.split('\n').map((line, lineIdx) => (
                                                                <React.Fragment key={lineIdx}>
                                                                    {line}
                                                                    {lineIdx < paragraph.split('\n').length - 1 && <br />}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="font-semibold mb-2 dark:text-white text-sm uppercase tracking-wide">Texto / Caption Sugerido</h4>
                                                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-md border dark:border-gray-700">
                                                    <div 
                                                        className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed"
                                                        style={{
                                                            whiteSpace: 'pre-wrap',
                                                            lineHeight: '1.75'
                                                        }}
                                                    >
                                                        {(generatedIdea.caption || '').split('\n\n').map((paragraph, idx) => (
                                                            <div key={idx} className="mb-4 last:mb-0">
                                                                {paragraph.split('\n').map((line, lineIdx) => (
                                                                    <React.Fragment key={lineIdx}>
                                                                        {line}
                                                                        {lineIdx < paragraph.split('\n').length - 1 && <br />}
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="font-semibold mb-2 dark:text-white text-sm uppercase tracking-wide">Call to Action</h4>
                                                <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    {generatedIdea.cta}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t dark:border-gray-800">
                                            <Button onClick={handleSaveIdea} variant="default" size="sm">
                                                <Heart className="h-4 w-4 mr-2" />
                                                Salvar Ideia
                                            </Button>
                                            <Button onClick={() => generateIdea()} variant="outline" size="sm" disabled={isGenerating}>
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                Gerar Outra
                                            </Button>
                                            <Button onClick={() => handleOpenCorrectDialog('caption')} variant="outline" size="sm">
                                                <Edit className="h-4 w-4 mr-2" />
                                                Corrigir/Contextualizar
                                            </Button>
                                            <Button onClick={handleCopyCaption} variant="outline" size="sm">
                                                <Copy className="h-4 w-4 mr-2" />
                                                Copiar Texto
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Ideias Salvas */}
                            <div className="border-t dark:border-gray-800 pt-6 mt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
                                        <Calendar className="h-5 w-5" />
                                        Ideias Salvas
                                    </h3>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        {savedIdeas.length}/7 • últimos 7 dias
                                    </span>
                                </div>

                                {isLoadingSaved ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                ) : savedIdeas.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Nenhuma ideia salva ainda.</p>
                                        <p className="text-sm">Gere e salve suas primeiras ideias acima!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {savedIdeas.map((idea) => {
                                            const category = STORY_CATEGORIES.find(c => c.id === idea.category);
                                            const CategoryIcon = category?.icon || Sparkles;
                                            return (
                                                <div
                                                    key={idea.id}
                                                    className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700"
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <CategoryIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                            <div>
                                                                <div className="font-semibold dark:text-white text-sm">
                                                                    {category?.label || 'Outros'}
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {formatDate(idea.created_at)}, {formatTime(idea.created_at)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteIdea(idea.id)}
                                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-3">
                                                        {idea.caption?.substring(0, 150)}...
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full justify-start"
                                                        onClick={() => {
                                                            setGeneratedIdea({
                                                                concept: idea.concept,
                                                                visual_suggestion: idea.visual_suggestion,
                                                                caption: idea.caption,
                                                                cta: idea.cta,
                                                                category: idea.category,
                                                                categoryLabel: category?.label
                                                            });
                                                            // Scroll para cima
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Ver Detalhes
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {savedIdeas.length >= 7 && (
                                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                                        <strong>Limite atingido:</strong> Você tem 7 ideias salvas. Exclua uma para salvar nova. Ideias expiram automaticamente após 7 dias.
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </DrawerContent>
        </Drawer>

        {/* Dialog de Correção/Contextualização */}
        <Dialog open={isCorrectingOpen} onOpenChange={setIsCorrectingOpen}>
            <DialogContent className="sm:max-w-[600px] dark:bg-gray-900 dark:border-gray-800">
                <DialogHeader>
                    <DialogTitle className="dark:text-white flex items-center gap-2">
                        <Edit className="h-5 w-5" />
                        Corrigir ou Contextualizar
                    </DialogTitle>
                    <DialogDescription className="dark:text-gray-400">
                        Selecione qual campo deseja corrigir e descreva o que precisa ser alterado ou contextualizado.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block dark:text-gray-300">
                            Campo para corrigir
                        </label>
                        <Select 
                            value={correctingField || ''} 
                            onValueChange={setCorrectingField}
                        >
                            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                <SelectValue placeholder="Selecione o campo" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                <SelectItem value="concept">Conceito</SelectItem>
                                <SelectItem value="visual_suggestion">Sugestão de Visual</SelectItem>
                                <SelectItem value="caption">Texto / Caption</SelectItem>
                                <SelectItem value="cta">Call to Action</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {correctingField && generatedIdea && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border dark:border-gray-700">
                            <p className="text-xs font-medium mb-2 dark:text-gray-400 uppercase tracking-wide">
                                Conteúdo Atual:
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {generatedIdea[correctingField] || '(vazio)'}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="text-sm font-medium mb-2 block dark:text-gray-300">
                            O que deseja corrigir ou contextualizar?
                        </label>
                        <Textarea
                            value={correctionContext}
                            onChange={(e) => setCorrectionContext(e.target.value)}
                            placeholder="Ex: Adicionar mais emoção ao texto, mencionar o novo produto X, tornar mais casual, incluir uma pergunta para engajamento..."
                            className="min-h-[120px] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Seja específico sobre o que deseja alterar no campo selecionado.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsCorrectingOpen(false);
                            setCorrectingField(null);
                            setCorrectionContext('');
                        }}
                        disabled={isCorrecting}
                        className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                    >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleCorrectField}
                        disabled={!correctingField || !correctionContext.trim() || isCorrecting}
                        className="dark:bg-primary dark:text-white"
                    >
                        {isCorrecting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Aplicando correção...
                            </>
                        ) : (
                            <>
                                <Edit className="h-4 w-4 mr-2" />
                                Aplicar Correção
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
};

export default StoryIdeasGenerator;

