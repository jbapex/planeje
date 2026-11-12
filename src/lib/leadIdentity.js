import { normalizeLeadName } from './miniCrm.js';

export function contactDisplayName(contact) {
  return String(contact?.mini_crm?.contato_nome || contact?.tracking_data?.lead_name || contact?.sender_name || '').trim();
}

// The same contact RLS as the existing editors. A concurrent stage/date edit forces a fresh read.
export async function saveContactName(supabase, { clienteId, contactId, name }) {
  const normalized = normalizeLeadName(name);
  if (!clienteId || !contactId || !normalized || normalized.length > 160) throw new Error('Digite um nome com até 160 caracteres.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: readError } = await supabase.from('cliente_whatsapp_contact')
      .select('id,mini_crm').eq('cliente_id', clienteId).eq('id', contactId).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error('Contato indisponível para edição.');
    const mini = { ...(current.mini_crm || {}), contato_nome: normalized };
    let update = supabase.from('cliente_whatsapp_contact')
      .update({ sender_name: normalized, mini_crm: mini, updated_at: new Date().toISOString() })
      .eq('cliente_id', clienteId).eq('id', contactId);
    update = current.mini_crm == null ? update.is('mini_crm', null) : update.eq('mini_crm', JSON.stringify(current.mini_crm));
    const { data, error } = await update.select('id,cliente_id,sender_name,mini_crm,updated_at').maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  throw new Error('O contato foi atualizado em outra tela. Tente salvar o nome novamente.');
}
