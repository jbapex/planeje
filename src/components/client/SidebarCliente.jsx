import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Activity,
  LogOut,
  User,
  Info,
  TrendingUp,
  ArrowLeft,
  ClipboardList,
  BarChart3,
  Table2,
  CalendarDays,
  Headphones,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import { CLIENT_PANEL_LOGO_EVENT } from '@/lib/clientPanelTheme';
import { clientHasPageAccess } from '@/lib/clientAllowedPages';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TooltipCustom } from '@/components/ui/tooltip-custom';
import { cn } from '@/lib/utils';

const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente';
  return '/client-area';
};

const hasPageAccess = (profile, pageKey) => clientHasPageAccess(profile, pageKey);

const getMenuItems = (profile, atendimentoNivel) => {
  const prefix = getRoutePrefix(profile);
  const isAdmin =
    profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  const showAtendimento = Boolean(atendimentoNivel);

  const items = [
    { key: 'dashboard', label: 'Dashboard', path: `${prefix}/support`, icon: LayoutDashboard },
    { key: 'campaigns-status', label: 'Status das Campanhas', path: `${prefix}/campaigns-status`, icon: ClipboardList },
    { key: 'apexia', label: 'ApexIA', path: '/apexia', icon: MessageSquare, disabled: profile?.role !== 'cliente' },
    { key: 'pgm-panel', label: 'Painel PGM', path: `${prefix}/pgm-panel`, icon: Activity },
    {
      key: 'crm',
      label: isAdmin ? 'Contatos' : 'CRM',
      path: isAdmin ? `${prefix}/crm/contatos` : `${prefix}/crm`,
      icon: BarChart3,
    },
  ];

  if (isAdmin) {
    items.splice(2, 0, {
      key: 'traffic-weekly',
      label: 'Tráfego Semanal',
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

  return items.filter((item) => item.disabled || item.always || hasPageAccess(profile, item.key));
};

function SidebarNavButton({ item, isActive, expanded, onClick }) {
  const Icon = item.icon;
  const isApexIA = item.key === 'apexia';

  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={item.disabled}
      className={cn(
        'planeje-sidebar-link flex-shrink-0 w-full',
        expanded ? 'justify-start' : 'max-w-[56px]',
        isActive && 'is-active',
        isApexIA && !isActive && 'ring-1 ring-sky-300/70 bg-white/10',
        item.disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
      {expanded && (
        <>
          <span className="planeje-sidebar-label">{item.label}</span>
          {isApexIA && !isActive && (
            <span className="ml-auto rounded-full bg-sky-400/25 px-1.5 py-0.5 text-[10px] font-bold text-sky-50 border border-sky-300/50">
              AI
            </span>
          )}
        </>
      )}
    </button>
  );

  if (expanded) return btn;

  return (
    <TooltipCustom content={item.label} side="right" triggerClassName="w-full flex justify-center">
      {btn}
    </TooltipCustom>
  );
}

function SidebarActionButton({ icon: Icon, label, expanded, onClick, className }) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'planeje-sidebar-link flex-shrink-0 w-full border-0 bg-transparent shadow-none',
        expanded ? 'justify-start' : 'max-w-[56px]',
        className
      )}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
      {expanded && <span className="planeje-sidebar-label">{label}</span>}
    </button>
  );

  if (expanded) return btn;

  return (
    <TooltipCustom content={label} side="right" triggerClassName="w-full flex justify-center">
      {btn}
    </TooltipCustom>
  );
}

const SidebarCliente = ({ collapsed = false, onToggleCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { profile, signOut, user } = auth || {};
  const [clienteData, setClienteData] = useState(null);
  const [showQuemSomos, setShowQuemSomos] = useState(false);
  const [companyInfo, setCompanyInfo] = useState('');
  const atendimento = useAtendimentoLojaMembro();
  const lojaMembroRestrito = atendimento.gate && atendimento.nivel && atendimento.nivel !== 'admin';

  const expanded = !collapsed;

  useEffect(() => {
    if (!profile) return;
    const fetchClienteData = async () => {
      if (profile?.role !== 'cliente' || !profile?.cliente_id) {
        setClienteData(null);
        return;
      }
      const { data, error } = await supabase
        .from('clientes')
        .select('empresa, nome_contato, logo_urls')
        .eq('id', profile.cliente_id)
        .maybeSingle();
      setClienteData(!error && data ? data : null);
    };
    fetchClienteData();
  }, [profile?.cliente_id, profile?.role, profile]);

  useEffect(() => {
    const onLogo = (e) => {
      if (profile?.role !== 'cliente' || !profile?.cliente_id) return;
      setClienteData((prev) => (prev ? { ...prev, logo_urls: e.detail?.logoUrls || [] } : prev));
    };
    window.addEventListener(CLIENT_PANEL_LOGO_EVENT, onLogo);
    return () => window.removeEventListener(CLIENT_PANEL_LOGO_EVENT, onLogo);
  }, [profile?.role, profile?.cliente_id]);

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      const { data, error } = await supabase
        .from('public_config')
        .select('value')
        .eq('key', 'company_info_for_ai')
        .maybeSingle();
      if (!error && data?.value) setCompanyInfo(data.value);
    };
    fetchCompanyInfo();
  }, []);

  if (!auth || !profile) return null;

  const isAdmin =
    profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  const clienteNome = clienteData?.empresa || clienteData?.nome_contato || profile?.full_name || 'JB APEX';
  const clienteFoto = rewritePublicStorageUrl(clienteData?.logo_urls?.[0] || '') || null;
  const iniciais = clienteNome
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const displayName = isAdmin ? 'JB APEX' : clienteData?.empresa || clienteData?.nome_contato || 'JB APEX';

  const handleNavigate = (item) => {
    if (item.disabled) return;
    if (item.key === 'apexia') {
      navigate(item.path, { state: { fromClientArea: true } });
      return;
    }
    navigate(item.path);
  };

  const sidebarClass = cn(
    'planeje-sidebar hidden md:flex flex-col min-h-0 overflow-hidden shrink-0 self-stretch py-4',
    expanded && 'is-expanded'
  );

  return (
    <aside className={sidebarClass}>
      <div className={cn('planeje-sidebar-header', expanded && 'is-expanded')}>
        <div className="planeje-sidebar-logo flex-shrink-0 overflow-hidden p-0" aria-hidden>
          {clienteFoto ? (
            <img src={clienteFoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{iniciais.charAt(0) || 'J'}</span>
          )}
        </div>
        {expanded && (
          <div className="min-w-0 flex-1">
            <span className="planeje-sidebar-brand block truncate">{displayName}</span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-white/75">Área do Cliente</span>
          </div>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            className="planeje-sidebar-toggle"
            onClick={onToggleCollapsed}
            aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
            title={expanded ? 'Recolher menu' : 'Expandir menu'}
          >
            {expanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav
        className={cn(
          'planeje-sidebar-nav flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col gap-1 custom-scrollbar',
          expanded ? 'px-3 items-stretch py-3' : 'px-2 items-center py-4'
        )}
      >
        {getMenuItems(profile, atendimento.nivel).map((item) => {
          const isActive =
            item.key === 'apexia'
              ? location.pathname.startsWith(item.path) || location.pathname.startsWith('/chat/')
              : location.pathname.startsWith(item.path);

          return (
            <SidebarNavButton
              key={item.key}
              item={item}
              isActive={isActive}
              expanded={expanded}
              onClick={() => handleNavigate(item)}
            />
          );
        })}
      </nav>

      <div
        className={cn(
          'planeje-sidebar-footer mt-auto flex-shrink-0 flex flex-col gap-1 pt-3 w-full',
          expanded ? 'px-3 items-stretch pb-1' : 'px-2 items-center'
        )}
      >
        {!isAdmin && (
          <>
            {!lojaMembroRestrito && (
              <SidebarActionButton
                icon={User}
                label="Meus Dados"
                expanded={expanded}
                onClick={() => navigate('/cliente/cadastros')}
              />
            )}
            <SidebarActionButton
              icon={Info}
              label="Quem Somos"
              expanded={expanded}
              onClick={() => setShowQuemSomos(true)}
            />
          </>
        )}

        {isAdmin ? (
          <SidebarActionButton
            icon={ArrowLeft}
            label="Voltar ao Planeje"
            expanded={expanded}
            onClick={() => navigate('/tasks/list')}
          />
        ) : (
          <SidebarActionButton
            icon={LogOut}
            label="Sair"
            expanded={expanded}
            onClick={signOut}
            className="text-white/85 hover:text-white"
          />
        )}
      </div>

      <Dialog open={showQuemSomos} onOpenChange={setShowQuemSomos}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Quem Somos - JB APEX</DialogTitle>
            <DialogDescription>Informações sobre a JB APEX e nossos serviços</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {companyInfo ? (
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">{companyInfo}</div>
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
