import { nextActionForAccount, NEXT_ACTIONS, pickStrongerAction } from './trafegoProximaAcao.js';
import { clientHealth, formatMoney } from './trafegoFila.js';

function pushUnique(items, seen, item) {
  if (!item?.id || seen.has(item.id)) return;
  seen.add(item.id);
  items.push(item);
}

function reasonFromAction(action, fallback = '') {
  if (!action) return fallback;
  return action.detail || action.gestorDo || action.action || fallback;
}

function tetoAction(brief) {
  if (!brief?.client?.id) return null;
  const totals = brief.totals || {};
  const snap = brief.client?.meta_resumo || brief.client?.entregaveis?.meta_resumo;
  const spend = Math.max(
    Number(totals.spend ?? brief.spend ?? 0),
    Number(snap?.spend || 0)
  );
  const health = clientHealth(brief.client, {
    spend,
    messages: totals.messages,
    leads: totals.leads,
    purchases: totals.purchases,
    purchaseValue: totals.purchaseValue,
  });
  if (!health.overTeto) return null;
  const spec = NEXT_ACTIONS.limite;
  return {
    ...spec,
    title: 'Acima do teto',
    detail: `${formatMoney(spend)} / ${formatMoney(brief.client.limite_meta)}. Abra o Painel para pausar o que não precisa gastar, ou crie uma demanda.`,
  };
}

function packAction(brief, action) {
  if (!brief?.client?.id || !action) return null;
  return {
    id: `action:${brief.client.id}:${action.code}`,
    kind: 'action',
    tone: action.tone,
    clientId: brief.client.id,
    title: brief.client.empresa,
    reason: reasonFromAction(action, brief.alert),
    action,
    spend: brief.spend,
  };
}

function actionItems(brief) {
  const quality = nextActionForAccount({ brief });
  const teto = tetoAction(brief);
  const actions = quality?.tone === 'issue' && teto
    ? [quality, teto]
    : [pickStrongerAction(quality, teto)];
  return actions.map((action) => packAction(brief, action)).filter(Boolean);
}

function demandItem(row, overdue) {
  if (!row?.id) return null;
  return {
    id: `demand:${row.id}`,
    kind: 'demand',
    tone: overdue ? 'overdue' : 'due',
    clientId: row.client_id,
    title: row.client_empresa || row.title,
    reason: overdue
      ? `${row.title || 'Demanda'} · atrasada`
      : `${row.title || 'Demanda'} · vence hoje`,
    demand: row,
    overdue: Boolean(overdue),
  };
}

/**
 * Fila do dia. Alertas são únicos por cliente/ação; demandas, pelo ID oficial.
 * Uma demanda do cliente não comprova vínculo com o alerta nem sua resolução.
 * Virar demanda é opcional (Tarefas continua o motor).
 * Check-up vencido fica na aba Check-up — não entra aqui.
 */
export function buildFazerAgoraQueue({
  dayRows = [],
  weekRows = [],
  atrasadas = [],
  vencemHoje = [],
} = {}) {
  const items = [];
  const seen = new Set();
  for (const row of atrasadas || []) pushUnique(items, seen, demandItem(row, true));
  for (const row of vencemHoje || []) pushUnique(items, seen, demandItem(row, false));

  for (const brief of [...(dayRows || []), ...(weekRows || [])]) {
    for (const item of actionItems(brief)) pushUnique(items, seen, item);
  }

  return items;
}

export function countFazerAgora(queue) {
  const list = queue || [];
  return {
    total: list.length,
    meta: list.filter((item) => item.kind === 'meta' || item.kind === 'action').length,
    demand: list.filter((item) => item.kind === 'demand').length,
  };
}

/** Chip do Dashboard/Situação: a mesma prioridade da fila (duro → atraso → qualidade). */
export function gestorAccountChip({
  nextAction = null,
  overdueDays = null,
  overTeto = false,
  resultOff = false,
  dueSoonDays = null,
  noAr = false,
  activeCount = 0,
  budgetEnding = false,
  budgetPct = null,
  healthLabel = '',
} = {}) {
  if (nextAction?.tone === 'issue') {
    return { tone: 'overdue', chip: nextAction.title };
  }
  if (overdueDays != null && overdueDays < 0) {
    return { tone: 'overdue', chip: `Demanda atrasada há ${Math.abs(overdueDays)}d` };
  }
  if (resultOff) return { tone: 'overdue', chip: 'Fora da meta' };
  if (overTeto) return { tone: 'overdue', chip: 'Acima do teto' };
  if (dueSoonDays === 0) return { tone: 'due', chip: 'Demanda vence hoje' };
  if (dueSoonDays != null && dueSoonDays > 0 && dueSoonDays <= 7) {
    return { tone: 'due', chip: `Demanda em ${dueSoonDays}d` };
  }
  if (nextAction?.tone === 'warn') {
    return { tone: 'due', chip: nextAction.title };
  }
  if (budgetEnding && budgetPct != null) {
    return { tone: 'due', chip: `Orçamento em ${Math.round(budgetPct)}%` };
  }
  if (healthLabel) return { tone: 'due', chip: healthLabel };
  if (!noAr) return { tone: 'empty', chip: 'Nada no ar' };
  return { tone: 'ok', chip: `${activeCount} no ar` };
}
