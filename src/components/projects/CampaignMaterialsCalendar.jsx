import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  Plus,
  Trash2,
  Check,
  ClipboardList,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  getPlanItemTaskWarnings,
  getMaterialCalendarDateKey,
  mergeCronogramaWithMaterials,
  buildTaskTitleFromPlanMaterial,
} from '@/lib/campaignPlanMateriais';
import { usePlataformasConteudo } from '@/hooks/usePlataformasConteudo';
import PlataformaMaterialSelect from '@/components/projects/PlataformaMaterialSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Interpreta yyyy-MM-dd sem deslocar o dia por fuso */
function parseMaterialDateString(yyyyMmDd) {
  const s = (yyyyMmDd || '').trim();
  if (!s) return undefined;
  try {
    const d = parseISO(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

const FUNIL_BADGE = {
  topo: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800',
  meio: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-800',
  fundo: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800',
};

const STATUS_BADGE = {
  em_andamento: 'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-800',
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200',
  publicado: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100',
};

const FORMATO_BADGE =
  'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-800';

function plataformaBadgeClass(name) {
  const k = (name || '').toLowerCase();
  if (k.includes('instagram'))
    return 'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/50 dark:text-purple-100 dark:border-purple-800';
  if (k.includes('tiktok'))
    return 'bg-pink-100 text-pink-900 border-pink-200 dark:bg-pink-950/50 dark:text-pink-100 dark:border-pink-800';
  if (k.includes('youtube'))
    return 'bg-red-100 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-100 dark:border-red-800';
  return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
}

function formatDateLongBR(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  try {
    return format(parseISO(yyyyMmDd), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return yyyyMmDd;
  }
}

function publicationDateLabel(m) {
  const post = (m?.data_postagem || '').trim();
  const ent = (m?.data_entrega || '').trim();
  if (post) return formatDateLongBR(post);
  if (ent) return `${formatDateLongBR(ent)} (data de entrega)`;
  return '—';
}

function statusMaterialLabel(v) {
  if (!v) return '—';
  return String(v).replace(/_/g, ' ');
}

function postPublicadoCell(m) {
  const url = (m?.link_publicacao || m?.url_publicacao || '').trim();
  if (url)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
        {url}
      </a>
    );
  return <span className="text-muted-foreground">Vazio</span>;
}

function materialEmoji(m) {
  if (m.tipo === 'video') return '💜';
  if (m.tipo === 'arte') return '💙';
  return '📎';
}

function tipoLabel(t) {
  if (t === 'video') return 'Vídeo';
  if (t === 'arte') return 'Arte';
  if (t === 'outro') return 'Outro';
  return (t && String(t)) || '';
}

const TIPO_BADGE_CAL = {
  arte: 'bg-sky-500/14 text-sky-800 dark:text-sky-200 border-sky-500/20',
  video: 'bg-violet-500/14 text-violet-800 dark:text-violet-200 border-violet-500/20',
  outro: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/18',
};

const FORMATO_BADGE_CAL =
  'bg-orange-500/12 text-orange-800 dark:text-orange-200/90 border-orange-500/15';

function emptyPlanTemplate(projectId) {
  return {
    project_id: projectId,
    objetivo: '',
    estrategia_comunicacao: { mensagem_principal: '', tom_voz: '', gatilhos: '' },
    conteudo_criativos: { fases: [] },
    trafego_pago: { orcamento: '', publico: '', objetivo: '' },
    materiais: [],
    cronograma: [],
  };
}

function defaultMaterial(dateStr) {
  return {
    id: Date.now(),
    tipo: 'arte',
    descricao: '',
    data_entrega: dateStr,
    data_postagem: dateStr,
    responsavel_id: null,
    detalhes: '',
    funil: 'meio',
    plataforma: 'Instagram',
    formato: 'Post',
    status_material: 'em_andamento',
  };
}

const CampaignMaterialsCalendar = ({ project, client, onRefresh }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [profiles, setProfiles] = useState([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState(null);
  const [editorPostPickerOpen, setEditorPostPickerOpen] = useState(false);
  const [editorEntregaPickerOpen, setEditorEntregaPickerOpen] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskItem, setTaskItem] = useState(null);
  const [insertingTask, setInsertingTask] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const { plataformas, loading: platsLoading } = usePlataformasConteudo();

  /** Modal estilo Notion: visualização antes de editar */
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekMaterialId, setPeekMaterialId] = useState(null);
  /** Chave yyyy-MM-dd do dia no calendário; null = chip “sem data” (lista de um item só). */
  const [peekDayKey, setPeekDayKey] = useState(null);

  const MATERIAL_DRAG_MIME = 'application/x-planeje-material-id';
  const lastMaterialDragEndRef = useRef(0);
  const [dragOverDayKey, setDragOverDayKey] = useState(null);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('campaign_plans').select('*').eq('project_id', project.id).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      toast({ title: 'Erro ao carregar plano', description: error.message, variant: 'destructive' });
      setPlan(null);
    } else if (data) {
      if (!data.materiais) data.materiais = [];
      if (!data.cronograma) data.cronograma = [];
      if (!data.conteudo_criativos) data.conteudo_criativos = { fases: [] };
      setPlan(data);
    } else {
      setPlan(null);
    }
    setLoading(false);
  }, [project.id, toast]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!editorOpen) {
      setEditorPostPickerOpen(false);
      setEditorEntregaPickerOpen(false);
    }
  }, [editorOpen]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').neq('role', 'cliente');
      setProfiles(data || []);
    })();
  }, []);

  const persistPlan = async (nextPlan, { silent } = {}) => {
    if (!nextPlan?.id) return;
    setSaving(true);
    const merged = {
      ...nextPlan,
      cronograma: mergeCronogramaWithMaterials(nextPlan),
    };
    const { error } = await supabase.from('campaign_plans').update(merged).eq('id', nextPlan.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
    setPlan(merged);
    if (!silent) toast({ title: 'Salvo', duration: 2000 });
    onRefresh?.();
    return true;
  };

  const createPlan = async () => {
    const row = emptyPlanTemplate(project.id);
    const { data, error } = await supabase.from('campaign_plans').insert(row).select().single();
    if (error) {
      toast({ title: 'Erro ao criar plano', description: error.message, variant: 'destructive' });
      return;
    }
    setPlan(data);
    onRefresh?.();
    toast({ title: 'Plano criado', description: 'Você já pode adicionar materiais ao calendário.' });
  };

  const materialsByDay = useMemo(() => {
    const map = new Map();
    for (const m of plan?.materiais || []) {
      const key = getMaterialCalendarDateKey(m);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [plan?.materiais]);

  const unscheduled = useMemo(
    () => (plan?.materiais || []).filter((m) => !getMaterialCalendarDateKey(m)),
    [plan?.materiais]
  );

  const peekList = useMemo(() => {
    if (!peekOpen || peekMaterialId == null || !plan) return [];
    if (peekDayKey) {
      return materialsByDay.get(peekDayKey) || [];
    }
    const one = plan.materiais?.find((x) => x.id === peekMaterialId);
    return one ? [one] : [];
  }, [peekOpen, peekMaterialId, peekDayKey, materialsByDay, plan]);

  const peekIndex = useMemo(() => {
    const i = peekList.findIndex((x) => x.id === peekMaterialId);
    return i >= 0 ? i : 0;
  }, [peekList, peekMaterialId]);

  const peekMaterial = peekList[peekIndex] ?? plan?.materiais?.find((x) => x.id === peekMaterialId) ?? null;

  useEffect(() => {
    if (!peekOpen || !peekMaterialId || !plan?.materiais) return;
    const exists = plan.materiais.some((x) => x.id === peekMaterialId);
    if (!exists) {
      setPeekOpen(false);
      setPeekMaterialId(null);
      setPeekDayKey(null);
    }
  }, [peekOpen, peekMaterialId, plan?.materiais]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const openNewForDay = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setEditorDraft(defaultMaterial(dateStr));
    setEditorOpen(true);
  };

  const openEdit = (m) => {
    setEditorDraft({ ...m });
    setEditorOpen(true);
  };

  const openPeek = (m, dayKey = null) => {
    setPeekMaterialId(m.id);
    setPeekDayKey(dayKey);
    setPeekOpen(true);
  };

  const closePeek = () => {
    setPeekOpen(false);
    setPeekMaterialId(null);
    setPeekDayKey(null);
  };

  const openEditFromPeek = () => {
    if (!peekMaterial) return;
    closePeek();
    openEdit(peekMaterial);
  };

  const prepareTaskFromPeek = () => {
    if (!peekMaterial) return;
    closePeek();
    openTaskDialog(peekMaterial);
  };

  const saveEditor = async () => {
    if (!plan || !editorDraft) return;
    const list = [...(plan.materiais || [])];
    const idx = list.findIndex((x) => x.id === editorDraft.id);
    let next;
    if (idx >= 0) {
      next = [...list];
      next[idx] = editorDraft;
    } else {
      next = [...list, editorDraft];
    }
    const ok = await persistPlan({ ...plan, materiais: next });
    if (ok) setEditorOpen(false);
  };

  const removeMaterial = async (id) => {
    if (!plan) return;
    const next = (plan.materiais || []).filter((m) => m.id !== id);
    const ok = await persistPlan({ ...plan, materiais: next });
    if (ok) {
      setDeleteTarget(null);
      setEditorOpen(false);
    }
  };

  const moveMaterialToDay = async (materialIdStr, targetDay) => {
    if (!plan) return;
    const targetKey = format(targetDay, 'yyyy-MM-dd');
    const mats = [...(plan.materiais || [])];
    const idx = mats.findIndex((m) => String(m.id) === String(materialIdStr));
    if (idx < 0) return;
    const orig = mats[idx];
    const oldKey = getMaterialCalendarDateKey(orig);
    if (!oldKey || oldKey === targetKey) return;

    const ent = (orig.data_entrega || '').trim();
    const updated = { ...orig, data_postagem: targetKey };
    if (!ent || ent === oldKey) {
      updated.data_entrega = targetKey;
    }

    const nextMats = mats.map((m, i) => (i === idx ? updated : m));
    const ok = await persistPlan({ ...plan, materiais: nextMats }, { silent: true });
    if (ok) {
      toast({
        title: 'Data atualizada',
        description: `Material movido para ${format(targetDay, "d 'de' MMMM", { locale: ptBR })}.`,
        duration: 2500,
      });
    }
  };

  const onMaterialDragStart = (e, materialId) => {
    e.dataTransfer.setData(MATERIAL_DRAG_MIME, String(materialId));
    e.dataTransfer.setData('text/plain', String(materialId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onCellDragOver = (e, dayKey) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes(MATERIAL_DRAG_MIME) && !types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDayKey(dayKey);
  };

  const onCellDragLeave = (e) => {
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setDragOverDayKey(null);
  };

  const onCellDrop = async (e, targetDay) => {
    e.preventDefault();
    setDragOverDayKey(null);
    lastMaterialDragEndRef.current = Date.now();
    const raw = e.dataTransfer.getData(MATERIAL_DRAG_MIME) || e.dataTransfer.getData('text/plain');
    if (!raw) return;
    await moveMaterialToDay(raw, targetDay);
  };

  const openTaskDialog = (item) => {
    setTaskItem(item);
    setTaskDialogOpen(true);
  };

  /** Garante material salvo no plano antes de criar tarefa (evita rascunho só na memória). */
  const prepareTaskFromEditor = async () => {
    if (!editorDraft || !plan) return;
    const list = [...(plan.materiais || [])];
    const idx = list.findIndex((x) => x.id === editorDraft.id);
    const nextMats = idx >= 0 ? list.map((x) => (x.id === editorDraft.id ? editorDraft : x)) : [...list, editorDraft];
    const ok = await persistPlan({ ...plan, materiais: nextMats }, { silent: true });
    if (ok) openTaskDialog(editorDraft);
  };

  const confirmTask = async () => {
    if (!taskItem || !user) return;
    const { blocking } = getPlanItemTaskWarnings(taskItem);
    if (blocking.length) return;
    setInsertingTask(true);
    try {
      const newTask = {
        title: buildTaskTitleFromPlanMaterial(client?.empresa, taskItem.descricao),
        description: taskItem.detalhes || null,
        status: 'todo',
        project_id: project.id,
        client_id: project.client_id,
        owner_id: user.id,
        assignee_ids: taskItem.responsavel_id ? [taskItem.responsavel_id] : [],
        type: taskItem.tipo,
        due_date: taskItem.data_entrega || null,
        post_date: taskItem.data_postagem || null,
        plataforma: (taskItem.plataforma || '').trim() || null,
      };
      const { error } = await supabase.from('tarefas').insert(newTask);
      if (error) {
        toast({ title: 'Erro ao criar tarefa', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Tarefa criada!', description: 'Veja em Tarefas.' });
        setTaskDialogOpen(false);
        setTaskItem(null);
      }
    } finally {
      setInsertingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
        <CalendarIcon className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground max-w-md">
          Crie um plano de campanha para usar o calendário. Os itens vêm da seção <strong>Materiais necessários</strong> e aparecem pela{' '}
          <strong>data de postagem</strong> (ou data de entrega se a postagem estiver vazia).
        </p>
        <Button onClick={createPlan}>Criar plano de campanha</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            Calendário de conteúdo
            {client?.empresa ? (
              <span className="text-muted-foreground font-normal">| {client.empresa}</span>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</p>
          <p className="text-xs text-muted-foreground/80 hidden sm:block">Mesmos dados da aba Plano de Campanha</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-muted-foreground" onClick={() => setMonth(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] dark:bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-950/80 dark:text-amber-100/90">
          <span className="font-medium">Sem data: </span>
          {unscheduled.length} material(is) — defina postagem ou entrega no plano.
          <div className="flex flex-wrap gap-1.5 mt-2">
            {unscheduled.map((m) => (
              <button
                key={m.id}
                type="button"
                draggable
                onDragStart={(e) => onMaterialDragStart(e, m.id)}
                onDragEnd={() => {
                  lastMaterialDragEndRef.current = Date.now();
                }}
                onClick={() => {
                  if (Date.now() - lastMaterialDragEndRef.current < 220) return;
                  openPeek(m, null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs hover:bg-muted/60 transition-colors cursor-grab active:cursor-grabbing"
                title="Arraste para um dia no calendário"
              >
                <span>{materialEmoji(m)}</span>
                <span className="truncate max-w-[200px]">{m.descricao?.slice(0, 40) || 'Sem título'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-300 bg-background dark:border-border/40">
        <div className="grid grid-cols-7 border-b border-zinc-300 bg-zinc-50/90 dark:border-border/40 dark:bg-transparent">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 py-2 text-center text-[11px] font-normal text-muted-foreground border-r border-zinc-200 last:border-r-0 dark:border-r-border/25 dark:last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr bg-zinc-50/40 dark:bg-zinc-950/40">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const items = materialsByDay.get(key) || [];
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);
            return (
              <div
                key={key}
                onDragOver={(e) => onCellDragOver(e, key)}
                onDragLeave={onCellDragLeave}
                onDrop={(e) => onCellDrop(e, day)}
                className={cn(
                  'group/cell relative min-h-[104px] sm:min-h-[118px] flex flex-col',
                  'border-b border-r border-zinc-300 dark:border-zinc-700/55',
                  '[&:nth-child(7n)]:border-r-0',
                  inMonth ? 'bg-white/90 dark:bg-zinc-950/50' : 'bg-zinc-100/70 dark:bg-zinc-950/30',
                  !inMonth && 'text-muted-foreground/70',
                  dragOverDayKey === key && 'ring-2 ring-primary ring-inset z-[2] bg-primary/5 dark:bg-primary/10'
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openNewForDay(day);
                  }}
                  className={cn(
                    'absolute left-1 top-1 z-[1] flex h-6 w-6 items-center justify-center rounded text-muted-foreground',
                    'text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/50 sm:text-muted-foreground sm:opacity-0 sm:transition-opacity sm:hover:bg-muted/70 sm:group-hover/cell:opacity-100',
                    'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                  )}
                  aria-label={`Novo material em ${format(day, 'd/MM/yyyy')}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center justify-end gap-1 px-1.5 pt-1">
                  <span
                    className={cn(
                      'tabular-nums text-[11px] leading-none text-muted-foreground',
                      inMonth && 'text-foreground/90',
                      today && 'font-semibold text-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {today ? <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="Hoje" aria-hidden /> : null}
                </div>
                <div className="flex-1 space-y-1 overflow-hidden px-1 pb-1 pt-0.5">
                  {items.slice(0, 4).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      draggable
                      onDragStart={(e) => onMaterialDragStart(e, m.id)}
                      onDragEnd={() => {
                        lastMaterialDragEndRef.current = Date.now();
                      }}
                      onClick={() => {
                        if (Date.now() - lastMaterialDragEndRef.current < 220) return;
                        openPeek(m, key);
                      }}
                      title="Arraste para outro dia no calendário"
                      className={cn(
                        'w-full rounded-[4px] text-left px-1.5 py-1 transition-colors',
                        'bg-muted/70 dark:bg-zinc-800/90',
                        'border-0 shadow-none',
                        'hover:bg-muted dark:hover:bg-zinc-700/90',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        'cursor-grab active:cursor-grabbing'
                      )}
                    >
                      <div className="text-[11px] leading-snug line-clamp-2 text-foreground">
                        <span className="mr-0.5 select-none">{materialEmoji(m)}</span>
                        <span className="font-medium">{m.descricao || 'Sem título'}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {tipoLabel(m.tipo) ? (
                          <span
                            className={cn(
                              'inline-flex max-w-full items-center truncate rounded px-1 py-px text-[9px] font-normal leading-none border',
                              TIPO_BADGE_CAL[m.tipo] ?? 'bg-muted/50 text-muted-foreground border-border/30'
                            )}
                            title={tipoLabel(m.tipo)}
                          >
                            {tipoLabel(m.tipo)}
                          </span>
                        ) : null}
                        {(m.formato || '').trim() ? (
                          <span
                            className={cn(
                              'inline-flex max-w-full items-center truncate rounded px-1 py-px text-[9px] font-normal leading-none border',
                              FORMATO_BADGE_CAL
                            )}
                            title={(m.formato || '').trim()}
                          >
                            {(m.formato || '').trim()}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                  {items.length > 4 && (
                    <p className="px-0.5 text-[10px] text-muted-foreground/80">+{items.length - 4}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={peekOpen}
        onOpenChange={(open) => {
          if (open) setPeekOpen(true);
          else closePeek();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-2xl dark:bg-zinc-950 dark:border-zinc-800">
          {peekMaterial && (
            <>
              <DialogHeader className="space-y-0 text-left sr-only">
                <DialogTitle>{peekMaterial.descricao || 'Material'}</DialogTitle>
              </DialogHeader>

              {peekList.length > 1 && (
                <div className="flex items-center justify-between gap-2 -mt-1 mb-1">
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Material anterior"
                      disabled={peekIndex <= 0}
                      onClick={() => setPeekMaterialId(peekList[peekIndex - 1].id)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Próximo material"
                      disabled={peekIndex >= peekList.length - 1}
                      onClick={() => setPeekMaterialId(peekList[peekIndex + 1].id)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {peekIndex + 1} / {peekList.length}
                  </span>
                </div>
              )}

              <div className="text-center pb-4 pt-0">
                <div className="text-[2.75rem] leading-none mb-3 select-none" aria-hidden>
                  {materialEmoji(peekMaterial)}
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground px-1">
                  {peekMaterial.descricao || 'Sem título'}
                </h2>
              </div>

              <div className="rounded-xl border bg-muted/25 px-3 py-1 mb-4">
                <PeekPropRow label="Data da publicação">{publicationDateLabel(peekMaterial)}</PeekPropRow>
                <PeekPropRow label="Funil">
                  {peekMaterial.funil ? (
                    <Badge variant="outline" className={cn('text-xs border', FUNIL_BADGE[peekMaterial.funil] ?? 'bg-muted')}>
                      {peekMaterial.funil}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </PeekPropRow>
                <PeekPropRow label="Plataforma">
                  {peekMaterial.plataforma ? (
                    <Badge variant="outline" className={cn('text-xs border', plataformaBadgeClass(peekMaterial.plataforma))}>
                      {peekMaterial.plataforma}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </PeekPropRow>
                <PeekPropRow label="Formato">
                  {peekMaterial.formato ? (
                    <Badge variant="outline" className={cn('text-xs border', FORMATO_BADGE)}>
                      {peekMaterial.formato}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </PeekPropRow>
                <PeekPropRow label="Status">
                  {peekMaterial.status_material ? (
                    <Badge
                      variant="outline"
                      className={cn('text-xs border', STATUS_BADGE[peekMaterial.status_material] ?? 'bg-muted')}
                    >
                      {statusMaterialLabel(peekMaterial.status_material)}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </PeekPropRow>
                <PeekPropRow label="Post publicado">{postPublicadoCell(peekMaterial)}</PeekPropRow>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Detalhes</p>
                {(peekMaterial.detalhes || '').trim() ? (
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{peekMaterial.detalhes}</div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nenhum briefing ou roteiro preenchido.</p>
                )}
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2 pt-6 border-t border-border mt-4">
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto w-full sm:w-auto"
                  onClick={() => {
                    if (!peekMaterial) return;
                    setDeleteTarget(peekMaterial.id);
                    closePeek();
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir material
                </Button>
                <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                  <Button type="button" variant="outline" onClick={closePeek}>
                    Fechar
                  </Button>
                  <Button type="button" variant="outline" onClick={prepareTaskFromPeek}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Criar tarefa…
                  </Button>
                  <Button type="button" onClick={openEditFromPeek}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>{editorDraft?.descricao ? 'Editar material' : 'Novo material'}</DialogTitle>
            <DialogDescription>
              Salvo em <strong>Materiais necessários</strong> do plano. Preencha descrição e datas para poder criar tarefa.
            </DialogDescription>
          </DialogHeader>
          {editorDraft && (
            <div className="grid gap-3 py-2">
              <div className="grid gap-2">
                <Label>Descrição / título</Label>
                <Input
                  value={editorDraft.descricao}
                  onChange={(e) => setEditorDraft((d) => ({ ...d, descricao: e.target.value }))}
                  placeholder="Ex.: Stories - Produtos variados"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Data de postagem</Label>
                  <Popover open={editorPostPickerOpen} onOpenChange={setEditorPostPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal h-10 dark:bg-gray-900 dark:border-gray-600 dark:text-white',
                          !editorDraft.data_postagem?.trim() && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                        {(() => {
                          const d = parseMaterialDateString(editorDraft.data_postagem);
                          return d ? format(d, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione';
                        })()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 dark:bg-zinc-950 dark:border-zinc-800" align="start">
                      <Calendar
                        mode="single"
                        locale={ptBR}
                        initialFocus
                        defaultMonth={parseMaterialDateString(editorDraft.data_postagem) || new Date()}
                        selected={parseMaterialDateString(editorDraft.data_postagem)}
                        onSelect={(date) => {
                          setEditorDraft((d) => ({
                            ...d,
                            data_postagem: date ? format(date, 'yyyy-MM-dd') : '',
                          }));
                          setEditorPostPickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de entrega</Label>
                  <Popover open={editorEntregaPickerOpen} onOpenChange={setEditorEntregaPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal h-10 dark:bg-gray-900 dark:border-gray-600 dark:text-white',
                          !editorDraft.data_entrega?.trim() && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                        {(() => {
                          const d = parseMaterialDateString(editorDraft.data_entrega);
                          return d ? format(d, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione';
                        })()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 dark:bg-zinc-950 dark:border-zinc-800" align="start">
                      <Calendar
                        mode="single"
                        locale={ptBR}
                        initialFocus
                        defaultMonth={parseMaterialDateString(editorDraft.data_entrega) || new Date()}
                        selected={parseMaterialDateString(editorDraft.data_entrega)}
                        onSelect={(date) => {
                          setEditorDraft((d) => ({
                            ...d,
                            data_entrega: date ? format(date, 'yyyy-MM-dd') : '',
                          }));
                          setEditorEntregaPickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tipo</Label>
                  <Select value={editorDraft.tipo} onValueChange={(v) => setEditorDraft((d) => ({ ...d, tipo: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arte">Arte</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Formato</Label>
                  <Input
                    value={editorDraft.formato || ''}
                    onChange={(e) => setEditorDraft((d) => ({ ...d, formato: e.target.value }))}
                    placeholder="Stories, Reels, Post..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Funil</Label>
                  <Select value={editorDraft.funil || 'meio'} onValueChange={(v) => setEditorDraft((d) => ({ ...d, funil: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="topo">Topo</SelectItem>
                      <SelectItem value="meio">Meio</SelectItem>
                      <SelectItem value="fundo">Fundo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Plataforma</Label>
                  <PlataformaMaterialSelect
                    value={editorDraft.plataforma}
                    onChange={(v) => setEditorDraft((d) => ({ ...d, plataforma: v }))}
                    plataformas={plataformas}
                    loading={platsLoading}
                  />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editorDraft.status_material || 'em_andamento'}
                  onValueChange={(v) => setEditorDraft((d) => ({ ...d, status_material: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="publicado">Publicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Responsável</Label>
                <Select
                  value={editorDraft.responsavel_id || 'ninguem'}
                  onValueChange={(v) => setEditorDraft((d) => ({ ...d, responsavel_id: v === 'ninguem' ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguem">Ninguém</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Detalhes / roteiro / legenda</Label>
                <Textarea
                  rows={5}
                  value={editorDraft.detalhes || ''}
                  onChange={(e) => setEditorDraft((d) => ({ ...d, detalhes: e.target.value }))}
                  placeholder="Briefing, legenda, roteiro..."
                />
              </div>
              {renderTaskPlanHints(editorDraft)}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editorDraft && plan.materiais?.some((m) => m.id === editorDraft.id) && (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setDeleteTarget(editorDraft.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            )}
            <Button type="button" variant="outline" onClick={prepareTaskFromEditor} disabled={!editorDraft || saving}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Criar tarefa…
            </Button>
            <Button type="button" onClick={saveEditor} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove o item do plano. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteTarget && removeMaterial(deleteTarget)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={taskDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setTaskDialogOpen(false);
            setTaskItem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar tarefa a partir deste material?</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">Confirme a criação da tarefa no sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          {taskItem && (
            <div className="text-sm space-y-2 text-muted-foreground">
              <p>
                Título:{' '}
                <span className="text-foreground font-medium">
                  {buildTaskTitleFromPlanMaterial(client?.empresa, taskItem.descricao)}
                </span>
              </p>
              {(() => {
                const { blocking, optional } = getPlanItemTaskWarnings(taskItem);
                return (
                  <>
                    {blocking.length > 0 && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800 text-sm dark:bg-red-950/40 dark:text-red-200 dark:border-red-900">
                        <p className="font-medium">Preencha no material:</p>
                        <ul className="list-disc pl-4">{blocking.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    )}
                    {optional.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:bg-amber-950/30 dark:border-amber-900">
                        <p className="font-medium text-amber-900 dark:text-amber-100">Opcional:</p>
                        <ul className="list-disc pl-4">{optional.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={insertingTask}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmTask}
              disabled={!taskItem || getPlanItemTaskWarnings(taskItem).blocking.length > 0 || insertingTask}
            >
              {insertingTask ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Sim, criar tarefa
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function PeekPropRow({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1 py-2.5 text-sm border-b border-border/50 last:border-0 items-start">
      <span className="text-muted-foreground text-xs sm:text-sm leading-snug">{label}</span>
      <div className="min-w-0 text-sm text-foreground flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function renderTaskPlanHints(item) {
  const { blocking, optional } = getPlanItemTaskWarnings(item);
  if (!blocking.length && !optional.length) return null;
  return (
    <div className="text-xs space-y-1 rounded-md border p-2 bg-muted/30">
      {blocking.length > 0 && (
        <p className="text-red-600 dark:text-red-400">
          <span className="font-medium">Obrigatório para tarefa:</span> {blocking.join(', ')}
        </p>
      )}
      {optional.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          <span className="font-medium">Recomendado:</span> {optional.join(', ')}
        </p>
      )}
    </div>
  );
}

export default CampaignMaterialsCalendar;
