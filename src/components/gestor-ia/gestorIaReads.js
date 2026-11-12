import { useEffect, useRef, useSyncExternalStore } from 'react';

const EMPTY = {};
export const overviewKey = (clientId) => `contas:${clientId}`;

export function createGestorReads() {
  const records = new Map();
  const listeners = new Set();
  let version = 0;
  function publish(key, value) {
    records.set(key, value);
    version += 1;
    listeners.forEach((notify) => notify());
  }
  return {
    recentMetrics: new Map(),
    recentPortfolioMetrics: new Map(),
    get: (key) => records.get(key) || EMPTY,
    version: () => version,
    subscribe(notify) {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    run(key, load, force = false) {
      const previous = records.get(key);
      if (previous?.request) return previous.request;
      if (previous && !force) return Promise.resolve(previous.data);
      const request = Promise.resolve().then(load).then(
        (data) => { publish(key, { data }); return data; },
        (error) => { publish(key, { data: error?.accessDenied ? undefined : previous?.data, error }); return undefined; },
      );
      publish(key, { data: previous?.data, request, refreshing: force });
      return request;
    },
  };
}

export function useGestorRead(store, key, enabled, load, eager = true) {
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const snapshot = () => enabled ? store.get(key) : EMPTY;
  const record = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  useEffect(() => {
    if (enabled && eager) void store.run(key, latestLoad.current);
  }, [store, key, enabled, eager]);
  return { ...record, reload: (request = load) => enabled ? store.run(key, request, true) : Promise.resolve() };
}
