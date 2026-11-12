import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { maybeSendGoogleLeadSubmitted } from '../_shared/googleAdsClickConversion.ts';

function normalizeTriggerText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function collectLabelNames(value: unknown, into: string[]) {
  if (value == null) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const name = String(value).trim();
    if (name) into.push(name);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLabelNames(item, into));
    return;
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    collectLabelNames(rec.name ?? rec.title ?? rec.label ?? rec.tag ?? rec.value, into);
  }
}

export function extractChatLabelsFromPayload(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  chat?: Record<string, unknown>,
): string[] {
  const names: string[] = [];
  for (const source of [chat, payload, body]) {
    if (!source || typeof source !== 'object') continue;
    const rec = source as Record<string, unknown>;
    collectLabelNames(rec.labels ?? rec.Labels ?? rec.tags ?? rec.Tags ?? rec.wa_labels ?? rec.chatLabels, names);
  }
  return [...new Set(names)];
}

function matchRule(
  rule: { trigger_type: string; trigger_value: string; match_mode?: string; active?: boolean },
  { etiquetas = [], messageText = '' }: { etiquetas?: string[]; messageText?: string },
): boolean {
  if (rule.active === false) return false;
  const expected = normalizeTriggerText(rule.trigger_value);
  if (!expected) return false;
  const mode = rule.match_mode === 'exact' ? 'exact' : 'contains';
  if (rule.trigger_type === 'etiqueta') {
    return etiquetas
      .map(normalizeTriggerText)
      .filter(Boolean)
      .some((tag) => (mode === 'exact' ? tag === expected : tag.includes(expected)));
  }
  if (rule.trigger_type === 'mensagem') {
    const text = normalizeTriggerText(messageText);
    if (!text) return false;
    return mode === 'exact' ? text === expected : text.includes(expected);
  }
  return false;
}

const ANALYSIS_LABEL_KEYS = new Set(['nao responde', 'desqualificado']);

function isAnalysisLabelName(value: unknown): boolean {
  return ANALYSIS_LABEL_KEYS.has(normalizeTriggerText(value).replace(/\s+/g, ' '));
}

function ctwaFromTracking(tracking: Record<string, unknown> | null | undefined): string {
  if (!tracking) return '';
  const raw = tracking.ctwaClid ?? tracking.ctwa_clid;
  return raw == null ? '' : String(raw).trim();
}

async function persistWaLabels(
  supabase: SupabaseClient,
  clienteId: string,
  contactId: string,
  tracking: Record<string, unknown>,
  nextLabels: string[],
) {
  if (!nextLabels.length) return;
  const { data: latest } = await supabase
    .from('cliente_whatsapp_contact')
    .select('tracking_data')
    .eq('id', contactId)
    .maybeSingle();
  const current =
    latest?.tracking_data && typeof latest.tracking_data === 'object'
      ? (latest.tracking_data as Record<string, unknown>)
      : tracking;
  await supabase
    .from('cliente_whatsapp_contact')
    .update({
      tracking_data: { ...current, wa_labels: nextLabels },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('cliente_id', clienteId);
}

/**
 * Dispara CAPI no ciclo TRACK: auto_lead (LeadSubmitted) → etiqueta nova → frase.
 * Só lead pago (ctwaClid), sem grupo. fromMe não cria conversa iniciada.
 */
export async function applyRastreamentoConversionFromWebhook(opts: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  clienteId: string;
  contactJid: string;
  whatsappConfigId?: string | null;
  phone?: string | null;
  messageText?: string;
  labels?: string[];
  tracking?: Record<string, unknown> | null;
  fromMe?: boolean;
  isGroup?: boolean;
}): Promise<void> {
  if (opts.isGroup) return;
  const { supabase, supabaseUrl, serviceKey, clienteId, contactJid } = opts;
  if (!contactJid) return;

  const { data: rulesData, error } = await supabase
    .from('rastreamento_conversion_rules')
    .select('id, trigger_type, trigger_value, match_mode, event_name, active')
    .eq('cliente_id', clienteId)
    .eq('active', true);
  if (error) return;
  const rules = rulesData || [];

  const { data: contact } = await supabase
    .from('cliente_whatsapp_contact')
    .select('id, phone, tracking_data, whatsapp_config_id')
    .eq('cliente_id', clienteId)
    .eq('from_jid', contactJid)
    .maybeSingle();
  if (!contact?.id) return;

  const tracking = {
    ...((contact.tracking_data && typeof contact.tracking_data === 'object'
      ? contact.tracking_data
      : {}) as Record<string, unknown>),
    ...(opts.tracking || {}),
  };
  const ctwaClid = ctwaFromTracking(tracking);

  const previousLabels = Array.isArray(tracking.wa_labels)
    ? (tracking.wa_labels as unknown[]).map((item) => String(item))
    : [];
  const nextLabels = opts.labels?.length ? opts.labels : previousLabels;
  const prevSet = new Set(previousLabels.map(normalizeTriggerText).filter(Boolean));
  const added = nextLabels.filter((tag) => {
    const key = normalizeTriggerText(tag);
    return key && !prevSet.has(key) && !isAnalysisLabelName(tag);
  });

  const persistOnly = async () => {
    await persistWaLabels(supabase, clienteId, contact.id, tracking, opts.labels?.length ? nextLabels : []);
  };

  // Google Ads: 1ª mensagem com gclid (independente de CTWA / Meta).
  await maybeSendGoogleLeadSubmitted({
    supabase,
    supabaseUrl,
    serviceKey,
    clienteId,
    contactId: contact.id,
    tracking,
    fromMe: opts.fromMe,
  });

  if (!ctwaClid) {
    await persistOnly();
    return;
  }

  let autoLeadAlreadySent = false;
  if (!opts.fromMe) {
    const { data: autoSent } = await supabase
      .from('meta_conversion_event_log')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('ctwa_clid', ctwaClid)
      .in('event_name', ['LeadSubmitted', 'Lead'])
      .eq('success', true)
      .limit(1);
    autoLeadAlreadySent = Boolean(autoSent?.length);
  }

  const matched: { id: string; event_name: string }[] = [];
  if (!opts.fromMe && !autoLeadAlreadySent) {
    matched.push({ id: 'auto_lead', event_name: 'LeadSubmitted' });
  }
  for (const rule of rules) {
    if (added.length && matchRule(rule, { etiquetas: added })) {
      matched.push({ id: String(rule.id), event_name: rule.event_name });
    } else if (matchRule(rule, { messageText: opts.messageText || '' })) {
      matched.push({ id: String(rule.id), event_name: rule.event_name });
    }
  }
  const unique = [...new Map(matched.map((item) => [item.event_name, item])).values()];
  if (!unique.length) {
    await persistOnly();
    return;
  }

  const eventsUrl = `${supabaseUrl}/functions/v1/meta-ads-api`;
  for (const rule of unique) {
    try {
      const res = await fetch(eventsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: 'send-ctwa-conversion',
          clienteId,
          contactId: contact.id,
          whatsappConfigId: opts.whatsappConfigId || contact.whatsapp_config_id || undefined,
          ctwaClid,
          eventName: rule.event_name,
          phone: opts.phone || contact.phone || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      console.log(
        '[uazapi-inbox-webhook] conversion_rule',
        rule.event_name,
        res.status,
        body?.success ? 'ok' : body?.reason || body?.error || 'sent',
      );
    } catch (err) {
      console.error('[uazapi-inbox-webhook] conversion_rule failed', (err as Error)?.message);
    }
  }

  await persistOnly();
}
