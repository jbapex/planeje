import { previousMetaPeriod } from '../gestor-ia-meta/history.js';
import { campaignObjectiveKey } from '../../../src/lib/trafegoObjetivo.js';
import { ZERO_SPEND } from '../../../src/lib/trafegoProximaAcao.js';
import { DECISION_OUTCOME_METRICS, decisionActionValue, decisionAmount, decisionDayAt, decisionLinkDelivery } from '../../../src/components/gestor-ia/gestorIaDecisionOutcomeModel.js';

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const daysOf = ({ since }) => [since, shift(since, 1), shift(since, 2)];
const idOk = (id) => typeof id === 'string' && /^\d{1,32}$/.test(id);
const round = (value) => Math.round(value * 100) / 100;
const nameOf = (name, fallback) => Array.from(String(name || fallback).replace(/[\p{C}\s]+/gu, ' ').trim()).slice(0, 120).join('') || fallback;
const actionValue = (row, action) => Array.isArray(row?.actions) ? decisionActionValue(row, action) : null;

export function agendaClosedPeriod({ history, account_day, fetched_at }, until) {
  const captureDay = decisionDayAt(fetched_at, history.timezone);
  if (!captureDay) return null;
  const lastClosed = shift(captureDay, -1);
  const end = until < lastClosed ? until : lastClosed;
  const since = shift(end, -2);
  return end >= shift(account_day, -2) && since >= history.period.since ? { since, until: end } : null;
}

function sumKnown(rows, read) {
  const values = rows.map(read);
  if (!values.length || values.includes(null)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total <= Number.MAX_SAFE_INTEGER ? total : null;
}

function measuredTotals(rows, actions, currency) {
  if (rows.some((row) => row.account_currency !== currency)) return null;
  const spend = sumKnown(rows, (row) => decisionAmount(row.spend));
  if (spend === null) return null;
  const results = actions?.map((key) => sumKnown(rows, (row) => actionValue(row, key))).find((value) => value !== null) ?? null;
  return { spend: round(spend), results, cost: results > 0 ? round(spend / results) : null };
}

function badCost(buckets, actions, target, objective) {
  if (buckets.some((rows) => !rows.length)) return null;
  const source = buckets.flat();
  const action = actions.find((key) => source.every((row) => actionValue(row, key) !== null));
  if (!action) return null;
  const daily = buckets.map((rows) => measuredTotals(rows, [action], 'BRL'));
  const messaging = DECISION_OUTCOME_METRICS.mensagens.actions;
  const zeroIsMeasured = (rows) => objective !== 'leads' || rows.every((row) => {
    const counts = messaging.map((key) => actionValue(row, key));
    return counts.includes(0) && !counts.some((count) => count > 0);
  });
  if (daily.some((item, i) => !item || !item.spend || (item.results === 0 ? !zeroIsMeasured(buckets[i])
    : !(target > 0) || item.spend <= item.results * target * 1.5))) return null;
  const totals = measuredTotals(source, [action], 'BRL');
  return totals.spend >= ZERO_SPEND ? { ...totals, dailyResults: daily.map(({ results }) => results), dailyCosts: daily.map(({ cost }) => cost) } : null;
}

function creativeTrend(current, previous, actions, currency) {
  if ([...current, ...previous].some((row) => row?.account_currency !== currency)) return null;
  const now = decisionLinkDelivery(current), before = decisionLinkDelivery(previous);
  if (!now || !before || now.frequency < 2 || now.impressions < 1000 || before.impressions < 1000 || before.clicks < 10 || now.ctr > before.ctr * 0.9) return null;
  const totals = measuredTotals(current, actions, currency);
  return totals?.spend > 0 ? { ...totals, frequency: round(now.frequency), ctr: round(now.ctr), previousCtr: round(before.ctr),
    strong: now.ctr <= before.ctr * 0.7, previousFrequency: before.frequency === null ? null : round(before.frequency) } : null;
}

function adGroups(history, since, until) {
  const ads = new Map();
  for (const row of history.adDays || []) {
    if (row.date_start < since || row.date_start > until || ![row.ad_id, row.adset_id, row.campaign_id].every(idOk)) continue;
    const ad = ads.get(row.ad_id) || { id: row.ad_id, set: row.adset_id, campaign: row.campaign_id, rows: new Map(), sample: row };
    if (ad.set !== row.adset_id || ad.campaign !== row.campaign_id || ad.rows.has(row.date_start)) ad.invalid = true;
    ad.rows.set(row.date_start, row);
    ads.set(row.ad_id, ad);
  }
  const campaigns = new Map();
  for (const ad of ads.values()) {
    if (!campaigns.has(ad.campaign)) campaigns.set(ad.campaign, []);
    campaigns.get(ad.campaign).push(ad);
  }
  return campaigns;
}

export function readAgendaAdEvidence(job, period, targetFor) {
  const { history, categories } = job;
  const active = new Set(history.activeAdIds || []);
  const warnings = [], discoveries = [];
  if (!active.size || !period) return { warnings, discoveries };
  const days = daysOf(period);
  const before = previousMetaPeriod(period);
  const previousDays = daysOf(before);
  for (const [id, ads] of adGroups(history, before.since, period.until)) {
    const campaign = history.campaignMeta?.[id];
    if (!campaign || (campaign.effective_status || campaign.status) !== 'ACTIVE') continue;
    const objective = campaignObjectiveKey(campaign.objective);
    const actions = DECISION_OUTCOME_METRICS[objective]?.actions;
    const eligibleForCut = ['leads', 'mensagens', 'compras'].includes(objective);
    const target = eligibleForCut ? targetFor(id, objective) : null;
    const cut = [], fatigue = [], sets = new Map();
    let candidate;
    for (const ad of ads) {
      const current = days.map((day) => ad.rows.get(day));
      if (current.some(Boolean)) {
        if (!sets.has(ad.set)) sets.set(ad.set, []);
        sets.get(ad.set).push(ad);
      }
      if (!active.has(ad.id) || ad.invalid) continue;
      const info = { level: 'ad', name: nameOf(ad.sample.ad_name, 'Anúncio sem nome'), set: ad.set };
      const bad = eligibleForCut && badCost(current.map((row) => row ? [row] : []), actions, target, objective);
      if (bad) cut.push({ ...info, ...bad });
      const currency = current[0]?.account_currency;
      const faded = categories.includes('criativo') && /^[A-Z]{3}$/.test(currency || '') &&
        creativeTrend(current, previousDays.map((day) => ad.rows.get(day)), actions, currency);
      if (!faded) continue;
      const { strong, previousFrequency, ...detail } = faded;
      if (strong) fatigue.push({ ...info, ...detail, currency });
      else if (actions && categories.includes('descoberta') && previousFrequency > 0 && previousFrequency < detail.frequency &&
        detail.ctr < detail.previousCtr && (!candidate || detail.spend > candidate.metrics.spend)) {
        const { spend, ctr, previousCtr, frequency } = detail;
        candidate = { id, adId: ad.id, adName: info.name, objective, currency, period, comparisonPeriod: before,
          metrics: { spend, ctr, previousCtr, frequency, previousFrequency }, options: { criativo: ['ctr','previousCtr','frequency','previousFrequency'] } };
      }
    }
    if (eligibleForCut && history.adsPartial === false) for (const [set, members] of sets) {
      if (members.some((ad) => ad.invalid || !active.has(ad.id))) continue;
      const bad = badCost(days.map((day) => members.map((ad) => ad.rows.get(day)).filter(Boolean)), actions, target, objective);
      if (bad) cut.push({ level: 'adset', name: nameOf(members[0].sample.adset_name, 'Conjunto sem nome'), set, ...bad });
    }
    const source = nameOf(campaign.name, `Campanha ${id}`);
    if (candidate) discoveries.push({ ...candidate, name: source });
    for (const [kind, candidates, currency] of [['corte', cut, 'BRL'], ['criativo', fatigue, fatigue[0]?.currency]]) {
      if (!candidates.length) continue;
      const visible = candidates.filter((item) => !item.currency || item.currency === currency).sort((a, b) => b.spend - a.spend).slice(0, 4);
      const setsShown = new Set(visible.filter(({ level }) => level === 'adset').map(({ set }) => set));
      const flaggedSpend = round(visible.reduce((total, item) => total + (item.level === 'ad' && setsShown.has(item.set) ? 0 : item.spend), 0));
      const entityEvidence = visible.map(({ set, currency, ...item }) => item);
      const within = (rows) => (rows || []).filter(({ date_start }) => days.includes(date_start));
      const campaignRows = history.campaignPartial === false ? within(history.campaignDays).filter((row) => row.campaign_id === id)
        : history.adsPartial === false && ads.every((ad) => !ad.invalid) ? ads.flatMap((ad) => days.map((day) => ad.rows.get(day)).filter(Boolean)) : [];
      for (const [level, name, rows] of [['campaign', source, campaignRows], ['account', 'Conta de anúncio', within(history.accountDays)]]) {
        const totals = new Set(rows.map(({ date_start }) => date_start)).size === 3 && measuredTotals(rows, actions, currency);
        if (totals) entityEvidence.push({ level, name, ...totals });
      }
      warnings.push({ id, kind, source, period, currency, measurement: { campaignId: id, objective }, entityEvidence,
        values: { flaggedSpend, ...(kind === 'corte' && target > 0 && { target }) }, ...(kind === 'criativo' && { comparisonPeriod: before }) });
    }
  }
  return { warnings, discoveries };
}
