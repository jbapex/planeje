import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, Activity, ClipboardList, TrendingUp, MoreHorizontal } from 'lucide-react';
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
  const { profile } = useAuth();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

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
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-t-lg z-50"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="grid h-16 max-w-lg grid-cols-5 mx-auto font-medium">
        {/* Primeiros 4 itens principais */}
        {mainItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <motion.button
              key={item.key}
              onClick={() => handleNavigate(item)}
              disabled={item.disabled}
              whileTap={{ scale: 0.95 }}
              className={`
                relative inline-flex flex-col items-center justify-center px-2 
                hover:bg-gray-50 dark:hover:bg-gray-800 group
                transition-colors duration-200
                ${isActive 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : 'text-gray-500 dark:text-gray-400'
                }
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400 to-purple-600"
                  layoutId="activeTab"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
        
        {/* Botão "Ver mais" com dropdown */}
        {moreItems.length > 0 && (
          <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex flex-col items-center justify-center px-2 hover:bg-gray-50 dark:hover:bg-gray-800 group text-gray-500 dark:text-gray-400">
                <MoreHorizontal className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">Mais</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side="top" 
              align="end"
              className="mb-2 w-56 max-h-[60vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700"
            >
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                
                return (
                  <DropdownMenuItem
                    key={item.key}
                    onClick={() => handleNavigate(item)}
                    disabled={item.disabled}
                    className={`
                      flex items-center gap-3 cursor-pointer
                      ${isActive ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : ''}
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
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
