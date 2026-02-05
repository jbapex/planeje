import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Modal obrigatório ao mover lead para etapa Ganho ou Perdido.
 * Exige motivo; ao confirmar chama onConfirm(motivo).
 */
export default function MoveToStageModal({ open, onOpenChange, lead, targetStage, onConfirm }) {
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    const trimmed = (motivo || '').trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setMotivo('');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const stageName = targetStage?.nome ? String(targetStage.nome).replace(/_/g, ' ') : 'esta etapa';
  const isPerdido = targetStage?.tipo === 'perdido';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo obrigatório</DialogTitle>
          <DialogDescription>
            Para mover o lead para &quot;{stageName}&quot; é necessário informar o motivo.
            {isPerdido ? ' Isso ajuda na análise de perdas.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="move-motivo">Motivo *</Label>
          <Textarea
            id="move-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={isPerdido ? 'Ex.: Preço alto, concorrente, desistiu...' : 'Ex.: Fechamento à vista, produto X...'}
            rows={3}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!motivo.trim() || submitting}>
            {submitting ? 'Salvando...' : 'Confirmar e mover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
