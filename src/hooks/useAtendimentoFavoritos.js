import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  filterAtendimentoConversationsForUser,
} from '@/lib/atendimentoUsuarioAcesso';
import { mergeConversationForFavorito } from '@/lib/atendimentoFavoritos';
import {
  ensureAtendimentoIncomingAlertsRealtime,
  subscribeAtendimentoBadgeRefresh,
} from '@/lib/atendimentoIncomingAlertsRealtime';

export function useAtendimentoFavoritos({
  clienteId,
  userId,
  role,
  userAccess = [],
  filaCanaisByConfigId,
}) {
  const [favoriteRows, setFavoriteRows] = useState([]);
  const [conversationsById, setConversationsById] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const enabled = Boolean(clienteId && userId);

  const loadFavoritos = useCallback(async () => {
    if (!enabled) {
      setFavoriteRows([]);
      setConversationsById(new Map());
      return;
    }

    setLoading(true);
    try {
      const { data: favData, error: favError } = await supabase
        .from('atendimento_conversa_favorita')
        .select('id, conversation_id, sort_order, created_at')
        .eq('user_id', userId)
        .eq('cliente_id', clienteId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (favError) {
        console.error('[useAtendimentoFavoritos] load favorites', favError);
        setFavoriteRows([]);
        setConversationsById(new Map());
        return;
      }

      const rows = favData || [];
      setFavoriteRows(rows);

      const ids = rows.map((r) => r.conversation_id).filter(Boolean);
      if (!ids.length) {
        setConversationsById(new Map());
        return;
      }

      const { data: convData, error: convError } = await supabase
        .from('atendimento_conversas')
        .select('*')
        .in('id', ids)
        .is('archived_at', null);

      if (convError) {
        console.error('[useAtendimentoFavoritos] load conversations', convError);
        setConversationsById(new Map());
        return;
      }

      const accessible = filterAtendimentoConversationsForUser({
        role,
        userAccess,
        clienteId,
        conversations: convData || [],
        filaCanaisByConfigId,
      });

      setConversationsById(new Map(accessible.map((c) => [c.id, c])));
    } finally {
      setLoading(false);
    }
  }, [enabled, clienteId, userId, role, userAccess, filaCanaisByConfigId]);

  useEffect(() => {
    loadFavoritos();
  }, [loadFavoritos]);

  useEffect(() => {
    if (!enabled || !clienteId) return undefined;

    const unsubscribe = subscribeAtendimentoBadgeRefresh(() => {
      loadFavoritos();
    });
    ensureAtendimentoIncomingAlertsRealtime([clienteId]);

    return unsubscribe;
  }, [enabled, clienteId, loadFavoritos]);

  const favoriteConversationIds = useMemo(
    () => favoriteRows.map((r) => r.conversation_id).filter(Boolean),
    [favoriteRows],
  );
  const favoriteIdsKey = favoriteConversationIds.join(',');

  /** Atualiza contadores assim que atendimento_conversas mudar (sem esperar reload completo). */
  useEffect(() => {
    if (!enabled || !clienteId || !favoriteConversationIds.length) return undefined;

    const favIdSet = new Set(favoriteConversationIds);
    const channel = supabase
      .channel(`atendimento-fav-live:${userId}:${clienteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_conversas',
          filter: `cliente_id=eq.${clienteId}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row?.id || !favIdSet.has(row.id)) return;
          setConversationsById((prev) => {
            const next = new Map(prev);
            const existing = next.get(row.id);
            next.set(row.id, mergeConversationForFavorito(existing, row));
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cliente_whatsapp_inbox',
          filter: `cliente_id=eq.${clienteId}`,
        },
        (payload) => {
          const convId = payload.new?.conversation_id;
          if (!convId || !favIdSet.has(convId)) return;
          loadFavoritos();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, clienteId, userId, favoriteIdsKey, favoriteConversationIds, loadFavoritos]);

  const favoriteIdSet = useMemo(
    () => new Set(favoriteRows.map((r) => r.conversation_id)),
    [favoriteRows],
  );

  const favorites = useMemo(
    () =>
      favoriteRows
        .map((row) => conversationsById.get(row.conversation_id))
        .filter(Boolean),
    [favoriteRows, conversationsById],
  );

  const isFavorite = useCallback(
    (conversationId) => Boolean(conversationId && favoriteIdSet.has(conversationId)),
    [favoriteIdSet],
  );

  const toggleFavorite = useCallback(
    async (conversation) => {
      if (!enabled || !conversation?.id) return { error: 'Conversa inválida' };

      const conversationId = conversation.id;
      const currently = favoriteIdSet.has(conversationId);
      setTogglingId(conversationId);

      try {
        if (currently) {
          const { error } = await supabase
            .from('atendimento_conversa_favorita')
            .delete()
            .eq('user_id', userId)
            .eq('conversation_id', conversationId);
          if (error) return { error: error.message };
        } else {
          const { error } = await supabase.from('atendimento_conversa_favorita').insert({
            user_id: userId,
            cliente_id: clienteId,
            conversation_id: conversationId,
            sort_order: favoriteRows.length,
          });
          if (error) return { error: error.message };
        }

        await loadFavoritos();
        return { error: null, favorited: !currently };
      } finally {
        setTogglingId(null);
      }
    },
    [enabled, userId, clienteId, favoriteIdSet, favoriteRows.length, loadFavoritos],
  );

  return {
    favorites,
    loading,
    togglingId,
    isFavorite,
    toggleFavorite,
    reload: loadFavoritos,
  };
}
