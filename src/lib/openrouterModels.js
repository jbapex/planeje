/**
 * Helper para buscar modelos disponíveis do OpenRouter
 */

const OPENROUTER_MODELS_API = 'https://openrouter.ai/api/v1/models';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

let cachedModels = null;
let cacheTimestamp = null;

/**
 * Busca todos os modelos disponíveis do OpenRouter
 * @returns {Promise<Array>} Array de modelos com informações
 */
export async function fetchOpenRouterModels() {
  const now = Date.now();
  
  // Retornar cache se ainda válido
  if (cachedModels && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedModels;
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_API);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar modelos: ${response.status}`);
    }

    const data = await response.json();
    
    // Verificar estrutura da resposta
    const totalModelsInResponse = data.data ? Object.keys(data.data).length : 0;
    console.log('📊 Resposta da API OpenRouter:', {
      hasData: !!data.data,
      dataType: typeof data.data,
      totalModelsInResponse,
      sampleKeys: data.data ? Object.keys(data.data).slice(0, 10) : []
    });
    
    // Formatar modelos para o formato esperado
    // A API pode retornar data.data como objeto ou array
    let modelsData = data.data || {};
    
    // Se for um array, converter para objeto
    if (Array.isArray(modelsData)) {
      const modelsObj = {};
      modelsData.forEach(model => {
        if (model.id) {
          modelsObj[model.id] = model;
        }
      });
      modelsData = modelsObj;
    }
    
    const models = Object.entries(modelsData)
      .filter(([id, model]) => {
        // Filtrar apenas modelos válidos (com id e estrutura básica)
        return id && model && (model.name || id);
      })
      .map(([id, model]) => ({
        id,
        name: model.name || id.split('/').pop(),
        description: model.description || '',
        context_length: model.context_length || 0,
        pricing: model.pricing || {},
        architecture: model.architecture || {},
        top_provider: model.top_provider || {},
        per_request_limits: model.per_request_limits || {},
      }));
    
    // Log para verificar diferença
    const totalInData = Object.keys(modelsData).length;
    const filteredOut = totalInData - models.length;
    console.log(`✅ Total de modelos na resposta: ${totalInData}`);
    console.log(`✅ Total de modelos processados: ${models.length}`);
    if (filteredOut > 0) {
      console.warn(`⚠️ ${filteredOut} modelos foram filtrados (sem ID ou estrutura inválida)`);
    }
    
    // Verificar se há modelos duplicados ou problemas
    const uniqueIds = new Set(models.map(m => m.id));
    if (uniqueIds.size !== models.length) {
      console.warn(`⚠️ Modelos duplicados detectados: ${models.length - uniqueIds.size}`);
    }

    // Ordenar por nome
    models.sort((a, b) => a.name.localeCompare(b.name));

    // Atualizar cache
    cachedModels = models;
    cacheTimestamp = now;

    return models;
  } catch (error) {
    console.error('Erro ao buscar modelos do OpenRouter:', error);
    
    // Retornar cache antigo se disponível, ou modelos padrão
    if (cachedModels) {
      return cachedModels;
    }
    
    // Fallback: modelos padrão conhecidos
    return getDefaultModels();
  }
}

/**
 * Organiza modelos por provedor/categoria
 * @param {Array} models - Array de modelos
 * @returns {Object} Modelos organizados por categoria (principais primeiro, outros no final)
 */
export function organizeModelsByProvider(models) {
  // Ordem das principais categorias
  const mainCategories = [
    'openai',
    'anthropic',
    'google',
    'meta',
    'mistral',
    'deepseek',
    'grok',
    'cohere',
    'perplexity',
    'qwen',
  ];

  const organized = {
    openai: [],
    anthropic: [],
    google: [],
    meta: [],
    mistral: [],
    deepseek: [],
    grok: [],
    cohere: [],
    perplexity: [],
    qwen: [],
    other: [],
  };

  models.forEach(model => {
    const id = model.id.toLowerCase();
    
    // Verificar múltiplos padrões para cada categoria (mais abrangente)
    if (id.startsWith('openai/') || (id.includes('/gpt') && !id.includes('gpt-oss'))) {
      organized.openai.push(model);
    } else if (id.startsWith('anthropic/') || id.startsWith('claude') || id.includes('/claude')) {
      organized.anthropic.push(model);
    } else if (id.startsWith('google/') || id.startsWith('gemini') || id.includes('/gemini') || id.includes('/palm')) {
      organized.google.push(model);
    } else if (id.startsWith('meta/') || id.startsWith('llama') || id.includes('/llama') || id.includes('meta-llama')) {
      organized.meta.push(model);
    } else if (id.startsWith('mistral') || id.includes('/mistral')) {
      organized.mistral.push(model);
    } else if (id.startsWith('deepseek') || id.includes('/deepseek')) {
      organized.deepseek.push(model);
    } else if (id.startsWith('grok') || id.startsWith('x-ai') || id.includes('/grok')) {
      organized.grok.push(model);
    } else if (id.startsWith('cohere') || id.includes('/cohere')) {
      organized.cohere.push(model);
    } else if (id.startsWith('perplexity') || id.includes('/perplexity')) {
      organized.perplexity.push(model);
    } else if (id.startsWith('qwen') || id.includes('/qwen') || id.includes('alibaba')) {
      organized.qwen.push(model);
    } else {
      organized.other.push(model);
    }
  });
  
  // Log para debug - verificar se todos os modelos foram categorizados
  const totalCategorized = Object.values(organized).reduce((sum, arr) => sum + arr.length, 0);
  console.log('📊 Modelos organizados por categoria:', {
    openai: organized.openai.length,
    anthropic: organized.anthropic.length,
    google: organized.google.length,
    meta: organized.meta.length,
    mistral: organized.mistral.length,
    deepseek: organized.deepseek.length,
    grok: organized.grok.length,
    cohere: organized.cohere.length,
    perplexity: organized.perplexity.length,
    qwen: organized.qwen.length,
    other: organized.other.length,
    totalCategorized,
    totalModels: models.length,
    diff: models.length - totalCategorized
  });

  // Criar objeto ordenado: principais primeiro, depois outros
  const ordered = {};
  
  // Adicionar principais categorias (mesmo que vazias, para manter ordem)
  mainCategories.forEach(category => {
    if (organized[category] && organized[category].length > 0) {
      ordered[category] = organized[category];
    }
  });
  
  // Adicionar "Outros" no final se houver modelos
  if (organized.other && organized.other.length > 0) {
    ordered.other = organized.other;
  }

  return ordered;
}

/**
 * Calcula preço estimado baseado no pricing
 * @param {Object} pricing - Objeto de pricing do modelo
 * @returns {string} Indicador de preço ($, $$, $$$, $$$$)
 */
export function getPriceIndicator(pricing) {
  if (!pricing || !pricing.prompt || !pricing.completion) {
    return '?';
  }

  // Calcular custo médio por 1M tokens (prompt + completion)
  const promptCost = pricing.prompt || 0;
  const completionCost = pricing.completion || 0;
  const avgCost = (promptCost + completionCost) / 2;

  if (avgCost < 0.5) return '$';
  if (avgCost < 2) return '$$';
  if (avgCost < 10) return '$$$';
  return '$$$$';
}

/**
 * Formata preço para exibição
 * @param {Object} pricing - Objeto de pricing do modelo
 * @returns {string} Preço formatado (ex: "$2.50 / $10.00")
 */
export function formatPrice(pricing) {
  if (!pricing) {
    return 'Preço não disponível';
  }

  const promptCost = pricing.prompt || 0;
  const completionCost = pricing.completion || 0;

  if (promptCost === 0 && completionCost === 0) {
    return 'Gratuito';
  }

  const formatCost = (cost) => {
    if (cost === 0) return 'Grátis';
    if (cost < 0.01) return `$${(cost * 1000).toFixed(2)}/1K`;
    return `$${cost.toFixed(2)}`;
  };

  if (promptCost === completionCost) {
    return `${formatCost(promptCost)}/1M tokens`;
  }

  return `${formatCost(promptCost)} / ${formatCost(completionCost)} por 1M tokens`;
}

/**
 * Traduz descrição do modelo para português
 * @param {string} modelId - ID do modelo
 * @param {string} originalDescription - Descrição original em inglês
 * @returns {string} Descrição traduzida ou original se não houver tradução
 */
export function translateDescription(modelId, originalDescription) {
  // Mapeamento de traduções comuns
  const translations = {
    'openai/gpt-4o': 'Modelo mais recente e poderoso da OpenAI, com melhor desempenho em tarefas complexas',
    'openai/gpt-4-turbo': 'Versão rápida e eficiente do GPT-4, ideal para uso em produção',
    'openai/gpt-4': 'Versão clássica do GPT-4, excelente qualidade e confiabilidade',
    'openai/gpt-3.5-turbo': 'Modelo econômico e rápido, perfeito para tarefas simples e rápidas',
    'anthropic/claude-3.5-sonnet': 'Excelente para análise profunda, raciocínio complexo e escrita longa',
    'anthropic/claude-3-opus': 'Modelo mais poderoso da Anthropic, ideal para tarefas complexas',
    'anthropic/claude-3-sonnet': 'Bom equilíbrio entre qualidade e velocidade',
    'anthropic/claude-3-haiku': 'Modelo rápido e econômico, perfeito para respostas rápidas',
    'google/gemini-pro-1.5': 'Versão avançada do Gemini com contexto expandido',
    'google/gemini-flash-1.5': 'Versão rápida e eficiente do Gemini',
    'google/gemini-pro': 'Versão padrão do Gemini Pro',
    'meta-llama/llama-3.1-70b-instruct': 'Modelo open source poderoso com 70 bilhões de parâmetros',
    'meta-llama/llama-3.1-8b-instruct': 'Modelo open source leve e rápido',
    'mistralai/mistral-large': 'Modelo de alto desempenho da Mistral AI',
    'mistralai/mixtral-8x7b-instruct': 'Modelo open source com arquitetura Mixtral',
  };

  // Se houver tradução específica, usar
  if (translations[modelId]) {
    return translations[modelId];
  }

  // Traduções genéricas baseadas em palavras-chave
  const lowerDesc = originalDescription.toLowerCase();
  
  if (lowerDesc.includes('fast') || lowerDesc.includes('quick')) {
    return 'Modelo rápido e eficiente';
  }
  if (lowerDesc.includes('powerful') || lowerDesc.includes('advanced')) {
    return 'Modelo poderoso e avançado';
  }
  if (lowerDesc.includes('economy') || lowerDesc.includes('cheap')) {
    return 'Modelo econômico e acessível';
  }
  if (lowerDesc.includes('reasoning') || lowerDesc.includes('analysis')) {
    return 'Excelente para raciocínio e análise';
  }
  if (lowerDesc.includes('creative') || lowerDesc.includes('writing')) {
    return 'Ideal para criação de conteúdo e escrita';
  }
  if (lowerDesc.includes('code') || lowerDesc.includes('programming')) {
    return 'Otimizado para programação e código';
  }

  // Se não houver tradução, retornar original ou descrição genérica
  return originalDescription || 'Modelo de linguagem avançado';
}

/**
 * Modelos padrão caso a API falhe
 */
function getDefaultModels() {
  return [
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Mais recente e poderoso', pricing: { prompt: 2.5, completion: 10 } },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Rápido e eficiente', pricing: { prompt: 10, completion: 30 } },
    { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Econômico e rápido', pricing: { prompt: 0.5, completion: 1.5 } },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Melhor para análise', pricing: { prompt: 3, completion: 15 } },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', description: 'Versão avançada', pricing: { prompt: 1.25, completion: 5 } },
  ];
}

/**
 * Limpa o cache de modelos
 */
export function clearModelsCache() {
  cachedModels = null;
  cacheTimestamp = null;
}

/**
 * Verifica se um modelo é de geração de imagem
 * @param {string} modelId - ID do modelo
 * @returns {boolean} True se for modelo de imagem
 */
export function isImageGenerationModel(modelId) {
  if (!modelId) return false;
  
  const id = modelId.toLowerCase();
  
  // Modelos conhecidos de geração de imagem
  const imageModelPatterns = [
    'flux',
    'dall-e',
    'dalle',
    'stable-diffusion',
    'stablediffusion',
    'midjourney',
    'imagen',
    'image',
    'black-forest-labs',
    'runway',
    'ideogram',
    'playground',
    'leonardo',
    'nano',
    'banana',
  ];
  
  return imageModelPatterns.some(pattern => id.includes(pattern));
}

/**
 * Lista de modelos de imagem populares no OpenRouter
 */
export const POPULAR_IMAGE_MODELS = [
  { id: 'black-forest-labs/flux-pro', name: 'Flux Pro', description: 'Modelo avançado de geração de imagem' },
  { id: 'black-forest-labs/flux-schnell', name: 'Flux Schnell', description: 'Versão rápida do Flux' },
  { id: 'openai/dall-e-3', name: 'DALL-E 3', description: 'Modelo da OpenAI para geração de imagens' },
  { id: 'openai/dall-e-2', name: 'DALL-E 2', description: 'Versão anterior do DALL-E' },
  { id: 'stability-ai/stable-diffusion-xl', name: 'Stable Diffusion XL', description: 'Modelo open source' },
];

