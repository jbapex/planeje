import { supabase } from '@/lib/customSupabaseClient';
import { resolveComercialState } from '@/lib/leadComercial';
import { applyCommercialPatchToMini, readMiniCrm } from '@/lib/miniCrm';

/**
 * Atualiza qualificado / comprou / valor em lead e/ou contato WhatsApp.
 * Espelha no mini_crm do mesmo contato (Mini CRM da loja).
 * Mesma regra usada em Contatos e CRM.
 */
export async function persistComercialPatch({ clienteId, lead, contact, patch }) {
  if (!clienteId) throw new Error('Cliente não identificado.');

  const state = resolveComercialState({ lead, contact });
  const leadId = lead?.id ?? state.leadId;
  const contactId = contact?.id ?? state.contactId;

  if (!leadId && !contactId) {
    throw new Error('Sem lead ou contato para salvar.');
  }

  const now = new Date().toISOString();

  async function miniCrmPatchForContact(id) {
    if (!id || !patch) return null;
    if (!('qualificado' in patch || 'comprou' in patch || 'valor' in patch)) return null;
    let current = contact?.id === id ? contact?.mini_crm : undefined;
    if (current === undefined) {
      const { data } = await supabase
        .from('cliente_whatsapp_contact')
        .select('mini_crm')
        .eq('id', id)
        .eq('cliente_id', clienteId)
        .maybeSingle();
      current = data?.mini_crm;
    }
    const next = applyCommercialPatchToMini(current, patch);
    const before = JSON.stringify(readMiniCrm(current));
    const after = JSON.stringify(next);
    if (before === after) return null;
    return next;
  }

  if (leadId) {
    const leadPatch = { updated_at: now };
    if ('qualificado' in patch) leadPatch.qualificado = patch.qualificado;
    if ('comprou' in patch) leadPatch.comprou = patch.comprou;
    if ('valor' in patch) {
      leadPatch.valor = patch.valor;
      if (patch.comprou === true && patch.valor > 0) leadPatch.status = 'vendeu';
    }
    const { error } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', leadId)
      .eq('cliente_id', clienteId);
    if (error) throw error;

    if (contactId && ('qualificado' in patch || 'comprou' in patch || 'valor' in patch)) {
      const cPatch = { updated_at: now };
      if ('qualificado' in patch) cPatch.qualificado = patch.qualificado;
      if ('comprou' in patch) cPatch.comprou = patch.comprou;
      if ('valor' in patch) cPatch.valor_venda = patch.valor;
      const mini = await miniCrmPatchForContact(contactId);
      if (mini) cPatch.mini_crm = mini;
      await supabase.from('cliente_whatsapp_contact').update(cPatch).eq('id', contactId).eq('cliente_id', clienteId);
    }
  } else if (contactId) {
    const cPatch = { updated_at: now };
    if ('qualificado' in patch) cPatch.qualificado = patch.qualificado;
    if ('comprou' in patch) cPatch.comprou = patch.comprou;
    if ('valor' in patch) cPatch.valor_venda = patch.valor;
    const mini = await miniCrmPatchForContact(contactId);
    if (mini) cPatch.mini_crm = mini;
    const { error } = await supabase
      .from('cliente_whatsapp_contact')
      .update(cPatch)
      .eq('id', contactId)
      .eq('cliente_id', clienteId);
    if (error) throw error;
  }

  return { leadId, contactId };
}
