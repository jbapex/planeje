import React, { useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAtendimentoIncomingMessageAlerts } from '@/hooks/useAtendimentoIncomingMessageAlerts';
import { useAtendimentoUsuarioAcesso } from '@/hooks/useAtendimentoUsuarioAcesso';
import { clienteIdsForAtendimentoAlerts } from '@/lib/atendimentoUsuarioAcesso';
import AtendimentoMessageToastStack from '@/components/atendimento/AtendimentoMessageToastStack';
import AtendimentoNotificationPermissionBanner, {
  useAutoAskNotificationPermission,
} from '@/components/atendimento/AtendimentoNotificationPermissionBanner';
import { unlockAtendimentoMessageSound } from '@/lib/atendimentoMessageAlertSound';

/**
 * Notificações de mensagem em qualquer tela do app (som + card).
 */
export default function AtendimentoMessageAlertsBridge() {
  const { profile } = useAuth();
  const {
    effectiveClienteId,
    conversasAccessMissing,
    conversasClienteId,
    isAdminWithoutCliente,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ forConversas: true });

  const isStaff = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role);

  const {
    role,
    accessRows,
    filaCanaisByConfigId,
  } = useAtendimentoUsuarioAcesso({ enabled: Boolean(isStaff) });

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
    ]
  );

  const enabled = Boolean(isStaff) && !conversasAccessMissing && clienteIds.length > 0;

  const { alerts, dismissAlert, openAlert } = useAtendimentoIncomingMessageAlerts({
    clienteIds,
    enabled,
    role,
    userAccess: accessRows,
    filaCanaisByConfigId,
  });

  useAutoAskNotificationPermission(enabled);

  useEffect(() => {
    if (!isStaff) return undefined;

    const unlock = () => {
      unlockAtendimentoMessageSound();
    };

    const onVisibility = () => {
      if (!document.hidden) unlock();
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isStaff]);

  if (!isStaff) return null;

  return (
    <>
      <AtendimentoMessageToastStack alerts={alerts} onOpen={openAlert} onDismiss={dismissAlert} />
      <AtendimentoNotificationPermissionBanner />
    </>
  );
}
