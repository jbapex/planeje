function pad2(value) {
  return String(value).padStart(2, '0');
}

export function googleAdsMonthRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(now.getDate(), 1), last);
  return {
    since: `${year}-${pad2(month + 1)}-01`,
    until: `${year}-${pad2(month + 1)}-${pad2(day)}`,
    daysInMonth: last,
  };
}

export function googleDashboardBar(campaigns = [], daysInMonth = 30) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const spend = list.reduce((sum, row) => sum + (Number(row.spend) || 0), 0);
  const daily = list
    .filter((row) => String(row.status || '').toUpperCase() === 'ENABLED')
    .reduce((sum, row) => sum + (Number(row.dailyBudget) || 0), 0);
  const days = Number(daysInMonth) || 0;
  const limite = daily > 0 && days > 0 ? daily * days : 0;
  return {
    linked: true,
    spend,
    limite,
    unlimited: limite <= 0,
  };
}

export function mergeGoogleDashboard(previous, next) {
  if (!next || next.error) {
    if (previous && previous.linked && Number.isFinite(Number(previous.spend))) return previous;
    return next || previous || null;
  }
  return next;
}

export async function mapPool(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const ret = new Array(list.length);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      ret[idx] = await fn(list[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(list.length, 1)) }, worker));
  return ret;
}

export async function loadGoogleDashboardForClient(accounts, range, invoke) {
  const list = Array.isArray(accounts) ? accounts : [];
  const campaigns = [];
  let lastError = '';
  for (const account of list) {
    try {
      const data = await invoke(account.id, range);
      const rows = Array.isArray(data?.campaigns) ? data.campaigns : [];
      campaigns.push(...rows);
    } catch (e) {
      lastError = e?.message || String(e);
    }
  }
  if (!campaigns.length && lastError) {
    return { linked: true, error: lastError, spend: 0, limite: 0, unlimited: true };
  }
  return { ...googleDashboardBar(campaigns, range.daysInMonth), error: '' };
}
