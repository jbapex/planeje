import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { EXECUTOR_CRM_DELIVERY_CATALOG, prepareExecutorCrmDelivery, readExecutorCrmDelivery } from '../../supabase/functions/_shared/atlasExecutorCrmDelivery.js';
import { ids } from './crm-delivery-fixture.mjs';

const context = { client_id: ids.client, contact_id: ids.contact, channel_id: ids.channel, can_send: true, blocked: false,
  recipient: { name: 'Contato fictício', phone: '551199999999', jid: '551199999999@s.whatsapp.net' }, channel: { name: 'Canal fictício' }, conversation: { ia_pausada: false },
  snapshot: { contact_id: ids.contact, channel_id: ids.channel, source_jid: '551199999999@s.whatsapp.net', contact_updated_at: '2026-11-12T01:00:00Z', channel_version: 'a'.repeat(32), conversation: { updated_at: '2026-11-12T01:00:00Z' } } };
function fixture() {
  const calls = []; let available = true; let fresh = true; let busyPatch = {}; let racePatch = {}; let calendarPatch = {}; let lastBusy;
  const db = createClient('https://fixture.invalid', 'fixture-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer fixture-session' }, fetch: async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url); assert.equal(url.origin, 'https://fixture.invalid');
    const headers = new Headers(init.headers); assert.equal(headers.get('authorization'), 'Bearer fixture-session');
    const body = JSON.parse(init.body); calls.push({ path: url.pathname, body });
    if (!available) return new Response(JSON.stringify({ message: 'secret-token-do-not-echo', code: '42501' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    const data = url.pathname.endsWith('/atlas_executor_crm_delivery_context') ? context : url.pathname.endsWith('/crm_ia_workspace') ? { rows: [{ start_at: '2026-12-03T12:00:00Z', end_at: '2026-12-03T12:30:00Z' }], total: 1 }
      : url.pathname.endsWith('/crm_ia_calendar_workspace') ? { ...lastBusy,...racePatch }
      : body.action === 'calendars' ? { rows: [{ id: body.pageToken ? 'native-calendar-2' : 'native-calendar', name: 'Agenda fictícia' }], next_page_token: body.pageToken ? null : 'next-page', revision: ids.channel, ...calendarPatch }
        : body.action === 'status' ? { connected: false, status: 'disconnected' } : (lastBusy = { required: true, fresh, busy: [], since: body.since, until: body.until,checked_at:'2026-11-12T00:00:00Z',connection_revision:ids.channel,...busyPatch });
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } } });
  return { db, calls, deny: () => { available = false; }, stale: () => { fresh = false; }, busy: patch => { busyPatch = patch; }, race: patch => { racePatch = patch; }, calendar: patch => { calendarPatch = patch; } };
}
test('catalog exposes only named message and calendar operations', () => {
  assert.deepEqual(EXECUTOR_CRM_DELIVERY_CATALOG.filter(item => item.mode === 'write').map(item => item.name), ['send_message']);
  for (const view of ['send_context', 'slots', 'calendar_status', 'calendars', 'calendar_busy', 'message_queue']) assert.ok(EXECUTOR_CRM_DELIVERY_CATALOG.some(item => item.mode === 'read' && item.name === view));
});
test('prepare reads current authorized target without enqueueing and freezes the reviewed text and version', async () => {
  const f = fixture();
  const proposal = await prepareExecutorCrmDelivery(f.db, { clientId: ids.client, action: 'send_message', input: { contact_id: ids.contact, channel_id: ids.channel, body: '  Mensagem fictícia.  ' } });
  assert.deepEqual(f.calls, [{ path: '/rest/v1/rpc/atlas_executor_crm_delivery_context', body: { p_client: ids.client, p_contact: ids.contact, p_channel: ids.channel } }]);
  assert.equal(proposal.action, 'send_message'); assert.equal(proposal.payload.body, 'Mensagem fictícia.'); assert.deepEqual(proposal.payload.expected, context.snapshot);
  assert.ok(JSON.stringify(proposal.preview).includes('551199999999')); assert.ok(JSON.stringify(proposal.preview).includes('IA pausada'));
  assert.equal(proposal.effect.external, true); assert.equal(proposal.effect.enables_autonomy, false);
  for (const input of [{ ...proposal.payload, owner_id: ids.admin }, { contact_id: ids.contact, channel_id: ids.channel, body: 'x', rpc: 'schedule_message' }, { contact_id: ids.contact, channel_id: ids.channel, body: 'x'.repeat(4001) }]) {
    await assert.rejects(prepareExecutorCrmDelivery(f.db, { clientId: ids.client, action: 'send_message', input }));
  }
  assert.equal(f.calls.length, 1);
});
test('slots refresh native busy context before RPC and never offer slots after a stale external calendar', async () => {
  const f = fixture(); const input = { owner_id: ids.admin, date: '2026-12-03', lead_id: ids.contact, appointment_id: ids.channel };
  const result = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'slots', input });
  assert.equal(result.available, true);
  assert.deepEqual(f.calls[0], { path: '/functions/v1/crm-ia-calendar', body: { action: 'busy', client_id: ids.client, owner_id: ids.admin, since: '2026-12-02T00:00:00.000Z', until: '2026-12-05T00:00:00.000Z', lead_id: ids.contact, appointment_id: ids.channel } });
  assert.deepEqual(f.calls[1], { path: '/rest/v1/rpc/crm_ia_workspace', body: { p_action: 'slots', p_client_id: ids.client, p_payload: input } });
  f.calls.length = 0; f.stale();
  assert.equal((await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'slots', input })).available, false); assert.equal(f.calls.length, 1);
  await assert.rejects(readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'slots', input: { ...input, date: '2026-02-30' } }));
});
test('calendar reads keep native OAuth ownership, pagination and explicit unavailability', async () => {
  const f = fixture();
  const result = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendars', input: {} });
  assert.equal(result.available, true); assert.equal(result.coverage.complete, false); assert.equal(result.data.next_page_token, 'next-page');
  await assert.rejects(readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendar_status', input: { owner_id: ids.staff } }));
  f.deny(); const denied = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'send_context', input: { contact_id: ids.contact, channel_id: ids.channel } });
  assert.equal(denied.available, false); assert.ok(!JSON.stringify(denied).includes('secret-token'));
});
test('direct busy reads never report stale occupation as complete availability', async () => {
  const f = fixture(); f.stale();
  const result = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendar_busy', input: { owner_id: ids.admin, since: '2026-12-02T00:00:00Z', until: '2026-12-05T00:00:00Z' } });
  assert.equal(result.available, false);
});
test('busy coverage and identities must cover the requested window, including slots cache races', async () => {
  const input = { owner_id:ids.admin,since:'2026-12-02T00:00:00Z',until:'2026-12-05T00:00:00Z',appointment_id:ids.channel };
  for (const patch of [{ since:'2027-01-01T00:00:00Z',until:'2027-01-05T00:00:00Z' },{ since:null },{ until:'2026-12-04T00:00:00Z' },{ owner_id:ids.staff },{ appointment_id:ids.contact }]) {
    const f = fixture();f.busy(patch);
    assert.equal((await readExecutorCrmDelivery(f.db,{ clientId:ids.client,view:'calendar_busy',input })).available,false,JSON.stringify(patch));
  }
  const raced = fixture();raced.race({ since:'2027-01-01T00:00:00Z',until:'2027-01-05T00:00:00Z',checked_at:'2026-11-12T00:00:01Z' });
  assert.equal((await readExecutorCrmDelivery(raced.db,{ clientId:ids.client,view:'slots',input:{ owner_id:ids.admin,date:'2026-12-03' } })).available,false);
});


test('calendars follows its typed cursor with the same caller/client and keeps credential redaction', async () => {
  const f = fixture(); f.calendar({ access_token: 'synthetic-calendar-secret', rows: [{ id: 'native-calendar', name: 'Agenda', metadata: { page_access_token: 'synthetic-page-secret', apiKey: 'synthetic-key-secret', next_page_token: 'synthetic-nested-secret' } }] });
  const first = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendars' });
  assert.equal(first.data.next_page_token, 'next-page'); assert.equal(first.coverage.next_page_token, 'next-page'); assert.equal(first.coverage.complete, false);
  assert.doesNotMatch(JSON.stringify(first), /synthetic-(?:calendar|page|key|nested)-secret/);
  f.calendar({});
  const second = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendars', input: { pageToken: first.data.next_page_token } });
  assert.equal(second.available, true); assert.equal(second.data.rows[0].id, 'native-calendar-2'); assert.equal(second.data.next_page_token, null); assert.equal(second.coverage.complete, true);
  assert.deepEqual(f.calls.map(call => call.body), [{ action: 'calendars', client_id: ids.client }, { action: 'calendars', client_id: ids.client, pageToken: 'next-page' }]);
  for (const input of [{ pageToken: '' }, { pageToken: 'x'.repeat(2049) }, { pageToken: 'Bearer synthetic' }, { pageToken: 'a\nb' }, { pageToken: {} }, { page_token: 'x' }, { pageToken: 'next-page', client_id: ids.other }, { pageToken: 'next-page', owner_id: ids.staff }]) await assert.rejects(readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendars', input }));
  assert.equal(f.calls.length, 2);
  await assert.rejects(readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'message_queue', input: { pageToken: 'next-page' } }));
});

test('calendar cursor response is bounded and cannot claim another client scope', async () => {
  for (const patch of [{ next_page_token: 'x'.repeat(2049) }, { next_page_token: 'Bearer synthetic' }, { next_page_token: {} }, { client_id: ids.other }, { cliente_id: ids.other }]) {
    const f = fixture(); f.calendar(patch); const result = await readExecutorCrmDelivery(f.db, { clientId: ids.client, view: 'calendars' }); assert.equal(result.available, false, JSON.stringify(patch)); assert.doesNotMatch(JSON.stringify(result), /Bearer synthetic/);
  }
});
