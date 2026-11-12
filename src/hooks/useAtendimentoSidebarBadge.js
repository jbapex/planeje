import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAtendimentoUsuarioAcesso } from '@/hooks/useAtendimentoUsuarioAcesso';
import {
  clienteIdsForAtendimentoAlerts,
  filterAtendimentoConversationsForUser,
} from '@/lib/atendimentoUsuarioAcesso';
import { mergeGroupConversationsForList } from '@/lib/atendimentoGroupConversationDedup';
import { computeSidebarBadge } from '@/lib/atendimentoSidebarBadge';
import {
  ensureAtendimentoIncomingAlertsRealtime,
  subscribeAtendimentoBadgeRefresh,
} from '@/lib/atendimentoIncomingAlertsRealtime';

const CONVERSA_SELECT = 'id, cliente_id, chat_jid, is_group, status, unread_count, fila_id, whatsapp_config_id, bloqueada, archived_at';

/**
 * Contador global no menu Conversas: fila aberta (Aguardando, ou Em atendimento
 * com mensagem nova). Resolvida fica de fora. Um número por chat.
 */
export function useAtendimentoSidebarBadge() {
  const { profile } = useAuth();
  const {
    effectiveClienteId,
    conversasAccessMissing,
    conversasClienteId,
    isAdminWithoutCliente,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ forConversas: true });

  const isStaff = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role);

  const { role, accessRows, filaCanaisByConfigId } = useAtendimentoUsuarioAcesso({
    enabled: Boolean(isStaff),
  });

  const clienteIds = useMemo(
    () =>
      clienteIdsForAtendimentoAlerts({
        role,
        userAccess: accessRows,
        effectiveClienteId,
        conversasClienteId,
        profileClienteId: profile?.cliente_id,
        clientesForAdmin,
        isAdminWithoutCliente,
      }),
    [
      role,
      accessRows,
      effectiveClienteId,
      conversasClienteId,
      profile?.cliente_id,
      clientesForAdmin,
      isAdminWithoutCliente,
    ],
  );

  const clienteIdsKey = useMemo(() => clienteIds.slice().sort().join(','), [clienteIds]);

  const enabled = Boolean(isStaff) && !conversasAccessMissing && clienteIds.length > 0;
  const [counts, setCounts] = useState({ unreadConversations: 0, aguardandoOnly: 0, badgeTotal: 0 });

  const ctxRef = useRef({});
  ctxRef.current = {
    enabled,
    clienteIds,
    role,
    accessRows,
    filaCanaisByConfigId,
  };

  const loadCounts = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx.enabled) {
      setCounts({ unreadConversations: 0, aguardandoOnly: 0, badgeTotal: 0 });
      return;
    }

    const { data, error } = await supabase
      .from('atendimento_conversas')
      .select(CONVERSA_SELECT)
      .in('cliente_id', ctx.clienteIds)
      .is('archived_at', null);

    if (error) {
      return;
    }

    const live = (data || []).filter((row) => !row.archived_at && !row.bloqueada);
    const accessible = filterAtendimentoConversationsForUser({
      role: ctx.role,
      userAccess: ctx.accessRows,
      clienteId: ctx.clienteIds.length === 1 ? ctx.clienteIds[0] : null,
      conversations: live,
      filaCanaisByConfigId: ctx.filaCanaisByConfigId,
    });

    const deduped = mergeGroupConversationsForList(accessible, { channelFilter: 'all' });
    setCounts(computeSidebarBadge(deduped));
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, enabled, clienteIdsKey, role, accessRows, filaCanaisByConfigId]);

  useEffect(() => {
    if (!enabled || !clienteIdsKey) return undefined;

    const unsubscribe = subscribeAtendimentoBadgeRefresh(() => {
      loadCounts();
    });
    ensureAtendimentoIncomingAlertsRealtime(clienteIds);

    return unsubscribe;
  }, [enabled, clienteIdsKey, clienteIds, loadCounts]);

  return counts;
}
