import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Search, Bot, Settings, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchOpenRouterModels, organizeModelsByProvider, getPriceIndicator, formatPrice, translateDescription } from '@/lib/openrouterModels';

// Modelos OpenAI padrão (mesma lista de ApexIAClientPersonalitySettings)
const AI_MODELS = [
  { value: 'gpt-5.1', label: 'GPT-5.1 (NOVO - Melhor para código e tarefas agentic)', description: 'O melhor modelo para programação e tarefas agentic com esforço de raciocínio configurável' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini (Mais rápido e econômico)', description: 'Versão mais rápida e econômica do GPT-5 para tarefas bem definidas' },
  { value: 'gpt-5-nano', label: 'GPT-5 nano (Mais rápido e econômico)', description: 'Versão mais rápida e econômica do GPT-5' },
  { value: 'o3', label: 'O3 (Mais recente - Raciocínio avançado)', description: 'Modelo mais recente com raciocínio lógico passo a passo aprimorado' },
  { value: 'o3-mini', label: 'O3 Mini (Raciocínio rápido)', description: 'Versão mais rápida do O3, com raciocínio profundo' },
  { value: 'o1-preview', label: 'O1 Preview (Raciocínio profundo)', description: 'Modelo avançado com raciocínio profundo, ideal para tarefas complexas' },
  { value: 'o1-mini', label: 'O1 Mini (Raciocínio rápido)', description: 'Versão mais rápida do O1, com raciocínio profundo' },
  { value: 'gpt-4o', label: 'GPT-4o (Recomendado - Mais inteligente)', description: 'Modelo mais recente e poderoso da OpenAI, multimodal' },
  { value: 'gpt-4o-2024-08-06', label: 'GPT-4o (2024-08-06)', description: 'Versão específica do GPT-4o de agosto 2024' },
  { value: 'gpt-4o-2024-05-13', label: 'GPT-4o (2024-05-13)', description: 'Versão específica do GPT-4o de maio 2024' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido e econômico)', description: 'Versão mais rápida e barata, ainda muito capaz' },
  { value: 'gpt-4o-mini-2024-07-18', label: 'GPT-4o Mini (2024-07-18)', description: 'Versão específica do GPT-4o Mini de julho 2024' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Versão turbo do GPT-4' },
  { value: 'gpt-4-turbo-2024-04-09', label: 'GPT-4 Turbo (2024-04-09)', description: 'Versão específica do GPT-4 Turbo de abril 2024' },
  { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview', description: 'Versão preview do GPT-4 Turbo' },
  { value: 'gpt-4', label: 'GPT-4', description: 'Modelo GPT-4 padrão' },
  { value: 'gpt-4-0613', label: 'GPT-4 (2023-06-13)', description: 'Versão específica do GPT-4 de junho 2023' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Mais econômico)', description: 'Modelo mais rápido e econômico, boa qualidade' },
  { value: 'gpt-3.5-turbo-0125', label: 'GPT-3.5 Turbo (2024-01-25)', description: 'Versão específica do GPT-3.5 Turbo de janeiro 2024' }
];

const ClientApexIASettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [configs, setConfigs] = useState({}); // cliente_id -> config
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini'); // Modelo padrão global
  const [loadingDefaultModel, setLoadingDefaultModel] = useState(false);
  
  // Estados para modelos OpenRouter
  const [openRouterModels, setOpenRouterModels] = useState([]);
  const [organizedOpenRouterModels, setOrganizedOpenRouterModels] = useState({});
  const [loadingOpenRouterModels, setLoadingOpenRouterModels] = useState(false);
  const [showOpenRouterModels, setShowOpenRouterModels] = useState(false);
  const [openRouterSearchTerm, setOpenRouterSearchTerm] = useState('');
  const [openRouterCategoryFilter, setOpenRouterCategoryFilter] = useState('all');
  const [expandedOpenRouterCategories, setExpandedOpenRouterCategories] = useState({});
  const [showOpenRouterInDefault, setShowOpenRouterInDefault] = useState(false); // Para o seletor de modelo padrão

  // Buscar modelo padrão global
  const fetchDefaultModel = useCallback(async () => {
    setLoadingDefaultModel(true);
    try {
      const { data, error } = await supabase
        .from('public_config')
        .select('value')
        .eq('key', 'apexia_default_model')
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        setDefaultModel(data.value);
      }
    } catch (error) {
      console.error('Erro ao buscar modelo padrão:', error);
    } finally {
      setLoadingDefaultModel(false);
    }
  }, []);

  // Salvar modelo padrão global
  const handleSaveDefaultModel = useCallback(async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({
          key: 'apexia_default_model',
          value: defaultModel,
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      toast({
        title: 'Modelo padrão salvo!',
        description: 'O modelo padrão foi atualizado para todos os clientes.',
      });
    } catch (error) {
      console.error('Erro ao salvar modelo padrão:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [defaultModel, toast]);

  // Buscar clientes e configurações
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Buscar clientes
      const { data: clientsData, error: clientsError } = await supabase
        .from('clientes')
        .select('id, empresa')
        .order('empresa', { ascending: true });

      if (clientsError) throw clientsError;

      // Buscar configurações
      const { data: configsData, error: configsError } = await supabase
        .from('cliente_apexia_config')
        .select('*');

      if (configsError) throw configsError;

      // Criar mapa de configurações por cliente_id
      const configsMap = {};
      (configsData || []).forEach(config => {
        configsMap[config.cliente_id] = config;
      });

      setClients(clientsData || []);
      setConfigs(configsMap);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast({
        title: 'Erro ao buscar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDefaultModel();
    fetchData();
  }, [fetchDefaultModel, fetchData]);

  // Carregar modelos do OpenRouter
  const loadOpenRouterModels = useCallback(async () => {
    setLoadingOpenRouterModels(true);
    try {
      const models = await fetchOpenRouterModels();
      setOpenRouterModels(models);
      const organized = organizeModelsByProvider(models);
      setOrganizedOpenRouterModels(organized);
      
      setExpandedOpenRouterCategories({
        openai: true,
        anthropic: true,
        google: true,
        meta: true,
        mistral: false,
        deepseek: false,
        grok: false,
        cohere: false,
        perplexity: false,
        qwen: false,
        other: false,
      });
    } catch (error) {
      console.error('Erro ao carregar modelos do OpenRouter:', error);
      toast({
        title: 'Erro ao carregar modelos',
        description: 'Não foi possível buscar modelos do OpenRouter.',
        variant: 'destructive',
      });
    } finally {
      setLoadingOpenRouterModels(false);
    }
  }, [toast]);

  // Filtrar clientes
  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => (c.empresa || '').toLowerCase().includes(term));
  }, [clients, searchTerm]);

  // Obter configuração de um cliente
  const getClientConfig = (clientId) => {
    const config = configs[clientId] || {
      cliente_id: clientId,
      has_traffic_access: false,
      allowed_ai_models: [],
    };
    
    // Garantir que o modelo padrão sempre esteja na lista (se não estiver)
    if (defaultModel && !config.allowed_ai_models.includes(defaultModel)) {
      config.allowed_ai_models = [defaultModel, ...config.allowed_ai_models];
    }
    
    return config;
  };

  // Abrir dialog de modelos
  const handleOpenModelDialog = (client) => {
    setSelectedClient(client);
    setShowModelDialog(true);
    if (openRouterModels.length === 0) {
      loadOpenRouterModels();
    }
  };

  // Salvar configuração de um cliente
  const handleSaveConfig = useCallback(async (clientId) => {
    setSaving(true);
    try {
      const config = getClientConfig(clientId);
      
      // Garantir que o modelo padrão sempre esteja na lista
      let modelsToSave = [...(config.allowed_ai_models || [])];
      if (defaultModel && !modelsToSave.includes(defaultModel)) {
        modelsToSave = [defaultModel, ...modelsToSave];
      }
      
      const { error } = await supabase
        .from('cliente_apexia_config')
        .upsert({
          cliente_id: clientId,
          has_traffic_access: config.has_traffic_access,
          allowed_ai_models: modelsToSave,
        }, {
          onConflict: 'cliente_id',
        });

      if (error) throw error;

      toast({
        title: 'Configuração salva!',
        description: 'As configurações do cliente foram salvas com sucesso.',
      });

      // Recarregar dados
      await fetchData();
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [configs, defaultModel, toast, fetchData]);

  // Salvar todas as configurações
  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const configsToSave = clients.map(client => {
        const config = getClientConfig(client.id);
        // Garantir que o modelo padrão sempre esteja na lista
        let modelsToSave = [...(config.allowed_ai_models || [])];
        if (defaultModel && !modelsToSave.includes(defaultModel)) {
          modelsToSave = [defaultModel, ...modelsToSave];
        }
        
        return {
          cliente_id: client.id,
          has_traffic_access: config.has_traffic_access,
          allowed_ai_models: modelsToSave,
        };
      });

      // Usar upsert em lote
      const { error } = await supabase
        .from('cliente_apexia_config')
        .upsert(configsToSave, {
          onConflict: 'cliente_id',
        });

      if (error) throw error;

      toast({
        title: 'Todas as configurações salvas!',
        description: `${configsToSave.length} configurações foram salvas com sucesso.`,
      });

      // Recarregar dados
      await fetchData();
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [clients, configs, toast, fetchData]);

  // Toggle acesso ao tráfego
  const toggleTrafficAccess = (clientId) => {
    setConfigs(prev => {
      const config = getClientConfig(clientId);
      return {
        ...prev,
        [clientId]: {
          ...config,
          has_traffic_access: !config.has_traffic_access,
        },
      };
    });
  };

  // Toggle modelo selecionado
  const toggleModel = (modelId) => {
    if (!selectedClient) return;
    const config = getClientConfig(selectedClient.id);
    const currentModels = config.allowed_ai_models || [];
    
    // Não permitir remover o modelo padrão
    if (modelId === defaultModel && currentModels.includes(modelId)) {
      toast({
        title: 'Modelo padrão',
        description: 'O modelo padrão não pode ser removido. Ele é aplicado a todos os clientes.',
        variant: 'default',
      });
      return;
    }
    
    const newModels = currentModels.includes(modelId)
      ? currentModels.filter(m => m !== modelId)
      : [...currentModels, modelId];
    
    setConfigs(prev => ({
      ...prev,
      [selectedClient.id]: {
        ...config,
        allowed_ai_models: newModels,
      },
    }));
  };

  // Obter todos os modelos disponíveis (OpenAI + OpenRouter)
  const getAllAvailableModels = () => {
    const openAIModels = AI_MODELS.map(m => ({
      id: m.value,
      name: m.label,
      description: m.description,
      provider: 'openai',
    }));
    
    return [...openAIModels, ...openRouterModels];
  };

  const selectedClientConfig = selectedClient ? getClientConfig(selectedClient.id) : null;
  const allModels = getAllAvailableModels();

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Config. ApexIA Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure acesso ao assistente de tráfego e modelos de IA permitidos para cada cliente.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full md:w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente por nome..."
              className="pl-9"
            />
          </div>
          <Button onClick={handleSaveAll} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Todos
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Card de Modelo Padrão Global */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Modelo Padrão (Global)
          </CardTitle>
          <CardDescription>
            Este modelo será aplicado automaticamente a todos os clientes. Você pode adicionar modelos adicionais para cada cliente individualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs para escolher entre OpenAI e OpenRouter */}
          <div className="flex gap-2 border-b">
            <Button
              variant={!showOpenRouterInDefault ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setShowOpenRouterInDefault(false);
              }}
              className="rounded-b-none"
            >
              Modelos OpenAI
            </Button>
            <Button
              variant={showOpenRouterInDefault ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setShowOpenRouterInDefault(true);
                if (openRouterModels.length === 0) {
                  loadOpenRouterModels();
                }
              }}
              className="rounded-b-none"
            >
              Modelos OpenRouter
            </Button>
          </div>

          {!showOpenRouterInDefault ? (
            // Modelos OpenAI
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="default-model">Modelo Padrão (OpenAI)</Label>
                <Select
                  value={defaultModel}
                  onValueChange={setDefaultModel}
                  disabled={loadingDefaultModel || saving}
                >
                  <SelectTrigger id="default-model" className="w-full">
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
              </div>
              <div className="pt-6">
                <Button onClick={handleSaveDefaultModel} disabled={saving || loadingDefaultModel}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Padrão
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            // Modelos OpenRouter
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Modelo Padrão (OpenRouter)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadOpenRouterModels}
                  disabled={loadingOpenRouterModels}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingOpenRouterModels ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>

              {/* Filtros */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-2 block">Filtrar por Empresa</Label>
                  <select
                    value={openRouterCategoryFilter}
                    onChange={(e) => setOpenRouterCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="all">Todas as Empresas</option>
                    {Object.keys(organizedOpenRouterModels).map((category) => (
                      <option key={category} value={category}>
                        {category === 'openai' ? 'OpenAI' :
                         category === 'anthropic' ? 'Anthropic (Claude)' :
                         category === 'google' ? 'Google (Gemini)' :
                         category === 'meta' ? 'Meta (Llama)' :
                         category === 'mistral' ? 'Mistral AI' :
                         category === 'deepseek' ? 'DeepSeek' :
                         category === 'grok' ? 'Grok (xAI)' :
                         category === 'cohere' ? 'Cohere' :
                         category === 'perplexity' ? 'Perplexity' :
                         category === 'qwen' ? 'Qwen (Alibaba)' :
                         'Outros'} ({organizedOpenRouterModels[category]?.length || 0})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 relative">
                  <Label className="text-xs text-muted-foreground mb-2 block">Buscar Modelos</Label>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, ID ou descrição..."
                    value={openRouterSearchTerm}
                    onChange={(e) => setOpenRouterSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Lista de modelos OpenRouter */}
              {loadingOpenRouterModels ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-3 text-muted-foreground">Carregando modelos do OpenRouter...</span>
                </div>
              ) : (
                <ScrollArea className="h-[300px] border rounded-lg p-4">
                  <div className="space-y-4">
                    {Object.entries(organizedOpenRouterModels)
                      .filter(([category]) => {
                        if (openRouterCategoryFilter === 'all') return true;
                        return category === openRouterCategoryFilter;
                      })
                      .map(([category, models]) => {
                        const filteredModels = openRouterSearchTerm
                          ? models.filter(model => 
                              model.id.toLowerCase().includes(openRouterSearchTerm.toLowerCase()) ||
                              (model.name && model.name.toLowerCase().includes(openRouterSearchTerm.toLowerCase())) ||
                              (model.description && model.description.toLowerCase().includes(openRouterSearchTerm.toLowerCase()))
                            )
                          : models;
                        
                        if (filteredModels.length === 0) return null;
                        
                        const isExpanded = expandedOpenRouterCategories[category] !== false;
                        
                        return (
                          <div key={category} className="space-y-2">
                            <div className="flex items-center justify-between border-b pb-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedOpenRouterCategories(prev => ({ ...prev, [category]: !isExpanded }))}
                                  className="h-6 w-6 p-0"
                                >
                                  {isExpanded ? '▼' : '▶'}
                                </Button>
                                <h3 className="font-semibold text-sm">
                                  {category === 'openai' ? 'OpenAI' :
                                   category === 'anthropic' ? 'Anthropic (Claude)' :
                                   category === 'google' ? 'Google (Gemini)' :
                                   category === 'meta' ? 'Meta (Llama)' :
                                   category === 'mistral' ? 'Mistral AI' :
                                   category === 'deepseek' ? 'DeepSeek' :
                                   category === 'grok' ? 'Grok (xAI)' :
                                   category === 'cohere' ? 'Cohere' :
                                   category === 'perplexity' ? 'Perplexity' :
                                   category === 'qwen' ? 'Qwen (Alibaba)' :
                                   'Outros'}
                                </h3>
                                <Badge variant="outline" className="text-xs">
                                  {filteredModels.length}
                                </Badge>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="space-y-2">
                                {filteredModels.map((model) => {
                                  const isSelected = defaultModel === model.id;
                                  const priceIndicator = getPriceIndicator(model.pricing);
                                  const priceFormatted = formatPrice(model.pricing);
                                  const descriptionPT = translateDescription(model.id, model.description);
                                  
                                  return (
                                    <div
                                      key={model.id}
                                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                                        isSelected
                                          ? 'border-primary bg-primary/10'
                                          : 'hover:bg-muted/50'
                                      }`}
                                      onClick={() => setDefaultModel(model.id)}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                              isSelected 
                                                ? 'border-primary bg-primary' 
                                                : 'border-gray-300 dark:border-gray-600'
                                            }`}>
                                              {isSelected && (
                                                <div className="h-2 w-2 rounded-full bg-white"></div>
                                              )}
                                            </div>
                                            <h4 className="font-semibold text-sm truncate">{model.name || model.id.split('/').pop()}</h4>
                                            <Badge variant="outline" className="text-xs flex-shrink-0">
                                              {priceIndicator}
                                            </Badge>
                                          </div>
                                          {descriptionPT && (
                                            <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                                              {descriptionPT}
                                            </p>
                                          )}
                                          <p className="text-xs font-semibold text-primary mb-1">{priceFormatted}</p>
                                          <p className="text-xs font-mono text-muted-foreground truncate" title={model.id}>
                                            {model.id}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </ScrollArea>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveDefaultModel} disabled={saving || loadingOpenRouterModels}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Padrão
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            O modelo padrão será automaticamente incluído na lista de modelos permitidos de todos os clientes.
          </p>
        </CardContent>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-center">Acesso Tráfego</TableHead>
              <TableHead>Modelos IA</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Carregando clientes...
                </TableCell>
              </TableRow>
            ) : filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => {
                const config = getClientConfig(client.id);
                // Contar modelos incluindo o padrão
                const modelsList = config.allowed_ai_models || [];
                const modelsCount = modelsList.length;
                
                return (
                  <TableRow key={client.id} className="dark:border-gray-700">
                    <TableCell className="font-medium dark:text-white">
                      {client.empresa}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={config.has_traffic_access || false}
                          onCheckedChange={() => toggleTrafficAccess(client.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {modelsCount} modelo{modelsCount !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenModelDialog(client)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Editar Modelos
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveConfig(client.id)}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog de seleção de modelos */}
      <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Modelos de IA - {selectedClient?.empresa}
            </DialogTitle>
            <DialogDescription>
              Selecione os modelos de IA permitidos para este cliente. O modelo padrão ({defaultModel}) está sempre incluído e não pode ser removido.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Tabs para escolher entre OpenAI e OpenRouter */}
            <div className="flex gap-2 border-b">
              <Button
                variant={!showOpenRouterModels ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowOpenRouterModels(false)}
                className="rounded-b-none"
              >
                Modelos OpenAI
              </Button>
              <Button
                variant={showOpenRouterModels ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setShowOpenRouterModels(true);
                  if (openRouterModels.length === 0) {
                    loadOpenRouterModels();
                  }
                }}
                className="rounded-b-none"
              >
                Modelos OpenRouter
              </Button>
            </div>

            <ScrollArea className="h-[400px] border rounded-lg p-4">
              {!showOpenRouterModels ? (
                // Modelos OpenAI
                <div className="space-y-2">
                  {AI_MODELS.map((model) => {
                    const isDefault = model.value === defaultModel;
                    const isSelected = selectedClientConfig?.allowed_ai_models?.includes(model.value) || isDefault;
                    const isDisabled = isDefault; // Modelo padrão não pode ser desmarcado
                    
                    return (
                      <div
                        key={model.value}
                        className={`p-3 border rounded-lg transition-all ${
                          isDisabled 
                            ? 'opacity-75 cursor-not-allowed bg-muted/30'
                            : 'cursor-pointer hover:bg-muted/50'
                        } ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : ''
                        }`}
                        onClick={() => !isDisabled && toggleModel(model.value)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected 
                              ? 'border-primary bg-primary' 
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && (
                              <div className="h-2 w-2 rounded-full bg-white"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{model.label}</h4>
                              {isDefault && (
                                <Badge variant="default" className="text-xs">
                                  Padrão
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
                            {isDefault && (
                              <p className="text-xs text-primary mt-1 font-medium">
                                Este modelo é aplicado automaticamente a todos os clientes
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Modelos OpenRouter
                <div className="space-y-4">
                  {/* Filtros */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-2 block">Filtrar por Empresa</Label>
                      <select
                        value={openRouterCategoryFilter}
                        onChange={(e) => setOpenRouterCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="all">Todas as Empresas</option>
                        {Object.keys(organizedOpenRouterModels).map((category) => (
                          <option key={category} value={category}>
                            {category === 'openai' ? 'OpenAI' :
                             category === 'anthropic' ? 'Anthropic (Claude)' :
                             category === 'google' ? 'Google (Gemini)' :
                             category === 'meta' ? 'Meta (Llama)' :
                             category === 'mistral' ? 'Mistral AI' :
                             category === 'deepseek' ? 'DeepSeek' :
                             category === 'grok' ? 'Grok (xAI)' :
                             category === 'cohere' ? 'Cohere' :
                             category === 'perplexity' ? 'Perplexity' :
                             category === 'qwen' ? 'Qwen (Alibaba)' :
                             'Outros'} ({organizedOpenRouterModels[category]?.length || 0})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 relative">
                      <Label className="text-xs text-muted-foreground mb-2 block">Buscar Modelos</Label>
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome, ID ou descrição..."
                        value={openRouterSearchTerm}
                        onChange={(e) => setOpenRouterSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Lista de modelos OpenRouter */}
                  {loadingOpenRouterModels ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="ml-3 text-muted-foreground">Carregando modelos do OpenRouter...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(organizedOpenRouterModels)
                        .filter(([category]) => {
                          if (openRouterCategoryFilter === 'all') return true;
                          return category === openRouterCategoryFilter;
                        })
                        .map(([category, models]) => {
                          const filteredModels = openRouterSearchTerm
                            ? models.filter(model => 
                                model.id.toLowerCase().includes(openRouterSearchTerm.toLowerCase()) ||
                                (model.name && model.name.toLowerCase().includes(openRouterSearchTerm.toLowerCase())) ||
                                (model.description && model.description.toLowerCase().includes(openRouterSearchTerm.toLowerCase()))
                              )
                            : models;
                          
                          if (filteredModels.length === 0) return null;
                          
                          const isExpanded = expandedOpenRouterCategories[category] !== false;
                          
                          return (
                            <div key={category} className="space-y-2">
                              <div className="flex items-center justify-between border-b pb-2">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedOpenRouterCategories(prev => ({ ...prev, [category]: !isExpanded }))}
                                    className="h-6 w-6 p-0"
                                  >
                                    {isExpanded ? '▼' : '▶'}
                                  </Button>
                                  <h3 className="font-semibold text-sm">
                                    {category === 'openai' ? 'OpenAI' :
                                     category === 'anthropic' ? 'Anthropic (Claude)' :
                                     category === 'google' ? 'Google (Gemini)' :
                                     category === 'meta' ? 'Meta (Llama)' :
                                     category === 'mistral' ? 'Mistral AI' :
                                     category === 'deepseek' ? 'DeepSeek' :
                                     category === 'grok' ? 'Grok (xAI)' :
                                     category === 'cohere' ? 'Cohere' :
                                     category === 'perplexity' ? 'Perplexity' :
                                     category === 'qwen' ? 'Qwen (Alibaba)' :
                                     'Outros'}
                                  </h3>
                                  <Badge variant="outline" className="text-xs">
                                    {filteredModels.length}
                                  </Badge>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="space-y-2">
                                  {filteredModels.map((model) => {
                                    const isDefault = model.id === defaultModel;
                                    const isSelected = selectedClientConfig?.allowed_ai_models?.includes(model.id) || isDefault;
                                    const isDisabled = isDefault; // Modelo padrão não pode ser desmarcado
                                    const priceIndicator = getPriceIndicator(model.pricing);
                                    const priceFormatted = formatPrice(model.pricing);
                                    const descriptionPT = translateDescription(model.id, model.description);
                                    
                                    return (
                                      <div
                                        key={model.id}
                                        className={`p-3 border rounded-lg transition-all ${
                                          isDisabled 
                                            ? 'opacity-75 cursor-not-allowed bg-muted/30'
                                            : 'cursor-pointer hover:bg-muted/50'
                                        } ${
                                          isSelected
                                            ? 'border-primary bg-primary/10'
                                            : ''
                                        }`}
                                        onClick={() => !isDisabled && toggleModel(model.id)}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                                isSelected 
                                                  ? 'border-primary bg-primary' 
                                                  : 'border-gray-300 dark:border-gray-600'
                                              }`}>
                                                {isSelected && (
                                                  <div className="h-2 w-2 rounded-full bg-white"></div>
                                                )}
                                              </div>
                                              <h4 className="font-semibold text-sm truncate">{model.name || model.id.split('/').pop()}</h4>
                                              {isDefault && (
                                                <Badge variant="default" className="text-xs flex-shrink-0">
                                                  Padrão
                                                </Badge>
                                              )}
                                              <Badge variant="outline" className="text-xs flex-shrink-0">
                                                {priceIndicator}
                                              </Badge>
                                            </div>
                                            {isDefault && (
                                              <p className="text-xs text-primary mt-1 font-medium">
                                                Modelo padrão aplicado a todos os clientes
                                              </p>
                                            )}
                                            {descriptionPT && (
                                              <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                                                {descriptionPT}
                                              </p>
                                            )}
                                            <p className="text-xs font-semibold text-primary mb-1">{priceFormatted}</p>
                                            <p className="text-xs font-mono text-muted-foreground truncate" title={model.id}>
                                              {model.id}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {selectedClientConfig?.allowed_ai_models?.length || 0} modelo(s) selecionado(s)
                {defaultModel && (
                  <span className="ml-2 text-primary">(incluindo padrão: {defaultModel.split('/').pop() || defaultModel})</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowModelDialog(false)}>
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    if (selectedClient) {
                      handleSaveConfig(selectedClient.id);
                      setShowModelDialog(false);
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientApexIASettings;
