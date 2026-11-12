import { messageRulesCatalog, planMiniCrmMessage } from './miniCrmMessageRules.js';

// Awaited by both ingress routes. Only database writes; never sends messages/conversions.
export async function runMiniCrmMessage({ supabase, clienteId, jid, event }) {
  if (!clienteId || !jid || event?.historical || event?.isGroup || !event?.channel) return { applied: false, reason: 'not_direct' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: rules, error: ruleError } = await supabase.from('mini_crm_message_rules').select('settings,updated_at').eq('cliente_id', clienteId).maybeSingle();
    if (ruleError) throw new Error(`mini_crm_rules:${ruleError.code || 'read'}`);
    if (!rules?.settings?.enabled) return { applied: false, reason: 'disabled' };
    const reads = await Promise.all([
      supabase.from('cliente_whatsapp_contact').select('id,mini_crm').eq('cliente_id', clienteId).eq('from_jid', jid).maybeSingle(),
      supabase.from('mini_crm_config').select('statuses,columns,updated_at').eq('cliente_id', clienteId).maybeSingle(),
      supabase.from('clientes').select('nicho').eq('id', clienteId).maybeSingle(),
    ]);
    if (reads.some((read) => read.error)) throw new Error('mini_crm_context_read');
    const [contact, config, client] = reads.map((read) => read.data);
    if (!contact) return { applied: false, reason: 'contact_missing' };
    const plan = planMiniCrmMessage({ rules: rules.settings, catalog: messageRulesCatalog(client, config), mini: contact.mini_crm || {}, event, enabledAt: rules.updated_at });
    if (!plan.apply) return { applied: false, reason: plan.reason };
    const { data, error } = await supabase.rpc('mini_crm_apply_message', {
      p_cliente_id: clienteId, p_contact_id: contact.id, p_rules_at: rules.updated_at, p_config_at: config?.updated_at || null,
      p_expected: contact.mini_crm || {}, p_patch: plan.patch, p_channel: event.channel, p_message: String(event.messageId),
      p_at: new Date(event.at).toISOString(), p_reason: plan.reason, p_day: plan.appointment?.day || null, p_time: plan.appointment?.time || null,
    });
    if (error) throw new Error(`mini_crm_apply:${error.code || 'write'}`);
    if (data?.reason !== 'contact_changed') return data;
  }
  return { applied: false, reason: 'concurrent_edit' };
}
