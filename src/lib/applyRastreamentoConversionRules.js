import { supabase } from '@/lib/customSupabaseClient';
import { getPhoneVariations } from '@/lib/leadUtils';
import { sendMetaConversionForComercialChange } from '@/lib/metaConversions';
import { sendGoogleConversionForComercialChange } from '@/lib/googleConversions';
import {
  addedEtiquetas,
  eventPatchForName,
  rulesMatchingNewEtiquetas,
} from '@/lib/rastreamentoConversionRules';
import { withoutAnalysisLabels } from '@/lib/rastreamentoAnalysisLabels';

export async function loadRastreamentoConversionRules(clienteId) {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('rastreamento_conversion_rules')
    .select('id, name, trigger_type, trigger_value, match_mode, event_name, active, created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function findContactForLead(clienteId, lead, contact) {
  if (contact?.id) return contact;
  const phones = getPhoneVariations(lead?.whatsapp || lead?.phone || contact?.phone);
  if (!clienteId || !phones.length) return contact || null;
  const { data } = await supabase
    .from('cliente_whatsapp_contact')
    .select('*')
    .eq('cliente_id', clienteId)
    .in('phone', phones)
    .limit(1);
  return data?.[0] || contact || null;
}

export async function applyEtiquetaConversionRules({
  clienteId,
  lead,
  contact,
  previousEtiquetas,
  nextEtiquetas,
  showToast,
}) {
  if (!clienteId) return { sent: 0 };
  const added = withoutAnalysisLabels(addedEtiquetas(previousEtiquetas, nextEtiquetas));
  if (!added.length) return { sent: 0, skipped: true, reason: 'sem_etiqueta_nova' };

  const rules = (await loadRastreamentoConversionRules(clienteId)).filter((rule) => rule.active);
  const matched = rulesMatchingNewEtiquetas(rules, added);
  if (!matched.length) return { sent: 0, skipped: true, reason: 'sem_regra' };

  const resolvedContact = await findContactForLead(clienteId, lead, contact);
  let sent = 0;
  for (const rule of matched) {
    const patch = eventPatchForName(rule.event_name, { valor: lead?.valor ?? resolvedContact?.valor_venda });
    if (!patch) continue;
    const result = await sendMetaConversionForComercialChange({
      clienteId,
      patch,
      lead,
      contact: resolvedContact,
      showToast,
      eventName: rule.event_name,
    });
    if (result?.sent) sent += 1;
    const googleResult = await sendGoogleConversionForComercialChange({
      clienteId,
      patch,
      lead,
      contact: resolvedContact,
      showToast,
      eventName: rule.event_name,
    });
    if (googleResult?.sent) sent += 1;
  }
  return { sent, matched: matched.length };
}
