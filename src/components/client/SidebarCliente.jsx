import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, Activity, LogOut, User, Info, TrendingUp, ArrowLeft, ClipboardList, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { TooltipCustom } from '@/components/ui/tooltip-custom';

// Função para determinar o prefixo da rota baseado no perfil
const getRoutePrefix = (profile) => {
  // Se for cliente, usa /cliente
  if (profile?.role === 'cliente' && profile?.cliente_id) {
    return '/cliente';
  }
  // Se for admin/colaborador, usa /client-area
  return '/client-area';
};

// Função para verificar se o usuário tem acesso a uma página
const hasPageAccess = (profile, pageKey) => {
  // Se não for cliente, permite acesso a todas as páginas
  if (profile?.role !== 'cliente' || !profile?.cliente_id) {
    return true;
  }

  // Se allowed_pages é null ou undefined, permite acesso a todas as páginas
  const allowedPages = profile?.allowed_pages;
  if (allowedPages === null || allowedPages === undefined) {
    return true;
  }

  // Se for array, verifica se a página está no array
  if (Array.isArray(allowedPages)) {
    return allowedPages.includes(pageKey);
  }

  // Por padrão, permite acesso
  return true;
};

const getMenuItems = (profile) => {
  const prefix = getRoutePrefix(profile);
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  
  const items = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      path: `${prefix}/support`,
      icon: LayoutDashboard,
    },
    {
      key: 'trafego',
      label: 'Cadastro Diário',
      path: `${prefix}/trafego`,
      icon: FileText,
    },
    {
      key: 'campaigns-status',
      label: 'Status das Campanhas',
      path: `${prefix}/campaigns-status`,
      icon: ClipboardList,
    },
    {
      key: 'apexia',
      label: 'ApexIA',
      path: '/apexia',
      icon: MessageSquare,
      disabled: profile?.role !== 'cliente', // ApexIA só para clientes
    },
    {
      key: 'pgm-panel',
      label: 'Painel PGM',
      path: `${prefix}/pgm-panel`,
      icon: Activity,
    },
    {
      key: 'crm',
      label: isAdmin ? 'Contatos' : 'CRM',
      path: isAdmin ? `${prefix}/crm/contatos` : `${prefix}/crm`,
      icon: BarChart3,
    },
  ];

  // Adicionar Tráfego Semanal apenas para administradores
  if (isAdmin) {
    items.splice(2, 0, {
      key: 'traffic-weekly',
      label: 'Tráfego Semanal',
      path: `${prefix}/traffic-weekly`,
      icon: TrendingUp,
    });
  }

  // Filtrar itens baseado nas permissões do usuário
  return items.filter(item => {
    // Se estiver desabilitado por outro motivo (ex: ApexIA para não-clientes), manter na lista mas desabilitado
    if (item.disabled) {
      return true;
    }
    // Verificar permissão de acesso à página
    return hasPageAccess(profile, item.key);
  });
};

const SidebarCliente = ({ collapsed = false, onToggleCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { profile, signOut } = auth || {};
  const [clienteData, setClienteData] = useState(null);
  const [showQuemSomos, setShowQuemSomos] = useState(false);
  const [companyInfo, setCompanyInfo] = useState('');

  // Se não houver profile, não renderizar o componente
  if (!auth || !profile) {
    return null;
  }

  useEffect(() => {
    const fetchClienteData = async () => {
      // Se for admin/colaborador, não buscar dados de cliente específico
      if (profile?.role !== 'cliente' || !profile?.cliente_id) {
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

  // Buscar informações sobre a JB APEX
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      const { data, error } = await supabase
        .from('public_config')
        .select('value')
        .eq('key', 'company_info_for_ai')
        .maybeSingle();

      if (!error && data?.value) {
        setCompanyInfo(data.value);
      }
    };

    fetchCompanyInfo();
  }, []);

  const [clickedApexIA, setClickedApexIA] = useState(false);

  const handleNavigate = (item) => {
    if (item.disabled) return;
    
    // Animação especial para ApexIA
    if (item.key === 'apexia') {
      setClickedApexIA(true);
      // Adicionar delay para ver a animação antes de navegar
      setTimeout(() => {
        navigate(item.path, { state: { fromClientArea: true } });
        // Resetar após navegação
        setTimeout(() => setClickedApexIA(false), 300);
      }, 200);
    } else {
      navigate(item.path);
    }
  };

  // Verificar se é administrador acessando a área do cliente
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
  
  // Nome a ser exibido no header
  const displayName = isAdmin 
    ? 'JB APEX' 
    : (clienteData?.empresa || clienteData?.nome_contato || 'JB APEX');

  return (
    <aside className={`hidden md:flex flex-col border-r border-white/5 flex-shrink-0 h-screen overflow-hidden md:block bg-[#0f172a] relative font-sans ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Botão de recolher/expandir sidebar (usado no CRM) */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute -right-3 top-24 z-20 h-8 w-8 rounded-full bg-[#0f172a] border border-white/10 flex items-center justify-center text-slate-300 hover:bg-slate-900 hover:text-white transition-colors shadow-lg"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}
      {/* Background Image Celestial */}
      <div 
        className="absolute inset-0 opacity-80 pointer-events-none bg-cover bg-center" 
        style={{ backgroundImage: "url('/sidebar-bg.png')" }} 
      />
      
      {/* Overlay para profundidade e legibilidade */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-[#0f172a]/80 pointer-events-none" />
      
      <div className={`h-24 flex flex-col justify-center px-6 flex-shrink-0 relative z-10 ${collapsed ? 'items-center px-3' : ''}`}>
        <div className="flex items-center gap-3">
          {clienteFoto ? (
            <Avatar className="h-11 w-11 border-2 border-white/20 shadow-xl">
              <AvatarImage src={clienteFoto} alt={clienteNome} />
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-400 text-white font-bold text-sm">
                {iniciais}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-11 w-11 bg-gradient-to-br from-blue-600 to-blue-400 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40 border border-white/10">
              <span className="text-white font-bold text-sm">{iniciais}</span>
            </div>
          )}
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xl font-bold text-white tracking-tight leading-none truncate">
                {displayName}
              </span>
              <span className="text-xs text-slate-300/80 mt-1 font-medium tracking-wide">
                Área do Cliente
              </span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 min-h-0 custom-scrollbar relative z-10">
        <ul className={`space-y-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          {getMenuItems(profile).map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            const isApexIA = item.key === 'apexia';

            return (
              <li key={item.key}>
                <TooltipCustom content={item.label} side="right" className="md:hidden lg:block" triggerClassName="w-full">
                  <motion.button
                    type="button"
                    onClick={() => handleNavigate(item)}
                  disabled={item.disabled}
                  whileTap={isApexIA ? { scale: 0.95 } : { scale: 0.98 }}
                  animate={clickedApexIA && isApexIA ? {
                    scale: [1, 1.05, 1],
                    boxShadow: [
                      '0 0 0px rgba(59, 130, 246, 0)',
                      '0 0 20px rgba(59, 130, 246, 0.4)',
                      '0 0 0px rgba(59, 130, 246, 0)'
                    ]
                  } : {}}
                  transition={{ duration: 0.2 }}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all duration-300 relative group',
                      isActive
                        ? 'bg-blue-600 text-white shadow-md font-semibold'
                        : isApexIA
                        ? 'bg-white/5 border-2 border-orange-400/60 text-orange-400 hover:bg-white/10 hover:text-orange-300 hover:border-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.3)]'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white',
                      item.disabled ? 'opacity-50 cursor-not-allowed' : '',
                      collapsed ? 'justify-center px-2' : '',
                    ].join(' ')}
                >
                  <motion.div
                    animate={clickedApexIA && isApexIA ? {
                      rotate: [0, 15, -15, 0],
                      scale: [1, 1.2, 1]
                    } : {}}
                    transition={{ duration: 0.3 }}
                    className="relative z-10"
                  >
                    <Icon className={[
                      'h-5 w-5',
                      isActive ? 'text-white' : (isApexIA ? 'text-orange-400' : 'text-slate-300 group-hover:text-white')
                    ].join(' ')} />
                  </motion.div>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left tracking-wide relative z-10">{item.label}</span>
                      {isApexIA && !isActive && (
                        <motion.span 
                          className="inline-flex items-center rounded-full bg-orange-500/10 text-orange-500 text-[10px] font-bold px-1.5 py-0.5 border border-orange-500/20 relative z-10"
                          animate={clickedApexIA ? {
                            scale: [1, 1.3, 1],
                            opacity: [1, 0.8, 1]
                          } : {
                            scale: 1,
                            opacity: 1
                          }}
                          transition={{ duration: 0.3 }}
                        >
                          AI
                        </motion.span>
                      )}
                    </>
                  )}
                  {isActive && (
                    <motion.div 
                      layoutId="activeGlow"
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      aria-hidden
                    />
                  )}
                </motion.button>
              </TooltipCustom>
            </li>
            );
          })}
        </ul>
      </nav>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
        .custom-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      {/* Rodapé com botões inferiores */}
      <div className={`mt-auto border-t border-white/5 flex-shrink-0 relative z-10 bg-gradient-to-t from-[#0f172a]/80 to-transparent ${collapsed ? 'p-3 space-y-2' : 'p-6 space-y-4'}`}>
        {/* Mostrar "Meus Dados" e "Quem Somos" apenas para clientes */}
        {!isAdmin && (
          <>
            <TooltipCustom content="Gerenciar meus dados e configurações" side="right" triggerClassName="w-full">
              <button
                type="button"
                onClick={() => navigate('/cliente/cadastros')}
                className={`flex w-full items-center text-sm text-slate-300 hover:text-white transition-all duration-200 group ${collapsed ? 'justify-center px-2 py-2 rounded-xl' : 'gap-3'}`}
              >
                <User className="h-5 w-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
                {!collapsed && <span className="tracking-wide">Meus Dados</span>}
              </button>
            </TooltipCustom>

            <TooltipCustom content="Conheça mais sobre a JB APEX" side="right" triggerClassName="w-full">
              <button
                type="button"
                onClick={() => setShowQuemSomos(true)}
                className={`flex w-full items-center text-sm text-slate-300 hover:text-white transition-all duration-200 group ${collapsed ? 'justify-center px-2 py-2 rounded-xl' : 'gap-3'}`}
              >
                <Info className="h-5 w-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
                {!collapsed && <span className="tracking-wide">Quem Somos</span>}
              </button>
            </TooltipCustom>
          </>
        )}

        {isAdmin ? (
          <TooltipCustom content="Retornar ao painel administrativo" side="right" triggerClassName="w-full">
            <button
              type="button"
              onClick={() => navigate('/tasks/list')}
              className={`flex w-full items-center text-sm text-blue-400 hover:text-white transition-all duration-200 ${collapsed ? 'justify-center px-2 py-2 rounded-xl' : 'gap-3'}`}
            >
              <ArrowLeft className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="tracking-wide font-medium">Voltar ao Planeje</span>}
            </button>
          </TooltipCustom>
        ) : (
          <TooltipCustom content="Encerrar sessão" side="right" triggerClassName="w-full">
            <button
              type="button"
              onClick={signOut}
              className={`flex w-full items-center text-sm text-slate-400 hover:text-rose-400 transition-all duration-200 group ${collapsed ? 'justify-center px-2 py-2 rounded-xl' : 'gap-3'} pt-4 border-t border-white/5`}
            >
              <LogOut className="h-5 w-5 text-slate-500 group-hover:text-rose-400 transition-colors shrink-0" />
              {!collapsed && <span className="tracking-wide">Sair</span>}
            </button>
          </TooltipCustom>
        )}
      </div>

      {/* Dialog Quem Somos */}
      <Dialog open={showQuemSomos} onOpenChange={setShowQuemSomos}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Quem Somos - JB APEX</DialogTitle>
            <DialogDescription>
              Informações sobre a JB APEX e nossos serviços
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {companyInfo ? (
              <div className="prose dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {companyInfo}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Informações sobre a JB APEX serão exibidas aqui.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default SidebarCliente;

