import { normalizeCsGroupId } from '../../../src/lib/csIaGroupInventory.js';

const departureWindow = 7 * 24 * 60 * 60 * 1000;
const instant = /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/;
const participant = /^\d+(?::\d+)?@(?:s\.whatsapp\.net|lid|c\.us)$/;

export function parseUazapiGroupDeparture(body, now = Date.now()) {
  if (body?.EventType !== 'groups' || body.type !== 'Group') return null;
  const { JID, Timestamp, Leave } = body.event ?? {};
  if (!Array.isArray(Leave) || !Leave.some(value => typeof value === 'string' && participant.test(value))) return null;
  const jid = normalizeCsGroupId(JID ?? body.chatid);
  if (!jid || (body.chatid != null && normalizeCsGroupId(body.chatid) !== jid)) return null;
  if (typeof Timestamp !== 'string' || !instant.test(Timestamp)) return null;
  const timestamp = Date.parse(Timestamp);
  if (!Number.isFinite(timestamp) || timestamp > now || timestamp < now - departureWindow) return null;
  const day = Date.parse(`${Timestamp.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== Timestamp.slice(0, 10)) return null;
  return { jid, at: new Date(timestamp).toISOString() };
}

export async function handleUazapiGroupEvent(db, { clientId, channelId, secret }, body, now = Date.now()) {
  const event = parseUazapiGroupDeparture(body, now);
  if (!event) return 200;
  if (typeof body.token !== 'string' || !body.token) return 401;
  const { data: channel, error } = await db.from('cliente_whatsapp_config').select('token,updated_at')
    .eq('id', channelId).eq('cliente_id', clientId).eq('webhook_secret', secret)
    .eq('provider', 'uazapi').is('archived_at', null).maybeSingle();
  if (error) return 500;
  if (!channel?.updated_at || channel.token?.trim() !== body.token) return 401;
  const saved = await db.rpc('cs_ia_capture_group_departure', {
    p_wa_client_id: clientId, p_channel_id: channelId, p_channel_revision: channel.updated_at,
    p_group_jid: event.jid, p_departed_at: event.at,
  });
  return saved.error ? 500 : 200;
}
