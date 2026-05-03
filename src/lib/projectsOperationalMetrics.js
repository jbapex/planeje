import { parseISO, isBefore, startOfDay, addDays } from 'date-fns';
import { getMaterialCalendarDateKey, buildTaskTitleFromPlanMaterial } from '@/lib/campaignPlanMateriais';
import { parseMesReferenciaLocal } from '@/lib/mesReferencia';

const TERMINAL_TASK_STATUSES = new Set([
  'concluido',
  'concluído',
  'published',
  'done',
  'completed',
  'publicado',
]);

export function projectInReferenceMonth(project, year, monthIndex) {
  if (!project?.mes_referencia) return false;
  const d = parseMesReferenciaLocal(project.mes_referencia);
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

/** Início do mês de referência da visão (comparável a mes_referencia normalizado). */
export function periodStartForYearMonth(year, monthIndex) {
  return startOfDay(new Date(year, monthIndex, 1));
}

function projectMesReferenciaStart(project) {
  if (!project?.mes_referencia) return null;
  try {
    const local = parseMesReferenciaLocal(project.mes_referencia);
    if (!local) return null;
    const d = startOfDay(local);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function projectIsExecucao(project) {
  return String(project?.status || '').toLowerCase() === 'execucao';
}

/**
 * Campanhas em execução cuja mes_referencia é estritamente anterior ao mês filtrado na Geral.
 */
export function listStaleExecutionBeforePeriod({ clients, projects, year, monthIndex }) {
  const periodStart = periodStartForYearMonth(year, monthIndex);
  const clientIds = new Set(clients.map((c) => c.id));
  const out = [];
  for (const p of projects) {
    if (!clientIds.has(p.client_id)) continue;
    if (!projectIsExecucao(p)) continue;
    const ref = projectMesReferenciaStart(p);
    if (!ref || !isBefore(ref, periodStart)) continue;
    const refLabel = ref.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    out.push({ project: p, refDate: ref, refLabel });
  }
  out.sort((a, b) => b.refDate.getTime() - a.refDate.getTime());
  return out;
}

export function getCampaignForClientMonth(projects, clientId, year, monthIndex) {
  return projects.find((p) => p.client_id === clientId && projectInReferenceMonth(p, year, monthIndex)) || null;
}

export function planForProject(campaignPlans, projectId) {
  return campaignPlans.find((p) => p.project_id === projectId) || null;
}

/** Indica se já existe tarefa com título gerado a partir do material. */
export function materialHasLinkedTask(material, projectTasks, clientEmpresa) {
  const expected = buildTaskTitleFromPlanMaterial(clientEmpresa, material.descricao);
  return projectTasks.some((t) => (t.title || '').trim() === expected.trim());
}

export function isTaskOverdue(task) {
  if (!task?.due_date) return false;
  if (TERMINAL_TASK_STATUSES.has(String(task.status || '').toLowerCase())) return false;
  try {
    const raw = String(task.due_date);
    const due = parseISO(raw.includes('T') ? raw : `${raw}T23:59:59`);
    return isBefore(due, startOfDay(new Date()));
  } catch {
    return false;
  }
}

/** Plano: sem | incompleto | completo (heurístico) */
export function planStatusLabel(plan) {
  if (!plan) return { key: 'none', label: 'Sem plano' };
  const obj = (plan.objetivo || '').trim().length >= 15;
  const mats = plan.materiais || [];
  const hasMats = mats.length > 0;
  const estr =
    (plan.estrategia_comunicacao?.mensagem_principal || '').trim().length >= 10 ||
    (plan.estrategia_comunicacao?.tom_voz || '').trim().length >= 5;
  if (obj && hasMats && estr) return { key: 'complete', label: 'Plano completo' };
  if (hasMats || obj) return { key: 'partial', label: 'Plano incompleto' };
  return { key: 'partial', label: 'Plano incompleto' };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Saúde 0–100 e rótulo Saudável / Atenção / Risco
 * Pesos aproximados alinhados ao pedido do produto.
 */
export function computeClientHealth({
  monthProject,
  plan,
  clientEmpresa,
  projectTasks,
}) {
  let score = 0;

  if (monthProject) {
    score += 22;
  }

  if (plan) {
    score += 12;
    const ps = planStatusLabel(plan);
    if (ps.key === 'complete') {
      score += 18;
    } else if (ps.key === 'partial') {
      score += 8;
    }

    const mats = plan.materiais || [];
    if (mats.length) {
      score += 8;
      const withDate = mats.filter((m) => !!getMaterialCalendarDateKey(m)).length;
      score += 10 * (withDate / mats.length);
      const withTask = mats.filter((m) => materialHasLinkedTask(m, projectTasks, clientEmpresa)).length;
      score += 18 * (withTask / mats.length);
    }
  }

  if (monthProject && projectTasks.length) {
    const done = projectTasks.filter((t) => TERMINAL_TASK_STATUSES.has(String(t.status || '').toLowerCase())).length;
    score += 10 * (done / projectTasks.length);
  }

  const overdue = projectTasks.filter(isTaskOverdue).length;
  score -= clamp(overdue * 6, 0, 24);

  score = clamp(Math.round(score), 0, 100);

  let label = 'Risco';
  if (score >= 85) label = 'Saudável';
  else if (score >= 60) label = 'Atenção';

  return { score, label };
}

export function nextPublicationOrDeliveryEvents({ projects, campaignPlans, clientsById, daysAhead = 7 }) {
  const end = addDays(startOfDay(new Date()), daysAhead);
  const out = [];

  for (const project of projects) {
    const plan = planForProject(campaignPlans, project.id);
    if (!plan?.materiais?.length) continue;
    const empresa = clientsById[project.client_id]?.empresa || '';
    for (const m of plan.materiais) {
      const post = (m.data_postagem || '').trim();
      const ent = (m.data_entrega || '').trim();
      for (const [kind, raw] of [
        ['publicação', post],
        ['entrega', ent],
      ]) {
        if (!raw) continue;
        try {
          const d = startOfDay(parseISO(`${raw}T12:00:00`));
          if (!isBefore(d, startOfDay(new Date())) && !isBefore(end, d)) {
            out.push({
              date: raw,
              dateObj: d,
              kind,
              clientName: empresa,
              projectName: project.name,
              projectId: project.id,
              label: m.descricao || 'Material',
            });
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  out.sort((a, b) => a.dateObj - b.dateObj);
  return out;
}

/** Próxima data de publicação (material) a partir de hoje, ou null. */
export function nextScheduledPublicationFromPlan(plan, fromDate = new Date()) {
  if (!plan?.materiais?.length) return null;
  const today = startOfDay(fromDate);
  let best = null;
  for (const m of plan.materiais) {
    const post = (m.data_postagem || '').trim();
    if (!post) continue;
    try {
      const d = startOfDay(parseISO(`${post}T12:00:00`));
      if (isBefore(d, today)) continue;
      if (!best || isBefore(d, best.dateObj)) {
        best = { dateObj: d, date: post, label: m.descricao || 'Publicação' };
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

function taskBucketCounts(projectTasks) {
  if (!projectTasks?.length) return { done: 0, active: 0, risk: 0 };
  let done = 0;
  let risk = 0;
  let active = 0;
  for (const t of projectTasks) {
    const st = String(t.status || '').toLowerCase();
    if (TERMINAL_TASK_STATUSES.has(st)) {
      done += 1;
    } else if (isTaskOverdue(t)) {
      risk += 1;
    } else {
      active += 1;
    }
  }
  return { done, active, risk };
}

export function aggregateOperationalStats({
  clients,
  projects,
  tasks,
  campaignPlans,
  year,
  monthIndex,
}) {
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const monthProjects = projects.filter((p) => projectInReferenceMonth(p, year, monthIndex));
  const coveredClientIds = new Set(monthProjects.map((p) => p.client_id));
  const activeClients = clients.length;
  const withoutCampaign = clients.filter((c) => !coveredClientIds.has(c.id)).length;
  const inExecution = monthProjects.filter((p) => p.status === 'execucao').length;

  const staleExecutionList = listStaleExecutionBeforePeriod({ clients, projects, year, monthIndex });
  const staleExecutionProjects = staleExecutionList.length;
  const staleExecutionClients = new Set(staleExecutionList.map((x) => x.project.client_id)).size;

  let materialsWithoutTask = 0;
  let materialsTotal = 0;
  let materialsWithoutDate = 0;
  let overdueTasks = 0;
  const projectTasksMap = {};

  for (const t of tasks) {
    if (!t.project_id) continue;
    if (!projectTasksMap[t.project_id]) projectTasksMap[t.project_id] = [];
    projectTasksMap[t.project_id].push(t);
  }

  for (const p of monthProjects) {
    const plan = planForProject(campaignPlans, p.id);
    const empresa = clientsById[p.client_id]?.empresa || '';
    const pTasks = projectTasksMap[p.id] || [];
    overdueTasks += pTasks.filter(isTaskOverdue).length;
    const mats = plan?.materiais || [];
    for (const m of mats) {
      materialsTotal += 1;
      if (!getMaterialCalendarDateKey(m)) materialsWithoutDate += 1;
      if (!materialHasLinkedTask(m, pTasks, empresa)) materialsWithoutTask += 1;
    }
  }

  const upcoming = nextPublicationOrDeliveryEvents({
    projects,
    campaignPlans,
    clientsById,
    daysAhead: 7,
  }).length;

  const materialsWithTask = Math.max(0, materialsTotal - materialsWithoutTask);
  const criticalPendencies = withoutCampaign + overdueTasks;

  return {
    activeClients,
    coveredThisMonth: coveredClientIds.size,
    withoutCampaign,
    inExecution,
    materialsWithoutTask,
    materialsTotal,
    materialsWithTask,
    overdueTasks,
    upcoming7d: upcoming,
    criticalPendencies,
    staleExecutionProjects,
    staleExecutionClients,
  };
}

/** Valor normalizado de `projetos.status` (sem acentos, minúsculas). */
export function normalizeProjetosStatus(raw) {
  return String(raw ?? 'planejamento')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const STATUS_LABEL = {
  planejamento: 'Planejamento',
  aprovacao: 'Aprovação',
  execucao: 'Execução',
  concluido: 'Concluído',
  pausado: 'Pausado',
};

export function projectStatusLabel(status) {
  if (status == null || String(status).trim() === '') return '—';
  const k = normalizeProjetosStatus(status);
  return STATUS_LABEL[k] || String(status);
}

function tasksProgress(projectTasks) {
  if (!projectTasks?.length) return 0;
  const done = projectTasks.filter((t) => TERMINAL_TASK_STATUSES.has(String(t.status || '').toLowerCase())).length;
  return Math.round((done / projectTasks.length) * 100);
}

export function recommendNextStep({
  monthProject,
  plan,
  planStatus,
  materialsWithoutTask,
  materialsWithoutDate,
  overdueCount,
}) {
  if (!monthProject) return 'Criar campanha do mês';
  if (!plan) return 'Montar plano';
  if (planStatus.key !== 'complete') return 'Completar plano';
  if (materialsWithoutTask > 0) return 'Criar tarefas pendentes';
  if (materialsWithoutDate > 0) return 'Definir datas no calendário';
  if (overdueCount > 0) return 'Resolver tarefas atrasadas';
  return 'Acompanhar publicação';
}

/**
 * Uma linha por cliente para a tabela da aba Geral.
 */
export function buildClientRows({ clients, projects, tasks, campaignPlans, users, year, monthIndex }) {
  const userName = (id) => users.find((u) => u.id === id)?.full_name || '—';
  const byProject = {};
  for (const t of tasks) {
    if (!t.project_id) continue;
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id].push(t);
  }

  const staleAll = listStaleExecutionBeforePeriod({ clients, projects, year, monthIndex });
  const staleByClientId = {};
  for (const item of staleAll) {
    const cid = item.project.client_id;
    if (!staleByClientId[cid]) staleByClientId[cid] = [];
    staleByClientId[cid].push(item);
  }

  return clients.map((client) => {
    const staleExecutions = staleByClientId[client.id] || [];
    const staleExecutionCount = staleExecutions.length;
    const monthProject = getCampaignForClientMonth(projects, client.id, year, monthIndex);
    const plan = monthProject ? planForProject(campaignPlans, monthProject.id) : null;
    const pTasks = monthProject ? byProject[monthProject.id] || [] : [];
    const empresa = client.empresa || '';
    const mats = plan?.materiais || [];
    const materialsWithoutTask = mats.filter((m) => !materialHasLinkedTask(m, pTasks, empresa)).length;
    const materialsWithoutDate = mats.filter((m) => !getMaterialCalendarDateKey(m)).length;
    const overdueCount = pTasks.filter(isTaskOverdue).length;
    const ps = planStatusLabel(plan);
    const health = computeClientHealth({
      monthProject,
      plan,
      clientEmpresa: empresa,
      projectTasks: pTasks,
    });
    const nextStep = recommendNextStep({
      monthProject,
      plan,
      planStatus: ps,
      materialsWithoutTask,
      materialsWithoutDate,
      overdueCount,
    });
    const nextPub = plan ? nextScheduledPublicationFromPlan(plan) : null;
    const taskBuckets = taskBucketCounts(pTasks);

    return {
      client,
      monthProject,
      plan,
      planStatus: ps,
      health,
      responsavelName: userName(client.responsavel),
      campaignName: monthProject?.name || '—',
      campaignStatus: monthProject ? projectStatusLabel(monthProject.status) : '—',
      materialsCount: mats.length,
      tasksCount: pTasks.length,
      tasksProgress: tasksProgress(pTasks),
      taskBuckets,
      materialsWithoutTask,
      materialsWithoutDate,
      overdueCount,
      nextStep,
      nextPublication: nextPub,
      staleExecutionCount,
      staleExecutions,
    };
  });
}

export function buildPendencias({ clientRows, projects, tasks, campaignPlans, clients, year, monthIndex }) {
  const critico = [];
  const atencao = [];
  const aguardando = [];

  const byProject = {};
  for (const t of tasks) {
    if (!t.project_id) continue;
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id].push(t);
  }
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));

  for (const row of clientRows) {
    const { client, monthProject, plan } = row;
    if (!monthProject) {
      critico.push({
        id: `no-camp-${client.id}-${year}-${monthIndex}`,
        title: 'Sem campanha no mês',
        detail: client.empresa,
        clientId: client.id,
        projectId: null,
      });
    } else {
      if (!plan) {
        critico.push({
          id: `no-plan-${monthProject.id}`,
          title: 'Campanha sem plano',
          detail: `${client.empresa} · ${monthProject.name}`,
          clientId: client.id,
          projectId: monthProject.id,
        });
      }
      const pTasks = byProject[monthProject.id] || [];
      for (const t of pTasks) {
        if (isTaskOverdue(t)) {
          critico.push({
            id: `overdue-${t.id}`,
            title: 'Tarefa atrasada',
            detail: `${client.empresa}: ${t.title || 'Sem título'}`,
            clientId: client.id,
            projectId: monthProject.id,
            taskId: t.id,
          });
        }
      }
      const empresa = client.empresa || '';
      const mats = plan?.materiais || [];
      for (const m of mats) {
        if (!materialHasLinkedTask(m, pTasks, empresa)) {
          atencao.push({
            id: `no-task-${monthProject.id}-${m.id}`,
            title: 'Material sem tarefa',
            detail: `${client.empresa}: ${m.descricao || 'Material'}`,
            clientId: client.id,
            projectId: monthProject.id,
          });
        }
        if (!getMaterialCalendarDateKey(m)) {
          atencao.push({
            id: `no-date-${monthProject.id}-${m.id}`,
            title: 'Material sem data',
            detail: `${client.empresa}: ${m.descricao || 'Material'}`,
            clientId: client.id,
            projectId: monthProject.id,
          });
        }
      }
      if (plan && row.planStatus.key === 'partial') {
        atencao.push({
          id: `partial-plan-${monthProject.id}`,
          title: 'Plano incompleto',
          detail: `${client.empresa} · ${monthProject.name}`,
          clientId: client.id,
          projectId: monthProject.id,
        });
      }
    }

    for (const se of row.staleExecutions || []) {
      atencao.push({
        id: `stale-exec-${se.project.id}`,
        title: 'Execução em mês passado',
        detail: `${client.empresa} · ${se.project.name} · ref. ${se.refLabel}`,
        clientId: client.id,
        projectId: se.project.id,
      });
    }
  }

  const revisaoStatuses = new Set(['revisao', 'revisão', 'alteracao', 'alteração']);
  for (const t of tasks) {
    if (!t.project_id) continue;
    const p = projects.find((pr) => pr.id === t.project_id);
    if (!p || !projectInReferenceMonth(p, year, monthIndex)) continue;
    if (revisaoStatuses.has(String(t.status || '').toLowerCase())) {
      const c = clientById[p.client_id];
      aguardando.push({
        id: `rev-${t.id}`,
        title: 'Tarefa em revisão / alteração',
        detail: `${c?.empresa || ''}: ${t.title || 'Tarefa'}`,
        clientId: p.client_id,
        projectId: p.id,
        taskId: t.id,
      });
    }
  }

  return { critico, atencao, aguardando };
}

/**
 * @param {'mes' | 'todas_abertas'} [referenceScope='mes'] — `mes`: só `mes_referencia` do ano/mês;
 *   `todas_abertas`: todas as campanhas não concluídas com mês de referência (clientes do painel).
 */
export function buildCampaignRows({
  projects,
  clients,
  campaignPlans,
  tasks,
  year,
  monthIndex,
  referenceScope = 'mes',
}) {
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const clientIds = new Set(clients.map((c) => c.id));

  let monthProjects;
  if (referenceScope === 'todas_abertas') {
    monthProjects = projects.filter((p) => {
      if (!p?.client_id || !clientIds.has(p.client_id)) return false;
      if (!p.mes_referencia || !parseMesReferenciaLocal(p.mes_referencia)) return false;
      return normalizeProjetosStatus(p.status) !== 'concluido';
    });
    monthProjects.sort((a, b) => {
      const da = projectMesReferenciaStart(a);
      const db = projectMesReferenciaStart(b);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt');
    });
  } else {
    monthProjects = projects.filter((p) => projectInReferenceMonth(p, year, monthIndex));
  }
  const byProject = {};
  for (const t of tasks) {
    if (!t.project_id) continue;
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id].push(t);
  }

  return monthProjects.map((p) => {
    const plan = planForProject(campaignPlans, p.id);
    const pTasks = byProject[p.id] || [];
    const client = clientById[p.client_id];
    const empresa = client?.empresa || '';
    const mats = plan?.materiais || [];
    const materialsWithoutTask = mats.filter((m) => !materialHasLinkedTask(m, pTasks, empresa)).length;
    const overdueCount = pTasks.filter(isTaskOverdue).length;
    const ps = planStatusLabel(plan);
    const health = computeClientHealth({
      monthProject: p,
      plan,
      clientEmpresa: empresa,
      projectTasks: pTasks,
    });
    const ref = p.mes_referencia ? parseMesReferenciaLocal(p.mes_referencia) : null;
    const st = normalizeProjetosStatus(p.status);
    let faseKey = 'execucao';
    let faseLabel = 'execução';
    if (!plan) {
      faseKey = 'sem_plano';
      faseLabel = 'sem plano';
    } else if (st === 'planejamento') {
      faseKey = 'planejado';
      faseLabel = 'planejado';
    } else if (st === 'aprovacao') {
      faseKey = 'aprovacao';
      faseLabel = 'aprovação';
    } else if (st === 'execucao') {
      faseKey = 'execucao';
      faseLabel = 'execução';
    } else if (st === 'concluido') {
      faseKey = 'concluido';
      faseLabel = 'concluído';
    } else if (st === 'pausado') {
      faseKey = 'pausado';
      faseLabel = 'pausado';
    } else {
      faseLabel = projectStatusLabel(p.status).toLowerCase();
    }
    return {
      project: p,
      client,
      monthLabel: ref
        ? ref.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        : '—',
      planStatus: ps,
      faseKey,
      faseLabel,
      materialsCount: mats.length,
      tasksCount: pTasks.length,
      materialsWithoutTask,
      health,
      overdueCount,
    };
  });
}

/** Estado da célula na visão anual (pill + cor). Sem campanha no mês → mesmo rótulo visual que “sem plano”. */
export function annualCellPresentation(project, plan, clientEmpresa, projectTasks) {
  if (!project) {
    return { key: 'sem_campanha', short: 'Sem plano', pillLabel: 'Sem plano', tone: 'warn', empty: false };
  }
  const health = computeClientHealth({
    monthProject: project,
    plan: plan || null,
    clientEmpresa,
    projectTasks: projectTasks || [],
  });
  if (!plan) {
    return { key: 'sem_plano', short: 'Sem plano', pillLabel: 'Sem plano', tone: 'warn' };
  }
  if (health.score < 60) {
    return { key: 'atencao', short: 'Atenção', pillLabel: 'Atenção', tone: 'risk' };
  }
  const st = normalizeProjetosStatus(project.status);
  if (st === 'concluido') return { key: 'concluido', short: 'Concluído', pillLabel: 'Concluído', tone: 'ok' };
  if (st === 'execucao') return { key: 'execucao', short: 'Execução', pillLabel: 'Execução', tone: 'run' };
  if (st === 'pausado') return { key: 'pausado', short: 'Pausado', pillLabel: 'Pausado', tone: 'muted' };
  if (st === 'aprovacao') return { key: 'aprovacao', short: 'Aprovação', pillLabel: 'Aprovação cliente', tone: 'plan' };
  return { key: 'planejamento', short: 'Planejado', pillLabel: 'Planejado', tone: 'plan' };
}

export function calendarListEvents({ projects, campaignPlans, clients, year, monthIndex }) {
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const list = [];
  const monthProjects = projects.filter((p) => projectInReferenceMonth(p, year, monthIndex));

  for (const p of monthProjects) {
    const plan = planForProject(campaignPlans, p.id);
    const empresa = clientById[p.client_id]?.empresa || '';
    for (const m of plan?.materiais || []) {
      const post = (m.data_postagem || '').trim();
      const ent = (m.data_entrega || '').trim();
      if (post) {
        list.push({
          id: `cal-post-${p.id}-${m.id}`,
          date: post,
          type: 'Publicação',
          label: m.descricao || 'Material',
          clientName: empresa,
          projectId: p.id,
        });
      }
      if (ent) {
        list.push({
          id: `cal-ent-${p.id}-${m.id}`,
          date: ent,
          type: 'Entrega',
          label: m.descricao || 'Material',
          clientName: empresa,
          projectId: p.id,
        });
      }
    }
  }

  list.sort((a, b) => {
    try {
      return parseISO(`${a.date}T12:00:00`) - parseISO(`${b.date}T12:00:00`);
    } catch {
      return 0;
    }
  });
  return list;
}
