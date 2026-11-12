import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const EMPTY = { loading: true, error: false, available: false, conversations: [], pending_analysis: 0 };

export function useTrafficPendingConversations() {
  const { profile } = useAuth();
  const identity = `${profile?.id || ''}:${profile?.role || ''}:${profile?.status || ''}`;
  const [state, setState] = useState(EMPTY);
  const refreshRef = useRef(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let controller;
    const load = async () => {
      if (controller || disposed || !profile?.id) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        const { data, error } = await supabase.rpc('traffic_pending_conversations').abortSignal(controller.signal);
        if (error || !data || typeof data.available !== 'boolean' || !Array.isArray(data.conversations)
          || !Number.isInteger(data.pending_analysis) || data.pending_analysis < 0
          || data.conversations.some(row => !row.conversation_id || !row.cliente_id || !row.chat_jid
            || !Number.isFinite(Date.parse(row.since)))) throw new Error('Invalid traffic inbox');
        if (!disposed) setState({ ...data, identity, loading: false, error: false });
      } catch {
        if (!disposed) setState({ ...EMPTY, identity, loading: false, error: true });
      } finally {
        clearTimeout(timeout);
        controller = null;
      }
    };
    setState({ ...EMPTY, identity });
    refreshRef.current = load;
    load();
    const poll = setInterval(load, 20000);
    window.addEventListener('focus', load);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(poll);
      window.removeEventListener('focus', load);
      refreshRef.current = () => {};
    };
  }, [identity, profile?.id]);

  return { ...(state.identity === identity ? state : EMPTY), refresh };
}
