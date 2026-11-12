import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  cancelConversationPlanejamento,
  completeConversationPlanejamento,
  fetchConversationPlanejamento,
  fetchConversationTasks,
} from '@/lib/atendimentoConversaPlanejamento';

export function useAtendimentoConversaPlanejamento(conversationId) {
  const [tasks, setTasks] = useState([]);
  const [lembretes, setLembretes] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setTasks([]);
      setLembretes([]);
      return;
    }
    setLoading(true);
    try {
      const [taskRows, lembreteRows] = await Promise.all([
        fetchConversationTasks(conversationId),
        fetchConversationPlanejamento(conversationId),
      ]);
      setTasks(taskRows);
      setLembretes(lembreteRows);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const ch = supabase
      .channel(`atendimento-planejamento:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_conversa_planejamento',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => reload()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tarefas',
          filter: `atendimento_conversation_id=eq.${conversationId}`,
        },
        () => reload()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [conversationId, reload]);

  const cancelLembrete = useCallback(
    async (id) => {
      await cancelConversationPlanejamento(id);
      await reload();
    },
    [reload]
  );

  const completeLembrete = useCallback(
    async (id) => {
      await completeConversationPlanejamento(id);
      await reload();
    },
    [reload]
  );

  return { tasks, lembretes, loading, reload, cancelLembrete, completeLembrete };
}
