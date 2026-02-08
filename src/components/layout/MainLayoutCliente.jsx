import React, { memo, useRef, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SidebarCliente from '@/components/client/SidebarCliente';
import BottomNavCliente from '@/components/client/BottomNavCliente';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut } from 'lucide-react';

const MainLayoutCliente = memo(() => {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollPositions = useRef(new Map());
  const auth = useAuth();
  const { profile, signOut } = auth || {};
  const [clienteData, setClienteData] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
        .select('empresa, nome_contato, logo_urls')
        .eq('id', profile.cliente_id)
        .maybeSingle();

      if (!error && data) {
        setClienteData(data);
      } else {
        setClienteData(null);
      }
    };

    fetchClienteData();
  }, [profile?.cliente_id, profile?.role]);

  // Calcular dados para exibição no header
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  const clienteNome = clienteData?.empresa || clienteData?.nome_contato || profile?.full_name || 'JB APEX';
  const clienteFoto = clienteData?.logo_urls && clienteData.logo_urls.length > 0 
    ? clienteData.logo_urls[0] 
    : null;
  const iniciais = clienteNome
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const displayName = isAdmin 
    ? 'JB APEX' 
    : (clienteData?.empresa || clienteData?.nome_contato || 'JB APEX');

  // Colapsar automaticamente a sidebar quando estiver na rota de CRM
  const path = location.pathname || '';
  const isCrmRoute = path.startsWith('/cliente/crm') || path.startsWith('/client-area/crm');

  useEffect(() => {
    setIsSidebarCollapsed(isCrmRoute);
  }, [path]);

  return (
    <div className="h-screen flex overflow-hidden bg-[#f8fafc]">
      <SidebarCliente
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed(prev => !prev)}
      />
      
      {/* Header Mobile Fixo */}
      {auth && profile && (
        <header className="md:hidden fixed top-0 left-0 right-0 h-24 bg-[#0f172a] z-50 border-b border-white/5">
          {/* Background Image Celestial */}
          <div 
            className="absolute inset-0 opacity-80 pointer-events-none bg-cover bg-center" 
            style={{ backgroundImage: "url('/sidebar-bg.png')" }} 
          />
          
          {/* Overlay para profundidade e legibilidade */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-[#0f172a]/80 pointer-events-none" />
          
          <div className="h-24 flex flex-col justify-center px-6 relative z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {clienteFoto ? (
                  <Avatar className="h-11 w-11 border-2 border-white/20 shadow-xl flex-shrink-0">
                    <AvatarImage src={clienteFoto} alt={clienteNome} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-400 text-white font-bold text-sm">
                      {iniciais}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-11 w-11 bg-gradient-to-br from-blue-600 to-blue-400 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40 border border-white/10 flex-shrink-0">
                    <span className="text-white font-bold text-sm">{iniciais}</span>
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xl font-bold text-white tracking-tight leading-none truncate">
                    {displayName}
                  </span>
                  <span className="text-xs text-slate-300/80 mt-1 font-medium tracking-wide">
                    Área do Cliente
                  </span>
                </div>
              </div>
              <button
                onClick={signOut}
                className="h-10 w-10 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors duration-200 flex-shrink-0"
                aria-label="Sair do sistema"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main
          ref={mainRef}
          className={`flex-1 flex flex-col min-h-0 overflow-hidden ${isCrmRoute ? 'pt-24 md:pt-2 sm:pt-4 md:py-4 pb-20 md:pb-4' : 'overflow-y-auto px-3 sm:px-4 md:px-8 pt-28 md:pt-4 sm:pt-6 md:py-8 pb-20 md:pb-6'}`}
          style={!isCrmRoute ? { paddingBottom: 'max(5rem, calc(4rem + env(safe-area-inset-bottom, 0px)))' } : undefined}
        >
          <div className={isCrmRoute ? 'flex-1 flex flex-col min-h-0 w-full' : 'max-w-7xl mx-auto'}>
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNavCliente />
    </div>
  );
});

MainLayoutCliente.displayName = 'MainLayoutCliente';

export default MainLayoutCliente;

