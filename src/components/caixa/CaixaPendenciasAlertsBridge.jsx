import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { showAtendimentoDesktopNotification } from '@/lib/atendimentoDesktopNotification';
import { isCaixaPushOptInEnabled } from '@/lib/caixaPendenciasAlerts';

const STAFF_ROLES = ['superadmin', 'admin', 'colaborador'];

export default function CaixaPendenciasAlertsBridge() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const seenRef = useRef(new Set());
  const enabled = Boolean(
    profile?.id
    && STAFF_ROLES.includes(profile?.role)
    && profile?.status === 'active'
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const openCaixa = () => navigate('/caixa');

    const notify = (row, kind) => {
      if (!isCaixaPushOptInEnabled()) return;
      const dayKey = new Date().toISOString().slice(0, 10);
      const key = kind === 'sla'
        ? `sla:${row?.id}:${dayKey}`
        : `${kind}:${row?.id}:${row?.updated_at || row?.created_at}`;
      if (!row?.id || seenRef.current.has(key)) return;
      seenRef.current.add(key);

      const title = kind === 'sla' ? 'SLA estourado' : 'Novo pedido interno';
      const description = 'Abra a Minha caixa para ver os detalhes.';

      toast({
        title,
        description,
        action: (
          <button
            type="button"
            className="rounded-md border px-2.5 py-1.5 text-xs font-semibold"
            onClick={openCaixa}
          >
            Abrir caixa
          </button>
        ),
      });

      if (document.hidden) {
        showAtendimentoDesktopNotification(
          {
            id: `caixa-${row.id}`,
            dedupeKey: key,
            title,
            preview: description,
            subtitle: null,
            avatarUrl: null,
          },
          openCaixa
        );
      }
    };

    const channel = supabase
      .channel(`caixa-alertas:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pendencias_caixa',
          filter: `pessoa_id=eq.${profile.id}`,
        },
        ({ new: row }) => {
          if (!row?.resolved_at && row?.origem === 'comentario') {
            notify(row, 'pedido_interno');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pendencias_caixa',
          filter: `pessoa_id=eq.${profile.id}`,
        },
        ({ new: row }) => {
          if (row?.origem === 'conversa' && row?.sla_estourado && !row?.resolved_at) {
            notify(row, 'sla');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, navigate, profile?.id]);

  return null;
}

