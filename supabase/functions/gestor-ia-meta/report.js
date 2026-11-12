import { previousMetaPeriod } from './history.js';

const DAY = 86400000;
const samePeriod = (a, b) => a?.since === b?.since && a?.until === b?.until;
const amount = (value) => ['number', 'string'].includes(typeof value) && /^\d+(\.\d+)?$/.test(value) &&
  Number.isFinite(Number(value)) && Number(value) <= Number.MAX_SAFE_INTEGER ? Number(value) : null;
const clean = (value) => typeof value === 'string' ? value.trim().slice(0, 260) : '';
const entityId = (value) => /^\d{1,32}$/.test(String(value ?? '')) ? String(value) : '';

function reportMetrics(row, currency, derived) {
  const spend = amount(row?.spend), impressions = amount(row?.impressions), clicks = amount(row?.clicks);
  if ([spend, impressions, clicks].includes(null) || (row.account_currency && row.account_currency !== currency)) return null;
  const result = { spend, impressions, clicks, account_currency: currency };
  const reach = amount(row.reach);
  if (!derived && reach !== null) result.reach = reach;
  for (const key of ['actions', 'action_values']) {
    if (Array.isArray(row[key])) result[key] = row[key].flatMap((item) => {
      const value = amount(item?.value);
      return value !== null && /^[a-z0-9_.]{1,100}$/.test(item?.action_type || '') ? [{ action_type: item.action_type, value }] : [];
    });
  }
  return result;
}

function checkedAccount(reading, requested) {
  const period = reading?.period;
  if (!period || period.since < requested.since || period.until > requested.until || period.since > period.until ||
      !Number.isFinite(Date.parse(reading.fetchedAt)) || reading.accountRows?.length !== 1) return null;
  const currency = reading.accountRows[0]?.account_currency;
  if (!/^[A-Z]{3}$/.test(currency || '')) return null;
  const row = reportMetrics(reading.accountRows[0], currency, reading.derived);
  if (!row) return null;
  let missingDays = 0;
  if (reading.derived) {
    const days = (Date.parse(period.until) - Date.parse(period.since)) / DAY + 1;
    const daily = reading.dailyRows;
    if (!Number.isSafeInteger(days) || days < 1 || !Array.isArray(daily) || !daily.length || daily.length > days ||
        new Set(daily.map((item) => item?.date_start)).size !== daily.length || daily.some((item) =>
          !(item?.date_start >= period.since && item.date_start <= period.until) || !reportMetrics(item, currency, true))) return null;
    missingDays = days - daily.length;
  }
  return { period, row, currency, missingDays, reading };
}

async function readBatch(items, read) {
  const result = [];
  for (let i = 0; i < items.length; i += 8) result.push(...await Promise.all(items.slice(i, i + 8).map(read)));
  return result;
}

export async function readCachedMetaReport(cache, clientId, ids, requested, compare = false) {
  const read = async (id, range) => {
    const { reading } = await cache.metrics(clientId, id, range, false);
    const account = checkedAccount(reading, range);
    return account && { ...account, id };
  };
  const initial = await readBatch(ids, (id) => read(id, requested));
  const available = initial.filter(Boolean);
  const failure = (reason) => ({ report: null, reason });
  if (!available.length) return failure(ids.length ? 'NO_READING' : 'NO_ACCOUNTS');
  const period = available.reduce((shared, { period: own }) => ({
    since: shared.since > own.since ? shared.since : own.since, until: shared.until < own.until ? shared.until : own.until,
  }), requested);
  if (period.since > period.until) return failure('NO_COMMON_PERIOD');
  const aligned = await readBatch(available, (account) => samePeriod(account.period, period) ? account : read(account.id, period));
  if (aligned.some((account) => !account || !samePeriod(account.period, period))) return failure('NO_COMMON_PERIOD');
  const currency = aligned[0].currency;
  if (aligned.some((account) => account.currency !== currency)) return failure('MIXED_CURRENCY');

  const campaignRows = [], adRows = [];
  let campaignsPartial = false, adsPartial = false;
  for (const { reading } of aligned) {
    const campaignsIncomplete = (reading.campaignMetricsPartial ?? reading.partial) !== false;
    const adsIncomplete = reading.partial !== false;
    campaignsPartial ||= campaignsIncomplete;
    adsPartial ||= adsIncomplete;
    for (const campaign of reading.campaigns || []) {
      const campaign_id = entityId(campaign.id);
      const campaign_name = clean(campaign.name);
      const insight = campaign.insights?.data?.[0];
      if (!campaignsIncomplete && insight) {
        const metrics = reportMetrics(insight, currency, reading.derived);
        if (metrics && campaign_id) campaignRows.push({ ...metrics, campaign_id, campaign_name, objective: clean(campaign.objective) });
        else campaignsPartial = true;
      }
      if (adsIncomplete) continue;
      for (const set of campaign.adsets?.data || []) for (const ad of set.ads?.data || []) {
        const ad_id = entityId(ad.id);
        const insight = ad.insights?.data?.[0];
        if (!insight) continue;
        const metrics = reportMetrics(insight, currency, reading.derived);
        if (metrics && campaign_id && ad_id) adRows.push({ ...metrics, ad_id, ad_name: clean(ad.name), campaign_id, campaign_name });
        else adsPartial = true;
      }
    }
  }
  let comparison = null;
  if (compare && aligned.every(({ missingDays }) => missingDays === 0)) {
    try {
      const previous = previousMetaPeriod(period);
      const prior = await readBatch(aligned, ({ id }) => read(id, previous));
      if (prior.every((account) => account && account.missingDays === 0 && account.currency === currency && samePeriod(account.period, previous))) {
        comparison = { period: previous, accountRows: prior.map(({ row }) => row) };
      }
    } catch { /* O PDF atual continua disponível se a consulta opcional falhar. */ }
  }
  return { report: { period, currency, accounts: aligned.map(({ id, reading, missingDays }) => ({ id, fetchedAt: reading.fetchedAt, missingDays })),
    missingAccounts: ids.filter((_, i) => !initial[i]), accountRows: aligned.map(({ row }) => row), campaignRows, adRows, campaignsPartial, adsPartial,
    ...(compare && { comparison }) } };
}
