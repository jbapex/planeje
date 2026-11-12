import React from 'react';
import { RefreshCw } from 'lucide-react';
import PlanejeLogo from '@/components/brand/PlanejeLogo';
import WorkspaceHeaderTools from '@/components/layout/WorkspaceHeaderTools';
import { reloadCurrentPage } from '@/lib/teamNav';

const Header = () => {
  return (
    <header className="planeje-header sticky top-0 z-10 shrink-0 px-3 py-1.5 md:hidden">
      <div className="flex items-center justify-between w-full gap-3">
        <div className="md:hidden flex items-center gap-2.5 min-w-0">
          <div className="planeje-sidebar-logo planeje-sidebar-logo--mark h-8 w-8 shrink-0">
            <PlanejeLogo variant="mark" className="planeje-sidebar-logo-mark-img" />
          </div>
          <h1 className="truncate text-base font-bold gradient-text">Planeje</h1>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={reloadCurrentPage}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Atualizar a página"
            title="Atualizar a página"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <WorkspaceHeaderTools />
        </div>
      </div>
    </header>
  );
};

export default Header;
