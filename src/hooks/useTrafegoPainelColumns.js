import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  DEFAULT_PAINEL_COLUMNS,
  normalizePainelColumnKeys,
  PAINEL_COLUMNS,
} from '@/lib/trafegoPainelMetrics';

export function useTrafegoPainelColumns() {
  const { user } = useAuth();
  const [visibleKeys, setVisibleKeys] = useState(() => normalizePainelColumnKeys(DEFAULT_PAINEL_COLUMNS));
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('traffic_user_prefs')
          .select('painel_columns')
          .eq('user_id', userId)
          .maybeSingle();
        if (cancelled) return;
        if (error && error.code !== 'PGRST116') {
          console.warn('traffic_user_prefs', error.message || error);
        }
        const keys = data?.painel_columns;
        if (Array.isArray(keys) && keys.length) {
          setVisibleKeys(normalizePainelColumnKeys(keys));
        } else {
          setVisibleKeys(normalizePainelColumnKeys(DEFAULT_PAINEL_COLUMNS));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (keys) => {
      if (!userId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const payload = { user_id: userId, painel_columns: keys, updated_at: new Date().toISOString() };
        const { error } = await supabase.from('traffic_user_prefs').upsert(payload, { onConflict: 'user_id' });
        if (error) console.warn('salvar colunas painel', error.message || error);
      }, 400);
    },
    [userId]
  );

  const toggleColumn = useCallback(
    (key) => {
      const col = PAINEL_COLUMNS.find((c) => c.key === key);
      if (col?.fixed) return;
      setVisibleKeys((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        const normalized = normalizePainelColumnKeys(next);
        persist(normalized);
        return normalized;
      });
    },
    [persist]
  );

  const resetColumns = useCallback(() => {
    const normalized = normalizePainelColumnKeys(DEFAULT_PAINEL_COLUMNS);
    setVisibleKeys(normalized);
    persist(normalized);
  }, [persist]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  return {
    visibleKeys,
    toggleColumn,
    resetColumns,
    loading,
    allColumns: PAINEL_COLUMNS,
  };
}
