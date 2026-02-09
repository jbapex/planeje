import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, BarChart3, Settings, Radio, Inbox, MessageSquare, Bot, Users, Link2, Zap, Star, Bell, RefreshCw, HelpCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useCrmRefresh } from '@/contexts/CrmRefreshContext';

const CRM_TAB_LEADS = 'leads';
const CRM_TAB_VISAO_GERAL = 'visao-geral';
const CRM_TAB_CONTATOS = 'contatos';
const CRM_TAB_AJUSTES_FUNIL = 'ajustes-funil';
const CRM_TAB_AJUSTES_USUARIOS = 'ajustes-usuarios';
const CRM_TAB_API = 'api';
const CRM_TAB_APICEBOT = 'apicebot';
const CRM_TAB_AUTOMACOES = 'automacoes';
const CRM_TAB_CANAIS = 'canais';
const HIDE_INBOX_AND_WHATSAPP_TABS = true;

function getActiveTabFromPath(pathname) {
  const base = pathname.startsWith('/client-area') ? '/client-area/crm' : '/cliente/crm';
  const rest = pathname.replace(new RegExp(`^${base}/?`), '') || '';
  if (rest.startsWith('leads/') || rest === 'leads') return CRM_TAB_LEADS;
  const first = rest.split('/')[0];
  return first || CRM_TAB_LEADS;
}

export default function CrmHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useCrmRefresh() || {};
  const basePath = location.pathname.startsWith('/client-area') ? '/client-area' : '/cliente';
  const activeTab = getActiveTabFromPath(location.pathname);

  const navigateTo = (tab) => {
    navigate(`${basePath}/crm/${tab}`, { replace: true });
  };

  return (
    <header
      className="sticky top-0 z-20 shrink-0 flex items-center gap-6 w-full min-w-0 py-4 bg-white dark:bg-card border-b border-gray-200/80 dark:border-gray-800 shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.35)] px-4 sm:px-6 md:px-8"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <span className="font-semibold text-base text-foreground hidden sm:inline">CRM</span>
      </div>
      <nav className="flex flex-1 min-w-0 h-auto gap-2 flex-wrap justify-center sm:justify-start items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Leads – Funil e Contatos"
              className={cn(
                'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
                (activeTab === CRM_TAB_LEADS || activeTab === CRM_TAB_CONTATOS)
                  ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
              )}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span>Leads</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="min-w-[11rem] rounded-xl bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2),0_10px_20px_-2px_rgba(0,0,0,0.35)] py-2">
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_LEADS)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_LEADS ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <LayoutGrid className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_LEADS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Funil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_CONTATOS)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_CONTATOS ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <Users className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_CONTATOS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Contatos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => navigateTo(CRM_TAB_VISAO_GERAL)}
          className={cn(
            'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
            activeTab === CRM_TAB_VISAO_GERAL ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
          )}
          title="Métricas e resumo do funil"
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Visão geral</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Ajustes – Funil, Usuários, API e Apicebot"
              className={cn(
                'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
                [CRM_TAB_AJUSTES_FUNIL, CRM_TAB_AJUSTES_USUARIOS, CRM_TAB_API, CRM_TAB_APICEBOT, CRM_TAB_AUTOMACOES].includes(activeTab)
                  ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Ajustes</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="min-w-[11rem] rounded-xl bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2),0_10px_20px_-2px_rgba(0,0,0,0.35)] py-2">
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_AJUSTES_FUNIL)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_AJUSTES_FUNIL ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <LayoutGrid className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AJUSTES_FUNIL ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Funil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_AJUSTES_USUARIOS)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_AJUSTES_USUARIOS ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <Users className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AJUSTES_USUARIOS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Usuários
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_API)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_API ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <Link2 className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_API ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              API
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_APICEBOT)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_APICEBOT ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <Bot className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_APICEBOT ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Apicebot
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigateTo(CRM_TAB_AUTOMACOES)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent', activeTab === CRM_TAB_AUTOMACOES ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
              <Zap className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AUTOMACOES ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
              Automações
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => navigateTo(CRM_TAB_CANAIS)}
          className={cn(
            'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
            activeTab === CRM_TAB_CANAIS ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
          )}
          title="Conectar WhatsApp"
        >
          <Radio className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Canais</span>
        </button>
        {!HIDE_INBOX_AND_WHATSAPP_TABS && (
          <>
            <button type="button" onClick={() => navigateTo('caixa-entrada')} className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 font-semibold">
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Inbox</span>
            </button>
            <button type="button" onClick={() => navigateTo('whatsapp')} className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 font-semibold">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          </>
        )}
      </nav>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
        <Button variant="outline" size="sm" className="h-10 rounded-full text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hidden sm:inline-flex px-4" onClick={() => window.open(`${basePath}/support`, '_self')}>
          <Star className="h-4 w-4 mr-1.5" />
          Sugira melhorias
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" title="Notificações">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" title="Atualizar" onClick={() => refresh?.()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground hidden sm:flex" title="Ajuda">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
