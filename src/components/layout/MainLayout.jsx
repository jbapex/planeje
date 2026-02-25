import React, { memo, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';

const MainLayout = memo(() => {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollPositions = useRef(new Map());

  // Salva posição de scroll ao sair da página/aba
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

  const isCrmRoute = location.pathname.startsWith('/crm');
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {!isCrmRoute && <Header />}
        <main
          ref={mainRef}
          className={
            isCrmRoute
              ? 'flex-1 flex flex-col min-h-0 overflow-hidden pb-20 md:pb-6'
              : 'flex-1 overflow-y-auto p-6 pb-20 md:pb-6'
          }
        >
          {isCrmRoute ? (
            <div className="flex-1 flex flex-col min-h-0 w-full">
              <Outlet />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  );
});

MainLayout.displayName = 'MainLayout';

export default MainLayout;