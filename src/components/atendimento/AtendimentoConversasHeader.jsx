import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bell, LayoutGrid, MessageSquare, MoreHorizontal, Settings, Smartphone, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  CONVERSAS_CANAIS_PATH,
  CONVERSAS_CONFIG_PATH,
  CONVERSAS_ENVIOS_PATH,
  CONVERSAS_LEMBRETES_PATH,
  canManageConversasConfig,
} from '@/lib/conversasRoutes';
import { useMyLembretesBadge } from '@/hooks/useMyLembretesBadge';

export default function AtendimentoConversasHeader({ totalUnread = 0 }) {
  const { profile } = useAuth();
  const showConfig = canManageConversasConfig(profile?.role);
  const lembretesCount = useMyLembretesBadge(profile?.id);
  return (
    <header className="wa-page-header shrink-0">
      <div className="wa-page-header-brand">
        <div className="wa-page-header-icon">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="wa-page-header-title">Conversas</h1>
          <p className="wa-page-header-sub">
            {totalUnread > 0 ? `${totalUnread} não lida${totalUnread !== 1 ? 's' : ''}` : 'WhatsApp da operação'}
          </p>
        </div>
      </div>
      <div className="wa-page-header-actions">
        <Button variant="outline" size="sm" className="wa-header-btn hidden md:inline-flex" asChild>
          <Link to={CONVERSAS_CANAIS_PATH}>
            <Smartphone className="h-4 w-4 mr-1.5" />
            Conectar número
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="wa-header-btn hidden sm:inline-flex relative" asChild>
          <Link to={CONVERSAS_LEMBRETES_PATH}>
            <Bell className="h-4 w-4 mr-1.5" />
            Lembretes
            {lembretesCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--wa-brand)] px-1.5 text-[10px] font-semibold text-white">
                {lembretesCount > 99 ? '99+' : lembretesCount}
              </span>
            )}
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="wa-header-btn hidden sm:inline-flex" asChild>
          <Link to={CONVERSAS_ENVIOS_PATH}>
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Envios
          </Link>
        </Button>
        {showConfig && (
          <Button variant="ghost" size="icon" className="h-9 w-9" asChild title="Configuração">
            <Link to={CONVERSAS_CONFIG_PATH}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais opções">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild className="md:hidden">
              <Link to={CONVERSAS_CANAIS_PATH}>
                <Smartphone className="h-4 w-4 mr-2" />
                Conectar número
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="md:hidden" />
            <DropdownMenuItem asChild className="sm:hidden">
              <Link to={CONVERSAS_ENVIOS_PATH}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Relatório de envios
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem asChild className="sm:hidden">
              <Link to={CONVERSAS_LEMBRETES_PATH}>
                <Bell className="h-4 w-4 mr-2" />
                Meus lembretes
                {lembretesCount > 0 ? ` (${lembretesCount})` : ''}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem asChild>
              <Link to="/crm/contatos">
                <LayoutGrid className="h-4 w-4 mr-2" />
                Contatos CRM
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/crm/leads">
                <TrendingUp className="h-4 w-4 mr-2" />
                Funil de vendas
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
