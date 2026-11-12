import React, { memo, useRef, useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SidebarCliente from '@/components/client/SidebarCliente';
import BottomNavCliente from '@/components/client/BottomNavCliente';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import { LogOut, RefreshCw } from 'lucide-react';
import { reloadCurrentPage } from '@/lib/teamNav';
import { cn } from '@/lib/utils';
import {
  CLIENT_PANEL_COLOR_EVENT,
  CLIENT_PANEL_LOGO_EVENT,
  buildClientPanelVars,
  normalizeHex,
} from '@/lib/clientPanelTheme';

const MainLayoutCliente = memo(() => {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollPositions = useRef(new Map());
  const auth = useAuth();
  const { profile, signOut } = auth || {};
  const [clienteData, setClienteData] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [panelColor, setPanelColor] = useState(null);

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

  // Buscar dados do cliente para o header mobile
  useEffect(() => {
    const fetchClienteData = async () => {
      if (!profile?.cliente_id || profile?.role !== 'cliente') {
        setClienteData(null);
        return;
      }

      const { data, error } = await supabase
        .from('clientes')
        .select('empresa, nome_contato, logo_urls, painel_cor')
        .eq('id', profile.cliente_id)
        .maybeSingle();

      if (!error && data) {
        setClienteData(data);
        setPanelColor(normalizeHex(data.painel_cor));
      } else {
        setClienteData(null);
        setPanelColor(null);
      }
    };

    fetchClienteData();
  }, [profile?.cliente_id, profile?.role]);

  useEffect(() => {
    const onColor = (e) => {
      if (profile?.role !== 'cliente' || !profile?.cliente_id) return;
      setPanelColor(normalizeHex(e.detail?.color));
    };
    const onLogo = (e) => {
      if (profile?.role !== 'cliente' || !profile?.cliente_id) return;
      setClienteData((prev) => (prev ? { ...prev, logo_urls: e.detail?.logoUrls || [] } : prev));
    };
    window.addEventListener(CLIENT_PANEL_COLOR_EVENT, onColor);
    window.addEventListener(CLIENT_PANEL_LOGO_EVENT, onLogo);
    return () => {
      window.removeEventListener(CLIENT_PANEL_COLOR_EVENT, onColor);
      window.removeEventListener(CLIENT_PANEL_LOGO_EVENT, onLogo);
    };
  }, [profile?.role, profile?.cliente_id]);

  const panelVars = useMemo(() => buildClientPanelVars(panelColor), [panelColor]);

  // Calcular dados para exibição no header
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  const clienteNome = clienteData?.empresa || clienteData?.nome_contato || profile?.full_name || 'JB APEX';
  const clienteFoto = rewritePublicStorageUrl(clienteData?.logo_urls?.[0] || '') || null;
  const iniciais = clienteNome
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const displayName = isAdmin 
    ? 'JB APEX' 
    : (clienteData?.empresa || clienteData?.nome_contato || 'JB APEX');

  // Colapsar automaticamente a sidebar em CRM / Mini CRM / Atendimento (ícones como a faixa estreita)
  const path = location.pathname || '';
  const isCrmRoute =
    path.startsWith('/cliente/crm') ||
    path.startsWith('/client-area/crm') ||
    path.startsWith('/cliente/mini-crm') ||
    path.startsWith('/client-area/mini-crm');
  const isAtendimentoRoute =
    path.startsWith('/cliente/atendimento') || path.startsWith('/client-area/atendimento');
  const isIconSidebarRoute = isCrmRoute || isAtendimentoRoute;

  const isCalendarRoute = /^\/(cliente|client-area)\/calendario\/?$/.test(path);

  useEffect(() => {
    setIsSidebarCollapsed(isIconSidebarRoute);
  }, [path, isIconSidebarRoute]);

  useEffect(() => {
    if (!isCalendarRoute) return undefined;
    const root = document.documentElement;
    root.classList.add('planeje-scroll-locked');
    document.body.classList.add('planeje-scroll-locked');
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      mainRef.current.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
    return () => {
      root.classList.remove('planeje-scroll-locked');
      document.body.classList.remove('planeje-scroll-locked');
    };
  }, [isCalendarRoute]);

  return (
    <div
      className="planeje-app planeje-cliente-app flex flex-row overflow-hidden flex-1 min-h-0 w-full h-full"
      style={panelVars || undefined}
      data-client-color={panelVars ? 'custom' : undefined}
    >
      <SidebarCliente
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      <div className="planeje-main-column flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="planeje-workspace flex-1 min-h-0">
          {auth && profile && (
            <header
              className="md:hidden fixed top-0 left-0 right-0 z-50 border-b border-white/20"
              style={{ background: 'var(--jb-gradient)' }}
            >
              <div className="flex h-[5.5rem] flex-col justify-center px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="planeje-sidebar-logo h-11 w-11 shrink-0 overflow-hidden p-0 text-sm">
                      {clienteFoto ? (
                        <img src={clienteFoto} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>{iniciais}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold leading-none text-white">{displayName}</span>
                      <span className="mt-1 block text-xs font-medium text-white/80">Área do Cliente</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={reloadCurrentPage}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                    aria-label="Atualizar a página"
                    title="Atualizar a página"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                    aria-label="Sair do sistema"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </header>
          )}

          <main
            ref={mainRef}
            className={cn(
              'planeje-workspace-main',
              isIconSidebarRoute
                ? 'planeje-workspace-main--flush pt-24 md:pt-0 pb-20 md:pb-0'
                : 'planeje-workspace-main--scroll planeje-page-padding pt-28 md:pt-0 pb-20 md:pb-0',
              isCalendarRoute && 'planeje-workspace-main--locked'
            )}
            style={
              !isIconSidebarRoute
                ? { paddingBottom: 'max(5rem, calc(4rem + env(safe-area-inset-bottom, 0px)))' }
                : undefined
            }
          >
            <div
              className={
                isIconSidebarRoute ? 'flex min-h-0 flex-1 flex-col w-full' : 'max-w-7xl mx-auto w-full'
              }
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <BottomNavCliente />
    </div>
  );
});

MainLayoutCliente.displayName = 'MainLayoutCliente';

export default MainLayoutCliente;

