import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  atualizarStatusTopico,
  contarNaoLidos,
  criarTopicoUsuario,
  enviarMensagemUsuario,
  listarEquipeResumo,
  listarMensagens,
  listarMeusTopicos,
  marcarLido,
  pedirRespostaDot,
} from '@/lib/caixaDot';

export function useCaixaDot({ enabled = true } = {}) {
  const { profile } = useAuth();
  const pessoaId = profile?.id ?? null;
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const isAdmin = ['superadmin', 'admin'].includes(profile?.role);
  const isActiveProfile = profile?.status === 'active';
  const active = Boolean(enabled && pessoaId && isStaff && isActiveProfile);

  const [threads, setThreads] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(active);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [dotThinking, setDotThinking] = useState(false);
  const mountedRef = useRef(true);
  const selectedIdRef = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!active) {
      setThreads([]);
      setEquipe([]);
      setUnreadTotal(0);
      setError(null);
      setLoading(false);
      return [];
    }
    if (!silent) setLoading(true);
    try {
      const [nextThreads, nextUnread, nextEquipe] = await Promise.all([
        listarMeusTopicos(pessoaId),
        contarNaoLidos(pessoaId),
        isAdmin ? listarEquipeResumo() : Promise.resolve([]),
      ]);
      if (!mountedRef.current) return nextThreads;
      setThreads(nextThreads);
      setUnreadTotal(nextUnread);
      setEquipe(nextEquipe);
      setError(null);
      return nextThreads;
    } catch (loadError) {
      if (mountedRef.current) {
        setThreads([]);
        setEquipe([]);
        setUnreadTotal(0);
        setError(loadError);
      }
      return [];
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [active, isAdmin, pessoaId]);

  const askDot = useCallback(async (threadId, { retry = false } = {}) => {
    if (!threadId) return null;
    setDotThinking(true);
    if (mountedRef.current) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, status: 'aguardando_dot', last_error: null }
            : t
        )
      );
    }
    try {
      const result = await pedirRespostaDot(threadId, { retry });
      if (mountedRef.current && selectedIdRef.current === threadId) {
        const rows = await listarMensagens(threadId);
        setMessages(rows);
      }
      await reload({ silent: true });
      return result;
    } catch (dotError) {
      if (mountedRef.current) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  status: 'erro',
                  last_error: dotError?.message || 'O Dot não respondeu.',
                }
              : t
          )
        );
        setError(null);
      }
      await reload({ silent: true });
      throw dotError;
    } finally {
      if (mountedRef.current) setDotThinking(false);
    }
  }, [reload]);

  const openThread = useCallback(async (threadId) => {
    setSelectedId(threadId || null);
    if (!threadId) {
      setMessages([]);
      return [];
    }
    setLoadingMessages(true);
    try {
      const rows = await listarMensagens(threadId);
      if (mountedRef.current) setMessages(rows);
      const thread = threads.find((t) => t.id === threadId);
      if (thread?.unread_for_owner) {
        await marcarLido(threadId);
        if (mountedRef.current) {
          setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, unread_for_owner: false } : t))
          );
          setUnreadTotal((n) => Math.max(0, n - 1));
        }
      }
      return rows;
    } catch (openError) {
      if (mountedRef.current) setError(openError);
      return [];
    } finally {
      if (mountedRef.current) setLoadingMessages(false);
    }
  }, [threads]);

  const createThread = useCallback(async ({ title, body }) => {
    if (!pessoaId) throw new Error('Sessão inválida.');
    setSending(true);
    try {
      const thread = await criarTopicoUsuario({ ownerId: pessoaId, title, body });
      await reload({ silent: true });
      await openThread(thread.id);
      if (body && String(body).trim()) {
        try {
          await askDot(thread.id);
        } catch {
          /* erro já fica no tópico */
        }
      }
      return thread;
    } finally {
      setSending(false);
    }
  }, [askDot, openThread, pessoaId, reload]);

  const sendMessage = useCallback(async (body) => {
    if (!pessoaId || !selectedId) throw new Error('Selecione um tópico.');
    setSending(true);
    try {
      const msg = await enviarMensagemUsuario({
        threadId: selectedId,
        ownerId: pessoaId,
        body,
      });
      if (mountedRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
      await reload({ silent: true });
      try {
        await askDot(selectedId);
      } catch {
        /* erro já fica no tópico */
      }
      return msg;
    } finally {
      setSending(false);
    }
  }, [askDot, pessoaId, reload, selectedId]);

  const retryDot = useCallback(async () => {
    if (!selectedId) throw new Error('Selecione um tópico.');
    return askDot(selectedId, { retry: true });
  }, [askDot, selectedId]);

  const setStatus = useCallback(async (threadId, status) => {
    const updated = await atualizarStatusTopico(threadId, status);
    await reload({ silent: true });
    if (selectedId === threadId && (status === 'arquivada' || status === 'feita')) {
      setSelectedId(null);
      setMessages([]);
    }
    return updated;
  }, [reload, selectedId]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return {
    threads,
    equipe,
    messages,
    selectedId,
    unreadTotal,
    loading,
    loadingMessages,
    error,
    sending,
    dotThinking,
    isAdmin,
    reload,
    openThread,
    createThread,
    sendMessage,
    retryDot,
    setStatus,
  };
}

export function useCaixaDotBadge() {
  const { profile } = useAuth();
  const pessoaId = profile?.id ?? null;
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const active = Boolean(pessoaId && isStaff && profile?.status === 'active');
  const [badgeTotal, setBadgeTotal] = useState(0);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setBadgeTotal(0);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    contarNaoLidos(pessoaId)
      .then((n) => {
        if (!cancelled) setBadgeTotal(n);
      })
      .catch(() => {
        if (!cancelled) setBadgeTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, pessoaId]);

  return { badgeTotal, loading };
}
