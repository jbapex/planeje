import { supabase } from '@/lib/customSupabaseClient';
import { invokeMetaAdsForCliente } from '@/lib/metaCtwaClientToken';

/** Extrai ctwaClid do tracking_data (webhook uazapi / Meta). */
export function extractCtwaClid(trackingData) {
  if (!trackingData || typeof trackingData !== 'object') return null;
  const raw = trackingData.ctwaClid ?? trackingData.ctwa_clid;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

export function trackingDataFromLeadOrContact(lead, contact) {
  const td = contact?.tracking_data ?? lead?.tracking_data;
  if (td && typeof td === 'object') return td;
  return null;
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve o canal WhatsApp (config) para envio Meta: whatsapp_config_id no contato,
 * depois instance_name, peers com mesma instância, depois canal único com conversões.
 */
export async function resolveWhatsappConfigIdForContact(clienteId, contact, { phone } = {}) {
  if (!clienteId) return null;

  if (contact?.whatsapp_config_id) {
    return contact.whatsapp_config_id;
  }

  const instanceName = contact?.instance_name?.trim();
  const { data: configs } = await supabase
    .from('cliente_whatsapp_config')
    .select('id, name, meta_page_id, webhook_secret, meta_conversions_enabled')
    .eq('cliente_id', clienteId);

  if (instanceName) {
    const inst = normKey(instanceName);
    for (const c of configs || []) {
      const n = normKey(c.name);
      if (!n) continue;
      if (n === inst || inst.includes(n) || n.includes(inst)) return c.id;
    }

    const { data: peer } = await supabase
      .from('cliente_whatsapp_contact')
      .select('whatsapp_config_id')
      .eq('cliente_id', clienteId)
      .eq('instance_name', instanceName)
      .not('whatsapp_config_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (peer?.whatsapp_config_id) return peer.whatsapp_config_id;
  }

  const phoneDigits = String(phone || contact?.phone || '').replace(/\D/g, '');
  if (phoneDigits.length >= 10) {
    const { data: byPhone } = await supabase
      .from('cliente_whatsapp_contact')
      .select('whatsapp_config_id')
      .eq('cliente_id', clienteId)
      .eq('phone', phoneDigits)
      .not('whatsapp_config_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (byPhone?.whatsapp_config_id) return byPhone.whatsapp_config_id;
  }

  const enabledList = (configs || []).filter((c) => c.meta_conversions_enabled === true);
  if (enabledList.length === 1) return enabledList[0].id;

  if (enabledList.length > 1) {
    const withWebhook = enabledList.filter((c) => c.webhook_secret);
    if (withWebhook.length === 1) return withWebhook[0].id;
    const withPage = enabledList.filter((c) => c.meta_page_id);
    if (withPage.length === 1) return withPage[0].id;
  }

  return null;
}

/**
 * Envia evento à Meta após marcar qualificado/comprou (config do canal em Canais).
 */
export function unixEventTimeFromIso(iso) {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.floor(ms / 1000);
}

export async function sendMetaConversionForComercialChange({
  clienteId,
  patch,
  lead,
  contact,
  showToast,
  eventName: eventNameArg,
  eventTime: eventTimeArg,
  ctwaClid: ctwaClidArg,
}) {
  if (!clienteId) return { sent: false, skipped: true };

  const patchObj = patch && typeof patch === 'object' ? patch : {};
  let eventName = eventNameArg || null;
  if (!eventName && 'qualificado' in patchObj && patchObj.qualificado === true) eventName = 'QualifiedLead';
  if (!eventName && 'comprou' in patchObj && patchObj.comprou === true) eventName = 'Purchase';
  if (!eventName) return { sent: false, skipped: true };

  const tracking = trackingDataFromLeadOrContact(lead, contact);
  const ctwaClid = String(ctwaClidArg || '').trim() || extractCtwaClid(tracking);
  if (!ctwaClid) {
    return { sent: false, skipped: true, reason: 'sem_ctwa_clid' };
  }
  const businessPhone =
    tracking?.owner_phone != null ? String(tracking.owner_phone).trim() : undefined;

  const whatsappConfigId = await resolveWhatsappConfigIdForContact(clienteId, contact, {
    phone: lead?.whatsapp || contact?.phone,
  });
  if (!whatsappConfigId) {
    showToast?.({
      variant: 'destructive',
      title: 'Meta: canal não identificado',
      description: 'Configure Conversões Meta no canal uazapi em Canais ou aguarde nova mensagem pelo webhook.',
    });
    return { sent: false, skipped: true, reason: 'sem_canal' };
  }

  const valor =
    patchObj.valor != null
      ? Number(patchObj.valor)
      : contact?.valor_venda != null
        ? Number(contact.valor_venda)
        : lead?.valor != null
          ? Number(lead.valor)
          : 0;
  const eventTime =
    Number.isFinite(Number(eventTimeArg)) && Number(eventTimeArg) > 0
      ? Math.floor(Number(eventTimeArg))
      : unixEventTimeFromIso(contact?.first_seen_at || lead?.data_entrada || lead?.created_at);

  try {
    const trackingAdId = String(tracking?.source_id ?? tracking?.ad_id ?? tracking?.sourceID ?? '').replace(/\D/g, '');
    const { data, error } = await invokeMetaAdsForCliente(clienteId, {
      action: 'send-ctwa-conversion',
      whatsappConfigId,
      contactId: contact?.id ?? null,
      leadId: lead?.id ?? null,
      ctwaClid,
      eventName,
      value: eventName === 'Purchase' ? valor : undefined,
      businessPhone: businessPhone || undefined,
      phone: lead?.whatsapp || contact?.phone || undefined,
      adId: trackingAdId || undefined,
      eventTime: eventTime || undefined,
    });

    if (error) {
      showToast?.({
        variant: 'destructive',
        title: 'Meta: falha ao enviar conversão',
        description: error.message,
      });
      return { sent: false, error: error.message };
    }

    if (data?.error) {
      const err = data.error;
      const msg =
        typeof err === 'string'
          ? err
          : [err?.message, err?.hint, err?.subcode != null ? `subcode ${err.subcode}` : null]
              .filter(Boolean)
              .join(' — ') || 'Erro Meta';
      const code = typeof err === 'object' ? err?.code : null;
      const metaDetail =
        data?.meta_response?.error?.error_user_msg ||
        data?.meta_response?.error?.error_subcode;
      const description =
        code === 'CLIENT_META_TOKEN_NOT_CONFIGURED'
          ? 'Configure o token Meta do cliente em Integrações.'
          : metaDetail
            ? `${msg} (${metaDetail})`
            : msg;
      showToast?.({
        variant: 'destructive',
        title: 'Meta: conversão não enviada',
        description,
      });
      return { sent: false, error: msg, skipped: !!data?.skipped, reason: data?.reason };
    }

    if (data?.success) {
      const corrected = data?.waba_auto_corrected ? ' (WABA ajustada automaticamente ao número da loja)' : '';
      showToast?.({
        title: 'Enviado à Meta',
        description:
          eventName === 'Purchase'
            ? `Purchase (${valor > 0 ? `R$ ${valor}` : 'sem valor'}) — canal vinculado ao contato.${corrected}`
            : eventName === 'LeadSubmitted'
              ? `Conversa iniciada registrada na Meta.${corrected}`
              : `${eventName} registrado na Meta.${corrected}`,
      });
      return { sent: true, eventName, eventsReceived: data.events_received };
    }

    if (data?.skipped) {
      const skipText =
        data.reason === 'conversions_disabled'
          ? 'Ligue Conversões Meta no canal WhatsApp em Integrações.'
          : data.reason === 'duplicate_event'
            ? 'Esta conversa já foi enviada à Meta.'
            : data.reason === 'missing_waba_or_dataset'
              ? 'Falta Pixel/Página no destino CAPI deste cliente.'
              : `Não enviado (${data.reason || 'ignorado'}).`;
      showToast?.({
        variant: data.reason === 'duplicate_event' ? 'default' : 'destructive',
        title: data.reason === 'duplicate_event' ? 'Já enviado à Meta' : 'Meta: conversão não enviada',
        description: skipText,
      });
    }

    return { sent: false, skipped: !!data?.skipped, reason: data?.reason };
  } catch (e) {
    showToast?.({
      variant: 'destructive',
      title: 'Meta: erro de rede',
      description: e?.message || String(e),
    });
    return { sent: false, error: e?.message };
  }
}

/** Lista WABAs que o token Meta consegue acessar (Graph API). */
export async function listMetaWhatsappBusinessAccounts(clienteId, businessId) {
  const { data, error } = await invokeMetaAdsForCliente(clienteId, {
    action: 'list-whatsapp-business-accounts',
    businessId: businessId || undefined,
  });
  if (error) return { error: error.message, accounts: [] };
  if (data?.error) {
    return {
      error: data.error?.message || String(data.error),
      hint: data.error?.hint,
      accounts: data.accounts || [],
    };
  }
  return { accounts: data?.accounts || [] };
}

/** Busca ou cria dataset_id a partir do WABA ID. */
export async function fetchMetaDatasetForWaba(clienteId, { wabaId, pageId } = {}) {
  const page = String(pageId || '').trim().replace(/\D/g, '');
  const waba = String(wabaId || '').trim();
  if (!page && !waba) return { error: 'Informe o WABA ID ou o Page ID' };
  const { data, error } = await invokeMetaAdsForCliente(clienteId, {
    action: 'get-waba-dataset',
    ...(page ? { pageId: page } : { wabaId: waba }),
  });
  if (error) return { error: error.message };
  if (data?.error) {
    const msg = data.error?.message || String(data.error);
    const hint = data.error?.hint;
    return { error: hint ? `${msg}\n\n${hint}` : msg };
  }
  return {
    datasetId: data?.dataset_id,
    wabaId: data?.waba_id,
    wabaName: data?.waba_name,
    pageId: data?.page_id,
  };
}
