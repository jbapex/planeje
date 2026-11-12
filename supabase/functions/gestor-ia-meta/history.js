const DAY = 86400000;
const ymd = (time) => new Date(time).toISOString().slice(0, 10);

export function previousMetaPeriod({ since, until }) {
  const start = Date.parse(since);
  return { since: ymd(start - (Date.parse(until) - start) - DAY), until: ymd(start - DAY) };
}

export function rollingMetaPeriod(until) {
  const end = new Date(until);
  return { since: ymd(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1)), until };
}

export function sumMetaRows(rows) {
  if (!rows.length) return [];
  const total = {};
  const currency = new Set();
  const actions = { actions: new Map(), action_values: new Map() };
  for (const row of rows) {
    for (const key of ['spend', 'impressions', 'clicks']) {
      if (row[key] != null && row[key] !== '' && Number.isFinite(Number(row[key]))) total[key] = (total[key] || 0) + Number(row[key]);
    }
    if (row.account_currency) currency.add(row.account_currency);
    for (const [key, map] of Object.entries(actions)) {
      for (const item of row[key] || []) {
        if (item.action_type && item.value != null && item.value !== '' && Number.isFinite(Number(item.value))) map.set(item.action_type, (map.get(item.action_type) || 0) + Number(item.value));
      }
    }
  }
  if (currency.size === 1) total.account_currency = [...currency][0];
  for (const [key, map] of Object.entries(actions)) {
    if (map.size) total[key] = [...map].map(([action_type, value]) => ({ action_type, value }));
  }
  const sumMeasured = (read) => {
    const values = rows.map(read);
    if (values.some((value) => !/^\d+(\.\d+)?$/.test(value ?? '') || !Number.isFinite(Number(value)))) return null;
    return values.reduce((acc, value) => acc + Number(value), 0);
  };
  const visits = sumMeasured((row) => row.instagram_profile_visits);
  const plays = sumMeasured((row) => Array.isArray(row.video_thruplay_watched_actions)
    ? row.video_thruplay_watched_actions.find((item) => item?.action_type === 'video_view')?.value : null);
  if (visits !== null) total.instagram_profile_visits = visits;
  if (plays !== null) total.video_thruplay_watched_actions = [{ action_type: 'video_view', value: plays }];
  return [total];
}

function inPeriod(rows, { since, until }) {
  return rows.filter(({ date_start }) => date_start >= since && date_start <= until);
}

function campaignTree(rows, campaignMeta, campaignRows) {
  const campaigns = new Map();
  const group = (map, id, name) => {
    if (!map.has(id)) map.set(id, { id, name, rows: [], children: new Map() });
    return map.get(id);
  };
  const insight = ({ id, name, rows }) => ({ id, name, insights: { data: sumMetaRows(rows) } });
  for (const row of rows) {
    if (!row.campaign_id || !row.adset_id || !row.ad_id) continue;
    const campaign = group(campaigns, row.campaign_id, row.campaign_name);
    const set = group(campaign.children, row.adset_id, row.adset_name);
    group(set.children, row.ad_id, row.ad_name).rows.push(row);
    campaign.rows.push(row);
    set.rows.push(row);
  }
  // Totais vindos da campanha não dependem de quantos anúncios foram retornados.
  for (const row of campaignRows) {
    const campaign = group(campaigns, row.campaign_id, row.campaign_name);
    (campaign.totals ||= []).push(row);
  }
  return [...campaigns.values()].map((campaign) => ({
    ...insight({ ...campaign, rows: campaign.totals || campaign.rows }),
    ...(campaignMeta && Object.hasOwn(campaignMeta, campaign.id) ? campaignMeta[campaign.id] : {}),
    adsets: { data: [...campaign.children.values()].map((set) => ({
      ...insight(set), ads: { data: [...set.children.values()].map(insight) },
    })) },
  }));
}

export function selectMetaHistory(history, requested) {
  if (!history?.period || !Array.isArray(history.accountDays) || !Array.isArray(history.adDays)) return null;
  const period = { since: requested.since < history.period.since ? history.period.since : requested.since,
    until: requested.until > history.period.until ? history.period.until : requested.until };
  if (period.since > period.until) return null;
  const insights = (range) => {
    const dailyRows = inPeriod(history.accountDays, range);
    return { period: range, dailyRows, accountRows: sumMetaRows(dailyRows) };
  };
  const previous = previousMetaPeriod(period);
  const campaignRows = inPeriod(history.campaignDays || [], period);
  const campaigns = campaignTree(inPeriod(history.adDays, period), history.campaignMeta, campaignRows);
  const totals = new Set(campaignRows.map(({ campaign_id }) => campaign_id));
  const campaignMetricsPartial = history.campaignPartial === true || (history.adsPartial === true &&
    (!Array.isArray(history.campaignDays) || history.campaignPartial !== false || campaigns.some(({ id }) => !totals.has(id))));
  return {
    ...insights(period), fetchedAt: history.fetchedAt, derived: true, coverage: history.period,
    campaigns, campaignMetricsPartial, partial: history.adsPartial === true || history.campaignPartial === true,
    comparison: previous.since >= history.period.since && previous.until <= history.period.until ? insights(previous) : null,
    exact: period.since === requested.since && period.until === requested.until,
  };
}
