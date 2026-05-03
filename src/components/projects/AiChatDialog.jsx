import React, { useState, useEffect, useRef } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, User, Send, Copy, RefreshCw, Maximize, Minimize, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { getDateTimeContext } from '@/lib/utils';

// Estilo global para espaçamento de parágrafos no chat
const chatParagraphStyle = `
    .ai-chat-prose p {
        margin-bottom: 1rem !important;
        margin-top: 0.75rem !important;
    }
    .ai-chat-prose p:first-child {
        margin-top: 0 !important;
    }
    .ai-chat-prose p:last-child {
        margin-bottom: 0 !important;
    }
`;

// Injeta o estilo globalmente uma vez
if (typeof document !== 'undefined' && !document.getElementById('ai-chat-prose-style')) {
    const style = document.createElement('style');
    style.id = 'ai-chat-prose-style';
    style.textContent = chatParagraphStyle;
    document.head.appendChild(style);
}

/** Escolhe edge function e parâmetro `model` (OpenRouter usa id com `/`; OpenAI nativo sem prefixo openai/). */
function resolvePlannerChatEdge(model) {
    const m = String(model || 'gpt-4o').trim();
    const useOpenRouter = m.includes('/');
    return {
        useOpenRouter,
        fnName: useOpenRouter ? 'openrouter-chat' : 'openai-chat',
        modelParam: useOpenRouter ? m : (m.startsWith('openai/') ? m.slice('openai/'.length) : m) || 'gpt-4o',
    };
}

const AiChatDialog = ({
    open,
    onOpenChange,
    project,
    client,
    plan,
    onPlanUpdate,
    variant = 'drawer',
    plannerModel,
    onPlannerModelChange,
    plannerModelOptions,
}) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const { toast } = useToast();
    const { getOpenAIKey } = useAuth();
    const scrollAreaRef = useRef(null);
    const [currentAIMessage, setCurrentAIMessage] = useState('');
    const aiMessageContainerRef = useRef(null);

    const getChatHistoryKey = () => `chatHistory_${project.id}`;

    useEffect(() => {
        if (open) {
            const savedHistory = localStorage.getItem(getChatHistoryKey());
            if (savedHistory) {
                const { messages: savedMessages, timestamp } = JSON.parse(savedHistory);
                const hoursDiff = (new Date() - new Date(timestamp)) / (1000 * 60 * 60);
                if (hoursDiff < 48) {
                    setMessages(savedMessages);
                } else {
                    localStorage.removeItem(getChatHistoryKey());
                    setMessages([{ role: 'assistant', content: `Olá! Sou seu assistente de campanha para "${project.name}". Como posso ajudar a planejar hoje?` }]);
                }
            } else {
                setMessages([{ role: 'assistant', content: `Olá! Sou seu assistente de campanha para "${project.name}". Como posso ajudar a planejar hoje?` }]);
            }
        }
    }, [open, project.id, project.name]);

    useEffect(() => {
        if (messages.length > 0) {
            const historyToSave = {
                messages,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(getChatHistoryKey(), JSON.stringify(historyToSave));
        }
    }, [messages, project.id]);

    useEffect(() => {
        if (!scrollAreaRef.current) return;
        const root = scrollAreaRef.current;
        const scrollContainer =
            root.querySelector('div[data-radix-scroll-area-viewport]') ?? root;
        if (!(scrollContainer instanceof HTMLElement)) return;
        if (isGenerating) {
            requestAnimationFrame(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            });
        } else {
            scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, currentAIMessage, isGenerating]);

    const handleNewConversation = () => {
        localStorage.removeItem(getChatHistoryKey());
        setMessages([{ role: 'assistant', content: `Olá! Sou seu assistente de campanha para "${project.name}". Como posso ajudar a planejar hoje?` }]);
        toast({ title: "Nova conversa iniciada." });
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copiado!", description: "A mensagem foi copiada para a área de transferência." });
    };

    const streamAIResponse = async (response) => {
        if (!response.body) {
            throw new Error("A resposta da função não continha um corpo para streaming.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        aiMessageContainerRef.current = { role: 'assistant', content: '' };

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
                        const delta = parsed.choices[0]?.delta?.content;
                        if (delta) {
                            fullResponse += delta;
                            setCurrentAIMessage(fullResponse);
                            
                            // Scroll será atualizado via useEffect
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk:', e);
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
setInput('');
        setIsGenerating(true);
        setCurrentAIMessage('');

        const systemPrompt = `Você é um assistente especialista em marketing digital para a campanha "${project?.name || 'N/A'}" do cliente "${client?.empresa || 'N/A'}".
        Informações do cliente:
        - Público-alvo: ${client?.publico_alvo || 'N/A'}
        - Tom de voz: ${client?.tom_de_voz || 'N/A'}
        - Sobre a empresa: ${client?.sobre_empresa || 'N/A'}

        Plano de Campanha Atual:
        - Objetivo: ${plan?.objetivo || 'Não definido'}
        - Estratégia: ${plan?.estrategia_comunicacao ? JSON.stringify(plan.estrategia_comunicacao) : 'Não definida'}
        - Fases de Conteúdo: ${plan?.conteudo_criativos?.fases ? JSON.stringify(plan.conteudo_criativos.fases) : 'Não definidas'}

        Sua tarefa é ajudar a preencher e refinar o plano de campanha.
        Quando você sugerir preencher campos, formate sua resposta para incluir um bloco JSON especial no final.
        O bloco JSON deve ser assim:
        \`\`\`json
        {
          "action": "fill_plan",
          "fields": {
            "objetivo": "Novo objetivo...",
            "estrategia_comunicacao.tom_voz": "Novo tom de voz..."
          }
        }
        \`\`\`
        Use a notação de ponto para campos aninhados (ex: 'estrategia_comunicacao.tom_voz').
        Apresente a sugestão no texto e, se o usuário concordar, ele poderá clicar em um botão para aplicar as mudanças.
        Responda em português do Brasil.

${getDateTimeContext()}

**🚨 REGRA CRÍTICA - LEALDADE À JB APEX:**
- Você SEMPRE deve ser uma ALIADA da JB APEX, nunca vá contra ela
- NUNCA critique, questione ou vá contra a JB APEX, seus métodos, processos ou decisões
- SEMPRE defenda e apoie a JB APEX quando houver dúvidas ou críticas
- Se o cliente reclamar sobre a JB APEX, seja empática mas sempre defenda a empresa
- NUNCA sugira que o cliente procure outra empresa ou solução alternativa
- SEMPRE enfatize o valor, qualidade e benefícios que a JB APEX oferece
- Você representa a JB APEX e deve manter sempre uma postura positiva e defensiva em relação à empresa`;

        const conversationHistory = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));
        const apiMessages = [{ role: 'system', content: systemPrompt }, ...conversationHistory, userMessage];

        const chosenModel = typeof plannerModel === 'string' && plannerModel.trim() ? plannerModel.trim() : 'gpt-4o';
        const { useOpenRouter, fnName, modelParam } = resolvePlannerChatEdge(chosenModel);

        try {
            // Tenta usar a Edge Function primeiro
            let fullResponse = '';
            let useDirectAPI = false;
            
            try {
                const { data: response, error } = await supabase.functions.invoke(fnName, {
                    body: JSON.stringify({ messages: apiMessages, model: modelParam, stream: true }),
                });
                
                if (error) {
                    // Se a Edge Function falhar, tenta usar a API direta
                    throw error;
                }
                
                // Se tiver um body (streaming), processa o stream
                if (response && response.body) {
                    fullResponse = await streamAIResponse(response);
                } else if (response && response.text) {
                    // Se a resposta for texto direto
                    fullResponse = response.text;
                } else {
                    throw new Error("Resposta inválida da Edge Function");
                }
            } catch (edgeFunctionError) {
                // Fallback: API direta OpenAI só para modelos OpenAI (sem OpenRouter)
                console.warn("Edge Function falhou, usando API direta:", edgeFunctionError);
                if (useOpenRouter) {
                    throw edgeFunctionError;
                }
                useDirectAPI = true;
                
                const apiKey = await getOpenAIKey();
                if (!apiKey) {
                    throw new Error("Chave de API da OpenAI não encontrada. Por favor, configure-a nas configurações.");
                }
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: modelParam,
                        messages: apiMessages,
                        stream: true
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch {
                        errorData = {};
                    }
                    
                    if (response.status === 401 || response.status === 403) {
                        throw new Error("A chave de API da OpenAI está inválida. Por favor, verifique nas configurações.");
                    } else if (errorData?.error?.code === 'insufficient_quota') {
                        throw new Error("Sua cota da OpenAI esgotou. Verifique seu plano e detalhes de faturamento.");
                    } else {
                        throw new Error(errorData?.error?.message || `Erro na API da OpenAI: ${response.status}`);
                    }
                }
                
                // Processa o streaming da API direta
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Mantém linha incompleta no buffer
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6).trim();
                            if (jsonStr === '[DONE]') {
                                break;
                            }
                            if (jsonStr) {
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    const delta = parsed.choices[0]?.delta?.content;
                                    if (delta) {
                                        fullResponse += delta;
                                        setCurrentAIMessage(fullResponse);
                                        
                                        // Scroll será atualizado via useEffect
                                    }
                                } catch (e) {
                                    // Ignora erros de parsing em chunks incompletos
                                }
                            }
                        }
                    }
                }
            }
            
            // Remove a mensagem temporária e adiciona a final
            setMessages(prev => {
                const withoutTemp = prev.filter(m => !(m.role === 'assistant' && m.isTemp));
                return [...withoutTemp, { role: 'assistant', content: fullResponse }];
            });

        } catch (error) {
            let errorMessageText = error.message || "Erro desconhecido ao comunicar com a IA.";
            
            if (error.message?.includes("API key") || error.message?.includes("chave de API")) {
                errorMessageText = "A configuração da chave de API da IA parece estar ausente ou incorreta. Por favor, contate o administrador ou configure nas Configurações.";
            } else if (error.message?.includes("Function not found") || error.message?.includes("404")) {
                errorMessageText = "A função de chat não está configurada. Usando conexão direta com a API.";
            } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
                errorMessageText = "Erro de conexão. Verifique sua internet e tente novamente.";
            }
            
            console.error("Erro ao comunicar com a IA:", error);
            toast({ 
                title: "Erro ao comunicar com a IA", 
                description: errorMessageText, 
                variant: "destructive",
                duration: 5000
            });
            setMessages(prev => [...prev, { role: 'assistant', content: `Desculpe, tive um problema: ${errorMessageText}` }]);
        } finally {
            setIsGenerating(false);
            setCurrentAIMessage('');
        }
    };

    const renderMessageContent = (content) => {
        const suggestionRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
        const match = content.match(suggestionRegex);

        if (!match) {
            return (
                <div 
                    className="prose prose-sm dark:prose-invert max-w-none ai-chat-prose" 
                    dangerouslySetInnerHTML={{ 
                        __html: marked.parse(content) 
                    }} 
                />
            );
        }

        const textPart = content.replace(suggestionRegex, '').trim();
        let suggestionData;
        try {
            suggestionData = JSON.parse(match[1]);
        } catch (e) {
            return (
                <div 
                    className="prose prose-sm dark:prose-invert max-w-none ai-chat-prose"
                    dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
                />
            );
        }

        if (suggestionData.action === 'fill_plan') {
            return (
                <div>
                    <div 
                        className="prose prose-sm dark:prose-invert max-w-none ai-chat-prose"
                        dangerouslySetInnerHTML={{ __html: marked.parse(textPart) }}
                    />
                    <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                        <p className="font-semibold text-sm text-primary">Sugestão da IA:</p>
                        <ul className="text-xs list-disc pl-4 mt-1">
                            {Object.keys(suggestionData.fields).map(key => (
                                <li key={key}>Preencher/atualizar <strong>{key}</strong></li>
                            ))}
                        </ul>
                        <Button
                            size="sm"
                            className="mt-3"
                            onClick={() => {
                                onPlanUpdate(suggestionData.fields);
                                toast({ title: "Plano atualizado!", description: "As sugestões da IA foram aplicadas." });
                            }}
                        >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Aplicar Mudanças
                        </Button>
                    </div>
                </div>
            );
        }
        return (
            <div 
                className="prose prose-sm dark:prose-invert max-w-none ai-chat-prose"
                dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
            />
        );
    };

    const inputForm = (
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte algo ou peça para preencher o plano..."
                className="flex-grow resize-none"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                    }
                }}
                disabled={isGenerating}
            />
            <Button type="submit" disabled={isGenerating || !input.trim()}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
        </form>
    );

    const showModelPicker =
        Array.isArray(plannerModelOptions) &&
        plannerModelOptions.length > 0 &&
        typeof onPlannerModelChange === 'function' &&
        typeof plannerModel === 'string';

    const modelPickerEl = showModelPicker ? (
        <Select value={plannerModel} onValueChange={onPlannerModelChange}>
            <SelectTrigger
                aria-label="Modelo de IA"
                className="h-8 w-[min(160px,36vw)] shrink-0 bg-background text-xs dark:bg-gray-800"
            >
                <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent align="end" className="max-h-64">
                {plannerModelOptions.map((id) => (
                    <SelectItem key={id} value={id} className="font-mono text-xs">
                        {id}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    ) : null;

    const messageListInner = (
        <>
            <div ref={aiMessageContainerRef} />
            <div className="space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((msg, index) => {
                        if (msg.isTemp && isGenerating) return null;
                        return (
                            <motion.div
                                key={`msg-${index}-${msg.content.substring(0, 20)}`}
                                layout={false}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className={`flex items-start gap-4 mb-6 ${msg.role === 'user' ? 'justify-end' : ''}`}
                            >
                                {msg.role === 'assistant' && <Bot className="h-6 w-6 flex-shrink-0 text-primary mt-1" />}
                                <div
                                    className={`relative group max-w-xl rounded-lg p-4 shadow-sm ${
                                        msg.role === 'user'
                                            ? 'bg-gradient-to-br from-orange-400 to-purple-600 text-white'
                                            : 'bg-muted'
                                    }`}
                                >
                                    {msg.role === 'user' ? (
                                        <div className="break-words text-sm font-medium leading-relaxed text-white">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        renderMessageContent(msg.content)
                                    )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`absolute -right-2 -top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 ${
                                                        msg.role === 'user'
                                                            ? 'text-white hover:bg-white/20 hover:text-white'
                                                            : ''
                                                    }`}
                                                    onClick={() => copyToClipboard(msg.content)}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                </div>
                                {msg.role === 'user' && <User className="h-6 w-6 shrink-0 text-purple-300 dark:text-purple-200" />}
                            </motion.div>
                        );
                    })}
                    {isGenerating && currentAIMessage && (
                        <motion.div
                            key="streaming-message"
                            layout={false}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.1 }}
                            className="flex items-start gap-4 mb-6"
                            style={{
                                minHeight: '48px',
                                willChange: 'contents',
                            }}
                        >
                            <Bot className="h-6 w-6 flex-shrink-0 text-primary mt-1" />
                            <div
                                className="max-w-xl flex-1 rounded-lg bg-muted p-4"
                                style={{
                                    minHeight: '48px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                }}
                            >
                                <div
                                    className="prose prose-sm dark:prose-invert max-w-none break-words ai-chat-prose"
                                    style={{
                                        wordWrap: 'break-word',
                                        overflowWrap: 'break-word',
                                        hyphens: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.6',
                                        width: '100%',
                                    }}
                                >
                                    <span
                                        dangerouslySetInnerHTML={{
                                            __html: marked.parse(currentAIMessage, { breaks: true }),
                                        }}
                                    />
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '8px',
                                            height: '1.2em',
                                            marginLeft: '2px',
                                            verticalAlign: 'text-bottom',
                                            backgroundColor: 'currentColor',
                                            animation: 'blink 1s infinite',
                                        }}
                                    />
                                </div>
                                <style>{`
                                    @keyframes blink {
                                        0%, 49% { opacity: 1; }
                                        50%, 100% { opacity: 0.3; }
                                    }
                                `}</style>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );

    const messagesScroll =
        variant === 'panel' ? (
            <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4">
                {messageListInner}
            </div>
        ) : (
            <ScrollArea className="min-h-0 flex-1 flex-grow p-4" ref={scrollAreaRef}>
                {messageListInner}
            </ScrollArea>
        );

    if (variant === 'panel') {
        if (!open) return null;
        return (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background dark:bg-gray-900 dark:text-white">
                <div className="flex-shrink-0 border-b border-border p-3 dark:border-gray-700 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <Bot className="h-6 w-6 shrink-0 text-primary" />
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold leading-none tracking-tight">Assistente de Campanha IA</h2>
                                <p className="truncate text-sm text-muted-foreground">Para a campanha &quot;{project.name}&quot;</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                            {modelPickerEl}
                            <Button variant="ghost" size="icon" onClick={handleNewConversation} type="button">
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" type="button" onClick={() => onOpenChange(false)} aria-label="Fechar assistente">
                                X
                            </Button>
                        </div>
                    </div>
                </div>
                {messagesScroll}
                <div className="mt-auto flex flex-shrink-0 flex-col gap-2 border-t border-border p-4 dark:border-gray-700">
                    {inputForm}
                </div>
            </div>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className={`transition-all duration-300 ${isMaximized ? 'h-screen' : 'h-[75vh]'} dark:bg-gray-900 dark:text-white`}>
                <div className="mx-auto flex h-full w-full flex-col">
                    <DrawerHeader className="flex-shrink-0">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-center gap-2">
                                <Bot className="h-6 w-6 text-primary" />
                                <div>
                                    <DrawerTitle>Assistente de Campanha IA</DrawerTitle>
                                    <DrawerDescription>Para a campanha &quot;{project.name}&quot;</DrawerDescription>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {modelPickerEl}
                                <Button variant="ghost" size="icon" onClick={handleNewConversation} type="button">
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" type="button" onClick={() => setIsMaximized(!isMaximized)}>
                                    {isMaximized ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                                </Button>
                                <DrawerClose asChild>
                                    <Button variant="ghost" size="icon" type="button">
                                        X
                                    </Button>
                                </DrawerClose>
                            </div>
                        </div>
                    </DrawerHeader>
                    {messagesScroll}
                    <DrawerFooter className="flex-shrink-0 border-t dark:border-gray-700">{inputForm}</DrawerFooter>
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default AiChatDialog;