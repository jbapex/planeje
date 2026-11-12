import { requiredCountFields } from './trafficSheetLayout.js';

export const WEEKDAYS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
export function weekdayShort(n) {
  return WEEKDAY_SHORT[Number(n) - 1] || '';
}

export function saoPauloDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function shiftDate(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function lastClosedWeek(today = saoPauloDate()) {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  return shiftDate(today, -(day - 1) - 7);
}
export function displayDate(ymd) {
  if (!ymd) return 'Sem prazo';
  if (String(ymd).includes('T')) ymd = saoPauloDate(new Date(ymd));
  return String(ymd).slice(0, 10).split('-').reverse().join('/');
}
export function displayDay(ymd) {
  const full = displayDate(ymd);
  return /^\d{2}\/\d{2}\/\d{4}$/.test(full) ? full.slice(0, 5) : full;
}
export function displayStamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayDate(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(',', ' às');
}

/** Selo da cadência na lista da Rotina. Off não renderiza — evita repetir Desligada. */
export function routineCadenceLook({ records = [], enabled, nextDue, weekday, today, kind = 'review' } = {}) {
  const optimization = kind === 'optimization';
  const tag = optimization ? 'Otimização' : 'Análise';
  if (records.length) {
    const review = records[0];
    const state = reviewState(review, today);
    const due = displayDay(review.task_due_date);
    const filled = review.revision > 0 && review.updated_at ? `alterada ${displayDay(review.updated_at)}` : '';
    return {
      tag,
      title: state.overdue ? 'Atrasada' : optimization ? 'Conferir' : 'Revisar',
      detail: filled ? `${due} · ${filled}` : due,
      tone: state.overdue ? 'late' : 'open',
      review,
      extra: records.length > 1 ? records.length - 1 : 0,
    };
  }
  if (enabled && nextDue) {
    return {
      tag,
      title: nextDue === today ? 'Hoje' : weekdayShort(weekday) || 'Ligada',
      detail: displayDay(nextDue),
      tone: nextDue === today ? 'today' : 'scheduled',
      review: null,
      extra: 0,
    };
  }
  return null;
}

export const ROUTINE_SHELVES = [
  { id: 'late', title: 'Atrasadas', hint: 'O prazo já passou' },
  { id: 'open', title: 'Para fazer', hint: 'Abertas e ainda no prazo' },
  { id: 'next', title: 'Próximas', hint: 'Ainda não venceu' },
  { id: 'off', title: 'Desligadas', hint: 'Sem análise nem otimização' },
];

function cadenceDue(look) {
  return look?.tone === 'late' && look.review?.task_due_date ? look.review.task_due_date : '';
}

/** Onde o cliente fica na Rotina: atrasado, aberto, só programado ou desligado. */
export function routinePlace(client, today) {
  const analysis = routineCadenceLook({
    records: client?.pending || [],
    enabled: client?.settings?.enabled,
    nextDue: client?.next_due_on,
    weekday: client?.settings?.review_weekday,
    today,
    kind: 'review',
  });
  const optimization = routineCadenceLook({
    records: client?.optimizations || [],
    enabled: client?.settings?.optimization_enabled,
    nextDue: client?.next_optimization_due_on,
    weekday: client?.settings?.optimization_weekday,
    today,
    kind: 'optimization',
  });
  const late = analysis?.tone === 'late' || optimization?.tone === 'late';
  const open = analysis?.tone === 'open' || optimization?.tone === 'open';
  const shelf = late ? 'late' : open ? 'open' : (analysis || optimization) ? 'next' : 'off';
  const due = [cadenceDue(analysis), cadenceDue(optimization)].filter(Boolean).sort()[0] || '9999-99-99';
  return { client, analysis, optimization, shelf, due };
}

function matchesLocate(item, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'review') return item.analysis?.tone === 'late' || item.analysis?.tone === 'open';
  if (filter === 'optimization') return item.optimization?.tone === 'late' || item.optimization?.tone === 'open';
  return item.shelf === filter;
}

/** Agrupa a lista da Rotina para achar atrasado, análise e otimização sem misturar tudo. */
export function groupRoutineClients(rows, today, filter = 'all') {
  const placed = (rows || []).map((client) => routinePlace(client, today));
  const counts = {
    all: placed.length,
    late: placed.filter((item) => item.shelf === 'late').length,
    review: placed.filter((item) => matchesLocate(item, 'review')).length,
    optimization: placed.filter((item) => matchesLocate(item, 'optimization')).length,
  };
  const shelves = ROUTINE_SHELVES.map((shelf) => {
    const items = placed
      .filter((item) => item.shelf === shelf.id && matchesLocate(item, filter))
      .sort((a, b) => (shelf.id === 'late' ? a.due.localeCompare(b.due) : 0) || a.client.empresa.localeCompare(b.client.empresa, 'pt-BR'));
    return { ...shelf, items };
  }).filter((shelf) => shelf.items.length);
  return { placed, shelves, counts };
}

export function displayWeek(start) { return `${displayDate(start)} a ${displayDate(shiftDate(start, 6))}`; }
export function currency(value) { return value == null ? 'Não informado' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function metricNumber(value, integer = false) {
  if (value == null || String(value).trim() === '') return null;
  let text = String(value).trim();
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return NaN;
  const parsed = Number(text);
  return Number.isFinite(parsed) && (!integer || Number.isInteger(parsed)) ? parsed : NaN;
}
export function reviewMetrics(review) {
  const number = (x) => x == null || !Number.isFinite(Number(x)) ? null : Number(x);
  const spend = number(review.investment);
  const contacts = number(review.contacts);
  const results = number(review.results);
  return { costPerResult: spend != null && results > 0 ? spend / results : null,
    conversionRate: contacts > 0 && results != null ? results / contacts * 100 : null };
}
export function reviewState(review, today = saoPauloDate()) {
  const optimization = review.kind === 'optimization';
  if (review.finalized_at) return { label: optimization ? 'Otimização conferida' : 'Revisada', tone: 'done', overdue: false };
  if (review.task_due_date && review.task_due_date < today) return { label: optimization ? 'Otimização atrasada' : 'Revisão atrasada', tone: 'late', overdue: true };
  if (optimization) return { label: 'Conferir campanhas', tone: 'pending', overdue: false };
  return { label: review.revision > 0 ? 'Em revisão' : 'Revisar semana', tone: 'pending', overdue: false };
}
export function reviewDraft(review, preferCampaign = false) {
  const mode = preferCampaign && !review.revision && review.investment == null && review.contacts == null ? 'campaign' : review.metric_mode || 'client';
  return { kind: review.kind || 'review', metric_mode: mode, campaign_metrics: (review.campaign_metrics || []).map(campaignDraft),
    investment: review.investment == null ? '' : String(review.investment), contacts: review.contacts == null ? '' : String(review.contacts),
    results: review.results == null ? '' : String(review.results), analysis: review.analysis || '', data_note: review.data_note || '',
    action_mode: review.action_mode || 'undecided', action_task_id: review.action_task_id || '',
    action_draft: { title: '', due_date: '', assignee_id: '', ...review.action_draft } };
}
export function reviewPayload(draft) {
  const clientMode = draft.kind !== 'optimization' && draft.metric_mode !== 'campaign';
  return { ...draft, investment: clientMode ? metricNumber(draft.investment) : null, contacts: clientMode ? metricNumber(draft.contacts, true) : null, results: clientMode ? metricNumber(draft.results, true) : null,
    campaign_metrics: (clientMode ? [] : draft.campaign_metrics || []).filter(hasCampaignContent).map((row) => ({ ...row, ...Object.fromEntries(CAMPAIGN_NUMBERS.map((key) => [key, draft.kind === 'optimization' ? null : metricNumber(row[key], INTEGER_CAMPAIGN_FIELDS.includes(key))])) })) };
}
export function validateReview(draft, finalize = false) {
  const data = reviewPayload(draft);
  const optimization = draft.kind === 'optimization';
  const resultLabel = draft.result_label || data.campaign_metrics.find((row) => row.conversion_label)?.conversion_label || '';
  const counts = requiredCountFields(draft.sheet_metrics, resultLabel);
  if (optimization) {
    const incomplete = data.campaign_metrics.some((r) => !r.account_id?.trim() || !r.account_name?.trim() || !r.campaign_name?.trim());
    if (incomplete && finalize) return 'Informe conta e nome das campanhas conferidas, ou remova a linha vazia.';
    if (incomplete && !finalize && data.campaign_metrics.some((r) => CAMPAIGN_NUMBERS.some((key) => Number.isNaN(r[key])))) {
      return 'Confira os números das campanhas.';
    }
  }
  if (!optimization && data.metric_mode === 'campaign') {
    if (finalize && !data.campaign_metrics.length) return 'Adicione uma campanha ou use o resumo do cliente.';
    const seen = new Set();
    for (const row of data.campaign_metrics) {
      const label = (row.conversion_label || resultLabel || '').trim();
      const incomplete = !row.account_id?.trim() || !row.account_name?.trim() || !row.campaign_name?.trim() || !label;
      if (CAMPAIGN_NUMBERS.some((key) => Number.isNaN(row[key]))) return 'Confira os números das campanhas.';
      if (incomplete) {
        if (finalize) return 'Informe conta, campanha e o resultado que esta conta acompanha.';
        continue;
      }
      const identity = `${row.platform}:${row.account_id.trim()}:${(row.campaign_id || row.campaign_name).trim()}:${(row.adset_id || row.adset_name || '').trim()}`.toLowerCase();
      if (seen.has(identity)) return 'Esta campanha já foi incluída. Não repita o investimento.';
      seen.add(identity);
      if (finalize && (row.spend == null || counts.some((key) => row[key] == null))) return 'Confira gasto e os resultados desta planilha.';
    }
  } else if (!optimization) {
    if ([data.investment, data.contacts, data.results].some((x) => Number.isNaN(x) || (x != null && x < 0))) return 'Confira os números; contatos e resultados devem ser inteiros.';
    if (data.results != null && data.contacts != null && data.results > data.contacts) return 'Conte os contatos da semana que atingiram o objetivo; o total não pode superar os contatos.';
    if (finalize && (data.investment == null || data.contacts == null)) return 'Informe investimento, contatos, análise e próxima ação.';
  }
  if (finalize && (!data.analysis.trim() || data.action_mode === 'undecided')) return 'Informe a análise e a próxima ação.';
  if (finalize && data.action_mode === 'link' && !data.action_task_id) return 'Escolha a tarefa da próxima ação.';
  if (finalize && data.action_mode === 'create' && (!data.action_draft.title.trim() || !data.action_draft.due_date || !data.action_draft.assignee_id)) return 'A próxima ação precisa de título, responsável e prazo.';
  return '';
}
export const REVIEW_AUTOSAVE_MS = 500;

/** Rota da ficha aberta (cliente + semana + tipo). Mantém ?review= quando já existe id. */
export function buildRoutineSheetUrl({
  clientId,
  weekStart,
  kind = 'review',
  reviewId,
  assistant,
} = {}) {
  const params = new URLSearchParams();
  if (clientId) params.set('cliente', clientId);
  if (weekStart) params.set('semana', weekStart);
  if (kind === 'optimization') params.set('tipo', 'optimization');
  if (reviewId) params.set('review', reviewId);
  // Não apagar o Assistente de Tráfego ao regravar a rota da ficha
  if (assistant) params.set('assistant', assistant);
  const query = params.toString();
  return query ? `/paid-traffic/rotina?${query}` : '/paid-traffic/rotina';
}
export function reviewDraftSignature(draft) {
  return JSON.stringify(draft);
}
/** Rascunho (finalize falso) enquanto a pessoa digita. Não conclui a semana. */
export function reviewAutosavePlan({ draft, savedSignature, readonly = false, finalize = false } = {}) {
  if (readonly) return { action: 'skip', reason: 'readonly' };
  const signature = reviewDraftSignature(draft);
  if (!finalize && signature === savedSignature) return { action: 'skip', reason: 'clean', signature };
  const invalid = validateReview(draft, finalize);
  if (invalid) return { action: 'wait', reason: invalid, signature };
  return { action: 'save', reason: '', signature, finalize: Boolean(finalize) };
}
export function reviewAutosaveLabel(state, detail = '') {
  if (state === 'pending') return 'Salvando em instantes…';
  if (state === 'saving') return 'Salvando…';
  if (state === 'saved') return 'Salvo';
  if (state === 'wait') return detail ? `Ainda não gravou: ${detail}` : 'Ainda não gravou';
  if (state === 'error') return detail ? `Falha ao salvar: ${detail}` : 'Não gravou';
  return '';
}
const REVIEW_CHANGE_GAP_MS = 15 * 60 * 1000;
function reviewSnapshotFilled(row) {
  if (!row) return false;
  if (String(row.analysis || '').trim() || String(row.data_note || '').trim()) return true;
  if (row.investment != null || row.contacts != null || row.results != null) return true;
  return (row.campaign_metrics || []).some((item) => String(item?.campaign_name || item?.adset_name || '').trim());
}
export function reviewChangeLabels(before, after) {
  const labels = [];
  if (String(before?.analysis || '') !== String(after?.analysis || '')) labels.push('análise');
  if (String(before?.data_note || '') !== String(after?.data_note || '')) labels.push('observações');
  if (before?.investment !== after?.investment || before?.contacts !== after?.contacts || before?.results !== after?.results) labels.push('números');
  if (JSON.stringify(before?.campaign_metrics || []) !== JSON.stringify(after?.campaign_metrics || [])) labels.push('campanhas');
  if ((before?.action_mode || '') !== (after?.action_mode || '')) labels.push('próximo passo');
  if ((before?.ai_suggestion || '') !== (after?.ai_suggestion || '')) labels.push('sugestão da IA');
  if (!before?.finalized_at && after?.finalized_at) labels.push('concluída');
  if (before?.finalized_at && !after?.finalized_at) labels.push('reaberta');
  return labels;
}
/** Agrupa rajadas de rascunho e separa o dia em que foi escrito da semana dos anúncios. */
export function reviewFillView(events = [], { review = null, live = null, names = {} } = {}) {
  const ordered = [...events].filter((event) => event?.occurred_at).sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || Number(a.id) - Number(b.id));
  const groups = [];
  for (const event of ordered) {
    const after = event.snapshot?.after;
    if (!after) continue;
    const at = new Date(event.occurred_at).getTime();
    const actorId = event.actor_id || '';
    const actorType = event.actor_type === 'ia' ? 'ia' : 'pessoa';
    const actorName = event.actor?.full_name || names[actorId] || '';
    const last = groups.at(-1);
    const burst = last && event.event === 'draft' && last.event === 'draft' && last.actorId === actorId && last.actorType === actorType && at - last.endMs <= REVIEW_CHANGE_GAP_MS;
    if (burst) {
      last.endMs = at;
      last.endAt = event.occurred_at;
      last.after = after;
    } else {
      groups.push({
        id: event.id, event: event.event, actorId, actorName, actorType, startAt: event.occurred_at, endAt: event.occurred_at, endMs: at,
        before: event.snapshot?.before || null, after,
      });
    }
  }
  let entries = groups.map((group) => ({
    id: group.id,
    event: group.event,
    actorId: group.actorId,
    actorName: group.actorName,
    actorType: group.actorType,
    startAt: group.startAt,
    endAt: group.endAt,
    labels: reviewChangeLabels(group.before, group.after),
    filled: reviewSnapshotFilled(group.after),
  })).filter((entry) => entry.filled || entry.labels.length || entry.event === 'finalized');
  if (live?.at) {
    const liveMs = new Date(live.at).getTime();
    const same = [...entries].reverse().find((entry) => entry.event === 'draft' && entry.actorType !== 'ia' && entry.actorName === live.name && liveMs - new Date(entry.endAt).getTime() <= REVIEW_CHANGE_GAP_MS && liveMs >= new Date(entry.startAt).getTime() - REVIEW_CHANGE_GAP_MS);
    if (same) {
      if (liveMs > new Date(same.endAt).getTime()) same.endAt = live.at;
    } else {
      entries = [...entries, { id: 'live', event: 'draft', actorId: '', actorName: live.name || '', startAt: live.at, endAt: live.at, labels: ['gravação'], filled: true }];
    }
  }
  const nameOf = (entry) => entry?.actorType === 'ia' ? `IA (Neuro)${entry.actorName ? ` · em nome de ${entry.actorName}` : ''}` : entry?.actorName || names[entry?.actorId] || (entry?.actorId ? 'Integrante da equipe' : 'Rotina automática');
  const first = entries.find((entry) => entry.filled);
  const last = [...entries].reverse().find((entry) => entry.filled || entry.event === 'finalized') || null;
  let headline = 'Ainda não preenchido.';
  if (first) {
    headline = `Preenchido em ${displayStamp(first.startAt)} · ${nameOf(first)}`;
    if (last && last.id !== first.id) headline += ` · alterado em ${displayStamp(last.endAt)}`;
  } else if (review?.revision > 0 && review.updated_at) {
    headline = `Última gravação em ${displayStamp(review.updated_at)}`;
  }
  const lines = [...entries].reverse().slice(0, 8).map((entry) => {
    const when = displayStamp(entry.startAt) === displayStamp(entry.endAt) ? displayStamp(entry.startAt) : `${displayStamp(entry.startAt)} até ${displayStamp(entry.endAt)}`;
    const what = entry.labels.length ? entry.labels.join(', ') : 'gravação';
    return { id: entry.id, text: `${when} · ${nameOf(entry)} · ${what}` };
  });
  return { headline, lines, filledAt: first?.startAt || null };
}
export function routineRows(board, { userId, mine = false, search = '', includeHistory = false } = {}) {
  const reviews = board.reviews || [];
  return (board.clients || []).map((client) => ({ ...client,
    pending: reviews.filter((r) => r.client_id === client.id && !r.finalized_at && r.kind !== 'optimization').sort((a, b) => String(a.task_due_date).localeCompare(String(b.task_due_date))),
    optimizations: reviews.filter((r) => r.client_id === client.id && !r.finalized_at && r.kind === 'optimization').sort((a, b) => String(a.task_due_date).localeCompare(String(b.task_due_date))),
    actions: reviews.filter((r) => r.client_id === client.id && r.action_task_id && !r.action_completed),
    lastReview: reviews.find((r) => r.client_id === client.id && r.finalized_at && r.kind !== 'optimization'),
  })).map((c) => ({ ...c, next_due_on: c.next_due_on && reviews.some((r) => r.client_id === c.id && r.kind !== 'optimization' && r.finalized_at && r.task_due_date === c.next_due_on) ? shiftDate(c.next_due_on, 7) : c.next_due_on }))
    .filter((c) => (includeHistory || c.eligible !== false || c.pending.length > 0 || c.optimizations.length > 0 || c.actions.length > 0)
    && (!mine || c.manager_id === userId || [...c.pending, ...c.optimizations].some((r) => r.assignee_ids?.includes(userId)) || c.actions.some((r) => r.action_assignee_ids?.includes(userId))
      || (includeHistory && reviews.some((r) => r.client_id === c.id && r.assignee_ids?.includes(userId))))
    && c.empresa.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => Number(Boolean(b.issues?.length)) - Number(Boolean(a.issues?.length)) || Number(b.pending.length + b.optimizations.length > 0) - Number(a.pending.length + a.optimizations.length > 0) || a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

function weekdayOr(value, fallback) {
  const n = Number(value);
  return n >= 1 && n <= 5 ? n : fallback;
}

/** Monta o que a Rotina grava ao ligar análise/otimização em clientes escolhidos. Não liga a carteira inteira. */
export function automaticRoutineDrafts({
  clients = [],
  selectedIds = [],
  reviewEnabled = true,
  reviewWeekday = 1,
  optimizationEnabled = true,
  optimizationWeekday = 3,
  today = '',
  fallbackAssignee = null,
} = {}) {
  const ids = new Set((selectedIds || []).map(String));
  return (clients || [])
    .filter((client) => ids.has(String(client.id)) && client.eligible !== false)
    .map((client) => {
      const assignee = client.manager_id || fallbackAssignee || null;
      return {
        clientId: client.id,
        empresa: client.empresa,
        enabled: Boolean(reviewEnabled),
        weekday: weekdayOr(reviewWeekday, 1),
        starts_on: client.settings?.starts_on || today,
        result_label: client.settings?.result_label || 'Agendamentos',
        assignee,
        optimization_enabled: Boolean(optimizationEnabled),
        optimization_weekday: weekdayOr(optimizationWeekday, 3),
        missingAssignee: !assignee,
      };
    });
}

export function automaticRoutineError(drafts, { reviewEnabled, optimizationEnabled } = {}) {
  if (!drafts.length) return 'Escolha pelo menos um cliente.';
  if (!reviewEnabled && !optimizationEnabled) return 'Ligue a análise, a otimização, ou as duas.';
  if (drafts.some((item) => item.missingAssignee)) {
    return 'Defina o gestor de tráfego dos clientes escolhidos, ou um responsável neste diálogo.';
  }
  return '';
}

export const INTEGER_CAMPAIGN_FIELDS = ['calls', 'messages', 'appointments', 'simulacoes', 'cpf_bom', 'compras', 'orcamentos', 'lead_qualificado'];
export const CAMPAIGN_NUMBERS = ['spend', 'conversions', 'calls', 'daily_budget', 'cpc', 'messages', 'appointments', 'target_message_cost', 'conversion_value', 'simulacoes', 'cpf_bom', 'compras', 'orcamentos', 'lead_qualificado'];
export function hasCampaignContent(row) {
  return ['campaign_name', 'adset_name', 'campaign_id', 'adset_id', ...CAMPAIGN_NUMBERS].some((key) => String(row[key] ?? '').trim() !== '');
}
export function campaignDraft(row = {}) {
  return { id: row.id || crypto.randomUUID(), platform: 'meta', account_link_id: '', account_id: '', account_name: '', campaign_id: '', campaign_name: '', adset_id: '', adset_name: '', conversion_label: '',
    ...row, ...Object.fromEntries(CAMPAIGN_NUMBERS.map((key) => [key, row[key] == null ? '' : String(row[key])])) };
}
export function campaignCost(row) {
  const spend = metricNumber(row.spend); const conversions = metricNumber(row.conversions);
  return spend != null && Number.isFinite(spend) && conversions > 0 ? spend / conversions : null;
}
export function campaignIdentity(row) {
  return `${row.platform}:${row.account_id}:${row.campaign_id || row.id}:${row.adset_id || row.adset_name || ''}`;
}
export function campaignComparison(records) {
  const weeks = records.filter((r) => r.kind !== 'optimization' && r.finalized_at && r.metric_mode === 'campaign').slice(0, 6).reverse();
  const rows = new Map();
  weeks.forEach((week) => (week.campaign_metrics || []).forEach((row) => {
    const key = `${campaignIdentity(row)}:${row.conversion_label}`;
    if (!rows.has(key)) rows.set(key, { key, ...row, weeks: {} });
    Object.assign(rows.get(key), row);
    rows.get(key).weeks[week.id] = row;
  }));
  return { weeks, rows: [...rows.values()] };
}

export function costFor(spend, count) {
  const s = metricNumber(spend); const n = metricNumber(count);
  return s != null && Number.isFinite(s) && n > 0 ? s / n : null;
}
export function campaignTotals(rows) {
  const sum = (key) => rows.length && rows.every((r) => metricNumber(r[key]) != null && Number.isFinite(metricNumber(r[key]))) ? rows.reduce((n, r) => n + metricNumber(r[key]), 0) : null;
  const spend = sum('spend');
  const totals = {
    spend,
    messages: sum('messages'),
    appointments: sum('appointments'),
    conversions: sum('conversions'),
    calls: sum('calls'),
    simulacoes: sum('simulacoes'),
    cpf_bom: sum('cpf_bom'),
    compras: sum('compras'),
    orcamentos: sum('orcamentos'),
    lead_qualificado: sum('lead_qualificado'),
    conversion_value: sum('conversion_value'),
  };
  return {
    ...totals,
    messageCost: costFor(spend, totals.messages),
    appointmentCost: costFor(spend, totals.appointments),
    conversionCost: costFor(spend, totals.conversions),
    callCost: costFor(spend, totals.calls),
    simulacoesCost: costFor(spend, totals.simulacoes),
    cpfBomCost: costFor(spend, totals.cpf_bom),
    comprasCost: costFor(spend, totals.compras),
    orcamentosCost: costFor(spend, totals.orcamentos),
    leadQualificadoCost: costFor(spend, totals.lead_qualificado),
  };
}
