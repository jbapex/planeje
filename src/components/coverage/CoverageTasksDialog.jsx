import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';

const COVERAGE_TASK_TYPES = new Set([
  'arte',
  'post',
  'posts',
  'design',
  'social_media',
  'video',
  'videos',
  'reels',
  'story',
  'stories',
  'carrossel',
  'carousel',
  'anuncio',
  'anuncios',
  'ad',
  'ads',
]);

function normalizeTaskType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function nextMonthStart(mesRef) {
  const date = new Date(`${mesRef}T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function taskDate(task) {
  return String(task.post_date || task.due_date || '').slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return 'Sem data';
  return `${day}/${month}/${year}`;
}

export default function CoverageTasksDialog({ row, mesRef, bounds, open, onOpenChange }) {
  const [tasks, setTasks] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [monthlyMaterialLinks, setMonthlyMaterialLinks] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !row?.cliente_id) return undefined;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      const monthEndExclusive = nextMonthStart(mesRef);
      const [tasksResult, projectsResult, statusesResult, profilesResult] = await Promise.all([
        supabase
          .from('tarefas')
          .select('id,title,status,client_id,project_id,plan_material_id,type,due_date,post_date,assignee_ids')
          .eq('client_id', row.cliente_id)
          .limit(500),
        supabase
          .from('projetos')
          .select('id')
          .eq('client_id', row.cliente_id)
          .gte('mes_referencia', bounds.inicio)
          .lt('mes_referencia', monthEndExclusive),
        supabase.from('task_statuses').select('value,label,color,sort_order').order('sort_order'),
        supabase.from('profiles').select('id,full_name').neq('role', 'cliente'),
      ]);

      if (!active) return;
      const baseQueryError = tasksResult.error || projectsResult.error || statusesResult.error || profilesResult.error;
      if (baseQueryError) {
        setError(baseQueryError.message || 'Não foi possível carregar as tarefas.');
        setTasks([]);
        setLoading(false);
        return;
      }

      const projectIds = (projectsResult.data || []).map((project) => project.id);
      const plansResult = projectIds.length
        ? await supabase.from('campaign_plans').select('id,project_id,materiais').in('project_id', projectIds)
        : { data: [], error: null };

      if (!active) return;
      const queryError = plansResult.error;
      if (queryError) {
        setError(queryError.message || 'Não foi possível carregar as tarefas.');
        setTasks([]);
        setLoading(false);
        return;
      }

      const materialLinks = new Set();
      (plansResult.data || []).forEach((plan) => {
        (plan.materiais || []).forEach((material, index) => {
          const materialId = material?.id || `legacy:${plan.id}:${index + 1}`;
          materialLinks.add(`${plan.project_id}:${materialId}`);
        });
      });
      const visibleTasks = (tasksResult.data || [])
        .filter((task) => {
          const date = taskDate(task);
          const linkedToMonthlyMaterial = materialLinks.has(`${task.project_id}:${task.plan_material_id}`);
          const datedInMonth = date && date >= bounds.inicio && date <= bounds.fim;
          return linkedToMonthlyMaterial || (datedInMonth && COVERAGE_TASK_TYPES.has(normalizeTaskType(task.type)));
        })
        .sort((a, b) => {
          const byDate = (taskDate(a) || '9999-12-31').localeCompare(taskDate(b) || '9999-12-31');
          return byDate || String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
        });

      setMonthlyMaterialLinks(materialLinks);
      setTasks(visibleTasks);
      setStatuses(statusesResult.data || []);
      setProfiles(profilesResult.data || []);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [open, row?.cliente_id, mesRef, bounds.inicio, bounds.fim]);

  const statusByValue = useMemo(
    () => new Map(statuses.map((status) => [status.value, status])),
    [statuses],
  );
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.full_name])),
    [profiles],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-white/10">
          <DialogTitle>Tarefas de {row?.empresa || 'cliente'}</DialogTitle>
          <DialogDescription>
            Tarefas de conteúdo consideradas na cobertura deste mês, incluindo materiais do plano e demandas fora dele.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[220px] overflow-y-auto p-4 sm:p-5">
          {loading && (
            <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando tarefas…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}

          {!loading && !error && tasks.length === 0 && (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 text-center text-sm text-muted-foreground dark:border-white/10">
              Nenhuma tarefa de conteúdo encontrada para este cliente no mês selecionado.
            </div>
          )}

          {!loading && !error && tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map((task) => {
                const status = statusByValue.get(task.status);
                const assignees = (task.assignee_ids || []).map((id) => profileById.get(id)).filter(Boolean);
                const isPlanTask = monthlyMaterialLinks.has(`${task.project_id}:${task.plan_material_id}`);
                const date = taskDate(task);
                return (
                  <Link
                    key={task.id}
                    to={`/tasks/kanban/${task.id}`}
                    onClick={() => onOpenChange(false)}
                    className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-violet-500/30 dark:hover:bg-violet-500/[0.06] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status?.color || '#94a3b8' }} />
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                          {status?.label || task.status || 'Sem status'}
                        </span>
                        <span className={isPlanTask ? 'text-[11px] font-medium text-violet-600 dark:text-violet-300' : 'text-[11px] font-medium text-amber-700 dark:text-amber-300'}>
                          {isPlanTask ? 'No plano' : 'Fora do plano'}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-semibold text-slate-950 dark:text-white">{task.title || 'Tarefa sem título'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-muted-foreground">
                        <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{assignees.join(', ') || 'Sem responsável'}</span>
                        <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{task.post_date ? 'Postagem' : 'Prazo'}: {formatDate(date)}</span>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-300">
                      Abrir tarefa <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-white/10 dark:bg-white/[0.025]">
          <Button variant="outline" asChild>
            <Link to={`/tasks/list?client_id=${row?.cliente_id || ''}`} onClick={() => onOpenChange(false)}>
              Ver todas em Tarefas <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
