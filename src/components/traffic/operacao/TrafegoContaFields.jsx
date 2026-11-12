import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TRAFFIC_SITUATIONS } from '@/lib/centralTrafego';

export function TrafegoContaFields({ client, team = [], onSaveOps, onSaveBudget, focus, compact }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
  const [gestorId, setGestorId] = useState(client?.gestorId || '');
  const [situation, setSituation] = useState(client?.situation || 'active');
  const [reason, setReason] = useState(client?.situationReason || '');
  const [resumeAt, setResumeAt] = useState(client?.resumeAt || '');
  const [budget, setBudget] = useState(client?.budget?.available ? String(client.budget.value) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGestorId(client?.gestorId || '');
    setSituation(client?.situation || 'active');
    setReason(client?.situationReason || '');
    setResumeAt(client?.resumeAt || '');
    setBudget(client?.budget?.available ? String(client.budget.value) : '');
  }, [client?.clientId, client?.gestorId, client?.situation, client?.situationReason, client?.resumeAt, client?.budget?.value, client?.budget?.available]);

  if (!client) return null;

  const persistOps = async (patch) => {
    setSaving(true);
    const result = await onSaveOps?.(client, patch);
    setSaving(false);
    if (!result?.ok) {
      toast({ title: 'Não foi possível gravar a conta', description: result?.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Conta atualizada' });
    return true;
  };

  const persistBudget = async () => {
    const current = client.budget?.available ? String(client.budget.value) : '';
    if (budget === current) return;
    setSaving(true);
    const result = await onSaveBudget?.(client, budget);
    setSaving(false);
    if (!result?.ok) {
      toast({ title: 'Não foi possível gravar o orçamento', description: result?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Orçamento atualizado' });
  };

  return (
    <div className={`trafego-conta-grid${compact ? ' is-compact' : ''}`}>
      <div className={`trafego-field${focus === 'gestor' ? ' is-focus' : ''}`}>
        <label htmlFor={`trafego-gestor-${client.clientId}`}>Gestor oficial</label>
        {isAdmin ? (
          <select
            id={`trafego-gestor-${client.clientId}`}
            value={gestorId}
            disabled={saving}
            onChange={(e) => {
              const value = e.target.value;
              setGestorId(value);
              persistOps({
                primaryAssigneeId: value || null,
                situation: situation || 'onboarding',
                situationReason: reason,
                resumeAt,
              });
            }}
          >
            <option value="">Sem gestor</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.id}
              </option>
            ))}
          </select>
        ) : (
          <p className="trafego-muted">{client.gestorName || 'Peça ao admin para definir o gestor'}</p>
        )}
      </div>
      <div className={`trafego-field${focus === 'situation' ? ' is-focus' : ''}`}>
        <label htmlFor={`trafego-sit-${client.clientId}`}>Situação</label>
        <select
          id={`trafego-sit-${client.clientId}`}
          value={situation}
          disabled={saving || (!isAdmin && !client.gestorId)}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            setSituation(value);
            persistOps({
              primaryAssigneeId: gestorId || null,
              situation: value,
              situationReason: reason,
              resumeAt,
            });
          }}
        >
          <option value="">Definir…</option>
          {TRAFFIC_SITUATIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className={`trafego-field${focus === 'budget' ? ' is-focus' : ''}`}>
        <label htmlFor={`trafego-budget-${client.clientId}`}>Orçamento mensal (Meta)</label>
        <input
          id={`trafego-budget-${client.clientId}`}
          type="number"
          min="0"
          step="0.01"
          placeholder="Ex.: 2500"
          value={budget}
          disabled={saving}
          onChange={(e) => setBudget(e.target.value)}
          onBlur={persistBudget}
        />
      </div>
      <div className="trafego-field">
        <label htmlFor={`trafego-resume-${client.clientId}`}>Retomada</label>
        <input
          id={`trafego-resume-${client.clientId}`}
          type="date"
          value={resumeAt || ''}
          disabled={saving || (!isAdmin && !client.gestorId)}
          onChange={(e) => setResumeAt(e.target.value)}
          onBlur={(e) => {
            if ((e.target.value || '') === (client.resumeAt || '')) return;
            persistOps({
              primaryAssigneeId: gestorId || null,
              situation: situation || 'active',
              situationReason: reason,
              resumeAt: e.target.value || null,
            });
          }}
        />
      </div>
      <div className="trafego-field is-wide">
        <label htmlFor={`trafego-reason-${client.clientId}`}>Motivo</label>
        <input
          id={`trafego-reason-${client.clientId}`}
          placeholder="Por que está assim"
          value={reason}
          disabled={saving || (!isAdmin && !client.gestorId)}
          onChange={(e) => setReason(e.target.value)}
          onBlur={(e) => {
            if ((e.target.value || '') === (client.situationReason || '')) return;
            persistOps({
              primaryAssigneeId: gestorId || null,
              situation: situation || 'active',
              situationReason: e.target.value,
              resumeAt,
            });
          }}
        />
      </div>
    </div>
  );
}

export default function TrafegoContaDialog({ open, onOpenChange, client, team, onSaveOps, onSaveBudget, focus }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{client?.empresa || 'Conta de tráfego'}</DialogTitle>
          <DialogDescription>
            Defina gestor, situação e orçamento nesta ficha. Sem campanha no ar, use “Sem campanha esperada”.
          </DialogDescription>
        </DialogHeader>
        <TrafegoContaFields
          client={client}
          team={team}
          onSaveOps={onSaveOps}
          onSaveBudget={onSaveBudget}
          focus={focus}
        />
        <DialogFooter>
          <button type="button" className="trafego-btn" onClick={() => onOpenChange(false)}>
            Fechar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
