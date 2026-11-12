import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  CHECKUP_INDICATORS,
  CHECKUP_WEEKDAYS,
  DEFAULT_CHECKUP_INDICATORS,
  DEFAULT_CHECKUP_WEEKDAYS,
  validateCheckupSettingsInput,
} from '@/lib/centralTrafegoCheckup';
import { upsertTrafficCheckupSettings } from '@/lib/centralTrafegoApi';

export default function CentralTrafegoCheckupSettingsDialog({
  open,
  onOpenChange,
  client,
  team = [],
  onSaved,
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
  const settings = client?.settings || {};

  const [enabled, setEnabled] = useState(true);
  const [weekdays, setWeekdays] = useState(DEFAULT_CHECKUP_WEEKDAYS);
  const [expectedTime, setExpectedTime] = useState('');
  const [requireActiveCampaign, setRequireActiveCampaign] = useState(true);
  const [requireBudget, setRequireBudget] = useState(false);
  const [indicators, setIndicators] = useState(DEFAULT_CHECKUP_INDICATORS);
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEnabled(settings.enabled !== false);
    setWeekdays(
      Array.isArray(settings.weekdays) && settings.weekdays.length
        ? settings.weekdays.map(Number)
        : DEFAULT_CHECKUP_WEEKDAYS
    );
    const time = settings.expected_time ? String(settings.expected_time).slice(0, 5) : '';
    setExpectedTime(time);
    setRequireActiveCampaign(
      settings.require_active_campaign != null
        ? Boolean(settings.require_active_campaign)
        : client?.require_active_campaign !== false && client?.situation !== 'no_campaign_expected'
    );
    setRequireBudget(Boolean(settings.require_budget));
    setIndicators({ ...DEFAULT_CHECKUP_INDICATORS, ...(settings.check_indicators || client?.indicators || {}) });
    setAssigneeId(settings.assignee_id || client?.gestor_id || '');
  }, [open, client, settings.enabled, settings.weekdays, settings.expected_time, settings.require_active_campaign, settings.require_budget, settings.check_indicators, settings.assignee_id]);

  const toggleDay = (day) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  const save = async () => {
    const parsed = validateCheckupSettingsInput({
      enabled,
      weekdays,
      expectedTime: expectedTime || null,
      requireActiveCampaign,
      requireBudget,
      indicators,
    });
    if (!parsed.ok) {
      toast({ title: parsed.errors[0], variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await upsertTrafficCheckupSettings({
        clientId: client.client_id,
        enabled,
        weekdays,
        expectedTime: expectedTime || null,
        requireActiveCampaign,
        requireBudget,
        indicators,
        assigneeId: isAdmin ? assigneeId || null : null,
      });
      if (error) throw error;
      toast({ title: 'Check-up configurado' });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Não foi possível gravar', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Check-up de {client?.empresa || 'cliente'}</DialogTitle>
          <DialogDescription>
            Define se esta conta entra na rotina do dia. Sem campanha esperada, desmarque a exigência para não gerar alerta falso.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Check-up ativo
        </label>

        <div className="space-y-2">
          <Label>Dias da semana</Label>
          <div className="flex flex-wrap gap-1.5">
            {CHECKUP_WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                type="button"
                size="sm"
                variant={weekdays.includes(day.value) ? 'default' : 'outline'}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="checkup-time">Horário esperado</Label>
          <Input
            id="checkup-time"
            type="time"
            value={expectedTime}
            onChange={(e) => setExpectedTime(e.target.value)}
          />
        </div>

        {isAdmin ? (
          <div className="space-y-1">
            <Label htmlFor="checkup-assignee">Gestor responsável</Label>
            <select
              id="checkup-assignee"
              className="central-sit-select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Usar gestor oficial da ficha</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.id}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requireActiveCampaign}
            onChange={(e) => setRequireActiveCampaign(e.target.checked)}
          />
          Deve existir campanha ativa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requireBudget} onChange={(e) => setRequireBudget(e.target.checked)} />
          Orçamento obrigatório
        </label>

        <div className="space-y-2">
          <Label>Indicadores a conferir</Label>
          <div className="grid gap-1.5">
            {CHECKUP_INDICATORS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={indicators[item.key] !== false}
                  onChange={(e) => setIndicators((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
