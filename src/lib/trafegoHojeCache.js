/** Última análise do Hoje: localStorage (reabre o dia) com fallback de sessão. */

const META_PREFIX = 'planeje-hoje-meta:v4:';
const META_PREFIX_PREV = 'planeje-hoje-meta:v3:';
const DEMANDS_PREFIX = 'planeje-central-hoje:v2:';

export const HOJE_META_TTL_MS = 10 * 60 * 1000;
export const HOJE_DEMANDS_TTL_MS = 5 * 60 * 1000;
export const HOJE_AUTO_REFRESH_MS = 10 * 60 * 1000;
export const CENTRAL_HOJE_CHANGED = 'planeje-central-hoje-changed';

function readRaw(key) {
  try {
    const local = localStorage.getItem(key);
    if (local) return local;
  } catch {
    /* private mode */
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota */
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readBox(key) {
  try {
    const raw = readRaw(key);
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
    writeRaw(key, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function previousHasMetaSignal(previous) {
  if (!previous || typeof previous !== 'object') return false;
  if (Number(previous.spend) > 0) return true;
  if (Number(previous.activeCount) > 0) return true;
  if (Number(previous.delivering) > 0) return true;
  if (Array.isArray(previous.groups) && previous.groups.length > 0) return true;
  return false;
}

export function isMetaRateLimited(source) {
  if (!source || typeof source !== 'object') return false;
  if (source.rateLimited) return true;
  const msg = String(source.errorMessage || source.alert || source.detail || '');
  return /limitou as chamadas|muitas chamadas|rate.?limit|too many calls|code.?17\b|#17\b/i.test(msg);
}

/** Falha/limite da Meta não apaga a última análise boa — mesmo se vier lista vazia de insight. */
export function shouldKeepPreviousMeta(fetched, previous) {
  if (!previousHasMetaSignal(previous)) return false;
  if (isMetaRateLimited(fetched)) return true;
  if (fetched?.permError) return true;
  return false;
}

export function shouldPersistMetaSnapshot(fetched, previous, snapshot) {
  if (shouldKeepPreviousMeta(fetched, previous)) return false;
  if ((isMetaRateLimited(fetched) || fetched?.permError) && !previousHasMetaSignal(snapshot)) {
    return false;
  }
  return true;
}

const metaMemory = new Map();
const metaInflight = new Map();

export function metaCacheKey(userId, todayYmd) {
  return `${META_PREFIX}${userId || 'anon'}:${todayYmd || ''}`;
}

export function demandsCacheKey(userId) {
  return `${DEMANDS_PREFIX}${userId || 'anon'}`;
}

export function isHojeCacheFresh(fetchedAt, ttlMs) {
  return Number(fetchedAt) > 0 && Date.now() - Number(fetchedAt) < ttlMs;
}

function metaCacheKeyPrev(userId, todayYmd) {
  return `${META_PREFIX_PREV}${userId || 'anon'}:${todayYmd || ''}`;
}

function isMetaBoxComplete(box) {
  if (!box) return false;
  if (box.complete === false) return false;
  if (box.clientCount > 0 && box.dayRows.length < box.clientCount) return false;
  return true;
}

function normalizeMetaBox(box) {
  if (!box || typeof box !== 'object') return null;
  const dayRows = Array.isArray(box.dayRows) ? box.dayRows : [];
  const clientCount = Number(box.clientCount) || 0;
  return {
    dayRows,
    weekRows: Array.isArray(box.weekRows) ? box.weekRows : [],
    fetchedAt: Number(box.fetchedAt) || 0,
    clientCount,
    complete: box.complete !== false && !(clientCount > 0 && dayRows.length < clientCount),
  };
}

export function readHojeMetaCache(userId, todayYmd) {
  const key = metaCacheKey(userId, todayYmd);
  if (metaMemory.has(key)) return metaMemory.get(key);
  let box = normalizeMetaBox(readBox(key));
  if (!box) {
    const prev = normalizeMetaBox(readBox(metaCacheKeyPrev(userId, todayYmd)));
    if (prev) box = { ...prev, complete: false };
  }
  if (!box) return null;
  metaMemory.set(key, box);
  return box;
}

export function writeHojeMetaCache(
  userId,
  todayYmd,
  { dayRows, weekRows, complete = true, fetchedAt, clientCount } = {}
) {
  const key = metaCacheKey(userId, todayYmd);
  const prev = metaMemory.get(key) || normalizeMetaBox(readBox(key));
  const rows = dayRows || [];
  const count = Number(clientCount) || prev?.clientCount || 0;
  const box = {
    dayRows: rows,
    weekRows: weekRows ?? prev?.weekRows ?? [],
    fetchedAt: Number(fetchedAt) || Date.now(),
    clientCount: count,
    complete: Boolean(complete) && !(count > 0 && rows.length < count),
  };
  metaMemory.set(key, box);
  writeBox(key, box);
  return box;
}

export function hojeMetaCacheHasRows(box) {
  return Array.isArray(box?.dayRows) && box.dayRows.length > 0;
}

/** Cache completo e ainda no TTL: não chama a Meta de novo. */
export function shouldReuseHojeMetaCache(box, { force = false, ttlMs = HOJE_META_TTL_MS } = {}) {
  if (force || !box) return false;
  if (!isMetaBoxComplete(box)) return false;
  return isHojeCacheFresh(box.fetchedAt, ttlMs);
}

export function getHojeMetaInflight(userId, todayYmd) {
  return metaInflight.get(metaCacheKey(userId, todayYmd)) || null;
}

export function setHojeMetaInflight(userId, todayYmd, job) {
  const key = metaCacheKey(userId, todayYmd);
  if (job) metaInflight.set(key, job);
  else metaInflight.delete(key);
}

export function resetHojeMetaCacheForTests() {
  metaMemory.clear();
  metaInflight.clear();
}

export function readCentralHojeCache(userId) {
  const box = readBox(demandsCacheKey(userId));
  if (!box) return null;
  return {
    buckets: box.buckets || null,
    clients: Array.isArray(box.clients) ? box.clients : [],
    campaigns: Array.isArray(box.campaigns) ? box.campaigns : [],
    team: Array.isArray(box.team) ? box.team : [],
    weeklyReviews: Array.isArray(box.weeklyReviews) ? box.weeklyReviews : [],
    weeklyClients: Array.isArray(box.weeklyClients) ? box.weeklyClients : [],
    weeklyToday: box.weeklyToday || '',
    fetchedAt: Number(box.fetchedAt) || 0,
  };
}

export function writeCentralHojeCache(userId, payload) {
  writeBox(demandsCacheKey(userId), {
    ...payload,
    fetchedAt: Date.now(),
  });
}

export function invalidateCentralHojeCache(userId) {
  const key = demandsCacheKey(userId);
  try { localStorage.removeItem(key); } catch { /* private mode */ }
  try { sessionStorage.removeItem(key); } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CENTRAL_HOJE_CHANGED, { detail: { userId } }));
}

export function formatCacheAge(fetchedAt) {
  if (!fetchedAt) return '';
  const min = Math.floor((Date.now() - Number(fetchedAt)) / 60000);
  if (min <= 0) return 'agora';
  if (min === 1) return 'há 1 min';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h === 1 ? 'há 1 h' : `há ${h} h`;
}
