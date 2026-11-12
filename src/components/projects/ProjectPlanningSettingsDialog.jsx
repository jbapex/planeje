import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PROJECT_DEADLINE_FIELDS, planningSettingsError, previousMonthDeadlines } from '@/lib/projectPlanningWorkflow';
import { formatDueDatePt } from '@/lib/taskUrgency';
import { useToast } from '@/components/ui/use-toast';

export default function ProjectPlanningSettingsDialog({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const example = previousMonthDeadlines(next.getFullYear(), next.getMonth(), draft);
  const save = async () => {
    const validation = planningSettingsError(draft);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null);
    try { await onSave(draft); toast({ title: 'Planejamento configurado' }); onClose(); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Configurar planejamento</DialogTitle><DialogDescription>Prepare o mês seguinte com antecedência.</DialogDescription></DialogHeader>
      <div className="space-y-5 py-2">
        <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
          <div><Label htmlFor="automatic-planning">Mostrar clientes em A fazer automaticamente</Label><p className="mt-1 text-xs text-muted-foreground">Clientes ativos com planejamento contratado aparecem quando ainda não têm projeto no mês. Desligar apenas oculta essas pendências.</p></div>
          <Switch id="automatic-planning" checked={draft.automatic_pending} onCheckedChange={(value) => setDraft((prev) => ({ ...prev, automatic_pending: value }))} disabled={saving} />
        </div>
        <div className="space-y-1.5"><Label htmlFor="automatic-from-month">Automático a partir de</Label><Input id="automatic-from-month" type="month" value={String(draft.automatic_from_month || '').slice(0, 7)} onChange={(event) => setDraft((prev) => ({ ...prev, automatic_from_month: event.target.value ? `${event.target.value}-01` : '' }))} disabled={saving} /><p className="text-xs text-muted-foreground">Meses anteriores mostram apenas os projetos cadastrados, sem pendências automáticas retroativas.</p></div>
        <div><h3 className="text-sm font-semibold">Dias do mês anterior</h3><p className="mt-1 text-xs text-muted-foreground">O plano de outubro, por exemplo, é preparado em setembro.</p></div>
        <div className="grid grid-cols-2 gap-4">{PROJECT_DEADLINE_FIELDS.map(({ key, label, setting }) => <div key={key} className="space-y-1.5"><Label htmlFor={`planning-${setting}`}>{label}</Label><Input id={`planning-${setting}`} type="number" min="1" max="31" value={draft[setting]} onChange={(event) => setDraft((prev) => ({ ...prev, [setting]: event.target.value }))} disabled={saving} /><p className="text-xs text-muted-foreground">Ex.: {formatDueDatePt(example[key])}</p></div>)}</div>
        <p className="text-xs text-muted-foreground">Em meses curtos, usamos o último dia disponível. Estes prazos são aplicados aos novos projetos; os existentes mantêm suas datas e podem ser ajustados individualmente.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar configuração'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
