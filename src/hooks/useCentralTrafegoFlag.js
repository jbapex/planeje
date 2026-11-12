import { useCallback, useEffect, useState } from 'react';
import { fetchCentralTrafegoFlag } from '@/lib/centralTrafegoApi';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export function useCentralTrafegoFlag() {
  const { profile } = useAuth();
  const [state, setState] = useState({ enabled: false, allowed: false, loaded: false, error: null });

  const reload = useCallback(async () => {
    if (!profile?.id) {
      setState({ enabled: false, allowed: false, loaded: true, error: null });
      return;
    }
    const next = await fetchCentralTrafegoFlag();
    setState(next);
  }, [profile?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const showCentral = Boolean(state.loaded && state.allowed);

  return { ...state, showCentral, reload };
}
