import { supabase } from '@/lib/customSupabaseClient';
import { trackingDataFromLeadOrContact } from '@/lib/metaConversions';
import {
  buildGoogleClickConversionPayload,
  extractGclid,
  shouldSkipGoogleComercialWithoutMapping,
} from '@/lib/googleConversionsPayload';

export {
  buildGoogleClickConversionPayload,
  extractGclid,
  shouldSkipGoogleComercialWithoutMapping,
};

/**
 * Qualificado / Compra → Google Ads só se houver gclid e ação mapeada na conta.
 * LeadSubmitted comercial não usa este caminho (já sai no webhook da 1ª msg).
 */
export async function sendGoogleConversionForComercialChange({
  clienteId,
  patch,
  lead,
  contact,
  showToast,
  eventName: eventNameArg,
  force = false,
}) {
  if (!clienteId || (!patch && !eventNameArg)) return { sent: false, skipped: true };

  let eventName = eventNameArg || null;
  if (!eventName && patch && 'qualificado' in patch && patch.qualificado === true) {
    eventName = 'QualifiedLead';
  }
  if (!eventName && patch && 'comprou' in patch && patch.comprou === true) {
    eventName = 'Purchase';
  }
  if (!eventName || eventName === 'LeadSubmitted' || eventName === 'Lead') {
    return { sent: false, skipped: true, reason: 'evento_nao_comercial' };
  }

  const tracking = trackingDataFromLeadOrContact(lead, contact);
  const gclid = extractGclid(tracking);
  if (!gclid) {
    return { sent: false, skipped: true, reason: 'sem_gclid' };
  }

  const valor =
    patch?.valor != null
      ? Number(patch.valor)
      : contact?.valor_venda != null
        ? Number(contact.valor_venda)
        : lead?.valor != null
          ? Number(lead.valor)
          : 0;

  try {
    const payload = buildGoogleClickConversionPayload({
      clienteId,
      contactId: contact?.id ?? null,
      leadId: lead?.id ?? null,
      gclid,
      eventName,
      value: valor,
      force,
    });
    const { data, error } = await supabase.functions.invoke('google-ads-api', { body: payload });

    if (error) {
      showToast?.({
        variant: 'destructive',
        title: 'Google: falha ao enviar conversão',
        description: error.message,
      });
      return { sent: false, error: error.message };
    }

    if (data?.skipped && data?.reason === 'not_configured') {
      return { sent: false, skipped: true, reason: 'not_configured' };
    }

    if (data?.pending && !data?.error) {
      if (!data?.idempotent) showToast?.({
        title: 'Google: em processamento',
        description: 'Envio recebido. Confira o resultado em Rastreamento → Eventos → Google.',
      });
      return { sent: false, pending: true, eventName, idempotent: !!data.idempotent };
    }

    if (data?.error && !data?.skipped) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || 'Erro Google Ads';
      showToast?.({
        variant: 'destructive',
        title: 'Google: conversão não enviada',
        description: msg,
      });
      return { sent: false, error: msg, skipped: !!data?.skipped, reason: data?.reason };
    }

    if (data?.success) {
      if (!data?.idempotent) {
        showToast?.({
          title: 'Enviado ao Google Ads',
          description:
            eventName === 'Purchase'
              ? `Compra (${valor > 0 ? `R$ ${valor}` : 'sem valor'}) com gclid.`
              : `${eventName} registrado no Google Ads.`,
        });
      }
      return { sent: true, eventName, idempotent: !!data?.idempotent };
    }

    return { sent: false, skipped: !!data?.skipped, reason: data?.reason };
  } catch (e) {
    showToast?.({
      variant: 'destructive',
      title: 'Google: erro ao enviar',
      description: e?.message || String(e),
    });
    return { sent: false, error: e?.message || String(e) };
  }
}
