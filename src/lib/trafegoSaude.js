/**
 * Camada única de operação de tráfego.
 * A mesma função define a saúde usada em Visão geral, Central, Clientes e Alertas.
 * Não usa o rótulo “Saudável”. Indisponível ≠ zero.
 */

import { metaAvailability } from './centralTrafegoMeta.js';
import {
  computeBudgetPace,
  defaultRequireActiveCampaign,
  detectCheckupProblems,
  summarizeCheckupBoard,
} from './centralTrafegoCheckup.js';

export const HEALTH = {
  critico: { status: 'critico', label: 'Crítico', rank: 0 },
  atencao: { status: 'atencao', label: 'Atenção', rank: 1 },
  aguardando_cliente: { status: 'aguardando_cliente', label: 'Aguardando cliente', rank: 2 },
  dados_indisponiveis: { status: 'dados_indisponiveis', label: 'Dados indisponíveis', rank: 3 },
  ok: { status: 'ok', label: 'OK', rank: 4 },
  pausa: { status: 'pausa', label: 'Pausa planejada', rank: 5 },
  encerrado: { status: 'encerrado', label: 'Encerrado', rank: 6 },
};

export const EXCEPTION_BUCKETS = [
  { key: 'critico', label: 'Crítico' },
  { key: 'atencao', label: 'Atenção' },
  { key: 'aguardando_cliente', label: 'Aguardando cliente' },
  { key: 'dados_indisponiveis', label: 'Dados indisponíveis' },
  { key: 'tarefa_vencida', label: 'Tarefa vencida' },
  { key: 'campanha_esperada_sem_atividade', label: 'Campanha esperada sem atividade' },
  { key: 'orcamento_ausente', label: 'Orçamento ausente' },
  { key: 'proxima_acao_vencida', label: 'Próxima ação vencida' },
];

const EXCEPTION_CATALOG = {
  over_budget: {
    code: 'over_budget',
    bucket: 'critico',
    health: 'critico',
    problem: 'Investimento acima do orçamento',
    action: 'Revisar verba ou pausar o que não performa',
  },
  next_action_overdue: {
    code: 'next_action_overdue',
    bucket: 'proxima_acao_vencida',
    health: 'critico',
    problem: 'Próxima ação vencida',
    action: 'Concluir ou reagendar a demanda aberta',
  },
  overdue_tasks: {
    code: 'overdue_tasks',
    bucket: 'tarefa_vencida',
    health: 'atencao',
    problem: 'Tarefa vencida',
    action: 'Tratar a fila atrasada deste cliente',
  },
  missing_active_campaign: {
    code: 'missing_active_campaign',
    bucket: 'campanha_esperada_sem_atividade',
    health: 'atencao',
    problem: 'Campanha esperada sem atividade',
    action: 'Publicar, reativar ou marcar “sem campanha esperada”',
  },
  missing_budget: {
    code: 'missing_budget',
    bucket: 'orcamento_ausente',
    health: 'atencao',
    problem: 'Orçamento ausente',
    action: 'Informar o limite mensal na ficha',
  },
  meta_unavailable: {
    code: 'meta_unavailable',
    bucket: 'dados_indisponiveis',
    health: 'dados_indisponiveis',
    problem: 'Dados indisponíveis',
    action: 'Conferir a conta Meta antes de operar números',
  },
  waiting_client: {
    code: 'waiting_client',
    bucket: 'aguardando_cliente',
    health: 'aguardando_cliente',
    problem: 'Aguardando o cliente',
    action: 'Cobrar material, acesso ou aprovação',
  },
  missing_gestor: {
    code: 'missing_gestor',
    bucket: 'atencao',
    health: 'atencao',
    problem: 'Sem gestor responsável',
    action: 'Definir o gestor oficial na operação',
  },
  needs_attention: {
    code: 'needs_attention',
    bucket: 'atencao',
    health: 'atencao',
    problem: 'Check-up pediu atenção',
    action: 'Tratar a pendência registrada no check-up',
  },
};

export function healthLabel(status) {
  return HEALTH[status]?.label || 'OK';
}

export function worseHealth(a, b) {
  const ra = HEALTH[a]?.rank ?? HEALTH.ok.rank;
  const rb = HEALTH[b]?.rank ?? HEALTH.ok.rank;
  return ra <= rb ? a : b;
}

export function metricDisplay(metric, formatter) {
  if (!metric || metric.available === false) return 'Dados indisponíveis';
  if (typeof formatter === 'function') return formatter(metric.value);
  return metric.value == null ? 'Dados indisponíveis' : String(metric.value);
}

function moneyMetric(available, value) {
  if (!available) return { available: false, value: null, label: 'Dados indisponíveis' };
  return { available: true, value: Number(value) || 0, label: null };
}

function catalogException(code, extra = {}) {
  const def = EXCEPTION_CATALOG[code];
  if (!def) return null;
  return {
    ...def,
    reason: extra.reason || def.problem,
    ownerId: extra.ownerId || null,
    ownerName: extra.ownerName || null,
    dueDate: extra.dueDate || null,
    taskId: extra.taskId || null,
    taskTitle: extra.taskTitle || null,
  };
}

/**
 * Única regra de saúde + exceções + resumo operacional do cliente.
 */
export function buildClientOperacao(raw, { operationalDate } = {}) {
  const situation = raw.situation || null;
  const requireActiveCampaign =
    raw.requireActiveCampaign != null ? raw.requireActiveCampaign : defaultRequireActiveCampaign(situation);
  const requireBudget = Boolean(raw.requireBudget);
  const snapshot = raw.snapshot || raw.meta_resumo || null;
  const meta = metaAvailability(snapshot);
  const spendMonthAvailable = meta.kind !== 'unavailable' && raw.spendMonthAvailable !== false;
  const spendMonth = spendMonthAvailable ? Number(raw.spendMonth ?? snapshot?.spend ?? 0) : null;
  const budgetAvailable = Number(raw.budget) > 0;
  const budget = budgetAvailable ? Number(raw.budget) : null;
  const pace = computeBudgetPace({
    spend: spendMonthAvailable ? spendMonth : null,
    budget: budgetAvailable ? budget : null,
    operationalDate,
  });
  const remaining = pace.available ? pace.remaining : null;
  const nextAction = raw.nextAction || raw.next_action || null;
  const nextActionOverdue = Boolean(raw.nextActionOverdue ?? raw.next_action_overdue);
  const overdueTasks = Number(raw.overdueTasks ?? raw.overdue_tasks ?? 0);
  const openTasks = Number(raw.openTasks ?? raw.open_tasks ?? 0);
  const activeCampaigns = Number(raw.activeCampaigns ?? raw.active_campaigns ?? 0);
  const checkup = raw.checkup || raw.run || null;
  const due = raw.due !== false;

  const detected = detectCheckupProblems({
    gestorId: raw.gestorId ?? raw.gestor_id ?? null,
    situation,
    requireActiveCampaign,
    activeCampaigns,
    requireBudget,
    budget,
    spendMonth,
    spendMonthAvailable,
    metaKind: meta.kind,
    nextActionOverdue,
    indicators: raw.indicators,
  });

  const exceptions = [];
  const push = (code, extra) => {
    const item = catalogException(code, extra);
    if (item) exceptions.push(item);
  };

  const ownerExtra = {
    ownerName: raw.gestorName || raw.gestor_name || null,
    ownerId: raw.gestorId || raw.gestor_id || null,
  };

  for (const problem of detected) {
    if (problem.code === 'over_budget') push('over_budget', { ...ownerExtra, reason: problem.label });
    else if (problem.code === 'next_action_overdue') {
      push('next_action_overdue', {
        ...ownerExtra,
        reason: nextAction?.title ? `${nextAction.title} venceu` : problem.label,
        dueDate: nextAction?.due_date || nextAction?.dueDate || null,
        taskId: nextAction?.task_id || nextAction?.id || null,
        taskTitle: nextAction?.title || null,
      });
    } else if (problem.code === 'missing_active_campaign') push('missing_active_campaign', { ...ownerExtra, reason: problem.label });
    else if (problem.code === 'missing_budget') push('missing_budget', { ...ownerExtra, reason: problem.label });
    else if (problem.code === 'meta_unavailable') push('meta_unavailable', { ...ownerExtra, reason: problem.label });
    else if (problem.code === 'waiting_client') {
      const waitingTask = (raw.tasks || []).find((t) => t.waitingClient || t.demand_type === 'cobranca_material' || t.demand_type === 'aprovacao_cliente');
      push('waiting_client', {
        ...ownerExtra,
        reason: problem.label,
        dueDate: waitingTask?.due_date || nextAction?.due_date || null,
        taskId: waitingTask?.id || nextAction?.task_id || null,
        taskTitle: waitingTask?.title || nextAction?.title || null,
      });
    } else if (problem.code === 'missing_gestor') push('missing_gestor', { reason: problem.label });
  }

  if (overdueTasks > 0 && !exceptions.some((e) => e.code === 'next_action_overdue')) {
    push('overdue_tasks', {
      ...ownerExtra,
      reason: `${overdueTasks} demanda(s) atrasada(s)`,
    });
  } else if (overdueTasks > 1 && exceptions.some((e) => e.code === 'next_action_overdue')) {
    push('overdue_tasks', {
      ...ownerExtra,
      reason: `${overdueTasks} demanda(s) atrasada(s)`,
    });
  }

  const checkupResult = checkup?.result || raw.checkup_result || null;
  if (checkupResult === 'needs_attention' && !exceptions.some((e) => e.code === 'needs_attention')) {
    push('needs_attention', {
      reason: checkup?.attention_problem || checkup?.problem || raw.checkup_problem || 'Pendência do check-up',
      taskId: checkup?.task_id || raw.checkup_task_id || null,
      taskTitle: checkup?.task_title || raw.checkup_task_title || null,
      ownerName: checkup?.actor_name || raw.checkup_actor_name || raw.gestorName || null,
      dueDate: checkup?.attention_due_date || null,
    });
  }

  const seen = new Set();
  const unique = [];
  for (const item of exceptions) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    unique.push(item);
  }

  let healthStatus = 'ok';
  if (situation === 'closed') healthStatus = 'encerrado';
  else if (situation === 'temporarily_paused' || checkupResult === 'planned_pause') healthStatus = 'pausa';
  for (const item of unique) {
    healthStatus = worseHealth(healthStatus, item.health);
  }

  const health = { ...HEALTH[healthStatus] };
  const spendDay = moneyMetric(false, null);

  return {
    clientId: raw.clientId || raw.client_id,
    empresa: raw.empresa,
    gestorId: raw.gestorId || raw.gestor_id || null,
    gestorName: raw.gestorName || raw.gestor_name || null,
    situation,
    situationReason: raw.situationReason || raw.situation_reason || null,
    resumeAt: raw.resumeAt || raw.resume_at || null,
    checkupSettings: raw.checkupSettings || raw.settings || null,
    due,
    health,
    exceptions: unique,
    requireActiveCampaign,
    requireBudget,
    activeCampaigns,
    spendDay,
    spendMonth: moneyMetric(spendMonthAvailable, spendMonth),
    budget: moneyMetric(budgetAvailable, budget),
    remaining: remaining == null ? { available: false, value: null, label: 'Dados indisponíveis' } : moneyMetric(true, remaining),
    pace,
    meta,
    snapshot,
    primaryIndicator: raw.primaryIndicator || snapshot?.inferredGoal || null,
    lastUpdate: raw.lastUpdate || raw.updated_at || null,
    nextAction,
    nextActionOverdue,
    openTasks,
    overdueTasks,
    campaigns: raw.campaigns || [],
    tasks: raw.tasks || [],
    attachments: raw.attachments || [],
    history: raw.history || [],
    checkup: {
      due,
      result: checkupResult,
      confirmedAt: checkup?.confirmed_at || raw.checkup_confirmed_at || null,
      actorName: checkup?.actor_name || raw.checkup_actor_name || null,
      note: checkup?.note || raw.checkup_note || null,
      problem: checkup?.attention_problem || raw.checkup_problem || null,
      taskId: checkup?.task_id || raw.checkup_task_id || null,
      taskTitle: checkup?.task_title || raw.checkup_task_title || null,
    },
    configChecklist: {
      gestor: Boolean(raw.gestorId || raw.gestor_id),
      budget: budgetAvailable,
      campaignExpected: requireActiveCampaign,
      hasActiveCampaign: activeCampaigns > 0,
      metaReadable: meta.kind !== 'unavailable',
    },
  };
}

export function buildExceptionQueue(clients) {
  const buckets = Object.fromEntries(EXCEPTION_BUCKETS.map((b) => [b.key, []]));
  for (const client of clients || []) {
    for (const exception of client.exceptions || []) {
      const row = {
        clientId: client.clientId,
        empresa: client.empresa,
        ...exception,
        health: HEALTH[exception.health] || client.health,
      };
      if (buckets[exception.bucket]) buckets[exception.bucket].push(row);
    }
  }
  return buckets;
}

export function flattenAlertas(clients) {
  const queue = buildExceptionQueue(clients);
  return EXCEPTION_BUCKETS.flatMap((bucket) => queue[bucket.key] || []);
}

export function buildOverview(clients, { operationalDate } = {}) {
  const list = clients || [];
  const active = list.filter((c) => c.health.status !== 'encerrado');
  const attention = active.filter((c) => ['critico', 'atencao'].includes(c.health.status));
  const waiting = active.filter((c) => c.health.status === 'aguardando_cliente');
  const overdue = active.filter((c) => (c.overdueTasks || 0) > 0 || c.nextActionOverdue);
  const checkupRows = list.map((c) => ({
    due: c.due,
    run: c.checkup?.result ? { result: c.checkup.result } : null,
  }));
  const checkup = summarizeCheckupBoard(checkupRows);
  const budgets = active.filter((c) => c.budget.available);
  const spends = active.filter((c) => c.spendMonth.available);
  const monthlyBudget = budgets.length ? budgets.reduce((n, c) => n + c.budget.value, 0) : null;
  const monthlySpend = spends.length ? spends.reduce((n, c) => n + c.spendMonth.value, 0) : null;
  const todayPriorities = flattenAlertas(active).slice(0, 8);
  const paceRows = active.map((c) => ({
    clientId: c.clientId,
    empresa: c.empresa,
    health: c.health,
    pace: c.pace,
    spendMonth: c.spendMonth,
    budget: c.budget,
  }));

  return {
    operationalDate: operationalDate || null,
    activeClients: active.length,
    monthlyBudget: monthlyBudget == null ? { available: false, value: null } : { available: true, value: monthlyBudget },
    monthlySpend: monthlySpend == null ? { available: false, value: null } : { available: true, value: monthlySpend },
    attentionCount: attention.length,
    waitingCount: waiting.length,
    overdueCount: overdue.length,
    checkup,
    todayPriorities,
    paceRows,
    healthCounts: {
      critico: active.filter((c) => c.health.status === 'critico').length,
      atencao: active.filter((c) => c.health.status === 'atencao').length,
      aguardando_cliente: waiting.length,
      dados_indisponiveis: active.filter((c) => c.health.status === 'dados_indisponiveis').length,
      ok: active.filter((c) => c.health.status === 'ok').length,
    },
  };
}

export function buildCheckupView(clients) {
  const due = (clients || []).filter((c) => c.due);
  const openFirst = [...due].sort((a, b) => {
    const ae = a.exceptions.length ? 0 : 1;
    const be = b.exceptions.length ? 0 : 1;
    if (ae !== be) return ae - be;
    return (HEALTH[a.health.status]?.rank ?? 9) - (HEALTH[b.health.status]?.rank ?? 9);
  });
  const compactOk = due.filter((c) => c.checkup.result === 'ok' && !c.exceptions.length);
  const expanded = openFirst.filter((c) => c.exceptions.length || c.checkup.result !== 'ok');
  return {
    summary: summarizeCheckupBoard(
      due.map((c) => ({ due: true, run: c.checkup.result ? { result: c.checkup.result } : null }))
    ),
    expanded,
    compactOk,
  };
}

export function groupTrafficTasks(tasks, { terminalValues = [], waitingTypes = ['cobranca_material', 'aprovacao_cliente'] } = {}) {
  const terminal = new Set(terminalValues);
  const groups = { todo: [], doing: [], waiting: [], done: [] };
  for (const task of tasks || []) {
    const demand = task.demandType || task.demand_type;
    const status = task.status;
    if (terminal.has(status) || task.terminal) {
      groups.done.push(task);
    } else if (waitingTypes.includes(demand) || task.waitingClient) {
      groups.waiting.push(task);
    } else if (status === 'in_progress' || status === 'doing' || task.inProgress) {
      groups.doing.push(task);
    } else {
      groups.todo.push(task);
    }
  }
  return groups;
}

export function buildTrafegoHubModel(rawClients, options = {}) {
  const clients = (rawClients || []).map((row) => buildClientOperacao(row, options));
  return {
    clients,
    overview: buildOverview(clients, options),
    exceptions: buildExceptionQueue(clients),
    alertas: flattenAlertas(clients),
    checkup: buildCheckupView(clients),
    tasks: groupTrafficTasks(options.tasks || rawClients.flatMap?.((c) => c.tasks || []) || [], options),
  };
}
