import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
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

const LeadsHeader = ({
  selectedLeads,
  onBulkDelete,
  viewMode,
}) => {
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState(false);

  const handleBulkDelete = () => {
    onBulkDelete(selectedLeads);
    setBulkDeleteConfirmation(false);
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {selectedLeads.length > 0 && viewMode !== 'kanban' && (
          <Button variant="destructive" className="h-8 text-xs" onClick={() => setBulkDeleteConfirmation(true)}>
            Excluir ({selectedLeads.length})
          </Button>
        )}
      </div>

      {bulkDeleteConfirmation && (
        <AlertDialog open={bulkDeleteConfirmation} onOpenChange={setBulkDeleteConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir leads selecionados?</AlertDialogTitle>
              <AlertDialogDescription>
                Você tem certeza que deseja excluir os {selectedLeads.length} leads selecionados? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
                Sim, excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default LeadsHeader;
