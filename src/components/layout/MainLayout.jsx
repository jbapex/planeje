import AtlasTeamAssistant from '@/components/atlas/AtlasTeamAssistant';
import React, { memo, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { useAtendimentoLembreteNotifications } from '@/hooks/useAtendimentoLembreteNotifications';
import AtendimentoLembreteToastStack from '@/components/atendimento/AtendimentoLembreteToastStack';
import AtendimentoMessageAlertsBridge from '@/components/atendimento/AtendimentoMessageAlertsBridge';
import AtendimentoCanalDesconectadoBanner from '@/components/atendimento/AtendimentoCanalDesconectadoBanner';
import AtendimentoEsperaPopup from '@/components/atendimento/AtendimentoEsperaPopup';
import TaskStatusAlertsBridge from '@/components/tasks/TaskStatusAlertsBridge';
import CaixaPendenciasAlertsBridge from '@/components/caixa/CaixaPendenciasAlertsBridge';
import {
  AtendimentoFavoritosGlobalRail,
  AtendimentoFavoritosProvider,
} from '@/contexts/AtendimentoFavoritosContext';
import { cn } from '@/lib/utils';
import CommandPalette from '@/components/layout/CommandPalette';

function LembreteNotificationsBridge() {
  const { items, dismissItem, openItem, completeItem } = useAtendimentoLembreteNotifications();
  return (
    <AtendimentoLembreteToastStack
      items={items}
      onDismiss={dismissItem}
      onOpen={openItem}
      onComplete={completeItem}
    />
  );
}

const MainLayout = memo(() => {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollPositions = useRef(new Map());

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

  const isCrmRoute =
    location.pathname.startsWith('/crm') ||
    location.pathname.startsWith('/rastreamento');
  const isConversasRoute =
    location.pathname === '/conversas' || location.pathname.startsWith('/conversas/');
  const isPaidTrafficRoute = location.pathname.startsWith('/paid-traffic');
  const isCoverageRoute = location.pathname === '/cobertura';
  const isMiniCrmRoute = location.pathname === '/mini-crm' || location.pathname.startsWith('/mini-crm/');
  const isOnboardingRoute = location.pathname === '/onboarding';
  const isAtlasRoute = location.pathname === '/assistant/atlas';
  const atlasSearch = isAtlasRoute ? new URLSearchParams(location.search) : null;
  const isAtlasConversation = atlasSearch && !atlasSearch.has('office_client') &&
    (atlasSearch.get('view') === 'conversation' || atlasSearch.has('topic') || atlasSearch.has('conversation'));
  const isFullBleedRoute = isCrmRoute || isConversasRoute || isMiniCrmRoute;
  const isProjectDetailRoute = /^\/projects\/(?!new$|edit\/)[^/]+/.test(location.pathname);
  const isProjectsHubRoute = location.pathname === '/projects';
  const hideWorkspaceHeader = isFullBleedRoute || isPaidTrafficRoute || isAtlasRoute;

  return (
    <AtendimentoFavoritosProvider>
      <div className="planeje-app flex flex-row overflow-hidden flex-1 min-h-0 w-full h-full">
        <LembreteNotificationsBridge />
        <AtendimentoMessageAlertsBridge />
        <TaskStatusAlertsBridge />
        <CaixaPendenciasAlertsBridge />
        <CommandPalette />
        {!isAtlasConversation && <Sidebar />}
        <div className="planeje-main-column flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className="planeje-content-shell flex flex-1 min-h-0 min-w-0 flex-row overflow-hidden">
            <div className="planeje-workspace flex-1 min-h-0 min-w-0">
              <AtendimentoCanalDesconectadoBanner />
              <AtlasTeamAssistant />
        {!/^\/paid-traffic\/hoje\/?$/.test(location.pathname) && <AtendimentoEsperaPopup />}
              {!hideWorkspaceHeader && <Header />}
              <main
                ref={mainRef}
                className={cn(
                  'planeje-workspace-main',
                  isAtlasRoute
                    ? 'planeje-workspace-main--scroll !p-0'
                    : isFullBleedRoute
                    ? 'planeje-workspace-main--flush'
                    : cn(
                        isOnboardingRoute ? 'planeje-workspace-main--locked planeje-workspace-main--onboarding' : 'planeje-workspace-main--scroll',
                        isProjectsHubRoute ? 'pb-0' : '',
                        isCoverageRoute
                          ? '!p-0'
                          : isProjectDetailRoute || isProjectsHubRoute
                          ? 'planeje-page-padding'
                          : isPaidTrafficRoute
                            ? 'planeje-page-padding planeje-page-padding--trafego'
                            : 'planeje-page-padding'
                      )
                )}
              >
                <Outlet />
              </main>
            </div>
            <AtendimentoFavoritosGlobalRail />
          </div>
        </div>
        <BottomNav />
      </div>
    </AtendimentoFavoritosProvider>
  );
});

MainLayout.displayName = 'MainLayout';

export default MainLayout;
