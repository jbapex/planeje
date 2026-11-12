import { useCallback, useEffect, useState } from 'react';
import { countMyPendingLembretes } from '@/lib/atendimentoConversaPlanejamento';
import { supabase } from '@/lib/customSupabaseClient';

export function useMyLembretesBadge(userId) {
  const [count, setCount] = useState(0);

  const reload = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const n = await countMyPendingLembretes(userId);
    setCount(n);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return undefined;
    const ch = supabase
      .channel(`lembretes-badge:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_conversa_planejamento',
          filter: `assignee_id=eq.${userId}`,
        },
        () => reload()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId, reload]);

  return count;
}
