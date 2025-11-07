import { useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook para prevenir re-fetch automático de dados
 * Garante que fetch só acontece uma vez por rota, mesmo ao voltar para aba
 */
export const usePreventRefetch = () => {
  const location = useLocation();
  const hasFetchedRef = useRef(new Set());
  const isVisibleRef = useRef(true);

  // Rastreia se a página está visível
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    isVisibleRef.current = !document.hidden;

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /**
   * Verifica se já fez fetch para esta rota
   */
  const shouldFetch = (key = null) => {
    const routeKey = key || (location.pathname + location.search);
    
    // Se já fez fetch para esta rota, não faz novamente
    if (hasFetchedRef.current.has(routeKey)) {
      return false;
    }

    // Se a página não está visível, não faz fetch
    if (!isVisibleRef.current) {
      return false;
    }

    // Marca como fetched
    hasFetchedRef.current.add(routeKey);
    return true;
  };

  /**
   * Força re-fetch (apenas para casos específicos como refresh manual)
   */
  const forceFetch = (key = null) => {
    const routeKey = key || (location.pathname + location.search);
    hasFetchedRef.current.delete(routeKey);
  };

  /**
   * Limpa cache de fetch (útil para logout)
   */
  const clearFetchCache = () => {
    hasFetchedRef.current.clear();
  };

  return {
    shouldFetch,
    forceFetch,
    clearFetchCache,
    isVisible: () => isVisibleRef.current
  };
};

