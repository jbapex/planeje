import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { formatWaitDuration } from '@/lib/atendimentoWaitTime';
import {
  avisoEsperaVisivelPara,
  dedupeAguardandoAviso,
  etapaAvisoEspera,
  nomeGrupoAviso,
  normalizarAvisoEspera,
} from '@/lib/atendimentoAvisoEspera';

const POLL_MS = 20000;

export function useAvisosGrupoEspera() {
  const { profile } = useAuth();
  const { conversasClienteId, effectiveClienteId } = useClienteWhatsAppConfig({ forConversas: true });
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const clienteId = conversasClienteId || effectiveClienteId || null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [config, setConfig] = useState(() => normalizarAvisoEspera(null));
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [nomes, setNomes] = useState({});

  useEffect(() => {
    if (!isStaff || !clienteId) return undefined;
    let cancel = false;

    const carregar = async () => {
      const [cfgRes, listaRes] = await Promise.all([
        supabase
          .from('atendimento_aviso_espera')
          .select('habilitado, primeiro_minutos, repetir_minutos')
          .eq('cliente_id', clienteId)
          .maybeSingle(),
        supabase
          .from('atendimento_conversas')
          .select('id, cliente_id, display_name, assigned_to, awaiting_response_since, status, is_group, chat_jid', { count: 'exact' })
          .eq('cliente_id', clienteId)
          .is('archived_at', null)
          .neq('status', 'resolvido')
          .eq('is_group', true)
          .eq('bloqueada', false)
          .not('awaiting_response_since', 'is', null)
          .order('awaiting_response_since', { ascending: true })
          .limit(80),
      ]);
      if (cancel) return;
      setConfig(normalizarAvisoEspera(cfgRes.data));
      const lista = dedupeAguardandoAviso(listaRes.data || []);
      setRows(lista);
      setTotal(listaRes.count || lista.length);
      const ids = [...new Set(lista.map((row) => row.assigned_to).filter(Boolean))];
      if (!ids.length) {
        setNomes({});
        return;
      }
      const { data: pessoas } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      if (cancel) return;
      const map = {};
      (pessoas || []).forEach((pessoa) => {
        if (pessoa.full_name) map[pessoa.id] = pessoa.full_name;
      });
      setNomes(map);
    };

    carregar();
    const poll = setInterval(carregar, POLL_MS);
    const tick = setInterval(() => setNowMs(Date.now()), POLL_MS);
    return () => {
      cancel = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [isStaff, clienteId]);

  const avisos = useMemo(() => {
    if (!config.habilitado || !clienteId) return [];
    return rows
      .map((row) => {
        const since = new Date(row.awaiting_response_since).getTime();
        const elapsed = Number.isFinite(since) ? Math.max(0, nowMs - since) : 0;
        const etapa = etapaAvisoEspera(elapsed, config);
        if (etapa == null) return null;
        if (!avisoEsperaVisivelPara({
          role: profile?.role,
          userId: profile?.id,
          assignedTo: row.assigned_to || null,
        })) return null;
        const responsavel = row.assigned_to
          ? (nomes[row.assigned_to] || 'Responsável atribuído')
          : 'Sem responsável';
        return {
          id: row.id,
          nome: nomeGrupoAviso(row),
          tempo: formatWaitDuration(elapsed),
          responsavel,
          etapa,
          chatJid: row.chat_jid,
          status: row.status,
          clienteId: row.cliente_id,
          since: row.awaiting_response_since,
        };
      })
      .filter(Boolean);
  }, [rows, config, nowMs, profile?.role, profile?.id, nomes, clienteId]);

  return { avisos, config, total, clienteId, nowMs };
}
