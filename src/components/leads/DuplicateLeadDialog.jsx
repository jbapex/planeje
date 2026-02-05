import React from 'react';
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

const DuplicateLeadDialog = ({ open, onOpenChange, existingLead, newLeadData, onConfirm, onCancel }) => {
  if (!existingLead) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onOpenChange?.(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange?.(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lead já existe</AlertDialogTitle>
          <AlertDialogDescription>
            Já existe um lead com o WhatsApp informado ({existingLead.whatsapp}). Deseja atualizar os dados do lead existente com as
            informações que você acabou de preencher?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Não, cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Sim, atualizar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DuplicateLeadDialog;
