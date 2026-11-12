import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Cabeçalho padrão das subpáginas do Super Admin.
 */
const SuperAdminPageHeader = ({ title, description, sectionLabel, backTo = '/super-admin' }) => (
  <header className="planeje-super-admin-page-header">
    <Button variant="ghost" size="icon" className="shrink-0" asChild>
      <Link to={backTo} aria-label="Voltar ao painel Super Admin">
        <ArrowLeft className="h-5 w-5" />
      </Link>
    </Button>
    <div className="planeje-super-admin-page-header-copy">
      <nav className="planeje-super-admin-breadcrumb" aria-label="Breadcrumb">
        <Link to="/super-admin">Super Admin</Link>
        {sectionLabel ? (
          <>
            {' '}
            / <span>{sectionLabel}</span>
          </>
        ) : null}
      </nav>
      <h1 className="planeje-super-admin-page-title">{title}</h1>
      {description ? <p className="planeje-super-admin-page-desc">{description}</p> : null}
    </div>
  </header>
);

export default SuperAdminPageHeader;
