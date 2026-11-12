import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  LEAD_CONTEXT_SELECT,
  CONTACT_CONTEXT_SELECT,
  buildPhoneToLeadMap,
  findLeadForConversation,
  buildConversationContext,
  listContextSummary,
} from '@/lib/atendimentoLeadContext';

function privateChatJidsKey(conversations) {
  return [...new Set(
    (conversations || [])
      .filter((c) => c && !c.is_group && c.chat_jid)
      .map((c) => c.chat_jid)
  )]
    .sort()
    .join('\n');
}

/** Carrega contato + lead CRM para conversas de atendimento (lista + selecionada). */
export function useAtendimentoCrmContext({ clienteId, conversations, selectedConversation }) {
  const [loading, setLoading] = useState(false);
  const [phoneToLead, setPhoneToLead] = useState(new Map());
  const [contactByJid, setContactByJid] = useState(new Map());
  const [profileById, setProfileById] = useState(new Map());
  const [productInterestByProductId, setProductInterestByProductId] = useState(new Map());
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const hasLoadedRef = useRef(false);

  const jidsKey = useMemo(() => privateChatJidsKey(conversations), [conversations]);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!clienteId) {
      setPhoneToLead(new Map());
      setContactByJid(new Map());
      setProfileById(new Map());
      setProductInterestByProductId(new Map());
      hasLoadedRef.current = false;
      return;
    }

    const pvConvs = (conversationsRef.current || []).filter((c) => c && !c.is_group && c.chat_jid);
    if (pvConvs.length === 0) {
      setPhoneToLead(new Map());
      setContactByJid(new Map());
      setProfileById(new Map());
      setProductInterestByProductId(new Map());
      hasLoadedRef.current = false;
      return;
    }

    if (!silent && !hasLoadedRef.current) setLoading(true);
    try {
      const jids = [...new Set(pvConvs.map((c) => c.chat_jid).filter(Boolean))];

      const [leadsRes, contactsRes] = await Promise.all([
        supabase.from('leads').select(LEAD_CONTEXT_SELECT).eq('cliente_id', clienteId).not('whatsapp', 'is', null),
        supabase.from('cliente_whatsapp_contact').select(CONTACT_CONTEXT_SELECT).eq('cliente_id', clienteId).in('from_jid', jids),
      ]);

      const leads = leadsRes.data || [];
      const contacts = contactsRes.data || [];
      const leadMap = buildPhoneToLeadMap(leads);

      const cMap = new Map();
      contacts.forEach((c) => {
        if (c.from_jid) cMap.set(c.from_jid, c);
      });

      const userIds = new Set();
      pvConvs.forEach((c) => {
        if (c.assigned_to) userIds.add(c.assigned_to);
      });
      leads.forEach((l) => {
        if (l.responsavel_id) userIds.add(l.responsavel_id);
      });

      let pMap = new Map();
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', [...userIds]);
        pMap = new Map((profiles || []).map((p) => [p.id, p]));
      }

      const productIds = [...new Set(leads.map((l) => l.product_id).filter(Boolean))];
      const interestMap = new Map();
      await Promise.all(
        productIds.map(async (pid) => {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('cliente_id', clienteId)
            .eq('product_id', pid);
          const n = typeof count === 'number' ? count : 0;
          interestMap.set(pid, Math.max(0, n - 1));
        })
      );

      setPhoneToLead(leadMap);
      setContactByJid(cMap);
      setProfileById(pMap);
      setProductInterestByProductId(interestMap);
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [clienteId, jidsKey]);

  useEffect(() => {
    reload({ silent: hasLoadedRef.current });
  }, [reload]);

  const buildCtx = useCallback(
    (conv) => {
      if (!conv) return null;
      const contact = conv.chat_jid ? contactByJid.get(conv.chat_jid) : null;
      const lead = findLeadForConversation(phoneToLead, conv);
      const assignedProfile = conv.assigned_to ? profileById.get(conv.assigned_to) : null;
      const productInterestCount = lead?.product_id ? productInterestByProductId.get(lead.product_id) ?? 0 : 0;
      return buildConversationContext({
        conv,
        contact,
        lead,
        assignedProfile,
        productInterestCount,
      });
    },
    [contactByJid, phoneToLead, profileById, productInterestByProductId]
  );

  const contextByConvId = useMemo(() => {
    const out = {};
    (conversations || []).forEach((conv) => {
      const ctx = buildCtx(conv);
      out[conv.id] = listContextSummary(ctx);
    });
    return out;
  }, [conversations, buildCtx]);

  const selectedContext = useMemo(
    () => (selectedConversation ? buildCtx(selectedConversation) : null),
    [selectedConversation, buildCtx]
  );

  return {
    loading,
    reload,
    contextByConvId,
    selectedContext,
    buildCtx,
  };
}
