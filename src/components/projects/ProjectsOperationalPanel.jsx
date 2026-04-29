import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Filter,
  ChevronRight,
  MoreHorizontal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  aggregateOperationalStats,
  annualCellPresentation,
  buildCampaignRows,
  buildClientRows,
  buildPendencias,
  calendarListEvents,
  getCampaignForClientMonth,
  materialHasLinkedTask,
  nextPublicationOrDeliveryEvents,
  planForProject,
  projectStatusLabel,
} from '@/lib/projectsOperationalMetrics';

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** A partir deste total de campanhas, o item na fila passa de Atenção para Crítico. */
const STALE_EXEC_QUEUE_CRITICAL_MIN = 5;

const CLIENT_ETAPAS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'qualification', label: 'Qualificação' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'closed', label: 'Fechado' },
  { value: 'lost', label: 'Perdido' },
];

/** Mês da célula (1º dia) estritamente depois do mês corrente → ainda “não chegou”; fica em branco se não houver campanha. */
function isAnnualMonthFuture(viewYear, monthIdx, reference = new Date()) {
  const cell = new Date(viewYear, monthIdx, 1);
  const ref = new Date(reference.getFullYear(), reference.getMonth(), 1);
  return cell > ref;
}

const tabBar = cn(
  'inline-flex h-auto w-full flex-wrap gap-1 rounded-full border border-border/60 bg-muted/40 p-1 dark:bg-muted/20'
);
const tabTrigger = cn(
  'rounded-full px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-white'
);

function healthStroke(score) {
  if (score >= 85) return 'stroke-emerald-500';
  if (score >= 60) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function HealthRing({ score }) {
  const c = 2 * Math.PI * 14;
  const dash = (score / 100) * c;
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg className="absolute h-12 w-12 -rotate-90" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="14" fill="none" className="stroke-muted/40" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={cn(healthStroke(score))}
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="relative z-10 text-[11px] font-bold tabular-nums text-foreground">{score}</span>
    </div>
  );
}

function TaskMicroBar({ done, active, risk, total }) {
  if (!total) return <span className="text-xs text-muted-foreground">—</span>;
  const pd = (done / total) * 100;
  const pa = (active / total) * 100;
  const pr = (risk / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-[80px] overflow-hidden rounded-full bg-muted ring-1 ring-border/50">
        <div className="bg-emerald-500 transition-all" style={{ width: `${pd}%` }} title={`${done} feitas`} />
        <div className="bg-violet-500 transition-all" style={{ width: `${pa}%` }} title={`${active} andamento`} />
        <div className="bg-red-500 transition-all" style={{ width: `${pr}%` }} title={`${risk} atrasadas`} />
      </div>
      <div className="text-[10px] tabular-nums text-muted-foreground">
        {done} · {active} · {risk}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children, className }) {
  return (
    <div className={cn('mb-3 flex items-center gap-2', className)}>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={2} />}
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{children}</h2>
    </div>
  );
}

/** Linha decorativa tipo sparkline (sem série histórica real). */
function MiniSparkline({ strength }) {
  const v = Math.min(100, Math.max(8, strength));
  const pts = [0.72, 0.68, 0.8, 0.76, 0.88, 0.84, 1].map((m, i) => {
    const x = (i / 6) * 100;
    const y = 36 - (v / 100) * 22 * m;
    return `${x},${y}`;
  });
  return (
    <svg className="mt-3 h-9 w-full text-emerald-500/90 dark:text-emerald-400/90" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
    </svg>
  );
}

function DeltaBadge({ value, suffix = '', invert = false }) {
  if (value === 0) return null;
  const pos = value > 0;
  const good = invert ? !pos : pos;
  return (
    <span
      className={cn(
        'ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
        good ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
      )}
    >
      {pos ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}

function healthLabelClass(label) {
  if (label === 'Saudável') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  if (label === 'Atenção') return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
  return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200';
}

/** Cores alinhadas à legenda da visão anual (mock). */
function annualToneClass(tone) {
  switch (tone) {
    case 'ok':
      return 'border border-emerald-200/90 bg-emerald-50 font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100';
    case 'run':
      return 'border border-amber-200/90 bg-amber-50 font-bold text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-100';
    case 'plan':
      return 'border border-violet-200/90 bg-violet-100 font-bold text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100';
    case 'risk':
      return 'border border-rose-200/90 bg-rose-50 font-bold text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100';
    case 'warn':
      return 'border border-rose-200/90 bg-rose-50 font-bold text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100';
    case 'muted':
      return 'border border-slate-200 bg-slate-100 font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
    default:
      return 'bg-transparent text-transparent';
  }
}

function fasePillClass(key) {
  if (key === 'sem_plano') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  if (key === 'planejado') return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200';
  if (key === 'execucao') return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-100';
  if (key === 'concluido') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (key === 'pausado') return 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
  return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
}

function planDotClass(key) {
  if (key === 'none') return 'bg-red-500';
  if (key === 'complete') return 'bg-emerald-500';
  return 'bg-amber-500';
}

export default function ProjectsOperationalPanel({
  clients,
  projects,
  tasks,
  campaignPlans,
  users,
  loading,
  navigate,
  onNewCampaign,
  onNewClient,
  onOpenClientProjects,
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');
  const [mainTab, setMainTab] = useState('geral');
  const [tableFilter, setTableFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortHealth, setSortHealth] = useState(true);
  const [etapaFilter, setEtapaFilter] = useState('closed');

  const clientsForPanel = useMemo(() => {
    if (etapaFilter === 'all') return clients;
    return clients.filter((c) => (c.etapa || '') === etapaFilter);
  }, [clients, etapaFilter]);

  const stats = useMemo(
    () =>
      aggregateOperationalStats({
        clients: clientsForPanel,
        projects,
        tasks,
        campaignPlans,
        year,
        monthIndex,
      }),
    [clientsForPanel, projects, tasks, campaignPlans, year, monthIndex]
  );

  const prevPeriod = useMemo(() => {
    if (monthIndex === 0) return { year: year - 1, monthIndex: 11 };
    return { year, monthIndex: monthIndex - 1 };
  }, [year, monthIndex]);

  const prevStats = useMemo(
    () =>
      aggregateOperationalStats({
        clients: clientsForPanel,
        projects,
        tasks,
        campaignPlans,
        year: prevPeriod.year,
        monthIndex: prevPeriod.monthIndex,
      }),
    [clientsForPanel, projects, tasks, campaignPlans, prevPeriod.year, prevPeriod.monthIndex]
  );

  const monthLongCapitalized = useMemo(() => {
    const d = new Date(year, monthIndex, 1);
    const raw = d.toLocaleDateString('pt-BR', { month: 'long' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [year, monthIndex]);

  const clientsById = useMemo(
    () => Object.fromEntries(clientsForPanel.map((c) => [c.id, c])),
    [clientsForPanel]
  );

  const clientRows = useMemo(
    () =>
      buildClientRows({
        clients: clientsForPanel,
        projects,
        tasks,
        campaignPlans,
        users,
        year,
        monthIndex,
      }),
    [clientsForPanel, projects, tasks, campaignPlans, users, year, monthIndex]
  );

  const pendencias = useMemo(
    () =>
      buildPendencias({
        clientRows,
        projects,
        tasks,
        campaignPlans,
        clients: clientsForPanel,
        year,
        monthIndex,
      }),
    [clientRows, projects, tasks, campaignPlans, clientsForPanel, year, monthIndex]
  );

  const campaignRows = useMemo(() => {
    const rows = buildCampaignRows({
      projects,
      clients: clientsForPanel,
      campaignPlans,
      tasks,
      year,
      monthIndex,
    });
    return rows.filter((r) => r.client);
  }, [projects, clientsForPanel, campaignPlans, tasks, year, monthIndex]);

  const upcoming7 = useMemo(
    () => nextPublicationOrDeliveryEvents({ projects, campaignPlans, clientsById, daysAhead: 7 }),
    [projects, campaignPlans, clientsById]
  );

  const upcomingCal = useMemo(
    () => nextPublicationOrDeliveryEvents({ projects, campaignPlans, clientsById, daysAhead: 28 }),
    [projects, campaignPlans, clientsById]
  );

  const calEvents = useMemo(
    () => calendarListEvents({ projects, campaignPlans, clients: clientsForPanel, year, monthIndex }),
    [projects, campaignPlans, clientsForPanel, year, monthIndex]
  );

  const byProjectTasks = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (!t.project_id) continue;
      if (!m[t.project_id]) m[t.project_id] = [];
      m[t.project_id].push(t);
    }
    return m;
  }, [tasks]);

  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (row) => {
    if (!searchLower) return true;
    const owner = users.find((u) => u.id === row.client.responsavel)?.full_name || '';
    const staleHit = (row.staleExecutions || []).some((se) =>
      (se.project?.name || '').toLowerCase().includes(searchLower)
    );
    return (
      (row.client.empresa || '').toLowerCase().includes(searchLower) ||
      (row.monthProject?.name || '').toLowerCase().includes(searchLower) ||
      owner.toLowerCase().includes(searchLower) ||
      staleHit
    );
  };

  const matchesHealth = (row) => {
    if (healthFilter === 'all') return true;
    if (healthFilter === 'saudavel') return row.health.label === 'Saudável';
    if (healthFilter === 'atencao') return row.health.label === 'Atenção';
    if (healthFilter === 'risco') return row.health.label === 'Risco';
    return true;
  };

  const matchesTableFilter = (row) => {
    if (tableFilter === 'all') return true;
    if (tableFilter === 'no_campaign') return !row.monthProject;
    if (tableFilter === 'no_plan') return row.monthProject && !row.plan;
    if (tableFilter === 'no_task_mat') return row.materialsWithoutTask > 0;
    if (tableFilter === 'overdue') return row.overdueCount > 0;
    if (tableFilter === 'no_date_mat') return row.materialsWithoutDate > 0;
    if (tableFilter === 'stale_execution') return (row.staleExecutionCount || 0) > 0;
    return true;
  };

  const filteredRows = useMemo(() => {
    const base = clientRows.filter((r) => matchesSearch(r) && matchesHealth(r) && matchesTableFilter(r));
    if (sortHealth) return [...base].sort((a, b) => a.health.score - b.health.score);
    return [...base].sort((a, b) => (a.client.empresa || '').localeCompare(b.client.empresa || '', 'pt'));
  }, [clientRows, searchLower, healthFilter, tableFilter, sortHealth]);

  const coveragePct = stats.activeClients ? Math.round((stats.coveredThisMonth / stats.activeClients) * 100) : 0;
  const productionPct = stats.materialsTotal ? Math.round((stats.materialsWithTask / stats.materialsTotal) * 100) : 0;
  const prevCoveragePct = prevStats.activeClients
    ? Math.round((prevStats.coveredThisMonth / prevStats.activeClients) * 100)
    : 0;
  const dCoveragePct = coveragePct - prevCoveragePct;
  const dCritical = stats.criticalPendencies - prevStats.criticalPendencies;
  const dMatLinked = stats.materialsWithTask - prevStats.materialsWithTask;
  const dUp7 = stats.upcoming7d - prevStats.upcoming7d;
  const staleTotal = stats.staleExecutionProjects ?? 0;
  const stalePrev = prevStats.staleExecutionProjects ?? 0;
  const dStale = staleTotal - stalePrev;

  const metaLine = useMemo(() => {
    const abbr = MONTHS_PT[monthIndex];
    return `${abbr} · ${year} · ${stats.activeClients} ${stats.activeClients === 1 ? 'cliente ativo' : 'clientes ativos'}`;
  }, [monthIndex, year, stats.activeClients]);

  const coverage = useMemo(() => {
    const inMonth = clientRows.filter((r) => r.monthProject);
    const withPlanComplete = inMonth.filter((r) => r.planStatus.key === 'complete').length;
    let matTotal = 0;
    let matWithTask = 0;
    for (const r of inMonth) {
      const mats = r.plan?.materiais || [];
      for (const m of mats) {
        matTotal += 1;
        const pTasks = byProjectTasks[r.monthProject.id] || [];
        const empresa = r.client.empresa || '';
        if (materialHasLinkedTask(m, pTasks, empresa)) matWithTask += 1;
      }
    }
    const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
    return {
      withCampaign: pct(inMonth.length, clientsForPanel.length),
      planComplete: pct(withPlanComplete, Math.max(inMonth.length, 1)),
      materialsTasked: pct(matWithTask, Math.max(matTotal, 1)),
    };
  }, [clientRows, clientsForPanel.length, byProjectTasks]);

  const queueItems = useMemo(() => {
    const noCamp = clientRows.filter((r) => !r.monthProject).map((r) => r.client.empresa);
    const overdueTitles = pendencias.critico.filter((p) => p.title === 'Tarefa atrasada').slice(0, 4);
    const noTaskTitles = pendencias.atencao.filter((p) => p.title === 'Material sem tarefa').slice(0, 4);
    const noDateTitles = pendencias.atencao.filter((p) => p.title === 'Material sem data').slice(0, 4);
    const staleSamples = clientRows
      .filter((r) => (r.staleExecutionCount || 0) > 0)
      .map((r) => {
        const se = r.staleExecutions[0];
        return `${r.client.empresa}: ${se.project.name} · ${se.refLabel}`;
      })
      .slice(0, 6);
    const staleCount = stats.staleExecutionProjects ?? 0;
    const staleSeverity = staleCount >= STALE_EXEC_QUEUE_CRITICAL_MIN ? 'critico' : 'atencao';
    const staleSubtitle =
      staleCount >= STALE_EXEC_QUEUE_CRITICAL_MIN
        ? `Volume alto (${staleCount}): priorize concluir ou atualizar o status das campanhas com referência antes de ${monthLongCapitalized} de ${year}.`
        : `Campanhas ainda em execução com mês de referência antes de ${monthLongCapitalized} de ${year}.`;
    return [
      {
        key: 'no_campaign',
        severity: 'critico',
        title: `Clientes sem campanha em ${monthLongCapitalized}`,
        subtitle: `${stats.withoutCampaign} precisam de campanha ativa neste mês.`,
        count: stats.withoutCampaign,
        samples: noCamp.slice(0, 6),
        action: 'Criar campanhas',
        onClick: () => {
          setMainTab('geral');
          setTableFilter('no_campaign');
        },
      },
      {
        key: 'stale_exec',
        severity: staleSeverity,
        title: 'Execução em meses anteriores',
        subtitle: staleSubtitle,
        count: staleCount,
        samples: staleSamples,
        action: 'Ver na tabela',
        onClick: () => {
          setMainTab('geral');
          setHealthFilter('all');
          setTableFilter('stale_execution');
        },
      },
      {
        key: 'overdue',
        severity: 'critico',
        title: 'Tarefas atrasadas',
        subtitle: `Prazos vencidos ligados a campanhas de ${monthLongCapitalized}.`,
        count: stats.overdueTasks,
        samples: overdueTitles.map((o) => o.detail.split(':').pop()?.trim() || o.detail),
        action: 'Abrir tarefas',
        onClick: () => setMainTab('pendencias'),
      },
      {
        key: 'no_task',
        severity: 'atencao',
        title: 'Materiais sem tarefa',
        subtitle: 'Plano publicado, mas produção ainda não virou tarefa.',
        count: stats.materialsWithoutTask,
        samples: noTaskTitles.map((o) => o.detail),
        action: 'Gerar tarefas',
        onClick: () => setMainTab('pendencias'),
      },
      {
        key: 'no_date',
        severity: 'atencao',
        title: 'Materiais sem data definida',
        subtitle: 'Sem data de publicação ou entrega no calendário.',
        count: clientRows.reduce((s, r) => s + r.materialsWithoutDate, 0),
        samples: noDateTitles.map((o) => o.detail),
        action: 'Definir datas',
        onClick: () => {
          setMainTab('geral');
          setTableFilter('no_date_mat');
        },
      },
    ];
  }, [clientRows, pendencias, stats, monthLongCapitalized, year]);

  const openProject = (projectId) => navigate(`/projects/${projectId}`);
  const openNewForClient = (clientId) => {
    navigate(`/projects/new?client_id=${clientId}&year=${year}&month=${monthIndex}`);
  };

  const openAnnualCell = (clientId, mIdx) => {
    const p = getCampaignForClientMonth(projects, clientId, year, mIdx);
    if (p) openProject(p.id);
    else navigate(`/projects/new?client_id=${clientId}&year=${year}&month=${mIdx}`);
  };

  const yearOptions = useMemo(() => {
    const ys = new Set([year, now.getFullYear(), now.getFullYear() + 1]);
    projects.forEach((p) => {
      if (p.mes_referencia) ys.add(new Date(p.mes_referencia).getFullYear());
    });
    return Array.from(ys).sort((a, b) => a - b);
  }, [projects, year, now]);

  const chip = (active) =>
    cn(
      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
      active
        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100'
        : 'border-border/80 bg-background text-muted-foreground hover:bg-muted/50'
    );

  const showFiltersToolbar = mainTab === 'geral' || filtersOpen;

  const renderClientTable = (compact) => {
    const nRisco = clientRows.filter((r) => r.health.label === 'Risco').length;
    const nSemCamp = clientRows.filter((r) => !r.monthProject).length;
    const nSaud = clientRows.filter((r) => r.health.label === 'Saudável').length;
    const nStaleExec = clientRows.filter((r) => (r.staleExecutionCount || 0) > 0).length;
    return (
    <div className="min-w-0 rounded-xl border border-gray-200/90 bg-card shadow-sm dark:border-gray-800">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
      <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filteredRows.length}</span> exibidos · {clientsForPanel.length} total
          <span className="mx-1.5 text-border">·</span>
          {sortHealth ? 'Saúde ↑' : 'A–Z'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={chip(healthFilter === 'all' && tableFilter === 'all')} onClick={() => { setHealthFilter('all'); setTableFilter('all'); }}>
            Todos {clientsForPanel.length}
          </button>
          <button type="button" className={chip(healthFilter === 'risco')} onClick={() => { setHealthFilter('risco'); setTableFilter('all'); }}>
            Em risco {nRisco}
          </button>
          <button type="button" className={chip(tableFilter === 'no_campaign')} onClick={() => { setHealthFilter('all'); setTableFilter('no_campaign'); }}>
            Sem campanha {nSemCamp}
          </button>
          <button
            type="button"
            className={chip(tableFilter === 'stale_execution')}
            onClick={() => {
              setHealthFilter('all');
              setTableFilter('stale_execution');
            }}
          >
            Exec. mês passado {nStaleExec}
          </button>
          <button type="button" className={chip(healthFilter === 'saudavel')} onClick={() => { setHealthFilter('saudavel'); setTableFilter('all'); }}>
            Saudáveis {nSaud}
          </button>
          <Select value={sortHealth ? 'health' : 'name'} onValueChange={(v) => setSortHealth(v === 'health')}>
            <SelectTrigger className="h-8 w-[128px] text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Saúde ↑</SelectItem>
              <SelectItem value="name">Nome A–Z</SelectItem>
            </SelectContent>
          </Select>
          {tableFilter !== 'all' && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setTableFilter('all')}>
              Limpar
            </Button>
          )}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border bg-muted/20 hover:bg-muted/20">
            <TableHead className="py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</TableHead>
            <TableHead className="max-w-[180px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Campanha de {monthLongCapitalized}
            </TableHead>
            <TableHead className="max-w-[200px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plano & materiais
            </TableHead>
            <TableHead className="py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tarefas</TableHead>
            <TableHead className="min-w-[120px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Próximo passo</TableHead>
            {!compact && (
              <TableHead className="min-w-[100px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Próx. publicação
              </TableHead>
            )}
            <TableHead className="w-[100px] py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={compact ? 6 : 7} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente neste filtro.
              </TableCell>
            </TableRow>
          ) : (
            filteredRows.map((row) => (
              <TableRow key={row.client.id} className="border-border/60 text-sm transition-colors hover:bg-muted/35">
                <TableCell className="align-top py-3">
                  <div className="flex items-start gap-2.5">
                    <HealthRing score={row.health.score} />
                    <div className="min-w-0 space-y-1">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          healthLabelClass(row.health.label)
                        )}
                      >
                        {row.health.label} · {row.health.score}%
                      </span>
                      <div className="font-semibold leading-tight text-foreground">{row.client.empresa}</div>
                      <div className="text-[11px] text-muted-foreground">{row.responsavelName}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-top py-3 max-w-[200px]">
                  <div className="space-y-2">
                    {!row.monthProject ? (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-200">Sem campanha</Badge>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="line-clamp-2 font-medium leading-snug text-foreground" title={row.campaignName}>
                          {row.campaignName}
                        </div>
                        <p className="text-[11px] capitalize text-muted-foreground">{row.campaignStatus.toLowerCase()}</p>
                      </div>
                    )}
                    {(row.staleExecutionCount || 0) > 0 ? (
                      <div className="rounded-md border border-amber-200/90 bg-amber-50/60 p-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                          {row.monthProject ? 'Também em exec. (ref. anterior)' : 'Execução em mês passado'}
                          {row.staleExecutionCount > 1 ? ` · ${row.staleExecutionCount}` : ''}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {row.staleExecutions.slice(0, 2).map((se) => (
                            <li key={se.project.id}>
                              <button
                                type="button"
                                className="line-clamp-2 w-full text-left text-[11px] font-medium text-amber-950 underline-offset-2 hover:underline dark:text-amber-50"
                                onClick={() => openProject(se.project.id)}
                              >
                                {se.project.name}
                                <span className="font-normal text-muted-foreground"> · {se.refLabel}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {row.staleExecutions.length > 2 ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">+{row.staleExecutions.length - 2} outra(s)</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top py-3 text-xs max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', planDotClass(row.planStatus.key))} />
                    <span className="text-foreground/90">{row.planStatus.label}</span>
                  </div>
                  {row.monthProject ? (
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      {row.materialsCount} materiais
                      {row.overdueCount > 0 && (
                        <span className="text-red-600 dark:text-red-400"> · {row.overdueCount} atrasado(s)</span>
                      )}
                      {row.materialsWithoutTask > 0 && (
                        <span className="text-amber-700 dark:text-amber-400"> · {row.materialsWithoutTask} sem tarefa</span>
                      )}
                      {row.materialsWithoutDate > 0 && <span> · {row.materialsWithoutDate} sem data</span>}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="align-top py-3">
                  <TaskMicroBar
                    done={row.taskBuckets.done}
                    active={row.taskBuckets.active}
                    risk={row.taskBuckets.risk}
                    total={row.tasksCount}
                  />
                </TableCell>
                <TableCell className="align-top py-3 text-sm font-medium leading-snug text-foreground max-w-[200px]">
                  {row.nextStep}
                </TableCell>
                {!compact && (
                  <TableCell className="align-top py-3 text-xs">
                    {row.nextPublication ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
                          {row.nextPublication.dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{row.nextPublication.label}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="align-top py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    {row.monthProject ? (
                      <Button
                        size="sm"
                        className="h-8 gap-1 rounded-full bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        onClick={() => openProject(row.monthProject.id)}
                      >
                        Abrir <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" className="h-8 text-xs rounded-full" onClick={() => openNewForClient(row.client.id)}>
                        Criar campanha
                      </Button>
                    )}
                    {!row.monthProject && (row.staleExecutionCount || 0) > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-full border-amber-300 bg-amber-50 text-xs text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/60"
                        onClick={() => openProject(row.staleExecutions[0].project.id)}
                      >
                        Abrir exec. antiga <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {onOpenClientProjects && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onOpenClientProjects(row.client.id)}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="text-foreground">
      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <div className="-mx-6 border-b border-gray-200/80 bg-background px-6 pb-4 pt-1 dark:border-gray-800">
          <div className="space-y-4">
            <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{metaLine}</p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Projetos<span className="text-emerald-600 dark:text-emerald-400">.</span>
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Saúde operacional dos clientes, pendências críticas e o que precisa sair hoje.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 border-gray-200 bg-card dark:border-gray-700" onClick={() => setFiltersOpen((v) => !v)}>
                  <Filter className="h-4 w-4" />
                  Filtros
                </Button>
                <Button variant="outline" size="sm" className="border-gray-200 bg-card dark:border-gray-700" onClick={onNewClient}>
                  <Plus className="h-4 w-4" />
                  Cliente
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  onClick={onNewCampaign}
                >
                  <Plus className="h-4 w-4" />
                  Nova campanha
                </Button>
              </div>
            </header>

            {showFiltersToolbar && (
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200/90 bg-muted/25 p-3 dark:border-gray-800 lg:flex-row lg:items-end lg:justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente, campanha ou responsável…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 border-border/80 bg-background pl-9 text-sm shadow-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">Período</span>
                  <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
                    <SelectTrigger className="h-10 w-[104px] text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(monthIndex)} onValueChange={(v) => setMonthIndex(parseInt(v, 10))}>
                    <SelectTrigger className="h-10 w-[148px] text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_PT.map((label, i) => (
                        <SelectItem key={label} value={String(i)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={healthFilter} onValueChange={setHealthFilter}>
                    <SelectTrigger className="h-10 w-[168px] text-sm bg-background">
                      <SelectValue placeholder="Saúde" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as saúdes</SelectItem>
                      <SelectItem value="saudavel">Saudável</SelectItem>
                      <SelectItem value="atencao">Atenção</SelectItem>
                      <SelectItem value="risco">Risco</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={etapaFilter} onValueChange={setEtapaFilter}>
                    <SelectTrigger className="h-10 w-[188px] text-sm bg-background">
                      <SelectValue placeholder="Etapa do cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as etapas</SelectItem>
                      {CLIENT_ETAPAS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <TabsList className={tabBar}>
              <TabsTrigger value="geral" className={tabTrigger}>
                Geral
              </TabsTrigger>
              <TabsTrigger value="anual" className={tabTrigger}>
                Visão anual
              </TabsTrigger>
              <TabsTrigger value="campanhas" className={tabTrigger}>
                Campanhas
              </TabsTrigger>
              <TabsTrigger value="calendario" className={tabTrigger}>
                Calendário
              </TabsTrigger>
              <TabsTrigger value="porCliente" className={tabTrigger}>
                Por cliente
              </TabsTrigger>
              <TabsTrigger value="pendencias" className={tabTrigger}>
                Pendências
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="geral" className="mt-5 space-y-8">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <section>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="rounded-xl border border-gray-200/90 bg-card p-4 shadow-sm dark:border-gray-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Cobertura de {MONTHS_PT[monthIndex]}
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-0">
                      <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{coveragePct}%</p>
                      <DeltaBadge value={dCoveragePct} suffix="%" />
                    </div>
                    <MiniSparkline strength={coveragePct} />
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">
                      {stats.coveredThisMonth} de {stats.activeClients} clientes com campanha ativa
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-200/90 bg-card p-4 shadow-sm dark:border-red-900/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                      Pendências críticas
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-0">
                      <p className="text-3xl font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
                        {stats.criticalPendencies}
                      </p>
                      <DeltaBadge value={dCritical} invert />
                    </div>
                    <p className="mt-3 text-xs leading-snug text-muted-foreground">
                      {stats.withoutCampaign} sem campanha · {stats.overdueTasks} atrasos
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 h-8 w-full border-red-200 bg-red-50 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                      onClick={() => setMainTab('pendencias')}
                    >
                      Resolver <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="rounded-xl border border-gray-200/90 bg-card p-4 shadow-sm dark:border-gray-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Em produção</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-0">
                      <p className="text-3xl font-bold tabular-nums tracking-tight">
                        {stats.materialsWithTask}
                        <span className="text-xl font-semibold text-muted-foreground">/{stats.materialsTotal || 0}</span>
                      </p>
                      <DeltaBadge value={dMatLinked} />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{productionPct}% dos materiais com tarefa</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${productionPct}%` }} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200/90 bg-card p-4 shadow-sm dark:border-gray-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Próximas pubs</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-0">
                      <p className="text-3xl font-bold tabular-nums tracking-tight">{stats.upcoming7d}</p>
                      <DeltaBadge value={dUp7} />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">próximos 7 dias</p>
                  </div>
                  <div
                    className={cn(
                      'rounded-xl border bg-card p-4 shadow-sm',
                      staleTotal > 0
                        ? 'border-amber-200/90 dark:border-amber-900/50'
                        : 'border-gray-200/90 dark:border-gray-800'
                    )}
                  >
                    <p
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        staleTotal > 0 ? 'text-amber-800 dark:text-amber-200' : 'text-muted-foreground'
                      )}
                    >
                      Exec. meses anteriores
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-0">
                      <p
                        className={cn(
                          'text-3xl font-bold tabular-nums tracking-tight',
                          staleTotal >= STALE_EXEC_QUEUE_CRITICAL_MIN
                            ? 'text-red-600 dark:text-red-400'
                            : staleTotal > 0
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-foreground'
                        )}
                      >
                        {staleTotal}
                      </p>
                      <DeltaBadge value={dStale} invert />
                    </div>
                    <p className="mt-3 text-xs leading-snug text-muted-foreground">
                      {stats.staleExecutionClients ?? 0}{' '}
                      {(stats.staleExecutionClients ?? 0) === 1 ? 'cliente' : 'clientes'} · ref. antes de {monthLongCapitalized}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'mt-4 h-8 w-full text-xs font-semibold',
                        staleTotal > 0
                          ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/60'
                          : 'border-border/80'
                      )}
                      disabled={staleTotal === 0}
                      onClick={() => {
                        setHealthFilter('all');
                        setTableFilter('stale_execution');
                      }}
                    >
                      Filtrar tabela <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      <h2 className="text-base font-semibold tracking-tight text-foreground">Fila de ação</h2>
                    </div>
                    <p className="mt-0.5 pl-4 text-xs text-muted-foreground">O que destrava a operação agora</p>
                  </div>
                  <button
                    type="button"
                    className="self-start text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400 sm:self-auto"
                    onClick={() => setMainTab('pendencias')}
                  >
                    Ver tudo →
                  </button>
                </div>
                <div className="space-y-2">
                  {queueItems.map((q) => (
                    <div
                      key={q.key}
                      className="flex flex-col gap-3 rounded-xl border border-gray-200/90 bg-card p-3 shadow-sm dark:border-gray-800 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                    >
                      <div
                        className={cn(
                          'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums',
                          q.severity === 'critico'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                        )}
                      >
                        {q.count}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-semibold uppercase',
                              q.severity === 'critico'
                                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
                                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                            )}
                          >
                            {q.severity === 'critico' ? 'Crítico' : 'Atenção'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{q.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{q.subtitle}</p>
                        {q.samples.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {q.samples.map((s, i) => (
                              <span
                                key={i}
                                className="max-w-[140px] truncate rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground/90 dark:bg-muted/20"
                                title={s}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-9 shrink-0 gap-1 self-stretch px-4 text-xs font-semibold sm:self-center"
                        onClick={q.onClick}
                      >
                        {q.action}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Clientes</h2>
                </div>
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                  <div className="min-w-0 xl:col-span-9">{renderClientTable(false)}</div>
                  <aside className="space-y-4 xl:col-span-3">
                    <div className="rounded-xl border border-gray-200/90 bg-card p-4 shadow-sm dark:border-gray-800">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                            <h3 className="text-sm font-semibold">Próximos 7 dias</h3>
                          </div>
                          <p className="mt-1 pl-4 text-[11px] text-muted-foreground">Publicações e entregas</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                          onClick={() => setMainTab('calendario')}
                        >
                          Calendário →
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {upcoming7.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                            Nada agendado.
                          </div>
                        ) : (
                          upcoming7.map((ev) => {
                            const kindLabel = ev.kind === 'publicação' ? 'Publicação' : 'Entrega';
                            return (
                              <button
                                key={`${ev.projectId}-${ev.label}-${ev.date}-${ev.kind}`}
                                type="button"
                                className="w-full rounded-lg border border-gray-100 bg-muted/20 px-3 py-2.5 text-left text-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 dark:border-gray-800 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/20"
                                onClick={() => openProject(ev.projectId)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                                    {ev.dateObj?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="shrink-0 border-0 bg-orange-100 text-[9px] font-semibold text-orange-900 dark:bg-orange-950/50 dark:text-orange-100"
                                  >
                                    {kindLabel}
                                  </Badge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{ev.label}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{ev.clientName}</p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200/90 bg-card p-4 shadow-sm dark:border-gray-800">
                      <h3 className="text-sm font-semibold">Cobertura</h3>
                      <dl className="mt-3 space-y-2.5 text-sm">
                        <div className="flex justify-between gap-2 border-b border-border/50 pb-2">
                          <dt className="text-muted-foreground">Campanha</dt>
                          <dd className="font-semibold tabular-nums">{coverage.withCampaign}%</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b border-border/50 pb-2">
                          <dt className="text-muted-foreground">Plano ok</dt>
                          <dd className="font-semibold tabular-nums">{coverage.planComplete}%</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Mat. → tarefa</dt>
                          <dd className="font-semibold tabular-nums">{coverage.materialsTasked}%</dd>
                        </div>
                      </dl>
                    </div>
                  </aside>
                </div>
              </section>
            </>
          )}
        </TabsContent>

        <TabsContent value="porCliente" className="mt-6">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="space-y-3">
              <SectionTitle icon={Users}>Por cliente</SectionTitle>
              {renderClientTable(true)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="anual" className="mt-6">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="rounded-xl border border-gray-200/90 bg-card p-5 shadow-sm dark:border-gray-800">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <h3 className="text-base font-semibold tracking-tight text-foreground">Visão anual · {year}</h3>
                  </div>
                  <p className="pl-4 text-sm text-muted-foreground">campanhas por cliente e mês</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:justify-end">
                  {[
                    ['ok', 'concluído'],
                    ['run', 'execução'],
                    ['plan', 'planejado'],
                    ['risk', 'atenção'],
                    ['warn', 'sem plano'],
                  ].map(([tone, label]) => (
                    <span key={tone} className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                      <span
                        className={cn(
                          'h-2.5 w-2.5 shrink-0 rounded-sm',
                          tone === 'ok' && 'bg-emerald-500',
                          tone === 'run' && 'bg-amber-400',
                          tone === 'plan' && 'bg-violet-500',
                          tone === 'risk' && 'bg-rose-500',
                          tone === 'warn' && 'bg-rose-600'
                        )}
                        aria-hidden
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200/90 bg-white dark:border-gray-800 dark:bg-card">
                <Table className="w-full min-w-[800px] border-collapse table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '96px', minWidth: '96px', maxWidth: '96px' }} />
                    {MONTHS_PT.map((_, i) => (
                      <col key={i} style={{ width: `${((100 - (96 / 800) * 100) / 12).toFixed(3)}%` }} />
                    ))}
                  </colgroup>
                  <TableHeader>
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="sticky left-0 z-20 box-border w-24 min-w-24 max-w-24 overflow-hidden border-b border-r border-gray-200 bg-gray-50 p-0 px-1 py-1.5 text-left text-[9px] font-bold uppercase leading-none tracking-wide text-gray-600 dark:border-gray-700 dark:bg-muted/50 dark:text-muted-foreground">
                        Cliente
                      </TableHead>
                      {MONTHS_PT.map((m, idx) => (
                        <TableHead
                          key={m}
                          className={cn(
                            'box-border border-b border-r border-gray-200 px-0.5 py-1.5 text-center text-[9px] font-bold capitalize leading-none tracking-wide text-gray-600 dark:border-gray-700 dark:text-muted-foreground',
                            idx === monthIndex && 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50'
                          )}
                        >
                          {m}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientsForPanel.map((client) => (
                      <TableRow
                        key={client.id}
                        className="border-0 transition-colors hover:bg-gray-50/60 dark:hover:bg-muted/20"
                      >
                        <TableCell
                          className="sticky left-0 z-10 box-border w-24 min-w-24 max-w-24 overflow-hidden border-b border-r border-gray-200 bg-card p-0 px-1 py-1 align-middle text-[10px] font-bold leading-tight text-foreground dark:border-gray-700"
                          title={client.empresa || undefined}
                        >
                          {(() => {
                            const primaryLogo =
                              Array.isArray(client.logo_urls) && client.logo_urls.length > 0
                                ? client.logo_urls[0]
                                : null;
                            const initials = (client.empresa || '?')
                              .trim()
                              .slice(0, 2)
                              .toUpperCase();
                            return (
                              <div className="flex max-w-full min-w-0 items-center gap-1">
                                <Avatar className="h-6 w-6 shrink-0 rounded-full border border-gray-200/90 dark:border-gray-600">
                                  <AvatarImage
                                    src={primaryLogo || undefined}
                                    alt=""
                                    className="object-cover"
                                  />
                                  <AvatarFallback className="rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1 truncate">{client.empresa}</span>
                              </div>
                            );
                          })()}
                        </TableCell>
                        {MONTHS_PT.map((_, mIdx) => {
                          const p = getCampaignForClientMonth(projects, client.id, year, mIdx);
                          const futureEmpty = !p && isAnnualMonthFuture(year, mIdx, now);
                          if (futureEmpty) {
                            return (
                              <TableCell
                                key={mIdx}
                                className={cn(
                                  'box-border border-b border-r border-gray-200 p-1 text-center align-middle dark:border-gray-700',
                                  mIdx === monthIndex && 'bg-amber-50/80 dark:bg-amber-950/20'
                                )}
                              >
                                <button
                                  type="button"
                                  title="Mês futuro — sem campanha. Clique para criar com antecedência."
                                  className="mx-auto flex min-h-[32px] w-full max-w-full items-center justify-center rounded-md border border-transparent bg-white px-0.5 py-1 text-[7px] transition-[opacity,transform] hover:border-dashed hover:border-gray-300 hover:bg-gray-50/80 active:scale-[0.98] dark:bg-transparent dark:hover:border-gray-600 dark:hover:bg-muted/20"
                                  onClick={() => openAnnualCell(client.id, mIdx)}
                                >
                                  <span className="sr-only">Sem campanha neste mês</span>
                                </button>
                              </TableCell>
                            );
                          }
                          const plan = p ? planForProject(campaignPlans, p.id) : null;
                          const pTasks = p ? byProjectTasks[p.id] || [] : [];
                          const pres = annualCellPresentation(p, plan, client.empresa || '', pTasks);
                          const label = (pres.pillLabel || pres.short || 'Sem plano').trim();
                          const statusTitle = p
                            ? `${p.name} · ${projectStatusLabel(p.status)}`
                            : 'Sem campanha neste mês — clique para criar';
                          return (
                            <TableCell
                              key={mIdx}
                              className={cn(
                                'box-border border-b border-r border-gray-200 p-1 text-center align-middle dark:border-gray-700',
                                mIdx === monthIndex && 'bg-amber-50/80 dark:bg-amber-950/20'
                              )}
                            >
                              <button
                                type="button"
                                title={statusTitle}
                                className={cn(
                                  'mx-auto flex min-h-[32px] w-full max-w-full items-center justify-center rounded-md px-0.5 py-1 text-[7px] font-bold leading-tight shadow-sm transition-[opacity,transform] hover:opacity-95 active:scale-[0.98] sm:min-h-[34px] sm:text-[8px]',
                                  annualToneClass(pres.tone)
                                )}
                                onClick={() => openAnnualCell(client.id, mIdx)}
                              >
                                <span className="line-clamp-3 px-0.5">{label}</span>
                              </button>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="campanhas" className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Campanhas · {MONTHS_PT[monthIndex]} {year}
              </h3>
              <p className="text-xs text-muted-foreground">{campaignRows.length} campanhas · {stats.inExecution} em execução</p>
            </div>
            <Button size="sm" className="gap-1 bg-violet-600 text-white hover:bg-violet-700" onClick={onNewCampaign}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Campanha</TableHead>
                  <TableHead className="text-xs font-semibold">Cliente</TableHead>
                  <TableHead className="text-xs font-semibold">Fase</TableHead>
                  <TableHead className="text-xs font-semibold">Plano</TableHead>
                  <TableHead className="text-xs font-semibold">Materiais</TableHead>
                  <TableHead className="text-xs font-semibold">Tarefas</TableHead>
                  <TableHead className="text-xs font-semibold">Saúde</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma campanha neste mês.
                    </TableCell>
                  </TableRow>
                ) : (
                  campaignRows.map((cr) => (
                    <TableRow key={cr.project.id} className="text-sm">
                      <TableCell className="max-w-[200px] truncate font-medium" title={cr.project.name}>
                        {cr.project.name}
                      </TableCell>
                      <TableCell>{cr.client?.empresa}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize', fasePillClass(cr.faseKey))}>
                          {cr.faseLabel}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', planDotClass(cr.planStatus.key))} />
                          {cr.planStatus.label}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {cr.materialsCount}
                        {cr.materialsWithoutTask > 0 && (
                          <span className="text-amber-700 dark:text-amber-400"> ({cr.materialsWithoutTask} s/ tarefa)</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{cr.tasksCount}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums',
                            cr.health.score >= 85 && 'text-emerald-600',
                            cr.health.score >= 60 && cr.health.score < 85 && 'text-amber-600',
                            cr.health.score < 60 && 'text-red-600'
                          )}
                        >
                          {cr.health.score}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="h-8 gap-1 rounded-full bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                          onClick={() => openProject(cr.project.id)}
                        >
                          Abrir <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="calendario" className="mt-6">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Calendário geral</h3>
            <p className="text-xs text-muted-foreground">Publicações e entregas de todos os clientes (próximas semanas)</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingCal.length === 0 ? (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nada agendado neste intervalo.</p>
              ) : (
                upcomingCal.map((ev) => (
                  <button
                    key={`${ev.projectId}-${ev.label}-${ev.date}-${ev.kind}`}
                    type="button"
                    className="flex flex-col rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => openProject(ev.projectId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                        {ev.dateObj?.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Agendado
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{ev.label}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ev.kind} · {ev.clientName}
                    </p>
                  </button>
                ))
              )}
            </div>
            {calEvents.length > 0 && (
              <div className="mt-8 border-t border-border pt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Todas as datas no mês filtrado ({MONTHS_PT[monthIndex]})</h4>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Cliente</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-right text-xs">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calEvents.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {(() => {
                              try {
                                return new Date(`${ev.date}T12:00:00`).toLocaleDateString('pt-BR');
                              } catch {
                                return ev.date;
                              }
                            })()}
                          </TableCell>
                          <TableCell className="text-xs">{ev.type}</TableCell>
                          <TableCell className="text-sm">{ev.clientName}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{ev.label}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openProject(ev.projectId)}>
                              Abrir
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pendencias" className="mt-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { title: 'Crítico', items: pendencias.critico, tone: 'border-red-200 dark:border-red-900/50' },
              { title: 'Atenção', items: pendencias.atencao, tone: 'border-amber-200 dark:border-amber-900/50' },
              { title: 'Aguardando', items: pendencias.aguardando, tone: 'border-slate-200 dark:border-slate-700' },
            ].map((col) => (
              <div key={col.title} className={cn('min-h-[200px] rounded-xl border bg-card p-4 shadow-sm', col.tone)}>
                <h3 className="text-xs font-semibold uppercase tracking-wide">{col.title}</h3>
                <div className="mt-2 max-h-[480px] space-y-2 overflow-y-auto">
                  {col.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nada aqui.</p>
                  ) : (
                    col.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                        onClick={() => {
                          if (item.projectId) openProject(item.projectId);
                          else if (item.clientId) openNewForClient(item.clientId);
                        }}
                      >
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-0.5 leading-snug text-muted-foreground">{item.detail}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
