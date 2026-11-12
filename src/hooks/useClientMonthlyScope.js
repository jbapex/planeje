import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { scopeReferenceMonth } from '@/lib/clientMonthlyScopes';

export function useClientMonthlyScope(clientId, month) {
  const referenceMonth = scopeReferenceMonth(month);
  const dataKey = `${clientId || ''}:${referenceMonth || ''}`;
  const requestId = useRef(0);
  const [state, setState] = useState({ scope: null, loading: true, error: null, dataKey });

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    if (!clientId || !referenceMonth) {
      setState({ scope: null, loading: false, error: null, dataKey });
      return;
    }
    setState({ scope: null, loading: true, error: null, dataKey });
    try {
      const { data, error } = await supabase.from('client_monthly_scopes').select('*')
        .eq('client_id', clientId).eq('reference_month', referenceMonth).maybeSingle();
      if (error) throw error;
      if (request === requestId.current) setState({ scope: data || null, loading: false, error: null, dataKey });
    } catch (error) {
      if (request === requestId.current) setState({ scope: null, loading: false, error, dataKey });
    }
  }, [clientId, referenceMonth, dataKey]);

  useEffect(() => { void refresh(); return () => { requestId.current += 1; }; }, [refresh]);
  const currentState = state.dataKey === dataKey ? state : { scope: null, loading: true, error: null };
  return { ...currentState, refresh, referenceMonth };
}
