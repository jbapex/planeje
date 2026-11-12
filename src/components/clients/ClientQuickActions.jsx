import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Users, FolderKanban, CheckSquare, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildClientHubUrl,
  buildClientConversasUrl,
  buildClientCrmUrl,
  buildClientProjectsUrl,
  buildClientTasksUrl,
} from '@/lib/clientHubRoutes';

const ACTIONS = [
  { key: 'hub', label: 'Conta', icon: LayoutDashboard, buildUrl: buildClientHubUrl },
  { key: 'conversas', label: 'Conversas', icon: MessageSquare, buildUrl: buildClientConversasUrl },
  { key: 'crm', label: 'CRM', icon: Users, buildUrl: buildClientCrmUrl },
  { key: 'projetos', label: 'Projetos', icon: FolderKanban, buildUrl: buildClientProjectsUrl },
  { key: 'tarefas', label: 'Tarefas', icon: CheckSquare, buildUrl: buildClientTasksUrl },
];

export default function ClientQuickActions({ clientId, className, compact = false }) {
  if (!clientId) return null;

  return (
    <div
      className={cn('planeje-client-quick-actions', compact && 'planeje-client-quick-actions--compact', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {ACTIONS.map(({ key, label, icon: Icon, buildUrl }) => (
        <Link
          key={key}
          to={buildUrl(clientId)}
          className="planeje-client-quick-action"
          title={label}
          aria-label={label}
        >
          <Icon className="w-3.5 h-3.5" />
          {!compact && <span>{label}</span>}
        </Link>
      ))}
    </div>
  );
}
