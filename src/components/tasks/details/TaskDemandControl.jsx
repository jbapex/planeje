import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';
import TaskFieldHelp from '@/components/tasks/TaskFieldHelp';

const NONE = '__none__';
const DEMAND_TYPES = [
  ['planned', 'Planejada'],
  ['correction', 'Correção'],
  ['change', 'Alteração'],
  ['extra', 'Extra'],
  ['urgency', 'Urgência'],
];
const ORIGINS = [
  ['plan', 'Plano mensal'],
  ['client', 'Cliente'],
  ['internal', 'Interno'],
];

export default function TaskDemandControl({ formData, setFormData, isNewTask }) {
  const [candidateTasks, setCandidateTasks] = useState([]);
  const exceptional = ['correction', 'change', 'extra', 'urgency'].includes(formData.demand_type);
  const [open, setOpen] = useState(exceptional);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const taskResult = await supabase.from('tarefas').select('id, title, due_date, client_id').neq('id', formData.id || '00000000-0000-0000-0000-000000000000').order('due_date', { ascending: true }).limit(150);
      if (cancelled) return;
      if (!taskResult.error) setCandidateTasks(taskResult.data || []);
    };
    void load();
    return () => { cancelled = true; };
  }, [formData.id]);

  useEffect(() => { if (exceptional) setOpen(true); }, [exceptional]);

  const filteredCandidates = useMemo(() => {
    const sameClient = candidateTasks.filter((task) => formData.client_id && task.client_id === formData.client_id);
    return sameClient.length ? sameClient : candidateTasks;
  }, [candidateTasks, formData.client_id]);

  const change = (field, value) => setFormData((current) => ({ ...current, [field]: value }));
  const clearReplanning = () => setFormData((current) => ({
    ...current,
    displaced_task_id: null,
    reschedule_reason: null,
  }));

  return (
    <div className="rounded-xl border bg-muted/20">
      <div className="flex items-center justify-between gap-3 p-3">
        <button type="button" className="flex flex-1 items-center gap-2 text-left font-semibold" onClick={() => setOpen((value) => !value)}>
          <Repeat2 className="h-4 w-4 text-violet-600" />
          {exceptional ? `Exceção: ${DEMAND_TYPES.find(([value]) => value === formData.demand_type)?.[1] || 'demanda'}` : 'Exceção'}
          <span className="text-xs font-normal text-muted-foreground">{open ? 'Recolher' : 'Abrir'}</span>
        </button>
        <TaskFieldHelp label="Ajuda sobre exceção">
          Use somente quando algo sair do planejamento normal. A etapa do fluxo define a função responsável. Se uma urgência deslocar outra entrega, escolha a tarefa afetada e explique o motivo.
        </TaskFieldHelp>
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-4 border-t p-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de demanda</Label>
            <Select value={formData.demand_type || NONE} onValueChange={(value) => change('demand_type', value === NONE ? null : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ainda não definido</SelectItem>
                {DEMAND_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Select value={formData.demand_origin || NONE} onValueChange={(value) => change('demand_origin', value === NONE ? null : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ainda não definida</SelectItem>
                {ORIGINS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SLA em dias úteis</Label>
            <Input type="number" min="0" max="365" value={formData.sla_days ?? ''} onChange={(event) => change('sla_days', event.target.value === '' ? null : Number(event.target.value))} placeholder="Definir" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data prometida ao cliente</Label>
            <Input type="date" value={formData.customer_promised_date || ''} onChange={(event) => change('customer_promised_date', event.target.value || null)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rodada de revisão</Label>
            <Input type="number" min="0" max="999" value={formData.review_round ?? 0} onChange={(event) => change('review_round', Number(event.target.value || 0))} />
            {(formData.review_round || 0) >= 3 && (
              <p className="flex items-center gap-1 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />3 ou mais rodadas: revisar causa e escopo.</p>
            )}
          </div>
          {!isNewTask && (
            <div className="space-y-3 rounded-lg border border-dashed p-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold">Replanejamento causado por esta tarefa</Label>
                {(formData.displaced_task_id || formData.reschedule_reason) && <Button type="button" variant="ghost" size="sm" onClick={clearReplanning}>Limpar</Button>}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tarefa deslocada</Label>
                  <Select value={formData.displaced_task_id || NONE} onValueChange={(value) => change('displaced_task_id', value === NONE ? null : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nenhuma</SelectItem>
                      {filteredCandidates.map((task) => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Motivo</Label>
                  <Textarea rows={2} value={formData.reschedule_reason || ''} onChange={(event) => change('reschedule_reason', event.target.value || null)} placeholder="Obrigatório ao escolher uma tarefa" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
