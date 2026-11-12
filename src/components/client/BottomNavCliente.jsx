import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Activity, ClipboardList, TrendingUp, MoreHorizontal, BarChart3, Table2, CalendarDays, Headphones, User, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { clientHasPageAccess } from '@/lib/clientAllowedPages';

// Função para determinar o prefixo da rota baseado no perfil
const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) {
    return '/cliente';
  }
  return '/client-area';
};

// Função para verificar se o usuário tem acesso a uma página
const hasPageAccess = (profile, pageKey) => clientHasPageAccess(profile, pageKey);

const getMenuItems = (profile, atendimentoNivel) => {
  const prefix = getRoutePrefix(profile);
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  const showAtendimento = Boolean(atendimentoNivel);

  const items = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      path: `${prefix}/support`,
      icon: LayoutDashboard,
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

  items.splice(items.findIndex((item) => item.key === 'crm'), 0, {
    key: 'mini-crm',
    label: 'Mini CRM',
    path: `${prefix}/mini-crm`,
    icon: Table2,
    always: true,
  });

  items.splice(items.findIndex((item) => item.key === 'crm'), 0, {
    key: 'calendario',
    label: 'Calendário',
    path: `${prefix}/calendario`,
    icon: CalendarDays,
    always: true,
  });

  if (showAtendimento) {
    items.splice(items.findIndex((item) => item.key === 'crm'), 0, {
      key: 'atendimento',
      label: 'Atendimento',
      path: `${prefix}/atendimento`,
      icon: Headphones,
      always: true,
      previewOnly: true,
    });
  }

  // Filtrar itens baseado nas permissões do usuário
  return items.filter(item => {
    // Se estiver desabilitado por outro motivo (ex: ApexIA para não-clientes), manter na lista mas desabilitado
    if (item.disabled) {
      return true;
    }
    if (item.always) return true;
    // Verificar permissão de acesso à página
    return hasPageAccess(profile, item.key);
  });
};

const BottomNavCliente = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { profile, user } = auth || {};
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const atendimento = useAtendimentoLojaMembro();

  // Se não houver profile, não renderizar o componente
  if (!auth || !profile) {
    return null;
  }

  const menuItems = getMenuItems(profile, atendimento.nivel);
  const visibleItems = menuItems.filter(item => !item.disabled);
  const prefix = profile?.role === 'cliente' && profile?.cliente_id ? '/cliente' : '/client-area';
  const isTeam = ['superadmin', 'admin', 'colaborador'].includes(profile?.role) && !profile?.cliente_id;
  const lojaMembroRestrito = atendimento.gate && atendimento.nivel && atendimento.nivel !== 'admin';
  const tailItems = [];
  if (profile?.role === 'cliente' && !lojaMembroRestrito) {
    tailItems.push({ key: 'cadastros', label: 'Meus Dados', path: `${prefix}/cadastros`, icon: User });
  }
  if (isTeam) {
    tailItems.push({ key: 'voltar', label: 'Voltar ao Planeje', path: '/tasks/list', icon: ArrowLeft });
  }

  const mainItems = visibleItems.slice(0, 4);
  const moreItems = [...visibleItems, ...tailItems];

  const handleNavigate = (item) => {
    if (item.disabled) return;
    navigate(item.path);
    setIsMoreMenuOpen(false);
  };

  return (
    <div
      className="planeje-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid h-16 max-w-lg grid-cols-5 mx-auto font-medium">
        {mainItems.map((item) => {
          const isActive =
            item.key === 'apexia'
              ? location.pathname.startsWith(item.path) || location.pathname.startsWith('/chat/')
              : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const isApexIA = item.key === 'apexia';

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavigate(item)}
              disabled={item.disabled}
              className={cn(
                'planeje-bottom-nav-link relative inline-flex flex-col items-center justify-center px-2 transition-all duration-200',
                isActive && 'is-active',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Icon
                className={cn(
                  'planeje-bottom-nav-icon w-5 h-5',
                  isApexIA && !isActive && 'text-sky-500'
                )}
                strokeWidth={2}
              />
              <span
                className={cn(
                  'planeje-bottom-nav-label text-[10px] mt-1',
                  isApexIA && !isActive && 'text-sky-500'
                )}
              >
                {item.label}
              </span>
              {isActive && <span className="planeje-bottom-nav-indicator" aria-hidden />}
            </button>
          );
        })}
        
        <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="planeje-bottom-nav-link relative inline-flex flex-col items-center justify-center px-2 transition-all duration-200"
              >
                <MoreHorizontal className="planeje-bottom-nav-icon w-5 h-5" strokeWidth={2} />
                <span className="planeje-bottom-nav-label text-[10px] mt-1">Mais</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="mb-3 w-56 max-h-[70vh] overflow-y-auto">
              <DropdownMenuItem
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  reloadCurrentPage();
                }}
                className="flex items-center gap-3 cursor-pointer rounded-xl mx-1 my-0.5 font-semibold"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Atualizar</span>
              </DropdownMenuItem>
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.key === 'apexia'
                    ? location.pathname.startsWith(item.path) || location.pathname.startsWith('/chat/')
                    : location.pathname.startsWith(item.path);
                const isApexIA = item.key === 'apexia';

                return (
                  <DropdownMenuItem
                    key={item.key}
                    onClick={() => handleNavigate(item)}
                    disabled={item.disabled}
                    className={cn(
                      'flex items-center gap-3 cursor-pointer rounded-xl mx-1 my-0.5',
                      isActive && 'bg-primary/10 text-primary font-semibold',
                      isApexIA && !isActive && 'text-sky-600'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
    </div>
  );
};

export default BottomNavCliente;
