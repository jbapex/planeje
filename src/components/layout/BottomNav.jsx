import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, MoreHorizontal, RefreshCw, Settings, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAtendimentoSidebarBadge } from '@/hooks/useAtendimentoSidebarBadge';
import { useCaixaPendenciasBadge } from '@/hooks/useCaixaPendencias';
import { TEAM_NAV_ITEMS, TEAM_NAV_GROUP_ICONS, TEAM_NAV_MOBILE_SHORTCUT_IDS, filterTeamNav, groupTeamNav, isTeamNavItemActive, reloadCurrentPage, withPaidTrafficPath } from '@/lib/teamNav';

import { canUseGestorIa } from '@/components/gestor-ia/gestorIaAccess';
import { canUseCsIa } from '@/components/cs-ia/csIaData';
import { canUseCrmIa } from '@/components/crm-ia/crmIaApi';
import GestorIaAvatar from '@/components/gestor-ia/GestorIaAvatar';
import CsIaAvatar from '@/components/cs-ia/CsIaAvatar';
import CrmIaAvatar from '@/components/crm-ia/CrmIaAvatar';

const MOBILE_EXTRA_ITEMS = [
  { to: '/pgm-panel', icon: Activity, label: 'PGM', roles: ['superadmin', 'admin', 'colaborador'], module: 'pgm' },
  { to: '/settings', icon: Settings, label: 'Configurações', roles: ['superadmin', 'admin', 'colaborador'] },
  { to: '/super-admin', icon: Shield, label: 'Super Admin', roles: ['superadmin'] },
];

function MobileMenuItem({ item, onNavigate }) {
  const { pathname } = useLocation();
  const active = isTeamNavItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 dark:text-slate-100 dark:hover:bg-slate-800',
        active && 'bg-violet-50 font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200'
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-violet-600" {...(item.lucideIcon === false ? {} : { strokeWidth: 2 })} />
      <span>{item.label}</span>
    </Link>
  );
}

const BottomNav = () => {
  const { profile } = useAuth();
  const { moduleSettings, loading } = useModuleSettings();
  const { badgeTotal: conversasBadgeTotal } = useAtendimentoSidebarBadge();
  const { badgeTotal: caixaBadgeTotal } = useCaixaPendenciasBadge();
  const userRole = profile?.role;
  const location = useLocation();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [groupSelection, setGroupSelection] = useState(null);

  useEffect(() => setGroupSelection(null), [location.pathname]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) setIsMoreMenuOpen(false); };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [isMoreMenuOpen]);

  if (loading) {
    return <div className="planeje-bottom-nav md:hidden fixed bottom-0 left-0 right-0 h-16 z-50" />;
  }

  const navItems = filterTeamNav(withPaidTrafficPath(TEAM_NAV_ITEMS, profile), userRole, moduleSettings);
  const { shortcuts: mainItems, groups } = groupTeamNav(navItems, TEAM_NAV_MOBILE_SHORTCUT_IDS);
  const extraItems = filterTeamNav(MOBILE_EXTRA_ITEMS, userRole, moduleSettings);
  const squadItems = [
    ...(canUseCrmIa(profile, moduleSettings) ? [{ to: '/crm-ia/painel', icon: CrmIaAvatar, label: 'CRM IA', lucideIcon: false }] : []),
    ...(canUseGestorIa(profile, moduleSettings) ? [{ to: '/gestor-ia/metricas', icon: GestorIaAvatar, label: 'Gestor IA', lucideIcon: false }] : []),
    ...(canUseCsIa(profile, moduleSettings) ? [{ to: '/cs-ia/hoje', icon: CsIaAvatar, label: 'CS IA', lucideIcon: false }] : []),
  ];
  const activeGroup = groups.find(group => group.items.some(item => isTeamNavItemActive(item, location.pathname)));
  const openGroup = groupSelection?.pathname === location.pathname ? groupSelection.id : activeGroup?.id || '';
  const moreActive = Boolean(activeGroup) || [...extraItems, ...squadItems].some(item => isTeamNavItemActive(item, location.pathname));
  const closeMenu = () => {
    setGroupSelection(null);
    setIsMoreMenuOpen(false);
  };

  return (
    <Dialog open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
      <nav aria-label="Atalhos do celular" className="planeje-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50">
      <div className="grid h-16 max-w-lg mx-auto font-medium" style={{ gridTemplateColumns: `repeat(${mainItems.length + 1}, minmax(0, 1fr))` }}>
        {mainItems.map((item) => {
          const isActive = isTeamNavItemActive(item, location.pathname);
          const badgeCount =
            item.to === '/caixa'
              ? caixaBadgeTotal
              : item.id === 'conversas'
                ? conversasBadgeTotal
                : 0;
          const showBadge = badgeCount > 0;
          const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'planeje-bottom-nav-link relative inline-flex flex-col items-center justify-center px-2 transition-all duration-200',
                isActive && 'is-active'
              )}
            >
              <span className="relative inline-flex">
                <item.icon
                  className={cn(
                    'planeje-bottom-nav-icon w-6 h-6 mb-1',
                    isActive ? 'text-[var(--jb-purple)]' : 'text-gray-400'
                  )}
                  {...(item.lucideIcon === false ? {} : {})}
                />
                {showBadge && (
                  <span className="planeje-bottom-nav-badge">{badgeLabel}</span>
                )}
              </span>
              <span
                className={cn(
                  'planeje-bottom-nav-label text-[10px] max-w-full truncate',
                  isActive ? 'text-[var(--jb-purple)] font-semibold' : 'text-gray-500'
                )}
              >
                {item.shortLabel || item.label}
              </span>
              {isActive && (
                <div className="planeje-bottom-nav-indicator absolute bottom-0 left-3 right-3" />
              )}
            </Link>
          );
        })}

        <DialogTrigger asChild>
          <button
            type="button"
            className={cn('inline-flex flex-col items-center justify-center px-2 text-gray-500', moreActive && 'text-[var(--jb-purple)]')}
            aria-label="Ver todas as páginas"
          >
            <MoreHorizontal className="w-6 h-6 mb-1" />
            <span className="text-[10px]">Mais</span>
          </button>
        </DialogTrigger>
      </div>
      </nav>
      <DialogContent
        className="bottom-20 top-auto flex max-h-[min(70dvh,32rem)] w-[calc(100%-1rem)] translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 motion-reduce:!animate-none"
        overlayClassName="bg-slate-900/40 motion-reduce:!animate-none"
      >
        <DialogTitle className="border-b border-slate-100 px-4 py-4 text-sm text-slate-800 dark:border-slate-800 dark:text-slate-100">Páginas</DialogTitle>
        <DialogDescription className="sr-only">Navegue pelas categorias ou abra seu Squad.</DialogDescription>
        <nav aria-label="Todas as páginas" className="overflow-y-auto p-2">
          <Accordion type="single" collapsible value={openGroup} onValueChange={id => setGroupSelection({ pathname: location.pathname, id })}>
            {groups.map(group => {
              const Icon = TEAM_NAV_GROUP_ICONS[group.id];
              return (
                <AccordionItem key={group.id} value={group.id}>
                  <AccordionTrigger className={cn('planeje-nav-group-trigger min-h-[44px] gap-3 rounded-lg px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 dark:text-slate-100 dark:hover:bg-slate-800', group.id === activeGroup?.id && 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200')}>
                    <span className="flex flex-1 items-center gap-3 text-left"><Icon className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />{group.label}</span>
                  </AccordionTrigger>
                  <AccordionContent className="ml-6 border-l border-slate-200 pl-2 dark:border-slate-700 motion-reduce:!animate-none">
                    {group.items.map(item => <MobileMenuItem key={item.id} item={item} onNavigate={closeMenu} />)}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          {squadItems.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="px-4 py-2 text-xs font-semibold text-slate-500">Squad</p>
              {squadItems.map(item => <MobileMenuItem key={item.to} item={item} onNavigate={closeMenu} />)}
            </div>
          )}
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            {extraItems.map(item => <MobileMenuItem key={item.to} item={item} onNavigate={closeMenu} />)}
            <button type="button" onClick={reloadCurrentPage} className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
              <RefreshCw className="h-5 w-5 shrink-0 text-violet-600" />Atualizar a página
            </button>
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  );
};

export default BottomNav;
