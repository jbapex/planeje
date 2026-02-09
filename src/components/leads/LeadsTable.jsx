import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EditableLeadRow from './EditableLeadRow';
import DisplayLeadRow from './DisplayLeadRow';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const LeadsTable = ({
  leads,
  selectedLeads,
  setSelectedLeads,
  onUpdateLead,
  onDeleteLead,
  getStatusIcon,
  getStatusText,
  onShowLeadDetail,
  onEdit,
  lastLeadElementRef,
  stages,
  moveLeadToStage,
}) => {
  const useStages = Array.isArray(stages) && stages.length > 0;
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [leadIdToDelete, setLeadIdToDelete] = useState(null);

  const handleSelectAll = (checked) => {
    if (checked) setSelectedLeads(leads.map((l) => l.id));
    else setSelectedLeads([]);
  };

  const handleSelectOne = (leadId, checked) => {
    if (checked) setSelectedLeads((prev) => [...prev, leadId]);
    else setSelectedLeads((prev) => prev.filter((id) => id !== leadId));
  };

  const handleDeleteConfirmation = () => {
    if (leadIdToDelete) {
      onDeleteLead(leadIdToDelete);
      setLeadIdToDelete(null);
    }
  };

  const leadToDelete = useMemo(() => (leadIdToDelete ? leads.find((l) => l.id === leadIdToDelete) : null), [leadIdToDelete, leads]);

  return (
    <>
      <div className="overflow-x-auto rounded-md border [&_th]:h-9 [&_th]:px-3 [&_th]:text-xs [&_td]:py-2 [&_td]:px-3 [&_td]:text-xs">
        <Table className="text-xs">
          <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={leads.length > 0 && selectedLeads.length === leads.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                aria-label="Selecionar todos"
                className="rounded"
              />
            </TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Entrada</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Fonte</TableHead>
            <TableHead>Agendamento</TableHead>
            <TableHead>{useStages ? 'Etapa' : 'Status'}</TableHead>
            <TableHead>Próx. ação</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Etiquetas</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead className="w-[90px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, index) => {
            const isLast = index === leads.length - 1;
            return (
              <React.Fragment key={lead.id}>
                {editingLeadId === lead.id ? (
                  <EditableLeadRow
                    lead={lead}
                    stages={stages}
                    onSave={(data) => {
                      onUpdateLead(data.id, data);
                      setEditingLeadId(null);
                    }}
                    onCancel={() => setEditingLeadId(null)}
                  />
                ) : (
                  <DisplayLeadRow
                    lead={lead}
                    selected={selectedLeads.includes(lead.id)}
                    onSelectOne={handleSelectOne}
                    onEdit={(l) => {
                      setEditingLeadId(l.id);
                      onEdit?.(l);
                    }}
                    onDelete={(id) => setLeadIdToDelete(id)}
                    onShowLeadDetail={onShowLeadDetail}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    onUpdateLead={onUpdateLead}
                    stages={stages}
                    moveLeadToStage={moveLeadToStage}
                  />
                )}
                {isLast && lastLeadElementRef && (
                  <TableRow>
                    <TableCell colSpan={14} ref={lastLeadElementRef} className="p-0 h-1 border-0" aria-hidden />
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
        </Table>
      </div>

      {leadToDelete && (
        <AlertDialog open={!!leadIdToDelete} onOpenChange={() => setLeadIdToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso removerá permanentemente o lead &quot;{leadToDelete.nome}&quot; do sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirmation} className="bg-destructive text-destructive-foreground">
                Sim, excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default LeadsTable;
