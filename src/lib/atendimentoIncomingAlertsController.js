/** Global incoming alerts, with an injectable client/timers for offline tests. */
export function createAtendimentoIncomingAlertsController(client, {
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  maxReconnectAttempts = 5,
} = {}) {
  const listeners = new Set();
  const badgeListeners = new Set();
  let channels = [];
  let activeKey = '';
  let desiredKey = '';
  let generation = 0;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let badgeTimer = null;

  const hasListeners = () => listeners.size > 0 || badgeListeners.size > 0;

  function clearChannels() {
    // unsubscribe can emit CLOSED synchronously. Invalidate callbacks and detach
    // the whole group BEFORE calling the SDK, including same-client reconnects.
    generation += 1;
    activeKey = '';
    const oldChannels = channels;
    channels = [];
    oldChannels.forEach((channel) => {
      try {
        Promise.resolve(client.removeChannel(channel)).catch(() => {});
      } catch {
        // A failed teardown must not prevent the other channels from closing.
      }
    });
  }

  function cancelReconnect() {
    if (reconnectTimer !== null) clearTimer(reconnectTimer);
    reconnectTimer = null;
  }

  function stop() {
    desiredKey = '';
    reconnectAttempts = 0;
    cancelReconnect();
    if (badgeTimer !== null) clearTimer(badgeTimer);
    badgeTimer = null;
    clearChannels();
  }

  function subscribe(set, listener) {
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!hasListeners()) stop();
    };
  }

  function notifyBadgeRefresh() {
    if (!badgeListeners.size) return;
    if (badgeTimer !== null) clearTimer(badgeTimer);
    badgeTimer = setTimer(() => {
      badgeTimer = null;
      badgeListeners.forEach((listener) => {
        try { listener(); } catch { /* isolate listeners */ }
      });
    }, 200);
  }

  function notifyIncoming(event, payload) {
    listeners.forEach((listener) => {
      try { listener(event, payload); } catch { /* isolate listeners */ }
    });
    notifyBadgeRefresh();
  }

  function scheduleReconnect(ids, key) {
    cancelReconnect();
    if (!hasListeners() || key !== desiredKey || reconnectAttempts >= maxReconnectAttempts) return;
    const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      if (hasListeners() && desiredKey === key) connect(ids, key);
    }, delay);
  }

  function connect(ids, key) {
    cancelReconnect();
    clearChannels();
    activeKey = key;
    const currentGeneration = generation;
    const subscribed = new Set();
    const isCurrent = () => generation === currentGeneration && activeKey === key && hasListeners();
    const onFailure = () => {
      if (!isCurrent()) return;
      clearChannels();
      scheduleReconnect(ids, key);
    };

    for (const clienteId of ids) {
      if (!isCurrent()) break;
      try {
        // This SDK removes channels by topic after awaiting unsubscribe. A new
        // generation needs a distinct topic so old teardown cannot remove it.
        const channel = client.channel(`atendimento-incoming-alerts:${clienteId}:${currentGeneration}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_inbox',
            filter: `cliente_id=eq.${clienteId}`,
          }, (payload) => { if (isCurrent()) notifyIncoming('inbox', payload); })
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_sent',
            filter: `cliente_id=eq.${clienteId}`,
          }, (payload) => { if (isCurrent()) notifyIncoming('sent', payload); })
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'atendimento_conversas',
            filter: `cliente_id=eq.${clienteId}`,
          }, () => { if (isCurrent()) notifyBadgeRefresh(); });

        // Register before subscribe: adapters/SDK can fail synchronously here.
        channels.push(channel);
        channel.subscribe((status) => {
          if (!isCurrent()) return;
          if (status === 'SUBSCRIBED') {
            subscribed.add(clienteId);
            if (subscribed.size === ids.length) reconnectAttempts = 0;
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            onFailure();
          }
        });
      } catch {
        onFailure();
      }
    }
  }

  function ensure(clienteIds = [], { force = false } = {}) {
    const ids = [...new Set((clienteIds || []).filter(Boolean))].sort();
    const key = ids.join(',');
    if (!ids.length || !hasListeners()) {
      stop();
      return;
    }
    const changed = key !== desiredKey;
    if (!force && key === activeKey && channels.length === ids.length) return;
    if (!force && !changed && (reconnectTimer !== null || reconnectAttempts >= maxReconnectAttempts)) return;
    if (changed || force) reconnectAttempts = 0;
    desiredKey = key;
    connect(ids, key);
  }

  return {
    subscribeAtendimentoIncomingAlerts: (listener) => subscribe(listeners, listener),
    subscribeAtendimentoBadgeRefresh: (listener) => subscribe(badgeListeners, listener),
    ensureAtendimentoIncomingAlertsRealtime: ensure,
  };
}
