// Hook para gerenciar cache de dados e prevenir re-fetch desnecessário
import { useState, useCallback } from 'react';

const CACHE_DURATION = 30000; // 30 segundos - ajustável conforme necessidade

// Cache global compartilhado entre todos os componentes
// Estrutura: { cacheKey: { data: qualquer, timestamp: number } }
const globalCache = new Map();

/**
 * Hook para gerenciar cache de dados
 * @param {string} cacheKey - Chave única para identificar os dados no cache
 * @returns {object} - { data, setCachedData, shouldFetch, getCachedData, clearCache }
 */
export const useDataCache = (cacheKey) => {
  // Inicializa com dados do cache se existirem e forem válidos
  const [data, setData] = useState(() => {
    const cached = globalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    // Se cache expirou, limpa ele
    if (cached) {
      globalCache.delete(cacheKey);
    }
    return null;
  });

  /**
   * Salva dados no cache
   */
  const setCachedData = useCallback((newData) => {
    globalCache.set(cacheKey, {
      data: newData,
      timestamp: Date.now()
    });
    setData(newData);
  }, [cacheKey]);

  /**
   * Verifica se precisa fazer fetch (não tem cache ou cache expirado)
   */
  const shouldFetch = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (!cached) return true; // Não tem cache, precisa buscar
    if (Date.now() - cached.timestamp >= CACHE_DURATION) return true; // Cache expirado
    return false; // Tem cache válido
  }, [cacheKey]);

  /**
   * Retorna dados do cache (se válidos)
   */
  const getCachedData = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    // Se cache expirou, limpa ele
    if (cached) {
      globalCache.delete(cacheKey);
    }
    return null;
  }, [cacheKey]);

  /**
   * Limpa o cache manualmente
   */
  const clearCache = useCallback(() => {
    globalCache.delete(cacheKey);
    setData(null);
  }, [cacheKey]);

  /**
   * Limpa todos os caches (útil para logout)
   */
  const clearAllCache = useCallback(() => {
    globalCache.clear();
  }, []);

  return {
    data,
    setCachedData,
    shouldFetch,
    getCachedData,
    clearCache,
    clearAllCache
  };
};

/**
 * Limpa todos os caches (função utilitária global)
 */
export const clearAllDataCache = () => {
  globalCache.clear();
};

