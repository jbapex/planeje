/** The service credential alone does not authorize a queued destination or message. */
import { crmIaMediaDescriptor } from './crmIaMediaPayload.js';
const notificationFields = new Set(['origem', 'outbox_id', 'claim_token', 'cliente_id', 'whatsapp_config_id', 'contact_id', 'to', 'body']);
const matchesNotification = (target, body, proof) => target?.allowed === true && target.id === body.outbox_id && target.claim_token === body.claim_token
  && target.cliente_id === body.cliente_id && target.whatsapp_config_id === body.whatsapp_config_id && target.contact_id === body.contact_id
  && target.to === body.to && target.body === body.body && proof?.event_id && proof.source_contact_id === body.contact_id && proof.to === body.to
  && JSON.stringify(target.internal_notification) === JSON.stringify(proof) && Object.keys(body).every(key => notificationFields.has(key));

export async function revalidateCrmIaInternalNotification(db, body, proof) {
  try {
    const check = await db.rpc('crm_ia_delivery_recheck', { p_id: body.outbox_id, p_claim_token: body.claim_token });
    return !check.error && Boolean(matchesNotification(check.data, body, proof));
  } catch { return false; }
}
export async function authorizeCrmIaServiceDelivery(db, body) {
  const kind = body.origem === 'crm-ia' ? 'outbox'
    : body.origem === 'atendimento-planejamento' ? 'reminder'
      : body.origem === 'atendimento-ia' && body.followup_conversation_id ? 'followup' : null;
  if (!kind) return { handled: false, allowed: false };
  const deny = { handled: true, allowed: false };
  const id = kind === 'outbox' ? body.outbox_id : kind === 'reminder' ? body.planning_id : body.followup_conversation_id;
  if (!id || !body.claim_token || body.action || body.to_jid || body.text || body.message) return deny;
  try {
    const check = await db.rpc(kind === 'outbox' ? 'crm_ia_delivery_recheck' : 'crm_ia_legacy_delivery_recheck', {
      p_id: id, p_claim_token: body.claim_token, ...(kind !== 'outbox' && { p_kind: kind }),
    });
    const target = check.data;
    const notification = target?.internal_notification;
    if (notification && (kind !== 'outbox' || !matchesNotification(target, body, notification))) return deny;
    if (check.error || target?.allowed !== true || target.cliente_id !== body.cliente_id ||
        target.whatsapp_config_id !== body.whatsapp_config_id || target.to !== body.to || target.body !== body.body ||
        (body.contact_id && target.contact_id !== body.contact_id) ||
        (body.conversation_id && target.conversation_id !== body.conversation_id)) return deny;
    const humanMedia = target.media_descriptor && Object.keys(target.media_descriptor).length ? target.media_descriptor : null;
    const voiceMedia = target.voice_descriptor && Object.keys(target.voice_descriptor).length ? target.voice_descriptor : null;
    if (humanMedia && voiceMedia || voiceMedia && (kind !== 'outbox' || target.voice?.enabled !== true || target.voice_status !== 'ready')) return deny;
    if (target.voice?.enabled === true && !voiceMedia && target.voice_status !== 'text_fallback') return deny;
    const media = humanMedia || voiceMedia;
    if (media) {
      if (kind !== 'outbox' || !body.file) return deny;
      const actual = await crmIaMediaDescriptor(body);
      if (Object.keys(actual).some(key => actual[key] !== media[key])) return deny;
    } else if (body.file || body.media_type || body.caption) return deny;
    const actor = kind === 'followup' ? { data: { allowed: true, human: false } }
      : await db.rpc('crm_ia_delivery_actor_check', { p_id: id, p_kind: kind });
    if (actor.error || actor.data?.allowed !== true || (humanMedia && actor.data.human !== true) || (voiceMedia && actor.data.human !== false)
      || (notification && (actor.data.human !== false || media || target.voice?.enabled === true))) return deny;
    const started = await db.rpc('crm_ia_delivery_start', { p_kind: kind, p_id: id, p_claim_token: body.claim_token });
    if (started.error || started.data !== true) return deny;
    if (notification && !await revalidateCrmIaInternalNotification(db, body, notification)) return deny;
    return { handled: true, allowed: true, actorId: actor.data.actor_id, human: actor.data.human === true, media,
      ...(notification && { internalNotification: notification }),
      ...(kind === 'outbox' && target.notification_event && { notificationEvent: target.notification_event }) };
  } catch {
    return deny;
  }
}
