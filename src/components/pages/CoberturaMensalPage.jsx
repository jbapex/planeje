import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileClock,
  FolderOpen,
  HelpCircle,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CoverageTasksDialog from '@/components/coverage/CoverageTasksDialog';
import { clientScopeUrl } from '@/lib/clientMonthlyScopes';
import {
  aggregateOperationalCoverage,
  computeCoberturaMensal,
  monthBounds,
  normalizeOperationalCoverageRow,
  OPERATIONAL_COVERAGE_TYPES,
  shouldShowGateBanner,
  statusCobertura,
  statusMeta,
  sumEntregaveis,
} from '@/lib/coberturaMensal';

function applyMonthlyScopes(rows, scopes) {
  const byClient = new Map((scopes || []).map((scope) => [scope.client_id, scope]));
  return (rows || []).map((row) => {
    const monthlyScope = byClient.get(row.cliente_id) || null;
    if (!monthlyScope) return normalizeOperationalCoverageRow(row);
    const contratado = sumEntregaveis(monthlyScope.deliverables);
    const coberturaPct = row.tipo_servico_norm === 'trafego_apenas' || contratado === 0
      ? null
      : Math.round((Number(row.planejado || 0) / contratado) * 100) / 100;
    return normalizeOperationalCoverageRow({
      ...row,
      contratado,
      cobertura_pct: coberturaPct,
      falta_planejar: Math.max(contratado - Number(row.planejado || 0), 0),
      status_cobertura: statusCobertura(row.tipo_servico_norm, contratado, coberturaPct || 0),
      monthly_scope: monthlyScope,
    });
  });
}

function shiftMonth(mesRef, delta) {
  const d = new Date(`${mesRef}T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return monthBounds(d).mesRef;
}

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

const metricTone = {
  danger: {
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
    accent: 'from-rose-500/70 to-orange-400/70',
  },
  warn: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    accent: 'from-amber-400/70 to-orange-400/70',
  },
  ok: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    accent: 'from-emerald-400/70 to-teal-400/70',
  },
  neutral: {
    icon: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
    accent: 'from-violet-500/70 to-fuchsia-400/70',
  },
};

function MetricCard({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const colors = metricTone[tone] || metricTone.neutral;
  return (
    <div className="group relative min-h-[116px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-card">
      <div className={cn('absolute inset-x-8 top-0 h-px bg-gradient-to-r', colors.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-muted-foreground">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-slate-950 tabular-nums dark:text-white">{value}</p>
        </div>
        {Icon && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', colors.icon)}><Icon className="h-[18px] w-[18px]" /></span>}
      </div>
      {hint && <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CoverageHero({ aggregate, accountsWithImproviso }) {
  const planned = Number(aggregate?.planejado_no_plano_total) || 0;
  const improvised = Number(aggregate?.improviso_total) || 0;
  const total = planned + improvised;
  const rawPct = total > 0 ? Math.round((planned / total) * 100) : 0;
  const ringPct = Math.max(0, Math.min(100, rawPct));
  const accountLabel = accountsWithImproviso === 1 ? 'conta está' : 'contas estão';

  return (
    <div className="relative flex min-h-[248px] overflow-hidden rounded-[26px] bg-[#111214] p-6 text-white shadow-[0_20px_55px_rgba(15,23,42,0.18)] sm:p-7">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="absolute -bottom-28 left-10 h-52 w-52 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="relative z-10 flex w-full flex-col justify-between gap-7 sm:flex-row sm:items-center">
        <div className="max-w-[290px]">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            <Target className="h-4 w-4 text-fuchsia-300" />
            Saúde do planejamento
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-[34px]">
            {accountsWithImproviso > 0 ? `${accountsWithImproviso} ${accountLabel} no improviso.` : 'Produção dentro do plano.'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/60">Mostra quanto da produção do mês nasceu do planejamento antes de virar tarefa.</p>
          <div className="mt-6 flex items-center gap-5 text-sm">
            <div><span className="block text-[11px] uppercase tracking-wider text-white/45">No plano</span><strong className="mt-1 block text-lg tabular-nums">{planned}</strong></div>
            <div className="h-9 w-px bg-white/10" />
            <div><span className="block text-[11px] uppercase tracking-wider text-white/45">Fora do plano</span><strong className="mt-1 block text-lg tabular-nums">{improvised}</strong></div>
          </div>
        </div>
        <div className="relative mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full sm:mx-0" style={{ background: `conic-gradient(#d946ef 0 ${ringPct * 0.65}%, #fb7185 ${ringPct * 0.65}% ${ringPct}%, rgba(255,255,255,.1) ${ringPct}% 100%)` }}>
          <div className="flex h-[112px] w-[112px] flex-col items-center justify-center rounded-full bg-[#111214] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
            <strong className="text-[30px] font-semibold tracking-[-0.05em] tabular-nums">{rawPct}%</strong>
            <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/45">no plano</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverageBar({ pct, status }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const width = Math.min(100, Math.round(Number(pct) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          status === 'acima' && 'bg-violet-500',
          status === 'coberto' && 'bg-emerald-500',
          status === 'parcial' && 'bg-amber-400',
          status === 'descoberto' && 'bg-rose-500',
          !['acima', 'coberto', 'parcial', 'descoberto'].includes(status) && 'bg-slate-300 dark:bg-slate-600',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function numberCell(value, className) {
  return <span className={cn('tabular-nums', className)}>{Number(value) || 0}</span>;
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function OperationMetric({ label, value, tone = 'slate' }) {
  const dot = {
    amber: 'bg-amber-400',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500',
    slate: 'bg-slate-300 dark:bg-slate-600',
  }[tone];
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-2.5 dark:bg-white/[0.04]">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-slate-500 dark:text-muted-foreground">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-slate-950 tabular-nums dark:text-white">{Number(value) || 0}</p>
    </div>
  );
}

function CoverageStatus({ row }) {
  const meta = statusMeta(row.status_cobertura);
  const tones = {
    info: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/45 dark:text-violet-200 dark:ring-violet-800',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/45 dark:text-rose-200 dark:ring-rose-800',
    warn: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-800',
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-800',
    muted: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  };
  return (
    <div className="space-y-2">
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', tones[meta.tone] || tones.muted)}>{meta.label}</span>
      <p className="text-[11px] text-slate-500 dark:text-muted-foreground">
        {row.status_cobertura === 'sem_escopo' ? 'Defina o escopo' : row.status_cobertura === 'nao_aplicavel' ? 'Fora desta conta' : row.falta_planejar > 0 ? `Faltam ${row.falta_planejar}` : row.status_cobertura === 'acima' ? `${row.planejado - row.contratado} acima do escopo` : 'Planejamento coberto'}
      </p>
    </div>
  );
}

function AccountHealth({ row }) {
  const planned = Number(row.planejado_no_plano) || 0;
  const improvised = Number(row.improviso) || 0;
  const total = planned + improvised;
  const plannedPct = total > 0 ? Math.round((planned / total) * 100) : null;

  let label = 'Sem produção';
  let detail = row.tem_plano_mes ? 'Plano sem materiais' : 'Sem plano no mês';
  let tone = 'muted';

  if (improvised > 0 && planned === 0) {
    label = 'No improviso';
    detail = `${improvised} ${improvised === 1 ? 'conteúdo fora' : 'conteúdos fora'} do plano`;
    tone = 'danger';
  } else if (improvised > 0) {
    label = `${plannedPct}% planejada`;
    detail = `${improvised} ${improvised === 1 ? 'conteúdo fora' : 'conteúdos fora'} do plano`;
    tone = 'warn';
  } else if (planned > 0) {
    label = 'Organizada';
    detail = 'Tudo ligado ao plano';
    tone = 'ok';
  } else if (row.tem_plano_mes) {
    label = 'Plano vazio';
    detail = 'Adicione os materiais';
  }

  const tones = {
    danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/45 dark:text-rose-200 dark:ring-rose-800',
    warn: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-800',
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-800',
    muted: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  };

  return (
    <div className="space-y-2">
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', tones[tone])}>{label}</span>
      <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{detail}</p>
    </div>
  );
}

function ClientTypeBreakdown({ row }) {
  const types = OPERATIONAL_COVERAGE_TYPES.map(([key, label]) => ({
    key,
    label,
    ...(row.por_tipo?.[key] || {}),
  })).filter((item) => [
    item.contratado,
    item.planejado,
    item.aguardando_tarefa,
    item.em_execucao,
    item.entregue,
    item.publicacoes_total,
  ].some((value) => Number(value) > 0));

  if (!types.length) {
    return <p className="py-2 text-sm text-muted-foreground">Nenhuma entrega registrada neste mês.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-card">
      <div className="grid min-w-[760px] grid-cols-[minmax(150px,1fr)_repeat(7,90px)] gap-2 border-b border-slate-200/70 bg-slate-50/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-muted-foreground">
        <span>Tipo</span><span className="text-right">Contratado</span><span className="text-right">Planejado</span><span className="text-right">Sem tarefa</span><span className="text-right">Em execução</span><span className="text-right">Entregue</span><span className="text-right">Publicações</span><span className="text-right">Falta</span>
      </div>
      {types.map((item) => (
        <div key={item.key} className="grid min-w-[760px] grid-cols-[minmax(150px,1fr)_repeat(7,90px)] items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-white/[0.06]">
          <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><span className="h-2 w-2 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />{item.label}</span>
          <span className="text-right">{numberCell(item.contratado)}</span>
          <span className="text-right">{numberCell(item.planejado)}</span>
          <span className="text-right">{numberCell(item.aguardando_tarefa, Number(item.aguardando_tarefa) > 0 && 'text-amber-700')}</span>
          <span className="text-right">{numberCell(item.em_execucao)}</span>
          <span className="text-right">{numberCell(item.entregue, Number(item.entregue) > 0 && 'text-emerald-700')}</span>
          <span className="text-right tabular-nums">{Number(item.publicacoes_publicadas) || 0}/{Number(item.publicacoes_total) || 0}</span>
          <span className="text-right">{numberCell(item.falta_planejar, Number(item.falta_planejar) > 0 && 'font-semibold text-red-700')}</span>
        </div>
      ))}
    </div>
  );
}

const COVERAGE_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'attention', label: 'Precisam de atenção' },
  { value: 'improviso', label: 'Com improviso' },
  { value: 'covered', label: 'Cobertos' },
  { value: 'above', label: 'Acima do escopo' },
];

export default function CoberturaMensalPage() {
  const { toast } = useToast();
  const [mesRef, setMesRef] = useState(() => monthBounds(new Date()).mesRef);
  const [rows, setRows] = useState([]);
  const [agregado, setAgregado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('operational');
  const [showTrafego, setShowTrafego] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [tasksDialogRow, setTasksDialogRow] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const bounds = useMemo(() => monthBounds(mesRef), [mesRef]);
  const mesLabel = useMemo(
    () => format(new Date(`${mesRef}T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR }),
    [mesRef],
  );

  const finishLoad = useCallback((nextRows, nextSource) => {
    const normalized = (nextRows || []).map(normalizeOperationalCoverageRow);
    setRows(normalized);
    setAgregado(aggregateOperationalCoverage(normalized, mesRef));
    setSource(nextSource);
  }, [mesRef]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: monthlyScopes, error: scopeError } = await supabase
        .from('client_monthly_scopes')
        .select('*')
        .eq('reference_month', mesRef);
      if (scopeError) throw scopeError;
      const { data: operationalRows, error: operationalError } = await supabase.rpc(
        'resumo_cobertura_operacional_mensal',
        { p_mes: mesRef },
      );
      if (!operationalError && Array.isArray(operationalRows)) {
        finishLoad(operationalRows, 'operational');
        return;
      }

      const { data: legacyRows, error: legacyError } = await supabase.rpc('resumo_cobertura_mensal', {
        p_mes: mesRef,
        p_exigir_responsavel_ativo: false,
      });
      if (!legacyError && Array.isArray(legacyRows)) {
        finishLoad(applyMonthlyScopes(legacyRows, monthlyScopes || []), 'legacy');
        return;
      }

      const [{ data: clientes, error: cErr }, { data: tarefas, error: tErr }, { data: projetos, error: pErr }, { data: profiles, error: prErr }] = await Promise.all([
        supabase.from('clientes').select('id, empresa, etapa, valor, tipo_servico, tipo_contrato, entregaveis, responsavel').eq('etapa', 'closed'),
        supabase.from('tarefas').select('id, client_id, project_id, status, due_date, type, description, briefing_completo, briefing_legado, briefing_estado').gte('due_date', bounds.inicio).lte('due_date', bounds.fim).not('client_id', 'is', null),
        supabase.from('projetos').select('id, client_id, mes_referencia, status').not('mes_referencia', 'is', null).gte('mes_referencia', bounds.inicio).lte('mes_referencia', bounds.fim),
        supabase.from('profiles').select('id, full_name, role, status').in('role', ['superadmin', 'admin', 'colaborador']),
      ]);
      if (cErr || tErr || pErr || prErr) throw cErr || tErr || pErr || prErr || operationalError || legacyError;
      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const computed = computeCoberturaMensal({ clientes: clientes || [], tarefas: tarefas || [], projetos: projetos || [], profilesById, mesRef, exigirResponsavelAtivo: false });
      finishLoad(applyMonthlyScopes(computed, monthlyScopes || []), 'client');
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Erro ao carregar cobertura', description: error?.message || String(error) });
      setRows([]);
      setAgregado(null);
    } finally {
      setLoading(false);
    }
  }, [mesRef, bounds.inicio, bounds.fim, finishLoad, toast]);

  useEffect(() => { load(); }, [load]);

  const gateTone = shouldShowGateBanner(mesRef, agregado?.gate_liberado);
  const mainRows = useMemo(() => (showTrafego ? rows : rows.filter((row) => row.status_cobertura !== 'nao_aplicavel')), [rows, showTrafego]);
  const filteredRows = useMemo(() => {
    const query = normalizeSearch(clientSearch);
    return mainRows.filter((row) => {
      const matchesSearch = !query || normalizeSearch(`${row.empresa} ${row.responsavel_nome}`).includes(query);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'attention' && ['descoberto', 'parcial', 'sem_escopo'].includes(row.status_cobertura))
        || (statusFilter === 'improviso' && row.improviso > 0)
        || (statusFilter === 'covered' && row.status_cobertura === 'coberto')
        || (statusFilter === 'above' && row.status_cobertura === 'acima');
      return matchesSearch && matchesStatus;
    });
  }, [clientSearch, mainRows, statusFilter]);
  const accountsWithImproviso = useMemo(
    () => mainRows.filter((row) => row.improviso > 0).length,
    [mainRows],
  );
  const clientsToPlan = useMemo(
    () => mainRows.filter((row) => Number(row.falta_planejar) > 0).length,
    [mainRows],
  );
  const pendingPublications = Math.max(
    Number(agregado?.publicacoes_total || 0) - Number(agregado?.publicacoes_publicadas || 0),
    0,
  );
  const trafegoRows = useMemo(() => rows.filter((row) => row.status_cobertura === 'nao_aplicavel'), [rows]);
  const goCurrent = () => setMesRef(monthBounds(new Date()).mesRef);
  const goNext = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); setMesRef(monthBounds(d).mesRef); };

  return (
    <div className="min-h-full w-full p-4 md:p-6">
      <div className="mx-auto max-w-[1580px] space-y-5">
        <WorkspacePageHeader
          title="Cobertura mensal"
          label="Planejamento"
          help="Cada material conta uma vez no contrato, mesmo quando é publicado em vários canais. Uma adaptação que exige nova edição deve ser criada como outro material. O plano registra a peça, Tarefas registra a execução e Publicações acompanha cada canal."
          actions={<>
            <div className="flex h-9 items-center rounded-xl border border-slate-200/80 bg-slate-50/80 px-0.5 dark:border-white/10 dark:bg-white/[0.04]">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Mês anterior" onClick={() => setMesRef((month) => shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="inline-flex min-w-[132px] items-center justify-center gap-1.5 px-1 text-xs font-semibold capitalize"><CalendarRange className="h-3.5 w-3.5 text-violet-500" />{mesLabel}</div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Próximo mês" onClick={() => setMesRef((month) => shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button variant="secondary" size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={goCurrent}>Mês atual</Button>
            <Button variant="secondary" size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={goNext}>Próximo plano</Button>
            <Button size="sm" className="h-9 rounded-xl bg-slate-950 px-3 text-xs text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950" asChild><Link to="/clients">Contratos<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={load} aria-label="Atualizar painel"><RefreshCw className="h-4 w-4" /></Button>
          </>}
        />

      {gateTone && (
        <Alert className={cn('rounded-2xl shadow-sm', gateTone === 'critical' && 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100', gateTone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100')}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>O planejamento de <strong className="capitalize">{mesLabel}</strong> ainda está incompleto: {agregado?.falta_planejar_total || 0} entregas faltando em {agregado?.qtd_descoberto || 0} clientes descobertos.</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center gap-2 rounded-[26px] border border-slate-200/70 bg-white text-slate-500 shadow-sm dark:border-white/10 dark:bg-card"><Loader2 className="h-5 w-5 animate-spin" />Calculando cobertura…</div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5"><CoverageHero aggregate={agregado} accountsWithImproviso={accountsWithImproviso} /></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              <MetricCard icon={AlertTriangle} label="Clientes para planejar" value={clientsToPlan} hint={`${agregado?.falta_planejar_total ?? 0} conteúdos ainda não previstos`} tone={clientsToPlan > 0 ? 'danger' : 'ok'} />
              <MetricCard icon={PlayCircle} label="Materiais sem tarefa" value={agregado?.aguardando_tarefa_total ?? 0} hint="Já estão no plano; falta iniciar" tone={(agregado?.aguardando_tarefa_total || 0) > 0 ? 'warn' : 'ok'} />
              <MetricCard icon={Clock} label="Tarefas atrasadas" value={agregado?.atrasadas_total ?? 0} hint="Precisam de ação hoje" tone={(agregado?.atrasadas_total || 0) > 0 ? 'danger' : 'ok'} />
              <MetricCard icon={FileClock} label="Publicações pendentes" value={pendingPublications} hint={`${agregado?.publicacoes_publicadas ?? 0} de ${agregado?.publicacoes_total ?? 0} concluídas`} tone={pendingPublications > 0 ? 'warn' : 'ok'} />
            </div>
          </div>

          <section className="overflow-hidden rounded-[26px] border border-slate-200/70 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-card">
            <div className="border-b border-slate-200/70 px-5 py-5 dark:border-white/10">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">Cobertura por cliente</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">Abra um cliente para conferir a composição por tipo de material.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative block min-w-[230px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Buscar cliente ou responsável" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100 dark:border-white/10 dark:bg-white/[0.04] dark:focus:ring-violet-900/40" />
                  </label>
                  <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.05]">
                    {COVERAGE_FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setStatusFilter(filter.value)} className={cn('rounded-lg px-3 py-2 text-xs font-medium transition', statusFilter === filter.value ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white')}>{filter.label}</button>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader className="bg-slate-50/70 dark:bg-white/[0.025]">
                  <TableRow className="border-slate-200/70 hover:bg-transparent dark:border-white/10">
                    <TableHead className="w-[210px] px-5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Cliente</TableHead>
                    <TableHead className="w-[150px] text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Planejamento</TableHead>
                    <TableHead className="w-[210px] text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Operação</TableHead>
                    <TableHead className="w-[90px] text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Publicações</TableHead>
                    <TableHead className="w-[150px] text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Situação</TableHead>
                    <TableHead className="w-[160px] text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        Saúde da conta
                        <Popover>
                          <PopoverTrigger asChild><button type="button" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Como a saúde da conta é calculada?"><HelpCircle className="h-3.5 w-3.5" /></button></PopoverTrigger>
                          <PopoverContent className="w-80 rounded-2xl text-sm leading-6">Mostra quanto da produção nasceu do planejamento mensal. Uma tarefa só é planejada quando está ligada a um material do plano; caso contrário, conta como improviso.</PopoverContent>
                        </Popover>
                      </span>
                    </TableHead>
                    <TableHead className="w-[220px] pr-5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!filteredRows.length ? (
                    <TableRow><TableCell colSpan={7} className="py-14 text-center text-slate-500">Nenhum cliente encontrado com estes filtros.</TableCell></TableRow>
                  ) : filteredRows.map((row) => {
                    const expanded = expandedClientId === row.cliente_id;
                    return <Fragment key={row.cliente_id}>
                      <TableRow className={cn('group border-slate-100 transition-colors hover:bg-slate-50/70 dark:border-white/[0.06] dark:hover:bg-white/[0.025]', expanded && 'bg-slate-50/80 dark:bg-white/[0.035]')}>
                        <TableCell className="px-5 py-4">
                          <button type="button" className="flex max-w-[215px] items-center gap-3 text-left" aria-expanded={expanded} onClick={() => setExpandedClientId(expanded ? null : row.cliente_id)}>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-xs font-semibold uppercase text-white shadow-sm dark:from-violet-500 dark:to-fuchsia-500">{String(row.empresa || '?').slice(0, 1)}</span>
                            <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block truncate font-semibold text-slate-950 dark:text-white">{row.empresa}</span><ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-90')} /></span><span className="mt-1 block truncate text-[11px] text-slate-500 dark:text-muted-foreground">{row.responsavel_nome}{row.improviso > 0 ? ` · ${row.improviso} fora do plano` : ''}</span></span>
                          </button>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="mb-2 flex items-baseline justify-between gap-3"><span className="text-sm font-semibold text-slate-950 tabular-nums dark:text-white">{row.planejado}<span className="font-normal text-slate-400">/{row.contratado}</span></span><span className="text-[11px] text-slate-500">{formatPct(row.cobertura_pct)}</span></div>
                          <CoverageBar pct={row.cobertura_pct} status={row.status_cobertura} />
                          <p className={cn('mt-2 text-[10px] font-medium', row.tem_plano_mes ? 'text-violet-600 dark:text-violet-300' : 'text-amber-700 dark:text-amber-300')}>
                            {row.tem_plano_mes
                              ? row.planejado_no_plano > 0
                                ? `Plano com ${row.planejado_no_plano} ${row.planejado_no_plano === 1 ? 'material' : 'materiais'}`
                                : 'Plano criado, sem materiais'
                              : 'Sem plano deste mês'}
                          </p>
                        </TableCell>
                        <TableCell className="py-4"><div className="grid grid-cols-3 gap-1.5"><OperationMetric label="Pendente" value={row.aguardando_tarefa} tone="amber" /><OperationMetric label="Execução" value={row.em_execucao} tone="violet" /><OperationMetric label="Entregue" value={row.entregue} tone="emerald" /></div></TableCell>
                        <TableCell className="py-4 text-center"><strong className="text-base text-slate-950 tabular-nums dark:text-white">{row.publicacoes_publicadas}</strong><span className="text-slate-400">/{row.publicacoes_total}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-400">por canal</span></TableCell>
                        <TableCell className="py-4"><CoverageStatus row={row} /></TableCell>
                        <TableCell className="py-4"><AccountHealth row={row} /></TableCell>
                        <TableCell className="py-4 pr-5">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {row.plano_id ? (
                              <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[11px]" asChild>
                                <Link to={`/projects/${row.plano_id}`}><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Abrir plano</Link>
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300" asChild>
                                <Link to={`/projects/new?client_id=${row.cliente_id}&year=${mesRef.slice(0, 4)}&month=${Number(mesRef.slice(5, 7)) - 1}`}><Plus className="mr-1 h-3.5 w-3.5" />Criar plano</Link>
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[11px]" onClick={() => setTasksDialogRow(row)}>
                              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />Tarefas{row.em_execucao + row.entregue > 0 ? ` (${row.em_execucao + row.entregue})` : ''}
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 px-2 text-[11px] shadow-none" asChild><Link to={clientScopeUrl(row.cliente_id, mesRef)}>Escopo</Link></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && <TableRow className="border-slate-100 dark:border-white/[0.06]"><TableCell colSpan={7} className="bg-slate-50/60 px-5 py-5 dark:bg-white/[0.02]"><ClientTypeBreakdown row={row} />{row.atrasadas > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><Clock className="h-3.5 w-3.5" />{row.atrasadas} material(is) atrasado(s).</p>}</TableCell></TableRow>}
                    </Fragment>;
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200/70 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
              <span>Fonte: {source === 'operational' ? 'materiais, tarefas e publicações' : 'compatibilidade da cobertura anterior'} · {filteredRows.length} de {mainRows.length} clientes exibidos</span>
              {!!trafegoRows.length && <button type="button" className="font-medium text-violet-600 hover:text-violet-800 dark:text-violet-300" onClick={() => setShowTrafego((value) => !value)}>{showTrafego ? 'Ocultar' : 'Mostrar'} tráfego apenas ({trafegoRows.length})</button>}
            </div>
          </section>

        </>
      )}
      </div>
      <CoverageTasksDialog
        row={tasksDialogRow}
        mesRef={mesRef}
        bounds={bounds}
        open={Boolean(tasksDialogRow)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setTasksDialogRow(null); }}
      />
    </div>
  );
}
