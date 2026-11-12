import { useEffect, useMemo, useState } from 'react';
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
  MANUAL_DEMAND_TYPES,
  TRAFFIC_PRIORITIES,
  createsCampaignAsset,
  demandRequiresExistingCampaign,
  isReviewDemandType,
  validateCreateDemandInput,
} from '@/lib/centralTrafego';
import { createTrafficDemand } from '@/lib/centralTrafegoApi';

export default function CentralTrafegoDemandaForm({
  open,
  onOpenChange,
  clients,
  campaigns,
  team,
  presetClientId,
  presetDemandType,
  presetTitle,
  onSaved,
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(presetClientId || '');
  const [demandType, setDemandType] = useState('ajuste');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState(user?.id || '');
  const [description, setDescription] = useState('');
  const [campaignIds, setCampaignIds] = useState([]);
  const [nextReviewAt, setNextReviewAt] = useState('');
  const [campName, setCampName] = useState('');
  const [campBudget, setCampBudget] = useState('');
  const [campAssignee, setCampAssignee] = useState(user?.id || '');
  const [campKpi, setCampKpi] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const isNova = createsCampaignAsset(demandType);

  const clientCampaigns = useMemo(
    () => (campaigns || []).filter((c) => !clientId || c.client_id === clientId),
    [campaigns, clientId]
  );

  useEffect(() => {
    if (open) {
      setTitle(presetTitle || '');
      setClientId(presetClientId || '');
      setDemandType(presetDemandType || 'ajuste');
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      setDue(presetClientId && presetDemandType ? today : '');
      setPriority('medium');
      setAssigneeId(user?.id || '');
      setDescription('');
      setCampaignIds([]);
      setNextReviewAt('');
      setCampName('');
      setCampBudget('');
      setCampAssignee(user?.id || '');
      setCampKpi('');
      setCampDesc('');
    }
  }, [open, presetClientId, presetDemandType, presetTitle, user?.id]);

  const toggleCampaign = (id) => {
    setCampaignIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    const assigneeIds = isAdmin ? (assigneeId ? [assigneeId] : []) : user?.id ? [user.id] : [];
    const links = isNova
      ? []
      : campaignIds.map((id) => {
          const camp = clientCampaigns.find((c) => c.id === id);
          return { paid_campaign_id: id, client_id: camp?.client_id || clientId, relation_type: 'linked' };
        });
    const campaign = isNova
      ? {
          name: campName,
          budget: campBudget,
          assigneeId: isAdmin ? campAssignee : user?.id,
          kpis: campKpi.trim() ? [{ name: campKpi.trim(), target: '', current: '' }] : [],
          description: campDesc,
        }
      : null;

    const parsed = validateCreateDemandInput({
      title,
      clientId,
      demandType,
      dueDate: due,
      priority,
      assigneeIds,
      links,
      campaign,
      role: profile?.role,
      accessLevel: isAdmin ? 'all' : undefined,
      actorId: user?.id,
    });
    if (!parsed.ok) {
      toast({ title: parsed.errors[0], variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await createTrafficDemand({
        title: title.trim(),
        clientId,
        demandType,
        dueDate: due,
        priority,
        assigneeIds,
        description: description.trim() || null,
        links: isNova ? [] : campaignIds.map((id) => ({ paid_campaign_id: id, relation_type: 'linked' })),
        campaign: isNova
          ? {
              name: campName.trim(),
              budget: campBudget,
              assignee_id: isAdmin ? campAssignee : user?.id,
              kpis: campKpi.trim() ? [{ name: campKpi.trim(), target: '', current: '' }] : [],
              description: campDesc.trim() || '',
            }
          : null,
        sourceType: 'manual',
        nextReviewAt: nextReviewAt ? new Date(nextReviewAt).toISOString() : null,
      });
      if (error) throw error;
      toast({ title: 'Demanda criada' });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Não foi possível criar', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar demanda de tráfego</DialogTitle>
          <DialogDescription>
            Cliente, título, responsável, prazo, prioridade e tipo são obrigatórios.
            {!isAdmin ? ' Esta demanda fica com você.' : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ct-client">Cliente</Label>
            <select
              id="ct-client"
              className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setCampaignIds([]);
              }}
            >
              <option value="">Escolher…</option>
              {(clients || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.empresa}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ct-type">Tipo</Label>
            <select
              id="ct-type"
              className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={demandType}
              onChange={(e) => {
                setDemandType(e.target.value);
                if (createsCampaignAsset(e.target.value)) setCampaignIds([]);
              }}
            >
              {MANUAL_DEMAND_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ct-title">O que precisa ser feito</Label>
            <Input id="ct-title" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ct-desc">Detalhe (opcional)</Label>
            <textarea
              id="ct-desc"
              className="mt-1 w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ct-due">Prazo</Label>
              <Input id="ct-due" className="mt-1" type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="ct-priority">Prioridade</Label>
              <select
                id="ct-priority"
                className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {TRAFFIC_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="ct-assignee">Responsável</Label>
            {isAdmin ? (
              <select
                id="ct-assignee"
                className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Escolher…</option>
                {(team || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.id}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Você (gestor da demanda)</p>
            )}
          </div>
          {isReviewDemandType(demandType) || demandType === 'analise' || demandType === 'ajuste' ? (
            <div>
              <Label htmlFor="ct-review">Próxima revisão (quando aplicável)</Label>
              <Input
                id="ct-review"
                className="mt-1"
                type="datetime-local"
                value={nextReviewAt}
                onChange={(e) => setNextReviewAt(e.target.value)}
              />
            </div>
          ) : null}

          {isNova ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Nova campanha (ativo)</p>
              <div>
                <Label htmlFor="ct-cname">Nome</Label>
                <Input id="ct-cname" className="mt-1" value={campName} onChange={(e) => setCampName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-cbudget">Orçamento</Label>
                <Input
                  id="ct-cbudget"
                  className="mt-1"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={campBudget}
                  onChange={(e) => setCampBudget(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ct-cresp">Responsável da campanha</Label>
                {isAdmin ? (
                  <select
                    id="ct-cresp"
                    className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={campAssignee}
                    onChange={(e) => setCampAssignee(e.target.value)}
                  >
                    <option value="">Escolher…</option>
                    {(team || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Você</p>
                )}
              </div>
              <div>
                <Label htmlFor="ct-ckpi">KPI</Label>
                <Input id="ct-ckpi" className="mt-1" value={campKpi} onChange={(e) => setCampKpi(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-cdesc">Descrição da campanha</Label>
                <textarea
                  id="ct-cdesc"
                  className="mt-1 w-full min-h-[64px] rounded-md border bg-background px-3 py-2 text-sm"
                  value={campDesc}
                  onChange={(e) => setCampDesc(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <Label>
                Campanhas existentes
                {demandRequiresExistingCampaign(demandType) ? ' (obrigatório)' : ' (quando necessário)'}
              </Label>
              <div className="mt-1 max-h-36 overflow-y-auto rounded-md border p-2 space-y-1">
                {clientCampaigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma campanha deste cliente no seu escopo.</p>
                ) : (
                  clientCampaigns.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={campaignIds.includes(c.id)} onChange={() => toggleCampaign(c.id)} />
                      {c.name || 'Campanha sem nome'}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar demanda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
