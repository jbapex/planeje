import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, Activity, ClipboardList, TrendingUp, MoreHorizontal, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion } from 'framer-motion';

// Função para determinar o prefixo da rota baseado no perfil
const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) {
    return '/cliente';
  }
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
      label: 'Cadastro',
      path: `${prefix}/trafego`,
      icon: FileText,
    },
    {
      key: 'campaigns-status',
      label: 'Status',
      path: `${prefix}/campaigns-status`,
      icon: ClipboardList,
    },
    {
      key: 'apexia',
      label: 'ApexIA',
      path: '/apexia',
      icon: MessageSquare,
      disabled: profile?.role !== 'cliente',
    },
    {
      key: 'pgm-panel',
      label: 'PGM',
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
    items.splice(3, 0, {
      key: 'traffic-weekly',
      label: 'Tráfego',
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

const BottomNavCliente = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { profile } = auth || {};
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Se não houver profile, não renderizar o componente
  if (!auth || !profile) {
    return null;
  }

  const menuItems = getMenuItems(profile);
  const visibleItems = menuItems.filter(item => !item.disabled);
  
  // Primeiros 4 itens principais
  const mainItems = visibleItems.slice(0, 4);
  // Restante dos itens para o menu "Ver mais"
  const moreItems = visibleItems.slice(4);

  const handleNavigate = (item) => {
    if (item.disabled) return;
    navigate(item.path);
    setIsMoreMenuOpen(false);
  };

  return (
    <div 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-50"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="grid h-20 max-w-lg grid-cols-5 mx-auto font-medium">
        {/* Primeiros 4 itens principais */}
        {mainItems.map((item) => {
          // Para ApexIA, também considerar rotas /chat/ como ativas
          const isActive = item.key === 'apexia' 
            ? (location.pathname.startsWith(item.path) || location.pathname.startsWith('/chat/'))
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const isApexIA = item.key === 'apexia';

          return (
            <motion.button
              key={item.key}
              onClick={() => handleNavigate(item)}
              disabled={item.disabled}
              whileTap={{ scale: 0.92 }}
              className={`
                relative inline-flex flex-col items-center justify-center px-2 py-2
                group transition-all duration-300
                ${isActive 
                  ? 'text-blue-600' 
                  : isApexIA
                  ? 'text-orange-500'
                  : 'text-slate-500 hover:text-slate-700'
                }
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div className={`
                relative p-2 rounded-xl transition-all duration-300
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : isApexIA
                  ? 'bg-orange-50/80 border-2 border-orange-400/60 shadow-[0_0_8px_rgba(251,146,60,0.25)]'
                  : 'group-hover:bg-slate-50'
                }
              `}>
                <Icon className={`
                  w-5 h-5 transition-all duration-300
                  ${isActive ? 'scale-110 text-white' : isApexIA && !isActive ? 'scale-105' : ''}
                `} />
                {isActive && (
                  <motion.div
                    className="absolute -top-1 -right-1 h-2 w-2 bg-white rounded-full"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  />
                )}
                {isApexIA && !isActive && (
                  <motion.div
                    className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  />
                )}
              </div>
              <span className={`
                text-[10px] font-semibold mt-1 transition-colors duration-300
                ${isActive 
                  ? 'text-blue-600' 
                  : isApexIA 
                  ? 'text-orange-500' 
                  : 'text-slate-500'
                }
              `}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-t-full"
                  layoutId="activeIndicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              {isApexIA && !isActive && (
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-orange-400 rounded-t-full opacity-60"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              )}
            </motion.button>
          );
        })}
        
        {/* Botão "Ver mais" com dropdown */}
        {moreItems.length > 0 && (
          <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
            <DropdownMenuTrigger asChild>
              <motion.button 
                whileTap={{ scale: 0.92 }}
                className="inline-flex flex-col items-center justify-center px-2 py-2 group text-slate-500 hover:text-slate-700 transition-colors duration-300"
              >
                <div className="relative p-2 rounded-xl group-hover:bg-slate-50 transition-all duration-300">
                  <MoreHorizontal className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-semibold mt-1">Mais</span>
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side="top" 
              align="end"
              className="mb-3 w-56 max-h-[60vh] overflow-y-auto bg-white/95 backdrop-blur-lg border border-slate-200/80 shadow-xl rounded-2xl"
            >
              {moreItems.map((item) => {
                const Icon = item.icon;
                // Para ApexIA, também considerar rotas /chat/ como ativas
                const isActive = item.key === 'apexia' 
                  ? (location.pathname.startsWith(item.path) || location.pathname.startsWith('/chat/'))
                  : location.pathname.startsWith(item.path);
                const isApexIA = item.key === 'apexia';
                
                return (
                  <DropdownMenuItem
                    key={item.key}
                    onClick={() => handleNavigate(item)}
                    disabled={item.disabled}
                    className={`
                      flex items-center gap-3 cursor-pointer rounded-xl mx-1 my-0.5
                      ${isActive 
                        ? 'bg-blue-600 text-white font-semibold' 
                        : isApexIA
                        ? 'bg-orange-50/80 border border-orange-400/40 text-orange-600 hover:bg-orange-100/80'
                        : 'hover:bg-slate-50 text-slate-700'
                      }
                      transition-colors duration-200
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                    {isApexIA && !isActive && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-orange-500/10 text-orange-500 text-[9px] font-bold px-1.5 py-0.5 border border-orange-500/20">
                        AI
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default BottomNavCliente;
