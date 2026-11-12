import { supabase } from '@/lib/customSupabaseClient';
import { phoneFromConversation } from '@/lib/atendimentoLeadContext';
import { persistComercialPatch } from '@/lib/persistComercialPatch';
import { sendMetaConversionForComercialChange } from '@/lib/metaConversions';
import { sendGoogleConversionForComercialChange } from '@/lib/googleConversions';

export async function ensureWhatsappContactForConversation({ clienteId, conversation }) {
  const fromJid = conversation?.chat_jid;
  if (!clienteId || !fromJid || conversation?.is_group) return null;

  const phone = phoneFromConversation(conversation);
  const now = new Date().toISOString();
  const row = {
    cliente_id: clienteId,
    from_jid: fromJid,
    phone: phone || null,
    sender_name: (conversation.display_name || '').trim() || null,
    whatsapp_config_id: conversation.whatsapp_config_id || null,
    first_seen_at: now,
    last_message_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('cliente_whatsapp_contact')
    .upsert(row, {
      onConflict: 'cliente_id,from_jid',
      ignoreDuplicates: false,
    })
    .select('id, from_jid, phone, sender_name, tracking_data, whatsapp_config_id')
    .single();

  if (error) throw error;
  return data;
}

async function resolveLeadAndContact({ clienteId, conversation, context }) {
  let lead = context?.leadId ? { id: context.leadId } : null;
  let contact = context?.contactId ? { id: context.contactId } : null;

  if (!lead?.id && !contact?.id && conversation) {
    const ensured = await ensureWhatsappContactForConversation({ clienteId, conversation });
    if (ensured) contact = ensured;
  }

  if (contact?.id && !contact.tracking_data) {
    const { data } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, from_jid, phone, sender_name, tracking_data, whatsapp_config_id')
      .eq('id', contact.id)
      .maybeSingle();
    if (data) contact = data;
  }

  if (lead?.id && !lead.whatsapp) {
    const { data } = await supabase
      .from('leads')
      .select('id, whatsapp, valor, tracking_data')
      .eq('id', lead.id)
      .maybeSingle();
    if (data) lead = data;
  }

  return { lead, contact };
}

export async function markConversationAsBaseClient({ clienteId, conversation, context, showToast }) {
  const { lead, contact } = await resolveLeadAndContact({ clienteId, conversation, context });
  const valor = context?.comercial?.valor ?? lead?.valor ?? contact?.valor_venda ?? 0;

  await persistComercialPatch({
    clienteId,
    lead,
    contact,
    patch: { comprou: true, valor: Number(valor) || 0 },
  });

  void sendMetaConversionForComercialChange({
    clienteId,
    patch: { comprou: true, valor: Number(valor) || 0 },
    lead,
    contact,
    showToast,
  });
  void sendGoogleConversionForComercialChange({
    clienteId,
    patch: { comprou: true, valor: Number(valor) || 0 },
    lead,
    contact,
    showToast,
  });

  return { lead, contact };
}

export async function unmarkConversationAsBaseClient({ clienteId, conversation, context }) {
  const { lead, contact } = await resolveLeadAndContact({ clienteId, conversation, context });

  await persistComercialPatch({
    clienteId,
    lead,
    contact,
    patch: { comprou: false },
  });
}

export function isBaseClientContext(context) {
  return context?.audienceType === 'base' || context?.comercial?.comprou === true;
}
