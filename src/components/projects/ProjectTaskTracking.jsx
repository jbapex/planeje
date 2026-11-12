import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, ListTodo, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import AutomationHelp from '@/components/tasks/automations/AutomationHelp';

function formatDueDate(value) {
  if (!value) return '';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}

export default function ProjectTaskTracking({ project, plan, users, taskStatuses }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await supabase
        .from('tarefas')
        .select('id,title,status,assignee_ids,due_date,plan_material_id')
        .eq('project_id', project.id)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
      } else {
        setTasks(result.data || []);
        setError('');
      }
      setLoading(false);
    };

    void load();
    const channel = supabase
      .channel(`project-tracking-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `project_id=eq.${project.id}` }, load)
      .subscribe();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener('focus', load);
    };
  }, [project.id]);

  const currentMaterialIds = new Set((plan?.materiais || []).map((material) => String(material.id)));
  const currentTasks = tasks.filter((task) => task.plan_material_id && currentMaterialIds.has(String(task.plan_material_id)));
  const otherTasks = tasks.filter((task) => !task.plan_material_id || !currentMaterialIds.has(String(task.plan_material_id)));

  const renderTask = (task, outsideCurrentPlan = false) => {
    const status = taskStatuses.find((item) => item.status_value === task.status);
    const names = (task.assignee_ids || [])
      .map((id) => users.find((user) => user.id === id)?.full_name)
      .filter(Boolean);
    const dueDate = formatDueDate(task.due_date);

    return (
      <article key={task.id} className="group flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white" title={task.title}>{task.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-white/[0.06] dark:text-slate-300">
              {status?.label || task.status || 'Sem status'}
            </span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{names.join(', ') || 'Sem responsável'}</span>
            {dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Entrega {dueDate}</span>}
            {outsideCurrentPlan && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {task.plan_material_id ? 'Material antigo do projeto' : 'Sem material do plano'}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-9 shrink-0 rounded-xl" asChild>
          <Link to={`/tasks/kanban/${task.id}`}>Abrir tarefa<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
        </Button>
      </article>
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
            <ListTodo className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Tarefas deste projeto</h2>
              <AutomationHelp>O andamento e os responsáveis vêm de Tarefas. Abra a tarefa para avançar no fluxo, revisar o material e configurar as publicações.</AutomationHelp>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading
                ? 'Carregando tarefas…'
                : `${currentTasks.length} ${currentTasks.length === 1 ? 'tarefa do plano atual' : 'tarefas do plano atual'}${otherTasks.length ? ` · ${otherTasks.length} ${otherTasks.length === 1 ? 'histórica' : 'históricas'}` : ''}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-xl bg-white dark:bg-slate-950/40" asChild>
          <Link to="/tasks/capacity">Consultar fila e capacidade</Link>
        </Button>
      </header>

      {loading && (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando tarefas do projeto
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="px-5 py-6 text-sm text-destructive">{error}</p>
      )}

      {!loading && !tasks.length && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Este projeto ainda não possui tarefas.</p>
          <Button size="sm" className="rounded-xl" asChild>
            <Link to={`/projects/${project.id}/planner`}>Montar materiais</Link>
          </Button>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="divide-y divide-slate-200/80 dark:divide-white/10">
          {currentTasks.map((task) => renderTask(task))}
          {otherTasks.length > 0 && (
            <div className="bg-slate-50/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:bg-white/[0.025] dark:text-slate-400">
              Outras tarefas do projeto
            </div>
          )}
          {otherTasks.map((task) => renderTask(task, true))}
        </div>
      )}
    </section>
  );
}
