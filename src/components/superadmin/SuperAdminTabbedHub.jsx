import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import SuperAdminPageHeader from '@/components/superadmin/SuperAdminPageHeader';
import { rememberSuperAdminPath } from '@/lib/superAdminNav';

/**
 * Hub com abas internas (IA, Diagnóstico, etc.).
 * @param {{ hub: import('@/lib/superAdminHubs').SUPER_ADMIN_IA_HUB }} props
 */
const SuperAdminTabbedHub = ({ hub }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabIds = useMemo(() => hub.tabs.map((t) => t.id), [hub.tabs]);
  const activeTab = tabIds.includes(searchParams.get('tab') || '')
    ? searchParams.get('tab')
    : hub.defaultTab;

  const Panel = hub.panels[activeTab] || hub.panels[hub.defaultTab];
  const ActiveIcon = hub.tabs.find((t) => t.id === activeTab)?.icon;

  useEffect(() => {
    rememberSuperAdminPath(hub.path);
  }, [hub.path]);

  const setTab = (tabId) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  return (
    <div className="planeje-super-admin-page space-y-4">
      <SuperAdminPageHeader
        sectionLabel={hub.sectionLabel}
        title={hub.title}
        description={hub.description}
      />

      <nav className="planeje-super-admin-inner-tabs" aria-label={`Abas de ${hub.title}`}>
        {hub.tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={cn('planeje-super-admin-inner-tab', activeTab === tab.id && 'is-active')}
              onClick={() => setTab(tab.id)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="planeje-super-admin-tab-panel is-embedded" data-active-tab={activeTab}>
        {ActiveIcon ? (
          <span className="sr-only">
            Aba ativa: {hub.tabs.find((t) => t.id === activeTab)?.label}
          </span>
        ) : null}
        {Panel ? <Panel /> : null}
      </div>
    </div>
  );
};

export default SuperAdminTabbedHub;
