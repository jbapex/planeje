import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { googleAdsWritePlan } from '@/lib/googleAdsWrite';

export default function GoogleAdsWriteDialog({ open, onOpenChange, draft, onConfirm }) {
  const [budgetInput, setBudgetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError('');
      return;
    }
    const current = draft?.budgetReais;
    setBudgetInput(current != null && current !== '' ? String(current).replace('.', ',') : '');
    setError('');
    setBusy(false);
  }, [open, draft]);

  const plan = googleAdsWritePlan({
    ...(draft || {}),
    budgetReais: draft?.kind === 'campaign-budget' ? budgetInput : draft?.budgetReais,
  });

  const submit = async () => {
    if (!plan.valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(plan.payload);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'O Google recusou a alteração.');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan.title}</DialogTitle>
          <DialogDescription>{plan.detail}</DialogDescription>
        </DialogHeader>
        {draft?.kind === 'campaign-budget' ? (
          <label className="block text-sm">
            Orçamento diário (R$)
            <input
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              inputMode="decimal"
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!plan.valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmar no Google Ads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
