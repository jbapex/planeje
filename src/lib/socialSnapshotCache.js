/** Última verificação orgânica da Meta: não apaga no limite nem depois de 30 min. */

export const SOCIAL_SNAPSHOT_PREFIX = 'meta_planner_snapshot_v2_';
export const SOCIAL_SNAPSHOT_FRESH_MS = 30 * 60 * 1000;

export function readSnapshotEntry(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.data == null) return null;
    const timestamp = Number(parsed.timestamp) || 0;
    return { data: parsed.data, timestamp };
  } catch {
    return null;
  }
}

export function readSnapshotData(key) {
  return readSnapshotEntry(key)?.data ?? null;
}

export function writeSnapshotEntry(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // quota
  }
}

export function isSnapshotFresh(timestamp, freshMs = SOCIAL_SNAPSHOT_FRESH_MS, now = Date.now()) {
  const ts = Number(timestamp) || 0;
  if (!ts) return false;
  return now - ts < freshMs;
}

export function formatSnapshotUpdatedAt(timestamp) {
  const ts = Number(timestamp) || 0;
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
  const timePart = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `Atualizado em ${datePart} às ${timePart}`;
}

export function snapshotHasDisplay(snapshot) {
  if (!snapshot || snapshot.error) return false;
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  const values = [
    snapshot.followers,
    snapshot.reach,
    snapshot.engagement,
    ...channels.flatMap((row) => [row?.followers, row?.reach, row?.engagement]),
  ];
  if (values.some((value) => Number.isFinite(Number(value)))) return true;
  return Boolean(snapshot.photo || snapshot.handle || channels.some((row) => row?.photo || row?.handle));
}

export function shouldReplaceSnapshot(previous, incoming) {
  if (!incoming || incoming.error) return false;
  if (!previous) return snapshotHasDisplay(incoming);
  if (snapshotHasDisplay(incoming)) return true;
  return !snapshotHasDisplay(previous);
}

export function mergeSnapshot(previous, incoming, updatedAt) {
  if (!incoming && !previous) return null;
  if (!previous) {
    return updatedAt ? { ...incoming, updatedAt } : incoming;
  }
  if (!incoming) return previous;
  const channelsByPlatform = new Map();
  for (const row of previous.channels || []) {
    if (row?.platform) channelsByPlatform.set(row.platform, row);
  }
  for (const row of incoming.channels || []) {
    if (!row?.platform) continue;
    const prior = channelsByPlatform.get(row.platform) || {};
    channelsByPlatform.set(row.platform, {
      ...prior,
      ...row,
      photo: row.photo || prior.photo,
      handle: row.handle || prior.handle,
      followers: row.followers ?? prior.followers,
      reach: row.reach ?? prior.reach,
      engagement: row.engagement ?? prior.engagement,
    });
  }
  const stamp = updatedAt || incoming.updatedAt || previous.updatedAt;
  return {
    ...previous,
    ...incoming,
    photo: incoming.photo || previous.photo,
    handle: incoming.handle || previous.handle,
    followers: incoming.followers ?? previous.followers,
    reach: incoming.reach ?? previous.reach,
    engagement: incoming.engagement ?? previous.engagement,
    channels: [...channelsByPlatform.values()],
    updatedAt: stamp,
  };
}

export function readClientOverviewSnapshots(clientIds = [], prefix = SOCIAL_SNAPSHOT_PREFIX) {
  const snapshots = {};
  let latest = 0;
  for (const id of clientIds) {
    if (!id) continue;
    const entry = readSnapshotEntry(`${prefix}${id}`);
    if (!entry) continue;
    const updatedAt = Number(entry.data?.updatedAt) || entry.timestamp;
    snapshots[id] = { ...entry.data, updatedAt };
    if (updatedAt > latest) latest = updatedAt;
  }
  return { snapshots, latest };
}

export function planOverviewRefresh({
  clientIds = [],
  current = {},
  liveMeta = false,
  force = false,
  now = Date.now(),
  freshMs = SOCIAL_SNAPSHOT_FRESH_MS,
  prefix = SOCIAL_SNAPSHOT_PREFIX,
} = {}) {
  const fromCache = readClientOverviewSnapshots(clientIds, prefix);
  const snapshots = { ...fromCache.snapshots };
  for (const [id, row] of Object.entries(current || {})) {
    const currentTs = Number(row?.updatedAt) || 0;
    const cachedTs = Number(snapshots[id]?.updatedAt) || 0;
    if (currentTs >= cachedTs) snapshots[id] = row;
  }
  const toFetch = [];
  if (liveMeta) {
    for (const id of clientIds) {
      if (force || !isSnapshotFresh(snapshots[id]?.updatedAt, freshMs, now)) toFetch.push(id);
    }
  }
  return {
    snapshots,
    toFetch,
    latest: Object.values(snapshots).reduce((max, row) => Math.max(max, Number(row?.updatedAt) || 0), 0),
  };
}
