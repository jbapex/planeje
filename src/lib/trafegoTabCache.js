/** Cache sessionStorage das abas Dashboard / Painel / fila — evita refetch ao trocar aba. */

import { META_RESUMO_STALE_MS } from '@/lib/clienteMetaSnapshot';

export const DASHBOARD_TAB_TTL_MS = META_RESUMO_STALE_MS;
export const PAINEL_TAB_TTL_MS = 5 * 60 * 1000;
export const FILA_PORTFOLIO_TTL_MS = 5 * 60 * 1000;

const PREFIX = 'planeje-trafego-tab:';

function readBox(key) {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBox(key, payload) {
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify({ ...payload, fetchedAt: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

export function isTabCacheFresh(fetchedAt, ttlMs) {
  return Number(fetchedAt) > 0 && Date.now() - Number(fetchedAt) < ttlMs;
}

function dashboardKey(userId) {
  return `dashboard:v6:${userId || 'anon'}`;
}

export function readDashboardTabCache(userId) {
  const box = readBox(dashboardKey(userId));
  if (!box) return null;
  return {
    rows: Array.isArray(box.rows) ? box.rows : [],
    fetchedAt: Number(box.fetchedAt) || 0,
  };
}

export function writeDashboardTabCache(userId, rows) {
  writeBox(dashboardKey(userId), { rows: rows || [] });
}

export function painelCacheKey(clientId, since, until) {
  return `painel:${clientId || ''}:${since || ''}:${until || ''}`;
}

export function readPainelTabCache(clientId, since, until) {
  const box = readBox(painelCacheKey(clientId, since, until));
  if (!box) return null;
  return {
    liveSnapshot: box.liveSnapshot ?? null,
    liveCampaigns: Array.isArray(box.liveCampaigns) ? box.liveCampaigns : [],
    liveAdsets: Array.isArray(box.liveAdsets) ? box.liveAdsets : [],
    fetchedAt: Number(box.fetchedAt) || 0,
  };
}

export function writePainelTabCache(clientId, since, until, payload) {
  writeBox(painelCacheKey(clientId, since, until), {
    liveSnapshot: payload?.liveSnapshot ?? null,
    liveCampaigns: payload?.liveCampaigns || [],
    liveAdsets: payload?.liveAdsets || [],
  });
}

export function painelCacheHasData(cached) {
  if (!cached) return false;
  if (cached.liveSnapshot) return true;
  if (Array.isArray(cached.liveCampaigns) && cached.liveCampaigns.length > 0) return true;
  if (Array.isArray(cached.liveAdsets) && cached.liveAdsets.length > 0) return true;
  return false;
}

export function formatPainelCacheAge(fetchedAt) {
  const ms = Date.now() - Number(fetchedAt || 0);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dia(s)`;
}

function filaKey(userId) {
  return `fila:v3:${userId || 'anon'}`;
}

export function readFilaPortfolioCache(userId) {
  const box = readBox(filaKey(userId));
  if (!box) return null;
  return {
    clients: Array.isArray(box.clients) ? box.clients : [],
    accountsByClient: box.accountsByClient || {},
    diariesByClient: box.diariesByClient || {},
    metricsByClient: box.metricsByClient || {},
    snapshotsByClient: box.snapshotsByClient || {},
    openTasks: Array.isArray(box.openTasks) ? box.openTasks : [],
    gruposByClient: box.gruposByClient || {},
    fetchedAt: Number(box.fetchedAt) || 0,
  };
}

export function writeFilaPortfolioCache(userId, payload) {
  writeBox(filaKey(userId), payload || {});
}
