import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Filter,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Smartphone,
  TrendingUp,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AUDIENCE_FILTER_OPTIONS } from '@/lib/atendimentoAudienceFilter';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMyLembretesBadge } from '@/hooks/useMyLembretesBadge';
import {
  CONVERSAS_CANAIS_PATH,
  CONVERSAS_CONFIG_PATH,
  CONVERSAS_ENVIOS_PATH,
  CONVERSAS_LEMBRETES_PATH,
  canManageConversasConfig,
} from '@/lib/conversasRoutes';

export default function AtendimentoListToolbar({
  statusTab,
  onStatusTabChange,
  statusTabs,
  counts,
  audienceFilter,
  onAudienceFilterChange,
  audienceCounts,
  search,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
  channels,
  filaFilter,
  onFilaFilterChange,
  filas,
  onlyMine,
  onOnlyMineChange,
  overdueCount = 0,
  onNewConversation,
  canStartConversation = true,
}) {
  const { profile } = useAuth();
  const showConfig = canManageConversasConfig(profile?.role);
  const lembretesCount = useMyLembretesBadge(profile?.id);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasAdvancedFilters = channelFilter !== 'all' || filaFilter !== 'all' || onlyMine;

  return (
    <div className="wa-list-toolbar shrink-0">
      <header className="wa-list-head">
        <h1>Conversas</h1>
        <div className="wa-list-tools">
          {overdueCount > 0 && (
            <span className="wa-sla-chip" title={`${overdueCount} com SLA estourado`}>
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {overdueCount}
            </span>
          )}
          <button
            type="button"
            className={cn('wa-list-tool', (filtersOpen || hasAdvancedFilters) && 'is-on')}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Filtros"
            aria-label="Filtros"
            aria-pressed={filtersOpen}
          >
            <Filter className="h-4 w-4" />
          </button>
          <Link
            to={CONVERSAS_LEMBRETES_PATH}
            className="wa-list-tool"
            title="Lembretes"
            aria-label={lembretesCount > 0 ? `Lembretes, ${lembretesCount}` : 'Lembretes'}
          >
            <Bell className="h-4 w-4" />
            {lembretesCount > 0 && (
              <em>{lembretesCount > 99 ? '99+' : lembretesCount}</em>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="wa-list-tool" title="Mais" aria-label="Mais opções">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to={CONVERSAS_CANAIS_PATH}>
                  <Smartphone className="h-4 w-4 mr-2" />
                  Conectar número
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={CONVERSAS_ENVIOS_PATH}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Envios
                </Link>
              </DropdownMenuItem>
              {showConfig && (
                <DropdownMenuItem asChild>
                  <Link to={CONVERSAS_CONFIG_PATH}>
                    <Settings className="h-4 w-4 mr-2" />
                    Configuração
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
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
          {onNewConversation && (
            <button
              type="button"
              className="wa-list-tool wa-list-add"
              onClick={onNewConversation}
              disabled={!canStartConversation}
              title={canStartConversation ? 'Nova conversa' : 'Configure um canal WhatsApp'}
              aria-label="Nova conversa"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <label className="wa-list-search">
        <Search className="wa-list-search-icon" aria-hidden />
        <Input
          placeholder="Buscar nome ou mensagem…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="wa-list-search-input"
        />
      </label>

      <div className="wa-status-pills" role="tablist" aria-label="Caixas">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={statusTab === tab.value}
            onClick={() => onStatusTabChange(tab.value)}
            className={cn('wa-status-pill', statusTab === tab.value && 'is-active')}
          >
            {tab.label}
            <span className="wa-status-pill-count">{counts[tab.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="wa-audience-filter" role="tablist" aria-label="Público">
        {AUDIENCE_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onAudienceFilterChange(opt.value)}
            className={cn('wa-audience-filter-btn', audienceFilter === opt.value && 'is-active')}
          >
            {opt.label}
            <span className="wa-audience-filter-count">{audienceCounts[opt.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtersOpen && (
        <div className="wa-advanced-filters">
          {channels.length > 1 && (
            <Select value={channelFilter} onValueChange={onChannelFilterChange}>
              <SelectTrigger className="h-9 bg-white dark:bg-[#2a3942]">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name || ch.subdomain || ch.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filas.length > 1 && (
            <Select value={filaFilter} onValueChange={onFilaFilterChange}>
              <SelectTrigger className="h-9 bg-white dark:bg-[#2a3942]">
                <SelectValue placeholder="Fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                {filas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant={onlyMine ? 'default' : 'outline'}
            size="sm"
            className={cn('h-9', onlyMine && 'wa-chrome-btn')}
            onClick={() => onOnlyMineChange(!onlyMine)}
          >
            <User className="h-4 w-4 mr-1.5" />
            Só minhas
          </Button>
        </div>
      )}
    </div>
  );
}
