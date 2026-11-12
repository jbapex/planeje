import { selectMetaHistory, previousMetaPeriod } from '../gestor-ia-meta/history.js';
import { campaignObjectiveKey } from '../../../src/lib/trafegoObjetivo.js';
import { ZERO_SPEND } from '../../../src/lib/trafegoProximaAcao.js';
import { DECISION_OUTCOME_METRICS, decisionActionValue, decisionAmount } from '../../../src/components/gestor-ia/gestorIaDecisionOutcomeModel.js';
import { agendaClosedPeriod, readAgendaAdEvidence } from './agendaCreative.js';

const DAY = 86400000;
const shift = (day, offset) => new Date(Date.parse(day) + offset * DAY).toISOString().slice(0, 10);
const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && shift(value, 0) === value;
const resultKeys = { leads: 'leads', mensagens: 'messages', compras: 'purchases', trafego: 'landingPageViews', engajamento: 'postEngagements' };
const ranks = { sem_resultado: 0, corte: 0, verba: 1, criativo: 2, custo: 2, escala: 3 };
const currentRow = (campaign) => campaign?.insights?.data?.[0];
const roundMoney = (value) => Math.round(value * 100) / 100;
const firstAction = (row, types) => types.find((type) => decisionActionValue(row, type) !== null);
const monthDays = (day) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
const sourceName = (name, fallback) => Array.from(String(name || '').replace(/[\p{C}\s]+/gu, ' ').trim()).slice(0, 140).join('') || fallback;

function campaignGoal(goals, id, objective) {
  const selected = goals.find((goal) => goal.scope === 'campaigns' && goal.campaign_ids?.includes(id)) ||
    goals.find((goal) => goal.scope === 'objective' && goal.objective === objective) || goals.find((goal) => goal.scope === 'account');
  return selected?.objective === objective && selected.cost_cents > 0 ? selected : null;
}

function pacingOpportunity(history, closed, goal) {
  if (!closed || !Number.isSafeInteger(goal.budget_cents) || goal.budget_cents <= 0) return null;
  const until = closed.until;
  const since = `${until.slice(0, 7)}-01`;
  const elapsed = Number(until.slice(-2));
  const remaining = monthDays(until) - elapsed;
  if (since < history.period.since || elapsed < 3 || remaining < 1) return null;
  const daily = new Map();
  for (const row of history.accountDays) {
    if (row.date_start < since || row.date_start > until) continue;
    const spend = decisionAmount(row.spend);
    if (!validDay(row.date_start) || row.account_currency !== 'BRL' || spend === null || daily.has(row.date_start)) return null;
    daily.set(row.date_start, spend);
  }
  if (daily.size !== elapsed) return null;
  const spend = roundMoney([...daily.values()].reduce((sum, amount) => sum + amount, 0));
  const recentSpend = roundMoney(daily.get(closed.since) + daily.get(shift(until, -1)) + daily.get(until));
  const projectedCents = Math.round((spend + recentSpend / 3 * remaining) * 100);
  const budget = goal.budget_cents / 100;
  if (!Number.isSafeInteger(projectedCents) || Math.abs(projectedCents - goal.budget_cents) < Math.ceil(goal.budget_cents / 20)) return null;
  return { id: 'conta', name: sourceName(goal.name, 'Meta da conta'), objective: goal.objective, currency: 'BRL', period: { since, until },
    metrics: { spend, recentSpend, projectedSpend: projectedCents / 100, budget }, options: { verba: ['spend','recentSpend','projectedSpend','budget'] } };
}

export function buildAgendaDecisions(job) {
  const { history, account_day, fetched_at, categories, goals = [] } = job;
  const fetched = Date.parse(fetched_at);
  if (!validDay(account_day) || !validDay(history?.period?.since) || !validDay(history.period.until) ||
    !Number.isFinite(fetched) || fetched < Date.parse(account_day) - 3 * DAY) return { state: 'no_data', rows: [] };
  const yesterday = shift(account_day, -1);
  const until = history.period.until < yesterday ? history.period.until : yesterday;
  if (until < shift(account_day, -2)) return { state: 'no_data', rows: [] };
  const period = { since: shift(until, -2), until };
  const earlier = previousMetaPeriod(period);
  const totalSource = history.campaignPartial === false && Array.isArray(history.campaignDays);
  const source = totalSource ? { ...history, adDays: [] } : { ...history, campaignDays: [] };
  const recent = selectMetaHistory(source, period);
  if (!recent?.exact || !recent.accountRows.length) return { state: 'no_data', rows: [] };
  const search = categories.includes('descoberta') && totalSource;
  const prior = search || categories.includes('custo') ? selectMetaHistory(source, earlier) : null;
  const priorCampaigns = new Map((prior?.exact ? prior.campaigns : []).map((row) => [row.id, row]));
  const searchDays = new Map();
  if (search && prior?.exact && !prior.campaignMetricsPartial && !recent.campaignMetricsPartial) {
    for (const row of history.campaignDays) {
      if (row.date_start < earlier.since || row.date_start > period.until) continue;
      if (!searchDays.has(row.campaign_id)) searchDays.set(row.campaign_id, []);
      searchDays.get(row.campaign_id).push(row);
    }
  }
  const rows = [];
  const closed = agendaClosedPeriod(job, until);
  const { warnings: adWarnings, discoveries: adDiscoveries } = readAgendaAdEvidence(job, closed, (id, objective) => campaignGoal(goals, id, objective)?.cost_cents / 100);
  const discoveries = new Map(adDiscoveries.map((item) => [item.id, item]));
  const add = (kind, title, detail, sourceName, currency, window, values, measurement, id, extra = {}) => rows.push({
    key: `${kind}:${id}`, title,
    payload: { detail, source: sourceName, period: window, currency, syncedAt: fetched_at, measurement, rank: ranks[kind], kind,
      evidence: Object.entries(values).map(([key, value]) => ({ key, value })), ...extra },
  });
  const cuts = new Set(adWarnings.filter(({ kind }) => kind === 'corte').map(({ id }) => id));
  for (const { id, kind, source: name, period: window, currency, values, measurement, entityEvidence, comparisonPeriod } of adWarnings) {
    const cut = kind === 'corte';
    const detail = cut ? `Em cada um dos três dias, os itens sinalizados tiveram gasto com zero resultado medido${values.target ? ' ou custo acima de 1,5× o alvo' : ''}.`
      : 'Os anúncios sinalizados tiveram frequência de pelo menos 2 no último dia fechado e queda de pelo menos 30% no CTR de link entre os dois recortes.';
    add(kind, cut ? 'Revisar candidatas a corte' : 'Investigar fadiga de criativo', detail,
      name, currency, window, values, measurement, id, { entityEvidence, ...(comparisonPeriod && { comparisonPeriod }),
        days: 7, verification: 'Compare custo e volume da campanha após a revisão dos itens sinalizados.' });
  }

  if (!recent.campaignMetricsPartial) for (const campaign of recent.campaigns) {
    const { id } = campaign;
    if (typeof id !== 'string' || !/^\d{1,32}$/.test(id)) continue;
    const objective = campaignObjectiveKey(campaign.objective);
    const metric = DECISION_OUTCOME_METRICS[objective];
    const row = currentRow(campaign);
    if (!metric || !row || !/^[A-Z]{3}$/.test(row.account_currency || '')) continue;
    const spend = decisionAmount(row.spend);
    const action = firstAction(row, metric.actions);
    if (spend === null || !action) continue;
    const value = decisionActionValue(row, action);
    const money = row.account_currency;
    const name = Array.from(String(campaign.name || '').trim()).slice(0, 140).join('') || `Campanha ${id}`;
    const resultKey = resultKeys[objective];
    const measurement = { campaignId: id, objective };
    const active = (campaign.effective_status || campaign.status) === 'ACTIVE';
    const old = currentRow(priorCampaigns.get(id));
    const previousResult = decisionActionValue(old, action);
    const oldSpend = decisionAmount(old?.spend);
    const days = searchDays.get(id);
    if (!discoveries.has(id) && active && days && spend > 0 && oldSpend > 0 && previousResult >= 3 && firstAction(old, metric.actions) === action &&
      new Set(days.map(({ date_start }) => date_start)).size === days.length && days.every((daily) => daily.account_currency === money &&
        decisionAmount(daily.spend) !== null && firstAction(daily, metric.actions) === action)) {
      const cost = value > 0 ? roundMoney(spend / value) : null;
      const previousCost = roundMoney(oldSpend / previousResult);
      const metrics = { spend: roundMoney(spend), previousSpend: roundMoney(oldSpend), [resultKey]: value, previousResults: previousResult,
        ...(cost !== null && { cost }), previousCost };
      const volume = [resultKey, 'previousResults'];
      const options = {};
      if (value < previousResult) options.entrega = [...volume, 'spend', 'previousSpend'];
      if (value >= 3 && cost > previousCost && categories.includes('custo')) options.custo = ['cost', 'previousCost', ...volume];
      const goal = money === 'BRL' && campaignGoal(goals, id, objective);
      if (value >= previousResult && cost > 0 && cost < previousCost && categories.includes('escala') && (!goal || cost <= goal.cost_cents / 100)) {
        options.escala = ['cost', 'previousCost', ...volume];
      }
      if (Object.keys(options).length && Object.values(metrics).every((number) => Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER)) {
        discoveries.set(id, { id, name, objective, currency: money, period, comparisonPeriod: earlier, metrics, options });
      }
    }
    if (!cuts.has(id) && money === 'BRL' && spend >= ZERO_SPEND && value === 0 && ['leads', 'mensagens', 'compras'].includes(objective)) {
      const messageCounts = DECISION_OUTCOME_METRICS.mensagens.actions.map((type) => decisionActionValue(row, type));
      if (objective !== 'leads' || (messageCounts.includes(0) && !messageCounts.some((count) => count > 0))) {
        add('sem_resultado', 'Revisar gasto sem resultado', 'O recorte salvo registrou gasto e zero resultado medido. Confira a campanha e a medição antes de decidir.',
          name, money, period, { spend, [resultKey]: value }, measurement, id);
      }
    }
    if (value < 3 || spend <= 0) continue;
    const cost = spend / value;
    if (categories.includes('custo') && !cuts.has(id) && !prior?.campaignMetricsPartial && old?.account_currency === money && previousResult >= 3 && oldSpend > 0 && cost >= 1.3 * oldSpend / previousResult) {
      add('custo', 'Investigar alta no custo por resultado', `O custo subiu pelo menos 30% frente aos três dias de ${earlier.since} a ${earlier.until}. Confira a mudança antes de ajustar a campanha.`,
        name, money, period, { cost: roundMoney(cost), previousCost: roundMoney(oldSpend / previousResult), [resultKey]: value }, measurement, id);
    }
    const goal = active && money === 'BRL' && value >= 5 && categories.includes('escala') ? campaignGoal(goals, id, objective) : null;
    if (goal && cost <= goal.cost_cents / 100 * 0.8) {
      add('escala', 'Avaliar espaço para escala', 'O custo ficou pelo menos 20% abaixo do alvo com cinco ou mais resultados. Confira a verba e a capacidade de atendimento.',
        name, money, period, { cost: roundMoney(cost), target: goal.cost_cents / 100, [resultKey]: value }, measurement, id);
    }
  }

  // A verba da conta só é comparável com a meta geral que cobre toda a conta.
  const budgetGoal = categories.includes('verba') && goals.every(({ scope }) => scope === 'account') ? goals.find(({ budget_cents }) => budget_cents > 0) : null;
  if (budgetGoal) {
    const month = { since: `${until.slice(0, 7)}-01`, until };
    const days = Number(until.slice(-2));
    const saved = selectMetaHistory({ ...history, adDays: [], campaignDays: [] }, month);
    const total = saved?.exact ? saved.accountRows[0] : null;
    const spend = decisionAmount(total?.spend);
    const budget = budgetGoal.budget_cents / 100;
    if (days >= 3 && total?.account_currency === 'BRL' && spend !== null) {
      const monthLength = monthDays(until);
      const projectedSpend = roundMoney(spend / days * monthLength);
      if (spend > budget || (days < monthLength && projectedSpend >= 1.1 * budget)) {
        add('verba', 'Conferir ritmo da verba do mês', 'O investimento registrado ou a projeção pela média do mês ultrapassa a verba da meta geral da conta.',
          String(budgetGoal.name || 'Meta da conta').slice(0, 140), 'BRL', month, { spend, projectedSpend, budget }, { objective: budgetGoal.objective }, 'conta');
      }
    }
  }
  const warned = new Set(rows.map(({ payload }) => payload.measurement.campaignId || 'conta'));
  const pacing = budgetGoal && goals.length === 1 && categories.includes('descoberta') && !warned.has('conta') ? pacingOpportunity(history, closed, budgetGoal) : null;
  const weight = ({ metrics }) => Math.max(metrics.spend, metrics.previousSpend ?? 0);
  const opportunities = [...discoveries.values()].filter(({ id }) => !warned.has(id))
    .sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id)).slice(0, pacing ? 5 : 6);
  if (pacing) opportunities.push(pacing);
  return { state: 'read', rows: rows.sort((a, b) => a.payload.rank - b.payload.rank || a.key.localeCompare(b.key)).slice(0, 3),
    ...(opportunities.length && { discoveries: opportunities }) };
}

export async function runGestorAgenda(db) {
  const { data: job, error } = await db.rpc('gestor_ia_agenda_pendente');
  if (error) throw new Error('Não foi possível consultar a agenda de decisões.');
  if (!job) return false;
  const { state, rows, discoveries } = buildAgendaDecisions(job);
  const { data: saved, error: saveError } = await db.rpc(discoveries ? 'gestor_ia_agenda_concluir_com_busca' : 'gestor_ia_agenda_concluir', {
    p_id: job.id, p_revision: job.revision, p_day: job.day, p_fetched_at: job.fetched_at, p_state: state, p_rows: rows,
    ...(discoveries && { p_candidates: discoveries }),
  });
  if (saveError) throw new Error('Não foi possível registrar a leitura da agenda.');
  return saved === true;
}
