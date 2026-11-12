import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Eye, List, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildProjectsActionOverview } from '@/lib/projectActions';
import { projectPeriodLabel } from '@/lib/projectPeriod';
import { buildProjectsMonthlyOverview, PROJECT_STAGES } from '@/lib/projectsMonthlyOverview';
import { projectStatusLabel } from '@/lib/projectsOperationalMetrics';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import ProjectsMonthlyKanban, { ProjectClientMark } from '@/components/projects/ProjectsMonthlyKanban';
import ProjectPlanningSettingsDialog from '@/components/projects/ProjectPlanningSettingsDialog';
import ProjectDeadlineLabel from '@/components/projects/ProjectDeadlineLabel';
import { useProjectPlanningSettings } from '@/hooks/useProjectPlanningSettings';
import { CONTA_SERVICOS, clientNeedsMonthlyPlan, isAutomaticPlanningPeriod, localDateKey, pendingPlanningRows } from '@/lib/projectPlanningWorkflow';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';

function monthLabel(year, monthIndex) {
  const label = new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function initialPeriod(year, monthIndex) {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem('projects-monthly-period') || 'null'); } catch { /* optional preference */ }
  const candidateYear = Number(year || saved?.year || nextMonth.getFullYear());
  const candidateMonth = Number(monthIndex ?? saved?.monthIndex ?? nextMonth.getMonth());
  return {
    year: Number.isInteger(candidateYear) && candidateYear >= 2000 && candidateYear <= 2100 ? candidateYear : now.getFullYear(),
    monthIndex: Number.isInteger(candidateMonth) && candidateMonth >= 0 && candidateMonth < 12 ? candidateMonth : now.getMonth(),
  };
}

function Metric({ label, value, detail, active, onClick }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={`flex min-w-0 items-center gap-3 p-4 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'bg-primary/5' : ''}`}>
    <strong className="shrink-0 text-2xl font-semibold tabular-nums">{value}</strong>
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </button>;
}

function Progress({ completed, total, percentage }) {
  if (!total) return <span className="text-xs text-muted-foreground md:w-36">Sem materiais definidos</span>;
  return <div className="w-full md:w-36" aria-label={`${completed} de ${total} materiais concluídos`}>
    <div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">Materiais concluídos</span><strong className="tabular-nums">{completed}/{total}</strong></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} /></div>
  </div>;
}

export default function ProjectsSimpleHome({ projects, clients, tasks, campaignPlans, monthlyScopes = [], statusOptions, loading, navigate,
  users = [], onNewProject, onRefresh, onShowAgency, onUpdateProjectStatus, onDismissPlan, onDeleteProject, onMarkConta, planSkips = [], selectedClientId, onBack, initialYear, initialMonth }) {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const planning = useProjectPlanningSettings();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSettings, setShowSettings] = useState(searchParams.get('planning') === 'settings');
  const [startingClient, setStartingClient] = useState(null);
  const analysisFooterRef = useRef(null);
  const canConfigure = ['superadmin', 'admin'].includes(profile?.role);
  const [period] = useState(() => initialPeriod(initialYear, initialMonth));
  const [year, setYear] = useState(period.year);
  const [monthIndex, setMonthIndex] = useState(period.monthIndex);
  useEffect(() => {
    try { sessionStorage.setItem('projects-monthly-period', JSON.stringify({ year, monthIndex })); } catch { /* optional preference */ }
  }, [year, monthIndex]);
  const [timeScope, setTimeScope] = useState(() => {
    if (initialYear != null || initialMonth != null) return 'month';
    try { return sessionStorage.getItem('projects-time-scope') === 'month' ? 'month' : 'now'; } catch { return 'now'; }
  });
  useEffect(() => { try { sessionStorage.setItem('projects-time-scope', timeScope); } catch { /* optional preference */ } }, [timeScope]);
  const isNow = timeScope === 'now';
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [clientScope, setClientScope] = useState('active');
  const [viewMode, setViewMode] = useState(() => {
    try { return sessionStorage.getItem('projects-monthly-view') === 'list' ? 'list' : 'kanban'; } catch { return 'kanban'; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('projects-monthly-view', viewMode); } catch { /* optional preference */ }
  }, [viewMode]);
  const hasActiveClients = clients.some((client) => client.etapa === 'closed');
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const scopedClients = useMemo(() => clients.filter((client) => selectedClientId
    ? client.id === selectedClientId : clientScope !== 'active' || !hasActiveClients || client.etapa === 'closed'
  ), [clients, selectedClientId, clientScope, hasActiveClients]);
  const referenceMonth = localDateKey(new Date(year, monthIndex, 1));
  const historicalPeriod = !isNow && !isAutomaticPlanningPeriod(referenceMonth, planning.settings);
  const planningClients = useMemo(() => scopedClients.filter((client) => clientNeedsMonthlyPlan(client, monthlyScopes, referenceMonth)), [scopedClients, monthlyScopes, referenceMonth]);
  const overview = useMemo(() => {
    if (isNow) return buildProjectsActionOverview({ clients: scopedClients, projects, tasks, campaignPlans, statusOptions, monthlyScopes, planSkips, settings: planning.settings, now });
    const result = buildProjectsMonthlyOverview({ clients: scopedClients, projects, tasks, campaignPlans, statusOptions, year, monthIndex });
    const ids = new Set((historicalPeriod ? result.rows.map((row) => row.client) : planningClients).map((client) => client.id));
    return { ...result, withoutPlan: result.withoutPlan.filter((client) => ids.has(client.id)), withoutProject: historicalPeriod ? [] : result.withoutProject.filter((client) => ids.has(client.id)) };
  }, [scopedClients, projects, tasks, campaignPlans, statusOptions, year, monthIndex, planningClients, historicalPeriod, isNow, planning.settings, monthlyScopes, planSkips]);
  const pendingRows = useMemo(() => isNow ? (!planning.loading && !planning.error ? overview.pendingRows : []) : pendingPlanningRows(scopedClients, overview.rows, monthlyScopes, year, monthIndex,
    !planning.loading && !planning.error ? planning.settings : { automatic_pending: false }, planSkips), [scopedClients, overview.rows, monthlyScopes, year, monthIndex, planning.loading, planning.error, planning.settings, isNow, overview.pendingRows, planSkips]);
  const ownerFor = (row) => {
    const responsible = row.client?.responsavel;
    return users.find((person) => person.id === (row.project.owner_id || responsible))?.full_name
      || (responsible && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(responsible) ? responsible : 'Sem responsável');
  };
  const belongsToMe = (row) => row.project.owner_id ? row.project.owner_id === profile?.id
    : row.client?.responsavel === profile?.id || row.client?.responsavel === profile?.full_name
      || (!row.client?.responsavel && row.client?.owner_id === profile?.id);
  const allRows = [...overview.rows, ...pendingRows].map((row) => ({ ...row, ownerName: ownerFor(row) }));
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const matches = (client, project) => !query || `${client?.empresa || ''} ${project?.name || ''}`.toLocaleLowerCase('pt-BR').includes(query);
  const pendingClients = new Set(pendingRows.map((row) => row.client.id));
  const visibleMissing = filter === 'missing' || (filter === 'all' && query)
    ? overview.withoutProject.filter((client) => matches(client) && (!onlyMine || belongsToMe({ client, project: {} })) && (filter === 'missing' || !pendingClients.has(client.id))).sort((a, b) => String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR')) : [];
  const clientsWithoutPlan = new Set(overview.withoutPlan.map((client) => client.id));
  const visibleProjects = (filter === 'missing' ? overview.rows.map((row) => ({ ...row, ownerName: ownerFor(row) })) : allRows)
    .filter((row) => filter === 'all' || (filter === 'missing' ? clientsWithoutPlan.has(row.client.id) : row.stage === filter))
    .filter((row) => matches(row.client, row.project) && (!onlyMine || belongsToMe(row)))
    .sort((a, b) => a.hasPlan !== b.hasPlan ? (a.hasPlan ? 1 : -1) : String(a.client?.empresa || '').localeCompare(String(b.client?.empresa || ''), 'pt-BR'));
  const shiftMonth = (amount) => {
    const next = new Date(year, monthIndex + amount, 1);
    setYear(next.getFullYear()); setMonthIndex(next.getMonth()); setFilter('all'); setTimeScope('month');
  };
  const createPlan = (clientId) => onNewProject({ clientId, year: isNow ? nextMonth.getFullYear() : year, monthIndex: isNow ? nextMonth.getMonth() : monthIndex });
  const openProject = (id, mode) => navigate(`/projects/${id}${mode ? `?plan=${mode}` : ''}`);
  const startProject = async (clientId, targetMonth = isNow ? overview.referenceMonth : referenceMonth) => {
    if (startingClient) return;
    setStartingClient(clientId);
    try {
      const { data: id, error } = await supabase.rpc('start_client_monthly_project', { p_client_id: clientId, p_reference_month: targetMonth });
      if (error) throw error;
      if (!id) throw new Error('Não foi possível iniciar o projeto.');
      void onRefresh?.({ silent: true });
      openProject(id, 'edit');
    } catch (failure) { toast({ title: 'Não foi possível iniciar o plano', description: failure.message, variant: 'destructive' }); }
    finally { setStartingClient(null); }
  };
  const closeSettings = () => {
    setShowSettings(false);
    if (searchParams.has('planning')) { const next = new URLSearchParams(searchParams); next.delete('planning'); setSearchParams(next, { replace: true }); }
  };

  return <section className="space-y-5">
    <WorkspacePageHeader title={selectedClient ? `Projetos · ${selectedClient.empresa}` : isNow ? 'Projetos · Agora' : 'Projetos do mês'} label="Planejamento"
      help="Um projeto pode atender vários meses. Agora reúne projetos em andamento e planos que já precisam começar, mesmo que os conteúdos sejam do próximo mês. O período indica quando os conteúdos serão usados. Prepare o plano no mês anterior: A fazer, Planejamento, Reunião / Aprovação e Execução. Cada cartão mostra o prazo atual; os materiais e tarefas ficam dentro do projeto."
      leading={selectedClientId ? <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="Voltar aos projetos" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button> : null}
      actions={<>
        <div className="flex rounded-xl border bg-card p-1" role="group" aria-label="Período dos projetos"><Button type="button" size="sm" variant={isNow ? 'secondary' : 'ghost'} aria-pressed={isNow} className="h-7 rounded-lg" onClick={() => { setTimeScope('now'); setFilter('all'); }}>Agora</Button><Button type="button" size="sm" variant={!isNow ? 'secondary' : 'ghost'} aria-pressed={!isNow} className="h-7 rounded-lg" onClick={() => { setTimeScope('month'); setFilter('all'); }}>Por mês</Button></div>
        {!isNow && <div className="flex h-9 items-center rounded-xl border bg-background" aria-label="Mês de referência">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="flex min-w-[145px] items-center justify-center gap-1.5 px-1 text-xs font-medium"><CalendarDays className="h-3.5 w-3.5 text-primary" />{monthLabel(year, monthIndex)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo mês" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>}
        {!isNow && (year !== nextMonth.getFullYear() || monthIndex !== nextMonth.getMonth()) && <Button type="button" variant="secondary" size="sm" className="h-9 rounded-xl" onClick={() => { setYear(nextMonth.getFullYear()); setMonthIndex(nextMonth.getMonth()); setFilter('all'); setTimeScope('month'); }}>Preparar próximo mês</Button>}
        {!isNow && (year !== now.getFullYear() || monthIndex !== now.getMonth()) && <Button type="button" variant="secondary" size="sm" className="h-9 rounded-xl" onClick={() => { setYear(now.getFullYear()); setMonthIndex(now.getMonth()); setFilter('all'); }}>Mês atual</Button>}
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="Atualizar projetos" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
        {canConfigure && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="Configurar planejamento" onClick={() => setShowSettings(true)} disabled={planning.loading || Boolean(planning.error)}><Settings2 className="h-4 w-4" /></Button>}
        <Button type="button" size="sm" className="h-9 rounded-xl" onClick={() => createPlan(selectedClientId)}><Plus className="mr-1.5 h-4 w-4" />Novo plano</Button>
      </>}
    />

    <div className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3 sm:divide-x">
      <Metric label="Clientes sem plano" value={loading ? '…' : overview.withoutPlan.length} detail={isNow ? 'precisam preparar ou completar o plano' : historicalPeriod ? `de ${new Set(overview.rows.map((row) => row.client.id)).size} com projeto cadastrado` : `de ${planningClients.length} com planejamento contratado`} active={filter === 'missing'} onClick={() => setFilter(filter === 'missing' ? 'all' : 'missing')} />
      <Metric label={isNow ? "Projetos para acompanhar" : "Projetos do mês"} value={loading ? '…' : overview.rows.length} detail={`${overview.rows.filter((row) => row.hasPlan).length} com plano iniciado`} active={filter === 'all'} onClick={() => setFilter('all')} />
      <div className="flex min-w-0 items-center gap-3 p-4" aria-label={isNow ? "Progresso dos projetos em andamento" : "Progresso do mês"}>
        <strong className="shrink-0 text-2xl font-semibold tabular-nums">{loading ? '…' : overview.progress.total ? overview.progress.percentage : '—'}{overview.progress.total > 0 && <span className="text-sm font-normal text-muted-foreground">%</span>}</strong>
        <div className="min-w-0 flex-1"><span className="block text-sm font-medium">Materiais concluídos</span><span className="mt-0.5 block text-xs text-muted-foreground">{overview.progress.total ? `${overview.progress.completed} de ${overview.progress.total} materiais do plano` : 'Nenhum material definido'}</span><div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${overview.progress.percentage}%` }} /></div></div>
      </div>
    </div>
    {planning.error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-xs text-destructive">Não foi possível carregar a regra de planejamento.<Button type="button" variant="outline" size="sm" onClick={planning.refresh}>Tentar novamente</Button></div>}

    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">{filter === 'missing' ? 'Precisam de plano' : filter === 'all' ? isNow ? 'O que precisa de ação agora' : 'Planos do mês' : PROJECT_STAGES.find((stage) => stage.key === filter)?.label}</h2>
          <p className="text-xs text-muted-foreground">{isNow ? 'Projetos em andamento e planos que precisam começar. O mês do conteúdo pode ser futuro.' : historicalPeriod ? 'Histórico dos projetos cadastrados neste mês. Sem pendências automáticas retroativas.' : filter === 'missing' ? 'Crie ou complete o planejamento destes clientes.' : pendingRows.length ? `${pendingRows.length} clientes aguardam início. Prepare ${monthLabel(year, monthIndex).toLowerCase()} com antecedência.` : viewMode === 'kanban' ? 'Cada cartão é um projeto. Abra para continuar.' : 'Abra um projeto ou visualize o plano.'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={onlyMine ? 'secondary' : 'outline'} className="h-9 rounded-xl" aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>Meus planos</Button>
          {!selectedClientId && hasActiveClients && <Select value={clientScope} onValueChange={(scope) => { setClientScope(scope); setFilter('all'); }}><SelectTrigger aria-label="Clientes exibidos" className="h-9 w-[150px] rounded-xl bg-card text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Clientes ativos</SelectItem><SelectItem value="all">Todos os clientes</SelectItem></SelectContent></Select>}
          {filter !== 'missing' && <div className="flex rounded-xl border bg-card p-1" role="group" aria-label="Visualização dos projetos">
            <Button type="button" size="sm" variant={viewMode === 'list' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'list'} className="h-8 rounded-lg" onClick={() => setViewMode('list')}><List className="mr-1.5 h-4 w-4" />Lista</Button>
            <Button type="button" size="sm" variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'kanban'} className="h-8 rounded-lg" onClick={() => setViewMode('kanban')}><LayoutGrid className="mr-1.5 h-4 w-4" />Kanban</Button>
          </div>}
          <div className="relative w-full sm:w-60"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar cliente ou projeto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou projeto" className="pl-9" /></div>
        </div>
      </div>
      {filter !== 'all' && filter !== 'missing' && <Button type="button" size="sm" variant="ghost" onClick={() => setFilter('all')} className="h-7 text-xs">Mostrar todas as etapas</Button>}
      {viewMode === 'list' && filter !== 'missing' && <div className="flex flex-wrap gap-2">{PROJECT_STAGES.map(({ key, label }) => <Button key={key} type="button" size="sm" variant={filter === key ? 'secondary' : 'outline'} aria-pressed={filter === key} onClick={() => setFilter(filter === key ? 'all' : key)} className="h-8 rounded-full"><span className="mr-2 tabular-nums font-semibold">{loading ? '…' : allRows.filter((row) => row.stage === key).length}</span>{label}</Button>)}</div>}
      {loading ? <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Carregando projetos…</p> : visibleMissing.length + visibleProjects.length === 0 ? <div className="rounded-2xl border border-dashed bg-card p-8 text-center"><p className="font-medium">{isNow ? 'Nenhum projeto precisa de ação agora.' : 'Nenhum resultado para este mês.'}</p><p className="mt-1 text-sm text-muted-foreground">Tente outro filtro ou mês.</p></div> : <div className="space-y-2">
        {visibleMissing.map((client) => <div key={`missing-${client.id}-${client.planning_reference_month || referenceMonth}`} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{client.empresa || 'Cliente sem nome'}</strong><Badge variant="outline">Sem projeto neste mês</Badge></div><p className="mt-1 text-sm text-muted-foreground">Crie o plano de {monthLabel(Number((client.planning_reference_month || referenceMonth).slice(0, 4)), Number((client.planning_reference_month || referenceMonth).slice(5, 7)) - 1).toLowerCase()}.</p></div>
          <Button type="button" size="sm" className="shrink-0" onClick={() => startProject(client.id, client.planning_reference_month || (isNow ? overview.referenceMonth : referenceMonth))} disabled={Boolean(startingClient)}><Plus className="mr-1.5 h-4 w-4" />{startingClient === client.id ? 'Iniciando…' : 'Iniciar plano'}</Button>
        </div>)}
        {viewMode === 'kanban' && filter !== 'missing' && visibleProjects.length > 0 ? <ProjectsMonthlyKanban rows={visibleProjects} analysisFooterRef={analysisFooterRef} statusOptions={statusOptions} startingClient={startingClient} onStartProject={startProject} onDefineDates={(id) => navigate(`/projects/edit/${id}`)} selectedStage={filter} onSelectStage={(stage) => setFilter(filter === stage ? 'all' : stage)} focusStage={PROJECT_STAGES.some((stage) => stage.key === filter) ? filter : query ? visibleProjects[0]?.stage : null} onOpenProject={openProject} onUpdateProjectStatus={onUpdateProjectStatus} onDismissPlan={onDismissPlan} onDeleteProject={onDeleteProject} onMarkConta={onMarkConta} /> : visibleProjects.map(({ project, client, progress, hasPlan, hasDocument, pending, plan, ownerName, tasks: projectTasks }) => <div key={project.id} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2.5"><ProjectClientMark client={client} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{client?.empresa || 'Cliente não encontrado'}</strong><Badge variant={hasPlan ? 'secondary' : 'outline'}>{hasPlan ? projectStatusLabel(project.status) : pending ? 'Aguardando início' : 'Plano vazio'}</Badge>{CONTA_SERVICOS.find((item) => item.value === client?.tipo_servico) && <Badge variant="outline">{CONTA_SERVICOS.find((item) => item.value === client.tipo_servico).label}</Badge>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{project.name}</p><p className="mt-1 text-xs text-muted-foreground">{projectPeriodLabel(project)} · {ownerName}</p></div></div></div>
          {pending ? <span className="text-xs text-muted-foreground">Aguardando início</span> : <Progress {...progress} />}
          <ProjectDeadlineLabel project={project} plan={plan} tasks={projectTasks} statusOptions={statusOptions} onDefineDates={!pending ? () => navigate(`/projects/edit/${project.id}`) : undefined} />
          <div className="flex shrink-0 flex-wrap gap-2">
            {pending ? <Button type="button" size="sm" onClick={() => startProject(client.id, project.mes_referencia)} disabled={Boolean(startingClient)}>{startingClient === client.id ? 'Iniciando…' : 'Iniciar plano'}</Button> : <>
              {hasDocument ? <Button type="button" size="sm" variant="outline" onClick={() => openProject(project.id, 'view')}><Eye className="mr-1.5 h-4 w-4" />Ver plano</Button> : <Button type="button" size="sm" variant={hasPlan ? 'outline' : 'default'} onClick={() => openProject(project.id, 'edit')}>{hasPlan ? 'Criar documento' : 'Montar plano'}</Button>}
              <Button type="button" size="sm" variant="ghost" onClick={() => openProject(project.id)}>Abrir projeto<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </>}
            {pending ? <Button type="button" size="sm" variant="ghost" onClick={() => onDismissPlan?.(client.id, project.mes_referencia)}>Tirar deste mês</Button> : <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => onDeleteProject?.(project)}>Excluir</Button>}
          </div>
        </div>)}
      </div>}
    </div>
    {!selectedClientId && onShowAgency && <div ref={analysisFooterRef} className="!mt-2 flex justify-end border-t pt-1"><Button type="button" variant="ghost" size="sm" onClick={onShowAgency}>Abrir análise detalhada<ChevronRight className="ml-1 h-4 w-4" /></Button></div>}
    {showSettings && canConfigure && !planning.loading && !planning.error && <ProjectPlanningSettingsDialog settings={planning.settings} onSave={planning.save} onClose={closeSettings} />}
  </section>;
}
