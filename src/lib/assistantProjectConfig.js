/**
 * Helper para buscar configurações do Assistente de Projetos
 */

import { supabase } from './customSupabaseClient';

const CONFIG_KEY = 'assistant_project_model_config';
const DEFAULT_MODEL = 'deepseek/deepseek-r1-0528';
const DEFAULT_MODELS = [DEFAULT_MODEL];

/**
 * Busca os modelos disponíveis para o Assistente de Projetos
 * @returns {Promise<string[]>} Array de IDs dos modelos (ex: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'])
 */
export async function getAvailableModels() {
  try {
    const { data, error } = await supabase
      .from('public_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao buscar modelos configurados:', error);
      return DEFAULT_MODELS;
    }

    if (data?.value) {
      const config = JSON.parse(data.value);
      // Suporta formato novo (models) e antigo (model)
      if (config.models && Array.isArray(config.models) && config.models.length > 0) {
        return config.models;
      } else if (config.model) {
        // Migração: formato antigo
        return [config.model];
      }
    }

    return DEFAULT_MODELS;
  } catch (e) {
    console.warn('Erro ao parsear configuração dos modelos:', e);
    return DEFAULT_MODELS;
  }
}

/**
 * Busca o modelo padrão configurado
 * @returns {Promise<string>} ID do modelo padrão
 */
export async function getDefaultModel() {
  try {
    const { data, error } = await supabase
      .from('public_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao buscar modelo padrão:', error);
      const models = await getAvailableModels();
      return models[0] || DEFAULT_MODEL;
    }

    if (data?.value) {
      const config = JSON.parse(data.value);
      // Se houver defaultModel configurado, usar; senão usar o primeiro da lista
      if (config.defaultModel && config.models && config.models.includes(config.defaultModel)) {
        return config.defaultModel;
      } else if (config.models && config.models.length > 0) {
        return config.models[0];
      } else if (config.model) {
        return config.model;
      }
    }

    const models = await getAvailableModels();
    return models[0] || DEFAULT_MODEL;
  } catch (e) {
    console.warn('Erro ao buscar modelo padrão:', e);
    const models = await getAvailableModels();
    return models[0] || DEFAULT_MODEL;
  }
}

/**
 * Busca o modelo configurado para o Assistente de Projetos (compatibilidade)
 * @deprecated Use getDefaultModel() ou getAvailableModels()
 * @returns {Promise<string>} ID do modelo (ex: 'openai/gpt-4o')
 */
export async function getAssistantProjectModel() {
  return getDefaultModel();
}

/**
 * Cache simples para evitar múltiplas consultas
 */
let cachedModels = null;
let cachedDefaultModel = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Busca os modelos disponíveis com cache
 * @returns {Promise<string[]>} Array de IDs dos modelos
 */
export async function getAvailableModelsCached() {
  const now = Date.now();
  
  if (cachedModels && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedModels;
  }

  cachedModels = await getAvailableModels();
  cacheTimestamp = now;
  return cachedModels;
}

/**
 * Busca o modelo padrão com cache
 * @returns {Promise<string>} ID do modelo padrão
 */
export async function getDefaultModelCached() {
  const now = Date.now();
  
  if (cachedDefaultModel && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedDefaultModel;
  }

  cachedDefaultModel = await getDefaultModel();
  cacheTimestamp = now;
  return cachedDefaultModel;
}

/**
 * Busca o modelo com cache (compatibilidade)
 * @deprecated Use getDefaultModelCached()
 * @returns {Promise<string>} ID do modelo
 */
export async function getAssistantProjectModelCached() {
  return getDefaultModelCached();
}

/**
 * Limpa o cache (útil após salvar nova configuração)
 */
export function clearModelCache() {
  cachedModels = null;
  cachedDefaultModel = null;
  cacheTimestamp = null;
}

