import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { messageBodyForDisplay } from '@/lib/uazapiMessageBody';
import { isReactionInboxRow } from '@/lib/atendimentoMessageUtils';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { playAtendimentoMessageSound } from '@/lib/atendimentoMessageAlertSound';
import { showAtendimentoDesktopNotification } from '@/lib/atendimentoDesktopNotification';
import {
  canNotifyAtendimentoMessage,
  resolveAtendimentoFilaId,
} from '@/lib/atendimentoUsuarioAcesso';
import {
  ensureAtendimentoIncomingAlertsRealtime,
  subscribeAtendimentoIncomingAlerts,
} from '@/lib/atendimentoIncomingAlertsRealtime';
import { isAtendimentoConversationFocused } from '@/lib/atendimentoActiveConversation';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ALERT_TTL_MS = 7000;
const DEDUPE_MS = 15_000;
const MAX_ALERTS = 6;

function previewFromInboxRow(row) {
  const body = String(messageBodyForDisplay(row) || '').trim();
  if (body && !body.startsWith('[')) {
    return body.length > 140 ? `${body.slice(0, 137)}…` : body;
  }
  const type = String(row?.type || '').toLowerCase();
  if (type.includes('image') || type === 'sticker') return 'Foto';
  if (type.includes('video')) return 'Vídeo';
  if (type.includes('audio') || type.includes('ptt')) return 'Áudio';
  if (type.includes('document')) return 'Documento';
  if (type.includes('location')) return 'Localização';
  if (type.includes('contact') || type.includes('vcard')) return 'Contato';
  return 'Nova mensagem';
}

function previewFromSentRow(row) {
  const body = String(row?.body || '').trim();
  if (!body) return 'Mensagem enviada';
  if (body.startsWith('[')) {
    const lower = body.toLowerCase();
    if (lower.startsWith('[imagem]') || lower.startsWith('[image]')) return 'Foto';
    if (lower.startsWith('[video]')) return 'Vídeo';
    if (lower.startsWith('[áudio]') || lower.includes('audio') || lower.includes('ptt')) return 'Áudio';
    if (lower.startsWith('[documento]') || lower.startsWith('[document]')) return 'Documento';
  }
  return body.length > 140 ? `${body.slice(0, 137)}…` : body;
}

function buildInboxAlert(row, convMeta) {
  const isGroup = Boolean(row?.is_group);
  const senderName = String(row?.sender_name || '').trim() || 'Contato';
  const groupName = String(row?.group_name || convMeta?.display_name || '').trim();
  const title = isGroup && groupName ? groupName : senderName;
  const subtitle = isGroup ? senderName : null;

  return {
    id: `inbox-${row.id}`,
    dedupeKey: `inbox:${row.id || row.message_id}`,
    conversationId: row.conversation_id || convMeta?.id || null,
    chatJid: row.chat_jid || convMeta?.chat_jid || null,
    statusTab: convMeta?.status || ATENDIMENTO_STATUS.AGUARDANDO,
    title,
    subtitle,
    preview: previewFromInboxRow(row),
    avatarUrl: row.profile_pic_url || convMeta?.profile_pic_url || null,
    createdAt: Date.now(),
  };
}

function buildSentAlert(row, convMeta) {
  const title = convMeta?.display_name || String(row?.chat_jid || '').replace(/@.*$/, '') || 'Conversa';

  return {
    id: `sent-${row.id}`,
    dedupeKey: `sent:${row.id || row.message_id}`,
    conversationId: row.conversation_id || convMeta?.id || null,
    chatJid: row.chat_jid || convMeta?.chat_jid || null,
    statusTab: convMeta?.status || ATENDIMENTO_STATUS.EM_ATENDIMENTO,
    title,
    subtitle: 'Mensagem da equipe',
    preview: previewFromSentRow(row),
    avatarUrl: convMeta?.profile_pic_url || null,
    createdAt: Date.now(),
  };
}

function normalizeClienteIds(clienteId, clienteIds) {
  const raw = clienteIds?.length ? clienteIds : clienteId ? [clienteId] : [];
  return [...new Set(raw.filter(Boolean))];
}

/**
 * Escuta todas as mensagens recebidas e enviadas pela equipe (exceto as do usuário atual).
 */
export function useAtendimentoIncomingMessageAlerts({
  clienteId = null,
  clienteIds = null,
  enabled = true,
  role = null,
  userAccess = [],
  filaCanaisByConfigId = null,
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const seenRef = useRef(new Map());
  const convCacheRef = useRef(new Map());
  const ids = normalizeClienteIds(clienteId, clienteIds);
  const idsKey = ids.slice().sort().join(',');

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const openAlert = useCallback(
    (alert) => {
      dismissAlert(alert.id);
      if (!alert.chatJid) return;
      navigate(
        buildConversasUrl({
          statusTab: alert.statusTab,
          chatJid: alert.chatJid,
        })
      );
    },
    [dismissAlert, navigate]
  );

  const pushAlert = useCallback((alert) => {
    const chatAlreadyOpen = isAtendimentoConversationFocused({
      chatJid: alert.chatJid,
      conversationId: alert.conversationId,
    });

    if (!chatAlreadyOpen) {
      setAlerts((prev) => {
        const next = [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, MAX_ALERTS);
        return next;
      });

      if (typeof document !== 'undefined' && document.hidden) {
        showAtendimentoDesktopNotification(alert, openAlert);
      }
    }

    playAtendimentoMessageSound();
  }, [openAlert]);

  const ctxRef = useRef({});
  ctxRef.current = {
    ids,
    idsKey,
    enabled,
    role: role ?? profile?.role ?? null,
    userAccess,
    filaCanaisByConfigId,
    profileId: profile?.id ?? null,
    pushAlert,
  };

  useEffect(() => {
    if (!enabled || !idsKey) return undefined;

    const pruneSeen = () => {
      const now = Date.now();
      for (const [key, ts] of seenRef.current.entries()) {
        if (now - ts > DEDUPE_MS) seenRef.current.delete(key);
      }
    };

    const shouldNotify = (dedupeKey) => {
      if (!dedupeKey) return false;
      pruneSeen();
      if (seenRef.current.has(dedupeKey)) return false;
      seenRef.current.set(dedupeKey, Date.now());
      return true;
    };

    const fetchConversationMeta = async (conversationId) => {
      if (!conversationId) return null;
      if (convCacheRef.current.has(conversationId)) {
        return convCacheRef.current.get(conversationId);
      }
      const { data } = await supabase
        .from('atendimento_conversas')
        .select('id, chat_jid, display_name, profile_pic_url, status, fila_id, whatsapp_config_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (data) convCacheRef.current.set(conversationId, data);
      return data;
    };

    const canNotifyRow = (row, convMeta) => {
      const ctx = ctxRef.current;
      const whatsappConfigId = row?.whatsapp_config_id || convMeta?.whatsapp_config_id || null;
      const filaId = resolveAtendimentoFilaId({
        filaId: convMeta?.fila_id ?? null,
        whatsappConfigId,
        filaCanaisByConfigId: ctx.filaCanaisByConfigId,
      });
      return canNotifyAtendimentoMessage({
        role: ctx.role,
        userAccess: ctx.userAccess,
        clienteId: row?.cliente_id,
        filaId,
        whatsappConfigId,
      });
    };

    const onRealtimeEvent = async (event, payload) => {
      const ctx = ctxRef.current;
      if (!ctx.enabled || !ctx.ids.length) return;

      const row = payload?.new;
      if (!row || !ctx.ids.includes(row.cliente_id)) return;

      if (event === 'inbox') {
        if (isReactionInboxRow(row)) return;
        if (!shouldNotify(`inbox:${row.id || row.message_id}`)) return;
        const convMeta = await fetchConversationMeta(row.conversation_id);
        if (!canNotifyRow(row, convMeta)) return;
        ctx.pushAlert(buildInboxAlert(row, convMeta));
        return;
      }

      if (event === 'sent') {
        if (ctx.profileId && row.sent_by === ctx.profileId) return;
        if (!shouldNotify(`sent:${row.id || row.message_id}`)) return;
        const convMeta = await fetchConversationMeta(row.conversation_id);
        if (!canNotifyRow(row, convMeta)) return;
        ctx.pushAlert(buildSentAlert(row, convMeta));
      }
    };

    const unsubscribe = subscribeAtendimentoIncomingAlerts(onRealtimeEvent);
    ensureAtendimentoIncomingAlertsRealtime(ids);

    return unsubscribe;
  }, [enabled, idsKey]);

  useEffect(() => {
    if (!alerts.length) return undefined;
    const timers = alerts.map((alert) => setTimeout(() => dismissAlert(alert.id), ALERT_TTL_MS));
    return () => timers.forEach(clearTimeout);
  }, [alerts, dismissAlert]);

  return { alerts, dismissAlert, openAlert };
}
