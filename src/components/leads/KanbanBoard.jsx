import React, { useMemo, useState, useEffect } from 'react';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import KanbanColumn from './KanbanColumn';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const KanbanBoard = ({
  leads,
  onUpdateLead,
  onShowLeadDetail,
  stages: pipelineStages = [],
  moveLeadToStage,
  onRequestMoveWithModal,
}) => {
  const { settings } = useClienteCrmSettings();
  const [legacyColumns, setLegacyColumns] = useState([]);

  const useStages = pipelineStages.length > 0;

  useEffect(() => {
    if (useStages) return;
    const initialColumns = (settings?.statuses || []).map((s) => ({
      id: s.name,
      title: s.name,
      color: s.color,
      stageId: null,
    }));
    setLegacyColumns(initialColumns);
  }, [settings?.statuses, useStages]);

  const columns = useStages
    ? pipelineStages.map((s) => ({
        id: s.id,
        title: (s.nome || '').replace(/_/g, ' '),
        color: s.color || '#6b7280',
        stageId: s.id,
        stage: s,
      }))
    : legacyColumns;

  const getGroupKey = (lead) => {
    if (useStages) return lead?.stage_id || pipelineStages[0]?.id || lead?.status || 'agendado';
    return lead?.status || 'agendado';
  };

  const { leadsByColumn, valueByColumn } = useMemo(() => {
    const grouped = {};
    const values = {};
    columns.forEach((col) => {
      grouped[col.id] = [];
      values[col.id] = 0;
    });
    (leads || []).forEach((lead) => {
      const key = getGroupKey(lead);
      if (grouped[key]) {
        grouped[key].push(lead);
        values[key] += Number(lead.valor) || 0;
      } else if (columns.length > 0) {
        grouped[key] = [lead];
        values[key] = Number(lead.valor) || 0;
      }
    });
    return { leadsByColumn: grouped, valueByColumn: values };
  }, [leads, columns, useStages]);

  const handleDropLead = (leadId, targetStageId) => {
    const lead = (leads || []).find((l) => l.id === leadId);
    if (!lead) return;
    const currentKey = getGroupKey(lead);
    if (currentKey === targetStageId) return;
    const targetColumn = columns.find((c) => c.id === targetStageId);
    if (!targetColumn) return;
    const isFinal = useStages && targetColumn.stage && (targetColumn.stage.tipo === 'ganho' || targetColumn.stage.tipo === 'perdido');
    if (isFinal && onRequestMoveWithModal) {
      onRequestMoveWithModal(lead, targetColumn.stage);
      return;
    }
    if (moveLeadToStage) moveLeadToStage(lead, targetStageId, {});
  };

  return (
    <ScrollArea className="w-full flex-1 flex flex-col min-h-0">
      <div
        className="flex gap-2 px-2 pt-1 pb-3 items-stretch h-[calc(100vh-14rem)]"
      >
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            stage={column.stage}
            leads={leadsByColumn[column.id] || []}
            totalValue={valueByColumn[column.id] ?? 0}
            onShowLeadDetail={onShowLeadDetail}
            onUpdateLead={onUpdateLead}
            stages={useStages ? pipelineStages : null}
            moveLeadToStage={moveLeadToStage}
            onRequestMoveWithModal={onRequestMoveWithModal}
            onDropLead={handleDropLead}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

export default KanbanBoard;
