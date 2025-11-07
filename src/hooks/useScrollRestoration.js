import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook para preservar e restaurar a posição de scroll ao navegar entre rotas
 * e ao voltar para a aba do navegador
 */
export const useScrollRestoration = (enabled = true) => {
  const location = useLocation();
  const scrollPositions = useRef(new Map());
  const containerRef = useRef(null);
  const isRestoringRef = useRef(false);

  // Salva posição de scroll antes de sair da página
  useEffect(() => {
    if (!enabled) return;

    const saveScrollPosition = () => {
      const key = location.pathname + location.search;
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      // Se tem container específico, salva scroll dele
      if (containerRef.current) {
        const containerScroll = {
          scrollTop: containerRef.current.scrollTop,
          scrollLeft: containerRef.current.scrollLeft
        };
        scrollPositions.current.set(key, containerScroll);
      } else {
        // Salva scroll da window
        scrollPositions.current.set(key, { scrollY, scrollX });
      }
    };

    // Salva ao sair da página (antesunload)
    window.addEventListener('beforeunload', saveScrollPosition);
    
    // Salva ao mudar de aba (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScrollPosition();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Salva periodicamente (a cada 500ms) para garantir que não perde
    const saveInterval = setInterval(saveScrollPosition, 500);

    return () => {
      window.removeEventListener('beforeunload', saveScrollPosition);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(saveInterval);
      saveScrollPosition(); // Salva uma última vez ao desmontar
    };
  }, [location, enabled]);

  // Restaura posição de scroll ao montar/voltar para a página
  useEffect(() => {
    if (!enabled) return;

    const restoreScrollPosition = () => {
      const key = location.pathname + location.search;
      const savedPosition = scrollPositions.current.get(key);

      if (savedPosition) {
        isRestoringRef.current = true;

        // Pequeno delay para garantir que o DOM está renderizado
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (containerRef.current) {
              // Restaura scroll do container
              containerRef.current.scrollTop = savedPosition.scrollTop || 0;
              containerRef.current.scrollLeft = savedPosition.scrollLeft || 0;
            } else {
              // Restaura scroll da window
              window.scrollTo({
                top: savedPosition.scrollY || 0,
                left: savedPosition.scrollX || 0,
                behavior: 'instant' // Sem animação para ser instantâneo
              });
            }
            
            isRestoringRef.current = false;
          }, 50);
        });
      }
    };

    // Restaura quando a página fica visível novamente
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        restoreScrollPosition();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Restaura imediatamente ao montar
    restoreScrollPosition();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [location, enabled]);

  return {
    containerRef,
    isRestoring: () => isRestoringRef.current
  };
};

