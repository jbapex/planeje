/**
 * Helper para detectar se um modelo é do OpenRouter
 * Modelos OpenRouter geralmente têm formato: provider/model-name (ex: openai/gpt-4o)
 */

/**
 * Verifica se um modelo é do OpenRouter
 * @param {string} modelId - ID do modelo (ex: 'gpt-4o' ou 'openai/gpt-4o')
 * @returns {boolean} True se for modelo OpenRouter
 */
export function isOpenRouterModel(modelId) {
  if (!modelId) return false;
  
  const id = modelId.toLowerCase();
  
  // Modelos OpenAI diretos (sem provider/) não são OpenRouter
  const openaiDirectModels = [
    'gpt-5.1', 'gpt-5-mini', 'gpt-5-nano',
    'o3', 'o3-mini', 'o1-preview', 'o1-mini',
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'
  ];
  
  // Se for um modelo OpenAI direto (sem /), não é OpenRouter
  if (openaiDirectModels.some(model => id === model || id.startsWith(model + '-'))) {
    return false;
  }
  
  // Se contém /, provavelmente é OpenRouter (formato provider/model)
  if (id.includes('/')) {
    return true;
  }
  
  return false;
}

/**
 * Normaliza o modelo para o formato correto
 * @param {string} modelId - ID do modelo
 * @returns {string} Modelo normalizado
 */
export function normalizeModel(modelId) {
  if (!modelId) return 'gpt-4o';
  
  // Se já está no formato OpenRouter, retornar como está
  if (isOpenRouterModel(modelId)) {
    return modelId;
  }
  
  // Se for modelo OpenAI direto, manter como está (será usado com openai-chat)
  return modelId;
}

