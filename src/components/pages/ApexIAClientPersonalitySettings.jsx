import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Info, Bot, Sparkles, Eye, FileText, Download, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PERSONALITY_TEMPLATES } from '@/lib/personalityTemplates';

const CONFIG_KEY = 'apexia_client_personality_config';

// Valores padrão
const defaultConfig = {
  ai_model: 'gpt-5.1', // Modelo padrão - Melhor inteligência disponível
  personality: {
    traits: ['prestativo', 'empático', 'profissional'],
    tone_description: 'Amigável mas profissional, como um consultor experiente que se importa com o sucesso do cliente',
    formality: 'profissional'
  },
  behavior: {
    proactivity: 75,
    emoji_usage: 'moderate',
    response_format: ['lists', 'paragraphs', 'examples']
  },
  custom_rules: [
    'Sempre ser respeitoso e paciente',
    'Oferecer ajuda proativa quando relevante',
    'Usar linguagem acessível, evitando jargões técnicos',
    'Quando não souber algo, sugerir criar solicitação',
    'Nunca inventar informações sobre o cliente',
    'LEALDADE À JB APEX: SEMPRE ser uma aliada da JB APEX, nunca ir contra ela',
    'LEALDADE À JB APEX: NUNCA criticar, questionar ou ir contra a JB APEX, seus métodos, processos ou decisões',
    'LEALDADE À JB APEX: SEMPRE defender e apoiar a JB APEX quando o cliente tiver dúvidas ou críticas',
    'LEALDADE À JB APEX: Se o cliente reclamar sobre a JB APEX, ser empática mas sempre defender a empresa',
    'LEALDADE À JB APEX: NUNCA sugerir que o cliente procure outra empresa ou solução alternativa',
    'LEALDADE À JB APEX: SEMPRE enfatizar os benefícios e o valor que a JB APEX oferece ao cliente',
    'RESPOSTAS PROGRESSIVAS: Sempre fazer perguntas antes de elaborar respostas muito longas',
    'RESPOSTAS PROGRESSIVAS: Quando o cliente pedir algo amplo (ex: "criar um plano"), primeiro perguntar o que ele precisa especificamente',
    'RESPOSTAS PROGRESSIVAS: Evitar respostas muito longas de uma vez - dividir em partes e perguntar se o cliente quer mais detalhes',
    'RESPOSTAS PROGRESSIVAS: Ser conciso inicialmente e expandir apenas se o cliente pedir mais informações',
    'RESPOSTAS PROGRESSIVAS: Priorizar diálogo interativo ao invés de monólogos longos'
  ],
  response_guidelines: {
    use_lists: true,
    use_examples: true,
    use_markdown: true,
    section_separation: true,
    progressive_responses: true, // Respostas progressivas - perguntar antes de elaborar muito
    concise_first: true, // Ser conciso primeiro, expandir depois
    interactive_dialogue: true // Priorizar diálogo interativo
  },
  client_data_access: {
    // Informações Básicas
    empresa: true,
    nome_contato: true,
    nicho: true,
    publico_alvo: true,
    tom_de_voz: true,
    // Informações da Empresa
    sobre_empresa: true,
    produtos_servicos: true,
    avaliacao_treinamento: true,
    // Informações de Contrato
    tipo_contrato: true,
    valor: true,
    vencimento: true,
    // Informações de Gestão
    etapa: true,
    responsavel: true,
    // Redes Sociais
    instagram: true,
    // Documento/Notas
    client_document: true,
    // Etiquetas
    etiquetas: true,
    // Projetos (sempre disponível, mas pode ser controlado)
    projetos: true
  }
};

const PERSONALITY_TRAITS = [
  'prestativo',
  'empático',
  'direto',
  'técnico',
  'criativo',
  'profissional',
  'amigável',
  'formal'
];

// Modelos de IA disponíveis
const AI_MODELS = [
  // Modelos GPT-5 (Mais Recentes) - NOVOS
  { value: 'gpt-5.1', label: 'GPT-5.1 (NOVO - Melhor para código e tarefas agentic)', description: 'O melhor modelo para programação e tarefas agentic com esforço de raciocínio configurável' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini (Mais rápido e econômico)', description: 'Versão mais rápida e econômica do GPT-5 para tarefas bem definidas' },
  { value: 'gpt-5-nano', label: 'GPT-5 nano (Mais rápido e econômico)', description: 'Versão mais rápida e econômica do GPT-5' },
  
  // Modelos O (Raciocínio Profundo) - Mais Recentes
  { value: 'o3', label: 'O3 (Mais recente - Raciocínio avançado)', description: 'Modelo mais recente com raciocínio lógico passo a passo aprimorado' },
  { value: 'o3-mini', label: 'O3 Mini (Raciocínio rápido)', description: 'Versão mais rápida do O3, com raciocínio profundo' },
  { value: 'o1-preview', label: 'O1 Preview (Raciocínio profundo)', description: 'Modelo avançado com raciocínio profundo, ideal para tarefas complexas' },
  { value: 'o1-mini', label: 'O1 Mini (Raciocínio rápido)', description: 'Versão mais rápida do O1, com raciocínio profundo' },
  
  // Modelos GPT-4o (Multimodal) - Recomendados
  { value: 'gpt-4o', label: 'GPT-4o (Recomendado - Mais inteligente)', description: 'Modelo mais recente e poderoso da OpenAI, multimodal' },
  { value: 'gpt-4o-2024-08-06', label: 'GPT-4o (2024-08-06)', description: 'Versão específica do GPT-4o de agosto 2024' },
  { value: 'gpt-4o-2024-05-13', label: 'GPT-4o (2024-05-13)', description: 'Versão específica do GPT-4o de maio 2024' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido e econômico)', description: 'Versão mais rápida e barata, ainda muito capaz' },
  { value: 'gpt-4o-mini-2024-07-18', label: 'GPT-4o Mini (2024-07-18)', description: 'Versão específica do GPT-4o Mini de julho 2024' },
  
  // Modelos GPT-4 Turbo
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Versão turbo do GPT-4' },
  { value: 'gpt-4-turbo-2024-04-09', label: 'GPT-4 Turbo (2024-04-09)', description: 'Versão específica do GPT-4 Turbo de abril 2024' },
  { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview', description: 'Versão preview do GPT-4 Turbo' },
  
  // Modelos GPT-4
  { value: 'gpt-4', label: 'GPT-4', description: 'Modelo GPT-4 padrão' },
  { value: 'gpt-4-0613', label: 'GPT-4 (2023-06-13)', description: 'Versão específica do GPT-4 de junho 2023' },
  
  // Modelos GPT-3.5 (Econômicos)
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Mais econômico)', description: 'Modelo mais rápido e econômico, boa qualidade' },
  { value: 'gpt-3.5-turbo-0125', label: 'GPT-3.5 Turbo (2024-01-25)', description: 'Versão específica do GPT-3.5 Turbo de janeiro 2024' }
];

// Templates pré-definidos agora importados de lib/personalityTemplates.js

// Campos do cliente que podem ser controlados
const CLIENT_DATA_FIELDS = [
  { 
    category: 'Informações Básicas',
    fields: [
      { key: 'empresa', label: 'Nome da Empresa', required: true },
      { key: 'nome_contato', label: 'Nome do Contato', required: true },
      { key: 'nicho', label: 'Nicho de Mercado', required: false },
      { key: 'publico_alvo', label: 'Público-Alvo', required: false },
      { key: 'tom_de_voz', label: 'Tom de Voz', required: false }
    ]
  },
  {
    category: 'Informações da Empresa',
    fields: [
      { key: 'sobre_empresa', label: 'Sobre a Empresa', required: false },
      { key: 'produtos_servicos', label: 'Produtos/Serviços', required: false },
      { key: 'avaliacao_treinamento', label: 'Avaliação/Treinamento', required: false }
    ]
  },
  {
    category: 'Informações de Contrato',
    fields: [
      { key: 'tipo_contrato', label: 'Tipo de Contrato', required: false },
      { key: 'valor', label: 'Valor Mensal', required: false },
      { key: 'vencimento', label: 'Vencimento do Contrato', required: false }
    ]
  },
  {
    category: 'Informações de Gestão',
    fields: [
      { key: 'etapa', label: 'Etapa do Funil', required: false },
      { key: 'responsavel', label: 'Responsável', required: false }
    ]
  },
  {
    category: 'Redes Sociais e Outros',
    fields: [
      { key: 'instagram', label: 'Instagram', required: false },
      { key: 'client_document', label: 'Documento/Notas do Cliente', required: false },
      { key: 'etiquetas', label: 'Etiquetas', required: false },
      { key: 'projetos', label: 'Projetos', required: false }
    ]
  }
];

const ApexIAClientPersonalitySettings = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customRulesText, setCustomRulesText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_config')
        .select('key, value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.value) {
        try {
          const parsedConfig = JSON.parse(data.value);
          // Merge com valores padrão para garantir que campos novos existam
          const mergedConfig = {
            ...defaultConfig,
            ...parsedConfig,
            client_data_access: {
              ...defaultConfig.client_data_access,
              ...(parsedConfig.client_data_access || {})
            }
          };
          setConfig(mergedConfig);
          // Sincroniza o estado local do textarea
          setCustomRulesText((mergedConfig.custom_rules || []).join('\n'));
        } catch (parseError) {
          console.warn('Erro ao fazer parse da configuração:', parseError);
          // Usa valores padrão se houver erro no parse
          setConfig(defaultConfig);
          setCustomRulesText((defaultConfig.custom_rules || []).join('\n'));
        }
      } else {
        // Usa valores padrão se não houver configuração
        setConfig(defaultConfig);
        setCustomRulesText((defaultConfig.custom_rules || []).join('\n'));
      }
    } catch (e) {
      console.warn('Configuração não carregada:', e?.message || e);
      toast({
        title: 'Aviso',
        description: 'Não foi possível carregar a configuração. Usando valores padrão.',
        variant: 'destructive',
      });
      setConfig(defaultConfig);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({
          key: CONFIG_KEY,
          value: JSON.stringify(config),
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      toast({
        title: 'Configuração salva!',
        description: 'A personalidade do ApexIA foi configurada com sucesso e será aplicada em todos os chats dos clientes.',
      });
    } catch (e) {
      toast({
        title: 'Erro ao salvar',
        description: e.message || 'Verifique se a tabela public_config existe.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (path, value) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      const keys = path.split('.');
      let current = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
  };

  const toggleTrait = (trait) => {
    const traits = config.personality.traits || [];
    const newTraits = traits.includes(trait)
      ? traits.filter(t => t !== trait)
      : [...traits, trait];
    updateConfig('personality.traits', newTraits);
  };

  const toggleResponseFormat = (format) => {
    const formats = config.behavior.response_format || [];
    const newFormats = formats.includes(format)
      ? formats.filter(f => f !== format)
      : [...formats, format];
    updateConfig('behavior.response_format', newFormats);
  };

  const handleCustomRulesChange = (value) => {
    // Atualiza o estado local imediatamente para permitir digitação fluida
    setCustomRulesText(value);
  };

  const handleCustomRulesBlur = () => {
    // Ao sair do campo, processa e salva no config
    const lines = customRulesText.split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
    updateConfig('custom_rules', lines);
    // Atualiza o texto para remover linhas vazias
    setCustomRulesText(lines.join('\n'));
  };

  const handleApplyTemplate = (templateKey) => {
    const template = PERSONALITY_TEMPLATES[templateKey];
    if (!template) return;

    // Aplica a configuração do template
    setConfig(template.config);
    // Sincroniza o textarea de regras personalizadas
    setCustomRulesText(template.config.custom_rules.join('\n'));
    setSelectedTemplate(templateKey);
    
    toast({
      title: 'Template aplicado!',
      description: `Template "${template.name}" foi aplicado com sucesso. Revise as configurações e salve quando estiver pronto.`,
    });
  };

  // Função para construir a seção de personalidade (mesma lógica que será usada no chat)
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
      
      // Diretrizes de Respostas Progressivas (importantes)
      if (configData.response_guidelines.progressive_responses) {
        guidelines.push('RESPOSTAS PROGRESSIVAS: Sempre fazer perguntas antes de elaborar respostas muito longas');
        guidelines.push('RESPOSTAS PROGRESSIVAS: Quando o cliente pedir algo amplo, primeiro perguntar o que ele precisa especificamente');
      }
      if (configData.response_guidelines.concise_first) {
        guidelines.push('RESPOSTAS PROGRESSIVAS: Ser conciso inicialmente e expandir apenas se o cliente pedir mais informações');
      }
      if (configData.response_guidelines.interactive_dialogue) {
        guidelines.push('RESPOSTAS PROGRESSIVAS: Priorizar diálogo interativo ao invés de monólogos longos');
      }
      
      if (guidelines.length > 0) {
        section += '**Diretrizes de Resposta:**\n';
        section += guidelines.map(g => `- ${g}`).join('\n') + '\n\n';
      }
    }

    return section.trim();
  }, []);

  // Preview do prompt final (atualiza automaticamente quando config muda)
  const previewText = useMemo(() => {
    // Cria um config temporário com as regras do textarea para preview em tempo real
    const previewConfig = {
      ...config,
      custom_rules: customRulesText.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
    };
    
    const personalitySection = buildPersonalitySection(previewConfig);
    
    if (!personalitySection) {
      return 'Configure as opções acima para ver o preview do prompt.';
    }

    // Lista campos que estarão acessíveis
    const dataAccess = config.client_data_access || {};
    const hasAccess = (field) => dataAccess[field] !== false;
    const accessibleFields = [];
    
    CLIENT_DATA_FIELDS.forEach(category => {
      category.fields.forEach(field => {
        if (hasAccess(field.key)) {
          accessibleFields.push(field.label);
        }
      });
    });

    let preview = `**Modelo de IA:** ${config.ai_model || 'gpt-5.1'}\n\n**Personalidade e Comportamento:**

${personalitySection}

**Campos do Cliente que o ApexIA terá acesso:**
${accessibleFields.length > 0 ? accessibleFields.map(f => `- ${f}`).join('\n') : '- Nenhum campo selecionado (apenas campos obrigatórios)'}`;

    return preview;
  }, [config, customRulesText, buildPersonalitySection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Bot className="h-8 w-8" />
          Personalidade ApexIA Cliente
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Configure como o ApexIA se comporta no chat dos clientes. Essas configurações serão aplicadas a todos os clientes.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Essas configurações definem a personalidade e comportamento do ApexIA em todas as conversas com clientes. 
          As mudanças serão aplicadas imediatamente após salvar.
        </AlertDescription>
      </Alert>

      {/* Seção 0: Templates Pré-definidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Templates Pré-definidos
          </CardTitle>
          <CardDescription>
            Escolha um template para aplicar uma configuração completa rapidamente. Você pode personalizar depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Os templates aplicam configurações completas de personalidade, comportamento e acesso a dados. 
              Após aplicar um template, você pode personalizar qualquer configuração antes de salvar.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(PERSONALITY_TEMPLATES).map(([key, template]) => (
              <div
                key={key}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTemplate === key
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
                }`}
                onClick={() => handleApplyTemplate(key)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  {selectedTemplate === key && (
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="h-3 w-3" />
                  <span>Modelo: {template.config.ai_model}</span>
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <div className="mt-4 p-3 bg-primary/10 dark:bg-primary/20 rounded-lg">
              <p className="text-sm">
                <strong>Template selecionado:</strong> {PERSONALITY_TEMPLATES[selectedTemplate].name}
                <br />
                <span className="text-muted-foreground">
                  Revise as configurações abaixo e salve quando estiver pronto.
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 0.5: Modelo de IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Modelo de IA
          </CardTitle>
          <CardDescription>
            Selecione qual modelo de IA será usado pelo ApexIA nas conversas com os clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Selecione o modelo de IA que será usado em todas as conversas do ApexIA com os clientes. 
              O modelo escolhido afeta a qualidade das respostas, velocidade e custo. 
              GPT-5.1 é o mais inteligente, enquanto GPT-4o Mini é mais rápido e econômico.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="ai-model">Modelo de IA</Label>
            <Select
              value={config.ai_model || 'gpt-5.1'}
              onValueChange={(value) => updateConfig('ai_model', value)}
            >
              <SelectTrigger id="ai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(model => (
                  <SelectItem key={model.value} value={model.value}>
                    <div className="flex flex-col">
                      <span>{model.label}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.ai_model && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Modelo selecionado: <strong>{AI_MODELS.find(m => m.value === config.ai_model)?.label || config.ai_model}</strong>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seção 1: Personalidade Base */}
      <Card>
        <CardHeader>
          <CardTitle>Personalidade Base</CardTitle>
          <CardDescription>
            Defina os traços de personalidade e tom de voz do ApexIA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Traços de Personalidade</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PERSONALITY_TRAITS.map(trait => (
                <div key={trait} className="flex items-center space-x-2">
                  <Checkbox
                    id={`trait-${trait}`}
                    checked={config.personality?.traits?.includes(trait) || false}
                    onCheckedChange={() => toggleTrait(trait)}
                  />
                  <Label
                    htmlFor={`trait-${trait}`}
                    className="text-sm font-normal cursor-pointer capitalize"
                  >
                    {trait}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone-description">Tom de Voz</Label>
            <Textarea
              id="tone-description"
              value={config.personality?.tone_description || ''}
              onChange={(e) => updateConfig('personality.tone_description', e.target.value)}
              placeholder="Ex: Amigável mas profissional, como um consultor experiente que se importa com o sucesso do cliente"
              rows={3}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Descreva como o ApexIA deve se comunicar com os clientes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formality">Nível de Formalidade</Label>
            <Select
              value={config.personality?.formality || 'profissional'}
              onValueChange={(value) => updateConfig('personality.formality', value)}
            >
              <SelectTrigger id="formality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Seção 2: Comportamento */}
      <Card>
        <CardHeader>
          <CardTitle>Comportamento</CardTitle>
          <CardDescription>
            Configure como o ApexIA se comporta durante as conversas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Proatividade: {config.behavior?.proactivity || 75}%</Label>
            <Slider
              value={[config.behavior?.proactivity || 75]}
              onValueChange={([value]) => updateConfig('behavior.proactivity', value)}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Quão proativo o ApexIA deve ser em sugerir ações e oferecer ajuda.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emoji-usage">Uso de Emojis</Label>
            <Select
              value={config.behavior?.emoji_usage || 'moderate'}
              onValueChange={(value) => updateConfig('behavior.emoji_usage', value)}
            >
              <SelectTrigger id="emoji-usage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                <SelectItem value="moderate">Moderado (1-2 por resposta)</SelectItem>
                <SelectItem value="frequent">Frequente (quando apropriado)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Formato de Resposta</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: 'lists', label: 'Listas numeradas' },
                { value: 'paragraphs', label: 'Parágrafos' },
                { value: 'examples', label: 'Exemplos práticos' },
                { value: 'highlights', label: 'Destaques/bold' }
              ].map(format => (
                <div key={format.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`format-${format.value}`}
                    checked={config.behavior?.response_format?.includes(format.value) || false}
                    onCheckedChange={() => toggleResponseFormat(format.value)}
                  />
                  <Label
                    htmlFor={`format-${format.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {format.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção 3: Regras e Diretrizes */}
      <Card>
        <CardHeader>
          <CardTitle>Regras e Diretrizes</CardTitle>
          <CardDescription>
            Defina regras personalizadas e diretrizes para as respostas do ApexIA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-rules">Regras Personalizadas</Label>
            <Textarea
              id="custom-rules"
              value={customRulesText}
              onChange={(e) => handleCustomRulesChange(e.target.value)}
              onBlur={handleCustomRulesBlur}
              placeholder="Digite uma regra por linha. Exemplo:&#10;- Sempre ser respeitoso e paciente&#10;- Oferecer ajuda proativa quando relevante"
              rows={6}
              className="resize-y"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Uma regra por linha. Use marcadores (-) para melhor formatação.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Diretrizes de Resposta</Label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'use_lists', label: 'Usar listas quando apropriado' },
                { key: 'use_examples', label: 'Incluir exemplos práticos' },
                { key: 'use_markdown', label: 'Usar formatação markdown' },
                { key: 'section_separation', label: 'Separar informações em seções claras' },
                { key: 'progressive_responses', label: 'Respostas progressivas (perguntar antes de elaborar muito)', important: true },
                { key: 'concise_first', label: 'Ser conciso primeiro, expandir depois', important: true },
                { key: 'interactive_dialogue', label: 'Priorizar diálogo interativo', important: true }
              ].map(guideline => (
                <div key={guideline.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`guideline-${guideline.key}`}
                    checked={config.response_guidelines?.[guideline.key] || false}
                    onCheckedChange={(checked) => updateConfig(`response_guidelines.${guideline.key}`, checked)}
                  />
                  <Label
                    htmlFor={`guideline-${guideline.key}`}
                    className={`text-sm font-normal cursor-pointer ${guideline.important ? 'font-semibold text-primary' : ''}`}
                  >
                    {guideline.label}
                    {guideline.important && <span className="text-xs text-muted-foreground ml-1">(importante)</span>}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção 4: Acesso a Dados do Cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Acesso a Dados do Cliente</CardTitle>
          <CardDescription>
            Selecione quais informações do cliente o ApexIA terá acesso durante as conversas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Marque os campos que o ApexIA poderá acessar e usar para responder perguntas dos clientes. 
              Campos marcados como obrigatórios não podem ser desmarcados.
            </AlertDescription>
          </Alert>

          {CLIENT_DATA_FIELDS.map((category, categoryIndex) => (
            <div key={categoryIndex} className="space-y-3">
              <Label className="text-base font-semibold">{category.category}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4">
                {category.fields.map(field => {
                  const isChecked = config.client_data_access?.[field.key] !== false;
                  const isRequired = field.required;
                  
                  return (
                    <div key={field.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`client-field-${field.key}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (!isRequired) {
                            updateConfig(`client_data_access.${field.key}`, checked);
                          }
                        }}
                        disabled={isRequired}
                      />
                      <Label
                        htmlFor={`client-field-${field.key}`}
                        className={`text-sm font-normal cursor-pointer ${isRequired ? 'text-gray-500' : ''}`}
                      >
                        {field.label}
                        {isRequired && <span className="text-xs text-gray-400 ml-1">(obrigatório)</span>}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allFields = {};
                    CLIENT_DATA_FIELDS.forEach(category => {
                      category.fields.forEach(field => {
                        allFields[field.key] = !field.required ? true : config.client_data_access?.[field.key] !== false;
                      });
                    });
                    setConfig(prev => ({
                      ...prev,
                      client_data_access: {
                        ...prev.client_data_access,
                        ...allFields
                      }
                    }));
                  }}
                >
                  Selecionar Todos
                </Button>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const onlyRequired = {};
                    CLIENT_DATA_FIELDS.forEach(category => {
                      category.fields.forEach(field => {
                        if (field.required) {
                          onlyRequired[field.key] = true;
                        } else {
                          onlyRequired[field.key] = false;
                        }
                      });
                    });
                    setConfig(prev => ({
                      ...prev,
                      client_data_access: {
                        ...prev.client_data_access,
                        ...onlyRequired
                      }
                    }));
                  }}
                >
                  Apenas Obrigatórios
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção 5: Preview do Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview do Prompt Final
          </CardTitle>
          <CardDescription>
            Visualize como a seção de personalidade ficará no prompt enviado para a IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Como o prompt ficará:</Label>
            <ScrollArea className="h-[300px] w-full rounded-md border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                {previewText}
              </pre>
            </ScrollArea>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Este preview mostra apenas a seção de personalidade. O prompt completo incluirá também o prompt base do agente, informações do cliente e contexto adicional.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ApexIAClientPersonalitySettings;

