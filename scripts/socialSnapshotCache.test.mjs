import assert from 'node:assert/strict';
import {
  formatSnapshotUpdatedAt,
  isSnapshotFresh,
  mergeSnapshot,
  planOverviewRefresh,
  readClientOverviewSnapshots,
  shouldReplaceSnapshot,
  snapshotHasDisplay,
  writeSnapshotEntry,
} from '../src/lib/socialSnapshotCache.js';

const memory = new Map();
const originalGet = globalThis.localStorage?.getItem;
const originalSet = globalThis.localStorage?.setItem;

globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

function testKeepsStaleDisplay() {
  memory.clear();
  const old = Date.now() - (40 * 60 * 1000);
  writeSnapshotEntry('meta_planner_snapshot_v2_a', {
    handle: '@apicenoivas',
    followers: 12000,
    reach: 8000,
    updatedAt: old,
  });
  const stored = JSON.parse(memory.get('meta_planner_snapshot_v2_a'));
  stored.timestamp = old;
  memory.set('meta_planner_snapshot_v2_a', JSON.stringify(stored));
  const { snapshots } = readClientOverviewSnapshots(['a']);
  assert.equal(snapshots.a.followers, 12000);
  assert.equal(isSnapshotFresh(snapshots.a.updatedAt, 30 * 60 * 1000, Date.now()), false);
}

function testDoesNotFetchWhenMetaLimited() {
  memory.clear();
  writeSnapshotEntry('meta_planner_snapshot_v2_a', { followers: 10, reach: 5 });
  const plan = planOverviewRefresh({
    clientIds: ['a'],
    liveMeta: false,
    force: true,
  });
  assert.deepEqual(plan.toFetch, []);
  assert.equal(plan.snapshots.a.followers, 10);
}

function testFetchesStaleWhenLive() {
  memory.clear();
  const plan = planOverviewRefresh({
    clientIds: ['a', 'b'],
    current: { a: { followers: 1, updatedAt: Date.now() } },
    liveMeta: true,
    force: false,
    now: Date.now(),
  });
  assert.deepEqual(plan.toFetch, ['b']);
}

function testKeepsPreviousWhenIncomingEmpty() {
  const previous = { followers: 99, reach: 40, handle: '@x', channels: [{ platform: 'instagram', followers: 99, reach: 40 }] };
  assert.equal(shouldReplaceSnapshot(previous, { error: true }), false);
  assert.equal(shouldReplaceSnapshot(previous, { channels: [] }), false);
  const merged = mergeSnapshot(previous, { followers: null, reach: null, channels: [{ platform: 'instagram', followers: null }] }, Date.now());
  assert.equal(merged.followers, 99);
  assert.equal(merged.channels[0].followers, 99);
}

function testFormatUpdatedAt() {
  const label = formatSnapshotUpdatedAt(Date.parse('2026-09-21T16:40:00.000Z'));
  assert.match(label, /^Atualizado em \d{2}\/\d{2} às \d{2}:\d{2}$/);
  assert.equal(formatSnapshotUpdatedAt(0), null);
  assert.equal(snapshotHasDisplay({ followers: 3 }), true);
  assert.equal(snapshotHasDisplay({ error: true }), false);
}

testKeepsStaleDisplay();
testDoesNotFetchWhenMetaLimited();
testFetchesStaleWhenLive();
testKeepsPreviousWhenIncomingEmpty();
testFormatUpdatedAt();
if (originalGet) globalThis.localStorage.getItem = originalGet;
if (originalSet) globalThis.localStorage.setItem = originalSet;
console.log('socialSnapshotCache.test.mjs ok');
