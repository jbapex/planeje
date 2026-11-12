import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getPhoneVariations } from '@/lib/leadUtils';
import {
  classifyOutboundBody,
  computeMaterialLogStats,
  mergeGlobalMaterialLogEntries,
} from '@/lib/atendimentoMaterialLog';

const LOG_SELECT =
  'id, chat_jid, conversation_id, send_kind, label, file_name, message_id, created_at, sent_by';
const SENT_SELECT = 'id, chat_jid, body, message_id, created_at, sent_by';

async function loadBaseClientJids(clienteId) {
  const jids = new Set();
  const [contactsRes, leadsRes] = await Promise.all([
    supabase.from('cliente_whatsapp_contact').select('from_jid').eq('cliente_id', clienteId).eq('comprou', true),
    supabase.from('leads').select('whatsapp').eq('cliente_id', clienteId).eq('comprou', true).not('whatsapp', 'is', null),
  ]);
  (contactsRes.data || []).forEach((c) => {
    if (c.from_jid) jids.add(c.from_jid);
  });
  (leadsRes.data || []).forEach((l) => {
    getPhoneVariations(l.whatsapp || '').forEach((v) => {
      const digits = String(v).replace(/\D/g, '');
      if (digits.length >= 10) jids.add(`${digits}@s.whatsapp.net`);
    });
  });
  return jids;
}

export function useAtendimentoMaterialLogGlobal({
  clienteId,
  days = 30,
  sendKind = 'all',
  sentBy = 'all',
  audience = 'all',
  search = '',
  limit = 250,
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);

  const load = useCallback(async () => {
    if (!clienteId) {
      setEntries([]);
      setAgents([]);
      return;
    }
    setLoading(true);
    try {
      const since =
        Number(days) > 0 ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString() : null;

      let logQuery = supabase
        .from('atendimento_material_envios')
        .select(LOG_SELECT)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(limit);

      let sentQuery = supabase
        .from('cliente_whatsapp_sent')
        .select(SENT_SELECT)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (since) {
        logQuery = logQuery.gte('created_at', since);
        sentQuery = sentQuery.gte('created_at', since);
      }
      if (sendKind !== 'all') {
        logQuery = logQuery.eq('send_kind', sendKind);
      }
      if (sentBy !== 'all') {
        logQuery = logQuery.eq('sent_by', sentBy);
        sentQuery = sentQuery.eq('sent_by', sentBy);
      }

      const baseJidsPromise = audience === 'base' ? loadBaseClientJids(clienteId) : Promise.resolve(null);

      const [logRes, sentRes, baseJids, agentsRes] = await Promise.all([
        logQuery,
        sentQuery,
        baseJidsPromise,
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['superadmin', 'admin', 'colaborador'])
          .order('full_name'),
      ]);

      setAgents(agentsRes.data || []);

      let logRows = logRes.error ? [] : logRes.data || [];
      let sentRows = sentRes.error ? [] : sentRes.data || [];

      if (sendKind !== 'all') {
        sentRows = sentRows.filter((row) => classifyOutboundBody(row.body).sendKind === sendKind);
      }

      if (baseJids) {
        logRows = logRows.filter((r) => baseJids.has(r.chat_jid));
        sentRows = sentRows.filter((r) => baseJids.has(r.chat_jid));
      }

      const jids = [...new Set([...logRows, ...sentRows].map((r) => r.chat_jid).filter(Boolean))];
      let convByJid = {};
      if (jids.length > 0) {
        const { data: convs } = await supabase
          .from('atendimento_conversas')
          .select('chat_jid, display_name, is_group')
          .eq('cliente_id', clienteId)
          .in('chat_jid', jids);
        convByJid = Object.fromEntries((convs || []).map((c) => [c.chat_jid, c]));
      }

      const userIds = [...new Set([...logRows, ...sentRows].map((r) => r.sent_by).filter(Boolean))];
      let agentNames = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        agentNames = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
      }

      let merged = mergeGlobalMaterialLogEntries(logRows, sentRows, agentNames, convByJid);

      const q = search.trim().toLowerCase();
      if (q) {
        merged = merged.filter((e) => {
          const name = (e.contactName || e.chatJid || '').toLowerCase();
          const label = (e.label || e.fileName || '').toLowerCase();
          const agent = (e.agentName || '').toLowerCase();
          return name.includes(q) || label.includes(q) || agent.includes(q);
        });
      }

      setEntries(merged);
    } finally {
      setLoading(false);
    }
  }, [clienteId, days, sendKind, sentBy, audience, search, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => computeMaterialLogStats(entries), [entries]);

  return { entries, loading, stats, agents, reload: load };
}
