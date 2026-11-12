import assert from 'node:assert/strict';
import test from 'node:test';

const runtime = await import('../../supabase/functions/_shared/crmIaDelivery.js').catch(() => null);
test('delivery runtime is available', () => assert.ok(runtime, 'queue dispatcher is missing'));

const now = '2026-11-11T12:00:00.000Z';
const message = { id: 'message', cliente_id: 'client', whatsapp_config_id: 'channel', contact_id: 'contact', to: '5511999999999@s.whatsapp.net', body: 'Mensagem sintética', scheduled_at: now, status: 'pending' };

function database(rows = [{ ...message }], { recheck, finishError = false } = {}) {
  let sequence = 0;
  return { rows, async rpc(name, args) {
    if (name === 'crm_ia_delivery_claim') {
      const due = rows.filter(row => row.status === 'pending' && (!args.p_ids || args.p_ids.includes(row.id)) && row.scheduled_at <= args.p_now);
      for (const row of due) Object.assign(row, { status: 'sending', claim_token: `claim-${++sequence}` });
      return { data: structuredClone(due), error: null };
    }
    const row = rows.find(item => item.id === args.p_id && item.claim_token === args.p_claim_token);
    if (name === 'crm_ia_delivery_recheck') {
      if (recheck) await recheck(row);
      return { data: row?.status === 'sending' ? { ...row, allowed: true } : { allowed: false, reason: 'source_changed' }, error: null };
    }
    assert.equal(name, 'crm_ia_delivery_finish');
    if (finishError) return { data: null, error: { code: 'fixture_failure' } };
    if (row?.status === 'sending') Object.assign(row, { status: args.p_status, provider_message_id: args.p_message_id, error_code: args.p_error_code });
    return { data: row?.status === args.p_status, error: null };
  } };
}

if (runtime) {
  test('concurrent ticks send a request only once and preserve its exact channel', async () => {
    const db = database(), payloads = [];
    const send = async payload => { payloads.push(payload); await Promise.resolve(); return { ok: true, messageId: 'receipt' }; };
    await Promise.all([runtime.dispatchCrmIaQueue({ db, send, now }), runtime.dispatchCrmIaQueue({ db, send, now })]);
    assert.equal(payloads.length, 1);
    assert.deepEqual(payloads[0], { origem: 'crm-ia', outbox_id: 'message', claim_token: 'claim-1', cliente_id: 'client', whatsapp_config_id: 'channel', contact_id: 'contact', to: '5511999999999@s.whatsapp.net', body: 'Mensagem sintética' });
    assert.equal(db.rows[0].status, 'sent');
    assert.equal(db.rows[0].provider_message_id, 'receipt');
  });

  test('a pause or cancellation after claim prevents transport', async () => {
    const db = database(undefined, { recheck: row => { row.status = 'cancelled'; } });
    let sent = 0;
    await runtime.dispatchCrmIaQueue({ db, send: async () => { sent++; return { ok: true }; }, now });
    assert.equal(sent, 0);
    assert.equal(db.rows[0].status, 'cancelled');
  });

  test('timeout after transport is uncertain and a later tick does not retry', async () => {
    const db = database(); let sent = 0;
    const send = async () => { sent++; throw new Error('body and provider response must not escape'); };
    const result = await runtime.dispatchCrmIaQueue({ db, send, now });
    await runtime.dispatchCrmIaQueue({ db, send, now });
    assert.equal(sent, 1);
    assert.equal(db.rows[0].status, 'uncertain');
    assert.ok(!JSON.stringify(result).includes('provider response'));
  });

  test('only definitive rejection is failed; an explicit success can lack a provider id', async () => {
    for (const [receipt, status] of [[{ ok: false, definitive: true }, 'failed'], [{ ok: false }, 'uncertain'], [{}, 'uncertain'], [{ ok: true }, 'sent']]) {
      const db = database();
      await runtime.dispatchCrmIaQueue({ db, send: async () => receipt, now });
      assert.equal(db.rows[0].status, status);
    }
  });

  test('ids and due date bound immediate dispatch; an unpersisted receipt never reopens a claim', async () => {
    const db = database([{ ...message }, { ...message, id: 'other' }, { ...message, id: 'future', scheduled_at: '2026-11-12T12:00:00.000Z' }], { finishError: true });
    let sent = 0;
    const result = await runtime.dispatchCrmIaQueue({ db, send: async () => { sent++; return { ok: true }; }, now, ids: ['message', 'future'] });
    assert.equal(sent, 1);
    assert.equal(db.rows[0].status, 'sending');
    assert.equal(db.rows[1].status, 'pending');
    assert.equal(db.rows[2].status, 'pending');
    assert.equal(result.results[0].status, 'uncertain');
  });
}
