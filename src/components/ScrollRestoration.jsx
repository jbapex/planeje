import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Componente para preservar e restaurar scroll position
 * Deve ser usado como wrapper em páginas que precisam preservar scroll
 */
const ScrollRestoration = ({ children, containerClassName = '' }) => {
  const location = useLocation();
  const containerRef = useRef(null);
  const scrollPositions = useRef(new Map());
  const isRestoringRef = useRef(false);

  // Salva posição de scroll
  useEffect(() => {
    const saveScroll = () => {
      const key = location.pathname + location.search;
      
      if (containerRef.current) {
        const scrollTop = containerRef.current.scrollTop;
        const scrollLeft = containerRef.current.scrollLeft;
        scrollPositions.current.set(key, { scrollTop, scrollLeft });
      } else {
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        scrollPositions.current.set(key, { scrollY, scrollX });
      }
    };

    // Salva ao sair da aba
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScroll();
      }
    };

    // Salva periodicamente
    const interval = setInterval(saveScroll, 500);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', saveScroll);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', saveScroll);
      saveScroll(); // Salva uma última vez
    };
  }, [location]);

  // Restaura posição de scroll
  useEffect(() => {
    const restoreScroll = () => {
      const key = location.pathname + location.search;
      const saved = scrollPositions.current.get(key);

      if (saved) {
        isRestoringRef.current = true;
        
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = saved.scrollTop || 0;
              containerRef.current.scrollLeft = saved.scrollLeft || 0;
            } else {
              window.scrollTo({
                top: saved.scrollY || 0,
                left: saved.scrollX || 0,
                behavior: 'instant'
              });
            }
            isRestoringRef.current = false;
          }, 50);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        restoreScroll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    restoreScroll();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [location]);

  if (containerClassName) {
    return (
      <div ref={containerRef} className={containerClassName} style={{ height: '100%', overflow: 'auto' }}>
        {children}
      </div>
    );
  }

  return <>{children}</>;
};

export default ScrollRestoration;

