import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, Clock, FileText, Plus, RefreshCw, Settings2, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import OnboardingLegacy from '@/components/onboarding/OnboardingLegacy';
import { newOnboardingStage, onboardingDue, onboardingOverview, validateOnboardingTemplate } from '@/lib/clientOnboarding';
import './Onboarding.css';

const fieldClass = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-card';
const sides = { internal: 'Equipe', client: 'Cliente' };
const emptyData = { clients: [], profiles: [], templates: [], runs: [], stages: [], tasks: [], canManage: false };

function PersonSelect({ value, onChange, profiles, inherit = false, disabled = false }) {
  return <select aria-label="Responsável" className={fieldClass} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="">{inherit ? 'Usar responsável escolhido ao iniciar' : 'Selecione um responsável'}</option>
    {profiles.filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
    {value && !profiles.some((p) => p.id === value && p.status === 'active') && <option value={value}>Responsável indisponível — escolha outro</option>}
  </select>;
}

function TemplateDialog({ templates, profiles, onClose, onChanged }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (index, value) => setDraft((prev) => ({ ...prev, stages: prev.stages.map((stage, i) => i === index ? { ...stage, ...value } : stage) }));
  const move = (index, shift) => setDraft((prev) => {
    const stages = [...prev.stages]; const target = index + shift;
    [stages[index], stages[target]] = [stages[target], stages[index]];
    return { ...prev, stages };
  });
  async function save(event) {
    event.preventDefault(); const validation = validateOnboardingTemplate(draft);
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('save_client_onboarding_template', { p_id: draft.id || null, p_name: draft.name,
        p_stages: draft.stages.map((s) => ({ ...s, sla_days: Number(s.sla_days), assignee_id: s.assignee_id || null })), p_active: draft.is_active });
      if (failure) throw failure;
      await onChanged(); setDraft(null);
    } catch (failure) { setError(failure.code === '23505' ? 'Já existe um modelo com esse nome.' : failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="flex max-h-[90vh] max-w-3xl flex-col rounded-2xl p-5">
    <DialogHeader><DialogTitle>Etapas do onboarding</DialogTitle><DialogDescription>Defina a sequência e os prazos. Alterar o modelo vale para os próximos onboardings.</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto pr-1">
      {!draft ? <div className="space-y-3">{templates.map((template) => <div key={template.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 dark:bg-card">
        <div><p className="font-medium">{template.name}{!template.is_active && <span className="ml-2 text-xs text-muted-foreground">Inativo</span>}</p><p className="text-xs text-muted-foreground">{template.stages.length} etapas</p></div>
        <Button variant="outline" size="sm" onClick={() => { setError(''); setDraft({ ...template, stages: template.stages.map((s) => ({ ...s })) }); }}>Editar modelo</Button>
      </div>)}<Button variant="outline" onClick={() => { setError(''); setDraft({ name: '', stages: [newOnboardingStage()], is_active: true }); }}><Plus className="mr-2 h-4 w-4" />Novo modelo</Button></div>
        : <form id="onboarding-template-form" onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm font-medium">Nome do modelo<Input required autoFocus maxLength={100} className="mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          {draft.stages.map((stage, index) => <section key={index} className="space-y-3 rounded-xl border bg-slate-50/70 p-3 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-500">ETAPA {index + 1}</span><div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!index} aria-label={`Subir etapa ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === draft.stages.length - 1} aria-label={`Descer etapa ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={draft.stages.length === 1} aria-label={`Remover etapa ${index + 1}`} onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
            </div></div>
            <label className="block text-sm">Nome da etapa<Input required maxLength={150} className="mt-1" value={stage.title} onChange={(e) => patch(index, { title: e.target.value })} placeholder="Ex.: Receber informações e acessos" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Depende de<select className={fieldClass} value={stage.pending_side} onChange={(e) => patch(index, { pending_side: e.target.value })}><option value="internal">Equipe</option><option value="client">Cliente</option></select></label>
              <label className="text-sm">Prazo em dias úteis<Input required type="number" min={0} max={365} className="mt-1 h-9" value={stage.sla_days} onChange={(e) => patch(index, { sla_days: e.target.value })} /></label></div>
            <label className="block text-sm">Quem acompanha<PersonSelect profiles={profiles} inherit value={stage.assignee_id} onChange={(value) => patch(index, { assignee_id: value })} /></label>
            <label className="block text-sm">O que precisa ser feito<Textarea className="mt-1 min-h-[72px] bg-white dark:bg-card" rows={2} value={stage.instructions || ''} onChange={(e) => patch(index, { instructions: e.target.value })} /></label>
          </section>)}
          <Button type="button" variant="outline" disabled={draft.stages.length >= 30} onClick={() => setDraft({ ...draft, stages: [...draft.stages, newOnboardingStage()] })}><Plus className="mr-2 h-4 w-4" />Adicionar etapa</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />Modelo disponível para iniciar</label>
        </fieldset></form>}
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <DialogFooter>{draft ? <><Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Voltar</Button><Button form="onboarding-template-form" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar modelo'}</Button></> : <Button variant="outline" onClick={onClose}>Fechar</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

function StartDialog({ data, userId, onClose, onStarted }) {
  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState(data.templates.find((t) => t.is_active)?.id || '');
  const [assignee, setAssignee] = useState(userId || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const template = data.templates.find((t) => t.id === templateId);
  async function start(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { data: id, error: failure } = await supabase.rpc('start_client_onboarding', { p_client: clientId, p_template: templateId, p_assignee: assignee });
      if (failure) throw failure;
      await onStarted(id);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="flex max-h-[90vh] max-w-xl flex-col rounded-2xl p-5">
    <DialogHeader><DialogTitle>Iniciar onboarding</DialogTitle><DialogDescription>Escolha o cliente e a sequência. A lista é criada agora. Nenhuma tarefa abre sozinha.</DialogDescription></DialogHeader>
    <form id="onboarding-start-form" onSubmit={start} className="min-h-0 space-y-4 overflow-y-auto"><fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm">Cliente<select required className={fieldClass} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecione o cliente</option>
        {data.clients.filter((c) => !data.runs.some((run) => run.client_id === c.id && run.status === 'active')).map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
      </select></label>
      <label className="block text-sm">Modelo<select required className={fieldClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Selecione o modelo</option>{data.templates.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="block text-sm">Responsável pelo acompanhamento<PersonSelect profiles={data.profiles} value={assignee} onChange={setAssignee} /></label>
      {template && <ol className="divide-y rounded-xl border bg-slate-50/60 px-3 dark:bg-white/[0.03]">{template.stages.map((stage, index) => <li key={index} className="flex items-start gap-3 py-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium dark:bg-card">{index + 1}</span><div><p className="font-medium">{stage.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{sides[stage.pending_side]} · {stage.sla_days} dias úteis · {data.profiles.find((p) => p.id === (stage.assignee_id || assignee))?.full_name || 'Escolha o responsável'}</p></div></li>)}</ol>}
      <p className="text-xs leading-5 text-muted-foreground">Cada linha fica no checklist. Virar tarefa abre o prazo e a tarefa real. O responsável da equipe acompanha também o que depende do cliente.</p>
    </fieldset></form>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" form="onboarding-start-form" disabled={busy || !clientId || !templateId || !assignee}>{busy ? 'Iniciando…' : 'Iniciar onboarding'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function StageEditor({ stage, task, data, canEdit, onChanged, onComplete, onOpen, busy, runBusy }) {
  const [draft, setDraft] = useState({ ...stage, due: task?.due_date || '' });
  const [error, setError] = useState('');
  useEffect(() => { setDraft({ ...stage, due: task?.due_date || '' }); setError(''); },
    [stage.id, stage.assignee_id, stage.pending_side, stage.sla_days, stage.instructions, stage.state, task?.due_date]);
  const isLocked = stage.state === 'locked';
  const hasChanges = draft.assignee_id !== stage.assignee_id || draft.pending_side !== stage.pending_side || String(draft.sla_days) !== String(stage.sla_days)
    || draft.instructions !== stage.instructions || draft.due !== (task?.due_date || '');
  async function save(event) {
    event.preventDefault(); setError('');
    await runBusy(async () => {
      const { error: failure } = await supabase.rpc('update_client_onboarding_stage', { p_stage: stage.id, p_assignee: draft.assignee_id,
        p_side: draft.pending_side, p_days: Number(draft.sla_days), p_due: isLocked ? null : draft.due || null, p_instructions: draft.instructions });
      if (failure) { setError(failure.message); throw failure; }
      await onChanged();
    });
  }
  return <form onSubmit={save} className="space-y-3 border-t bg-white p-4 dark:bg-card"><fieldset disabled={!canEdit || busy} className="space-y-3">
    <label className="block text-sm font-medium">O que precisa ser feito<Textarea rows={4} className="mt-1 min-h-[104px] bg-slate-50 dark:bg-white/[0.03]" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Registre as orientações e o que está pendente." /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Quem acompanha<PersonSelect profiles={data.profiles} value={draft.assignee_id} onChange={(value) => setDraft({ ...draft, assignee_id: value })} /></label>
      <label className="text-sm">Depende de<select className={fieldClass} value={draft.pending_side} onChange={(e) => setDraft({ ...draft, pending_side: e.target.value })}><option value="internal">Equipe</option><option value="client">Cliente</option></select></label></div>
    {isLocked ? <label className="block text-sm">Prazo ao abrir esta etapa (dias úteis)<Input required type="number" min={0} max={365} className="mt-1 h-9" value={draft.sla_days} onChange={(e) => setDraft({ ...draft, sla_days: e.target.value })} /></label>
      : <label className="block text-sm">Prazo desta etapa<Input required type="date" className="mt-1 h-9" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} /></label>}
  </fieldset>
    {isLocked && <p className="text-xs text-muted-foreground">Esta linha ainda não é tarefa. O prazo começa quando ela virar tarefa.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {canEdit && <div className="flex flex-wrap justify-end gap-2">{hasChanges && <Button type="submit" variant="outline" size="sm" disabled={busy}>Salvar ajustes</Button>}
      {isLocked && <Button type="button" size="sm" disabled={busy || hasChanges} onClick={() => onOpen(stage)}>Virar tarefa</Button>}
      {!isLocked && <Button type="button" size="sm" disabled={busy || hasChanges} onClick={() => onComplete(stage)}><Check className="mr-1.5 h-4 w-4" />Concluir etapa</Button>}</div>}
    {!canEdit && <p className="text-xs text-muted-foreground">O responsável ou um gestor pode atualizar esta etapa.</p>}
  </form>;
}

function RunDialog({ run, data, userId, onClose, onChanged, onOpen, runBusy, busy }) {
  const navigate = useNavigate(); const overview = onboardingOverview(run, data.stages, data.tasks);
  const [expanded, setExpanded] = useState(overview.current?.id || ''); const [confirm, setConfirm] = useState(null);
  const client = data.clients.find((c) => c.id === run.client_id);
  useEffect(() => setExpanded(overview.current?.id || ''), [overview.current?.id]);
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="flex max-h-[90vh] max-w-3xl flex-col rounded-2xl p-5">
    <DialogHeader><DialogTitle>{client?.empresa || 'Onboarding do cliente'}</DialogTitle><DialogDescription>{run.template_name} · {overview.completed} de {overview.total} etapas concluídas</DialogDescription></DialogHeader>
    <div className="h-1.5 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${overview.progress}%` }} /></div>
    <div className="min-h-0 space-y-3 overflow-y-auto pr-1">{overview.stages.map((stage) => {
      const task = data.tasks.find((t) => t.id === stage.task_id); const isOpen = stage.id === expanded; const done = stage.state === 'completed';
      const canEdit = data.canManage || stage.assignee_id === userId;
      return <section key={stage.id} className={`overflow-hidden rounded-xl border ${stage.state === 'active' ? 'border-violet-200 dark:border-violet-700' : 'border-slate-200 dark:border-white/10'}`}>
        <button type="button" onClick={() => setExpanded(isOpen ? '' : stage.id)} className="flex w-full items-center gap-3 bg-slate-50/70 p-3 text-left dark:bg-white/[0.03]" aria-expanded={isOpen}>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : stage.state === 'active' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'}`}>{done ? <Check className="h-4 w-4" /> : stage.position}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{stage.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{done ? 'Concluída' : stage.state === 'active' ? 'Etapa atual' : 'Próxima etapa'} · {data.profiles.find((p) => p.id === stage.assignee_id)?.full_name || 'Responsável indisponível'}{!done && ` · ${sides[stage.pending_side]}`}</p></div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {isOpen && (done ? <div className="space-y-2 border-t p-4"><p className="whitespace-pre-wrap text-sm leading-6">{stage.instructions || 'Sem orientações adicionais.'}</p><p className="text-xs text-muted-foreground">Concluída em {new Date(stage.completed_at).toLocaleString('pt-BR')}</p></div>
          : <StageEditor stage={stage} task={task} data={data} canEdit={canEdit} onChanged={onChanged} onComplete={setConfirm} onOpen={onOpen} busy={busy} runBusy={runBusy} />)}
        {isOpen && task && <div className="flex justify-end border-t bg-slate-50/50 px-4 py-2 dark:bg-white/[0.02]"><Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/list/${task.id}`)}>Abrir tarefa<ArrowUpRight className="ml-1 h-4 w-4" /></Button></div>}
      </section>;
    })}{run.status === 'completed' && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">Onboarding concluído. Continue o planejamento e a execução em Projetos.</p>}</div>
    {confirm && <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:bg-violet-900/20"><p className="text-sm">Tudo que precisa ser feito em <strong>{confirm.title}</strong> foi concluído? {confirm.pending_side === 'client' ? 'Confirme que a pendência do cliente foi resolvida.' : ''}</p><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(null)}>Voltar</Button><Button size="sm" disabled={busy} onClick={() => runBusy(async () => {
      const { error } = await supabase.rpc('complete_client_onboarding_stage', { p_stage: confirm.id }); if (error) throw error;
      await onChanged(); setConfirm(null);
    })}>{busy ? 'Concluindo…' : 'Confirmar conclusão'}</Button></div></div>}
    <DialogFooter><Button variant="ghost" size="sm" onClick={() => navigate(`/clients/${run.client_id}`)}>Ficha do cliente</Button><Button variant="outline" size="sm" onClick={onClose}>Fechar</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export default function Onboarding() {
  const { user } = useAuth(); const { toast } = useToast(); const navigate = useNavigate();
  const [data, setData] = useState(emptyData); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const working = useRef(false); const [dialog, setDialog] = useState(null); const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState(''); const [mine, setMine] = useState(false); const [stagesView, setStagesView] = useState(false);
  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.all([
        supabase.from('clientes').select('id,empresa').order('empresa'),
        supabase.from('profiles').select('id,full_name,status').in('role', ['admin', 'superadmin', 'colaborador']).order('full_name'),
        supabase.from('client_onboarding_templates').select('*').order('created_at'),
        supabase.from('client_onboardings').select('*').order('started_at', { ascending: false }),
        supabase.from('client_onboarding_stages').select('*').order('position'),
        supabase.rpc('can_manage_task_operational_functions'),
      ]);
      results.forEach((result) => { if (result.error) throw result.error; });
      const ids = results[4].data.filter((s) => s.task_id).map((s) => s.task_id);
      const taskResult = ids.length ? await supabase.from('tarefas').select('id,due_date,status,description,assignee_ids').in('id', ids) : { data: [] };
      if (taskResult.error) throw taskResult.error;
      setData({ clients: results[0].data || [], profiles: results[1].data || [], templates: results[2].data || [], runs: results[3].data || [], stages: results[4].data || [], tasks: taskResult.data || [], canManage: results[5].data === true }); setError('');
    } catch (failure) { setError(failure.message || 'Não foi possível carregar o onboarding.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    let timer; const refresh = () => { clearTimeout(timer); timer = setTimeout(fetchData, 300); };
    const channel = supabase.channel('controlled-client-onboarding').on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    const visible = () => { if (!document.hidden) refresh(); }; document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); supabase.removeChannel(channel); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [fetchData]);
  const runBusy = async (operation) => {
    if (working.current) return; working.current = true; setBusy(true);
    try { await operation(); } catch (failure) { toast({ title: 'Não foi possível atualizar', description: failure.message, variant: 'destructive' }); }
    finally { working.current = false; setBusy(false); }
  };
  const rows = useMemo(() => data.runs.map((run) => {
    const view = onboardingOverview(run, data.stages, data.tasks);
    const openTasks = view.stages.filter((stage) => stage.state === 'active').map((stage) => data.tasks.find((task) => task.id === stage.task_id)).filter(Boolean);
    return { ...run, client: data.clients.find((c) => c.id === run.client_id), ...view, openTasks, overdue: openTasks.some((task) => onboardingDue(task.due_date).overdue) };
  }), [data]);
  const filtered = rows.filter((run) => (!mine || run.stages.some((stage) => stage.state !== 'completed' && stage.assignee_id === user?.id)) && (!search || `${run.client?.empresa || ''} ${run.stages.map((stage) => stage.title).join(' ')}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
  const selected = data.runs.find((run) => run.id === selectedId);
  const openStage = (stage) => runBusy(async () => {
    const { error: failure } = await supabase.rpc('open_client_onboarding_stage', { p_stage: stage.id });
    if (failure) throw failure;
    await fetchData();
  });
  if (!stagesView) return <OnboardingLegacy onOpenStages={() => setStagesView(true)} />;
  return <div className="onboarding-page">
    <WorkspacePageHeader title="Onboarding de clientes" label="Entrada" help="O checklist mostra o que falta na entrada do cliente. Virar tarefa abre o prazo e a tarefa real, com responsável e data. Concluir a tarefa marca o item. A próxima linha não abre sozinha."
      actions={<><Button variant="ghost" size="sm" onClick={() => setStagesView(false)}><FileText className="mr-1.5 h-4 w-4" />Checklist em colunas</Button><Button variant="ghost" size="icon" aria-label="Atualizar onboarding" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>{data.canManage && <><Button variant="outline" size="sm" onClick={() => setDialog('templates')}><Settings2 className="mr-1.5 h-4 w-4" />Etapas e prazos</Button><Button size="sm" onClick={() => setDialog('start')}><Plus className="mr-1.5 h-4 w-4" />Iniciar onboarding</Button></>} </>} />
    <div className="flex flex-wrap items-center gap-3"><Input className="h-10 max-w-sm bg-white dark:bg-card" aria-label="Buscar cliente ou etapa" placeholder="Buscar cliente ou etapa" value={search} onChange={(e) => setSearch(e.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Comigo agora</label><span className="ml-auto text-xs text-muted-foreground">{rows.filter((r) => r.status === 'active').length} em andamento · {rows.filter((r) => r.overdue).length} com prazo atrasado</span></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-600">{error}<Button variant="ghost" size="sm" className="ml-2" onClick={fetchData}>Tentar novamente</Button></div>}
    {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando onboarding…</p> : !error && !rows.length ? <section className="rounded-2xl border bg-white px-6 py-12 text-center dark:bg-card"><Users className="mx-auto mb-3 h-8 w-8 text-violet-500" /><h2 className="text-lg font-semibold">Organize a entrada do próximo cliente</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Inicie um onboarding para saber qual é a próxima ação, quem acompanha e o que falta receber do cliente.</p>{data.canManage && <Button className="mt-5" onClick={() => setDialog('start')}>Iniciar onboarding</Button>}<p className="mt-4 text-xs text-muted-foreground">A lista do dia a dia está em “Checklist em colunas”.</p></section>
      : !error && <div className="onboarding-list" aria-label="Checklists de onboarding">{filtered.slice().sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || String(a.client?.empresa || '').localeCompare(String(b.client?.empresa || ''), 'pt-BR')).map((run) => (
        <section key={run.id} className="onboarding-client">
          <header className="flex items-center gap-3 px-4 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => { setSelectedId(run.id); setDialog('run'); }}><span className="font-semibold hover:text-violet-600">{run.client?.empresa || 'Cliente'}</span><span className="mt-0.5 block text-xs text-muted-foreground">{run.template_name} · {run.completed}/{run.total} itens</span></button>
            <span className="text-xs text-muted-foreground">{run.progress}%</span>
            <Button variant="ghost" size="sm" className="h-8 text-violet-600" onClick={() => { setSelectedId(run.id); setDialog('run'); }}>Abrir<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </header>
          <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${run.progress}%` }} /></div>
          <ol>{run.stages.map((stage) => {
            const task = data.tasks.find((item) => item.id === stage.task_id);
            const due = onboardingDue(task?.due_date);
            const person = data.profiles.find((p) => p.id === stage.assignee_id)?.full_name || 'Responsável indisponível';
            const done = stage.state === 'completed';
            const canOpen = data.canManage || stage.assignee_id === user?.id;
            return <li key={stage.id} className="onboarding-item">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : stage.state === 'active' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'}`}>{done ? <Check className="h-3.5 w-3.5" /> : stage.position}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{stage.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{done ? 'Concluída' : stage.state === 'active' ? 'Tarefa aberta' : 'No checklist'} · {sides[stage.pending_side]} · {person}</p></div>
              {stage.state === 'active' && <p className={`flex items-center gap-1 text-xs ${due.overdue ? 'text-red-600' : 'text-slate-500'}`}><Clock className="h-3.5 w-3.5" />{due.text}</p>}
              {stage.state === 'locked' && <p className="text-xs text-slate-500">{stage.sla_days} dias úteis ao abrir</p>}
              <div className="flex shrink-0 items-center gap-1">{stage.state === 'locked' && canOpen && <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => openStage(stage)}>Virar tarefa</Button>}{task && <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500" onClick={() => navigate(`/tasks/list/${task.id}`)}>Tarefa<ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button>}</div>
            </li>;
          })}</ol>
        </section>
      ))}</div>}
    {dialog === 'templates' && <TemplateDialog templates={data.templates} profiles={data.profiles} onClose={() => setDialog(null)} onChanged={fetchData} />}
    {dialog === 'start' && <StartDialog data={data} userId={user?.id} onClose={() => setDialog(null)} onStarted={async (id) => { await fetchData(); setSelectedId(id); setDialog('run'); }} />}
    {dialog === 'run' && selected && <RunDialog run={selected} data={data} userId={user?.id} onClose={() => setDialog(null)} onChanged={fetchData} onOpen={openStage} runBusy={runBusy} busy={busy} />}
  </div>;
}
