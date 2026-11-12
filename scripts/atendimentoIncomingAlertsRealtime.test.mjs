import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtendimentoIncomingAlertsController } from '../src/lib/atendimentoIncomingAlertsController.js';

function fixture({ subscribeStatus, maxReconnectAttempts = 3 } = {}) {
  const timers = new Map();
  let timerId = 0;
  const channels = [];
  const removed = [];
  let removalDepth = 0;
  let maxRemovalDepth = 0;
  const client = {
    channel(name) {
      const channel = {
        name, handlers: [],
        on(_kind, filter, callback) { this.handlers.push({ filter, callback }); return this; },
        subscribe(callback) {
          this.status = callback;
          if (subscribeStatus) callback(subscribeStatus);
          return this;
        },
        emit(table, payload) { this.handlers.find(handler => handler.filter.table === table).callback(payload); },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      removalDepth += 1;
      maxRemovalDepth = Math.max(maxRemovalDepth, removalDepth);
      // Reproduce the Supabase SDK: unsubscribe synchronously emits CLOSED.
      if (removalDepth > 10) throw new Error('Recursive unsubscribe');
      removed.push(channel);
      channel.status?.('CLOSED');
      removalDepth -= 1;
      return Promise.resolve('ok');
    },
  };
  const controller = createAtendimentoIncomingAlertsController(client, {
    setTimer(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimer(id) { timers.delete(id); },
    maxReconnectAttempts,
  });
  function tick() {
    const [id, timer] = timers.entries().next().value || [];
    assert.ok(timer, 'a pending timer exists');
    timers.delete(id);
    timer.callback();
    return timer.delay;
  }
  return { controller, client, channels, removed, timers, tick, get maxRemovalDepth() { return maxRemovalDepth; } };
}

for (const failure of ['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT']) {
  test(`${failure} closes each channel once despite synchronous CLOSED callbacks`, () => {
    const f = fixture();
    const unsubscribe = f.controller.subscribeAtendimentoIncomingAlerts(() => {});
    f.controller.ensureAtendimentoIncomingAlertsRealtime(['b', 'a']);
    f.channels[0].status(failure);
    assert.equal(f.maxRemovalDepth, 1);
    assert.equal(f.removed.length, 2);
    assert.equal(f.timers.size, 1);
    assert.equal(f.tick(), 1000);
    assert.equal(f.channels.length, 4);
    // A late callback from the previous same-client subscription is ignored.
    f.channels[0].status('CLOSED');
    assert.equal(f.removed.length, 2);
    assert.equal(f.timers.size, 0);
    unsubscribe();
    assert.equal(f.removed.length, 4);
    assert.equal(f.maxRemovalDepth, 1);
    assert.equal(f.timers.size, 0);
  });
}

test('synchronous subscribe failure is cleaned up and retries are bounded', () => {
  const f = fixture({ subscribeStatus: 'CHANNEL_ERROR' });
  const unsubscribe = f.controller.subscribeAtendimentoIncomingAlerts(() => {});
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a', 'b']);
  assert.equal(f.channels.length, 1, 'the failed group does not continue subscribing');
  assert.equal(f.removed.length, 1);
  assert.deepEqual([f.tick(), f.tick(), f.tick()], [1000, 2000, 4000]);
  assert.equal(f.channels.length, 4, 'initial attempt plus three retries');
  assert.equal(f.removed.length, 4);
  assert.equal(f.timers.size, 0);
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a', 'b']);
  assert.equal(f.channels.length, 4, 'ordinary renders cannot restart an exhausted loop');
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a', 'b'], { force: true });
  assert.equal(f.channels.length, 5, 'explicit retry starts a new bounded cycle');
  unsubscribe();
  assert.equal(f.timers.size, 0);
});

test('same sorted client set is stable; changed clients invalidate old events and timers', () => {
  const f = fixture();
  const events = [];
  const unsubscribe = f.controller.subscribeAtendimentoIncomingAlerts((...args) => events.push(args));
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['b', 'a', 'a']);
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a', 'b']);
  assert.equal(f.channels.length, 2);
  const old = f.channels[0];
  old.status('CLOSED');
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['c']);
  assert.equal(f.timers.size, 0);
  old.emit('cliente_whatsapp_inbox', { id: 'old' });
  f.channels[2].emit('cliente_whatsapp_inbox', { id: 'new' });
  assert.deepEqual(events, [['inbox', { id: 'new' }]]);
  unsubscribe();
});

test('incoming, sent and debounced badge events survive a reconnect without duplicate listeners', () => {
  const f = fixture();
  const events = [];
  let badgeRefreshes = 0;
  const offIncoming = f.controller.subscribeAtendimentoIncomingAlerts((...args) => events.push(args));
  const offBroken = f.controller.subscribeAtendimentoIncomingAlerts(() => { throw new Error('listener failed'); });
  const offBadge = f.controller.subscribeAtendimentoBadgeRefresh(() => { badgeRefreshes += 1; });
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a']);
  f.channels[0].status('CLOSED');
  f.tick();
  const channel = f.channels[1];
  channel.status('SUBSCRIBED');
  assert.deepEqual(channel.handlers.map(h => [h.filter.table, h.filter.event, h.filter.filter]), [
    ['cliente_whatsapp_inbox', 'INSERT', 'cliente_id=eq.a'],
    ['cliente_whatsapp_sent', 'INSERT', 'cliente_id=eq.a'],
    ['atendimento_conversas', '*', 'cliente_id=eq.a'],
  ]);
  channel.emit('cliente_whatsapp_inbox', { id: 1 });
  channel.emit('cliente_whatsapp_sent', { id: 2 });
  channel.emit('atendimento_conversas', {});
  assert.deepEqual(events, [['inbox', { id: 1 }], ['sent', { id: 2 }]]);
  assert.equal(f.timers.size, 1);
  assert.equal(f.tick(), 200);
  assert.equal(badgeRefreshes, 1);
  offIncoming(); offBroken();
  assert.equal(f.removed.length, 1, 'badge subscriber keeps the channel alive');
  offBadge();
  assert.equal(f.removed.length, 2);
});

test('empty client list cancels reconnect and late callbacks cannot restart it', () => {
  const f = fixture();
  const unsubscribe = f.controller.subscribeAtendimentoBadgeRefresh(() => {});
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a']);
  f.channels[0].status('CHANNEL_ERROR');
  f.controller.ensureAtendimentoIncomingAlertsRealtime([]);
  assert.equal(f.timers.size, 0);
  f.channels[0].status('CLOSED');
  assert.equal(f.timers.size, 0);
  unsubscribe();
});

test('one healthy channel cannot reset failures from another channel', () => {
  const f = fixture({ maxReconnectAttempts: 2 });
  const unsubscribe = f.controller.subscribeAtendimentoBadgeRefresh(() => {});
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a', 'b']);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    f.channels.at(-2).status('SUBSCRIBED');
    f.channels.at(-1).status('CHANNEL_ERROR');
    if (attempt < 2) f.tick();
  }
  assert.equal(f.timers.size, 0);
  assert.equal(f.channels.length, 6);
  unsubscribe();
});

test('late SDK teardown by topic cannot remove a new same-client subscription', async () => {
  const f = fixture();
  let sdkChannels = [];
  const pendingRemovals = [];
  const makeChannel = f.client.channel;
  f.client.channel = name => {
    const channel = makeChannel(name);
    sdkChannels.push(channel);
    return channel;
  };
  f.client.removeChannel = channel => {
    channel.status('CLOSED');
    return new Promise(resolve => {
      pendingRemovals.push(() => {
        // Current RealtimeClient._remove filters by topic, not object identity.
        sdkChannels = sdkChannels.filter(current => current.name !== channel.name);
        resolve('ok');
      });
    });
  };
  const unsubscribe = f.controller.subscribeAtendimentoIncomingAlerts(() => {});
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a']);
  f.controller.ensureAtendimentoIncomingAlertsRealtime(['a'], { force: true });
  assert.equal(sdkChannels.length, 2);
  assert.notEqual(f.channels[0].name, f.channels[1].name);
  pendingRemovals.shift()();
  await Promise.resolve();
  assert.deepEqual(sdkChannels, [f.channels[1]]);
  unsubscribe();
  pendingRemovals.shift()();
  await Promise.resolve();
  assert.deepEqual(sdkChannels, []);
});
