import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2 } from 'lucide-react';
import { fetchOpenRouterModels, getPriceIndicator } from '@/lib/openrouterModels';

const ModelSelector = ({ selectedModel, availableModels, onModelChange, className = '' }) => {
  const [modelsCache, setModelsCache] = useState({});

  useEffect(() => {
    // Buscar informações dos modelos quando necessário
    const loadModelInfo = async () => {
      try {
        const allModels = await fetchOpenRouterModels();
        const cache = {};
        allModels.forEach(model => {
          cache[model.id] = {
            name: model.name || model.id.split('/').pop(),
            description: model.description || '',
            price: getPriceIndicator(model.pricing),
          };
        });
        setModelsCache(cache);
      } catch (error) {
        console.warn('Erro ao carregar informações dos modelos:', error);
      }
    };
    loadModelInfo();
  }, []);

  const getModelInfo = (modelId) => {
    if (modelsCache[modelId]) {
      return modelsCache[modelId];
    }
    return { name: modelId.split('/').pop(), description: '', price: '?' };
  };

  const selectedModelInfo = getModelInfo(selectedModel);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Sparkles className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="w-[200px] h-8 text-xs">
          <SelectValue>
            <div className="flex items-center gap-2">
              <span className="truncate">{selectedModelInfo.name}</span>
              <Badge variant="outline" className="text-xs px-1 py-0">
                {selectedModelInfo.price}
              </Badge>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {availableModels.map((modelId) => {
            const modelInfo = getModelInfo(modelId);
            return (
              <SelectItem key={modelId} value={modelId}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{modelInfo.name}</span>
                    <span className="text-xs text-muted-foreground">{modelInfo.description}</span>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {modelInfo.price}
                  </Badge>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ModelSelector;

