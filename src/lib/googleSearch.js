/**
 * Helper para fazer busca no Google quando usar modelos Gemini
 */

import { supabase } from './customSupabaseClient';

/**
 * Faz uma busca na web (tenta Google primeiro, depois DuckDuckGo como fallback)
 * @param {string} query - Termo de busca
 * @param {number} numResults - Número de resultados (padrão: 5)
 * @returns {Promise<Array>} Array de resultados da busca
 */
export async function searchGoogle(query, numResults = 5) {
  try {
    // Tenta usar Google Search primeiro (se configurado)
    const { data: googleData, error: googleError } = await supabase.functions.invoke('google-search', {
      body: JSON.stringify({
        query: query.trim(),
        num: numResults,
      }),
    });

    if (!googleError && googleData?.results && googleData.results.length > 0) {
      console.log('✅ Busca realizada via Google Search');
      return googleData.results;
    }

    // Se Google não estiver configurado ou falhar, usa DuckDuckGo (gratuito, sem API key)
    console.log('⚠️ Google Search não disponível, usando DuckDuckGo...');
    const { data: ddgData, error: ddgError } = await supabase.functions.invoke('duckduckgo-search', {
      body: JSON.stringify({
        query: query.trim(),
        num: numResults,
      }),
    });

    if (ddgError) {
      console.error('Erro ao buscar no DuckDuckGo:', ddgError);
      return [];
    }

    console.log('✅ Busca realizada via DuckDuckGo');
    return ddgData?.results || [];
  } catch (error) {
    console.error('Erro ao fazer busca na web:', error);
    return [];
  }
}

/**
 * Verifica se o modelo é do Google/Gemini
 * @param {string} modelId - ID do modelo (ex: 'google/gemini-pro-1.5')
 * @returns {boolean}
 */
export function isGeminiModel(modelId) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return id.startsWith('google/') || 
         id.includes('gemini') || 
         id.includes('/gemini') ||
         id.startsWith('gemini');
}

/**
 * Extrai termos de busca da mensagem do usuário
 * @param {string} message - Mensagem do usuário
 * @returns {string|null} Termo de busca ou null se não houver necessidade
 */
export function extractSearchQuery(message) {
  if (!message || typeof message !== 'string') return null;
  
  const lowerMessage = message.toLowerCase();
  
  // Palavras-chave que indicam necessidade de busca
  const searchKeywords = [
    'pesquisar', 'buscar', 'procurar', 'encontrar',
    'qual é', 'o que é', 'quem é', 'onde está',
    'últimas notícias', 'notícias', 'atual', 'recente',
    'tendência', 'tendências', 'estatísticas', 'dados',
    'preço de', 'quanto custa', 'comparar',
    'melhor', 'top', 'ranking',
  ];

  // Verificar se a mensagem contém palavras-chave de busca
  const hasSearchKeyword = searchKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );

  // Verificar se a mensagem parece uma pergunta sobre informações gerais
  const isQuestion = lowerMessage.includes('?') || 
                     lowerMessage.startsWith('qual') ||
                     lowerMessage.startsWith('quem') ||
                     lowerMessage.startsWith('onde') ||
                     lowerMessage.startsWith('quando') ||
                     lowerMessage.startsWith('como') ||
                     lowerMessage.startsWith('por que') ||
                     lowerMessage.startsWith('porque');

  // Se tiver palavra-chave de busca ou for uma pergunta, extrair termos
  if (hasSearchKeyword || isQuestion) {
    // Remover palavras comuns e manter termos importantes
    const stopWords = ['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'em', 'no', 'na', 'para', 'com', 'por', 'sobre', 'qual', 'quem', 'onde', 'quando', 'como', 'por que', 'porque', 'é', 'são', 'foi', 'ser', 'estar'];
    const words = message.split(/\s+/).filter(word => 
      word.length > 2 && !stopWords.includes(word.toLowerCase())
    );
    
    if (words.length > 0) {
      return words.slice(0, 5).join(' '); // Máximo 5 palavras
    }
  }

  return null;
}

/**
 * Formata resultados da busca para incluir no contexto do modelo
 * @param {Array} searchResults - Resultados da busca
 * @returns {string} Texto formatado para incluir no prompt
 */
export function formatSearchResults(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '';
  }

  let formatted = '\n\n**INFORMAÇÕES ATUALIZADAS DA WEB (via Busca na Internet):**\n';
  
  searchResults.forEach((result, index) => {
    formatted += `\n${index + 1}. **${result.title}**\n`;
    formatted += `   Link: ${result.link}\n`;
    formatted += `   ${result.snippet}\n`;
  });

  formatted += '\n**IMPORTANTE:** Use essas informações para enriquecer sua resposta com dados atualizados e relevantes. Sempre cite as fontes quando usar informações específicas dos resultados da busca.\n';

  return formatted;
}

