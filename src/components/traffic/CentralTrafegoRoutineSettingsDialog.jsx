import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { upsertTrafficClientRoutines } from '@/lib/centralTrafegoApi';

export default function CentralTrafegoRoutineSettingsDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}) {
  const { toast } = useToast();
  const routine = client?.routine || {};
  const [reportEnabled, setReportEnabled] = useState(true);
  const [crmWeekly, setCrmWeekly] = useState(false);
  const [groupWeekly, setGroupWeekly] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReportEnabled(routine.report_enabled !== false);
    setCrmWeekly(Boolean(routine.crm_weekly_enabled));
    setGroupWeekly(routine.group_weekly_enabled !== false);
  }, [open, routine.report_enabled, routine.crm_weekly_enabled, routine.group_weekly_enabled]);

  const save = async () => {
    if (!client?.client_id) return;
    setSaving(true);
    try {
      const { error } = await upsertTrafficClientRoutines({
        clientId: client.client_id,
        reportEnabled,
        crmWeeklyEnabled: crmWeekly,
        groupWeeklyEnabled: groupWeekly,
        reportCadence: 15,
      });
      if (error) throw error;
      toast({ title: 'Rotina salva' });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rotina fixa</DialogTitle>
          <DialogDescription>
            {client?.empresa || 'Cliente'} — relatório, resumo no grupo e CRM.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={reportEnabled}
              onChange={(e) => setReportEnabled(e.target.checked)}
              className="mt-0.5 accent-violet-600"
            />
            <span>
              <strong>Relatório de tráfego</strong> no 1º dia útil e no dia 15
              <span className="block text-muted-foreground text-xs mt-0.5">
                Se o dia 1 ou o dia 15 cair no fim de semana, a demanda vai para a segunda. PDF no Canva → anexar ao concluir.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={groupWeekly}
              onChange={(e) => setGroupWeekly(e.target.checked)}
              className="mt-0.5 accent-violet-600"
            />
            <span>
              <strong>Resumo no grupo toda segunda</strong>
              <span className="block text-muted-foreground text-xs mt-0.5">
                Cria a demanda com o texto da semana. Só entra cliente com grupo vinculado. A mensagem não sai sozinha.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={crmWeekly}
              onChange={(e) => setCrmWeekly(e.target.checked)}
              className="mt-0.5 accent-violet-600"
            />
            <span>
              <strong>CRM toda segunda</strong>
              <span className="block text-muted-foreground text-xs mt-0.5">
                Leads da semana passada sem comprou/não comprou → demanda analise.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
