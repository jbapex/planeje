/**
 * Check-up diário da Central de Tráfego (Fase 1.1).
 * Confirmação única por cliente e data operacional de Brasília.
 * Métricas detectadas são somente leitura. Sem “Saudável” do GestorApex.
 */

import { NEXT_ACTIONS } from './trafegoProximaAcao.js';

export const CHECKUP_OUTCOMES = [
  { value: 'ok', label: 'Está OK' },
  { value: 'needs_attention', label: 'Precisa de atenção' },
  { value: 'waiting_client', label: 'Aguardando cliente' },
  { value: 'planned_pause', label: 'Pausa planejada' },
  { value: 'data_unavailable', label: 'Dados indisponíveis' },
];

export const CHECKUP_OUTCOME_VALUES = CHECKUP_OUTCOMES.map((o) => o.value);

export const CHECKUP_WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

export const CHECKUP_INDICATORS = [
  { key: 'gestor', label: 'Gestor responsável' },
  { key: 'last_update', label: 'Última atualização' },
  { key: 'active_campaigns', label: 'Campanhas ativas' },
  { key: 'spend_day', label: 'Investimento do dia' },
  { key: 'spend_month', label: 'Investimento do mês' },
  { key: 'budget', label: 'Orçamento e saldo' },
  { key: 'pace', label: 'Ritmo da verba' },
  { key: 'next_action', label: 'Próxima ação' },
  { key: 'problems', label: 'Problemas detectados' },
];

export const DEFAULT_CHECKUP_WEEKDAYS = [1, 2, 3, 4, 5];

export const DEFAULT_CHECKUP_INDICATORS = Object.fromEntries(
  CHECKUP_INDICATORS.map((item) => [item.key, true])
);

export const CHECKUP_DEMAND_TYPE = 'analise';

export const CHECKUP_TABLE_WRITE_POLICY = {
  traffic_checkup_settings: 'rpc_only',
  traffic_checkup_runs: 'rpc_only',
  traffic_checkup_items: 'rpc_only',
};

export function checkupOutcomeLabel(value) {
  return CHECKUP_OUTCOMES.find((o) => o.value === value)?.label || value || 'Não revisado';
}

export function checkupGenerationKey(clientId, operationalDate) {
  return `checkup:${String(clientId || '').toLowerCase()}:${operationalDate}`;
}

export function isoWeekday(operationalDate) {
  const day = String(operationalDate || '').slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return null;
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay() === 0
    ? 7
    : new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

export function isCheckupDue({
  enabled = true,
  weekdays = DEFAULT_CHECKUP_WEEKDAYS,
  operationalDate,
  situation = null,
  hasSettings = false,
} = {}) {
  const dow = isoWeekday(operationalDate);
  if (!dow) return false;
  if (hasSettings) {
    if (enabled === false) return false;
    const days = Array.isArray(weekdays) && weekdays.length ? weekdays : DEFAULT_CHECKUP_WEEKDAYS;
    return days.map(Number).includes(dow);
  }
  if (situation === 'closed') return false;
  return dow >= 1 && dow <= 5;
}

export function defaultRequireActiveCampaign(situation) {
  return situation !== 'no_campaign_expected' && situation !== 'closed';
}

export function validateCheckupSettingsInput({
  enabled,
  weekdays,
  expectedTime,
  requireActiveCampaign,
  requireBudget,
  indicators,
} = {}) {
  const errors = [];
  if (enabled != null && typeof enabled !== 'boolean') errors.push('Ativo/inativo inválido.');
  const days = (weekdays || []).map(Number);
  if (!days.length) errors.push('Escolha ao menos um dia da semana.');
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    errors.push('Dias da semana devem ser 1–7 (segunda a domingo).');
  }
  if (expectedTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(expectedTime))) {
    errors.push('Horário esperado inválido.');
  }
  if (requireActiveCampaign != null && typeof requireActiveCampaign !== 'boolean') {
    errors.push('Campanha ativa esperada inválida.');
  }
  if (requireBudget != null && typeof requireBudget !== 'boolean') {
    errors.push('Orçamento obrigatório inválido.');
  }
  const keys = Object.keys(indicators || {});
  if (keys.some((key) => !CHECKUP_INDICATORS.some((item) => item.key === key))) {
    errors.push('Indicador desconhecido.');
  }
  return { ok: errors.length === 0, errors };
}

export function validateCheckupConfirm({
  clientId,
  result,
  note,
  attentionProblem,
  attentionAssigneeId,
  attentionDueDate,
} = {}) {
  const errors = [];
  if (!clientId) errors.push('Cliente obrigatório.');
  if (!CHECKUP_OUTCOME_VALUES.includes(result)) errors.push('Resultado do check-up inválido.');

  if (result === 'needs_attention') {
    if (!String(attentionProblem || '').trim()) {
      errors.push('Descreva o problema para marcar “Precisa de atenção”.');
    }
    if (!attentionAssigneeId) errors.push('Responsável da pendência obrigatório.');
    if (!attentionDueDate) errors.push('Prazo da pendência obrigatório.');
  }

  if (note != null && String(note).length > 4000) errors.push('Observação longa demais.');
  return { ok: errors.length === 0, errors };
}

export function detectCheckupProblems({
  gestorId = null,
  situation = null,
  requireActiveCampaign = true,
  activeCampaigns = 0,
  requireBudget = false,
  budget = null,
  spendMonth = null,
  spendMonthAvailable = false,
  metaKind = 'unavailable',
  nextActionOverdue = false,
  indicators = DEFAULT_CHECKUP_INDICATORS,
} = {}) {
  const on = (key) => indicators?.[key] !== false;
  const problems = [];

  if (on('gestor') && !gestorId) {
    problems.push({ code: 'missing_gestor', label: 'Sem gestor responsável' });
  }

  const expectCampaign =
    requireActiveCampaign &&
    situation !== 'no_campaign_expected' &&
    situation !== 'closed' &&
    on('active_campaigns');
  if (expectCampaign && Number(activeCampaigns || 0) < 1) {
    problems.push({ code: 'missing_active_campaign', label: 'Nenhuma campanha ativa' });
  }

  if (on('budget') && requireBudget && !(Number(budget) > 0)) {
    problems.push({ code: 'missing_budget', label: 'Orçamento não informado' });
  }

  if (on('spend_month') && metaKind === 'unavailable') {
    problems.push({ code: 'meta_unavailable', label: 'Dados da Meta indisponíveis' });
  }

  if (on('next_action') && nextActionOverdue) {
    problems.push({ code: 'next_action_overdue', label: 'Próxima ação vencida' });
  }

  if (
    on('budget') &&
    spendMonthAvailable &&
    Number(budget) > 0 &&
    Number(spendMonth) > Number(budget)
  ) {
    problems.push({ code: 'over_budget', label: 'Investimento acima do orçamento' });
  }

  if (on('problems') && situation === 'waiting_client') {
    problems.push({ code: 'waiting_client', label: 'Operação aguardando o cliente' });
  }

  return problems;
}

export function computeBudgetPace({ spend, budget, operationalDate } = {}) {
  if (spend == null || budget == null) {
    return { available: false, status: 'unavailable', label: 'Dados indisponíveis', remaining: null };
  }
  const spendNum = Number(spend);
  const budgetNum = Number(budget);
  if (!Number.isFinite(spendNum) || !Number.isFinite(budgetNum) || budgetNum <= 0) {
    return { available: false, status: 'unavailable', label: 'Dados indisponíveis', remaining: null };
  }
  const day = String(operationalDate || '').slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) {
    return { available: false, status: 'unavailable', label: 'Dados indisponíveis', remaining: budgetNum - spendNum };
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expected = (budgetNum / daysInMonth) * date;
  const remaining = budgetNum - spendNum;
  let status = 'on_pace';
  let label = 'No ritmo';
  if (spendNum > budgetNum) {
    status = 'over';
    label = 'Acima do orçamento';
  } else if (spendNum > expected * 1.2) {
    status = 'ahead';
    label = 'Acima do ritmo';
  } else if (date > 5 && spendNum < expected * 0.5) {
    status = 'behind';
    label = 'Abaixo do ritmo';
  }
  return { available: true, status, label, remaining, expected };
}

export function unavailableMetric(detail = 'Dados indisponíveis') {
  return { available: false, value: null, label: detail };
}

export function summarizeCheckupBoard(clients = []) {
  const due = (clients || []).filter((row) => row.due !== false);
  const reviewed = due.filter((row) => row.run?.result);
  const count = (result) => reviewed.filter((row) => row.run?.result === result).length;
  return {
    total: due.length,
    reviewed: reviewed.length,
    ok: count('ok'),
    attention: count('needs_attention'),
    waiting_client: count('waiting_client'),
    planned_pause: count('planned_pause'),
    data_unavailable: count('data_unavailable'),
    unreviewed: due.length - reviewed.length,
  };
}

export function partitionCheckupClients(clients = []) {
  const due = (clients || []).filter((row) => row.due !== false);
  const withProblems = due.filter(
    (row) => !row.run?.result && (row.problems || []).length > 0
  );
  const pending = due.filter((row) => !row.run?.result && !(row.problems || []).length);
  const attention = due.filter((row) => row.run?.result === 'needs_attention');
  const waiting = due.filter((row) => row.run?.result === 'waiting_client');
  const paused = due.filter((row) => row.run?.result === 'planned_pause');
  const unavailable = due.filter((row) => row.run?.result === 'data_unavailable');
  const ok = due.filter((row) => row.run?.result === 'ok');
  return { withProblems, pending, attention, waiting, paused, unavailable, ok };
}

const BRIEFING_NOISE = new Set([
  'missing_gestor',
  'missing_active_campaign',
  'missing_budget',
  'over_budget',
]);

export function unreviewedCheckupRows(groups = {}) {
  return [...(groups.withProblems || []), ...(groups.pending || [])];
}

export function briefingLook(row, brief, { metaLoading = false, weekLoading = false } = {}) {
  const hasMetaGap = (row?.problems || []).some((p) => p.code === 'meta_unavailable');
  const waitingMeta = Boolean(metaLoading) && !brief && !hasMetaGap;
  if (waitingMeta) {
    return { reasons: ['Ainda lendo a Meta…'], tone: 'wait', line: 'Ainda lendo a Meta…', ready: false };
  }
  const waitingWeek = Boolean(weekLoading) && !brief?.alert && !hasMetaGap;
  if (waitingWeek) {
    return { reasons: ['Ainda lendo a semana na Meta…'], tone: 'wait', line: 'Ainda lendo a semana na Meta…', ready: false };
  }

  const reasons = [];
  if (brief?.alert) reasons.push(brief.alert);
  else if (brief?.delivering > 0) {
    reasons.push(`${brief.delivering} conjunto${brief.delivering === 1 ? '' : 's'} no ar`);
  } else if (brief && !brief.delivering) {
    reasons.push('Nada veiculando agora');
  }

  const qualitySpec = brief?.quality?.code ? NEXT_ACTIONS[brief.quality.code] : null;
  if (qualitySpec && !reasons.includes(qualitySpec.title)) reasons.push(qualitySpec.title);

  for (const problem of row?.problems || []) {
    if (BRIEFING_NOISE.has(problem.code)) continue;
    if (problem.code === 'meta_unavailable' && brief) continue;
    if (problem.label && !reasons.includes(problem.label)) reasons.push(problem.label);
  }

  if (!reasons.length) reasons.push('Sem visto hoje');

  const tone =
    brief?.alert ||
    Boolean(qualitySpec) ||
    (row?.problems || []).some((p) => !BRIEFING_NOISE.has(p.code) && !(p.code === 'meta_unavailable' && brief))
      ? 'alert'
      : 'ok';

  return { reasons, tone, line: reasons[0], ready: true };
}

export function formatCheckupDateTime(value) {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatCheckupTime(value) {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value);
    const match = raw.match(/(\d{2}:\d{2})/);
    return match ? match[1] : '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
