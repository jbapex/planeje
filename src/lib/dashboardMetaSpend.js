import { supabase } from '@/lib/customSupabaseClient';
import { buildMetaSnapshot, fetchCampaignsForAccounts, saveClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { painelCacheHasData, readPainelTabCache, writePainelTabCache } from '@/lib/trafegoTabCache';
import { resolvePainelPeriod } from '@/lib/trafegoPainelHref';

const DAILY_PREFIX = 'planeje-trafego-tab:daily:';

function readDaily(clienteId, since, until) {
  try {
    const raw = sessionStorage.getItem(`${DAILY_PREFIX}${clienteId}:${since}:${until}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? parsed.rows : null;
  } catch {
    return null;
  }
}

function writeDaily(clienteId, since, until, rows) {
  try {
    sessionStorage.setItem(
      `${DAILY_PREFIX}${clienteId}:${since}:${until}`,
      JSON.stringify({ rows: rows || [], fetchedAt: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

function spendOf(snapshot) {
  const spend = Number(snapshot?.spend);
  return Number.isFinite(spend) ? spend : null;
}

async function loadAccounts(clienteId) {
  const { data, error } = await supabase
    .from('cliente_meta_accounts')
    .select('meta_account_id, meta_account_name, is_active')
    .eq('cliente_id', clienteId)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).filter((row) => row.meta_account_id);
}

async function loadDailySpend(clienteId, since, until, accounts) {
  const cached = readDaily(clienteId, since, until);
  if (cached) return cached;
  const totals = new Map();
  let ok = false;
  await Promise.all((accounts || []).map(async (account) => {
    const { data, error } = await supabase.functions.invoke('meta-ads-api', {
      body: {
        action: 'get-campaign-insights',
        cliente_id: clienteId,
        ad_account_id: account.meta_account_id,
        time_range: { since, until },
        metrics: ['spend'],
        level: 'account',
        time_increment: 1,
        limit: 500,
      },
    });
    if (error || data?.error) return;
    ok = true;
    for (const row of data?.campaigns || []) {
      const day = String(row.date_start || row.date || '').slice(0, 10);
      const spend = Number(row.spend) || 0;
      if (!day) continue;
      totals.set(day, (totals.get(day) || 0) + spend);
    }
  }));
  const rows = [...totals.entries()].map(([day, spend]) => ({ day, spend })).sort((a, b) => a.day.localeCompare(b.day));
  if (ok) writeDaily(clienteId, since, until, rows);
  return rows;
}

function cachedSpendFor(clienteId, since, until) {
  const cached = readPainelTabCache(clienteId, since, until);
  if (!painelCacheHasData(cached)) return null;
  return spendOf(cached.liveSnapshot);
}

export async function loadDashboardMetaSpend(clienteId, since, until, alternates = []) {
  if (!clienteId || !since || !until) return { spend: null, daily: [] };
  const ranges = [{ since, until }, ...(alternates || [])];
  let cachedSpend = null;
  for (const range of ranges) {
    if (!range?.since || !range?.until) continue;
    const found = cachedSpendFor(clienteId, range.since, range.until);
    if (found != null) {
      cachedSpend = found;
      break;
    }
  }
  if (cachedSpend != null) {
    const accounts = await loadAccounts(clienteId);
    const daily = await loadDailySpend(clienteId, since, until, accounts);
    return { spend: cachedSpend, daily };
  }

  const accounts = await loadAccounts(clienteId);
  if (!accounts.length) return { spend: null, daily: [] };
  const fetched = await fetchCampaignsForAccounts(accounts, { since, until });
  const snapshot = buildMetaSnapshot(fetched);
  const spend = spendOf(snapshot);
  const failed = fetched.permError || fetched.rateLimited || fetched.errorMessage;
  if (failed && !(spend > 0)) return { spend: null, daily: [] };
  writePainelTabCache(clienteId, since, until, {
    liveSnapshot: snapshot,
    liveCampaigns: fetched.campaigns || [],
    liveAdsets: [],
  });
  const month = resolvePainelPeriod('mes');
  if (since === month.since && until === month.until) {
    saveClienteMetaResumo(clienteId, snapshot).catch(() => {});
  }
  const daily = await loadDailySpend(clienteId, since, until, accounts);
  return { spend: spend || 0, daily };
}
