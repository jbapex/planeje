import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { deliveryDatabase, id, ids, json, literal } from './crm-delivery-fixture.mjs';
import { prepareExecutorCrmDelivery, readExecutorCrmDelivery } from '../../supabase/functions/_shared/atlasExecutorCrmDelivery.js';

function connection(db) {
  const child = spawn('psql', db.psql, { env: db.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
  const waitFor = async marker => {
    const deadline = Date.now() + 8000;
    while (!output.includes(marker)) {
      if (child.exitCode !== null || Date.now() > deadline) throw Error(`Local SQL gate did not reach ${marker}: ${error}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  return { child, waitFor };
}
async function blocked(db, names) {
  const deadline = Date.now() + 8000;
  while (Number(db.sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name IN(${names.map(literal).join(',')}) AND wait_event_type='Lock'`)) !== names.length) {
    if (Date.now() > deadline) assert.fail('Concurrent local SQL clients did not contend on the expected lock.');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}
const concurrent = (db, name, statement) => promisify(execFile)('psql', [...db.psql, '-c', `SET application_name=${literal(name)};${db.userSql(statement)}`], { env: db.env, encoding: 'utf8', timeout: 15000 });

test('CRM executor message approval uses the real queue atomically in disposable PostgreSQL16', async t => {
  const db = deliveryDatabase();
  try {
    db.start();
    const queueCount = () => Number(db.sql('SELECT count(*) FROM crm_ia_outbox'));
    const prepare = async body => db.store(await prepareExecutorCrmDelivery(db.caller, { clientId: ids.client, action: 'send_message', input: { contact_id: ids.contact, channel_id: ids.channel, body } }));
    const saved = item => JSON.parse(db.sql(`SELECT to_jsonb(i) FROM atlas_execution_items i WHERE id='${item.id}'`));
    await t.test('context is read-only, omits secrets and review/receipt preserve queued versus sent', async () => {
      const before = db.sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${ids.contact}'`);
      const context = JSON.parse(db.asUser(`SELECT public.atlas_executor_crm_delivery_context('${ids.client}','${ids.contact}','${ids.channel}')`));
      assert.equal(context.can_send, true); assert.ok(!JSON.stringify(context).includes('fixture-secret'));
      assert.equal(JSON.parse(db.sql(`BEGIN READ ONLY;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${ids.admin}';SET LOCAL request.jwt.claims='${JSON.stringify({ sub: ids.admin, role: 'authenticated', session_id: ids.session })}';SELECT public.atlas_executor_crm_delivery_context('${ids.client}','${ids.contact}','${ids.channel}');COMMIT`)).can_send, true);
      const item = await prepare('Mensagem sintética autorizada.'); assert.equal(queueCount(), 0);
      assert.equal(db.sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${ids.contact}'`), before);
      const receipt = db.decide(item); assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.queued, true); assert.equal(receipt.result.sent, false); assert.equal(receipt.result.status, 'pending');
      assert.equal(queueCount(), 1); assert.equal(db.sql(`SELECT request_id FROM crm_ia_outbox WHERE id='${receipt.result.outbox_id}'`), item.id);
      assert.equal(db.sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${ids.contact}'`), 't');
      assert.equal(db.decide(item).result.outbox_id, receipt.result.outbox_id); assert.equal(queueCount(), 1);
      assert.equal(db.sql(`SELECT count(*) FROM cliente_whatsapp_sent`), '0');
    });
    await t.test('native block/opt-out and conversation version changes invalidate the proposal without queueing', async () => {
      let item = await prepare('Não enfileirar após bloqueio.'); const count = queueCount();
      db.sql(`INSERT INTO atendimento_bloqueios(cliente_id,chat_jid) VALUES('${ids.client}','551199999999@s.whatsapp.net')`);
      assert.throws(() => db.decide(item), /42501/); assert.equal(saved(item).state, 'proposed'); assert.equal(queueCount(), count);
      db.sql('DELETE FROM atendimento_bloqueios');
      item = await prepare('Não enfileirar versão antiga.');
      db.sql(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp() WHERE contact_id='${ids.contact}'`);
      const conflict = db.decide(item); assert.equal(conflict.state, 'conflict'); assert.equal(conflict.error.code, '40001'); assert.equal(queueCount(), count);
      item = await prepare('Não enfileirar contato alterado.');
      db.sql(`UPDATE cliente_whatsapp_contact SET from_jid='551199999998@s.whatsapp.net' WHERE id='${ids.contact}'`);
      assert.equal(db.decide(item).state, 'conflict'); assert.equal(queueCount(), count);
      db.sql(`UPDATE cliente_whatsapp_contact SET from_jid='551199999999@s.whatsapp.net' WHERE id='${ids.contact}'`);
    });
    await t.test('channel credentials, native inbox controls and test-mode consent are current at approval', async () => {
      let item = await prepare('Canal mudou.'); const count = queueCount();
      db.sql(`UPDATE cliente_whatsapp_config SET token='fixture-rotated' WHERE id='${ids.channel}'`);
      assert.equal(db.decide(item).state, 'conflict'); assert.equal(queueCount(), count);
      item = await prepare('Bloqueio nativo direto.');
      db.sql('UPDATE atendimento_conversas SET bloqueada=true'); assert.throws(() => db.decide(item), /42501/); db.sql('UPDATE atendimento_conversas SET bloqueada=false');
      item = await prepare('Não autorizado para modo teste.');
      db.sql(`INSERT INTO crm_ia_config(cliente_id,data) VALUES('${ids.client}','{"test_mode":{"enabled":true,"phones":["551188888888"]}}') ON CONFLICT(cliente_id) DO UPDATE SET data=excluded.data,revision=gen_random_uuid()`);
      assert.throws(() => db.decide(item), /42501/); assert.equal(queueCount(), count);
      db.sql(`UPDATE crm_ia_config SET data='{}',revision=gen_random_uuid() WHERE cliente_id='${ids.client}'`);
      item = await prepare('Recusa não envia.');
      const rejected = db.rpc('atlas_executor_decide', { p_id: item.id, p_revision: item.revision, p_decision: 'reject' });
      assert.equal(rejected.state, 'rejected'); assert.equal(queueCount(), count);
    });
    await t.test('revoked sessions, modules, channel rights and foreign scope never enqueue', async () => {
      const item = await prepare('Permissões atuais são obrigatórias.'); const count = queueCount();
      for (const options of [{ session: null }, { session: ids.otherSession }, { role: 'service_role' }, { delegate: 'atlas' }]) assert.throws(() => db.decide(item, options), /42501/);
      db.sql(`INSERT INTO user_module_permissions VALUES('${ids.admin}','crm',false)`); assert.throws(() => db.decide(item), /42501/); db.sql(`DELETE FROM user_module_permissions WHERE user_id='${ids.admin}' AND module_name='crm'`);
      db.sql(`UPDATE cliente_whatsapp_config SET archived_at=clock_timestamp() WHERE id='${ids.channel}'`); assert.throws(() => db.decide(item), /42501/); db.sql(`UPDATE cliente_whatsapp_config SET archived_at=NULL WHERE id='${ids.channel}'`);
      assert.throws(() => db.rpc('atlas_executor_crm_delivery_context', { p_client: ids.foreign, p_contact: ids.contact, p_channel: ids.channel }), /42501/);
      assert.equal(queueCount(), count);
    });
    await t.test('queue and AI pause roll back if storing the receipt fails', async () => {
      const item = await prepare('Rollback integral.'); const count = queueCount(); const before = db.sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${ids.contact}'`);
      db.sql(`CREATE FUNCTION public.qa_reject_delivery_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${item.id}' THEN RAISE EXCEPTION 'receipt_write_failed';END IF;RETURN NEW;END$$;CREATE TRIGGER qa_reject_delivery_receipt BEFORE UPDATE ON atlas_execution_items FOR EACH ROW EXECUTE FUNCTION public.qa_reject_delivery_receipt()`);
      assert.throws(() => db.decide(item), /receipt_write_failed/); assert.equal(queueCount(), count); assert.equal(saved(item).state, 'proposed');
      assert.equal(db.sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${ids.contact}'`), before);
      db.sql('DROP TRIGGER qa_reject_delivery_receipt ON atlas_execution_items;DROP FUNCTION public.qa_reject_delivery_receipt()');
    });
    await t.test('two approvals of the same item create exactly one native row', async () => {
      const item = await prepare('Corrida sintética.'); const before = queueCount(), gate = connection(db);
      try {
        gate.child.stdin.write(`BEGIN;SELECT id FROM atlas_execution_items WHERE id='${item.id}' FOR UPDATE;SELECT 'LOCKED';\n`); await gate.waitFor('LOCKED');
        const names = ['delivery-approve-a', 'delivery-approve-b']; const pending = names.map(name => concurrent(db, name, db.decideStatement(item)));
        await blocked(db, names); gate.child.stdin.end('COMMIT;\n');
        const rows = (await Promise.all(pending)).map(result => JSON.parse(result.stdout.trim()));
        assert.equal(rows[0].result.outbox_id, rows[1].result.outbox_id); assert.equal(queueCount(), before + 1);
      } finally { if (!gate.child.stdin.writableEnded) gate.child.stdin.end('ROLLBACK;\n'); gate.child.kill(); }
    });
    await t.test('session revocation while waiting on the native client lock prevents enqueue', async () => {
      const item = await prepare('Sessão revogada durante espera.'); const before = queueCount(), gate = connection(db);
      try {
        gate.child.stdin.write(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia:${ids.client}',0));SELECT 'LOCKED';\n`); await gate.waitFor('LOCKED');
        const pending = concurrent(db, 'delivery-session-revoke', db.decideStatement(item)).then(result => ({ result }), error => ({ error }));
        await blocked(db, ['delivery-session-revoke']); db.sql(`DELETE FROM auth.sessions WHERE id='${ids.session}'`); gate.child.stdin.end('COMMIT;\n');
        const result = await pending; assert.match(result.error?.stderr || '', /42501/); assert.equal(queueCount(), before); assert.equal(saved(item).state, 'proposed');
      } finally {
        if (!gate.child.stdin.writableEnded) gate.child.stdin.end('ROLLBACK;\n'); gate.child.kill();
        db.sql(`INSERT INTO auth.sessions(id,user_id) VALUES('${ids.session}','${ids.admin}') ON CONFLICT DO NOTHING`);
      }
    });
    await t.test('private delivery helper has no direct application grants and forged persisted payloads fail closed', async () => {
      assert.equal(db.sql("SELECT has_function_privilege('authenticated','private.atlas_executor_crm_delivery(public.atlas_execution_items)','EXECUTE')"), 'f');
      assert.equal(db.sql("SELECT has_function_privilege('service_role','private.atlas_executor_crm_delivery(public.atlas_execution_items)','EXECUTE')"), 'f');
      const item = await prepare('Não executar outro payload.'); const count = queueCount();
      db.sql(`UPDATE atlas_execution_items SET payload=payload||${json({ rpc: 'schedule_message' })} WHERE id=${literal(item.id)}`);
      assert.equal(db.decide(item).state, 'failed'); assert.equal(queueCount(), count);
    });
    await t.test('queue re-read and slot availability use the current native SQL services', async () => {
      const trace = [];
      const caller = { ...db.caller, functions: { invoke: async (name, { body }) => {
        trace.push({ name, body }); assert.equal(name, 'crm-ia-calendar'); assert.equal(body.action, 'busy');
        // No Google connection: the real authenticated native gate supplies required=false.
        return { data: db.rpc('crm_ia_calendar_workspace', { p_action: 'busy', p_payload: body }), error: null };
      } } };
      const queue = await readExecutorCrmDelivery(caller, { clientId: ids.client, view: 'message_queue', input: { contact_id: ids.contact, channel_id: ids.channel, limit: 200 } });
      assert.equal(queue.available, true); assert.equal(queue.data.total, queueCount()); assert.ok(queue.data.rows.every(row => row.status === 'pending'));
      assert.ok(!JSON.stringify(queue).includes('claim_token')); assert.equal(trace.length, 0);
      const date = db.sql("SELECT ((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date+2)::text");
      db.sql(`UPDATE crm_ia_config SET data=${json({ availability: { timezone: 'America/Sao_Paulo', duration_minutes: 30, interval_minutes: 30, min_notice_hours: 0, horizon_days: 60, windows: [{ owner_id: ids.admin, days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '11:00' }] } })},revision=gen_random_uuid() WHERE cliente_id='${ids.client}'`);
      const input = { owner_id: ids.admin, date }, slots = await readExecutorCrmDelivery(caller, { clientId: ids.client, view: 'slots', input });
      assert.equal(slots.available, true); assert.equal(slots.data.rows.length, 4); assert.equal(slots.data.calendar.required, false); assert.equal(trace.length, 1);
      const chosen = slots.data.rows[0];
      db.rpc('crm_ia_workspace', { p_action: 'save_appointment', p_client_id: ids.client, p_payload: { ...chosen, title: 'Compromisso local', request_id: id(9991), contact_id: ids.contact } });
      const reread = await readExecutorCrmDelivery(caller, { clientId: ids.client, view: 'slots', input });
      assert.equal(reread.available, true); assert.equal(reread.data.rows.length, 3); assert.ok(!reread.data.rows.some(row => row.start_at === chosen.start_at)); assert.equal(trace.length, 2);
    });
    await t.test('native claim/recheck blocks queued Atlas messages after block, destination or sender access changes', async () => {
      const mutations = [
        [`INSERT INTO atendimento_bloqueios(cliente_id,chat_jid) VALUES('${ids.client}','551199999999@s.whatsapp.net')`,'DELETE FROM atendimento_bloqueios'],
        ['UPDATE atendimento_conversas SET bloqueada=true','UPDATE atendimento_conversas SET bloqueada=false'],
        [`UPDATE cliente_whatsapp_contact SET from_jid='551188888888@s.whatsapp.net',updated_at=clock_timestamp() WHERE id='${ids.contact}'`,`UPDATE cliente_whatsapp_contact SET from_jid='551199999999@s.whatsapp.net',updated_at=clock_timestamp() WHERE id='${ids.contact}'`],
        [`INSERT INTO user_module_permissions VALUES('${ids.admin}','crm',false)`,`DELETE FROM user_module_permissions WHERE user_id='${ids.admin}' AND module_name='crm'`],
        [`UPDATE cliente_whatsapp_config SET token='fixture-after-enqueue' WHERE id='${ids.channel}'`,`UPDATE cliente_whatsapp_config SET token='fixture-rotated' WHERE id='${ids.channel}'`],
        [`UPDATE crm_ia_config SET revision=gen_random_uuid() WHERE cliente_id='${ids.client}'`,'SELECT 1'],
        [`UPDATE cliente_atend_conversas SET privado=true,assigned_to='${ids.staff}',updated_at=clock_timestamp() WHERE contact_id='${ids.contact}'`,`UPDATE cliente_atend_conversas SET privado=false,assigned_to='${ids.admin}',updated_at=clock_timestamp() WHERE contact_id='${ids.contact}'`],
      ];
      for (const [mutate,restore] of mutations) {
        const item = await prepare('Não transportar depois de revogar.'); const receipt = db.decide(item),outbox = receipt.result.outbox_id;
        try {
          db.sql(mutate);
          const claims = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${outbox}']::uuid[])`));assert.equal(claims.length,1);
          const token = claims[0].claim_token,target = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_recheck('${outbox}','${token}')`));
          assert.equal(target.allowed,false,mutate);assert.equal(db.sql(`SELECT status FROM crm_ia_outbox WHERE id='${outbox}'`),'cancelled');
          assert.equal(db.asService(`SELECT public.crm_ia_delivery_start('outbox','${outbox}','${token}')`),'f');
        } finally { db.sql(restore); }
      }
      assert.equal(db.sql('SELECT count(*) FROM cliente_whatsapp_sent'),'0');
    });
    await t.test('valid queued Atlas target survives its own IA pause and native function identities/grants stay exact', async () => {
      assert.deepEqual(db.nativeMetadata(),db.nativeBefore());
      const item = await prepare('Destino aprovado permanece exato.');const receipt = db.decide(item),outbox = receipt.result.outbox_id;
      const [claim] = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${outbox}']::uuid[])`));
      const target = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_recheck('${outbox}','${claim.claim_token}')`));
      assert.equal(target.allowed,true);assert.equal(target.to,'551199999999@s.whatsapp.net');
      assert.equal(db.asService(`SELECT public.crm_ia_delivery_start('outbox','${outbox}','${claim.claim_token}')`),'t');
      assert.equal(db.asService(`SELECT public.crm_ia_delivery_start('outbox','${outbox}','${claim.claim_token}')`),'f');
    });
    await t.test('native delivery_start rechecks a block introduced after worker precheck; legacy messages retain their chain', async () => {
      const item = await prepare('Bloqueio entre conferência e transporte.');const receipt = db.decide(item),outbox = receipt.result.outbox_id;
      const [claim] = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${outbox}']::uuid[])`));
      const checked = JSON.parse(db.asService(`SELECT jsonb_build_object('target',public.crm_ia_delivery_recheck('${outbox}','${claim.claim_token}'),'role',auth.role(),'actor',auth.uid())`));
      assert.equal(checked.target.allowed,true);assert.equal(checked.role,'service_role');assert.equal(checked.actor,null);
      db.sql(`INSERT INTO atendimento_bloqueios(cliente_id,chat_jid) VALUES('${ids.client}','551199999999@s.whatsapp.net')`);
      try {
        assert.equal(db.asService(`SELECT public.crm_ia_delivery_start('outbox','${outbox}','${claim.claim_token}')`),'f');
        assert.equal(db.sql(`SELECT status FROM crm_ia_outbox WHERE id='${outbox}'`),'cancelled');
      } finally { db.sql('DELETE FROM atendimento_bloqueios'); }
      const legacy = db.rpc('crm_ia_workspace',{ p_action:'schedule_message',p_client_id:ids.client,p_payload:{ contact_id:ids.contact,channel_id:ids.channel,body:'Fila manual nativa pré-existente.',request_id:id(9992) } });
      const [legacyClaim] = JSON.parse(db.asService(`SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${legacy.id}']::uuid[])`));
      assert.equal(JSON.parse(db.asService(`SELECT public.crm_ia_delivery_recheck('${legacy.id}','${legacyClaim.claim_token}')`)).allowed,true);
    });
  } finally { db.stop(); }
});
