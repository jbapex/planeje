import { useEffect, useMemo, useState } from 'react';
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
import { confirmAdsetWrite } from '@/lib/metaAdsetWrite';

export default function TrafegoMetaWriteDialog({ open, onOpenChange, draft, onConfirm }) {
  const [budgetInput, setBudgetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [held, setHeld] = useState(null);
  const [alsoCampaign, setAlsoCampaign] = useState(true);
  const [alsoAdset, setAlsoAdset] = useState(true);
  const [alsoAdsets, setAlsoAdsets] = useState(true);
  const [alsoAds, setAlsoAds] = useState(true);

  useEffect(() => {
    if (draft) setHeld(draft);
  }, [draft]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
      return;
    }
    setBudgetInput(draft?.fromBudgetReais != null ? String(draft.fromBudgetReais) : '');
    setAlsoCampaign(true);
    setAlsoAdset(true);
    setAlsoAdsets(true);
    setAlsoAds(true);
    setError(null);
  }, [open, draft]);

  const copy = useMemo(
    () =>
      confirmAdsetWrite(draft || held, budgetInput, {
        campaign: alsoCampaign,
        adset: alsoAdset,
        adsets: alsoAdsets,
        ads: alsoAds,
      }),
    [draft, held, budgetInput, alsoCampaign, alsoAdset, alsoAdsets, alsoAds]
  );

  const submit = async () => {
    if (!copy.valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(copy.payload);
      onOpenChange(false);
    } catch (e) {
      setError(e?.metaWrite || { code: 'other', title: 'A Meta recusou a alteração', detail: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  const active = draft || held;
  const showAlso = active?.mode === 'status' && active?.toStatus === 'ACTIVE';
  const parentFallback =
    (error?.code === 'tos' || error?.code === 'perm') &&
    active?.mode === 'status' &&
    active?.level === 'ad' &&
    active?.toStatus === 'PAUSED' &&
    active?.parentAdset?.id
      ? active.parentAdset
      : null;

  const pauseParent = async () => {
    if (!parentFallback || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        writes: [{ objectId: String(parentFallback.id), level: 'adset', status: 'PAUSED' }],
      });
      onOpenChange(false);
    } catch (e) {
      setError(e?.metaWrite || { code: 'other', title: 'A Meta recusou a alteração', detail: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.summary}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{copy.detail}</p>
        {copy.blockers?.length ? (
          <ul className="trafego-write-blockers">
            {copy.blockers.map((item) => (
              <li key={item.code}>{item.label}</li>
            ))}
          </ul>
        ) : null}
        {showAlso && copy.alsoCampaign ? (
          <label className="trafego-write-also">
            <input type="checkbox" checked={alsoCampaign} onChange={(e) => setAlsoCampaign(e.target.checked)} />
            Ligar a campanha também ({copy.alsoCampaign.name || 'campanha'})
          </label>
        ) : null}
        {showAlso && copy.alsoAdset ? (
          <label className="trafego-write-also">
            <input type="checkbox" checked={alsoAdset} onChange={(e) => setAlsoAdset(e.target.checked)} />
            Ligar o conjunto também ({copy.alsoAdset.name || 'conjunto'})
          </label>
        ) : null}
        {showAlso && copy.alsoAdsetsCount ? (
          <label className="trafego-write-also">
            <input type="checkbox" checked={alsoAdsets} onChange={(e) => setAlsoAdsets(e.target.checked)} />
            {`Ligar ${copy.alsoAdsetsCount} conjunto${copy.alsoAdsetsCount === 1 ? '' : 's'} desligado${copy.alsoAdsetsCount === 1 ? '' : 's'}`}
          </label>
        ) : null}
        {showAlso && copy.alsoAdsCount ? (
          <label className="trafego-write-also">
            <input type="checkbox" checked={alsoAds} onChange={(e) => setAlsoAds(e.target.checked)} />
            {`Ligar ${copy.alsoAdsCount} anúncio${copy.alsoAdsCount === 1 ? '' : 's'} desligado${copy.alsoAdsCount === 1 ? '' : 's'}`}
          </label>
        ) : null}
        {active?.mode === 'budget' ? (
          <label className="trafego-write-field">
            <span>{active.budgetKind === 'lifetime' ? 'Verba total (R$)' : 'Verba diária (R$)'}</span>
            <input
              type="text"
              inputMode="decimal"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="Ex.: 80"
            />
          </label>
        ) : null}
        {error ? (
          <div className="trafego-write-error">
            {error.title ? <strong>{error.title}</strong> : null}
            <p>{error.detail || error}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          {parentFallback ? (
            <Button type="button" onClick={pauseParent} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Pausar o conjunto
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={!copy.valid || busy || error?.code === 'tos' || error?.code === 'perm'}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Confirmar na Meta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
