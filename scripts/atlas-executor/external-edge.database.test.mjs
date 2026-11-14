import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { externalEdgeDatabaseFixture,externalEdgeTransport,ids } from './external-edge.database-fixture.mjs';

const { outputFiles:[bundle] } = await build({ entryPoints:[new URL('../../supabase/functions/atlas-chat/index.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',external:['https://*'],write:false });
const approve = item => ({ action:'executor_decide',id:item.id,revision:item.revision,decision:'approve' });
const accepted = response => assert.equal(response.status,200,JSON.stringify(response.body));

test('real Atlas Edge, caller RLS and native external ledger integrate in isolated PostgreSQL16',async t => {
  const db = externalEdgeDatabaseFixture();
  const itemRow = item => JSON.parse(db.sql(`SELECT to_jsonb(i) FROM atlas_execution_items i WHERE id='${item.id}'`));
  const attempts = item => Number(db.sql(`SELECT count(*) FROM private.atlas_executor_external_steps WHERE item_id='${item.id}'`));
  try {
    db.start();
    await t.test('endpoint approval stores a verified receipt; double click and replay perform one POST',async () => {
      const item = db.proposal(),f = externalEdgeTransport(db,bundle.text);
      const responses = await Promise.all([f.send(approve(item)),f.send(approve(item))]);responses.forEach(accepted);
      const replay = await f.send(approve(item));accepted(replay);
      assert.equal(f.posts(),1);assert.equal(attempts(item),1);assert.equal(replay.body.item.state,'completed');
      assert.equal(replay.body.item.owner_id,ids.admin);assert.equal(replay.body.item.conversation_id,item.conversation_id);
      const saved = itemRow(item);assert.deepEqual(replay.body.item.result,saved.result);
      assert.equal(saved.result.steps[0].receipt.verified,true);assert.equal(saved.result.steps[0].receipt.snapshot.configured_status,'PAUSED');
      assert.equal(saved.result.steps[0].receipt.snapshot.currency,'BRL');
      for (const name of ['atlas_executor_external_status','atlas_executor_external_approve','atlas_executor_external_reserve','atlas_executor_external_finish','atlas_executor_external_get']) assert.ok(f.calls.some(call => call.name === name),name);
      for (const call of f.calls.filter(call => call.kind === 'rpc')) {
        assert.equal(call.role,['atlas_executor_external_reserve','atlas_executor_external_finish','atlas_executor_external_get'].includes(call.name) ? 'service_role' : 'authenticated',call.name);
        if (call.role === 'authenticated') { assert.equal(call.actor,ids.admin);assert.equal(call.session,ids.session); }
      }
      assert.ok(f.calls.some(call => call.kind === 'table' && call.name === 'atlas_execution_items' && call.role === 'authenticated'));
      assert.deepEqual(f.logs,[]);
    });
    await t.test('lost POST response persists uncertainty and endpoint reconciliation only reads before confirming',async () => {
      const item = db.proposal(),f = externalEdgeTransport(db,bundle.text,{ lostPost:true });
      const lost = await f.send(approve(item));accepted(lost);assert.equal(lost.body.item.state,'uncertain');assert.equal(itemRow(item).state,'uncertain');assert.equal(f.posts(),1);
      const count = f.graph.length;
      const reconciled = await f.send({ action:'executor_reconcile',id:item.id });accepted(reconciled);
      assert.equal(reconciled.body.item.state,'completed');assert.equal(itemRow(item).result.steps[0].receipt.verified,true);
      assert.equal(f.posts(),1);assert.equal(attempts(item),1);assert.ok(f.graph.length > count);assert.ok(f.graph.slice(count).every(call => call.method === 'GET'));
      accepted(await f.send(approve(item)));assert.equal(f.posts(),1);
    });
    await t.test('foreign owner and extra decision/reconcile payloads are rejected before Graph or ledger approval',async () => {
      const item = db.proposal(),foreign = db.proposal({ owner:ids.staff }),f = externalEdgeTransport(db,bundle.text);
      assert.equal(db.user(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${foreign.id}'`),'0','RLS hides another owner under the real caller role');
      const requests = [approve(foreign),{ ...approve(item),owner_id:ids.staff },{ ...approve(item),payload:{ status:'ACTIVE' } },{ ...approve(item),client_id:ids.foreign },{ action:'executor_reconcile',id:item.id,payload:{ status:'ACTIVE' } }];
      for (const body of requests) {
        const response = await f.send(body);assert.ok([400,403].includes(response.status),JSON.stringify(response));assert.equal(response.body.ok,false);
      }
      assert.equal(f.graph.length,0);assert.equal(attempts(item),0);assert.equal(attempts(foreign),0);assert.equal(itemRow(item).state,'proposed');
      assert.equal(f.calls.some(call => call.name === 'atlas_executor_external_approve'),false);
    });
    await t.test('current JWT session and native permission revocations deny the endpoint before Graph',async () => {
      const item = db.proposal(),f = externalEdgeTransport(db,bundle.text);
      assert.equal((await f.send(approve(item),{ session:ids.otherSession })).status,403);assert.equal(f.graph.length,0);
      db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.admin}','paid_traffic',false)`);
      try {
        assert.equal((await f.send(approve(item))).status,403);assert.equal(f.graph.length,0);assert.equal(attempts(item),0);assert.equal(itemRow(item).state,'proposed');
      } finally { db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.admin}' AND module_name='paid_traffic'`); }
      const valid = await f.send(approve(item));accepted(valid);assert.equal(valid.body.item.state,'completed');assert.equal(f.posts(),1);
    });
  } finally { db.stop(); }
});
