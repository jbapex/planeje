import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarClock, ExternalLink, Package, User } from 'lucide-react';
import MarkBaseClientButton from '@/components/atendimento/MarkBaseClientButton';

export default function AtendimentoContextBar({
  context,
  loading,
  onOpenLead,
  clienteId,
  conversation,
  onBaseClientChanged,
}) {
  if (loading && !context?.hasCrm) {
    return (
      <div className="wa-context-bar wa-context-bar--loading">
        <p className="wa-text-caption">Carregando contexto…</p>
      </div>
    );
  }

  if (!context || context.isGroup) return null;

  if (!context.hasCrm) {
    return (
      <div className="wa-context-bar flex flex-wrap items-center gap-2">
        <p className="wa-text-caption flex-1 min-w-[140px]">Contato sem ficha — marque como cliente da base:</p>
        <MarkBaseClientButton
          clienteId={clienteId}
          conversation={conversation}
          context={context}
          onDone={onBaseClientChanged}
          compact
        />
      </div>
    );
  }

  const isBase = context.audienceType === 'base';

  return (
    <div className="wa-context-bar">
      <div className="flex flex-wrap items-center gap-2">
        {isBase && (
          <Badge className="wa-badge-sm bg-emerald-600 hover:bg-emerald-600 border-0 shrink-0">Cliente da base</Badge>
        )}
        {context.audienceType === 'commercial' && (
          <Badge variant="secondary" className="wa-badge-sm shrink-0">Lead comercial</Badge>
        )}
        {context.productName && (
          <span className="wa-context-chip wa-context-chip--product">
            <Package className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[180px]">{context.productName}</span>
          </span>
        )}
        {context.formattedValor && (
          <span className="wa-context-chip wa-context-chip--price">{context.formattedValor}</span>
        )}
        {context.statusLabel && (
          <Badge
            className="wa-badge-sm font-medium border-0 text-white shrink-0"
            style={context.statusColor ? { backgroundColor: context.statusColor } : undefined}
            variant={context.statusColor ? 'secondary' : 'secondary'}
          >
            {context.statusLabel}
          </Badge>
        )}
        {context.hasProximaAcao && (
          <span className="wa-context-chip wa-context-chip--task">
            <CalendarClock className="h-3.5 w-3.5" />
            Próxima ação
          </span>
        )}
        {context.agentName && (
          <span className="wa-context-chip wa-context-chip--agent">
            <User className="h-3.5 w-3.5" />
            {context.agentName}
          </span>
        )}
        {context.leadId && onOpenLead && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 wa-text-caption text-[var(--wa-active)]"
            onClick={() => onOpenLead(context.leadId)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            {isBase ? 'Ver ficha no CRM' : 'Ver no CRM'}
          </Button>
        )}
        <MarkBaseClientButton
          clienteId={clienteId}
          conversation={conversation}
          context={context}
          onDone={onBaseClientChanged}
          compact
          className="ml-auto"
        />
      </div>
    </div>
  );
}
