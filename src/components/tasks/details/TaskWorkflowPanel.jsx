import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { cn } from '@/lib/utils';
import TaskFieldHelp from '@/components/tasks/TaskFieldHelp';

const stagesOf = (template) => Array.isArray(template?.stages) ? template.stages : [];

export default function TaskWorkflowPanel({ formData, setFormData, isNewTask, onStatusChange }) {
  const [templates, setTemplates] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [templateResult, functionResult] = await Promise.all([
        supabase.from('task_workflow_templates').select('id,name,task_types,stages,is_active').eq('is_active', true).order('name'),
        supabase.from('task_operational_functions').select('id,name'),
      ]);
      if (cancelled) return;
      if (templateResult.error) {
        setError('Não foi possível carregar o fluxo desta tarefa.');
        return;
      }
      setTemplates(templateResult.data || []);
      if (!functionResult.error) setFunctions(functionResult.data || []);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => {
    const byId = templates.find((item) => item.id === formData.workflow_template_id);
    if (byId && (byId.task_types || []).includes(formData.type)) return byId;
    return templates.find((item) => (item.task_types || []).includes(formData.type)) || null;
  }, [templates, formData.workflow_template_id, formData.type]);
  const stages = stagesOf(selected);
  const statusIndex = stages.findIndex((stage) => stage.status_value === formData.status);
  const currentIndex = statusIndex >= 0
    ? statusIndex
    : stages.findIndex((stage) => stage.key === formData.workflow_stage_key);
  const current = currentIndex >= 0 ? stages[currentIndex] : null;
  const configuredEntry = stages.find((stage) => stage.key === formData.workflow_entry_stage_key);
  const entry = configuredEntry && configuredEntry.key !== stages[0]?.key ? configuredEntry : stages[1] || stages[0] || null;
  const entryIndex = stages.findIndex((stage) => stage.key === entry?.key);
  const isChange = formData.status === 'alteração';
  const returnReview = isChange ? [...stages].reverse().find((stage) => stage.kind === 'review') : null;
  const next = isChange ? returnReview : current?.key === stages[0]?.key ? entry : currentIndex >= 0 ? stages[currentIndex + 1] : null;
  const functionName = (id) => functions.find((item) => item.id === id)?.name || 'Função não encontrada';

  useEffect(() => {
    if (!isNewTask || !selected || formData.workflow_template_id === selected.id) return;
    const first = stagesOf(selected)[0];
    setFormData((value) => ({
      ...value,
      workflow_template_id: selected.id,
      workflow_stage_key: first?.key || null,
      workflow_entry_stage_key: stagesOf(selected)[1]?.key || first?.key || null,
      status: first?.status_value || value.status,
      operational_function_id: null,
    }));
  }, [isNewTask, selected, formData.workflow_template_id, setFormData]);

  if (!formData.type || !selected) return error ? <p className="text-sm text-red-600">{error}</p> : null;

  const activate = () => {
    const first = stages[0];
    setFormData((value) => ({
      ...value,
      workflow_template_id: selected.id,
      workflow_stage_key: first?.key || null,
      workflow_entry_stage_key: stages[1]?.key || first?.key || null,
      operational_function_id: null,
    }));
    if (first?.status_value) void onStatusChange(first.status_value);
  };

  const advance = () => {
    if (next?.status_value) void onStatusChange(next.status_value);
  };

  if (!isNewTask && !formData.workflow_template_id) {
    return <section className="rounded-xl border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <Route className="h-4 w-4 text-violet-600" />{selected.name}
          <TaskFieldHelp label="Sobre o fluxo">Esta tarefa ainda não usa o fluxo. Aplicar coloca em A Fazer.</TaskFieldHelp>
        </p>
        <Button type="button" size="sm" variant="outline" onClick={activate}>Aplicar fluxo em A Fazer</Button>
      </div>
    </section>;
  }

  const nowLabel = isNewTask
    ? `A Fazer · ${entry?.label || 'primeira etapa'}`
    : isChange
      ? 'Alteração'
      : current?.key === stages[0]?.key
        ? `A Fazer · ${entry?.label || 'primeira etapa'}`
        : current
          ? current.label
          : 'Fora do fluxo';

  return <section className="rounded-xl border bg-violet-50/40 p-3 dark:bg-violet-950/20">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-1">
        <p className="flex items-center gap-2 font-semibold"><Route className="h-4 w-4 text-violet-600" />Fluxo do material</p>
        <TaskFieldHelp label="Ajuda sobre o fluxo">
          Ao mudar de etapa, a tarefa vai para a função configurada. Se a pessoa mudar, ajuste a função. Tarefas antigas só entram neste fluxo quando alguém escolher.
        </TaskFieldHelp>
      </div>
      <p className="text-sm text-muted-foreground">{selected.name}</p>
    </div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {stages.map((stage, index) => { const skippedBeforeStart = current?.key === stages[0]?.key && entryIndex > 0 && index > 0 && index < entryIndex; return <div key={stage.key} className={cn(
        'min-w-[132px] rounded-lg border px-2.5 py-2 text-xs',
        index < currentIndex && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        index === currentIndex && 'border-violet-400 bg-white font-semibold text-violet-800 shadow-sm dark:bg-gray-900',
        index > currentIndex && 'text-muted-foreground',
        skippedBeforeStart && 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
      )}>
        <p className="flex items-center gap-1">{(index < currentIndex || skippedBeforeStart) && <Check className="h-3.5 w-3.5" />}{stage.label}</p>
        {skippedBeforeStart && <p className="mt-1 font-normal">Já pronto</p>}
        {(index === currentIndex || (current?.key === stages[0]?.key && stage.key === entry?.key) || (currentIndex < 0 && isChange && stage.key === returnReview?.key)) && <p className="mt-1 font-normal text-muted-foreground">{functionName(stage.function_id)}</p>}
      </div>; })}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">{nowLabel}</p>
      {!isNewTask && next && <Button type="button" size="sm" onClick={advance}>
        {isChange ? 'Enviar novamente à revisão' : current?.key === 'backlog' ? `Iniciar em ${next.label}` : `Ir para ${next.label}`}<ArrowRight className="ml-1 h-4 w-4" />
      </Button>}
    </div>
  </section>;
}
