import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WifiOff, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAtendimentoCanalStatus } from '@/hooks/useAtendimentoCanalStatus';
import { useToast } from '@/components/ui/use-toast';
import { showAtendimentoDesktopNotification } from '@/lib/atendimentoDesktopNotification';
import { CONVERSAS_CANAIS_PATH } from '@/lib/conversasRoutes';
import { nomeDoCanal } from '@/lib/uazapiInstanceStatus';

export default function AtendimentoCanalDesconectadoBanner() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { conversasClienteId, effectiveClienteId } = useClienteWhatsAppConfig({ forConversas: true });
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const clienteId = conversasClienteId || effectiveClienteId || null;
  const { disconnected, texto, novos } = useAtendimentoCanalStatus({
    clienteId,
    enabled: Boolean(isStaff && clienteId),
  });
  const [hiddenKey, setHiddenKey] = useState('');
  const notifiedRef = useRef(new Set());
  const idsKey = disconnected.map((channel) => channel.id).join(',');

  useEffect(() => {
    const down = new Set(disconnected.map((channel) => channel.id));
    notifiedRef.current.forEach((id) => {
      if (!down.has(id)) notifiedRef.current.delete(id);
    });
  }, [disconnected]);

  useEffect(() => {
    const fresh = novos.filter((channel) => channel?.id && !notifiedRef.current.has(channel.id));
    if (!fresh.length) return;
    fresh.forEach((channel) => notifiedRef.current.add(channel.id));
    const names = fresh.map(nomeDoCanal).join(', ');
    const title = fresh.length === 1 ? 'Canal desconectado' : 'Canais desconectados';
    const preview = fresh.length === 1
      ? `${names} caiu. As mensagens desse número não entram até reconectar.`
      : `${names} caíram. As mensagens desses números não entram até reconectar.`;
    toast({ variant: 'destructive', title, description: preview });
    showAtendimentoDesktopNotification({
      title,
      preview,
      dedupeKey: `canal-desconectado:${fresh.map((channel) => channel.id).join(',')}`,
    });
  }, [novos, toast]);

  if (!texto || hiddenKey === idsKey) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
      role="status"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">{texto}</p>
      <Link to={CONVERSAS_CANAIS_PATH} className="shrink-0 font-semibold underline underline-offset-2">
        Conectar número
      </Link>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 hover:bg-amber-100"
        aria-label="Fechar aviso"
        onClick={() => setHiddenKey(idsKey)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
