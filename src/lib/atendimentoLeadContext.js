import { jidPhoneDigits } from '@/lib/uazapiMessageBody';
import { getPhoneVariations, normalizePhoneNumber } from '@/lib/leadUtils';
import { resolveComercialState } from '@/lib/leadComercial';

export const LEAD_CONTEXT_SELECT =
  'id, nome, whatsapp, status, valor, observacoes, product_id, responsavel_id, proxima_acao, qualificado, comprou, etiquetas, vendedor, pipeline:pipeline_id(id, nome), stage:stage_id(id, nome, color), product:product_id(id, name, code), responsavel:responsavel_id(id, full_name)';

export const CONTACT_CONTEXT_SELECT =
  'id, from_jid, phone, sender_name, origin_source, qualificado, comprou, valor_venda, crm_apice_lead_status';

export function phoneFromConversation(conv) {
  if (!conv || conv.is_group) return '';
  const raw = conv.chat_jid?.replace(/@.*$/, '') || jidPhoneDigits(conv.chat_jid) || '';
  return normalizePhoneNumber(raw) || raw.replace(/\D/g, '');
}

export function formatLeadValor(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildPhoneToLeadMap(leads) {
  const map = new Map();
  (leads || []).forEach((lead) => {
    getPhoneVariations(lead.whatsapp || '').forEach((v) => {
      if (!map.has(v)) map.set(v, lead);
    });
  });
  return map;
}

export function findLeadForPhone(phoneToLead, phoneOrJid) {
  if (!phoneToLead?.size) return null;
  const raw = String(phoneOrJid || '').trim();
  if (!raw) return null;
  for (const v of getPhoneVariations(raw)) {
    const lead = phoneToLead.get(v);
    if (lead) return lead;
  }
  return null;
}

export function findLeadForConversation(phoneToLead, conv) {
  if (!conv || conv.is_group) return null;
  const fromJid = conv.chat_jid;
  const lead = findLeadForPhone(phoneToLead, fromJid);
  if (lead) return lead;
  return findLeadForPhone(phoneToLead, phoneFromConversation(conv));
}

export function statusLabelFromLead(lead, contact) {
  if (lead?.stage?.nome) return lead.stage.nome;
  if (lead?.status) return lead.status;
  if (contact?.crm_apice_lead_status) return contact.crm_apice_lead_status;
  return null;
}

export function statusColorFromLead(lead) {
  const c = lead?.stage?.color;
  if (c && /^#[0-9a-f]{3,8}$/i.test(c)) return c;
  return null;
}

export function buildConversationContext({
  conv,
  contact,
  lead,
  assignedProfile,
  productInterestCount = 0,
}) {
  if (!conv || conv.is_group) {
    return {
      convId: conv?.id,
      isGroup: true,
      displayName: conv?.display_name || 'Grupo',
      hasCrm: false,
    };
  }

  const comercial = resolveComercialState({ lead, contact });
  const productName = lead?.product?.name || null;
  const formattedValor = formatLeadValor(comercial.valor);
  const statusLabel = statusLabelFromLead(lead, contact);
  const statusColor = statusColorFromLead(lead);
  const audienceType =
    comercial.comprou === true
      ? 'base'
      : lead && comercial.comprou !== true
        ? 'commercial'
        : contact && !lead
          ? 'contact'
          : 'unknown';
  const agentName =
    assignedProfile?.full_name ||
    lead?.responsavel?.full_name ||
    lead?.vendedor ||
    null;
  const hasProximaAcao = Boolean(lead?.proxima_acao);

  return {
    convId: conv.id,
    isGroup: false,
    hasCrm: Boolean(lead || contact),
    leadId: lead?.id || null,
    contactId: contact?.id || null,
    leadName: lead?.nome || contact?.sender_name || conv.display_name || null,
    productName,
    productId: lead?.product_id || null,
    formattedValor,
    statusLabel,
    statusColor,
    agentName,
    originSource: contact?.origin_source || lead?.origem || null,
    productInterestCount,
    hasProximaAcao,
    etiquetas: Array.isArray(lead?.etiquetas) ? lead.etiquetas : [],
    comercial,
    audienceType,
    /** Para templates de ação rápida */
    templateCtx: {
      formattedValor,
      productName,
      leadName: lead?.nome || conv.display_name,
    },
  };
}

export function listContextSummary(ctx) {
  if (!ctx) return null;
  if (ctx.isGroup) {
    return { isGroup: true, audienceType: 'groups' };
  }
  if (!ctx.hasCrm) {
    return { audienceType: ctx.audienceType || 'unknown' };
  }
  return {
    statusLabel: ctx.statusLabel,
    statusColor: ctx.statusColor,
    productName: ctx.productName,
    agentName: ctx.agentName,
    hasProximaAcao: ctx.hasProximaAcao,
    audienceType: ctx.audienceType,
    isGroup: false,
  };
}
