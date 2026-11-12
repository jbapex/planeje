import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';
import { functionAssignees } from '@/lib/operationalWorkflow';
import AutomationHelp from './AutomationHelp';

export default function WorkflowTemplatesPanel({ functions, profiles, canManage }) {
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const { data, error: loadError } = await supabase.from('task_workflow_templates')
      .select('id,name,task_types,stages,is_active').order('name');
    if (loadError) setError('Não foi possível carregar os fluxos.');
    else setTemplates(data || []);
  };
  useEffect(() => { void load(); }, []);

  const changeFunction = (index, functionId) => setDraft((value) => ({
    ...value,
    stages: value.stages.map((stage, position) => position === index ? { ...stage, function_id: functionId } : stage),
  }));
  const changeSla = (index, rawValue) => setDraft((value) => ({
    ...value,
    stages: value.stages.map((stage, position) => position === index
      ? { ...stage, sla_days: rawValue === '' ? null : Math.max(0, Math.min(365, Number(rawValue))) }
      : stage),
  }));

  const save = async () => {
    if (!draft || busy || !canManage) return;
    setError('');
    try {
      draft.stages.forEach((stage) => functionAssignees(functions.find((item) => item.id === stage.function_id), profiles));
      setBusy(true);
      const { error: writeError } = await supabase.from('task_workflow_templates')
        .update({ stages: draft.stages, is_active: draft.is_active }).eq('id', draft.id);
      if (writeError) throw writeError;
      setDraft(null);
      await load();
    } catch (failure) {
      setError(failure.message || 'Não foi possível salvar o fluxo.');
    } finally { setBusy(false); }
  };

  return <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
    <div>
      <h3 className="flex items-center gap-2 font-semibold">Fluxos por material
        <AutomationHelp label="Sobre os fluxos">O fluxo define a ordem das etapas. Cada etapa aponta para uma função, e a função define quem recebe. As alterações valem para as próximas passagens; o histórico das tarefas permanece.</AutomationHelp>
      </h3>
      <p className="text-sm text-muted-foreground">Configure para onde Arte, Carrossel, Vídeo e Reels seguem em cada etapa.</p>
    </div>
    <div className="grid gap-2 rounded-xl border border-violet-200/70 bg-violet-50/60 p-3 text-xs text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-100 sm:grid-cols-3">
      <p><strong className="block">Produção</strong>Usa a data de entrega da tarefa.</p>
      <p><strong className="block">Depois da entrega</strong>Usa o prazo configurado em cada etapa.</p>
      <p><strong className="block">Postagem próxima</strong>Assume a urgência se chegar antes do prazo da etapa.</p>
    </div>
    {!draft && <div className="divide-y overflow-hidden rounded-xl border border-border/80 bg-background">{templates.map((template) => <div key={template.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <div><p className="font-medium">{template.name}</p><p className="text-sm text-muted-foreground">{(template.task_types || []).join(', ')} · {(template.stages || []).length} etapas</p></div>
      {canManage && <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg bg-background" onClick={() => { setError(''); setDraft({ ...template, stages: (template.stages || []).map((stage) => ({ ...stage })) }); }}>Configurar</Button>}
    </div>)}</div>}
    {draft && <div className="space-y-3">
      <div><p className="font-semibold">{draft.name}</p><p className="text-xs text-muted-foreground">A ordem das etapas está protegida. Defina a função e, quando fizer sentido, o prazo da etapa em dias úteis. Deixe vazio para não contar SLA nesta etapa.</p></div>
      {(draft.stages || []).map((stage, index) => <div key={stage.key} className="grid gap-3 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-[1fr_1.3fr_170px] sm:items-end">
        <div><p className="text-sm font-medium">{index + 1}. {stage.label}</p><p className="text-xs text-muted-foreground">Status: {stage.status_value}</p></div>
        <label className="space-y-1 text-xs text-muted-foreground">Quem recebe
          <Select value={stage.function_id || ''} disabled={busy} onValueChange={(value) => changeFunction(index, value)}>
            <SelectTrigger className="bg-background text-foreground"><SelectValue placeholder="Escolha a função" /></SelectTrigger>
            <SelectContent>{functions.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Prazo da etapa
          <div className="relative">
            <Input className="bg-background pr-16 text-foreground" type="number" min="0" max="365" value={stage.sla_days ?? ''} disabled={busy || stage.key === 'waiting_client' || stage.kind === 'complete'} onChange={(event) => changeSla(index, event.target.value)} placeholder={stage.key === 'waiting_client' ? 'Pausado' : stage.kind === 'complete' ? 'Encerrado' : 'Sem prazo'} aria-label={`Prazo em dias úteis da etapa ${stage.label}`} />
            {stage.key !== 'waiting_client' && stage.kind !== 'complete' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">dias úteis</span>}
          </div>
        </label>
      </div>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} disabled={busy} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} />Fluxo ativo para novas tarefas</label>
      <div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar fluxo'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancelar</Button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
