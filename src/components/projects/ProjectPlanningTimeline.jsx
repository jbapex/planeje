import React, { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';
import { PROJECT_STAGES } from '@/lib/projectsMonthlyOverview';
import { PROJECT_DEADLINE_FIELDS } from '@/lib/projectPlanningWorkflow';
import { projectStatusLabel, normalizeProjetosStatus } from '@/lib/projectsOperationalMetrics';
import { formatDueDatePt } from '@/lib/taskUrgency';
import ProjectDeadlineLabel from './ProjectDeadlineLabel';
import { projectPeriodLabel, formatProjectMonth } from '@/lib/projectPeriod';

export default function ProjectPlanningTimeline({ project, plan, tasks, statusOptions, canManage, onChangeStage, onEditDates }) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const datesKey = [project.mes_referencia, project.mes_fim, ...PROJECT_DEADLINE_FIELDS.map(({ key }) => project[key])].join('|');
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    supabase.from('project_planning_history').select('*').eq('project_id', project.id).order('changed_at', { ascending: false }).limit(20).then(({ data, error: failure }) => {
      if (!active) return;
      setHistory(data || []); setError(failure); setLoading(false);
    });
    return () => { active = false; };
  }, [open, project.id, project.status, datesKey, reload]);
  const changeStage = async (stage) => {
    setChanging(true);
    try { await onChangeStage(stage); }
    finally { setChanging(false); }
  };
  return <div className="mb-4 rounded-xl border bg-card px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {canManage ? <Select value={normalizeProjetosStatus(project.status)} onValueChange={changeStage} disabled={changing}><SelectTrigger aria-label="Etapa do projeto" className="h-8 w-[180px] border-0 bg-muted/50 text-xs"><SelectValue /></SelectTrigger><SelectContent>{PROJECT_STAGES.map(({ key, label }) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select> : <span className="text-xs font-medium">{projectStatusLabel(project.status)}</span>}
        <ProjectDeadlineLabel project={project} plan={plan} tasks={tasks} statusOptions={statusOptions} onDefineDates={canManage ? onEditDates : undefined} />
      </div>
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`project-dates-${project.id}`}>Prazos e histórico<ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /></Button>
    </div>
    {open && <div id={`project-dates-${project.id}`} className="mt-3 space-y-4 border-t pt-3">
      <p className="text-xs text-muted-foreground">Período: {projectPeriodLabel(project)} · Os prazos de preparação são do primeiro mês. Cada material tem sua própria entrega e postagem.</p><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{PROJECT_DEADLINE_FIELDS.map(({ key, label }) => <div key={key}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{formatDueDatePt(project[key]) || 'Não definido'}</p></div>)}</div>
      {(project.plan_ready_at || project.plan_approved_at) && <p className="text-xs text-emerald-700 dark:text-emerald-300">{project.plan_ready_at && `Plano preparado em ${formatDueDatePt(project.plan_ready_at)}`}{project.plan_ready_at && project.plan_approved_at && ' · '}{project.plan_approved_at && `Aprovado em ${formatDueDatePt(project.plan_approved_at)}`}</p>}
      {canManage && <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onEditDates}>Editar prazos</Button>}
      <div className="space-y-2"><h3 className="flex items-center gap-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5" />Histórico do planejamento</h3>
        {loading ? <p className="text-xs text-muted-foreground">Carregando histórico…</p> : error ? <div role="alert" className="flex items-center gap-2 text-xs text-destructive">Não foi possível consultar o histórico.<Button type="button" variant="ghost" size="sm" onClick={() => setReload((prev) => prev + 1)}>Tentar novamente</Button></div> : !history.length ? <p className="text-xs text-muted-foreground">As próximas mudanças de etapa e de prazo aparecerão aqui.</p> : <ul className="space-y-2">{history.map((event) => <li key={event.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{event.action === 'created' ? 'Projeto iniciado' : event.action === 'deadlines_changed' ? 'Prazos ajustados' : `${projectStatusLabel(event.from_stage)} → ${projectStatusLabel(event.to_stage)}`}</span>{' · '}{new Date(event.changed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}{event.late_days > 0 && <span className="text-amber-700 dark:text-amber-300"> · {event.late_days} {event.late_days === 1 ? 'dia' : 'dias'} após o prazo</span>}{event.action === 'deadlines_changed' && (event.before_dates?.mes_referencia !== event.after_dates?.mes_referencia || event.before_dates?.mes_fim !== event.after_dates?.mes_fim) && <p className="mt-1">Período ajustado: {formatProjectMonth(event.after_dates?.mes_referencia)} a {formatProjectMonth(event.after_dates?.mes_fim || event.after_dates?.mes_referencia)}</p>}{event.action === 'deadlines_changed' && <p className="mt-1">{PROJECT_DEADLINE_FIELDS.filter(({ key }) => event.before_dates?.[key] !== event.after_dates?.[key]).map(({ key, label }) => `${label}: ${formatDueDatePt(event.before_dates?.[key]) || 'sem data'} → ${formatDueDatePt(event.after_dates?.[key]) || 'sem data'}`).join(' · ')}</p>}</li>)}</ul>}
      </div>
    </div>}
  </div>;
}
