import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { useAtlasEntryAccess } from '@/components/AtlasEntry';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { canUseCsIa } from '@/components/cs-ia/csIaData';
import { canUseCrmIa } from '@/components/crm-ia/crmIaApi';
import CsIaAvatar from '@/components/cs-ia/CsIaAvatar';
import CrmIaAvatar from '@/components/crm-ia/CrmIaAvatar';
import PlanejeLogo from '@/components/brand/PlanejeLogo';
import GestorIaAvatar from './GestorIaAvatar';
import { canUseGestorIa } from './gestorIaAccess';

const expandedKey = 'planeje-gestor-ia-sidebar-expanded';

function readExpanded() {
  try {
    return globalThis.localStorage?.getItem(expandedKey) !== 'false';
  } catch {
    return true;
  }
}

export default function GestorIaSidebar({ tabs, activeTab, search, profileName, workspace = 'gestor-ia' }) {
  const { user, profile } = useAuth();
  const { moduleSettings } = useModuleSettings();
  const canOpenAtlas = useAtlasEntryAccess(moduleSettings?.assistant === true ? user?.id : null);
  const [expanded, setExpanded] = useState(readExpanded);
  const menuId = useId();
  const toggleLabel = expanded ? 'Recolher menu' : 'Expandir menu';
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;
  const labelClass = expanded ? 'planeje-sidebar-label' : 'sr-only';
  const tileClass = 'planeje-sidebar-link gia-nav-link';
  const workspaceName = workspace === 'crm-ia' ? 'CRM IA' : workspace === 'cs-ia' ? 'CS IA' : 'Gestor IA';
  const AgentIcon = workspace === 'crm-ia' ? CrmIaAvatar : workspace === 'cs-ia' ? CsIaAvatar : GestorIaAvatar;
  const agents = [
    ['crm-ia', 'CRM IA', 'painel', CrmIaAvatar, canUseCrmIa(profile, moduleSettings)],
    ['gestor-ia', 'Gestor IA', 'metricas', GestorIaAvatar, canUseGestorIa(profile, moduleSettings)],
    ['cs-ia', 'CS IA', 'hoje', CsIaAvatar, canUseCsIa(profile, moduleSettings)],
  ];

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      globalThis.localStorage?.setItem(expandedKey, String(next));
    } catch {
      // O menu continua funcionando quando o navegador bloqueia o armazenamento.
    }
  }

  return (
    <aside className={`gia-sidebar planeje-sidebar planeje-sidebar--internal${expanded ? ' is-expanded' : ''}`} aria-label={`Ambiente ${workspaceName}`}>
      <div className="planeje-sidebar-header">
        <Link to="/caixa" aria-label="Voltar para a operação Planeje" className={expanded ? 'planeje-sidebar-logo-expanded' : 'planeje-sidebar-logo planeje-sidebar-logo--mark'}>
          <PlanejeLogo variant={expanded ? 'horizontal' : 'mark'} className={expanded ? 'planeje-sidebar-logo-horizontal' : 'planeje-sidebar-logo-mark-img'} />
        </Link>
        <button type="button" className="planeje-sidebar-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={expanded} aria-controls={menuId} onClick={toggle}>
          <ToggleIcon size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="gia-sidebar-body" id={menuId}>
        <div className="gia-agent">
          <AgentIcon size={24} aria-hidden="true" />
          <strong className={labelClass}>{workspaceName}</strong>
        </div>
        <nav className="gia-nav" aria-label={workspaceName}>
          {tabs.map(([path, label, Icon, tabSearch = search]) => (
            <Link key={path} to={{ pathname: `/${workspace}/${path}`, search: tabSearch }}
              className={`${tileClass}${activeTab === path ? ' is-active' : ''}`}
              aria-current={activeTab === path ? 'page' : undefined} title={expanded ? undefined : label}>
              <Icon aria-hidden="true" /><span className={labelClass}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="gia-workspaces planeje-sidebar-footer">
          {expanded && <p className="gia-eyebrow">Squad</p>}
          <nav className="gia-nav" aria-label="Squad">
            {canOpenAtlas && <Link to="/assistant/atlas?view=conversation" className={tileClass} aria-label="Conversar com Atlas" title={expanded ? undefined : 'Conversar com Atlas'}>
              <MessageSquare aria-hidden="true" /><span className="planeje-sidebar-label gia-workspace-label">Conversar</span>
            </Link>}
            {agents.filter(([, , , , enabled]) => enabled).map(([id, label, tab, Icon]) => <Link key={id}
              to={`/${id}/${tab}`} className={`${tileClass}${workspace === id ? ' is-active' : ''}`}
              aria-label={label} aria-current={workspace === id ? 'true' : undefined} title={expanded ? undefined : label}>
              <Icon aria-hidden="true" /><span className="planeje-sidebar-label gia-workspace-label">{label}</span>
            </Link>)}
          </nav>
          <Link to="/caixa" className={tileClass} title={expanded ? undefined : 'Operação Planeje'}>
            <ArrowLeft aria-hidden="true" /><span className={labelClass}>Operação Planeje</span>
          </Link>
          <Link to="/settings" className={tileClass} title={expanded ? undefined : 'Configurações no Planeje'}>
            <Settings aria-hidden="true" /><span className={labelClass}>Configurações no Planeje</span>
          </Link>
          {expanded && <small className="planeje-sidebar-label" title={profileName}>{profileName}</small>}
        </div>
      </div>
    </aside>
  );
}
