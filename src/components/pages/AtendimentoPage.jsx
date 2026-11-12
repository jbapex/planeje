import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import {
  useAtendimentoConversations,
  useAtendimentoThread,
  useAtendimentoSlaAlerts,
  ATENDIMENTO_STATUS,
} from '@/hooks/useAtendimentoConversations';
import { useAtendimentoCrmContext } from '@/hooks/useAtendimentoCrmContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import AtendimentoConversationList from '@/components/atendimento/AtendimentoConversationList';
import AtendimentoThread from '@/components/atendimento/AtendimentoThread';
import AtendimentoComposer from '@/components/atendimento/AtendimentoComposer';
import AtendimentoSidePanel from '@/components/atendimento/AtendimentoSidePanel';
import AtendimentoMaterialLogPanel from '@/components/atendimento/AtendimentoMaterialLogPanel';
import AtendimentoConversasHeader from '@/components/atendimento/AtendimentoConversasHeader';
import AtendimentoListToolbar from '@/components/atendimento/AtendimentoListToolbar';
import AtendimentoEmptyChat from '@/components/atendimento/AtendimentoEmptyChat';
import { addConversaNota, fetchConversaNotas } from '@/lib/atendimentoConversaNotas';
import AtendimentoForwardDialog from '@/components/atendimento/AtendimentoForwardDialog';
import AtendimentoNewConversationDialog from '@/components/atendimento/AtendimentoNewConversationDialog';
import AtendimentoCriarTarefaDialog from '@/components/atendimento/AtendimentoCriarTarefaDialog';
import AtendimentoAgendarLembreteDialog from '@/components/atendimento/AtendimentoAgendarLembreteDialog';
import AtendimentoGrupoPlanejamentoPanel from '@/components/atendimento/AtendimentoGrupoPlanejamentoPanel';
import AtendimentoGrupoParticipantesPanel from '@/components/atendimento/AtendimentoGrupoParticipantesPanel';
import AtendimentoFavoritoButton from '@/components/atendimento/AtendimentoFavoritoButton';
import AtendimentoWaitTimeBadge from '@/components/atendimento/AtendimentoWaitTimeBadge';
import { grupoResponsavelLinha } from '@/lib/atendimentoGrupoResponsavel';
import {
  useAtendimentoFavoritosContext,
  AtendimentoFavoritosLiveSync,
} from '@/contexts/AtendimentoFavoritosContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import '@/components/atendimento/Atendimento.css';
import {
  CONVERSAS_CONFIG_PATH,
  CONVERSAS_DEFAULT_PATH,
  CONVERSAS_DEFAULT_STATUS,
  CONVERSAS_STATUS_TABS,
  buildConversasUrl,
  parseConversasAudienceQuery,
  parseConversasStatusSlug,
} from '@/lib/conversasRoutes';
import { lookupConversationByChatJid, sameChatJid } from '@/lib/clienteWhatsappGrupo';
import { loadCsGroupConversation, readCsGroupScope } from '@/lib/csIaGroupNavigation';
import {
  clearAtendimentoActiveConversation,
  setAtendimentoActiveConversation,
} from '@/lib/atendimentoActiveConversation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  buildReplyTarget,
  deleteMessageForEveryone,
  forwardMessageToConversation,
  invokeUazapiSendMessage,
  parseFunctionInvokeError,
  sendMessageReaction,
} from '@/lib/atendimentoMessageActions';
import { createOptimisticOutgoingMessage } from '@/lib/atendimentoMessageUtils';
import { SessionExpiredError } from '@/lib/authSessionToast';
import {
  ArrowLeft,
  Ban,
  ArrowRightLeft,
  Check,
  ListTodo,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  RotateCcw,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ATENDIMENTO_INLINE_MAX_BYTES,
  readFileAsBase64,
  sentMessagePreviewForMedia,
} from '@/lib/atendimentoMediaSend';
import { ATENDIMENTO_ENVIOS_BUCKET, UploadCancelledError, uploadAtendimentoArquivo } from '@/lib/atendimentoArquivoUpload';
import {
  AUDIENCE_FILTER_ALL,
  AUDIENCE_FILTER_BLOCKED,
  AUDIENCE_FILTER_GROUPS,
  countConversationsByAudience,
  emptyLabelForAudienceFilter,
  matchesAudienceFilter,
} from '@/lib/atendimentoAudienceFilter';
import { useAtendimentoUsuarioAcesso } from '@/hooks/useAtendimentoUsuarioAcesso';
import {
  filterAtendimentoChannelsForUser,
  filterAtendimentoFilasForUser,
  canAccessAtendimentoConversation,
  canSendAtendimentoOnConversation,
  filterAtendimentoChannelsForSend,
} from '@/lib/atendimentoUsuarioAcesso';

const SIDE_PANEL_STORAGE_KEY = 'planeje-conversas-side-panel-open';

function readSidePanelOpen() {
  try {
    const v = localStorage.getItem(SIDE_PANEL_STORAGE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

const STATUS_TABS = CONVERSAS_STATUS_TABS.map(({ value, label }) => ({ value, label }));

export default function AtendimentoPage(props) {
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const csGroup = useMemo(() => readCsGroupScope(params), [params]);
  const scopeKey = csGroup === null ? 'inbox' : JSON.stringify([profile?.id, csGroup]);
  return <AtendimentoWorkspace key={scopeKey} {...props} profile={profile} csGroup={csGroup} />;
}

function AtendimentoWorkspace({ embeddedInCrm, initialChatJid, onInitialChatSelected, onOpenLead, profile, csGroup }) {
  const navigate = useNavigate();
  const { statusTab: statusSlug } = useParams();
  const [searchParams] = useSearchParams();
  const chatFromUrl = searchParams.get('chat');
  const clienteFromUrl = searchParams.get('cliente_id');
  const audienceFromUrl = parseConversasAudienceQuery(searchParams.get('audiencia'));
  const statusTab = parseConversasStatusSlug(statusSlug) || CONVERSAS_DEFAULT_STATUS;
  const { toast } = useToast();
  const csGroupRoute = csGroup !== null;
  const [csGroupUnavailable, setCsGroupUnavailable] = useState(csGroup === false);
  const {
    effectiveClienteId,
    configs,
    loading: configLoading,
    isAdminWithoutCliente,
    conversasAccessMissing,
    conversasClienteLoading,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ forConversas: true, autoSelectFirstClient: !csGroup,
    preferredConversasClienteId: csGroup?.waClientId });

  useEffect(() => {
    if (clienteFromUrl && isAdminWithoutCliente) {
      setSelectedClienteId(clienteFromUrl);
    }
  }, [clienteFromUrl, isAdminWithoutCliente, setSelectedClienteId]);

  const { accessRows, filaCanaisByConfigId } = useAtendimentoUsuarioAcesso({
    enabled: Boolean(effectiveClienteId),
  });

  const [channelFilter, setChannelFilter] = useState(csGroup?.channelId || 'all');
  const [filaFilter, setFilaFilter] = useState('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const audienceFilter = csGroup ? AUDIENCE_FILTER_GROUPS : audienceFromUrl;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const uploadJobsRef = useRef(new Map());
  const uploadChatKey = selected?.chat_jid || selected?.id || '';
  useEffect(() => {
    const jobs = uploadJobsRef.current;
    const stop = () => {
      jobs.forEach((job) => job.controller.abort());
    };
    window.addEventListener('beforeunload', stop);
    return () => {
      window.removeEventListener('beforeunload', stop);
      stop();
    };
  }, [uploadChatKey]);
  const [conversaNotas, setConversaNotas] = useState([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [internalAgents, setInternalAgents] = useState([]);
  const [materialLogOpen, setMaterialLogOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [forwardSource, setForwardSource] = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardSending, setForwardSending] = useState(false);
  const [localReactions, setLocalReactions] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSending, setDeleteSending] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(readSidePanelOpen);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [planejamentoTaskOpen, setPlanejamentoTaskOpen] = useState(false);
  const [planejamentoReminderOpen, setPlanejamentoReminderOpen] = useState(false);
  const [planejamentoMessagePreview, setPlanejamentoMessagePreview] = useState('');
  const [planejamentoSheetOpen, setPlanejamentoSheetOpen] = useState(false);
  const [groupParticipantsOpen, setGroupParticipantsOpen] = useState(false);
  const [groupSideTab, setGroupSideTab] = useState('detalhes');
  const prevChatJidRef = useRef(null);

  useEffect(() => {
    if (statusSlug && !parseConversasStatusSlug(statusSlug)) {
      navigate(CONVERSAS_DEFAULT_PATH, { replace: true });
    }
  }, [statusSlug, navigate]);

  const handleStatusTabChange = useCallback(
    (nextStatus) => {
      setSelected(null);
      const nextAudience = audienceFilter === AUDIENCE_FILTER_BLOCKED ? AUDIENCE_FILTER_ALL : audienceFilter;
      navigate(buildConversasUrl({ statusTab: nextStatus, audienceFilter: nextAudience, clienteId: csGroup?.waClientId }));
    },
    [navigate, audienceFilter, csGroup]
  );

  const handleAudienceFilterChange = useCallback(
    (nextAudience) => {
      setSelected(null);
      navigate(buildConversasUrl({ statusTab, audienceFilter: nextAudience, clienteId: csGroup?.waClientId }), { replace: true });
    },
    [navigate, statusTab, csGroup]
  );

  const handleSelectConversation = useCallback(
    (conv) => {
      if (!conv) return;
      if (csGroup && conv.id === csGroup.conversationId) return;
      setSelected((prev) => (prev?.id === conv.id ? prev : conv));
      const tab = conv.status || statusTab;
      navigate(buildConversasUrl({ statusTab: tab, audienceFilter, chatJid: conv.chat_jid,
        clienteId: csGroup ? conv.cliente_id : undefined }), {
        replace: true,
      });
    },
    [navigate, statusTab, audienceFilter, csGroup],
  );

  const handleCloseConversation = useCallback(() => {
    setSelected(null);
    navigate(buildConversasUrl({ statusTab, audienceFilter, clienteId: csGroup?.waClientId }), { replace: true });
  }, [navigate, statusTab, audienceFilter, csGroup]);

  const toggleSidePanel = useCallback(() => {
    setSidePanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDE_PANEL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openGroupParticipants = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches) {
      setGroupParticipantsOpen(true);
      return;
    }
    setGroupSideTab('participantes');
    setSidePanelOpen(true);
    try {
      localStorage.setItem(SIDE_PANEL_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setGroupSideTab('detalhes');
    setGroupParticipantsOpen(false);
  }, [selected?.id]);

  const {
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
  } = useAtendimentoConversations({
    clienteId: effectiveClienteId,
    statusTab,
    channelFilter,
    filaFilter,
    onlyMine,
    blockedOnly: audienceFilter === AUDIENCE_FILTER_BLOCKED,
    role: profile?.role,
    userAccess: accessRows,
    filaCanaisByConfigId,
    exactConversationId: csGroup?.conversationId,
  });

  useEffect(() => {
    if (!selected?.chat_jid) return;
    const fresh = conversations.find((conv) => conv.profile_pic_url && (csGroup
      ? conv.id === selected.id && !conv._groupAliasIds?.length : conv.chat_jid === selected.chat_jid));
    if (!fresh || fresh.profile_pic_url === selected.profile_pic_url) return;
    setSelected((prev) => (prev ? { ...prev, profile_pic_url: fresh.profile_pic_url } : prev));
  }, [conversations, selected, csGroup]);

  const {
    isFavorite,
    toggleFavorite,
    togglingId: favoritoTogglingId,
  } = useAtendimentoFavoritosContext() || {};

  const allowedChannels = useMemo(
    () =>
      filterAtendimentoChannelsForUser({
        role: profile?.role,
        userAccess: accessRows,
        clienteId: effectiveClienteId,
        channels,
        filaCanaisByConfigId,
      }),
    [profile?.role, accessRows, effectiveClienteId, channels, filaCanaisByConfigId],
  );

  const allowedFilas = useMemo(
    () =>
      filterAtendimentoFilasForUser({
        role: profile?.role,
        userAccess: accessRows,
        clienteId: effectiveClienteId,
        filas,
        filaCanaisByConfigId,
      }),
    [profile?.role, accessRows, effectiveClienteId, filas, filaCanaisByConfigId],
  );

  const allowedConfigs = useMemo(
    () =>
      filterAtendimentoChannelsForSend({
        role: profile?.role,
        userAccess: accessRows,
        clienteId: effectiveClienteId,
        channels: configs || [],
      }),
    [profile?.role, accessRows, effectiveClienteId, configs],
  );

  const sendableChannels = useMemo(
    () =>
      filterAtendimentoChannelsForSend({
        role: profile?.role,
        userAccess: accessRows,
        clienteId: effectiveClienteId,
        channels,
      }),
    [profile?.role, accessRows, effectiveClienteId, channels],
  );

  useEffect(() => {
    if (channelFilter !== 'all' && channelFilter !== csGroup?.channelId && !allowedChannels.some((c) => c.id === channelFilter)) {
      setChannelFilter('all');
    }
  }, [channelFilter, allowedChannels, csGroup]);

  useEffect(() => {
    if (filaFilter !== 'all' && !allowedFilas.some((f) => f.id === filaFilter)) {
      setFilaFilter('all');
    }
  }, [filaFilter, allowedFilas]);

  const selectedAccessible = useMemo(() => {
    if (!selected || (csGroup && (effectiveClienteId !== csGroup.waClientId || selected.cliente_id !== csGroup.waClientId ||
      selected.id !== csGroup.conversationId || selected.whatsapp_config_id !== csGroup.channelId))) return null;
    return canAccessAtendimentoConversation({
      role: profile?.role,
      userAccess: accessRows,
      clienteId: effectiveClienteId,
      conversation: selected,
      filaCanaisByConfigId,
    })
      ? selected
      : null;
  }, [selected, profile?.role, accessRows, effectiveClienteId, filaCanaisByConfigId, csGroup]);
  const csGroupJid = selectedAccessible?.chat_jid;
  const csGroupThread = useMemo(() => csGroup && csGroupJid ? { ...csGroup, groupJid: csGroupJid } : null, [csGroup, csGroupJid]);

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedAccessible || !toggleFavorite) return;
    const { error, favorited } = await toggleFavorite(selectedAccessible);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível atualizar favorito',
        description: error.includes('atendimento_conversa_favorita')
          ? 'Execute a migration de favoritos no Supabase.'
          : error,
      });
      return;
    }
    toast({
      title: favorited ? 'Adicionado aos favoritos' : 'Removido dos favoritos',
      description: favorited
        ? 'O atalho aparece na lateral direita.'
        : 'Atalho removido da lateral.',
    });
  }, [selectedAccessible, toggleFavorite, toast]);

  useEffect(() => {
    if (!selected || selectedAccessible) return;
    setSelected(null);
    if (csGroup) {
      setCsGroupUnavailable(true);
      return;
    }
    navigate(buildConversasUrl({ statusTab, audienceFilter }), { replace: true });
    toast({
      variant: 'destructive',
      title: 'Sem permissão',
      description: 'Você não tem acesso a esta conversa.',
    });
  }, [selected, selectedAccessible, statusTab, audienceFilter, navigate, toast, csGroup]);

  const handleNewConversationStarted = useCallback(
    (conv) => {
      if (!conv) return;
      toast({ title: 'Conversa iniciada' });
      loadConversations({ silent: true });
      setSelected(conv);
      const nextAudience = conv.is_group ? AUDIENCE_FILTER_GROUPS : audienceFilter;
      navigate(
        buildConversasUrl({
          statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
          chatJid: conv.chat_jid,
          audienceFilter: nextAudience,
        }),
        { replace: true }
      );
    },
    [loadConversations, navigate, audienceFilter, toast]
  );

  const { overdueConversations, isOverdue, getSlaRemainingMs } = useAtendimentoSlaAlerts({
    clienteId: effectiveClienteId,
    conversations,
    filas,
  });

  const { contextByConvId, selectedContext, loading: crmContextLoading, reload: reloadCrmContext } = useAtendimentoCrmContext({
    clienteId: effectiveClienteId,
    conversations,
    selectedConversation: selected,
  });

  const audienceCounts = useMemo(() => {
    const countsByAudience = countConversationsByAudience(conversations, contextByConvId);
    countsByAudience[AUDIENCE_FILTER_BLOCKED] = blockedCount;
    return countsByAudience;
  }, [conversations, contextByConvId, blockedCount]);

  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (audienceFilter !== AUDIENCE_FILTER_ALL) {
      list = list.filter((conv) => matchesAudienceFilter(conv, contextByConvId[conv.id], audienceFilter));
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((conv) => {
      const name = (conv.display_name || '').toLowerCase();
      const jid = (conv.chat_jid || '').toLowerCase();
      const preview = (conv.last_message_preview || '').toLowerCase();
      return name.includes(q) || jid.includes(q) || preview.includes(q);
    });
  }, [conversations, search, audienceFilter, contextByConvId]);

  useEffect(() => {
    if (!selected || csGroupRoute) return;
    if (chatFromUrl && sameChatJid(selected.chat_jid, chatFromUrl)) return;
    if (!matchesAudienceFilter(selected, contextByConvId[selected.id], audienceFilter)) {
      setSelected(null);
      navigate(buildConversasUrl({ statusTab, audienceFilter }), { replace: true });
    }
  }, [audienceFilter, selected, contextByConvId, statusTab, navigate, chatFromUrl, csGroupRoute]);

  const {
    messages,
    loading: threadLoading,
    loadingOlder,
    hasOlder,
    loadOlder,
    unreadAnchorId,
    entryToken,
    conversationKey,
    loadThread,
    appendOptimistic,
    confirmOptimistic,
    removeOptimistic,
    patchOptimistic,
  } = useAtendimentoThread({
    clienteId: effectiveClienteId,
    conversation: selectedAccessible,
    csGroup: csGroupThread,
  });

  useEffect(() => {
    setReplyTarget(null);
    setForwardSource(null);
    setForwardOpen(false);
    setLocalReactions({});
    setDeleteTarget(null);
  }, [selected?.id]);

  useEffect(() => {
    setAtendimentoActiveConversation(csGroup && selected ? { ...selected, chat_jid: null } : selected);
  }, [selected, csGroup]);

  useEffect(() => {
    const conversationId = selected?.id;
    if (!conversationId) {
      setConversaNotas([]);
      return undefined;
    }
    let cancel = false;
    fetchConversaNotas(conversationId)
      .then((rows) => {
        if (!cancel) setConversaNotas(rows);
      })
      .catch(() => {
        if (!cancel) setConversaNotas([]);
      });
    return () => {
      cancel = true;
    };
  }, [selected?.id]);

  useEffect(() => () => clearAtendimentoActiveConversation(), []);

  const displayMessages = useMemo(() => {
    const chat = messages.map((m) => {
      if (!m.uazapiMessageId) return m;
      const emoji = localReactions[m.uazapiMessageId];
      if (!emoji) return m;
      const reactions = [...(m.reactions || [])];
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing) existing.count += 1;
      else reactions.push({ emoji, count: 1 });
      return { ...m, reactions };
    });
    const notes = (conversaNotas || []).map((n) => ({
      id: `nota-${n.id}`,
      kind: 'note',
      noteId: n.id,
      at: n.created_at,
      body: n.texto,
      autor: n.autor_nome || 'Equipe',
      autorId: n.autor_id,
    }));
    return [...chat, ...notes];
  }, [messages, localReactions, conversaNotas]);

  const handleReplyToMessage = useCallback((msg) => {
    setReplyTarget(buildReplyTarget(msg));
  }, []);

  const openPlanejamentoTask = useCallback((preview = '') => {
    setPlanejamentoMessagePreview(preview);
    setPlanejamentoTaskOpen(true);
  }, []);

  const openPlanejamentoReminder = useCallback((preview = '') => {
    setPlanejamentoMessagePreview(preview);
    setPlanejamentoReminderOpen(true);
  }, []);

  const handleCreateTaskFromMessage = useCallback(
    (msg) => {
      openPlanejamentoTask(msg?.body || '');
    },
    [openPlanejamentoTask]
  );

  const handlePlanejamentoTaskCreated = useCallback(
    (task) => {
      toast({ title: 'Tarefa criada', description: task?.title || 'Vinculada a esta conversa.' });
      setPlanejamentoTaskOpen(false);
      setPlanejamentoMessagePreview('');
    },
    [toast]
  );

  const handlePlanejamentoReminderCreated = useCallback(() => {
    toast({ title: 'Lembrete salvo', description: 'Veja em Conversas → Lembretes.' });
    setPlanejamentoReminderOpen(false);
    setPlanejamentoMessagePreview('');
  }, [toast]);

  const handleReactToMessage = useCallback(
    async (msg, emoji) => {
      if (!selected || !effectiveClienteId || !msg?.id) return;
      if (msg.direction !== 'in') {
        toast({
          variant: 'destructive',
          title: 'Não é possível reagir',
          description: 'Só dá para reagir a mensagens recebidas do contato.',
        });
        return;
      }
      try {
        await sendMessageReaction({
          message: msg,
          conversation: selected,
          clienteId: effectiveClienteId,
          emoji,
        });
        setLocalReactions((prev) => ({ ...prev, [msg.uazapiMessageId]: emoji }));
        toast({ title: 'Reação enviada', description: emoji });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Erro ao reagir',
          description: err.message || 'Tente novamente.',
        });
      }
    },
    [selected, effectiveClienteId, toast]
  );

  const handleForwardMessage = useCallback((msg) => {
    setForwardSource(msg);
    setForwardOpen(true);
  }, []);

  const handleDeleteMessage = useCallback((msg) => {
    if (msg.direction !== 'out') {
      toast({
        variant: 'destructive',
        title: 'Não é possível apagar',
        description: 'Só dá para apagar para todos mensagens enviadas por você.',
      });
      return;
    }
    setDeleteTarget(msg);
  }, [toast]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || !selected || !effectiveClienteId) return;
    setDeleteSending(true);
    try {
      await deleteMessageForEveryone({
        message: deleteTarget,
        conversation: selected,
        clienteId: effectiveClienteId,
      });
      toast({ title: 'Mensagem apagada para todos' });
      setDeleteTarget(null);
      await loadThread({ silent: true });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao apagar',
        description: err.message || 'Tente novamente.',
      });
    } finally {
      setDeleteSending(false);
    }
  }, [deleteTarget, selected, effectiveClienteId, toast, loadThread]);

  const handleConfirmForward = useCallback(
    async (targetConversation) => {
      if (!forwardSource || !effectiveClienteId) return;
      setForwardSending(true);
      try {
        await forwardMessageToConversation({
          sourceMessage: forwardSource,
          targetConversation,
          clienteId: effectiveClienteId,
        });
        toast({
          title: 'Mensagem encaminhada',
          description: targetConversation.display_name || targetConversation.chat_jid,
        });
        setForwardOpen(false);
        setForwardSource(null);
        if (targetConversation.id === selected?.id) {
          await loadThread({ silent: true });
        }
        loadConversations({ silent: true });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Erro ao encaminhar',
          description: err.message || 'Tente novamente.',
        });
      } finally {
        setForwardSending(false);
      }
    },
    [forwardSource, effectiveClienteId, selected?.id, toast, loadThread, loadConversations]
  );

  const handleBaseClientChanged = useCallback(() => {
    reloadCrmContext();
    loadConversations({ silent: true });
  }, [reloadCrmContext, loadConversations]);

  useEffect(() => {
    if (!effectiveClienteId) {
      setInternalAgents([]);
      return;
    }
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['superadmin', 'admin', 'colaborador'])
      .order('full_name')
      .then(({ data }) => setInternalAgents(data || []));
  }, [effectiveClienteId]);

  const assigneeNames = useMemo(() => {
    const map = {};
    (internalAgents || []).forEach((agent) => {
      if (agent?.id && agent.full_name) map[agent.id] = agent.full_name;
    });
    return map;
  }, [internalAgents]);

  const handleOpenLead = useCallback(
    (leadId) => {
      if (onOpenLead) {
        onOpenLead(leadId);
        return;
      }
      navigate(`/crm/leads/${leadId}`);
    },
    [navigate, onOpenLead]
  );

  useEffect(() => {
    if (!chatFromUrl || csGroupRoute) return;
    setChannelFilter('all');
    setFilaFilter('all');
    setOnlyMine(false);
  }, [chatFromUrl, csGroupRoute]);

  useEffect(() => {
    if (!csGroup || !profile?.id || conversasClienteLoading || !effectiveClienteId) return;
    let cancelled = false;
    async function openGroup() {
      let row;
      try {
        row = effectiveClienteId === csGroup.waClientId ? await loadCsGroupConversation(supabase, csGroup) : null;
      } catch { /* A mesma mensagem cobre link revogado e falha de consulta. */ }
      if (cancelled) return;
      setCsGroupUnavailable(!row);
      if (!row) {
        setSelected(null);
        return;
      }
      const nextStatus = row.status || CONVERSAS_DEFAULT_STATUS;
      if (nextStatus !== statusTab) {
        navigate(buildConversasUrl({ statusTab: nextStatus, audienceFilter: AUDIENCE_FILTER_GROUPS, csGroup }), { replace: true });
        return;
      }
      setSelected((prev) => prev?.id === row.id && prev.chat_jid === row.chat_jid ? prev : row);
    }
    void openGroup();
    return () => { cancelled = true; };
  }, [csGroup, profile?.id, effectiveClienteId, conversasClienteLoading, statusTab, navigate]);

  useEffect(() => {
    if (csGroupRoute) return;
    const jid = initialChatJid || chatFromUrl;
    if (jid) {
      prevChatJidRef.current = jid;
      if (!conversations.length && loading) return;
      const found = conversations.find((c) => sameChatJid(c.chat_jid, jid));
      if (found) {
        setSelected((prev) => (prev?.id === found.id ? prev : found));
        const convStatus = found.status || ATENDIMENTO_STATUS.AGUARDANDO;
        if (convStatus !== statusTab) {
          navigate(
            buildConversasUrl({
              statusTab: convStatus,
              chatJid: found.chat_jid,
              audienceFilter: found.is_group ? AUDIENCE_FILTER_GROUPS : audienceFilter,
              clienteId: found.cliente_id || clienteFromUrl || undefined,
            }),
            { replace: true }
          );
          return;
        }
        if (onInitialChatSelected) onInitialChatSelected();
        return;
      }

      let cancelled = false;
      (async () => {
        try {
          let row = await lookupConversationByChatJid(jid, clienteFromUrl || effectiveClienteId);
          if (!row && (clienteFromUrl || effectiveClienteId)) {
            row = await lookupConversationByChatJid(jid, null);
          }
          if (cancelled || !row) return;
          const nextStatus = row.status || ATENDIMENTO_STATUS.EM_ATENDIMENTO;
          const nextAudience = row.is_group ? AUDIENCE_FILTER_GROUPS : audienceFilter;
          const alreadyThere =
            nextStatus === statusTab &&
            sameChatJid(row.chat_jid, jid) &&
            (!clienteFromUrl || clienteFromUrl === row.cliente_id);
          if (alreadyThere) {
            setSelected((prev) => (prev?.id === row.id ? prev : row));
            return;
          }
          navigate(
            buildConversasUrl({
              statusTab: nextStatus,
              chatJid: row.chat_jid,
              audienceFilter: nextAudience,
              clienteId: row.cliente_id,
            }),
            { replace: true }
          );
        } catch (e) {
          console.warn('lookup conversa por grupo', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (prevChatJidRef.current) {
      prevChatJidRef.current = null;
      setSelected(null);
    }
  }, [
    initialChatJid,
    chatFromUrl,
    clienteFromUrl,
    effectiveClienteId,
    onInitialChatSelected,
    conversations,
    loading,
    statusTab,
    audienceFilter,
    navigate,
    csGroupRoute,
  ]);

  useEffect(() => {
    if (csGroupRoute || !selected || !conversations.length) return;
    if (conversations.some((c) => c.id === selected.id)) return;
    if (!selected.is_group || !selected.chat_jid) return;
    const primary = conversations.find(
      (c) => c.is_group && c.chat_jid === selected.chat_jid,
    );
    if (primary) setSelected(primary);
  }, [conversations, selected, csGroupRoute]);

  useEffect(() => {
    if (!selected?.id || !conversations.length) return;
    const fresh = conversations.find((c) => c.id === selected.id && (!csGroup || !c._groupAliasIds?.length));
    if (!fresh) return;
    setSelected((prev) => {
      if (!prev || prev.id !== fresh.id) return prev;
      const metaKeys = [
        'last_message_at',
        'last_message_preview',
        'unread_count',
        'status',
        'assigned_to',
        'display_name',
        'profile_pic_url',
        'first_response_at',
        'last_customer_message_at',
        'awaiting_response_since',
        'group_ai_analyzed_at',
        'group_ai_analysis',
      ];
      const changed = metaKeys.some((key) => prev[key] !== fresh[key]);
      if (!changed) return prev;
      const next = { ...prev };
      metaKeys.forEach((key) => {
        next[key] = fresh[key];
      });
      return next;
    });
  }, [conversations, selected?.id, csGroup]);

  useEffect(() => {
    if (selectedAccessible) markConversationRead(selectedAccessible);
  }, [selectedAccessible, markConversationRead]);

  useEffect(() => {
    overdueConversations.forEach((conv) => {
      const key = `${conv.id}-${conv.last_customer_message_at}`;
      if (window.__atendimentoSlaAlerted?.has(key)) return;
      window.__atendimentoSlaAlerted = window.__atendimentoSlaAlerted || new Set();
      window.__atendimentoSlaAlerted.add(key);
      toast({
        variant: 'destructive',
        title: 'SLA estourado',
        description: `${conv.display_name || 'Conversa'} aguardando resposta há mais tempo que o SLA.`,
      });
    });
  }, [overdueConversations, toast]);

  const handleAssume = async () => {
    if (!selected) return;
    const { error } = await assumeConversation(selected);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error });
      return;
    }
    toast({ title: 'Conversa assumida' });
    setSelected((prev) => (prev ? { ...prev, status: ATENDIMENTO_STATUS.EM_ATENDIMENTO } : prev));
    navigate(
      buildConversasUrl({
        statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        chatJid: selected.chat_jid,
        audienceFilter,
        csGroup,
      }),
      { replace: true }
    );
    loadConversations({ silent: true });
  };

  const handleReopen = async () => {
    if (!selected) return;
    const { error } = await reopenConversation(selected);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error });
      return;
    }
    toast({ title: 'Conversa reaberta' });
    setSelected((prev) =>
      prev
        ? {
            ...prev,
            status: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
            resolved_at: null,
            resolved_by: null,
          }
        : prev,
    );
    navigate(
      buildConversasUrl({
        statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
        chatJid: selected.chat_jid,
        audienceFilter,
        csGroup,
      }),
      { replace: true }
    );
    loadConversations({ silent: true });
  };

  const handleResolve = async () => {
    if (!selected) return;
    const { error } = await resolveConversation(selected);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error });
      return;
    }
    toast({ title: 'Conversa resolvida' });
    setSelected(null);
    navigate(buildConversasUrl({ statusTab, audienceFilter, clienteId: csGroup?.waClientId }));
    loadConversations({ silent: true });
  };

  const handleBlock = async () => {
    if (!selected?.id || blockBusy) return;
    setBlockBusy(true);
    const { error } = await supabase.rpc('bloquear_conversa_atendimento', {
      p_conversation_id: selected.id,
    });
    setBlockBusy(false);
    setBlockOpen(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não bloqueou', description: error.message || 'Tente de novo.' });
      return;
    }
    toast({ title: 'Conversa bloqueada. Nada novo é gravado.' });
    setSelected(null);
    navigate(buildConversasUrl({ statusTab, audienceFilter: AUDIENCE_FILTER_BLOCKED }), { replace: true });
    loadConversations({ silent: true });
  };

  const handleUnblock = async () => {
    if (!selected?.id || blockBusy) return;
    setBlockBusy(true);
    const { error } = await supabase.rpc('desbloquear_conversa_atendimento', {
      p_conversation_id: selected.id,
    });
    setBlockBusy(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não desbloqueou', description: error.message || 'Tente de novo.' });
      return;
    }
    const chatJid = selected.chat_jid;
    const nextStatus = selected.status || statusTab;
    toast({ title: 'Conversa desbloqueada. Mensagens novas voltam a entrar.' });
    setSelected((prev) => (prev ? { ...prev, bloqueada: false } : prev));
    navigate(buildConversasUrl({ statusTab: nextStatus, chatJid, audienceFilter: AUDIENCE_FILTER_ALL }), { replace: true });
    loadConversations({ silent: true });
  };

  const handleTransfer = async () => {
    if (!selected || !transferTarget) return;
    const { error } = await transferConversation(selected, transferTarget);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error });
      return;
    }
    toast({ title: 'Conversa transferida' });
    setTransferOpen(false);
    setTransferTarget('');
    loadConversations({ silent: true });
  };

  const handleSaveNote = useCallback(async (texto) => {
    if (!selected?.id || !effectiveClienteId) return false;
    try {
      const row = await addConversaNota({
        conversationId: selected.id,
        clienteId: effectiveClienteId,
        texto,
        autorId: profile?.id,
        autorNome: profile?.full_name || profile?.email || 'Equipe',
      });
      setConversaNotas((prev) => [...prev, row]);
      return true;
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível gravar a nota',
        description: err?.message || 'A nota ficou só nesta tela. Nada foi enviado no WhatsApp.',
      });
      return false;
    }
  }, [selected?.id, effectiveClienteId, profile?.id, profile?.full_name, profile?.email, toast]);

  const handleSend = useCallback(async () => {
    const text = (inputText || '').trim();
    if (!text || !selected || sending || !effectiveClienteId) return;
    if (selected.status === ATENDIMENTO_STATUS.AGUARDANDO) {
      toast({
        variant: 'destructive',
        title: 'Conversa não assumida',
        description: 'Clique em Assumir para poder responder ao contato.',
      });
      return;
    }
    const replyId = replyTarget?.uazapiMessageId || undefined;
    const savedReply = replyTarget;
    const optimistic = createOptimisticOutgoingMessage({
      body: text,
      whatsappConfigId: selected.whatsapp_config_id,
      quote: savedReply
        ? {
            messageId: savedReply.uazapiMessageId,
            author: savedReply.senderName,
            text: savedReply.preview,
          }
        : null,
    });

    appendOptimistic(optimistic);
    setInputText('');
    setReplyTarget(null);
    setSending(true);

    try {
      const { data, error } = await invokeUazapiSendMessage({
        body: {
          to: selected.chat_jid,
          body: text,
          cliente_id: effectiveClienteId,
          whatsapp_config_id: selected.whatsapp_config_id,
          conversation_id: selected.id,
          reply_to_message_id: replyId,
          reply_message_row_id: savedReply?.id || undefined,
        },
      });
      if (error) throw new Error(await parseFunctionInvokeError(error, data));
      if (data?.error) throw new Error(data.error);

      if (data?.sent_row_id) {
        confirmOptimistic(optimistic.clientTempId, {
          id: data.sent_row_id,
          body: text,
          created_at: new Date().toISOString(),
          message_id: data.message_id,
          ack_status: data.ack_status || 'sent',
          whatsapp_config_id: selected.whatsapp_config_id,
          uazapi_internal_id: data.uazapi_internal_id || null,
        });
      }
      loadConversations({ silent: true });
    } catch (err) {
      removeOptimistic(optimistic.clientTempId);
      if (err instanceof SessionExpiredError) {
        setInputText(text);
        if (savedReply) setReplyTarget(savedReply);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: err.message || 'Tente novamente.',
      });
      setInputText(text);
      if (savedReply) setReplyTarget(savedReply);
    } finally {
      setSending(false);
    }
  }, [
    inputText,
    selected,
    sending,
    effectiveClienteId,
    replyTarget,
    toast,
    appendOptimistic,
    confirmOptimistic,
    removeOptimistic,
    loadConversations,
  ]);

  const handleSendMedia = useCallback(
    async (file, mediaType, caption, errorMessage) => {
      if (errorMessage) {
        toast({ variant: 'destructive', title: 'Anexo inválido', description: errorMessage });
        return false;
      }
      if (!file || !mediaType || !selected || sending || !effectiveClienteId) return false;
      if (selected.status === ATENDIMENTO_STATUS.AGUARDANDO) {
        toast({
          variant: 'destructive',
          title: 'Conversa não assumida',
          description: 'Clique em Assumir para poder responder ao contato.',
        });
        return false;
      }

      const captionText = (caption || '').trim();
      const replyId = replyTarget?.uazapiMessageId || undefined;
      const savedReply = replyTarget;

      if (file.size > ATENDIMENTO_INLINE_MAX_BYTES) {
        const preview = sentMessagePreviewForMedia('document', file.name, captionText);
        const optimistic = createOptimisticOutgoingMessage({
          body: captionText,
          kind: 'document',
          whatsappConfigId: selected.whatsapp_config_id,
          quote: savedReply
            ? {
                messageId: savedReply.uazapiMessageId,
                author: savedReply.senderName,
                text: savedReply.preview,
              }
            : null,
        });
        optimistic.upload = {
          percent: 0,
          fileName: file.name,
          fileSize: file.size,
          phase: 'upload',
          cancellable: true,
        };
        const tempId = optimistic.clientTempId;
        const controller = new AbortController();
        const startedAt = Date.now();
        const conversation = selected;
        const clienteId = effectiveClienteId;
        uploadJobsRef.current.set(tempId, {
          controller,
          path: '',
          chatKey: conversation.chat_jid || conversation.id,
        });
        appendOptimistic(optimistic);
        setReplyTarget(null);
        void (async () => {
          let stagedPath = '';
          try {
            const uploaded = await uploadAtendimentoArquivo(file, {
              clienteId,
              signal: controller.signal,
              onStarted: ({ path }) => {
                stagedPath = path;
                const job = uploadJobsRef.current.get(tempId);
                if (job) job.path = path;
              },
              onProgress: (loaded, total) => {
                if (controller.signal.aborted) return;
                const pct = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
                const elapsed = Date.now() - startedAt;
                const remainingMs = loaded > 0 && elapsed > 800 && total > loaded
                  ? ((total - loaded) * elapsed) / loaded
                  : 0;
                patchOptimistic(tempId, {
                  upload: { percent: pct, phase: 'upload', cancellable: true, remainingMs },
                });
              },
            });
            if (controller.signal.aborted) throw new UploadCancelledError();
            patchOptimistic(tempId, {
              upload: { percent: 100, phase: 'whatsapp', cancellable: false },
            });
            const { data, error } = await invokeUazapiSendMessage({
              body: {
                to: conversation.chat_jid,
                media_type: 'document',
                file: uploaded.url,
                caption: captionText || undefined,
                doc_name: file.name,
                mimetype: file.type || undefined,
                cliente_id: clienteId,
                whatsapp_config_id: conversation.whatsapp_config_id,
                conversation_id: conversation.id,
                reply_to_message_id: replyId,
                reply_message_row_id: savedReply?.id || undefined,
              },
            });
            if (error) throw new Error(await parseFunctionInvokeError(error, data));
            if (data?.error) throw new Error(data.error);
            if (data?.sent_row_id) {
              confirmOptimistic(tempId, {
                id: data.sent_row_id,
                body: preview,
                created_at: new Date().toISOString(),
                message_id: data.message_id,
                ack_status: data.ack_status || 'sent',
                whatsapp_config_id: conversation.whatsapp_config_id,
                uazapi_internal_id: data.uazapi_internal_id || null,
              });
            } else {
              patchOptimistic(tempId, { upload: null, optimistic: false, ack: 'sent' });
            }
            loadConversations({ silent: true });
            toast({
              title: 'Arquivo enviado',
              description: file.name,
            });
          } catch (err) {
            if (stagedPath) {
              supabase.storage.from(ATENDIMENTO_ENVIOS_BUCKET).remove([stagedPath]).catch(() => {});
            }
            removeOptimistic(tempId);
            const cancelled = err instanceof UploadCancelledError || controller.signal.aborted;
            if (cancelled) return;
            if (savedReply) setReplyTarget(savedReply);
            if (err instanceof SessionExpiredError) return;
            toast({
              variant: 'destructive',
              title: 'Erro ao enviar arquivo',
              description: err.message || 'Tente novamente.',
            });
          } finally {
            uploadJobsRef.current.delete(tempId);
          }
        })();
        return true;
      }

      let optimistic = null;

      setReplyTarget(null);
      setSending(true);
      try {
        const filePayload = await readFileAsBase64(file);
        const sendType = mediaType;

        const preview = sentMessagePreviewForMedia(sendType, file.name, captionText);
        optimistic = createOptimisticOutgoingMessage({
          body: preview,
          kind: sendType === 'audio' || sendType === 'ptt' ? 'audio' : sendType === 'image' ? 'image' : sendType === 'video' ? 'video' : 'document',
          whatsappConfigId: selected.whatsapp_config_id,
          quote: savedReply
            ? {
                messageId: savedReply.uazapiMessageId,
                author: savedReply.senderName,
                text: savedReply.preview,
              }
            : null,
        });
        appendOptimistic(optimistic);

        const { data, error } = await invokeUazapiSendMessage({
          body: {
            to: selected.chat_jid,
            media_type: sendType,
            file: filePayload,
            caption: captionText || undefined,
            doc_name: sendType === 'document' ? file.name : undefined,
            mimetype: file.type || undefined,
            cliente_id: effectiveClienteId,
            whatsapp_config_id: selected.whatsapp_config_id,
            conversation_id: selected.id,
            reply_to_message_id: replyId,
            reply_message_row_id: savedReply?.id || undefined,
          },
        });
        if (error) throw new Error(await parseFunctionInvokeError(error, data));
        if (data?.error) throw new Error(data.error);

        if (data?.sent_row_id) {
          confirmOptimistic(optimistic.clientTempId, {
            id: data.sent_row_id,
            body: preview,
            created_at: new Date().toISOString(),
            message_id: data.message_id,
            ack_status: data.ack_status || 'sent',
            whatsapp_config_id: selected.whatsapp_config_id,
            uazapi_internal_id: data.uazapi_internal_id || null,
          });
        }
        loadConversations({ silent: true });
        toast({
          title: 'Arquivo enviado',
          description: preview,
        });
        return true;
      } catch (err) {
        if (optimistic?.clientTempId) removeOptimistic(optimistic.clientTempId);
        if (err instanceof SessionExpiredError) {
          if (savedReply) setReplyTarget(savedReply);
          return false;
        }
        toast({
          variant: 'destructive',
          title: 'Erro ao enviar arquivo',
          description: err.message || 'Tente novamente.',
        });
        if (savedReply) setReplyTarget(savedReply);
        return false;
      } finally {
        setSending(false);
        setSendStatus('');
      }
    },
    [selected, sending, effectiveClienteId, replyTarget, toast, appendOptimistic, confirmOptimistic, removeOptimistic, patchOptimistic, loadConversations]
  );

  const handleCancelUpload = useCallback((msg) => {
    const tempId = msg?.clientTempId || msg?.id;
    const job = uploadJobsRef.current.get(tempId);
    if (job) {
      job.controller.abort();
      return;
    }
    removeOptimistic(tempId);
  }, [removeOptimistic]);

  const channelName = (id) =>
    allowedChannels.find((c) => c.id === id)?.name ||
    configs.find((c) => c.id === id)?.name ||
    'Canal';
  const filaName = (id) => allowedFilas.find((f) => f.id === id)?.name || null;
  const slaRemaining = selectedAccessible ? getSlaRemainingMs(selectedAccessible) : null;
  const grupoResponsavel = selectedAccessible ? grupoResponsavelLinha(selectedAccessible, assigneeNames) : null;
  const canSendOnSelected = Boolean(
    selectedAccessible &&
      canSendAtendimentoOnConversation({
        role: profile?.role,
        userAccess: accessRows,
        clienteId: effectiveClienteId,
        conversation: selectedAccessible,
      }),
  );
  const canReply =
    Boolean(selectedAccessible && selectedAccessible.status === ATENDIMENTO_STATUS.EM_ATENDIMENTO) &&
    canSendOnSelected;
  const viewOnlyNoSend = Boolean(selectedAccessible && !canSendOnSelected);
  const awaitingAssume = selectedAccessible?.status === ATENDIMENTO_STATUS.AGUARDANDO;
  const isResolved = selectedAccessible?.status === ATENDIMENTO_STATUS.RESOLVIDO;

  if (conversasAccessMissing) {
    return (
      <div className="wa-atendimento flex flex-col flex-1 min-h-0 p-4 md:p-6">
        <AtendimentoConversasHeader totalUnread={0} />
        <Card className="mt-4">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Seu usuário ainda não tem acesso ao atendimento. Peça ao superadmin para vincular você nas filas e canais da operação.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!effectiveClienteId && !isAdminWithoutCliente) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Selecione um cliente para acessar o atendimento.</p>
      </div>
    );
  }

  const hasChannel = allowedConfigs.length > 0 || allowedChannels.length > 0;
  const canStartConversation = sendableChannels.length > 0 && Boolean(profile?.id);
  const defaultNewConvChannelId =
    channelFilter !== 'all' && sendableChannels.some((c) => c.id === channelFilter)
      ? channelFilter
      : sendableChannels[0]?.id;

  const isStandalone = !embeddedInCrm;

  return (
    <div className={cn('wa-atendimento flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden', isStandalone && 'p-0')}>
      <AtendimentoFavoritosLiveSync conversations={conversations} />
      {csGroupUnavailable && <p role="alert" className="px-4 py-2 text-sm text-muted-foreground">O grupo vinculado no CS está indisponível para esta sessão.</p>}

      {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
        <div className="wa-client-bar shrink-0">
          <span className="wa-client-bar-label">Operação</span>
          <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientesForAdmin.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.empresa || c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(configLoading || conversasClienteLoading) && !hasChannel && (
        <Card className="mb-4">
          <CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando canais…
          </CardContent>
        </Card>
      )}

      {!hasChannel && !configLoading && !conversasClienteLoading && (
        <Card className="mb-4">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Configure pelo menos um canal WhatsApp na aba Canais para receber mensagens.
          </CardContent>
        </Card>
      )}

      <div className="wa-shell flex flex-col flex-1 min-h-0 border overflow-hidden">
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <div
            className={cn(
              'wa-list-pane border-b md:border-b-0 md:border-r flex flex-col shrink-0',
              selected ? 'hidden md:flex' : 'flex'
            )}
          >
            <AtendimentoListToolbar
              statusTab={statusTab}
              onStatusTabChange={handleStatusTabChange}
              statusTabs={STATUS_TABS}
              counts={counts}
              audienceFilter={audienceFilter}
              onAudienceFilterChange={handleAudienceFilterChange}
              audienceCounts={audienceCounts}
              search={search}
              onSearchChange={setSearch}
              channelFilter={channelFilter}
              onChannelFilterChange={setChannelFilter}
              channels={allowedChannels}
              filaFilter={filaFilter}
              onFilaFilterChange={setFilaFilter}
              filas={allowedFilas}
              onlyMine={onlyMine}
              onOnlyMineChange={setOnlyMine}
              overdueCount={overdueConversations.length}
              onNewConversation={() => setNewConvOpen(true)}
              canStartConversation={canStartConversation}
            />
            <AtendimentoConversationList
              conversations={filteredConversations}
              loading={loading}
              selectedId={selected?.id}
              onSelect={handleSelectConversation}
              isOverdue={isOverdue}
              contextByConvId={contextByConvId}
              assigneeNames={assigneeNames}
              emptyLabel={
                audienceFilter !== AUDIENCE_FILTER_ALL
                  ? emptyLabelForAudienceFilter(audienceFilter)
                  : statusTab === ATENDIMENTO_STATUS.AGUARDANDO
                    ? 'Nenhuma conversa aguardando.'
                    : statusTab === ATENDIMENTO_STATUS.EM_ATENDIMENTO
                      ? 'Nenhuma conversa em atendimento.'
                      : 'Nenhuma conversa resolvida.'
              }
            />
          </div>

          <div className={cn('wa-chat-pane flex-1 flex flex-col min-w-0', !selectedAccessible && 'hidden md:flex')}>
            {selectedAccessible ? (
              <>
                <div className="wa-chat-header p-2 px-3 flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0"
                    onClick={handleCloseConversation}
                    aria-label="Voltar"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={selected.profile_pic_url || undefined} alt="" />
                    <AvatarFallback className="bg-[#dfe5e7]">
                      {selected.is_group ? <Users className="h-4 w-4" /> : (selected.display_name || '?').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="wa-chat-header-name truncate">
                      {selected.display_name || selected.chat_jid}
                    </p>
                    <p className="wa-chat-header-meta flex items-center gap-1 flex-wrap">
                      <Phone className="h-3 w-3 shrink-0" />
                      {channelName(selected.whatsapp_config_id)}
                      {filaName(selected.fila_id) && ` · ${filaName(selected.fila_id)}`}
                      {grupoResponsavel && (
                        <span className={cn(grupoResponsavel.missing && 'wa-grupo-sem-responsavel')}>
                          {` · ${grupoResponsavel.text}`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="wa-head-actions">
                    <AtendimentoWaitTimeBadge conversation={selected} variant="header" />
                    {isOverdue(selected) && (
                      <Badge variant="destructive" className="wa-badge-sm">
                        SLA
                      </Badge>
                    )}
                    {slaRemaining != null && slaRemaining > 0 && !selected.first_response_at && (
                      <Badge variant="outline" className="wa-badge-sm bg-white dark:bg-transparent">
                        {Math.ceil(slaRemaining / 60000)}min
                      </Badge>
                    )}
                    {selected.bloqueada ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="wa-head-icon"
                        onClick={handleUnblock}
                        disabled={blockBusy}
                      >
                        Desbloquear
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="wa-head-icon"
                        onClick={() => setBlockOpen(true)}
                        title="Bloquear"
                        aria-label="Bloquear conversa"
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    <AtendimentoFavoritoButton
                      active={Boolean(isFavorite?.(selected.id))}
                      loading={favoritoTogglingId === selected.id}
                      onClick={handleToggleFavorite}
                      className="wa-head-icon"
                    />
                    {selected.is_group && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="wa-head-icon"
                        onClick={openGroupParticipants}
                        title="Participantes do grupo"
                        aria-label="Participantes do grupo"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn('wa-head-icon hidden xl:inline-flex', sidePanelOpen && 'is-on')}
                      onClick={toggleSidePanel}
                      title={sidePanelOpen ? 'Recolher ficha do contato' : 'Ficha do contato'}
                      aria-label={sidePanelOpen ? 'Recolher ficha do contato' : 'Ficha do contato'}
                    >
                      {sidePanelOpen ? (
                        <PanelRightClose className="h-4 w-4" />
                      ) : (
                        <PanelRightOpen className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="wa-head-icon xl:hidden"
                      onClick={() => setMaterialLogOpen(true)}
                      title="Envios"
                      aria-label="Envios"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    {canReply && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="wa-head-icon xl:hidden"
                        onClick={() => setPlanejamentoSheetOpen(true)}
                        title="Planejar"
                        aria-label="Planejar"
                      >
                        <ListTodo className="h-4 w-4" />
                      </Button>
                    )}
                    {selected.status === ATENDIMENTO_STATUS.RESOLVIDO && canSendOnSelected && !selected.bloqueada && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="wa-head-icon"
                        onClick={handleReopen}
                        title="Reabrir"
                        aria-label="Reabrir"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {selected.status === ATENDIMENTO_STATUS.AGUARDANDO && canSendOnSelected && !selected.bloqueada && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="wa-head-icon"
                        onClick={handleAssume}
                        title="Assumir"
                        aria-label="Assumir"
                      >
                        <UserCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {selected.status === ATENDIMENTO_STATUS.EM_ATENDIMENTO && !selected.bloqueada && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="wa-head-icon"
                          onClick={() => setTransferOpen(true)}
                          title="Reatribuir"
                          aria-label="Reatribuir"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        {canReply && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="wa-head-icon"
                            onClick={() => openPlanejamentoTask('')}
                            title="Criar tarefa"
                            aria-label="Criar tarefa"
                          >
                            <ListTodo className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="wa-head-icon is-resolve"
                          onClick={handleResolve}
                          title="Encerrar"
                          aria-label="Encerrar"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <AtendimentoThread
                  messages={displayMessages}
                  loading={threadLoading}
                  loadingOlder={loadingOlder}
                  hasOlder={hasOlder}
                  onLoadOlder={loadOlder}
                  unreadAnchorId={unreadAnchorId}
                  entryToken={entryToken}
                  conversationKey={conversationKey}
                  isGroup={selected.is_group}
                  clienteId={effectiveClienteId}
                  whatsappConfigId={selected.whatsapp_config_id}
                  onReply={handleReplyToMessage}
                  onReact={handleReactToMessage}
                  onForward={handleForwardMessage}
                  onDelete={handleDeleteMessage}
                  onCreateTask={canReply && selected.is_group ? handleCreateTaskFromMessage : undefined}
                  onCancelUpload={handleCancelUpload}
                  actionsEnabled={canReply && !selected.bloqueada}
                />

                {selected.bloqueada ? (
                  <div className="wa-awaiting-assume border-t p-4 text-center space-y-3 bg-[#f0f2f5] dark:bg-[var(--wa-list-bg)]">
                    <p className="text-sm text-muted-foreground">
                      Bloqueada. O Planeje não grava mensagem, nota nem prévia deste {selected.is_group ? 'grupo' : 'contato'}.
                    </p>
                    <Button size="sm" variant="outline" onClick={handleUnblock} disabled={blockBusy}>
                      Desbloquear
                    </Button>
                  </div>
                ) : canReply ? (
                    <AtendimentoComposer
                      value={inputText}
                      onChange={setInputText}
                      onSend={handleSend}
                      onSendMedia={handleSendMedia}
                      onSaveNote={handleSaveNote}
                      sending={sending}
                      sendStatus={sendStatus}
                      conversationId={selected.id}
                      replyTarget={replyTarget}
                      onCancelReply={() => setReplyTarget(null)}
                    />
                ) : viewOnlyNoSend ? (
                  <div className="wa-awaiting-assume border-t p-4 text-center bg-[#f0f2f5] dark:bg-[var(--wa-list-bg)]">
                    <p className="text-sm text-muted-foreground">
                      Você pode acompanhar esta conversa, mas não tem permissão para enviar mensagens neste número
                      WhatsApp ({channelName(selected.whatsapp_config_id)}).
                    </p>
                  </div>
                ) : awaitingAssume ? (
                  <div className="wa-awaiting-assume border-t p-4 text-center space-y-3 bg-[#f0f2f5]">
                      <p className="text-sm text-muted-foreground">
                        Esta conversa está aguardando atendimento. Assuma para enviar mensagens ao contato.
                      </p>
                      <Button size="sm" className="wa-chat-header-btn" onClick={handleAssume}>
                        <UserCheck className="h-4 w-4 mr-1" />
                        Assumir conversa
                      </Button>
                    </div>
                ) : isResolved ? (
                  <div className="wa-awaiting-assume border-t p-4 text-center space-y-3 bg-[#f0f2f5] dark:bg-[var(--wa-list-bg)]">
                    <p className="text-sm text-muted-foreground">
                      Esta conversa foi encerrada. Reabra para enviar mensagens ou aguarde o cliente escrever de novo
                      (volta para Aguardando automaticamente).
                    </p>
                    {canSendOnSelected ? (
                      <Button size="sm" className="wa-chat-header-btn" onClick={handleReopen}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reabrir conversa
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sem permissão de envio neste canal ({channelName(selected.whatsapp_config_id)}).
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 border-t text-center text-sm text-muted-foreground">
                    Conversa resolvida. Nova mensagem do cliente reabrirá em Aguardando.
                  </div>
                )}
              </>
            ) : (
              <AtendimentoEmptyChat />
            )}
          </div>

          {isStandalone && (
            <AtendimentoSidePanel
              open={sidePanelOpen}
              onToggle={toggleSidePanel}
              conversation={selectedAccessible}
              csGroup={csGroupThread}
              context={selectedContext}
              loading={crmContextLoading}
              onOpenLead={handleOpenLead}
              showConfigLink={profile?.role === 'superadmin'}
              clienteId={effectiveClienteId}
              onBaseClientChanged={handleBaseClientChanged}
              canManagePlanejamento={canReply}
              onCreateTask={() => openPlanejamentoTask('')}
              onAgendarLembrete={() => openPlanejamentoReminder('')}
              groupSideTab={groupSideTab}
              onGroupSideTabChange={setGroupSideTab}
            />
          )}

        </div>
      </div>

      <Dialog open={materialLogOpen} onOpenChange={setMaterialLogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Materiais enviados</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 flex-1 -mx-1 px-1">
            <AtendimentoMaterialLogPanel
              clienteId={effectiveClienteId}
              conversation={selectedAccessible}
              csGroup={csGroupThread}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AtendimentoForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        conversations={conversations}
        currentConversationId={selected?.id}
        sourceMessage={forwardSource}
        onConfirm={handleConfirmForward}
        sending={forwardSending}
      />

      <AtendimentoNewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        clienteId={effectiveClienteId}
        userId={profile?.id}
        channels={sendableChannels}
        defaultChannelId={defaultNewConvChannelId}
        onStarted={handleNewConversationStarted}
      />

      <AtendimentoCriarTarefaDialog
        open={planejamentoTaskOpen}
        onOpenChange={setPlanejamentoTaskOpen}
        conversation={selectedAccessible}
        clienteId={effectiveClienteId}
        userId={profile?.id}
        messagePreview={planejamentoMessagePreview}
        onCreated={handlePlanejamentoTaskCreated}
      />

      <AtendimentoAgendarLembreteDialog
        open={planejamentoReminderOpen}
        onOpenChange={setPlanejamentoReminderOpen}
        conversation={selectedAccessible}
        clienteId={effectiveClienteId}
        userId={profile?.id}
        messagePreview={planejamentoMessagePreview}
        onCreated={handlePlanejamentoReminderCreated}
      />

      <Dialog open={planejamentoSheetOpen} onOpenChange={setPlanejamentoSheetOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Planejamento</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 flex-1 -mx-1 px-1">
            <AtendimentoGrupoPlanejamentoPanel
              conversation={selectedAccessible}
              canManage={canReply}
              onCreateTask={() => {
                setPlanejamentoSheetOpen(false);
                openPlanejamentoTask('');
              }}
              onAgendarLembrete={() => {
                setPlanejamentoSheetOpen(false);
                openPlanejamentoReminder('');
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupParticipantsOpen} onOpenChange={setGroupParticipantsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Participantes do grupo</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 flex-1 pb-4">
            <AtendimentoGrupoParticipantesPanel
              conversation={selectedAccessible}
              clienteId={effectiveClienteId}
              autoLoad
              compact
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={blockOpen} onOpenChange={(open) => !blockBusy && setBlockOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.display_name || 'Esta conversa'} sai da fila. As mensagens já salvas aqui são apagadas e nada novo deste {selected?.is_group ? 'grupo' : 'contato'} é gravado. Não envia mensagem no WhatsApp. A ficha que já existe no Mini CRM continua. Dá para desbloquear em Bloqueados; o que foi apagado não volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blockBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock} disabled={blockBusy}>
              {blockBusy ? 'Bloqueando…' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleteSending && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será removida também no WhatsApp do contato. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteSending}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteSending ? 'Apagando…' : 'Apagar para todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
          </DialogHeader>
          <Select value={transferTarget} onValueChange={setTransferTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o atendente" />
            </SelectTrigger>
            <SelectContent>
              {internalAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.full_name || agent.id} ({agent.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={!transferTarget}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
