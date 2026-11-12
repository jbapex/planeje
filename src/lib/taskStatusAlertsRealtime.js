import { supabase } from '@/lib/customSupabaseClient';

const listeners = new Set();
let channel = null;

function notifyListeners(payload) {
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  });
}

function clearChannel() {
  if (!channel) return;
  try {
    supabase.removeChannel(channel);
  } catch {
    /* ignore */
  }
  channel = null;
}

export function subscribeTaskStatusAlerts(listener) {
  listeners.add(listener);
  ensureTaskStatusAlertsRealtime();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearChannel();
  };
}

export function ensureTaskStatusAlertsRealtime() {
  if (channel || !listeners.size) return;

  channel = supabase
    .channel('task-status-alerts-global')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tarefas',
      },
      (payload) => notifyListeners(payload)
    )
    .subscribe();
}
