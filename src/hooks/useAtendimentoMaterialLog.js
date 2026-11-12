import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { mergeMaterialLogEntries } from '@/lib/atendimentoMaterialLog';
import { isCsGroupMessage, scopeCsGroupMessages } from '@/lib/csIaGroupNavigation';

const LOG_SELECT =
  'id, send_kind, label, file_name, body_preview, message_id, created_at, sent_by';
const SENT_SELECT = 'id, body, message_id, created_at, sent_by';

export function useAtendimentoMaterialLog({ clienteId, conversation, limit = 30, csGroup }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatJid = conversation?.chat_jid;

  const load = useCallback(async () => {
    if (!clienteId || !chatJid) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      function list(table, columns, address) {
        const scopeColumns = csGroup ? `,cliente_id,whatsapp_config_id,conversation_id,chat_jid${address ? `,${address}` : ''}` : '';
        const query = supabase.from(table).select(columns + scopeColumns);
        return (csGroup ? scopeCsGroupMessages(query, csGroup, address) : query.eq('cliente_id', clienteId).eq('chat_jid', chatJid))
          .order('created_at', { ascending: false }).limit(limit);
      }
      const [logRes, sentRes] = await Promise.all([
        list('atendimento_material_envios', LOG_SELECT),
        list('cliente_whatsapp_sent', SENT_SELECT, 'to_jid'),
      ]);

      const allowedRows = (result) => (result.error ? [] : result.data || []).filter((row) => !csGroup || isCsGroupMessage(row, csGroup));
      const logRows = allowedRows(logRes);
      const sentRows = allowedRows(sentRes);

      const userIds = [
        ...new Set(
          [...logRows, ...sentRows].map((r) => r.sent_by).filter(Boolean)
        ),
      ];

      let agentNames = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        agentNames = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
      }

      setEntries(mergeMaterialLogEntries(logRows, sentRows, agentNames));
    } finally {
      setLoading(false);
    }
  }, [clienteId, chatJid, limit, csGroup]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!clienteId || !chatJid) return;
    const matches = (row) => csGroup ? isCsGroupMessage(row, csGroup) : row?.chat_jid === chatJid;
    const ch = supabase
      .channel(`material-log:${clienteId}:${chatJid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'atendimento_material_envios',
          filter: `cliente_id=eq.${clienteId}`,
        },
        (payload) => {
          const row = payload.new;
          if (matches(row)) load();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cliente_whatsapp_sent',
          filter: `cliente_id=eq.${clienteId}`,
        },
        (payload) => {
          const row = payload.new;
          if (matches(row)) load();
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [clienteId, chatJid, load, csGroup]);

  const stats = entries.reduce(
    (acc, e) => {
      acc.total += 1;
      acc[e.sendKind] = (acc[e.sendKind] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  return { entries, loading, reload: load, stats };
}
