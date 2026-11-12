import useAtlasInbox from '@/components/atlas/useAtlasInbox';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Settings,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TooltipCustom } from '@/components/ui/tooltip-custom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import PlanejeLogo from '@/components/brand/PlanejeLogo';
import SidebarNotificationsMenu from '@/components/layout/SidebarNotificationsMenu';
import { useAtendimentoSidebarBadge } from '@/hooks/useAtendimentoSidebarBadge';
import { useCaixaPendenciasBadge } from '@/hooks/useCaixaPendencias';
import { TEAM_NAV_ITEMS, TEAM_NAV_GROUP_ICONS, filterTeamNav, groupTeamNav, isTeamNavItemActive, withPaidTrafficPath } from '@/lib/teamNav';
import usePlanejeTheme from '@/hooks/usePlanejeTheme';

import { canUseGestorIa } from '@/components/gestor-ia/gestorIaAccess';
import { canUseCsIa } from '@/components/cs-ia/csIaData';
import { canUseCrmIa } from '@/components/crm-ia/crmIaApi';
import GestorIaAvatar from '@/components/gestor-ia/GestorIaAvatar';
import CsIaAvatar from '@/components/cs-ia/CsIaAvatar';
import CrmIaAvatar from '@/components/crm-ia/CrmIaAvatar';

const SIDEBAR_EXPANDED_KEY = 'planeje-sidebar-expanded';

function readExpandedPreference() {
  try {
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function SidebarNavItem({ to, icon: Icon, label, expanded, navLinkClass, onClick, lucideIcon = true, match, badgeCount = 0 }) {
  const { pathname } = useLocation();
  const isActive = isTeamNavItemActive({ to, match }, pathname);
  const showBadge = badgeCount > 0;
  const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);

  const link = (
    <Link
      to={to}
      className={navLinkClass({ isActive })}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={expanded ? undefined : label}
    >
      <span className="planeje-sidebar-link-icon-wrap">
        <Icon className="w-5 h-5 shrink-0" {...(lucideIcon ? { strokeWidth: 2 } : {})} />
        {showBadge && !expanded && (
          <span className="planeje-sidebar-nav-badge" aria-label={`${label}: ${badgeLabel} pendentes`}>
            {badgeLabel}
          </span>
        )}
      </span>
      {expanded && <span className="planeje-sidebar-label">{label}</span>}
      {expanded && showBadge && (
        <span className="planeje-sidebar-nav-badge planeje-sidebar-nav-badge--expanded" aria-hidden>
          {badgeLabel}
        </span>
      )}
    </Link>
  );

  if (expanded) return link;

  return (
    <TooltipCustom content={label} side="right" triggerClassName="w-full flex justify-center">
      {link}
    </TooltipCustom>
  );
}

function AccountMenuContent({ profile, theme, toggleTheme, signOut }) {
  return (
    <>
      <DropdownMenuLabel className="px-2 py-2">
        <span className="block max-w-[220px] truncate text-sm">{profile?.full_name || profile?.email || 'Minha conta'}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-400" />Online</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={toggleTheme} className="cursor-pointer rounded-lg">
        {theme === 'dark' ? <Sun className="mr-2 h-4 w-4 text-amber-500" /> : <Moon className="mr-2 h-4 w-4 text-violet-500" />}
        <span>{theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={signOut} className="cursor-pointer rounded-lg text-red-500 focus:bg-red-50 focus:text-red-500">
        <LogOut className="mr-2 h-4 w-4" />
        <span>Sair</span>
      </DropdownMenuItem>
    </>
  );
}

const Sidebar = () => {
  const { signOut, profile } = useAuth();
  const { moduleSettings, loading: modulesLoading } = useModuleSettings();
  const { theme, toggleTheme } = usePlanejeTheme();
  const userRole = profile?.role;
  const location = useLocation();
  const isConversasInbox = /^\/conversas\/(aguardando|em-atendimento|resolvidos)\/?$/.test(location.pathname || '');
  const [expanded, setExpanded] = useState(() => (isConversasInbox ? false : readExpandedPreference()));
  const [groupSelection, setGroupSelection] = useState(null);

  useEffect(() => setGroupSelection(null), [location.pathname]);

  useEffect(() => {
    if (isConversasInbox) setExpanded(false);
    else setExpanded(readExpandedPreference());
  }, [isConversasInbox]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const menuItems = filterTeamNav(withPaidTrafficPath(TEAM_NAV_ITEMS, profile), userRole, moduleSettings);
  const { shortcuts, groups } = groupTeamNav(menuItems);
  const activeGroup = groups.find(group => group.items.some(item => isTeamNavItemActive(item, location.pathname)));
  const openGroup = groupSelection?.pathname === location.pathname ? groupSelection.id : activeGroup?.id || '';

  const { badgeTotal: conversasBadgeTotal } = useAtendimentoSidebarBadge();
  const { badgeTotal: caixaBadgeTotal } = useCaixaPendenciasBadge();
  const { unread: atlasUnread }=useAtlasInbox();

  const navLinkClass = ({ isActive }) =>
    cn('planeje-sidebar-link flex-shrink-0', expanded ? 'w-full' : 'w-full max-w-[56px]', isActive && 'is-active');

  const sidebarClass = cn(
    'planeje-sidebar planeje-sidebar--internal hidden md:flex flex-col min-h-0 overflow-hidden shrink-0 self-stretch py-4',
    expanded && 'is-expanded'
  );

  if (modulesLoading) {
    return <aside className={sidebarClass} />;
  }

  return (
    <aside className={sidebarClass}>
      <div className={cn('planeje-sidebar-header', expanded && 'is-expanded')}>
        {expanded ? (
          <div className="planeje-sidebar-logo-expanded" aria-hidden>
            <PlanejeLogo variant="horizontal" className="planeje-sidebar-logo-horizontal" />
          </div>
        ) : (
          <div className="planeje-sidebar-logo planeje-sidebar-logo--mark flex-shrink-0" aria-hidden>
            <PlanejeLogo variant="mark" className="planeje-sidebar-logo-mark-img" />
          </div>
        )}
        <button
          type="button"
          className="planeje-sidebar-toggle"
          onClick={toggleExpanded}
          aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
          title={expanded ? 'Recolher menu' : 'Expandir menu'}
        >
          {expanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
      </div>

      <nav
        aria-label="Menu principal"
        className={cn(
          'planeje-sidebar-nav flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col gap-1 custom-scrollbar',
          expanded ? 'px-3 items-stretch py-3' : 'px-2 items-center py-4'
        )}
      >
        {shortcuts.map((item) => (
          <SidebarNavItem
            key={item.id}
            {...item}
            expanded={expanded}
            navLinkClass={navLinkClass}
            onClick={() => setGroupSelection(null)}
            badgeCount={
              item.id === 'caixa'
                ? caixaBadgeTotal + atlasUnread
                : item.id === 'conversas'
                  ? conversasBadgeTotal
                  : 0
            }
          />
        ))}
        <Accordion
          type="single"
          collapsible
          value={expanded ? openGroup : ''}
          onValueChange={(id) => {
            setGroupSelection({ pathname: location.pathname, id });
            if (id && !expanded) toggleExpanded();
          }}
          className="flex w-full flex-col gap-1"
        >
          {groups.map((group) => {
            const Icon = TEAM_NAV_GROUP_ICONS[group.id];
            return (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger
                  className={cn(navLinkClass({ isActive: group.id === activeGroup?.id }), 'planeje-sidebar-group-trigger planeje-nav-group-trigger hover:no-underline')}
                  aria-label={group.label}
                  title={expanded ? undefined : group.label}
                >
                  <span className="planeje-sidebar-link-icon-wrap"><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /></span>
                  {expanded && <span className="planeje-sidebar-label">{group.label}</span>}
                </AccordionTrigger>
                {expanded && (
                  <AccordionContent className="planeje-sidebar-group-content motion-reduce:!animate-none">
                    {group.items.map(item => <SidebarNavItem key={item.id} {...item} expanded navLinkClass={navLinkClass} onClick={() => setGroupSelection(null)} />)}
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
      </nav>

      <div
        className={cn(
          'planeje-sidebar-footer mt-auto flex-shrink-0 flex flex-col gap-1 pt-3 w-full',
          expanded ? 'px-3 items-stretch pb-1' : 'px-2 items-center'
        )}
      >
        {canUseCrmIa(profile, moduleSettings) && (
          <SidebarNavItem to="/crm-ia/painel" icon={CrmIaAvatar} lucideIcon={false} label="CRM IA" expanded={expanded} navLinkClass={navLinkClass} />
        )}
        {canUseGestorIa(profile, moduleSettings) && (
          <SidebarNavItem to="/gestor-ia/metricas" icon={GestorIaAvatar} lucideIcon={false} label="Gestor IA" expanded={expanded} navLinkClass={navLinkClass} />
        )}
        {canUseCsIa(profile, moduleSettings) && (
          <SidebarNavItem to="/cs-ia/hoje" icon={CsIaAvatar} lucideIcon={false} label="CS IA" expanded={expanded} navLinkClass={navLinkClass} />
        )}

        <SidebarNotificationsMenu expanded={expanded} />

        <SidebarNavItem to="/settings" icon={Settings} label="Configurações" expanded={expanded} navLinkClass={navLinkClass} />

        {userRole === 'superadmin' && (
          <SidebarNavItem to="/super-admin" icon={Shield} label="Super Admin" expanded={expanded} navLinkClass={navLinkClass} />
        )}

        {expanded ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="planeje-sidebar-account w-full">
                <Avatar className="w-10 h-10 ring-2 ring-white/35 shrink-0">
                  <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                  <AvatarFallback className="jb-gradient-bg text-white font-bold text-sm">
                    {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="planeje-sidebar-label truncate text-left">
                  {profile?.full_name || profile?.email || 'Minha conta'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="mb-2 w-64 rounded-xl p-1.5">
              <AccountMenuContent profile={profile} theme={theme} toggleTheme={toggleTheme} signOut={signOut} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <TooltipCustom content="Minha Conta" side="right" triggerClassName="w-full flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-white/50 flex-shrink-0 mb-1">
                  <Avatar className="w-10 h-10 ring-2 ring-white/35">
                    <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                    <AvatarFallback className="jb-gradient-bg text-white font-bold text-sm">
                      {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="mb-2 w-64 rounded-xl p-1.5">
                <AccountMenuContent profile={profile} theme={theme} toggleTheme={toggleTheme} signOut={signOut} />
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipCustom>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 0; background: transparent; }
        .custom-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    </aside>
  );
};

export default Sidebar;
