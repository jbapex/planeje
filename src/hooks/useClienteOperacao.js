import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { buildGrupoConversasUrl, loadClienteGrupo } from '@/lib/clienteWhatsappGrupo';
import { loadClienteMetaResumo, metaResumoLabel } from '@/lib/clienteMetaResumo';

export function useClienteOperacao(client) {
  const clientId = client?.id;
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState(null);
  const [grupoConv, setGrupoConv] = useState(null);
  const [meta, setMeta] = useState({ accounts: [], metrics: undefined, health: null, permError: false });

  const reload = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [g, m] = await Promise.all([loadClienteGrupo(clientId), loadClienteMetaResumo(client)]);
      setGrupo(g);
      setMeta(m);
      if (g?.chat_jid) {
        const { data } = await supabase
          .from('atendimento_conversas')
          .select('id, display_name, chat_jid, last_message_preview, last_message_at, unread_count, status, cliente_id')
          .eq('chat_jid', g.chat_jid)
          .is('archived_at', null)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1);
        setGrupoConv(data?.[0] || null);
      } else {
        setGrupoConv(null);
      }
    } catch (e) {
      console.warn('operação do cliente', e);
    } finally {
      setLoading(false);
    }
  }, [client, clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const grupoUrl = buildGrupoConversasUrl(grupo);
  const metaLabel = metaResumoLabel({ ...meta, client });

  return { loading, grupo, grupoConv, grupoUrl, meta, metaLabel, reload };
}
