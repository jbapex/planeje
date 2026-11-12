/** Helpers puros de payload Google Ads (sem Supabase). */

export function extractGclid(trackingData) {
  if (!trackingData || typeof trackingData !== 'object') return null;
  const raw = trackingData.gclid ?? trackingData.gClid ?? trackingData.GCLID;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

export function buildGoogleClickConversionPayload({
  clienteId,
  contactId,
  leadId,
  gclid,
  eventName,
  value,
  conversionAction,
  customerId,
  force,
}) {
  const payload = {
    action: 'upload-click-conversion',
    clienteId,
    contactId: contactId || undefined,
    leadId: leadId || undefined,
    gclid,
    eventName,
  };
  if (conversionAction) payload.conversionAction = conversionAction;
  if (customerId) payload.customerId = customerId;
  if (eventName === 'Purchase' && value != null && Number(value) > 0) {
    payload.value = Number(value);
    payload.currencyCode = 'BRL';
  }
  if (force) payload.force = true;
  return payload;
}

export function shouldSkipGoogleComercialWithoutMapping(eventName, account) {
  if (!account?.conversions_enabled) return true;
  if (eventName === 'QualifiedLead' && !account.conv_action_qualified) return true;
  if (eventName === 'Purchase' && !account.conv_action_purchase) return true;
  if ((eventName === 'LeadSubmitted' || eventName === 'Lead') && !account.conv_action_lead) {
    return true;
  }
  return false;
}
