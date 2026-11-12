import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CalendarClock,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Package,
  PanelRightOpen,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { CONVERSAS_CONFIG_PATH } from '@/lib/conversasRoutes';
import { phoneFromConversation } from '@/lib/atendimentoLeadContext';
import { cn } from '@/lib/utils';
import MarkBaseClientButton from '@/components/atendimento/MarkBaseClientButton';
import AtendimentoMaterialLogPanel from '@/components/atendimento/AtendimentoMaterialLogPanel';
import AtendimentoGrupoPlanejamentoPanel from '@/components/atendimento/AtendimentoGrupoPlanejamentoPanel';
import AtendimentoGrupoParticipantesPanel from '@/components/atendimento/AtendimentoGrupoParticipantesPanel';

const GROUP_SIDE_TAB_DETALHES = 'detalhes';
const GROUP_SIDE_TAB_PARTICIPANTES = 'participantes';

function audienceBadge(context) {
  if (context?.isGroup) {
    return { label: 'Grupo', variant: 'secondary' };
  }
  if (context?.audienceType === 'base') {
    return { label: 'Cliente da base', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-600' };
  }
  if (context?.audienceType === 'commercial') {
    return { label: 'Lead comercial', variant: 'secondary' };
  }
  if (context?.hasCrm) {
    return { label: 'Contato', variant: 'outline' };
  }
  return { label: 'Sem cadastro', variant: 'outline' };
}

function SideField({ label, children }) {
  return (
    <div>
      <p className="wa-side-section-title mb-1">{label}</p>
      {children}
    </div>
  );
}

export default function AtendimentoSidePanel({
  open = true,
  onToggle,
  context,
  loading,
  conversation,
  csGroup,
  onOpenLead,
  showConfigLink,
  clienteId,
  onBaseClientChanged,
  canManagePlanejamento,
  onCreateTask,
  onAgendarLembrete,
  groupSideTab,
  onGroupSideTabChange,
}) {
  const [internalGroupTab, setInternalGroupTab] = useState(GROUP_SIDE_TAB_DETALHES);
  const { moduleSettings } = useModuleSettings() || {};
  const miniCrmOn = moduleSettings?.mini_crm === true;
  const crmOn = moduleSettings?.crm === true;
  const activeGroupTab = groupSideTab || internalGroupTab;
  const setGroupTab = onGroupSideTabChange || setInternalGroupTab;

  useEffect(() => {
    if (!conversation?.is_group) setInternalGroupTab(GROUP_SIDE_TAB_DETALHES);
  }, [conversation?.id, conversation?.is_group]);

  if (!open) {
    return (
      <aside className="wa-side-panel-rail hidden xl:flex flex-col shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 mt-2"
          onClick={onToggle}
          title="Expandir ficha do contato"
          aria-label="Expandir ficha do contato"
        >
          <PanelRightOpen className="h-5 w-5" />
        </Button>
      </aside>
    );
  }

  if (!conversation) {
    return (
      <aside className="wa-side-panel hidden xl:flex flex-col shrink-0">
        <div className="wa-side-panel-inner flex flex-col min-h-0 h-full">
          {onToggle && (
            <div className="flex justify-end px-3 pt-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggle}
                title="Recolher ficha"
                aria-label="Recolher ficha do contato"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="wa-side-empty-state flex flex-col items-center justify-center text-center p-6 flex-1">
            <div className="wa-empty-chat-panel">
              <div className="wa-empty-chat-icon mb-4 scale-90">
                <User className="h-8 w-8 text-[var(--wa-brand)]" strokeWidth={1.5} />
              </div>
              <p className="wa-text-title wa-empty-chat-title mb-1">Ficha do contato</p>
              <p className="wa-text-sub wa-empty-chat-desc max-w-[220px] mx-auto">
                Selecione uma conversa para ver dados do CRM e envios.
              </p>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const badge = audienceBadge(context);

  return (
    <aside className="wa-side-panel hidden xl:flex flex-col shrink-0">
      <div className="wa-side-panel-inner flex flex-col min-h-0 overflow-y-auto py-3">
        <div className="wa-side-section">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h2 className="wa-text-title truncate">
                {conversation.display_name || conversation.chat_jid}
              </h2>
              <Badge variant={badge.variant} className={cn('mt-2 wa-badge-sm', badge.className)}>
                {badge.label}
              </Badge>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {onToggle && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggle}
                  title="Recolher ficha"
                  aria-label="Recolher ficha do contato"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {showConfigLink && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                  <Link to={CONVERSAS_CONFIG_PATH} title="Configurar filas">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {context?.isGroup && (
          <div className="wa-side-tabs px-3 mb-1">
            <button
              type="button"
              className={cn('wa-side-tab', activeGroupTab === GROUP_SIDE_TAB_DETALHES && 'wa-side-tab--active')}
              onClick={() => setGroupTab(GROUP_SIDE_TAB_DETALHES)}
            >
              Detalhes
            </button>
            <button
              type="button"
              className={cn('wa-side-tab', activeGroupTab === GROUP_SIDE_TAB_PARTICIPANTES && 'wa-side-tab--active')}
              onClick={() => setGroupTab(GROUP_SIDE_TAB_PARTICIPANTES)}
            >
              <Users className="h-3.5 w-3.5" />
              Participantes
            </button>
          </div>
        )}

        {loading && !context ? (
          <p className="px-4 wa-text-caption">Carregando ficha…</p>
        ) : context?.isGroup && activeGroupTab === GROUP_SIDE_TAB_PARTICIPANTES ? (
          <AtendimentoGrupoParticipantesPanel
            conversation={conversation}
            clienteId={clienteId}
            autoLoad
            compact
          />
        ) : (
          <>
            {context?.isGroup && (
              <div className="wa-side-section wa-text-caption">
                Grupo WhatsApp — tarefas e lembretes internos (sem envio automático no chat).
              </div>
            )}

            {canManagePlanejamento && (
              <AtendimentoGrupoPlanejamentoPanel
                conversation={conversation}
                canManage={canManagePlanejamento}
                onCreateTask={onCreateTask}
                onAgendarLembrete={onAgendarLembrete}
              />
            )}

            {!context?.isGroup && (context?.leadName || context?.productName || context?.formattedValor || context?.statusLabel) && (
              <div className="wa-side-section space-y-3 wa-text-body">
                {context?.leadName && (
                  <SideField label="Nome">
                    <p className="font-medium">{context.leadName}</p>
                  </SideField>
                )}
                {context?.productName && (
                  <SideField label="Produto">
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 shrink-0 mt-0.5 text-[#667781]" />
                      <p>{context.productName}</p>
                    </div>
                  </SideField>
                )}
                {context?.formattedValor && (
                  <SideField label="Valor">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">{context.formattedValor}</p>
                  </SideField>
                )}
                {context?.statusLabel && (
                  <SideField label={context.audienceType === 'base' ? 'Situação' : 'Etapa'}>
                    <Badge
                      className="wa-badge-sm border-0 text-white"
                      style={context.statusColor ? { backgroundColor: context.statusColor } : undefined}
                    >
                      {context.statusLabel}
                    </Badge>
                  </SideField>
                )}
              </div>
            )}

            {!context?.isGroup && (context?.agentName || context?.hasProximaAcao) && (
              <div className="wa-side-section space-y-2 wa-text-body">
                {context?.agentName && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 shrink-0 text-[#667781]" />
                    <span>{context.agentName}</span>
                  </div>
                )}
                {context?.hasProximaAcao && (
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 wa-text-caption">
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    <span>Próxima ação pendente no CRM</span>
                  </div>
                )}
              </div>
            )}

            {!context?.isGroup && !context?.hasCrm && (
              <div className="wa-side-section">
                <p className="wa-text-caption mb-3">
                  Sem cadastro no CRM. Marque como cliente da base — criamos a ficha automaticamente.
                </p>
                <MarkBaseClientButton
                  clienteId={clienteId}
                  conversation={conversation}
                  context={context}
                  onDone={onBaseClientChanged}
                />
              </div>
            )}

            <div className="wa-side-section">
              <AtendimentoMaterialLogPanel
                clienteId={clienteId}
                conversation={conversation}
                csGroup={csGroup}
                className="wa-material-log--compact"
              />
            </div>

            {!context?.isGroup && (
              <div className="wa-side-section space-y-2">
                {context?.leadId && onOpenLead && (
                  <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => onOpenLead(context.leadId)}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir lead no CRM
                  </Button>
                )}
                {clienteId && miniCrmOn && (
                  <Button type="button" variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link to={`/mini-crm?cliente=${encodeURIComponent(clienteId)}&fone=${encodeURIComponent(phoneFromConversation(conversation) || '')}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir no mini CRM
                    </Link>
                  </Button>
                )}
                {crmOn && (
                  <Button type="button" variant="ghost" size="sm" className="w-full justify-start" asChild>
                    <Link to="/crm/contatos">
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      Ver contatos no CRM
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
