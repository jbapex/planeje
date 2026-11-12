import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { getEffectiveTaskDeadline } from '@/lib/taskUrgency';

const TERMINAL = new Set(['published', 'completed', 'done', 'concluido', 'cancelled', 'canceled', 'archived']);
const dateOnly = (date) => date.toISOString().slice(0, 10);
const mondayOf = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateOnly(date);
};

export default function TeamCapacityView({ users, userRole, onOpenTask }) {
  const [functions, setFunctions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [capacities, setCapacities] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [unclassifiedSearch, setUnclassifiedSearch] = useState('');
  const [showAllUnclassified, setShowAllUnclassified] = useState(false);
  const { toast } = useToast();
  const weekStart = mondayOf();
  const canManage = userRole === 'admin' || userRole === 'superadmin';

  const fetchAllTasks = async () => {
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const result = await supabase.from('tarefas')
        .select('id, title, status, due_date, post_date, production_delivered_at, stage_due_at, type, client_id, operational_function_id, review_round')
        .range(from, from + pageSize - 1);
      if (result.error) return result;
      rows.push(...(result.data || []));
      if ((result.data || []).length < pageSize) return { data: rows, error: null };
    }
  };

  const load = async () => {
    setLoading(true);
    const [functionResult, capacityResult, taskResult] = await Promise.all([
      supabase.from('task_operational_functions').select('id, name, assignee_ids').eq('is_active', true).order('name'),
      supabase.from('task_function_capacities').select('*').eq('week_start', weekStart),
      fetchAllTasks(),
    ]);
    if (functionResult.error || capacityResult.error || taskResult.error) {
      toast({ title: 'Não foi possível carregar a fila', description: functionResult.error?.message || capacityResult.error?.message || taskResult.error?.message, variant: 'destructive' });
    } else {
      setFunctions(functionResult.data || []);
      setTasks(taskResult.data || []);
      const byFunction = Object.fromEntries((capacityResult.data || []).map((row) => [row.operational_function_id, row]));
      setCapacities(byFunction);
      setDrafts(Object.fromEntries((functionResult.data || []).map((item) => [item.id, byFunction[item.id]?.task_limit || ''])));
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [weekStart]);

  const today = dateOnly(new Date());
  const weekEnd = useMemo(() => {
    const date = new Date(`${weekStart}T12:00:00`);
    date.setDate(date.getDate() + 6);
    return dateOnly(date);
  }, [weekStart]);
  const openTasks = useMemo(() => (tasks || []).filter((task) => !TERMINAL.has(String(task.status || '').toLowerCase())), [tasks]);
  const taskDeadline = (task) => String(getEffectiveTaskDeadline(task).value || '').slice(0, 10);

  const cards = useMemo(() => functions.map((fn) => {
    const fnTasks = openTasks.filter((task) => task.operational_function_id === fn.id);
    const weekTasks = fnTasks.filter((task) => taskDeadline(task) && taskDeadline(task) >= weekStart && taskDeadline(task) <= weekEnd);
    const overdue = fnTasks.filter((task) => taskDeadline(task) && taskDeadline(task) < today);
    const reviewAlerts = fnTasks.filter((task) => Number(task.review_round || 0) >= 3);
    const limit = capacities[fn.id]?.task_limit || null;
    const memberNames = (fn.assignee_ids || []).map((id) => users.find((user) => user.id === id)?.full_name).filter(Boolean);
    return { ...fn, fnTasks, weekTasks, overdue, reviewAlerts, limit, memberNames, overloaded: Boolean(limit && weekTasks.length > limit) };
  }), [capacities, functions, openTasks, today, users, weekEnd, weekStart]);

  const unclassified = openTasks.filter((task) => !task.operational_function_id);
  const filteredUnclassified = unclassified.filter((task) => task.title?.toLowerCase().includes(unclassifiedSearch.trim().toLowerCase()));
  const visibleUnclassified = showAllUnclassified ? filteredUnclassified : filteredUnclassified.slice(0, 20);
  const saveCapacity = async (functionId) => {
    const limit = Number(drafts[functionId]);
    if (!Number.isInteger(limit) || limit < 1) {
      toast({ title: 'Informe um limite semanal válido', variant: 'destructive' });
      return;
    }
    setSavingId(functionId);
    const { error } = await supabase.from('task_function_capacities').upsert({
      operational_function_id: functionId,
      week_start: weekStart,
      task_limit: limit,
    }, { onConflict: 'operational_function_id,week_start' });
    setSavingId(null);
    if (error) toast({ title: 'Não foi possível salvar a capacidade', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Capacidade semanal salva' });
      await load();
    }
  };

  if (loading) return <p className="py-10 text-center text-muted-foreground">Carregando fila da equipe…</p>;

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Users className="h-5 w-5 text-violet-600" /><h2 className="text-xl font-bold">Fila e capacidade</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Semana de {new Date(`${weekStart}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${weekEnd}T12:00:00`).toLocaleDateString('pt-BR')}</p>
          </div>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="icon" aria-label="Ajuda sobre capacidade"><HelpCircle className="h-4 w-4" /></Button></PopoverTrigger>
            <PopoverContent className="max-w-xs text-sm">A capacidade é definida por função e por semana. A fila conta as tarefas com entrega nesta semana. Sem limite cadastrado, o sistema mostra a carga sem afirmar que existe sobrecarga.</PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <section key={card.id} className={`rounded-xl border bg-card p-4 ${card.overloaded ? 'border-red-400' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{card.name}</h3>
                <p className="text-xs text-muted-foreground">{card.memberNames.join(', ') || 'Sem pessoas vinculadas'}</p>
              </div>
              {card.overloaded ? <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />Acima da capacidade</span> : card.limit ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Dentro da capacidade</span> : <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Capacidade não definida</span>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted p-2"><strong className="block text-xl">{card.weekTasks.length}</strong><span className="text-xs text-muted-foreground">esta semana</span></div>
              <div className="rounded-lg bg-muted p-2"><strong className="block text-xl">{card.overdue.length}</strong><span className="text-xs text-muted-foreground">atrasadas</span></div>
              <div className="rounded-lg bg-muted p-2"><strong className="block text-xl">{card.fnTasks.length}</strong><span className="text-xs text-muted-foreground">em aberto</span></div>
            </div>
            {canManage && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1"><label className="text-xs text-muted-foreground">Limite de tarefas nesta semana</label><Input type="number" min="1" max="999" value={drafts[card.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [card.id]: event.target.value }))} placeholder="Definir" /></div>
                <Button onClick={() => void saveCapacity(card.id)} disabled={savingId === card.id}><Save className="mr-1 h-4 w-4" />Salvar</Button>
              </div>
            )}
            {(card.overdue.length > 0 || card.reviewAlerts.length > 0) && (
              <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                {[...new Map([...card.overdue, ...card.reviewAlerts].map((task) => [task.id, task])).values()].slice(0, 6).map((task) => (
                  <button type="button" key={task.id} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-muted" onClick={() => onOpenTask(task)}>
                    <span className="truncate">{task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{Number(task.review_round || 0) >= 3 ? `${task.review_round} revisões` : 'Atrasada'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="font-bold">Tarefas sem função definida <span className="ml-1 text-muted-foreground">{unclassified.length}</span></h3>
        <p className="mb-3 text-sm text-muted-foreground">As automações futuras classificam sozinhas. Abra somente as exceções que ainda precisam de definição.</p>
        {unclassified.length > 10 && <Input className="mb-3" value={unclassifiedSearch} onChange={(event) => setUnclassifiedSearch(event.target.value)} placeholder="Buscar tarefa sem função" />}
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {visibleUnclassified.map((task) => <button type="button" key={task.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => onOpenTask(task)}><span className="truncate">{task.title}</span><span className="shrink-0 text-xs text-muted-foreground">{task.due_date ? new Date(`${task.due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}</span></button>)}
          {!unclassified.length && <p className="text-sm text-emerald-700">Todas as tarefas abertas têm função definida.</p>}
          {unclassified.length > 0 && !visibleUnclassified.length && <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>}
        </div>
        {filteredUnclassified.length > 20 && <Button type="button" variant="outline" className="mt-3" onClick={() => setShowAllUnclassified((value) => !value)}>{showAllUnclassified ? 'Mostrar menos' : `Mostrar todas (${filteredUnclassified.length})`}</Button>}
      </section>
    </div>
  );
}
