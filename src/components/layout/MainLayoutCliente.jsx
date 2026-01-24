import React, { memo, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SidebarCliente from '@/components/client/SidebarCliente';
import BottomNavCliente from '@/components/client/BottomNavCliente';

const MainLayoutCliente = memo(() => {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollPositions = useRef(new Map());

  // Salva posição de scroll ao navegar
  useEffect(() => {
    const saveScroll = () => {
      const key = location.pathname + location.search;
      if (mainRef.current) {
        scrollPositions.current.set(key, mainRef.current.scrollTop);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScroll();
      }
    };

    const interval = setInterval(saveScroll, 500);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', saveScroll);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', saveScroll);
      saveScroll();
    };
  }, [location]);

  // Restaura posição de scroll ao voltar
  useEffect(() => {
    const restoreScroll = () => {
      const key = location.pathname + location.search;
      const saved = scrollPositions.current.get(key);

      if (saved !== undefined && mainRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (mainRef.current) {
              mainRef.current.scrollTop = saved;
            }
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

  return (
    <div className="h-screen flex overflow-hidden bg-[#f8fafc]">
      <SidebarCliente />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto px-4 md:px-8 py-8 min-h-0 md:pb-6"
          style={{ 
            paddingBottom: 'max(5rem, calc(4rem + env(safe-area-inset-bottom, 0px)))'
          }}
        >
          <Outlet />
        </main>
      </div>
      <BottomNavCliente />
    </div>
  );
});

MainLayoutCliente.displayName = 'MainLayoutCliente';

export default MainLayoutCliente;

