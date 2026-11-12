/**
 * Indicadores por colaborador em três camadas: Disciplina, Entrega e Resultado.
 * Funções puras: recebem as linhas já lidas do banco e devolvem, por pessoa,
 * cada indicador com valor, base e a lista de itens que o compõem.
 * Indicador sem base aparece como "não medido", nunca como zero.
 */

import { appointmentDay, appointmentStatusKeys, isSoldMiniStatus, origemDoContato } from './miniCrm.js';

export const TIME_ZONE = 'America/Sao_Paulo';

/** Hábitos que só passaram a existir com esta regra; meses anteriores não são medidos. */
export const NEW_HABITS_START = '2026-10-01';

/** Bruto entregue até esta hora do dia da gravação agendada. */
export const BRUTO_DEADLINE_HOUR = 13;

/** Dia do mês anterior em que os roteiros do mês precisam estar entregues. */
export const SCRIPT_DEADLINE_DAY = 28;

export const COVERAGE_TARGET = 0.9;

export const INDICATOR_PROFILES = [
  { value: 'gestao', label: 'Gestão de projetos' },
  { value: 'design', label: 'Design e postagem' },
  { value: 'roteiro_gravacao', label: 'Roteiro e gravação' },
  { value: 'edicao', label: 'Edição de vídeo' },
  { value: 'trafego', label: 'Tráfego pago' },
  { value: 'nenhum', label: 'Sem indicadores' },
];

export const LAYERS = [
  { key: 'disciplina', label: 'Disciplina', hint: 'Vale para todos. Peso menor.' },
  { key: 'entrega', label: 'Entrega', hint: 'Pela função da pessoa. Peso maior.' },
  { key: 'resultado', label: 'Resultado', hint: 'Só onde a pessoa influencia.' },
];

const ART_TYPES = new Set(['arte', 'carrossel']);
const VIDEO_TYPES = new Set(['video', 'reels']);
const PRODUCTION_STAGES = new Set(['art_production', 'script', 'recording', 'editing']);
const CLIENT_STAGES = new Set(['send_client', 'waiting_client', 'schedule', 'scheduled']);
const CLIENT_STATUSES = new Set(['approve', 'aguardando_aprovação', 'agendar']);
const TERMINAL_STATUSES = new Set(['completed', 'published']);
const ADJUSTMENT_STATUS = 'alteração';

// ---------------------------------------------------------------- datas

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function zonedParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Dia (AAAA-MM-DD) em Brasília. Datas puras passam direto. */
export function spDay(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return zonedParts(text)?.day || null;
}

export function spMinutes(value) {
  return value == null ? null : zonedParts(value)?.minutes ?? null;
}

export function monthKey(value) {
  return String(value || '').slice(0, 7);
}

export function monthStart(value) {
  return `${monthKey(value)}-01`;
}

export function shiftMonth(month, delta) {
  const [year, mon] = monthKey(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function monthEnd(month) {
  const [year, mon] = monthKey(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, mon, 0));
  return `${monthKey(month)}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function inMonth(day, month) {
  return Boolean(day) && monthKey(day) === monthKey(month);
}

export function addDays(day, delta) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function isBusinessDay(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** Segunda a sexta do mês até `until` (inclusive). Feriado não é descontado. */
export function businessDays(month, until) {
  const last = until && until < monthEnd(month) ? until : monthEnd(month);
  const days = [];
  for (let day = monthStart(month); day <= last; day = addDays(day, 1)) {
    if (isBusinessDay(day)) days.push(day);
  }
  return days;
}

export function addBusinessDays(day, count) {
  let current = day;
  let left = Number(count) || 0;
  while (left > 0) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) left -= 1;
  }
  return current;
}

export function formatDay(day) {
  if (!day) return '—';
  const [year, month, date] = String(day).slice(0, 10).split('-');
  return `${date}/${month}/${year}`;
}

export function formatMonthLabel(month) {
  const [year, mon] = monthKey(month).split('-').map(Number);
  return new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------- prazo

/**
 * Prazo que vale para a entrega. Mudar o prazo antes de vencer vale; empurrar
 * um prazo que já tinha vencido não vale e fica marcado. Mudanças depois da
 * entrega não contam.
 */
export function effectiveDeadline(task, field, changes = [], { until = null } = {}) {
  const limit = until ? new Date(until).getTime() : Infinity;
  const rows = changes
    .filter((row) => row.task_id === task.id && row.field === field)
    .sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
  const createdDay = spDay(task.created_at);
  const notBeforeCreation = (result) => (result.day && createdDay && createdDay > result.day
    ? { ...result, day: createdDay, bornLate: true }
    : { ...result, bornLate: false });
  if (!rows.length) {
    return notBeforeCreation({ day: task[field] || null, moved: 0, ignored: [], knownSince: null });
  }
  let { day, bornLate } = notBeforeCreation({ day: rows[0].new_value || null });
  let moved = 0;
  const ignored = [];
  for (const row of rows.slice(1)) {
    if (new Date(row.changed_at).getTime() > limit) break;
    const changedDay = spDay(row.changed_at);
    if (day && row.new_value && row.new_value > day && changedDay > day) {
      ignored.push({ from: day, to: row.new_value, at: row.changed_at, by: row.changed_by || null });
      continue;
    }
    if (row.new_value !== day) moved += 1;
    ({ day, bornLate } = notBeforeCreation({ day: row.new_value || null }));
  }
  return { day, bornLate, moved, ignored, knownSince: rows[0].source === 'baseline' ? spDay(rows[0].changed_at) : null };
}

// ---------------------------------------------------------------- etapas do fluxo

export function templateOrder(template) {
  const order = new Map();
  (template?.stages || []).forEach((stage, index) => order.set(stage.key, index));
  return order;
}

function stageEvents(task) {
  return (Array.isArray(task.stage_execution_history) ? task.stage_execution_history : [])
    .filter((event) => event && event.kind === 'status_change')
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function isForwardExit(event, stageKey, order) {
  if (event.from_workflow_stage_key !== stageKey) return false;
  const to = event.to_workflow_stage_key;
  if (to && order.has(to) && order.has(stageKey)) return order.get(to) > order.get(stageKey);
  return !to && TERMINAL_STATUSES.has(event.to_status);
}

/** Primeira vez que a etapa foi entregue para a frente, e quem estava nela. */
export function firstStageDelivery(task, stageKey, order) {
  const events = stageEvents(task);
  const index = events.findIndex((item) => isForwardExit(item, stageKey, order));
  if (index < 0) return null;
  const event = events[index];
  const arrival = events.slice(0, index).reverse().find((item) => item.to_workflow_stage_key === stageKey);
  return { at: event.at, arrivedAt: arrival?.at || null, people: (event.from_assignee_ids || []).filter(Boolean) };
}

/**
 * Rodadas de cada etapa de produção: 1 + cada volta para ajuste depois de
 * entregue. Volta = ir para Alteração ou para uma etapa anterior. A volta
 * vinda do envio ao cliente conta como "cliente"; as demais, "interna".
 */
export function stageRounds(task, order) {
  const result = {};
  let lastDelivered = null;
  for (const event of stageEvents(task)) {
    const from = event.from_workflow_stage_key;
    const to = event.to_workflow_stage_key;
    if (from && PRODUCTION_STAGES.has(from) && isForwardExit(event, from, order)) {
      if (!result[from]) result[from] = { rounds: 1, interna: 0, cliente: 0 };
      lastDelivered = from;
      continue;
    }
    const backward = from && to && order.has(from) && order.has(to) && order.get(to) < order.get(from);
    const adjustment = event.to_status === ADJUSTMENT_STATUS && !to;
    if (!backward && !adjustment) continue;
    const target = backward && PRODUCTION_STAGES.has(to) ? to : lastDelivered;
    if (!target || !result[target]) continue;
    const fromClient = CLIENT_STAGES.has(from) || (!from && CLIENT_STATUSES.has(event.from_status));
    result[target].rounds += 1;
    result[target][fromClient ? 'cliente' : 'interna'] += 1;
  }
  return result;
}

/** Voltas da Edição (ou depois) para a Gravação. */
export function recordingReturns(task, order) {
  return stageEvents(task).filter((event) => event.to_workflow_stage_key === 'recording'
    && event.from_workflow_stage_key && order.has(event.from_workflow_stage_key)
    && order.get(event.from_workflow_stage_key) > order.get('recording'));
}

// ---------------------------------------------------------------- montagem

function ratio(items) {
  const counted = items.filter((item) => item.ok != null);
  if (!counted.length) return null;
  return counted.filter((item) => item.ok).length / counted.length;
}

function percent(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function indicator(base) {
  return { target: null, hit: null, items: [], note: null, ...base };
}

function notMeasured(base, reason) {
  return indicator({ ...base, measured: false, value: null, display: 'Não medido', reason });
}

function percentIndicator(base, items, { target = null, emptyReason } = {}) {
  const counted = items.filter((item) => item.ok != null);
  if (!counted.length) return notMeasured({ ...base, items }, emptyReason || 'Nenhum item no mês.');
  const value = ratio(items);
  return indicator({
    ...base,
    measured: true,
    value,
    display: `${percent(value)} (${counted.filter((item) => item.ok).length} de ${counted.length})`,
    target: target == null ? null : `≥ ${percent(target)}`,
    hit: target == null ? null : value >= target,
    items,
  });
}

function habitStarted(month) {
  return monthStart(month) >= NEW_HABITS_START;
}

function personIn(list, personId) {
  return Array.isArray(list) && list.includes(personId);
}

function taskLabel(task, clientsById) {
  const title = task.title || 'Tarefa';
  const client = clientsById.get(task.client_id)?.empresa;
  return client && !title.startsWith('[') ? `[${client}] ${title}` : title;
}

function contentMonth(task, projectsById) {
  const project = projectsById.get(task.project_id);
  if (project?.mes_referencia) return monthStart(project.mes_referencia);
  if (task.post_date) return monthStart(task.post_date);
  if (task.due_date) return monthStart(task.due_date);
  return null;
}

/** Entrega do material no fluxo novo, atribuída a quem estava na etapa de produção. */
function productionDeliveries(ctx, types, stageKey) {
  return ctx.tasks
    .filter((task) => types.has(String(task.type || '').toLowerCase()) && task.workflow_template_id && task.production_delivered_at)
    .filter((task) => inMonth(spDay(task.production_delivered_at), ctx.month))
    .map((task) => {
      const order = ctx.orderFor(task);
      const stage = firstStageDelivery(task, stageKey, order);
      const deadline = effectiveDeadline(task, 'due_date', ctx.deadlineChanges, { until: task.production_delivered_at });
      const deliveredDay = spDay(task.production_delivered_at);
      const arrivedDay = spDay(stage?.arrivedAt);
      return {
        task,
        people: stage?.people || [],
        deliveredDay,
        arrivedDay,
        arrivedLate: Boolean(arrivedDay && deadline.day && arrivedDay >= deadline.day),
        deadline,
        ok: deadline.day ? deliveredDay <= deadline.day : null,
        rounds: stageRounds(task, order)[stageKey] || null,
      };
    });
}

/** Na etapa da própria pessoa: material que chegou no dia do prazo ou depois não conta contra ela. */
function stageDeliveryItem(row, ctx, stageLabel) {
  const item = deliveryItem(row, ctx);
  if (!row.arrivedLate) return item;
  return { ...item, ok: null, detail: `${item.detail} · chegou na ${stageLabel} em ${formatDay(row.arrivedDay)}, já no prazo ou depois: não conta` };
}

function deliveryItem(row, ctx) {
  const notes = [];
  if (!row.deadline.day) notes.push('sem prazo');
  if (row.deadline.moved) notes.push(`prazo mudou ${row.deadline.moved}x antes de vencer`);
  if (row.deadline.ignored.length) notes.push(`${row.deadline.ignored.length} mudança(s) depois de vencido não valeram`);
  if (row.deadline.bornLate) notes.push('criada depois do prazo: conta do dia da criação');
  return {
    label: taskLabel(row.task, ctx.clientsById),
    ok: row.ok,
    detail: `Entregue ${formatDay(row.deliveredDay)} · prazo ${formatDay(row.deadline.day)}${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
    taskId: row.task.id,
  };
}

function snapshotMissing(base, kind, month, today) {
  const due = kind === 'cobertura_dia1' ? monthStart(month) : monthEnd(month);
  const reason = today && today <= due
    ? `A foto é tirada sozinha às 23h55 de ${formatDay(due)}.`
    : 'Não existe foto deste mês: a regra começou em 01/10/2026.';
  return notMeasured(base, reason);
}

// ---------------------------------------------------------------- indicadores comuns

function planejeUpdated(ctx, person) {
  const base = { key: 'planeje_atualizado', layer: 'disciplina', label: 'Planeje atualizado no fim do dia', how: 'Dias úteis em que a pessoa moveu alguma tarefa, conferiu o tráfego ou finalizou uma revisão ÷ dias úteis do mês. Feriado e folga não são descontados.' };
  const yesterday = addDays(ctx.today, -1);
  if (monthStart(ctx.month) > ctx.today) return notMeasured(base, 'Mês ainda não começou.');
  const days = businessDays(ctx.month, yesterday);
  if (!days.length) return notMeasured(base, 'Nenhum dia útil encerrado no mês.');
  const active = ctx.activityDays.get(person.id) || new Set();
  const items = days.map((day) => ({ label: formatDay(day), ok: active.has(day), detail: active.has(day) ? 'Atualizou' : 'Sem movimentação' }));
  return percentIndicator(base, items);
}

function overdueAtClose(ctx, person, { carteira = false } = {}) {
  const base = carteira
    ? { key: 'vencidas_carteira', layer: 'entrega', label: 'Tarefas vencidas da carteira no fechamento', how: 'Foto às 23h55 do último dia do mês: tarefas abertas com prazo vencido dos clientes em que a pessoa é responsável.' }
    : { key: 'vencidas_fechamento', layer: 'disciplina', label: 'Tarefas vencidas no fechamento', how: 'Foto às 23h55 do último dia do mês: tarefas abertas com prazo vencido em que a pessoa é responsável. Stand-by não entra.' };
  const snapshot = ctx.snapshots.fechamento_vencidas;
  if (!snapshot) return snapshotMissing(base, 'fechamento_vencidas', ctx.month, ctx.today);
  const rows = (snapshot.rows || []).filter((row) => (carteira
    ? ctx.clientsById.get(row.client_id)?.responsavel === person.id
    : personIn(row.assignee_ids, person.id)));
  return indicator({
    ...base,
    measured: true,
    value: rows.length,
    display: `${rows.length} tarefa(s)`,
    target: '0',
    hit: rows.length === 0,
    items: rows.map((row) => ({ label: row.title || 'Tarefa', ok: false, detail: `Prazo ${formatDay(spDay(row.deadline))} (${row.deadline_kind === 'stage' ? 'etapa' : row.deadline_kind === 'publication' ? 'postagem' : 'produção'})`, taskId: row.task_id })),
  });
}

// ---------------------------------------------------------------- por função

function gestaoIndicators(ctx, person) {
  const list = [];
  const coverageBase = { key: 'cobertura_dia1', layer: 'entrega', label: 'Cobertura do mês até o dia 1º', how: 'Foto às 23h55 do dia 1º da Cobertura Mensal: peças planejadas ÷ contratadas nos clientes em que a pessoa é responsável. Cliente só de tráfego não entra.' };
  const coverage = ctx.snapshots.cobertura_dia1;
  if (!coverage) list.push(snapshotMissing(coverageBase, 'cobertura_dia1', ctx.month, ctx.today));
  else {
    const rows = (coverage.rows || []).filter((row) => row.responsavel_id === person.id && row.tipo_servico_norm !== 'trafego_apenas' && Number(row.contratado) > 0);
    const contratado = rows.reduce((sum, row) => sum + Number(row.contratado || 0), 0);
    const planejado = rows.reduce((sum, row) => sum + Math.min(Number(row.planejado || 0), Number(row.contratado || 0)), 0);
    if (!contratado) list.push(notMeasured(coverageBase, 'Nenhum cliente da carteira com peças contratadas.'));
    else {
      const value = planejado / contratado;
      list.push(indicator({
        ...coverageBase,
        measured: true,
        value,
        display: `${percent(value)} (${planejado} de ${contratado} peças)`,
        target: `≥ ${percent(COVERAGE_TARGET)}`,
        hit: value >= COVERAGE_TARGET,
        note: 'Peça acima do contratado não compensa outro cliente.',
        items: rows.map((row) => ({ label: row.empresa, ok: Number(row.planejado) >= Number(row.contratado), detail: `${row.planejado} de ${row.contratado} planejadas${row.tem_plano_mes ? '' : ' · sem plano do mês'}` })),
      }));
    }
  }

  const deliveries = ctx.tasks
    .filter((task) => task.workflow_template_id && task.production_delivered_at && inMonth(spDay(task.production_delivered_at), ctx.month))
    .filter((task) => ctx.clientsById.get(task.client_id)?.responsavel === person.id)
    .map((task) => {
      const deadline = effectiveDeadline(task, 'due_date', ctx.deadlineChanges, { until: task.production_delivered_at });
      const deliveredDay = spDay(task.production_delivered_at);
      return { task, deadline, deliveredDay, ok: deadline.day ? deliveredDay <= deadline.day : null };
    });
  list.push(percentIndicator(
    { key: 'prazo_carteira', layer: 'resultado', label: 'Entregas no prazo da carteira', how: 'Primeira entrega do material até o prazo, nas tarefas do fluxo novo dos clientes da carteira.' },
    deliveries.map((row) => deliveryItem(row, ctx)),
    { emptyReason: 'Nenhuma entrega do fluxo novo na carteira neste mês.' },
  ));

  list.push(overdueAtClose(ctx, person, { carteira: true }));

  const onboardingItems = ctx.onboardingStages
    .filter((stage) => stage.pending_side === 'internal' && ctx.clientsById.get(stage.client_id)?.responsavel === person.id)
    .map((stage) => {
      const task = stage.task_id ? ctx.tasksById.get(stage.task_id) : null;
      const due = task?.due_date || (stage.started_at ? addBusinessDays(spDay(stage.started_at), stage.sla_days || 0) : null);
      const doneDay = spDay(stage.completed_at);
      if (doneDay) return inMonth(doneDay, ctx.month) ? { stage, due, doneDay, ok: due ? doneDay <= due : null } : null;
      if (due && inMonth(due, ctx.month) && due < ctx.today) return { stage, due, doneDay: null, ok: false };
      return null;
    })
    .filter(Boolean)
    .map((row) => ({ label: `${ctx.clientsById.get(row.stage.client_id)?.empresa || 'Cliente'} · ${row.stage.title}`, ok: row.ok, detail: `${row.doneDay ? `Concluída ${formatDay(row.doneDay)}` : 'Ainda aberta'} · prazo ${formatDay(row.due)}` }));
  list.push(percentIndicator(
    { key: 'onboarding_sla', layer: 'entrega', label: 'Onboarding dentro do SLA', how: 'Etapas internas do onboarding concluídas até o prazo em dias úteis. Etapa que espera o cliente não conta.' },
    onboardingItems,
    { emptyReason: 'Nenhuma etapa interna de onboarding venceu ou foi concluída no mês.' },
  ));
  return list;
}

function designIndicators(ctx, person) {
  const list = [];
  const deliveries = productionDeliveries(ctx, ART_TYPES, 'art_production').filter((row) => personIn(row.people, person.id));
  list.push(percentIndicator(
    { key: 'artes_prazo', layer: 'entrega', label: 'Artes no prazo', how: 'Primeira entrega da arte ou carrossel (fluxo novo) até o prazo da tarefa. Alteração depois disso não muda o prazo; conta como rodada. Se a tarefa chegou na produção da arte no dia do prazo ou depois, não conta.' },
    deliveries.map((row) => stageDeliveryItem(row, ctx, 'produção da arte')),
    { emptyReason: 'Nenhuma arte do fluxo novo entregue no mês.' },
  ));

  const roundBase = { key: 'artes_rodadas', layer: 'entrega', label: 'Retrabalho: itens que passaram de 2 rodadas', how: 'Rodadas contadas pelo histórico automático: 1 + cada volta para ajuste depois da entrega.' };
  const withRounds = deliveries.filter((row) => row.rounds);
  if (!withRounds.length) list.push(notMeasured(roundBase, 'Nenhuma arte do fluxo novo entregue no mês.'));
  else {
    const over = withRounds.filter((row) => row.rounds.rounds > 2);
    list.push(indicator({
      ...roundBase,
      measured: true,
      value: over.length,
      display: `${over.length} de ${withRounds.length}`,
      target: '0',
      hit: over.length === 0,
      items: withRounds.map((row) => ({ label: taskLabel(row.task, ctx.clientsById), ok: row.rounds.rounds <= 2, detail: `${row.rounds.rounds} rodada(s) · ${row.rounds.interna} interna(s), ${row.rounds.cliente} do cliente · campo manual: ${row.task.review_round ?? 0}`, taskId: row.task.id })),
    }));
  }

  const evidenceBase = { key: 'evidencia', layer: 'disciplina', label: 'Publicações com evidência', how: 'Tarefas publicadas no mês, em que a pessoa estava na postagem, com link, print ou ID da Meta em Publicações por canal.' };
  if (!habitStarted(ctx.month)) list.push(notMeasured(evidenceBase, 'Regra começa em 01/10/2026.'));
  else {
    const published = ctx.tasks
      .map((task) => {
        const entry = (Array.isArray(task.status_history) ? task.status_history : [])
          .find((row) => row?.status === 'published' && inMonth(spDay(row.timestamp), ctx.month));
        return entry ? { task, entry } : null;
      })
      .filter(Boolean)
      .filter(({ entry }) => personIn(entry.assignee_ids, person.id));
    list.push(percentIndicator(evidenceBase, published.map(({ task, entry }) => {
      const pubs = ctx.publicationsByTask.get(task.id) || [];
      const proof = pubs.some((pub) => String(pub.evidence_url || '').trim() || String(pub.meta_post_id || '').trim());
      return { label: taskLabel(task, ctx.clientsById), ok: proof, detail: `Publicada ${formatDay(spDay(entry.timestamp))}${proof ? '' : ' · sem link nem print'}`, taskId: task.id };
    }), { emptyReason: 'Nenhuma publicação no mês com a pessoa na postagem.' }));
  }
  return list;
}

function roteiroIndicators(ctx, person) {
  const list = [];
  const deadlineDay = `${monthKey(ctx.month)}-${String(SCRIPT_DEADLINE_DAY).padStart(2, '0')}`;
  const nextMonth = shiftMonth(ctx.month, 1);
  const scripts = ctx.tasks
    .filter((task) => VIDEO_TYPES.has(String(task.type || '').toLowerCase()) && task.workflow_template_id && contentMonth(task, ctx.projectsById) === nextMonth)
    .map((task) => {
      const order = ctx.orderFor(task);
      if (!order.has('script')) return null;
      const delivery = firstStageDelivery(task, 'script', order);
      const people = delivery?.people || (task.workflow_stage_key === 'script' ? task.assignee_ids || [] : []);
      if (!personIn(people, person.id)) return null;
      const day = delivery ? spDay(delivery.at) : null;
      if (!day && ctx.today <= deadlineDay) return null;
      return { label: taskLabel(task, ctx.clientsById), ok: Boolean(day) && day <= deadlineDay, detail: day ? `Roteiro entregue ${formatDay(day)}` : 'Roteiro ainda não entregue', taskId: task.id };
    })
    .filter(Boolean);
  list.push(percentIndicator(
    { key: 'roteiros_dia28', layer: 'entrega', label: `Roteiros do mês seguinte entregues até ${formatDay(deadlineDay)}`, how: `Roteiros dos vídeos de ${formatMonthLabel(nextMonth)} (fluxo novo) que saíram da etapa Roteiro até o dia ${SCRIPT_DEADLINE_DAY}.` },
    scripts,
    { target: 1, emptyReason: `Nenhum vídeo de ${formatMonthLabel(nextMonth)} com roteiro desta pessoa.` },
  ));

  const recordingBase = { key: 'gravacao_data', layer: 'entrega', label: 'Gravação realizada na data agendada', how: 'Saída da etapa Gravação até a data agendada na tarefa. Reagendar antes da data vale; depois, não.' };
  const brutoBase = { key: 'bruto_13h', layer: 'disciplina', label: `Bruto entregue até ${BRUTO_DEADLINE_HOUR}h`, how: `Gravação passada para a Edição até ${BRUTO_DEADLINE_HOUR}h do dia agendado.` };
  const reworkBase = { key: 'regravacao', layer: 'entrega', label: 'Regravação por falha de captação', how: 'Regravações registradas na tarefa com o motivo falha de captação. Volta para Gravação sem motivo registrado aparece para classificar e não conta.' };
  if (!habitStarted(ctx.month)) {
    list.push(notMeasured(recordingBase, 'A data agendada da gravação passou a existir em 01/10/2026.'));
    list.push(notMeasured(brutoBase, 'A data agendada da gravação passou a existir em 01/10/2026.'));
    list.push(notMeasured(reworkBase, 'O registro de regravação passou a existir em 01/10/2026.'));
    return list;
  }

  const recordings = ctx.tasks
    .filter((task) => VIDEO_TYPES.has(String(task.type || '').toLowerCase()) && task.workflow_template_id)
    .map((task) => {
      const order = ctx.orderFor(task);
      const delivery = firstStageDelivery(task, 'recording', order);
      const scheduled = effectiveDeadline(task, 'recording_scheduled_on', ctx.deadlineChanges, { until: delivery?.at || null });
      if (!scheduled.day || !inMonth(scheduled.day, ctx.month)) return null;
      const people = delivery?.people || (['script', 'script_review', 'recording'].includes(task.workflow_stage_key) ? task.assignee_ids || [] : []);
      if (!personIn(people, person.id)) return null;
      return { task, delivery, scheduled };
    })
    .filter(Boolean);
  const recItems = recordings
    .filter((row) => row.delivery || row.scheduled.day < ctx.today)
    .map((row) => {
      const day = row.delivery ? spDay(row.delivery.at) : null;
      return { label: taskLabel(row.task, ctx.clientsById), ok: Boolean(day) && day <= row.scheduled.day, detail: `${day ? `Gravado ${formatDay(day)}` : 'Ainda não gravado'} · agendado ${formatDay(row.scheduled.day)}${row.scheduled.ignored.length ? ' · reagendado depois da data (não valeu)' : ''}`, taskId: row.task.id };
    });
  list.push(percentIndicator(recordingBase, recItems, { emptyReason: 'Nenhuma gravação agendada para o mês.' }));

  const brutoItems = recordings
    .filter((row) => row.delivery || row.scheduled.day < ctx.today)
    .map((row) => {
      const day = row.delivery ? spDay(row.delivery.at) : null;
      const minutes = row.delivery ? spMinutes(row.delivery.at) : null;
      const ok = Boolean(day) && (day < row.scheduled.day || (day === row.scheduled.day && minutes <= BRUTO_DEADLINE_HOUR * 60));
      const hour = minutes == null ? '' : ` às ${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
      return { label: taskLabel(row.task, ctx.clientsById), ok, detail: day ? `Bruto ${formatDay(day)}${hour} · agendado ${formatDay(row.scheduled.day)}` : 'Bruto ainda não entregue', taskId: row.task.id };
    });
  list.push(percentIndicator(brutoBase, brutoItems, { emptyReason: 'Nenhuma gravação agendada para o mês.' }));

  const recordedByPerson = new Set(ctx.tasks
    .filter((task) => VIDEO_TYPES.has(String(task.type || '').toLowerCase()) && task.workflow_template_id)
    .filter((task) => personIn(firstStageDelivery(task, 'recording', ctx.orderFor(task))?.people, person.id))
    .map((task) => task.id));
  const events = ctx.reworkEvents.filter((row) => recordedByPerson.has(row.task_id) && inMonth(spDay(row.created_at), ctx.month));
  const failures = events.filter((row) => row.reason === 'falha_captacao');
  const classified = new Set(events.map((row) => row.task_id));
  const unclassified = ctx.tasks
    .filter((task) => recordedByPerson.has(task.id) && !classified.has(task.id))
    .flatMap((task) => recordingReturns(task, ctx.orderFor(task)).filter((event) => inMonth(spDay(event.at), ctx.month)).map((event) => ({ task, event })));
  list.push(indicator({
    ...reworkBase,
    measured: true,
    value: failures.length,
    display: `${failures.length} regravação(ões)`,
    target: '0',
    hit: failures.length === 0,
    note: unclassified.length ? `${unclassified.length} volta(s) para Gravação sem motivo registrado: classifique na tarefa.` : null,
    items: [
      ...events.map((row) => ({ label: taskLabel(ctx.tasksById.get(row.task_id) || { title: 'Tarefa' }, ctx.clientsById), ok: row.reason !== 'falha_captacao', detail: `${REWORK_REASONS[row.reason] || row.reason} · ${formatDay(spDay(row.created_at))}${row.notes ? ` · ${row.notes}` : ''}`, taskId: row.task_id })),
      ...unclassified.map(({ task, event }) => ({ label: taskLabel(task, ctx.clientsById), ok: null, detail: `Voltou para Gravação em ${formatDay(spDay(event.at))} · sem motivo registrado`, taskId: task.id })),
    ],
  }));
  return list;
}

function edicaoIndicators(ctx, person) {
  const list = [];
  const deliveries = productionDeliveries(ctx, VIDEO_TYPES, 'editing').filter((row) => personIn(row.people, person.id));
  list.push(percentIndicator(
    { key: 'videos_prazo', layer: 'entrega', label: 'Vídeos no prazo', how: 'Primeira entrega da edição (fluxo novo) até o prazo da tarefa. Alteração depois disso não muda o prazo; conta como rodada. Se o bruto chegou na edição no dia do prazo ou depois, não conta.' },
    deliveries.map((row) => stageDeliveryItem(row, ctx, 'edição')),
    { emptyReason: 'Nenhum vídeo do fluxo novo entregue no mês.' },
  ));
  const roundBase = { key: 'videos_rodadas', layer: 'entrega', label: 'Média de rodadas por vídeo', how: 'Rodadas da edição pelo histórico automático: 1 + cada volta para ajuste depois da entrega.' };
  const withRounds = deliveries.filter((row) => row.rounds);
  if (!withRounds.length) list.push(notMeasured(roundBase, 'Nenhum vídeo do fluxo novo entregue no mês.'));
  else {
    const avg = withRounds.reduce((sum, row) => sum + row.rounds.rounds, 0) / withRounds.length;
    list.push(indicator({
      ...roundBase,
      measured: true,
      value: avg,
      display: `${avg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} rodada(s) em ${withRounds.length} vídeo(s)`,
      items: withRounds.map((row) => ({ label: taskLabel(row.task, ctx.clientsById), ok: row.rounds.rounds <= 2, detail: `${row.rounds.rounds} rodada(s) · ${row.rounds.interna} interna(s), ${row.rounds.cliente} do cliente · campo manual: ${row.task.review_round ?? 0}`, taskId: row.task.id })),
    }));
  }
  return list;
}

function reviewTotals(review) {
  if (review.metric_mode === 'campaign' && Array.isArray(review.campaign_metrics) && review.campaign_metrics.length) {
    const sum = (key) => review.campaign_metrics.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
    return { spend: sum('spend'), leads: sum('messages'), purchases: sum('compras') };
  }
  return { spend: Number(review.investment) || 0, leads: Number(review.contacts) || 0, purchases: Number(review.results) || 0 };
}

function trafegoIndicators(ctx, person) {
  const list = [];
  const carteira = new Set(ctx.trafficOps.filter((row) => row.primary_assignee_id === person.id).map((row) => row.client_id));

  const reviewItems = ctx.reviews
    .filter((review) => review.kind === 'review' && carteira.has(review.client_id) && review.task_id)
    .map((review) => {
      const task = ctx.tasksById.get(review.task_id);
      if (!task) return null;
      const deadline = effectiveDeadline(task, 'due_date', ctx.deadlineChanges, { until: review.finalized_at || null });
      if (!deadline.day || !inMonth(deadline.day, ctx.month)) return null;
      const doneDay = spDay(review.finalized_at);
      if (!doneDay && deadline.day >= ctx.today) return null;
      return { label: taskLabel(task, ctx.clientsById), ok: Boolean(doneDay) && doneDay <= deadline.day, detail: `${doneDay ? `Finalizada ${formatDay(doneDay)}` : 'Não finalizada'} · prazo ${formatDay(deadline.day)}${deadline.bornLate ? ' (criada depois do prazo)' : ''}`, taskId: task.id };
    })
    .filter(Boolean);
  list.push(percentIndicator(
    { key: 'revisao_semanal', layer: 'entrega', label: 'Análise semanal entregue no prazo', how: 'Revisões semanais da Rotina, dos clientes em que a pessoa é responsável no tráfego, finalizadas até o prazo da tarefa.' },
    reviewItems,
    { emptyReason: 'Nenhuma revisão semanal com prazo no mês.' },
  ));

  const dailyBase = { key: 'registro_diario', layer: 'disciplina', label: 'Registro diário preenchido', how: 'Dias úteis com a conferência diária confirmada pela pessoa ÷ dias úteis do mês.' };
  if (!habitStarted(ctx.month)) list.push(notMeasured(dailyBase, 'Regra começa em 01/10/2026.'));
  else {
    const days = businessDays(ctx.month, addDays(ctx.today, -1));
    const filled = new Set(ctx.checkups.filter((row) => row.confirmed_by === person.id).map((row) => row.operational_date));
    list.push(percentIndicator(dailyBase, days.map((day) => ({ label: formatDay(day), ok: filled.has(day), detail: filled.has(day) ? 'Conferência confirmada' : 'Sem conferência' })), { emptyReason: 'Nenhum dia útil encerrado no mês.' }));
  }

  const costItems = [...carteira].map((clientId) => {
    const client = ctx.clientsById.get(clientId);
    if (!client) return null;
    const cplGoal = Number(client.meta_custo_mensagem) || null;
    const cpaGoal = Number(client.meta_custo_compra) || null;
    if (!cplGoal && !cpaGoal) return null;
    const reviews = ctx.reviews.filter((review) => review.kind === 'review' && review.client_id === clientId && review.finalized_at && inMonth(review.week_start, ctx.month));
    if (!reviews.length) return { label: client.empresa, ok: null, detail: 'Sem revisão semanal finalizada no mês' };
    const totals = reviews.reduce((acc, review) => {
      const row = reviewTotals(review);
      return { spend: acc.spend + row.spend, leads: acc.leads + row.leads, purchases: acc.purchases + row.purchases };
    }, { spend: 0, leads: 0, purchases: 0 });
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;
    const cpa = totals.purchases > 0 ? totals.spend / totals.purchases : null;
    const checks = [];
    if (cplGoal) checks.push(cpl != null && cpl <= cplGoal);
    if (cpaGoal) checks.push(cpa != null && cpa <= cpaGoal);
    const money = (value) => (value == null ? 'sem resultado' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    const parts = [];
    if (cplGoal) parts.push(`CPL ${money(cpl)} (meta ${money(cplGoal)})`);
    if (cpaGoal) parts.push(`CPA ${money(cpa)} (meta ${money(cpaGoal)})`);
    return { label: client.empresa, ok: checks.every(Boolean), detail: `${parts.join(' · ')} · ${reviews.length} semana(s)` };
  }).filter(Boolean);
  list.push(percentIndicator(
    { key: 'cpl_cpa', layer: 'resultado', label: 'Clientes dentro da meta de CPL/CPA', how: 'Investimento ÷ mensagens (CPL) e ÷ compras (CPA) das revisões semanais finalizadas no mês, contra as metas do cadastro do cliente.' },
    costItems,
    { emptyReason: 'Nenhum cliente da carteira tem meta de CPL ou CPA no cadastro.' },
  ));

  const funnelItems = [...carteira].map((clientId) => {
    const client = ctx.clientsById.get(clientId);
    const goal = ctx.goalsByClient.get(clientId);
    if (!client || !goal || (goal.leads_goal == null && goal.agendamentos_goal == null && goal.vendas_goal == null)) return null;
    const config = ctx.miniCrmByClient.get(clientId);
    const appointmentKeys = new Set(appointmentStatusKeys(config?.statuses || []));
    const cohort = ctx.crmContacts.filter((contact) => contact.cliente_id === clientId
      && inMonth(spDay(contact.first_seen_at), ctx.month)
      && /^(Meta Ads|Google Ads)/.test(origemDoContato(contact)));
    const sold = (contact) => contact.comprou === true || isSoldMiniStatus(contact.mini_crm?.status);
    const leads = cohort.length;
    const agendamentos = cohort.filter((contact) => sold(contact) || appointmentKeys.has(contact.mini_crm?.status) || appointmentDay(contact.mini_crm, config?.columns || [])).length;
    const vendas = cohort.filter(sold).length;
    const checks = [];
    const parts = [];
    if (goal.leads_goal != null) { checks.push(leads >= goal.leads_goal); parts.push(`${leads}/${goal.leads_goal} leads`); }
    if (goal.agendamentos_goal != null) { checks.push(agendamentos >= goal.agendamentos_goal); parts.push(`${agendamentos}/${goal.agendamentos_goal} agendamentos`); }
    if (goal.vendas_goal != null) { checks.push(vendas >= goal.vendas_goal); parts.push(`${vendas}/${goal.vendas_goal} vendas`); }
    return { label: client.empresa, ok: checks.every(Boolean), detail: parts.join(' · ') };
  }).filter(Boolean);
  list.push(percentIndicator(
    { key: 'funil_meta', layer: 'resultado', label: 'Leads → agendamento → venda contra a meta', how: 'Leads de anúncio que chegaram no mês, quantos agendaram e quantos compraram (Rastreamento e Mini CRM), contra a meta do mês de cada cliente.' },
    funnelItems,
    { emptyReason: 'Nenhum cliente da carteira tem meta de funil neste mês.' },
  ));
  return list;
}

export const REWORK_REASONS = {
  falha_captacao: 'Falha de captação',
  pedido_cliente: 'Pedido do cliente',
  outro: 'Outro motivo',
};

const BY_PROFILE = {
  gestao: gestaoIndicators,
  design: designIndicators,
  roteiro_gravacao: roteiroIndicators,
  edicao: edicaoIndicators,
  trafego: trafegoIndicators,
};

// ---------------------------------------------------------------- entrada

function buildActivityDays(tasks, checkups, reviews) {
  const map = new Map();
  const add = (personId, value) => {
    const day = spDay(value);
    if (!personId || !day) return;
    if (!map.has(personId)) map.set(personId, new Set());
    map.get(personId).add(day);
  };
  for (const task of tasks) {
    for (const row of Array.isArray(task.status_history) ? task.status_history : []) add(row?.user_id, row?.timestamp);
    for (const row of Array.isArray(task.stage_execution_history) ? task.stage_execution_history : []) add(row?.actor_id, row?.at);
  }
  for (const row of checkups) add(row.confirmed_by, row.confirmed_at);
  for (const row of reviews) add(row.finalized_by, row.finalized_at);
  return map;
}

function oldFlowCount(ctx, person) {
  return ctx.tasks.filter((task) => !task.workflow_template_id && task.production_delivered_at
    && inMonth(spDay(task.production_delivered_at), ctx.month)
    && (Array.isArray(task.status_history) ? task.status_history : []).some((row) => personIn(row?.assignee_ids, person.id))).length;
}

export function computeCollaboratorIndicators(input) {
  const month = monthStart(input.month);
  const templatesById = new Map((input.templates || []).map((template) => [template.id, template]));
  const orders = new Map();
  const ctx = {
    month,
    today: input.today,
    tasks: input.tasks || [],
    tasksById: new Map((input.tasks || []).map((task) => [task.id, task])),
    deadlineChanges: input.deadlineChanges || [],
    projectsById: new Map((input.projects || []).map((project) => [project.id, project])),
    clientsById: new Map((input.clients || []).map((client) => [client.id, client])),
    trafficOps: input.trafficOps || [],
    reviews: input.reviews || [],
    checkups: input.checkups || [],
    publicationsByTask: (input.publications || []).reduce((map, row) => map.set(row.task_id, [...(map.get(row.task_id) || []), row]), new Map()),
    reworkEvents: input.reworkEvents || [],
    onboardingStages: input.onboardingStages || [],
    snapshots: input.snapshots || {},
    goalsByClient: new Map((input.goals || []).filter((goal) => monthStart(goal.reference_month) === month).map((goal) => [goal.client_id, goal])),
    crmContacts: input.crmContacts || [],
    miniCrmByClient: new Map((input.miniCrmConfigs || []).map((config) => [config.cliente_id, config])),
    orderFor(task) {
      if (!orders.has(task.workflow_template_id)) orders.set(task.workflow_template_id, templateOrder(templatesById.get(task.workflow_template_id)));
      return orders.get(task.workflow_template_id);
    },
  };
  ctx.activityDays = buildActivityDays(ctx.tasks, ctx.checkups, ctx.reviews);

  return (input.people || [])
    .filter((person) => person.indicator_profile && person.indicator_profile !== 'nenhum')
    .map((person) => {
      const own = BY_PROFILE[person.indicator_profile]?.(ctx, person) || [];
      const all = [planejeUpdated(ctx, person), overdueAtClose(ctx, person), ...own];
      const layers = Object.fromEntries(LAYERS.map((layer) => [layer.key, all.filter((item) => item.layer === layer.key)]));
      return { person, layers, oldFlowDeliveries: oldFlowCount(ctx, person) };
    });
}
