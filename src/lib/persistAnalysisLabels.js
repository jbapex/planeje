import { supabase } from '@/lib/customSupabaseClient';
import { mergeTrackingAnalysisLabels, normalizeAnalysisLabelName } from '@/lib/rastreamentoAnalysisLabels';

async function mergeAndSaveTracking(table, id, clienteId, labels) {
  const { data: latest, error: readError } = await supabase
    .from(table)
    .select('tracking_data')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (readError) throw readError;
  const tracking = mergeTrackingAnalysisLabels(latest?.tracking_data, labels);
  const { error } = await supabase
    .from(table)
    .update({ tracking_data: tracking, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('cliente_id', clienteId);
  if (error) throw error;
  return tracking;
}

/** Grava etiquetas de análise em tracking_data.planeje_labels. Não manda CAPI. */
export async function persistAnalysisLabels({ clienteId, contact, lead, labels }) {
  if (!clienteId) throw new Error('Cliente não identificado.');
  if (!contact?.id && !lead?.id) throw new Error('Sem lead ou contato para salvar.');
  const next = [...new Set((labels || []).map(normalizeAnalysisLabelName).filter(Boolean))];
  if (contact?.id) {
    await mergeAndSaveTracking('cliente_whatsapp_contact', contact.id, clienteId, next);
  }
  if (lead?.id) {
    await mergeAndSaveTracking('leads', lead.id, clienteId, next);
  }
  return next;
}
