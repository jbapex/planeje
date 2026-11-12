import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Permissões de fila/canal do usuário logado (atendimento_usuario_acesso).
 */
export function useAtendimentoUsuarioAcesso({ enabled = true } = {}) {
  const { profile } = useAuth();
  const [accessRows, setAccessRows] = useState([]);
  const [filaCanaisByConfigId, setFilaCanaisByConfigId] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const filaCanaisRef = useRef(filaCanaisByConfigId);
  filaCanaisRef.current = filaCanaisByConfigId;

  const role = profile?.role ?? null;
  const userId = profile?.id ?? null;
  const isStaff = role && ['superadmin', 'admin', 'colaborador'].includes(role);

  const reload = useCallback(async () => {
    if (!enabled || !userId || !isStaff) {
      setAccessRows([]);
      setFilaCanaisByConfigId(new Map());
      return;
    }

    setLoading(true);
    try {
      const [accessRes, canaisRes] = await Promise.all([
        supabase
          .from('atendimento_usuario_acesso')
          .select('cliente_id, fila_id, whatsapp_config_id')
          .eq('user_id', userId),
        supabase.from('atendimento_fila_canais').select('fila_id, whatsapp_config_id'),
      ]);

      setAccessRows(accessRes.data || []);

      const map = new Map();
      (canaisRes.data || []).forEach((row) => {
        if (row.whatsapp_config_id && row.fila_id) {
          map.set(row.whatsapp_config_id, row.fila_id);
        }
      });
      setFilaCanaisByConfigId(map);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId, isStaff]);

  useEffect(() => {
    reload();
  }, [reload]);

  const clienteIdsFromAccess = useMemo(
    () => [...new Set(accessRows.map((r) => r.cliente_id).filter(Boolean))],
    [accessRows]
  );

  return {
    role,
    userId,
    isStaff,
    accessRows,
    filaCanaisByConfigId,
    filaCanaisRef,
    clienteIdsFromAccess,
    loading,
    reload,
  };
}
