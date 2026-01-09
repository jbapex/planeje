import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save, Sparkles, Info, ExternalLink, Search, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearModelCache } from '@/lib/assistantProjectConfig';
import { fetchOpenRouterModels, organizeModelsByProvider, getPriceIndicator, formatPrice, translateDescription } from '@/lib/openrouterModels';

const CONFIG_KEY = 'assistant_project_model_config';

const AssistantProjectModelSettings = () => {
  const { toast } = useToast();
  const [selectedModels, setSelectedModels] = useState(['openai/gpt-4o']);
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allModels, setAllModels] = useState([]);
  const [organizedModels, setOrganizedModels] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // Buscar modelos do OpenRouter
  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const models = await fetchOpenRouterModels();
      setAllModels(models);
      const organized = organizeModelsByProvider(models);
      setOrganizedModels(organized);
      
      // Expandir categorias principais por padrão
      setExpandedCategories({
        openai: true,
        anthropic: true,
        google: true,
        meta: true,
        mistral: true,
        deepseek: false,
        grok: false,
        cohere: false,
        perplexity: false,
        qwen: false,
        other: false,
      });
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
      toast({
        title: 'Erro ao carregar modelos',
        description: 'Não foi possível buscar modelos do OpenRouter. Usando lista padrão.',
        variant: 'destructive',
      });
    } finally {
      setLoadingModels(false);
    }
  }, [toast]);

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
        const config = JSON.parse(data.value);
        // Suporta formato antigo (model) e novo (models)
        if (config.models && Array.isArray(config.models)) {
          setSelectedModels(config.models);
        } else if (config.model) {
          // Migração: converter formato antigo para novo
          setSelectedModels([config.model]);
        } else {
          setSelectedModels(['openai/gpt-4o']);
        }
      } else {
        // Valor padrão
        setSelectedModels(['openai/gpt-4o']);
      }
    } catch (e) {
      console.warn('Configuração não carregada:', e?.message || e);
      toast({
        title: 'Aviso',
        description: 'Não foi possível carregar a configuração. Usando modelo padrão.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadModels();
    loadConfig();
  }, [loadModels, loadConfig]);

  const handleToggleModel = (modelId) => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) {
        // Remove se já está selecionado (mas mantém pelo menos um)
        if (prev.length > 1) {
          return prev.filter(id => id !== modelId);
        }
        return prev;
      } else {
        // Adiciona se não está selecionado
        return [...prev, modelId];
      }
    });
  };

  const handleSelectAll = (category) => {
    const categoryModels = organizedModels[category]?.map(m => m.id) || [];
    const allSelected = categoryModels.every(id => selectedModels.includes(id));
    
    if (allSelected) {
      // Desmarcar todos da categoria (mas manter pelo menos um modelo)
      const remaining = selectedModels.filter(id => !categoryModels.includes(id));
      if (remaining.length === 0) {
        // Se não sobrar nenhum, manter o primeiro da categoria
        setSelectedModels([categoryModels[0]]);
      } else {
        setSelectedModels(remaining);
      }
    } else {
      // Marcar todos da categoria
      const newModels = [...new Set([...selectedModels, ...categoryModels])];
      setSelectedModels(newModels);
    }
  };

  const handleSave = async () => {
    if (selectedModels.length === 0) {
      toast({
        title: 'Erro',
        description: 'Selecione pelo menos um modelo.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({
          key: CONFIG_KEY,
          value: JSON.stringify({ 
            models: selectedModels,
            defaultModel: selectedModels[0] // Primeiro como padrão
          }),
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      // Limpar cache para forçar atualização
      clearModelCache();

      toast({
        title: 'Modelos salvos!',
        description: `${selectedModels.length} modelo(s) disponível(is) para os usuários escolherem no chat.`,
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

  const getModelInfo = (modelId) => {
    const model = allModels.find(m => m.id === modelId);
    if (model) {
      return {
        name: model.name || modelId.split('/').pop(),
        description: translateDescription(modelId, model.description),
        price: getPriceIndicator(model.pricing),
        priceFormatted: formatPrice(model.pricing),
      };
    }
    return { 
      name: modelId.split('/').pop(), 
      description: 'Modelo personalizado', 
      price: '?',
      priceFormatted: 'Preço não disponível'
    };
  };

  // Filtrar modelos por termo de busca
  const filterModels = (models) => {
    if (!searchTerm) return models;
    const term = searchTerm.toLowerCase();
    return models.filter(model => 
      model.id.toLowerCase().includes(term) ||
      (model.name && model.name.toLowerCase().includes(term)) ||
      (model.description && model.description.toLowerCase().includes(term))
    );
  };

  const getCategoryName = (category) => {
    const names = {
      openai: 'OpenAI',
      anthropic: 'Anthropic (Claude)',
      google: 'Google (Gemini)',
      meta: 'Meta (Llama)',
      mistral: 'Mistral AI',
      deepseek: 'DeepSeek',
      grok: 'Grok (xAI)',
      cohere: 'Cohere',
      perplexity: 'Perplexity',
      qwen: 'Qwen (Alibaba)',
      other: 'Outros',
    };
    return names[category] || category;
  };

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
          <Sparkles className="h-8 w-8" />
          Configuração de Modelos - Assistente de Projetos
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Selecione quais modelos de IA estarão disponíveis para os usuários escolherem durante as conversas. 
          Os usuários poderão trocar de modelo a qualquer momento no chat.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Modelos carregados diretamente do OpenRouter. 
          Os modelos selecionados estarão disponíveis para escolha no chat.
          Veja todos os modelos e preços em{' '}
          <a 
            href="https://openrouter.ai/models" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            openrouter.ai/models
            <ExternalLink className="h-3 w-3" />
          </a>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span>Modelos Disponíveis</span>
                <Badge variant="secondary">
                  {selectedModels.length} selecionado(s)
                </Badge>
              </CardTitle>
              <CardDescription>
                {loadingModels ? 'Carregando modelos do OpenRouter...' : `${allModels.length} modelos disponíveis`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadModels}
              disabled={loadingModels}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingModels ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filtro por Categoria */}
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-2 block">Filtrar por Empresa/Provedor</Label>
              <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas as empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Empresas</SelectItem>
                  {Object.keys(organizedModels).map((category) => (
                    <SelectItem key={category} value={category}>
                      {getCategoryName(category)} ({organizedModels[category]?.length || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Busca */}
            <div className="flex-1 relative">
              <Label className="text-xs text-muted-foreground mb-2 block">Buscar Modelos</Label>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, ID ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loadingModels ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Carregando modelos do OpenRouter...</span>
            </div>
          ) : (
            Object.entries(organizedModels)
              .filter(([category]) => {
                // Aplicar filtro de categoria
                if (selectedCategoryFilter === 'all') return true;
                return category === selectedCategoryFilter;
              })
              .map(([category, models]) => {
              const filteredModels = filterModels(models);
              if (filteredModels.length === 0) return null;
              
              const categoryModels = models.map(m => m.id);
              const allSelected = categoryModels.every(id => selectedModels.includes(id));
              const someSelected = categoryModels.some(id => selectedModels.includes(id));
              const isExpanded = expandedCategories[category] !== false;
              
              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [category]: !isExpanded }))}
                        className="h-6 w-6 p-0"
                      >
                        {isExpanded ? '▼' : '▶'}
                      </Button>
                      <h3 className="font-semibold text-lg">
                        {getCategoryName(category)}
                      </h3>
                      {someSelected && (
                        <Badge variant="outline" className="text-xs">
                          {categoryModels.filter(id => selectedModels.includes(id)).length}/{categoryModels.length}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectAll(category)}
                      className="text-xs"
                    >
                      {allSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
                    </Button>
                  </div>
                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredModels.map((model) => {
                        const isSelected = selectedModels.includes(model.id);
                        const priceIndicator = getPriceIndicator(model.pricing);
                        const priceFormatted = formatPrice(model.pricing);
                        const descriptionPT = translateDescription(model.id, model.description);
                        return (
                          <div
                            key={model.id}
                            className={`p-4 border rounded-lg transition-all cursor-pointer ${
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => handleToggleModel(model.id)}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleModel(model.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-semibold text-sm truncate">{model.name || model.id.split('/').pop()}</h4>
                                  <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                                    {priceIndicator}
                                  </Badge>
                                </div>
                                {descriptionPT && (
                                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                    {descriptionPT}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-xs font-semibold text-primary">
                                    {priceFormatted}
                                  </p>
                                </div>
                                <p className="text-xs font-mono text-muted-foreground truncate" title={model.id}>
                                  {model.id}
                                </p>
                                {model.context_length && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Contexto: {model.context_length.toLocaleString()} tokens
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
          <CardDescription>
            Modelos que estarão disponíveis para os usuários no chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum modelo selecionado. Selecione pelo menos um modelo acima.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedModels.map((modelId, index) => {
                const modelInfo = getModelInfo(modelId);
                return (
                  <div key={modelId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {index === 0 && (
                        <Badge variant="default" className="text-xs flex-shrink-0">Padrão</Badge>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{modelInfo.name}</p>
                        {modelInfo.description && (
                          <p className="text-xs text-muted-foreground">{modelInfo.description}</p>
                        )}
                        <p className="text-xs font-semibold text-primary mt-1">{modelInfo.priceFormatted}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0 ml-2">{modelInfo.price}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || selectedModels.length === 0}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Modelos ({selectedModels.length})
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default AssistantProjectModelSettings;
