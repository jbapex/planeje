import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  filterAtendimentoConversationsForUser,
  filterAtendimentoChannelsForUser,
  filterAtendimentoFilasForUser,
} from '@/lib/atendimentoUsuarioAcesso';
import { jidPhoneDigits } from '@/lib/uazapiMessageBody';
import { mapInboxRowToThreadMessage, mapSentRowToThreadMessage, enrichThreadMessages, mergeSentRowIntoMessages, mergeInboxRowIntoMessages, patchMessageAcks, createOptimisticOutgoingMessage, enrichMessagesWithGroupAvatars } from '@/lib/atendimentoMessageUtils';
import { loadGroupParticipantAvatarMap } from '@/lib/groupParticipantDisplay';
import {
  applyThreadPhotos,
  photoTargetsFromThread,
  refreshAtendimentoPhotos,
  storedPhotoIsStale,
} from '@/lib/atendimentoFotos';
import { syncMessageAckStatuses } from '@/lib/atendimentoMessageActions';
import { slaMedeConversa } from '@/lib/atendimentoGrupoResponsavel';
import { aplicarNomeEquipe } from '@/lib/atendimentoGrupoIdentidade';
import { isCsGroupMessage, scopeCsGroupMessages } from '@/lib/csIaGroupNavigation';
import {
  readAtendimentoThreadCache,
  writeAtendimentoThreadCache,
} from '@/lib/atendimentoThreadCache';
import {
  ATENDIMENTO_THREAD_PAGE_SIZE,
  ATENDIMENTO_THREAD_UNREAD_MAX_PAGES,
  applyLatestWindow,
  firstUnreadMessageId,
  inboundCount,
  mergeThreadPages,
  oldestCreatedAt,
  pageHasOlder,
  tailMessages,
  takeNewestByCreatedAt,
} from '@/lib/atendimentoThreadPage';
import {
  mergeGroupConversationsForList,
  getGroupConversationUpdateIds,
  dedupeInboxRowsForGroup,
  dedupeSentRowsForGroup,
  dedupeThreadMessagesForGroup,
  applyGroupThreadDedupe,
} from '@/lib/atendimentoGroupConversationDedup';

const INBOX_SELECT =
  'id, body, msg_timestamp, created_at, sender_name, sender_jid, is_group, group_name, chat_jid, from_jid, type, raw_payload, conversation_id, message_id, whatsapp_config_id, media_purged_at, profile_pic_url, phone';
const SENT_SELECT =
  'id, body, created_at, sent_by, chat_jid, to_jid, conversation_id, message_id, whatsapp_config_id, ack_status, uazapi_internal_id';

function quoteJidForFilter(jid) {
  if (!jid) return '';
  return `"${String(jid).replace(/"/g, '""')}"`;
}

function threadRowMatchesConversation(row, conversationId, chatJid) {
  if (!row) return false;
  if (conversationId && row.conversation_id === conversationId) return true;
  if (!chatJid) return false;
  const digits = jidPhoneDigits(chatJid);
  for (const candidate of [row.chat_jid, row.from_jid, row.to_jid]) {
    if (!candidate) continue;
    if (candidate === chatJid) return true;
    if (digits && jidPhoneDigits(candidate) === digits) return true;
  }
  return false;
}

async function pullLatestRows(buildQuery, { before, limit }) {
  let query = buildQuery();
  if (before) query = query.lt('created_at', before);
  const { data } = await query
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data || [];
}

async function fetchCsGroupRows(table, select, address, scope, { before, limit }) {
  const rows = await pullLatestRows(
    () => scopeCsGroupMessages(supabase.from(table).select(`${select},cliente_id`), scope, address),
    { before, limit },
  );
  return { rows: rows.filter((row) => isCsGroupMessage(row, scope)), sourceLengths: [rows.length] };
}

async function fetchInboxRows(clienteId, conversation, { before = null, limit = ATENDIMENTO_THREAD_PAGE_SIZE, csGroup } = {}) {
  if (csGroup) return fetchCsGroupRows('cliente_whatsapp_inbox', INBOX_SELECT, 'from_jid', csGroup, { before, limit });
  const chatJid = conversation?.chat_jid;
  const convId = conversation?.id;
  const rowsById = new Map();
  const sourceLengths = [];

  const addRows = (rows) => {
    sourceLengths.push(rows.length);
    rows.forEach((row) => rowsById.set(row.id, row));
  };

  if (convId) {
    addRows(await pullLatestRows(
      () => supabase.from('cliente_whatsapp_inbox').select(INBOX_SELECT).eq('cliente_id', clienteId).eq('conversation_id', convId),
      { before, limit },
    ));
  }

  if (chatJid) {
    const q = quoteJidForFilter(chatJid);
    addRows(await pullLatestRows(
      () => supabase.from('cliente_whatsapp_inbox').select(INBOX_SELECT).eq('cliente_id', clienteId).or(`chat_jid.eq.${q},from_jid.eq.${q}`),
      { before, limit },
    ));
  }

  const digits = jidPhoneDigits(chatJid);
  if (!conversation?.is_group && digits.length >= 10) {
    addRows(await pullLatestRows(
      () => supabase.from('cliente_whatsapp_inbox').select(INBOX_SELECT).eq('cliente_id', clienteId).eq('phone', digits),
      { before, limit },
    ));
  }

  let rows = Array.from(rowsById.values());
  if (conversation?.is_group) {
    rows = dedupeInboxRowsForGroup(rows, {
      preferWhatsappConfigId: conversation.whatsapp_config_id || null,
    });
  }

  return { rows, sourceLengths };
}

async function fetchSentRows(clienteId, conversation, { before = null, limit = ATENDIMENTO_THREAD_PAGE_SIZE, csGroup } = {}) {
  if (csGroup) return fetchCsGroupRows('cliente_whatsapp_sent', SENT_SELECT, 'to_jid', csGroup, { before, limit });
  const chatJid = conversation?.chat_jid;
  const convId = conversation?.id;
  const rowsById = new Map();
  const sourceLengths = [];

  const addRows = (rows) => {
    sourceLengths.push(rows.length);
    rows.forEach((row) => rowsById.set(row.id, row));
  };

  if (convId) {
    addRows(await pullLatestRows(
      () => supabase.from('cliente_whatsapp_sent').select(SENT_SELECT).eq('cliente_id', clienteId).eq('conversation_id', convId),
      { before, limit },
    ));
  }

  if (chatJid) {
    const q = quoteJidForFilter(chatJid);
    addRows(await pullLatestRows(
      () => supabase.from('cliente_whatsapp_sent').select(SENT_SELECT).eq('cliente_id', clienteId).or(`chat_jid.eq.${q},to_jid.eq.${q}`),
      { before, limit },
    ));
  }

  let rows = Array.from(rowsById.values());
  if (conversation?.is_group) {
    rows = dedupeSentRowsForGroup(rows, {
      preferWhatsappConfigId: conversation.whatsapp_config_id || null,
    });
  }

  return { rows, sourceLengths };
}

async function fetchThreadPage(clienteId, conversation, before, equipe, csGroup) {
  const limit = ATENDIMENTO_THREAD_PAGE_SIZE;
  const [inbox, sent] = await Promise.all([
    fetchInboxRows(clienteId, conversation, { before, limit, csGroup }),
    fetchSentRows(clienteId, conversation, { before, limit, csGroup }),
  ]);
  const incoming = (inbox.rows || []).map(mapInboxRowToThreadMessage).filter(Boolean);
  const outgoing = (sent.rows || []).map(mapSentRowToThreadMessage);
  let merged = enrichThreadMessages(
    [...incoming, ...outgoing].sort(
      (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime(),
    ),
    inbox.rows || [],
  );
  if (conversation?.is_group) {
    const avatarMap = await loadGroupParticipantAvatarMap(supabase, clienteId, inbox.rows || []);
    merged = enrichMessagesWithGroupAvatars(merged, inbox.rows || [], avatarMap);
  }
  merged = applyGroupThreadDedupe(merged, conversation);
  merged = aplicarNomeEquipe(merged, equipe || []);
  const sliced = takeNewestByCreatedAt(merged, limit);
  const hasOlder = pageHasOlder(
    [...(inbox.sourceLengths || []), ...(sent.sourceLengths || [])],
    limit,
    merged.length,
  ) || sliced.truncated;
  return { messages: sliced.page, hasOlder };
}

export const ATENDIMENTO_STATUS = {
  AGUARDANDO: 'aguardando',
  EM_ATENDIMENTO: 'em_atendimento',
  RESOLVIDO: 'resolvido',
};

export function formatAtendimentoTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function useAtendimentoConversations({
  clienteId,
  statusTab,
  channelFilter,
  filaFilter,
  onlyMine,
  blockedOnly = false,
  role,
  userAccess = [],
  filaCanaisByConfigId,
  exactConversationId,
}) {
  const { profile } = useAuth();
  const accessRole = role ?? profile?.role ?? null;
  const filaCanaisMap = filaCanaisByConfigId ?? new Map();

  const filterAccessibleConversations = useCallback(
    (rows = []) =>
      filterAtendimentoConversationsForUser({
        role: accessRole,
        userAccess,
        clienteId,
        conversations: rows,
        filaCanaisByConfigId: filaCanaisMap,
      }),
    [accessRole, userAccess, clienteId, filaCanaisMap],
  );
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filas, setFilas] = useState([]);
  const [channels, setChannels] = useState([]);
  const [counts, setCounts] = useState({ aguardando: 0, em_atendimento: 0, resolvido: 0 });
  const [blockedCount, setBlockedCount] = useState(0);

  const loadMeta = useCallback(async () => {
    if (!clienteId) {
      setFilas([]);
      setChannels([]);
      return;
    }
    const [filasRes, channelsRes] = await Promise.all([
      supabase.from('atendimento_filas').select('id, name, sla_primeira_resposta_minutos').eq('cliente_id', clienteId).order('sort_order'),
      supabase.from('cliente_whatsapp_config').select('id, name, subdomain, instance_status, archived_at').eq('cliente_id', clienteId).is('archived_at', null).order('created_at'),
    ]);
    setFilas(filasRes.data || []);
    setChannels(
      filterAtendimentoChannelsForUser({
        role: accessRole,
        userAccess,
        clienteId,
        channels: channelsRes.data || [],
        filaCanaisByConfigId: filaCanaisMap,
      }),
    );
  }, [clienteId, accessRole, userAccess, filaCanaisMap]);

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!clienteId) {
      setConversations([]);
      setCounts({ aguardando: 0, em_atendimento: 0, resolvido: 0 });
      setBlockedCount(0);
      return;
    }
    if (!silent) setLoading(true);
    let query = supabase
      .from('atendimento_conversas')
      .select('*')
      .eq('cliente_id', clienteId)
      .is('archived_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (blockedOnly) query = query.eq('bloqueada', true);
    else query = query.eq('bloqueada', false);
    if (!blockedOnly && statusTab) query = query.eq('status', statusTab);
    if (channelFilter && channelFilter !== 'all') query = query.eq('whatsapp_config_id', channelFilter);
    if (filaFilter && filaFilter !== 'all') query = query.eq('fila_id', filaFilter);
    if (onlyMine && profile?.id) query = query.eq('assigned_to', profile.id);

    const [listRes, countRes] = await Promise.all([
      query,
      supabase
        .from('atendimento_conversas')
        .select('status, fila_id, whatsapp_config_id, cliente_id, archived_at, is_group, chat_jid, bloqueada')
        .eq('cliente_id', clienteId)
        .is('archived_at', null),
    ]);

    if (!silent) setLoading(false);
    const liveList = (listRes.data || []).filter((row) => !row.archived_at);
    const accessibleList = listRes.error ? [] : filterAccessibleConversations(liveList);
    const dedupedList = mergeGroupConversationsForList(accessibleList, { channelFilter });
    setConversations(dedupedList);

    const accessibleAll = countRes.error
      ? []
      : filterAccessibleConversations((countRes.data || []).filter((row) => !row.archived_at));
    const liveCounts = accessibleAll.filter((row) => !row.bloqueada);
    setBlockedCount(accessibleAll.filter((row) => row.bloqueada).length);
    const accessibleCounts = liveCounts;
    const dedupedCounts = mergeGroupConversationsForList(accessibleCounts, { channelFilter });
    const nextCounts = { aguardando: 0, em_atendimento: 0, resolvido: 0 };
    dedupedCounts.forEach((row) => {
      if (row.status && nextCounts[row.status] !== undefined) nextCounts[row.status] += 1;
    });
    setCounts(nextCounts);
  }, [
    clienteId,
    statusTab,
    channelFilter,
    filaFilter,
    onlyMine,
    blockedOnly,
    profile?.id,
    filterAccessibleConversations,
  ]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!clienteId || !conversations.length) return undefined;
    const items = conversations
      .filter((conv) => conv.chat_jid && conv.whatsapp_config_id && storedPhotoIsStale(conv.profile_pic_url))
      .slice(0, 12)
      .map((conv) => ({
        jid: conv.chat_jid,
        whatsapp_config_id: conv.whatsapp_config_id,
      }));
    if (!items.length) return undefined;
    let cancelled = false;
    refreshAtendimentoPhotos(items).then((photos) => {
      if (cancelled) return;
      const urls = new Map(photos.filter((photo) => photo.url).map((photo) => [photo.jid, photo.url]));
      if (!urls.size) return;
      setConversations((prev) => {
        let changed = false;
        const next = prev.map((conv) => {
          const url = urls.get(conv.chat_jid);
          if (!url || conv.profile_pic_url === url) return conv;
          changed = true;
          return { ...conv, profile_pic_url: url };
        });
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [clienteId, conversations]);

  useEffect(() => {
    if (!clienteId) return;
    const ch = supabase
      .channel(`atendimento-conversas:${clienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atendimento_conversas', filter: `cliente_id=eq.${clienteId}` },
        () => loadConversations({ silent: true })
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [clienteId, loadConversations]);

  const resolveConversationIds = useCallback((conversationOrId) => {
    const id = typeof conversationOrId === 'object' ? conversationOrId?.id : conversationOrId;
    if (exactConversationId && id === exactConversationId) return [exactConversationId];
    if (typeof conversationOrId === 'object' && conversationOrId?.id) {
      const direct = getGroupConversationUpdateIds(conversationOrId);
      if (direct.length > 1) return direct;
      if (conversationOrId.is_group && conversationOrId.chat_jid) {
        const primary = conversations.find(
          (c) => c.is_group && c.chat_jid === conversationOrId.chat_jid,
        );
        if (primary) return getGroupConversationUpdateIds(primary);
      }
      return direct;
    }
    const found = conversations.find((c) => c.id === conversationOrId);
    if (found) return getGroupConversationUpdateIds(found);
    return conversationOrId ? [conversationOrId] : [];
  }, [conversations, exactConversationId]);

  const assumeConversation = useCallback(async (conversationOrId) => {
    if (!profile?.id) return { error: 'Usuário não identificado' };
    const ids = resolveConversationIds(conversationOrId);
    if (!ids.length) return { error: 'Conversa não identificada' };
    const { error } = await supabase
      .from('atendimento_conversas')
      .update({
        status: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        assigned_to: profile.id,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (!error) await loadConversations();
    return { error: error?.message };
  }, [profile?.id, loadConversations, resolveConversationIds]);

  const reopenConversation = useCallback(async (conversationOrId) => {
    if (!profile?.id) return { error: 'Usuário não identificado' };
    const ids = resolveConversationIds(conversationOrId);
    if (!ids.length) return { error: 'Conversa não identificada' };
    const { error } = await supabase
      .from('atendimento_conversas')
      .update({
        status: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        assigned_to: profile.id,
        resolved_at: null,
        resolved_by: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (!error) await loadConversations();
    return { error: error?.message };
  }, [profile?.id, loadConversations, resolveConversationIds]);

  const resolveConversation = useCallback(async (conversationOrId) => {
    if (!profile?.id) return { error: 'Usuário não identificado' };
    const ids = resolveConversationIds(conversationOrId);
    if (!ids.length) return { error: 'Conversa não identificada' };
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('atendimento_conversas')
      .update({
        status: ATENDIMENTO_STATUS.RESOLVIDO,
        resolved_at: now,
        resolved_by: profile.id,
        unread_count: 0,
        awaiting_response_since: null,
        updated_at: now,
      })
      .in('id', ids);
    if (!error) await loadConversations();
    return { error: error?.message };
  }, [profile?.id, loadConversations, resolveConversationIds]);

  const transferConversation = useCallback(async (conversationOrId, assigneeId) => {
    const ids = resolveConversationIds(conversationOrId);
    if (!ids.length || !assigneeId) return { error: 'Dados inválidos' };
    const { error } = await supabase
      .from('atendimento_conversas')
      .update({
        status: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        assigned_to: assigneeId,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (!error) await loadConversations();
    return { error: error?.message };
  }, [loadConversations, resolveConversationIds]);

  const markConversationRead = useCallback(async (conversationOrId) => {
    const ids = resolveConversationIds(conversationOrId);
    if (!ids.length) return;
    await supabase
      .from('atendimento_conversas')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .in('id', ids);
  }, [resolveConversationIds]);

  return {
    conversations,
    loading,
    filas,
    channels,
    counts,
    blockedCount,
    loadConversations,
    assumeConversation,
    reopenConversation,
    resolveConversation,
    transferConversation,
    markConversationRead,
  };
}

function mergeThreadMessagesPreservingRefs(prev, next) {
  if (!prev?.length) return next;
  if (!next?.length) return next;
  const prevById = new Map(prev.map((m) => [m.id, m]));
  let changed = prev.length !== next.length;
  const merged = next.map((m) => {
    const old = prevById.get(m.id);
    if (!old) {
      changed = true;
      return m;
    }
    if (
      old.ack === m.ack
      && old.body === m.body
      && old.deleted === m.deleted
      && old.optimistic === m.optimistic
      && old.kind === m.kind
      && JSON.stringify(old.reactions) === JSON.stringify(m.reactions)
      && JSON.stringify(old.media) === JSON.stringify(m.media)
    ) {
      return old;
    }
    changed = true;
    const mergedMsg = { ...old, ...m };
    if (old.senderAvatarUrl && !storedPhotoIsStale(old.senderAvatarUrl)) {
      mergedMsg.senderAvatarUrl = old.senderAvatarUrl;
    }
    return mergedMsg;
  });
  return changed ? merged : prev;
}

export function useAtendimentoThread({ clienteId, conversation, csGroup }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [unreadAnchorId, setUnreadAnchorId] = useState(null);
  const [entryToken, setEntryToken] = useState('');
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const equipeRef = useRef([]);
  const generationRef = useRef(0);
  const latestWindowRef = useRef(new Set());
  const hasOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const entrySetForRef = useRef('');

  useEffect(() => {
    if (!clienteId) {
      equipeRef.current = [];
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('atendimento_grupo_remetente_interno')
      .select('label, phone, sender_jid, profile_id')
      .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
      .then(({ data }) => {
        if (cancelled) return;
        equipeRef.current = data || [];
        setMessages((prev) => aplicarNomeEquipe(prev, equipeRef.current));
      });
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  const conversationId = conversation?.id ?? null;
  const chatJid = conversation?.chat_jid ?? null;
  const convKey = csGroup && conversationId ? `cs:${conversationId}:${csGroup.channelId}`
    : conversation?.is_group && chatJid ? chatJid : conversationId || chatJid || '';

  const dedupeGroupMessages = useCallback(
    (list) => applyGroupThreadDedupe(list, conversationRef.current),
    [],
  );

  const rememberLatestWindow = (list) => {
    const newest = takeNewestByCreatedAt(list, ATENDIMENTO_THREAD_PAGE_SIZE).page;
    latestWindowRef.current = new Set(newest.map((message) => message.id));
  };

  const loadThread = useCallback(async ({ silent = false } = {}) => {
    const conv = conversationRef.current;
    const generation = generationRef.current;
    if (!clienteId || !conv) {
      setMessages([]);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const page = await fetchThreadPage(clienteId, conv, null, equipeRef.current, csGroup);
      if (generation !== generationRef.current) return;
      setMessages((prev) => {
        const pending = prev.filter((message) => (message.optimistic || message.upload) && !page.messages.some((item) => item.id === message.id));
        let next = applyLatestWindow(prev, page.messages, latestWindowRef.current);
        next = mergeThreadMessagesPreservingRefs(prev, next);
        if (pending.length) next = mergeThreadPages(next, pending);
        next = applyGroupThreadDedupe(next, conv);
        return next;
      });
      rememberLatestWindow(page.messages);
    } finally {
      if (!silent && generation === generationRef.current) setLoading(false);
    }
  }, [clienteId, csGroup]);

  const loadOlder = useCallback(async () => {
    const conv = conversationRef.current;
    const generation = generationRef.current;
    if (!clienteId || !conv || loadingOlderRef.current || !hasOlderRef.current) return;
    const before = oldestCreatedAt(messagesRef.current);
    if (!before) {
      hasOlderRef.current = false;
      setHasOlder(false);
      return;
    }
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchThreadPage(clienteId, conv, before, equipeRef.current, csGroup);
      if (generation !== generationRef.current) return;
      const known = new Set((messagesRef.current || []).map((message) => message.id));
      const added = page.messages.filter((message) => message?.id && !known.has(message.id));
      if (added.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((message) => message.id));
          const fresh = page.messages.filter((message) => message?.id && !ids.has(message.id));
          if (!fresh.length) return prev;
          return applyGroupThreadDedupe(mergeThreadPages(fresh, prev), conv);
        });
      }
      const more = added.length > 0 && page.hasOlder;
      hasOlderRef.current = more;
      setHasOlder(more);
    } finally {
      if (generation === generationRef.current) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [clienteId, csGroup]);

  const appendOptimistic = useCallback((msg) => {
    setMessages((prev) =>
      [...prev, msg].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())
    );
  }, []);

  const confirmOptimistic = useCallback((clientTempId, sentRow) => {
    setMessages((prev) => {
      const withoutDup = prev.filter((m) => !(m.id === sentRow.id && m.id !== clientTempId));
      const base = withoutDup.filter((m) => m.clientTempId !== clientTempId && m.id !== clientTempId);
      return mergeSentRowIntoMessages(base, sentRow);
    });
  }, []);

  const removeOptimistic = useCallback((clientTempId) => {
    setMessages((prev) => prev.filter((m) => m.clientTempId !== clientTempId && m.id !== clientTempId));
  }, []);

  const patchOptimistic = useCallback((clientTempId, patch) => {
    setMessages((prev) => prev.map((m) => {
      if (m.clientTempId !== clientTempId && m.id !== clientTempId) return m;
      const next = { ...m, ...patch };
      if (patch.upload && typeof patch.upload === 'object') {
        next.upload = { ...(m.upload || {}), ...patch.upload };
      }
      return next;
    }));
  }, []);

  useEffect(() => {
    const conv = conversationRef.current;
    if (!clienteId || !conv || !messages.length) return undefined;
    const items = photoTargetsFromThread(conv, messages);
    if (!items.length) return undefined;
    let cancelled = false;
    refreshAtendimentoPhotos(items).then((photos) => {
      if (cancelled) return;
      const groupUrl = photos.find((photo) => photo.jid === conv.chat_jid && photo.url)?.url;
      if (groupUrl && storedPhotoIsStale(conv.profile_pic_url)) {
        conv.profile_pic_url = groupUrl;
      }
      setMessages((prev) => applyThreadPhotos(prev, photos));
    });
    return () => {
      cancelled = true;
    };
  }, [clienteId, convKey, messages]);

  useEffect(() => {
    if (!clienteId || !convKey) {
      setMessages([]);
      setHasOlder(false);
      hasOlderRef.current = false;
      setUnreadAnchorId(null);
      setEntryToken('');
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    entrySetForRef.current = '';
    latestWindowRef.current = new Set();
    hasOlderRef.current = false;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHasOlder(false);
    setUnreadAnchorId(null);
    setEntryToken('');
    const unreadAtOpen = Number(conversationRef.current?.unread_count) || 0;
    const cached = csGroup ? null : readAtendimentoThreadCache(clienteId, convKey);
    if (cached?.length) {
      const tail = tailMessages(cached, ATENDIMENTO_THREAD_PAGE_SIZE);
      setMessages(applyGroupThreadDedupe(tail, conversationRef.current));
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    let cancelled = false;
    (async () => {
      try {
        const conv = conversationRef.current;
        let page = await fetchThreadPage(clienteId, conv, null, equipeRef.current, csGroup);
        if (cancelled || generation !== generationRef.current) return;
        let combined = page.messages;
        let more = page.hasOlder;
        let pages = 1;
        while (
          unreadAtOpen > inboundCount(combined)
          && more
          && pages < ATENDIMENTO_THREAD_UNREAD_MAX_PAGES
        ) {
          const before = oldestCreatedAt(combined);
          if (!before) break;
          const older = await fetchThreadPage(clienteId, conv, before, equipeRef.current, csGroup);
          if (cancelled || generation !== generationRef.current) return;
          const known = new Set(combined.map((message) => message.id));
          const added = older.messages.filter((message) => message?.id && !known.has(message.id));
          if (!added.length) {
            more = false;
            break;
          }
          combined = mergeThreadPages(added, combined);
          more = older.hasOlder;
          pages += 1;
        }
        if (cancelled || generation !== generationRef.current) return;
        rememberLatestWindow(combined);
        hasOlderRef.current = more;
        setHasOlder(more);
        setMessages((prev) => {
          const pending = prev.filter((message) => message.optimistic || message.upload);
          const next = pending.length ? mergeThreadPages(combined, pending) : combined;
          return applyGroupThreadDedupe(next, conv);
        });
        if (entrySetForRef.current !== convKey) {
          entrySetForRef.current = convKey;
          const anchor = firstUnreadMessageId(combined, unreadAtOpen);
          setUnreadAnchorId(anchor);
          setEntryToken(`${convKey}|${anchor || 'end'}`);
        }
      } finally {
        if (!cancelled && generation === generationRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clienteId, convKey, csGroup]);

  useEffect(() => {
    if (csGroup || !clienteId || !convKey || !messages.length) return;
    const tail = tailMessages(messages, ATENDIMENTO_THREAD_PAGE_SIZE);
    if (tail.length) writeAtendimentoThreadCache(clienteId, convKey, tail);
  }, [clienteId, convKey, messages, csGroup]);

  const pendingAckKey = messages
    .filter((msg) => msg.direction === 'out' && !msg.deleted && !msg.optimistic && msg.ack !== 'read')
    .map((msg) => msg.id)
    .join(',');

  useEffect(() => {
    if (!clienteId || !conversationId || !pendingAckKey) return;

    let cancelled = false;
    const runSync = async () => {
      try {
        const result = await syncMessageAckStatuses({
          conversation: conversationRef.current,
          clienteId,
        });
        if (!cancelled && result?.updates?.length) {
          setMessages((prev) => patchMessageAcks(prev, result.updates));
        }
      } catch {
        // silencioso
      }
    };

    runSync();
    const timer = setInterval(runSync, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clienteId, conversationId, pendingAckKey]);

  useEffect(() => {
    if (!clienteId || (!chatJid && !conversationId)) return;
    const matchesThread = (row) => csGroup ? isCsGroupMessage(row, csGroup) : threadRowMatchesConversation(row, conversationId, chatJid);
    const ch = supabase
      .channel(`atendimento-thread:${clienteId}:${conversationId || chatJid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_inbox', filter: `cliente_id=eq.${clienteId}` },
        (payload) => {
          if (!matchesThread(payload.new)) return;
          setMessages((prev) => aplicarNomeEquipe(
            dedupeGroupMessages(mergeInboxRowIntoMessages(prev, payload.new)),
            equipeRef.current,
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_sent', filter: `cliente_id=eq.${clienteId}` },
        (payload) => {
          if (!matchesThread(payload.new)) return;
          setMessages((prev) => dedupeGroupMessages(mergeSentRowIntoMessages(prev, payload.new)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cliente_whatsapp_sent', filter: `cliente_id=eq.${clienteId}` },
        (payload) => {
          const row = payload.new;
          if (!matchesThread(row)) return;
          setMessages((prev) => patchMessageAcks(prev, [{ id: row.id, ack_status: row.ack_status }]));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [clienteId, chatJid, conversationId, dedupeGroupMessages, csGroup]);

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    loadOlder,
    unreadAnchorId,
    entryToken,
    conversationKey: convKey,
    loadThread,
    appendOptimistic,
    confirmOptimistic,
    removeOptimistic,
    patchOptimistic,
  };
}

export function useAtendimentoSlaAlerts({ clienteId, conversations, filas }) {
  const alertedRef = useRef(new Set());
  const filaSlaMap = useRef({});

  useEffect(() => {
    const map = {};
    (filas || []).forEach((f) => {
      map[f.id] = f.sla_primeira_resposta_minutos ?? 5;
    });
    filaSlaMap.current = map;
  }, [filas]);

  const overdueConversations = (conversations || []).filter((conv) => {
    if (!slaMedeConversa(conv)) return false;
    if (conv.status !== ATENDIMENTO_STATUS.AGUARDANDO && conv.status !== ATENDIMENTO_STATUS.EM_ATENDIMENTO) return false;
    if (!conv.last_customer_message_at) return false;
    if (conv.first_response_at) return false;
    const slaMin = conv.fila_id ? (filaSlaMap.current[conv.fila_id] ?? 5) : 5;
    const elapsed = Date.now() - new Date(conv.last_customer_message_at).getTime();
    return elapsed > slaMin * 60 * 1000;
  });

  const getSlaMinutes = useCallback((conv) => {
    return conv?.fila_id ? (filaSlaMap.current[conv.fila_id] ?? 5) : 5;
  }, []);

  const isOverdue = useCallback((conv) => {
    if (!slaMedeConversa(conv)) return false;
    if (!conv?.last_customer_message_at || conv.first_response_at) return false;
    if (conv.status === ATENDIMENTO_STATUS.RESOLVIDO) return false;
    const slaMin = getSlaMinutes(conv);
    const elapsed = Date.now() - new Date(conv.last_customer_message_at).getTime();
    return elapsed > slaMin * 60 * 1000;
  }, [getSlaMinutes]);

  const getSlaRemainingMs = useCallback((conv) => {
    if (!slaMedeConversa(conv)) return null;
    if (!conv?.last_customer_message_at || conv.first_response_at) return null;
    const slaMin = getSlaMinutes(conv);
    const deadline = new Date(conv.last_customer_message_at).getTime() + slaMin * 60 * 1000;
    return deadline - Date.now();
  }, [getSlaMinutes]);

  return { overdueConversations, isOverdue, getSlaRemainingMs, alertedRef };
}
