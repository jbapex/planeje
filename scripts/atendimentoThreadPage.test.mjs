import assert from 'node:assert/strict';
import {
  ATENDIMENTO_THREAD_PAGE_SIZE,
  applyLatestWindow,
  firstUnreadMessageId,
  inboundCount,
  mergeThreadPages,
  oldestCreatedAt,
  pageHasOlder,
  tailMessages,
  takeNewestByCreatedAt,
} from '../src/lib/atendimentoThreadPage.js';

function msg(id, at, extra = {}) {
  return { id, at, createdAt: extra.createdAt || at, direction: extra.direction || 'in', ...extra };
}

const many = Array.from({ length: 50 }, (_, index) => msg(
  `m${index}`,
  `2026-10-08T10:${String(index).padStart(2, '0')}:00.000Z`,
));
const newest = takeNewestByCreatedAt(many, 40);
assert.equal(newest.page.length, 40);
assert.equal(newest.truncated, true);
assert.equal(newest.page[0].id, 'm10');
assert.equal(newest.page[39].id, 'm49');

const tied = [
  msg('a', '2026-10-08T10:00:00.000Z'),
  msg('b', '2026-10-08T10:00:00.000Z'),
  msg('c', '2026-10-08T10:00:00.000Z'),
  msg('d', '2026-10-08T11:00:00.000Z'),
];
const withTies = takeNewestByCreatedAt(tied, 2);
assert.deepEqual(withTies.page.map((item) => item.id), ['a', 'b', 'c', 'd']);
assert.equal(withTies.truncated, false, 'o instante da fronteira entra inteiro');

const short = takeNewestByCreatedAt(tied.slice(0, 2), 40);
assert.equal(short.truncated, false);
assert.equal(short.page.length, 2);

const history = [
  msg('old', '2026-10-01T10:00:00.000Z'),
  msg('mid', '2026-10-07T10:00:00.000Z'),
  msg('new', '2026-10-08T10:00:00.000Z', { direction: 'out' }),
];
const refreshed = applyLatestWindow(
  history,
  [msg('mid', '2026-10-07T10:00:00.000Z', { body: 'atual' }), msg('new', '2026-10-08T10:00:00.000Z', { direction: 'out' })],
  ['mid', 'new'],
);
assert.deepEqual(refreshed.map((item) => item.id), ['old', 'mid', 'new']);
assert.equal(refreshed[1].body, 'atual');

const dropped = applyLatestWindow(
  history,
  [msg('new', '2026-10-08T10:00:00.000Z', { direction: 'out' })],
  ['mid', 'new'],
);
assert.deepEqual(dropped.map((item) => item.id), ['old', 'new'], 'o que saiu da janela recente não volta');

const keptUpload = applyLatestWindow(
  [...history, msg('up', '2026-10-08T12:00:00.000Z', { upload: { percent: 10 }, optimistic: true })],
  [msg('new', '2026-10-08T10:00:00.000Z', { direction: 'out' })],
  ['mid', 'new'],
);
assert.ok(keptUpload.some((item) => item.id === 'up'));

assert.equal(oldestCreatedAt(history), '2026-10-01T10:00:00.000Z');
assert.equal(oldestCreatedAt([
  msg('x', '2026-10-08T12:00:00.000Z', { optimistic: true }),
  msg('y', '2026-10-08T09:00:00.000Z'),
]), '2026-10-08T09:00:00.000Z');

const thread = [
  msg('a', '2026-10-08T10:00:00.000Z'),
  msg('b', '2026-10-08T10:01:00.000Z', { direction: 'out' }),
  msg('c', '2026-10-08T10:02:00.000Z'),
  msg('d', '2026-10-08T10:03:00.000Z'),
];
assert.equal(inboundCount(thread), 3);
assert.equal(firstUnreadMessageId(thread, 0), null);
assert.equal(firstUnreadMessageId(thread, 1), 'd');
assert.equal(firstUnreadMessageId(thread, 2), 'c');
assert.equal(firstUnreadMessageId(thread, 9), 'a', 'mais não lidas do que o trecho carregado começa na mais antiga deste trecho');

assert.deepEqual(tailMessages(thread, 2).map((item) => item.id), ['c', 'd']);
assert.equal(tailMessages([
  ...thread,
  msg('opt', '2026-10-08T10:04:00.000Z', { optimistic: true }),
], 10).some((item) => item.optimistic), false);

assert.equal(pageHasOlder([40, 3], ATENDIMENTO_THREAD_PAGE_SIZE, 20), true);
assert.equal(pageHasOlder([10, 4], ATENDIMENTO_THREAD_PAGE_SIZE, 12), false);
assert.equal(pageHasOlder([10], 40, 41), true);

const merged = mergeThreadPages(
  [msg('a', '2026-10-08T10:00:00.000Z'), msg('b', '2026-10-08T11:00:00.000Z')],
  [msg('b', '2026-10-08T11:00:00.000Z', { body: 'novo' }), msg('c', '2026-10-08T09:00:00.000Z')],
);
assert.deepEqual(merged.map((item) => item.id), ['c', 'a', 'b']);
assert.equal(merged[2].body, 'novo');

console.log('atendimentoThreadPage: ok');
