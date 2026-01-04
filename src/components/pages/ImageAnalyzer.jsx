import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Camera, Image as ImageIcon, Send, Loader2, Sparkles, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Helper para logs apenas em desenvolvimento
const isDev = import.meta.env.DEV;
const debugError = (...args) => {
    if (isDev) console.error(...args);
};

const ImageAnalyzer = ({ client, isOpen, onClose, currentAgent }) => {
    const { toast } = useToast();
    const { getOpenAIKey } = useAuth();
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [question, setQuestion] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    
    // Filtros para direcionar a análise
    const [analysisObjective, setAnalysisObjective] = useState('indiferente'); // 'descrever', 'vender', 'educar', 'engajar', 'legenda', 'indiferente'
    const [responseFormat, setResponseFormat] = useState('indiferente'); // 'legenda', 'analise', 'sugestao_post', 'copy', 'indiferente'
    const [toneOfVoice, setToneOfVoice] = useState('indiferente'); // 'casual', 'profissional', 'inspirador', 'divertido', 'conversacional', 'indiferente'
    const [includeDetails, setIncludeDetails] = useState(true); // Se deve descrever detalhes da imagem

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

        setSelectedImage(file);
        const base64 = await convertImageToBase64(file);
        setImagePreview(base64);
        
        // Limpar o input
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        setAnalysisResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const analyzeImage = async () => {
        if (!selectedImage || !imagePreview || !currentAgent) {
            toast({
                title: 'Selecione uma imagem',
                description: 'Por favor, tire uma foto ou selecione uma imagem primeiro.',
                variant: 'destructive'
            });
            return;
        }

        setIsAnalyzing(true);
        setAnalysisResult(null);

        try {
            const apiKey = await getOpenAIKey();
            
            if (!apiKey) {
                throw new Error("Chave de API da OpenAI não encontrada.");
            }

            // Preparar prompt do sistema
            let systemPrompt = currentAgent.prompt
                .replace('{client_name}', client?.empresa || '')
                .replace('{contact_name}', client?.nome_contato || '')
                .replace('{client_niche}', client?.nicho || '')
                .replace('{client_target_audience}', client?.público_alvo || '')
                .replace('{client_tone}', client?.tom_de_voz || '');

            systemPrompt += `\n\n**CONTEXTO DO CLIENTE:**
- Nome: ${client?.nome || client?.nome_contato || 'Cliente'}
- Empresa: ${client?.empresa || 'Não informado'}
- Negócio: ${client?.negócio || 'Não informado'}
- Setor: ${client?.setor || 'Não informado'}
- Nicho: ${client?.nicho || 'Não informado'}
- Público-alvo: ${client?.público_alvo || 'Não informado'}
- Tom de voz: ${client?.tom_de_voz || 'Não informado'}

**FILTROS E PREFERÊNCIAS:**
${analysisObjective !== 'indiferente' ? `- Objetivo da análise: ${analysisObjective === 'descrever' ? 'DESCREVER - Detalhar o que está na imagem de forma descritiva' : analysisObjective === 'vender' ? 'VENDER - Focar em converter, destacar produto/serviço, criar urgência autêntica' : analysisObjective === 'educar' ? 'EDUCAR - Ensinar, informar, agregar valor educativo' : analysisObjective === 'engajar' ? 'ENGAJAR - Criar conexão, interação, perguntas para o público' : analysisObjective === 'legenda' ? 'LEGENDA - Criar legenda/caption para redes sociais' : 'Análise geral'}` : ''}
${responseFormat !== 'indiferente' ? `- Formato da resposta: ${responseFormat === 'legenda' ? 'LEGENDA/CAPTION - Texto pronto para postar em redes sociais' : responseFormat === 'analise' ? 'ANÁLISE TÉCNICA - Análise detalhada e estratégica da imagem' : responseFormat === 'sugestao_post' ? 'SUGESTÃO DE POST - Ideia completa de post incluindo texto e estratégia' : responseFormat === 'copy' ? 'COPY DE VENDAS - Texto persuasivo focado em conversão' : 'Formato livre'}` : ''}
${toneOfVoice !== 'indiferente' ? `- Tom de voz específico: ${toneOfVoice === 'casual' ? 'Casual e descontraído, como falar com um amigo' : toneOfVoice === 'profissional' ? 'Profissional mas acessível, mantendo credibilidade' : toneOfVoice === 'inspirador' ? 'Inspirador e motivador, que gera conexão emocional' : toneOfVoice === 'divertido' ? 'Divertido e leve, com humor quando apropriado' : 'Conversacional e natural, como uma conversa real'}` : ''}
${includeDetails ? '- IMPORTANTE: Descreva detalhadamente o que está na imagem antes de criar a resposta. Seja específico sobre elementos visuais, composição, contexto.' : '- FOCO: Não precisa descrever detalhes da imagem, vá direto ao ponto solicitado.'}

**DIRETRIZES CRÍTICAS PARA ANÁLISE DE IMAGEM:**

1. **VOCÊ É UM ESTRATEGISTA DA JB APEX** - Seja profissional, estratégico e específico. NÃO seja genérico ou amador.

2. **ANÁLISE ESTRATÉGICA, NÃO CLICHÊS:**
   - Analise a imagem com olhar estratégico de marketing
   - Forneça insights úteis e específicos
   - Evite frases genéricas como "pronta para encantar", "não vai querer perder", "super desconto"
   - Evite hashtags genéricas como #LookDoDia, #Estilo, #Fashion
   - Seja específico e contextualizado ao cliente

3. **TEXTO HUMANO E AUTÊNTICO:**
   - Use no máximo 1-2 emojis por texto (prefira nenhum)
   - Seja natural, como um profissional escrevendo para o cliente
   - Evite exagero ou urgência artificial
   - Use linguagem direta e pessoal, mas profissional

4. **SE FOR LEGENDA/CAPTION:**
   - Crie legendas que soem HUMANAS, não geradas por IA
   - Evite padrões genéricos de marketing
   - Contextualize com informações do cliente quando relevante
   - Seja específico sobre o que está na imagem
   - ${responseFormat === 'legenda' || analysisObjective === 'legenda' ? 'IMPORTANTE: Você está criando uma legenda/caption para redes sociais. Deve estar PRONTO PARA POSTAR, sem explicações extras. Apenas o texto da legenda.' : ''}

5. **SE FOR VENDER/COPY DE VENDAS:**
   - ${analysisObjective === 'vender' || responseFormat === 'copy' ? 'Foque em conversão real, destaque benefícios específicos, use call to action natural mas forte. Seja convincente mas autêntico, não genérico.' : ''}

6. **SE FOR ANÁLISE DE PRODUTO/SERVIÇO:**
   - Analise características reais e específicas
   - Dê sugestões práticas e acionáveis
   - Considere o público-alvo do cliente
   - Sugira formas de comunicação baseadas na estratégia

**O QUE NÃO FAZER:**
- NÃO use emojis excessivos
- NÃO use frases genéricas de marketing
- NÃO use hashtags clichês
- NÃO seja vago ou genérico
- NÃO termine com "Se precisar de mais ajuda, é só avisar!"
- NÃO use linguagem de assistente virtual genérico

**O QUE FAZER:**
- Seja específico e detalhado
- Use tom profissional mas acessível
- Contextualize com informações do cliente
- Dê insights estratégicos reais
- Seja direto e útil

**IMPORTANTE:** Você está trabalhando como estrategista da JB APEX. Suas respostas devem refletir expertise profissional, não amadorismo.`;

            const userQuestion = question.trim() || 'Analise esta imagem e me dê sua opinião detalhada sobre ela.';

            const apiMessages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userQuestion },
                        { type: 'image_url', image_url: { url: imagePreview } }
                    ]
                }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: apiMessages,
                    stream: true,
                    max_tokens: 600, // Reduzido para resposta mais rápida
                    temperature: 0.7 // Temperatura moderada para resposta mais rápida
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erro da API: ${response.status} - ${errorText}`);
            }

            // Processar stream com feedback em tempo real
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            // Atualizar resultado em tempo real enquanto processa
            const processStream = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') break;

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    fullResponse += content;
                                    // Atualizar resultado em tempo real
                                    setAnalysisResult(fullResponse);
                                }
                            } catch (e) {
                                // Ignorar linhas inválidas
                            }
                        }
                    }
                }
            };

            await processStream();

        } catch (error) {
            debugError('Erro ao analisar imagem:', error);
            toast({
                title: 'Erro ao analisar imagem',
                description: error.message || 'Não foi possível processar a imagem.',
                variant: 'destructive'
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Limpar estado ao fechar
    React.useEffect(() => {
        if (!isOpen) {
            setSelectedImage(null);
            setImagePreview(null);
            setQuestion('');
            setAnalysisResult(null);
            setAnalysisObjective('indiferente');
            setResponseFormat('indiferente');
            setToneOfVoice('indiferente');
            setIncludeDetails(true);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    }, [isOpen]);

    return (
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
                                        <Camera className="h-5 w-5 text-blue-500" />
                                        Análise de Imagem
                                    </DrawerTitle>
                                    <DrawerDescription className="dark:text-gray-400">
                                        {client ? `Envie uma imagem para análise pela IA` : 'Carregando...'}
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
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* Instruções */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-900 dark:text-blue-100">
                                    <strong>Como usar:</strong> Tire uma foto ou selecione uma imagem, escreva uma pergunta (opcional) e clique em "Analisar Imagem". 
                                    A IA analisará a imagem e dará uma resposta detalhada.
                                </p>
                            </div>

                            {/* Seleção de Imagem */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold dark:text-white">Selecionar Imagem</h3>
                                
                                <div className="flex gap-3">
                                    {/* Botão Câmera (Mobile) */}
                                    <input
                                        ref={cameraInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleImageSelect}
                                        className="hidden"
                                        id="camera-input"
                                        disabled={isAnalyzing}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1 dark:bg-gray-800 dark:border-gray-700"
                                        disabled={isAnalyzing}
                                        onClick={() => cameraInputRef.current?.click()}
                                    >
                                        <Camera className="h-4 w-4 mr-2" />
                                        Tirar Foto
                                    </Button>

                                    {/* Botão Selecionar Arquivo */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageSelect}
                                        className="hidden"
                                        id="file-input"
                                        disabled={isAnalyzing}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1 dark:bg-gray-800 dark:border-gray-700"
                                        disabled={isAnalyzing}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        Escolher Arquivo
                                    </Button>
                                </div>

                                {/* Preview da Imagem */}
                                {imagePreview && (
                                    <div className="relative inline-block">
                                        <div className="relative rounded-lg overflow-hidden border-2 border-primary">
                                            <img 
                                                src={imagePreview} 
                                                alt="Preview" 
                                                className="max-w-full max-h-96 object-contain"
                                            />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-2 right-2"
                                                onClick={removeImage}
                                                disabled={isAnalyzing}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Filtros */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-md border dark:border-gray-700">
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    <h3 className="text-sm font-semibold dark:text-gray-300 uppercase tracking-wide">
                                        Filtros para Melhor Entrega
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                            Objetivo da Análise
                                        </label>
                                        <Select value={analysisObjective} onValueChange={setAnalysisObjective}>
                                            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                <SelectItem value="indiferente">Indiferente</SelectItem>
                                                <SelectItem value="descrever">Descrever imagem</SelectItem>
                                                <SelectItem value="legenda">Criar legenda/caption</SelectItem>
                                                <SelectItem value="vender">Focar em vender</SelectItem>
                                                <SelectItem value="educar">Educar/informar</SelectItem>
                                                <SelectItem value="engajar">Gerar engajamento</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {analysisObjective === 'descrever' && 'Análise descritiva detalhada'}
                                            {analysisObjective === 'legenda' && 'Texto pronto para postar'}
                                            {analysisObjective === 'vender' && 'Foco em conversão'}
                                            {analysisObjective === 'educar' && 'Agregar valor educativo'}
                                            {analysisObjective === 'engajar' && 'Criar conexão com público'}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                            Formato da Resposta
                                        </label>
                                        <Select value={responseFormat} onValueChange={setResponseFormat}>
                                            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                <SelectItem value="indiferente">Indiferente</SelectItem>
                                                <SelectItem value="legenda">Legenda/Caption (pronto para postar)</SelectItem>
                                                <SelectItem value="analise">Análise técnica detalhada</SelectItem>
                                                <SelectItem value="sugestao_post">Sugestão completa de post</SelectItem>
                                                <SelectItem value="copy">Copy de vendas</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Tipo de resposta desejada
                                        </p>
                                    </div>

                                    <div>
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
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Como o texto deve soar
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium mb-2 block dark:text-gray-400">
                                            Incluir Descrição Detalhada
                                        </label>
                                        <Select 
                                            value={includeDetails ? 'sim' : 'nao'} 
                                            onValueChange={(val) => setIncludeDetails(val === 'sim')}
                                        >
                                            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                                <SelectItem value="sim">Sim, descrever detalhes</SelectItem>
                                                <SelectItem value="nao">Não, ir direto ao ponto</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {includeDetails ? 'Descreverá elementos visuais da imagem' : 'Vai direto ao objetivo solicitado'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Campo de Pergunta */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium dark:text-gray-300">
                                    Pergunta ou Contexto Adicional (opcional)
                                </label>
                                <Textarea
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="Ex: Como você falaria sobre essa roupa? / Analise este produto / O que você sugere para este visual?"
                                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-white min-h-[100px]"
                                    disabled={isAnalyzing || !selectedImage}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Especifique detalhes adicionais ou deixe em branco para usar apenas os filtros acima
                                </p>
                            </div>

                            {/* Botão Analisar */}
                            <Button
                                onClick={analyzeImage}
                                disabled={!selectedImage || isAnalyzing || !currentAgent}
                                size="lg"
                                className="w-full"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Analisando...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Analisar Imagem
                                    </>
                                )}
                            </Button>

                            {/* Resultado da Análise (mostra em tempo real durante streaming) */}
                            {(analysisResult || isAnalyzing) && (
                                <div className="border-t dark:border-gray-800 pt-6 mt-6">
                                    <div className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 p-6 rounded-lg border dark:border-gray-800">
                                        <div className="flex items-center gap-3 mb-4 pb-4 border-b dark:border-gray-800">
                                            <Sparkles className="h-5 w-5 text-primary" />
                                            <div>
                                                <div className="font-semibold dark:text-white text-base">
                                                    {isAnalyzing ? 'Analisando...' : 'Análise da IA'}
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                    {currentAgent?.name || 'Assistente'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="prose prose-sm dark:prose-invert max-w-none">
                                            <div 
                                                className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed"
                                                style={{ whiteSpace: 'pre-wrap', lineHeight: '1.75', minHeight: '50px' }}
                                            >
                                                {analysisResult ? (
                                                    analysisResult.split('\n\n').map((paragraph, idx) => (
                                                        <div key={idx} className="mb-4 last:mb-0">
                                                            {paragraph.split('\n').map((line, lineIdx) => (
                                                                <React.Fragment key={lineIdx}>
                                                                    {line}
                                                                    {lineIdx < paragraph.split('\n').length - 1 && <br />}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        <span>Processando imagem e gerando análise...</span>
                                                    </div>
                                                )}
                                                {isAnalyzing && analysisResult && (
                                                    <span className="inline-block ml-1 w-0.5 h-4 bg-current align-middle animate-pulse" />
                                                )}
                                            </div>
                                        </div>

                                        {!isAnalyzing && analysisResult && (
                                            <div className="flex gap-2 mt-6 pt-4 border-t dark:border-gray-800">
                                                <Button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(analysisResult);
                                                        toast({
                                                            title: 'Copiado!',
                                                            description: 'Análise copiada para a área de transferência.'
                                                        });
                                                    }} 
                                                    variant="outline" 
                                                    size="sm"
                                                >
                                                    Copiar Análise
                                                </Button>
                                                <Button 
                                                    onClick={() => {
                                                        removeImage();
                                                        setQuestion('');
                                                    }} 
                                                    variant="outline" 
                                                    size="sm"
                                                >
                                                    Analisar Outra Imagem
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default ImageAnalyzer;

