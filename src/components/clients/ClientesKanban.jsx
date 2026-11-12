import React, { useState } from 'react';
import { BarChart, Building } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import ClientQuickActions from '@/components/clients/ClientQuickActions';
import ClientCardMenu from '@/components/clients/ClientCardMenu';
import { ClienteMetaResumoInline } from '@/components/traffic/ClienteMetaResumoCell';
import { EtiquetaBadges } from '@/components/clients/ClienteEtiquetas';

const ETAPAS = [
  { value: 'prospect', label: 'Prospect', color: 'bg-slate-400', header: 'from-slate-500/15 to-slate-500/5' },
  { value: 'qualification', label: 'Qualificação', color: 'bg-blue-500', header: 'from-blue-500/15 to-blue-500/5' },
  { value: 'proposal', label: 'Proposta', color: 'bg-amber-400', header: 'from-amber-500/15 to-amber-500/5' },
  { value: 'negotiation', label: 'Negociação', color: 'bg-orange-500', header: 'from-orange-500/15 to-orange-500/5' },
  { value: 'closed', label: 'Fechado', color: 'bg-emerald-500', header: 'from-emerald-500/15 to-emerald-500/5' },
  { value: 'lost', label: 'Perdido', color: 'bg-red-500', header: 'from-red-500/15 to-red-500/5' },
];

function formatValor(valor) {
  if (!valor) return null;
  return `R$ ${parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function ClientesKanban({
  clients,
  onEdit,
  onOpen,
  onUpdateField,
  onProgress,
  onOpenDocument,
  onOpenUserManager,
  fetchClients,
  userRole,
  pulseById,
  etiquetaCatalog = [],
}) {
  const { canViewField } = useAuth();
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const canManage = userRole === 'superadmin' || userRole === 'admin';
  const open = onOpen || onEdit;

  const clientsByEtapa = ETAPAS.reduce((acc, etapa) => {
    acc[etapa.value] = clients.filter((c) => (c.etapa || 'prospect') === etapa.value);
    return acc;
  }, {});

  const handleDragStart = (e, client) => {
    if (!canManage) return;
    e.dataTransfer.setData('text/plain', client.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(client.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = (e, etapaValue) => {
    e.preventDefault();
    const clientId = e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDropTarget(null);
    if (!clientId || !canManage) return;
    const client = clients.find((c) => c.id === clientId);
    if (client && client.etapa !== etapaValue) {
      onUpdateField(clientId, 'etapa', etapaValue);
    }
  };

  return (
    <div className="planeje-clients-kanban">
      {ETAPAS.map((etapa) => {
        const columnClients = clientsByEtapa[etapa.value] || [];
        const isDropActive = dropTarget === etapa.value;
        const isEmpty = columnClients.length === 0;
        const collapsed = isEmpty && !draggingId;

        return (
          <div
            key={etapa.value}
            className={cn(
              'planeje-clients-kanban-col',
              isEmpty && 'is-empty',
              collapsed && 'is-collapsed',
              isDropActive && 'is-drop-target',
            )}
            onDragOver={(e) => {
              if (!canManage) return;
              e.preventDefault();
              setDropTarget(etapa.value);
            }}
            onDragLeave={() => setDropTarget((prev) => (prev === etapa.value ? null : prev))}
            onDrop={(e) => handleDrop(e, etapa.value)}
            title={collapsed ? `${etapa.label}: nenhum cliente` : undefined}
          >
            <div className={cn('planeje-clients-kanban-col-header', `bg-gradient-to-b ${etapa.header}`)}>
              <span className={cn('planeje-clients-kanban-dot', etapa.color)} />
              <span className="planeje-clients-kanban-col-title">{etapa.label}</span>
              <span className="planeje-clients-kanban-col-count">{columnClients.length}</span>
            </div>
            {!collapsed && (
              <div className="planeje-clients-kanban-col-body">
                {columnClients.map((client) => {
                  const logo = client.logo_urls?.[0] || null;
                  const accountPulse = pulseById?.get(client.id);
                  const valor = canViewField('valor') ? formatValor(client.valor) : null;
                  const contrato = canViewField('tipo_contrato') ? client.tipo_contrato : null;

                  return (
                    <div
                      key={client.id}
                      className={cn('planeje-clients-kanban-card', draggingId === client.id && 'is-dragging')}
                      draggable={canManage}
                      onDragStart={(e) => handleDragStart(e, client)}
                      onDragEnd={handleDragEnd}
                      onClick={() => open(client)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') open(client);
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <Avatar className="h-9 w-9 rounded-lg shrink-0">
                          <AvatarImage src={logo} alt="" className="object-cover" />
                          <AvatarFallback className="rounded-lg bg-slate-100 dark:bg-slate-700">
                            <Building className="w-4 h-4 text-slate-400" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {client.empresa}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {[client.nome_contato, [client.cidade, client.estado].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || 'Sem contato'}
                          </p>
                        </div>
                        {accountPulse && (
                          <span
                            className={cn('planeje-clients-health', `is-${accountPulse.mood.tone}`)}
                            title={`Saúde: ${accountPulse.mood.label}`}
                          >
                            {accountPulse.score}
                          </span>
                        )}
                        {canManage && (
                          <ClientCardMenu
                            client={client}
                            onOpen={onOpen}
                            onEdit={onEdit}
                            onOpenDocument={onOpenDocument}
                            onOpenUserManager={onOpenUserManager}
                            fetchClients={fetchClients}
                          />
                        )}
                      </div>

                      {(valor || contrato) && (
                        <p className="planeje-clients-kanban-meta">
                          {valor && <strong>{valor}</strong>}
                          {valor && contrato ? ' · ' : ''}
                          {contrato}
                        </p>
                      )}
                      <div className="planeje-clients-kanban-traffic">
                        <ClienteMetaResumoInline snapshot={readClienteMetaResumo(client)} />
                      </div>
                      {(client.etiquetas || []).length > 0 && (
                        <div className="mt-2">
                          <EtiquetaBadges etiquetas={client.etiquetas} catalog={etiquetaCatalog} />
                        </div>
                      )}

                      <div className="planeje-clients-kanban-foot" onClick={(e) => e.stopPropagation()}>
                        <ClientQuickActions clientId={client.id} compact />
                        {onProgress && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-500"
                            onClick={() => onProgress(client)}
                            title="Ver progresso"
                          >
                            <BarChart className="h-3.5 w-3.5 mr-1" />
                            Progresso
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isEmpty && (
                  <p className="planeje-clients-kanban-empty">Solte aqui</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
