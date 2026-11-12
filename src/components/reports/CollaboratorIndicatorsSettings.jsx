import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { INDICATOR_PROFILES, formatMonthLabel } from '@/lib/collaboratorIndicators';

const NONE = '__none__';
const VOLUME_GOAL_FIELDS = [
  ['leads_goal', 'Leads', 'int'],
  ['agendamentos_goal', 'Agendamentos', 'int'],
  ['vendas_goal', 'Vendas', 'int'],
];
const GOAL_FIELDS = [
  ['meta_custo_mensagem', 'CPL máx. (R$)', 'money'],
  ['meta_custo_compra', 'CPA máx. (R$)', 'money'],
  ...VOLUME_GOAL_FIELDS,
];

const parseValue = (value, kind) => {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return kind === 'int' ? Math.round(number) : number;
};

function PeopleTab({ people, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(null);
  const save = async (personId, value) => {
    setSaving(personId);
    const { error } = value === NONE
      ? await supabase.from('collaborator_indicator_profiles').delete().eq('profile_id', personId)
      : await supabase.from('collaborator_indicator_profiles').upsert({ profile_id: personId, indicator_profile: value, updated_at: new Date().toISOString() });
    setSaving(null);
    if (error) toast({ title: 'Não foi possível salvar o perfil', description: error.message, variant: 'destructive' });
    else onSaved();
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">O perfil define quais indicadores de entrega e resultado a pessoa recebe. Disciplina vale para todos com perfil.</p>
      {people.map((person) => (
        <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
          <span className="text-sm font-medium">{person.full_name}</span>
          <Select value={person.indicator_profile || NONE} onValueChange={(value) => save(person.id, value)} disabled={saving === person.id}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem perfil</SelectItem>
              {INDICATOR_PROFILES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function GoalsTab({ month, clients, goals, trafficOps, people, focusClientId, onSaved }) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState({});
  const [volumeEdits, setVolumeEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const focused = Boolean(focusClientId);
  const fields = focused ? VOLUME_GOAL_FIELDS : GOAL_FIELDS;
  const hasVolumeEdits = Object.keys(volumeEdits).length > 0;
  const goalByClient = useMemo(() => new Map(goals.map((goal) => [goal.client_id, goal])), [goals]);
  const ownerByClient = useMemo(() => {
    const names = new Map(people.map((person) => [person.id, person.full_name]));
    return new Map(trafficOps.map((row) => [row.client_id, names.get(row.primary_assignee_id) || '']));
  }, [people, trafficOps]);
  const rows = useMemo(() => clients
    .filter((client) => client.etapa === 'closed' && (!focusClientId || client.id === focusClientId))
    .sort((a, b) => Number(ownerByClient.has(b.id)) - Number(ownerByClient.has(a.id)) || String(a.empresa).localeCompare(String(b.empresa), 'pt-BR')), [clients, ownerByClient, focusClientId]);

  useEffect(() => {
    if (focused) return;
    const loaded = Object.fromEntries(rows.map((client) => {
      const goal = goalByClient.get(client.id) || {};
      return [client.id, Object.fromEntries(GOAL_FIELDS.map(([key]) => {
        const value = key.startsWith('meta_') ? client[key] : goal[key];
        return [key, value == null ? '' : String(value)];
      }))];
    }));
    setDrafts((current) => ({ ...loaded, ...current }));
  }, [focused, rows, goalByClient]);

  const changeField = (client, key, value) => {
    if (!focused) {
      setDrafts((current) => ({ ...current, [client.id]: { ...current[client.id], [key]: value } }));
      return;
    }
    setVolumeEdits((current) => {
      const edit = current[key];
      const original = edit ? edit.original : parseValue(goalByClient.get(client.id)?.[key], 'int');
      if (parseValue(value, 'int') !== original) return { ...current, [key]: { value, original } };
      if (!edit) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const save = async (client) => {
    if (focused && !hasVolumeEdits) return;
    const draft = drafts[client.id] || {};
    const parsed = Object.fromEntries(focused
      ? Object.entries(volumeEdits).map(([key, edit]) => [key, parseValue(edit.value, 'int')])
      : GOAL_FIELDS.map(([key, , kind]) => [key, parseValue(draft[key], kind)]));
    if (Object.values(parsed).some((value) => value === undefined)) {
      toast({ title: 'Valor inválido', description: 'Use apenas números positivos.', variant: 'destructive' });
      return;
    }
    setSaving(client.id);
    try {
      const clientUpdate = focused ? null : await supabase.from('clientes')
        .update({ meta_custo_mensagem: parsed.meta_custo_mensagem, meta_custo_compra: parsed.meta_custo_compra })
        .eq('id', client.id);
      const volume = focused ? parsed : {
        leads_goal: parsed.leads_goal,
        agendamentos_goal: parsed.agendamentos_goal,
        vendas_goal: parsed.vendas_goal,
      };
      const hasFunnel = Object.values(volume).some((value) => value != null);
      const goalUpdate = focused || hasFunnel
        ? await supabase.from('client_result_goals').upsert({
          client_id: client.id, reference_month: month, ...volume, updated_at: new Date().toISOString(),
        }, focused ? { onConflict: 'client_id,reference_month' } : undefined)
        : await supabase.from('client_result_goals').delete().eq('client_id', client.id).eq('reference_month', month);
      const error = clientUpdate?.error || goalUpdate.error;
      if (error) {
        toast({ title: 'Não foi possível salvar as metas', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: `Metas de ${client.empresa} salvas` });
      if (focused) {
        await onSaved();
        setVolumeEdits({});
      } else {
        onSaved();
      }
    } finally {
      setSaving(null);
    }
  };

  if (focusClientId && !rows.length) return <p className="text-sm text-muted-foreground">Cliente indisponível para editar as metas deste mês.</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {!focusClientId && 'CPL e CPA ficam no cadastro do cliente e valem para todos os meses. '}
        Leads, agendamentos e vendas valem só para <span className="capitalize">{formatMonthLabel(month)}</span>. Campo vazio não entra no cálculo.
      </p>
      <div className="max-h-[55vh] overflow-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Cliente</th>
              {fields.map(([key, label]) => <th key={key} className="px-2 py-2 text-left">{label}</th>)}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((client) => (
              <tr key={client.id}>
                <td className="px-2 py-1.5">
                  <span className="block font-medium">{client.empresa}</span>
                  {ownerByClient.get(client.id) && <span className="text-xs text-muted-foreground">Tráfego: {ownerByClient.get(client.id)}</span>}
                </td>
                {fields.map(([key, label]) => (
                  <td key={key} className="px-2 py-1.5">
                    <Input
                      className="h-8 w-24"
                      aria-label={focused ? label : undefined}
                      inputMode={focused ? 'numeric' : 'decimal'}
                      disabled={focused && saving === client.id}
                      value={focused
                        ? volumeEdits[key]?.value ?? String(goalByClient.get(client.id)?.[key] ?? '')
                        : drafts[client.id]?.[key] ?? ''}
                      onChange={(event) => changeField(client, key, event.target.value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Button size="sm" variant="outline" disabled={saving === client.id || (focused && !hasVolumeEdits)} onClick={() => save(client)}>Salvar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CollaboratorIndicatorsSettings({ open, onOpenChange, month, data, focusClientId, onSaved }) {
  const goalsTab = data && (
    <GoalsTab key={`${month}:${focusClientId || ''}`} month={month} clients={data.clients} goals={data.goals} trafficOps={data.trafficOps} people={data.people} focusClientId={focusClientId} onSaved={onSaved} />
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{focusClientId ? 'Metas do mês' : 'Configurar indicadores'}</DialogTitle>
          <DialogDescription>{focusClientId ? 'Metas de resultado do cliente selecionado.' : 'Perfil de cada pessoa e metas de resultado dos clientes.'}</DialogDescription>
        </DialogHeader>
        {!data ? <p className="text-sm text-muted-foreground">Carregando…</p> : focusClientId ? goalsTab : (
          <Tabs defaultValue="people">
            <TabsList>
              <TabsTrigger value="people">Pessoas</TabsTrigger>
              <TabsTrigger value="goals">Metas do mês</TabsTrigger>
            </TabsList>
            <TabsContent value="people">
              <PeopleTab people={data.people} onSaved={onSaved} />
            </TabsContent>
            <TabsContent value="goals">
              {goalsTab}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
