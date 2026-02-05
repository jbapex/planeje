import React from 'react';
import { useClienteCrmSettings, getStatusText } from '@/contexts/ClienteCrmSettingsContext';
import KanbanCard from './KanbanCard';
import { ScrollArea } from '@/components/ui/scroll-area';

const KanbanColumn = ({
  id,
  title,
  color,
  stage,
  leads,
  totalValue = 0,
  onShowLeadDetail,
  onUpdateLead,
  stages,
  moveLeadToStage,
  onRequestMoveWithModal,
  onDropLead,
  isDropTarget,
}) => {
  const label = stage ? title : getStatusText(title);
  const displayValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    let leadId = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.leadId) leadId = parsed.leadId;
    } catch {
      // use raw as leadId
    }
    if (leadId && onDropLead) onDropLead(leadId, id);
  };

  return (
    <div
      className={`flex flex-col min-w-[260px] w-[260px] flex-shrink-0 h-full min-h-0 border-l border-dotted border-slate-300 first:border-l-0 transition-colors ${isDropTarget ? 'bg-muted/30 ring-1 ring-primary/30' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex-shrink-0">
        <div className="py-2 font-semibold text-xs uppercase tracking-wide text-foreground">
          {label}
        </div>
        <div
          className="h-1 w-full rounded-full"
          style={{ backgroundColor: color || '#94a3b8' }}
        />
        <div className="pt-1.5 pb-2 text-xs text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? 's' : ''}: {displayValue}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 p-2 bg-transparent">
        <div className="space-y-1.5">
          {leads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              currentStageId={id}
              onShowLeadDetail={onShowLeadDetail}
              onUpdateLead={onUpdateLead}
              stages={stages}
              moveLeadToStage={moveLeadToStage}
              onRequestMoveWithModal={onRequestMoveWithModal}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default KanbanColumn;
