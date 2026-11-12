import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  completeConversationPlanejamento,
  fetchLembretesDueForNotify,
  formatPlanejamentoWhen,
  lembreteDueState,
  touchLembreteNotified,
} from '@/lib/atendimentoConversaPlanejamento';
import { CONVERSAS_LEMBRETES_PATH, buildConversasUrl } from '@/lib/conversasRoutes';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';

const NOTIFY_INTERVAL_MS = 10 * 60 * 1000;
const POLL_MS = 60 * 1000;

function shouldNotifyAgain(lastNotifiedAt) {
  if (!lastNotifiedAt) return true;
  return Date.now() - new Date(lastNotifiedAt).getTime() >= NOTIFY_INTERVAL_MS;
}

function toStackItem(row) {
  const state = lembreteDueState(row.scheduled_at);
  const convName =
    row.atendimento_conversas?.display_name || row.chat_jid?.replace(/@.*$/, '') || 'Conversa';
  return {
    id: row.id,
    title: row.title,
    convName,
    chatJid: row.chat_jid,
    whenLabel: formatPlanejamentoWhen(row.scheduled_at),
    state,
    scheduledAt: row.scheduled_at,
  };
}

/**
 * Lembretes persistentes na tela até fechar/abrir/concluir.
 * Reexibe a cada 10 min para quem criou o lembrete se ainda estiver pendente.
 */
export function useAtendimentoLembreteNotifications() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const runningRef = useRef(false);
  const activeIdsRef = useRef(new Set());

  const syncActiveIds = useCallback((nextItems) => {
    activeIdsRef.current = new Set(nextItems.map((i) => i.id));
  }, []);

  const dismissItem = useCallback((id) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      syncActiveIds(next);
      return next;
    });
  }, [syncActiveIds]);

  const openItem = useCallback(
    (item) => {
      dismissItem(item.id);
      if (item.chatJid) {
        navigate(
          buildConversasUrl({
            statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
            chatJid: item.chatJid,
          }),
        );
        return;
      }
      navigate(CONVERSAS_LEMBRETES_PATH);
    },
    [dismissItem, navigate],
  );

  const completeItem = useCallback(
    async (item) => {
      if (!item?.id) return;
      try {
        await completeConversationPlanejamento(item.id);
        dismissItem(item.id);
      } catch {
        /* silencioso */
      }
    },
    [dismissItem],
  );

  useEffect(() => {
    const role = profile?.role;
    const userId = profile?.id;
    if (!userId || !role || !['superadmin', 'admin', 'colaborador'].includes(role)) {
      return undefined;
    }

    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const rows = await fetchLembretesDueForNotify(userId, 15);
        const pendingIds = new Set(rows.map((r) => r.id));

        if (activeIdsRef.current.size) {
          setItems((prev) => {
            const next = prev.filter((i) => pendingIds.has(i.id));
            if (next.length !== prev.length) syncActiveIds(next);
            return next;
          });
        }

        const toAdd = [];

        for (const row of rows) {
          if (activeIdsRef.current.has(row.id)) continue;
          if (!shouldNotifyAgain(row.last_notified_at)) continue;

          await touchLembreteNotified(row.id);
          toAdd.push(toStackItem(row));

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const state = lembreteDueState(row.scheduled_at);
            const isOverdue = state === 'overdue';
            const convName =
              row.atendimento_conversas?.display_name || row.chat_jid?.replace(/@.*$/, '') || 'Conversa';
            try {
              new Notification(isOverdue ? 'Lembrete vencido' : 'Lembrete chegando', {
                body: `${row.title} — ${convName}`,
                tag: `lembrete-${row.id}`,
                requireInteraction: true,
              });
            } catch {
              /* ignore */
            }
          }
        }

        if (toAdd.length) {
          setItems((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const merged = [...prev, ...toAdd.filter((t) => !ids.has(t.id))];
            syncActiveIds(merged);
            return merged;
          });
        }
      } catch {
        /* próximo ciclo */
      } finally {
        runningRef.current = false;
      }
    };

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    run();
    const timer = setInterval(run, POLL_MS);

    const channel = supabase
      .channel(`lembrete-notify:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_conversa_planejamento',
          filter: `created_by=eq.${userId}`,
        },
        () => run(),
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.role, syncActiveIds]);

  return { items, dismissItem, openItem, completeItem };
}
