// Deterministic suggestions. Queue counts are not an estimate of working hours.
const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const themes = [
  ['editing', /\b(edicao|editar|corte|legenda|montagem de video)\b/, /edicao|editor|video/],
  ['design', /\b(design|arte|carrossel|layout|banner|thumbnail|identidade visual)\b/, /design|arte|criacao/],
  ['production', /\b(roteiro|gravacao|gravar|filmagem|captacao de video)\b/, /roteiro|gravacao|producao/],
  ['planning', /\b(briefing|pauta|planejamento|calendario editorial)\b/, /planejamento|briefing/],
  ['traffic', /\b(trafego|campanha|anuncio|meta ads|google ads|metricas|conversao|pixel|utm|agendamentos|captacao)\b/, /trafego|midia|ads/],
];
export function addBusinessDays(isoDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(days) || days < 0 || days > 365) throw new Error('Data ou duração inválida.');
  const date = new Date(isoDate + 'T12:00:00Z');
  if (Number.isNaN(+date) || date.toISOString().slice(0, 10) !== isoDate) throw new Error('Data inválida.');
  let remaining = days;
  while (remaining > 0) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) remaining--; }
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function themeOf(draft, demand) {
  for (const text of [String(draft.title || demand.title).replace(/^\[[^\]]+\]\s*/, ''), draft.description || demand.context]) {
    const found = themes.find(([, pattern]) => pattern.test(clean(text)));
    if (found) return found[0];
  }
  return ({ paid_traffic: 'traffic', arte: 'design', carrossel: 'design', post: 'design', social_media: 'planning', video: 'production' })[draft.type] || null;
}
function weekOf(date) {
  const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7); return value.toISOString().slice(0, 10);
}
export function calculateDemandSchedule({ demand, context, inputs, draft, chosenAssigneeId = null, providedDue = null }) {
  const team = inputs.team || context.team || [], validIds = new Set(team.map(p => p.id));
  const workloads = inputs.workloads || [];
  const load = id => workloads.find(row => row.person_id === id) || { open_tasks: 0, overdue_tasks: 0 };
  const functions = inputs.functions || [];
  const workflow = (inputs.workflows || []).find(w => w.task_types.includes(draft.type));
  const stage = workflow?.stages?.[0];
  let fn = workflow && functions.find(f => f.id === stage?.function_id);
  const theme = themeOf(draft, demand);
  const subject = clean(String(draft.title || demand.title).replace(/^\[[^\]]+\]\s*/, ''));
  const explicitInquiry = /\b(apurar|conferir|verificar|checar|diagnosticar|auditar|levantar|revisar|diagnostico|relatorio)\b/.test(subject);
  const explicitProduction = /\b(criar|produzir|configurar|implementar|publicar|lancar|montar|editar|gravar|desenvolver|preparar)\b/.test(subject);
  const inquiry = explicitInquiry || !explicitProduction && !['arte', 'carrossel', 'video', 'post', 'social_media', 'paid_traffic'].includes(draft.type) && !['design', 'editing', 'production'].includes(theme);
  const category = inquiry ? 'inquiry' : 'production';
  const warnings = [];
  let ids = [], assignmentReason = '', workflowAssignees = [];
  if (workflow) {
    workflowAssignees = [...new Set(fn?.assignee_ids || [])];
    if (!workflowAssignees.length || workflowAssignees.some(id => !validIds.has(id))) {
      workflowAssignees = []; warnings.push('O fluxo está sem uma função com responsáveis ativos. Confira a configuração antes de encaminhar.');
    }
    ids = workflowAssignees;
    assignmentReason = `Entrada do fluxo “${workflow.name}”, etapa “${stage?.label || 'Inicial'}”.`;
  } else if (chosenAssigneeId && validIds.has(chosenAssigneeId)) {
    ids = [chosenAssigneeId]; assignmentReason = 'Responsável definido por você.';
  } else if (theme === 'traffic' && validIds.has(inputs.traffic_owner)) {
    ids = [inputs.traffic_owner]; assignmentReason = 'Responsável de tráfego cadastrado para este cliente.';
  } else {
    const matcher = themes.find(([key]) => key === theme)?.[2];
    const matches = matcher ? functions.filter(f => matcher.test(clean(f.name))) : [];
    if (matches.length === 1) fn = matches[0];
    if (fn) { ids = [...new Set(fn.assignee_ids || [])].filter(id => validIds.has(id)); assignmentReason = `Função cadastrada: ${fn.name}. Menor fila de tarefas entre os integrantes aptos.`; }
    else if (matches.length > 1) warnings.push('Há mais de uma função compatível. Escolha quem deve assumir.');
  }
  ids.sort((a, b) => load(a).open_tasks - load(b).open_tasks || load(a).overdue_tasks - load(b).overdue_tasks || a.localeCompare(b));
  const assignee = ids[0] || '';
  if (!assignee) assignmentReason = assignmentReason || 'Não há responsável cadastrado com segurança para este tema. Escolha uma pessoa antes de aprovar.';
  let days = inputs.settings[category === 'inquiry' ? 'inquiry_days' : 'production_days'];
  let dateReason = `Regra de ${category === 'inquiry' ? 'apuração' : 'produção'}: ${days} dia(s) útil(eis).`;
  if (workflow) {
    const stages = workflow.stages.filter(s => s.kind !== 'backlog');
    const gate = stages.findIndex(s => ['review', 'validation', 'client', 'publishing', 'complete'].includes(s.kind));
    const execution = gate >= 0 ? stages.slice(0, gate) : stages;
    if (execution.length && execution.every(s => Number.isInteger(s.sla_days) && s.sla_days >= 0 && s.sla_days <= 365) && execution.reduce((n, s) => n + s.sla_days, 0) <= 365) {
      days = execution.reduce((n, s) => n + s.sla_days, 0); dateReason = `Prazos cadastrados nas etapas de execução do fluxo: ${days} dia(s) útil(eis).`;
    } else warnings.push('O fluxo não tem duração completa de execução cadastrada; foi usada a regra inicial.');
  }
  const due = providedDue || addBusinessDays(inputs.local_today, days);
  if (providedDue) dateReason = 'Data já informada na proposta ou ajustada por você; mantida para revisão.';
  if (due < inputs.local_today) warnings.push('A data informada está no passado. Confira antes de aprovar.');
  if (fn) {
    const cap = (inputs.capacities || []).find(c => c.operational_function_id === fn.id && c.week_start === weekOf(due));
    if (cap && cap.scheduled_tasks >= cap.task_limit) warnings.push(`A função já tem ${cap.scheduled_tasks} tarefa(s) para a semana, com limite cadastrado de ${cap.task_limit}. Revise o prazo ou a fila.`);
  }
  return { assignee_id: assignee, due_date: due, expected_assignee_ids: workflow ? workflowAssignees.slice().sort() : assignee ? [assignee] : [], workflow_controlled: Boolean(workflow), operational_function_id: fn?.id || null, category, days, assignment_reason: assignmentReason, date_reason: dateReason, warnings, workload: assignee ? load(assignee) : null, schedule_hash: inputs.basis_hash };
}
