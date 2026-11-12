/** Ficha TRACK do lead: atribuição, criativo e jornada. Sem copiar o núcleo PalmUP. */

import {
  campaignContextFromTracking,
  capiDeliveryLabel,
  capiDeliveryState,
  capiEventLabel,
  displayEventosPhone,
  formatEventosWhen,
} from './rastreamentoEventosMeta.js';
import { preferredThumbnailUrl } from './adThumbnail.js';
import { hasCtwaTrackingSignal, isCtwaStyleTracking, originLabel, siteOriginLabel, recordedOriginSource } from './rastreamentoTrackableLink.js';

function extractCtwaClid(trackingData) {
  if (!trackingData || typeof trackingData !== 'object') return '';
  const raw = trackingData.ctwaClid ?? trackingData.ctwa_clid;
  return raw == null ? '' : String(raw).trim();
}

function trackingOf(contact, lead) {
  const td = contact?.tracking_data || lead?.tracking_data;
  return td && typeof td === 'object' ? td : {};
}

export function leadUtmAttribution(contact, lead) {
  const contactTracking = contact?.tracking_data || {};
  const leadTracking = lead?.tracking_data || {};
  const scalar = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((key) => ({
    key, value: [contact?.[key], contactTracking[key], lead?.[key], leadTracking[key]].map(scalar).find(Boolean) || '',
  }));
  const method = contactTracking.planeje_link_match_method || leadTracking.planeje_link_match_method;
  return { fields, hasValues: fields.some((field) => field.value), method,
    note: method === 'initial_message'
      ? 'Identificadas pela mensagem do link. UTMs da configuração do link; clique individual não identificado.'
      : '' };
}

export function ctwaClidFromLeadSources(contact, lead, event) {
  const fromTracking = extractCtwaClid(trackingOf(contact, lead));
  if (fromTracking) return fromTracking;
  const fromEvent = String(event?.ctwa_clid || '').trim();
  return fromEvent || '';
}

/** Envio manual de conversa iniciada: precisa de CTWA e ainda não ter sucesso. */
export function leadSubmittedSendState({ contact = null, lead = null, event = null, events = [] } = {}) {
  const clid = ctwaClidFromLeadSources(contact, lead, event);
  const rows = Array.isArray(events) ? events : [];
  const submitted = rows.filter((row) => row?.event_name === 'LeadSubmitted');
  const hasSuccess = submitted.some((row) => row?.success);
  const hasFailed = submitted.some((row) => !row?.success);
  return {
    hasClid: Boolean(clid),
    hasSuccess,
    hasFailed,
    canSend: Boolean(clid) && !hasSuccess,
    label: hasSuccess
      ? 'Conversa já enviada à Meta'
      : hasFailed
        ? 'Reenviar conversa iniciada'
        : 'Enviar conversa iniciada',
  };
}

export function clickIdFromTracking(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  const gclid = td.gclid != null ? String(td.gclid).trim() : '';
  if (gclid) return gclid;
  const fbclid = td.fbclid != null ? String(td.fbclid).trim() : '';
  return fbclid || '';
}

export function adIdFromTracking(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  const raw = td.source_id ?? td.ad_id ?? td.sourceID ?? td.meta_ad_details?.ad?.id ?? '';
  return String(raw || '').replace(/\D/g, '');
}

export function shortenCtwaClid(value) {
  const text = String(value || '').trim();
  if (!text || text === 'Não resolvido') return text || '—';
  if (text.length <= 28) return text;
  return `${text.slice(0, 12)}…${text.slice(-8)}`;
}

export function leadPhotoUrl(contact, lead, extras = []) {
  const candidates = [
    contact?.profile_pic_url,
    lead?.profile_pic_url,
    ...(extras || []),
  ];
  return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

export function nameLooksLikePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && !/[a-z]/i.test(raw);
}

export const FICHA_JOURNEY_STEPS = [
  { eventName: 'LeadSubmitted', shortLabel: 'Iniciada' },
  { eventName: 'Lead', shortLabel: 'Lead' },
  { eventName: 'QualifiedLead', shortLabel: 'Qualificado' },
  { eventName: 'InitiateCheckout', shortLabel: 'Checkout' },
  { eventName: 'Purchase', shortLabel: 'Compra' },
];

function latestJourneyItem(items) {
  if (!items.length) return null;
  const sent = items.filter((item) => item.success);
  return (sent.length ? sent : items)[(sent.length ? sent : items).length - 1];
}

export function buildLeadJourneyTrack(eventRows) {
  const log = buildLeadJourney(eventRows);
  const known = new Set(FICHA_JOURNEY_STEPS.map((step) => step.eventName));
  const steps = FICHA_JOURNEY_STEPS.map((step) => {
    const matches = log.filter((item) => item.eventName === step.eventName);
    const item = latestJourneyItem(matches);
    return {
      ...step,
      reached: Boolean(item),
      deliveryState: item?.deliveryState || '',
      item,
    };
  });
  return {
    steps,
    extras: log.filter((item) => !known.has(item.eventName)),
    log,
  };
}

export function creativeFromTracking(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  const thumbnail = preferredThumbnailUrl(td);
  const sourceUrl = td.sourceURL || td.source_url || td.meta_ad_details?.ad?.preview_shareable_link || '';
  return {
    thumbnailUrl: String(thumbnail || '').trim() || null,
    sourceUrl: String(sourceUrl || '').trim() || null,
    adId: adIdFromTracking(td) || null,
  };
}

export function buildLeadJourney(eventRows) {
  return [...(eventRows || [])]
    .sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')))
    .map((row) => {
      const delivery = capiDeliveryState(row);
      return {
        id: row.id || `${row.event_name}-${row.created_at}`,
        eventName: row.event_name,
        label: capiEventLabel(row.event_name),
        at: formatEventosWhen(row.created_at),
        success: Boolean(row.success),
        deliveryState: delivery,
        statusLabel: capiDeliveryLabel(delivery),
        errorMessage: row.success ? '' : String(row.error_message || '').trim(),
      };
    });
}

export function resolveLeadFichaOrigin(contact, lead, tracking, ctwaClid) {
  const originSource = recordedOriginSource(contact) || recordedOriginSource(lead, true)
    || recordedOriginSource({ tracking_data: tracking });
  const fromPlanejeLink = Boolean(tracking?.planeje_match_code || tracking?.planeje_link_id);
  const isCtwa = Boolean(ctwaClid) || isCtwaStyleTracking(tracking);
  if (originSource === 'google_ads') return { label: 'Google Ads', kind: 'google', showCapi: false, showCreative: false };
  if (originSource === 'site') return {
    label: siteOriginLabel(contact?.utm_source, contact?.tracking_data?.utm_source, lead?.utm_source, lead?.tracking_data?.utm_source, tracking?.utm_source),
    kind: 'site', showCapi: false, showCreative: false,
  };
  if (originSource === 'meta_ads' || isCtwa || (tracking?.fbclid && !fromPlanejeLink && hasCtwaTrackingSignal(tracking))) {
    return {
      label: originLabel('meta_ads', { ctwa: isCtwa }),
      kind: 'meta',
      showCapi: isCtwa,
      showCreative: isCtwa,
    };
  }
  if (tracking?.gclid || originSource === 'google_ads') {
    return { label: 'Google Ads', kind: 'google', showCapi: false, showCreative: false };
  }
  if (tracking?.fbclid || (originSource === 'meta_ads' && fromPlanejeLink)) {
    return { label: 'Meta Ads', kind: 'meta', showCapi: false, showCreative: false };
  }
  return { label: 'Não rastreada', kind: 'off', showCapi: false, showCreative: false };
}

export function buildLeadFicha({ contact = null, lead = null, events = [], event = null } = {}) {
  const tracking = trackingOf(contact, lead);
  const adDetails = tracking.meta_ad_details || {};
  const scalar = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  // UTMs não são nomes oficiais de campanha, conjunto ou anúncio da Meta.
  const campaign = campaignContextFromTracking({
    utm_campaign: null, utm_medium: null, utm_content: null,
    tracking_data: { ...tracking, utm_campaign: null, utm_medium: null, utm_content: null },
  });
  const creative = creativeFromTracking(tracking);
  const rawName =
    String(
      (contact?.mini_crm?.contato_nome && String(contact.mini_crm.contato_nome).trim()) ||
      (tracking.lead_name && String(tracking.lead_name).trim()) ||
        contact?.sender_name ||
        lead?.nome ||
        ''
    ).trim();
  const phoneRaw = String(lead?.whatsapp || contact?.phone || '').trim();
  const phone = phoneRaw ? displayEventosPhone(phoneRaw) : '';
  const name = nameLooksLikePhone(rawName)
    ? displayEventosPhone(rawName)
    : rawName || 'Lead não vinculado';
  const ctwaClid = ctwaClidFromLeadSources(contact, lead, event);
  const clickId = clickIdFromTracking(tracking) || ctwaClid || '';
  const originMeta = resolveLeadFichaOrigin(contact, lead, tracking, ctwaClid);

  return {
    name,
    phone,
    photoUrl: leadPhotoUrl(contact, lead),
    origin: originMeta.label,
    originKind: originMeta.kind,
    showCapiJourney: originMeta.showCapi,
    showCreative: originMeta.showCreative,
    showCampaignContext: originMeta.showCreative || [campaign.campaignName, campaign.adSetName, campaign.adName]
      .some((value) => !['Campanha não resolvida', 'Conjunto não resolvido', 'Anúncio não resolvido'].includes(value)),
    firstSeenAt: formatEventosWhen(contact?.first_seen_at || lead?.data_entrada || lead?.created_at),
    attribution: {
      accountName: scalar(adDetails.accountName),
      accountId: scalar(adDetails.ad?.account_id || adDetails.ad?.campaign?.account_id),
      campaignName: campaign.campaignName,
      adSetName: campaign.adSetName,
      adName: campaign.adName,
      ctwaClid: ctwaClid || 'Não resolvido',
      clickId: clickId || 'Não resolvido',
      adId: creative.adId || 'Não resolvido',
    },
    utm: leadUtmAttribution(contact, lead),
    creative: {
      ...creative,
      title: campaign.adName,
    },
    journey: originMeta.showCapi ? buildLeadJourney(events) : [],
    track: originMeta.showCapi ? buildLeadJourneyTrack(events) : buildLeadJourneyTrack([]),
    leadSubmitted: leadSubmittedSendState({ contact, lead, event, events }),
  };
}

export async function fetchLeadFichaEvents(client, { clienteId, contactId, ctwaClid, leadId }) {
  if (!clienteId) return { rows: [], error: null };
  let query = client
    .from('meta_conversion_event_log')
    .select('id, event_name, success, error_message, created_at, ctwa_clid, contact_id')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (contactId) query = query.eq('contact_id', contactId);
  else if (ctwaClid) query = query.eq('ctwa_clid', ctwaClid);
  else if (leadId) query = query.eq('lead_id', leadId);
  else return { rows: [], error: null };
  const { data, error } = await query;
  return { rows: data || [], error: error?.message || null };
}
