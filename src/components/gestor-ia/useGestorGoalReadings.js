import { supabase } from '@/lib/customSupabaseClient';
import { loadGestorGoalReadings } from './gestorIaData';
import { useGestorRead } from './gestorIaReads';

export function useGestorGoalReadings(store, goalIds, period, revision) {
  const ids = [...new Set(goalIds)].sort();
  const key = (version) => JSON.stringify(['metas-leituras', ids, period.since, period.until, version]);
  const entry = useGestorRead(store, key(revision), ids.length > 0, () => loadGestorGoalReadings(supabase, ids, period));
  const previous = revision > 0 && !entry.error?.accessDenied ? store.get(key(revision - 1)).data : undefined;
  return { ...entry, data: entry.data ?? previous };
}
