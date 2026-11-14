import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { externalDatabaseFixture,ids,id } from './external-database-fixture.mjs';
import { validateMetaCampaignPlan,executeMetaCampaignPlan } from '../../supabase/functions/_shared/atlasMetaCampaign.js';
const request = { method:'POST',path:'/v25.0/1234567890123',body:{ status:'PAUSED' } };
const receipt = patch => ({ id:'1234567890123',account_id:'act_700',step:'update',verified:true,snapshot:{ object_id:'1234567890123',account_id:'act_700',level:'adset',configured_status:'PAUSED',api_version:'v25.0',currency:'BRL',currency_offset:100 },...patch });
const denied = (run,pattern = /42501/) => assert.throws(run,pattern);
function asyncSql(db,input) {
  return new Promise((resolve,reject) => {
    const child = spawn('psql',db.psql,{ env:db.env });let out = '',error = '';
    child.stdout.on('data',chunk => { out += chunk; });child.stderr.on('data',chunk => { error += chunk; });
    child.on('error',reject);child.on('close',code => code ? reject(Error(error)) : resolve(out.trim()));child.stdin.end(input);
  });
}

test('ledger externo persiste aprovação e uma única reserva no PostgreSQL privado',async t => {
  const db = externalDatabaseFixture();
  try {
    db.start();
    await t.test('aprovação e reserva repetida mantêm a mesma tentativa',() => {
      const item = db.proposal(),approved = db.approve(item);
      assert.equal(approved.item.state,'executing');
      const first = db.reserve(item,request),replay = db.reserve(item,request);
      assert.equal(first.claimed,true);assert.equal(replay.claimed,false);assert.equal(replay.lease,first.lease);
    });
    await t.test('reservas concorrentes em conexões distintas concedem exatamente uma tentativa',async () => {
      const item = db.proposal();db.approve(item);
      const results = await Promise.all([asyncSql(db,db.serviceSql(`${db.reserveStatement(item,request)};SELECT pg_sleep(0.1)`)),asyncSql(db,db.serviceSql(db.reserveStatement(item,request)))]);
      const claims = results.map(result => JSON.parse(result.split('\n')[0]));
      assert.equal(claims.filter(row => row.claimed).length,1);assert.equal(claims[0].lease,claims[1].lease);
      assert.equal(db.sql(`SELECT count(*) FROM private.atlas_executor_external_steps WHERE item_id='${item.id}'`),'1');
    });
    await t.test('aprovação usa revisão atual e sessão original; decisão incompatível não é substituída',() => {
      const item = db.proposal();denied(() => db.approve({ ...item,revision:7 }),/40001/);
      denied(() => db.approve(item,{ actor:ids.staff,session:ids.otherSession }));
      denied(() => db.approve(item,{ session:ids.otherSession }));
      assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${item.id}'`),'proposed');
      db.approve(item);assert.equal(db.approve(item).item.state,'executing');
    });
    await t.test('somente o caller aprova e somente o serviço reserva; sem acesso direto às tabelas privadas',() => {
      const item = db.proposal();db.approve(item);
      denied(() => db.service(`SELECT public.atlas_executor_external_approve('${item.id}',1)`));
      denied(() => db.user(db.reserveStatement(item,request)));
      denied(() => db.service('SELECT * FROM private.atlas_executor_external_approvals'));
      denied(() => db.service('SELECT * FROM auth.sessions'));
      denied(() => db.user(`UPDATE public.atlas_execution_items SET payload='{}' WHERE id='${item.id}'`));
      denied(() => db.sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL test.uid='${ids.admin}';SET LOCAL request.jwt.claims='{"role":"service_role"}';${db.reserveStatement(item,request)};COMMIT`));
      denied(() => db.service(`SELECT public.atlas_executor_external_get('${id(999999)}','${ids.session}')`));
    });
    await t.test('payload, fotografia, ação e origem aprovados são imutáveis para o serviço',() => {
      for (const change of ["payload=jsonb_set(payload,'{status}','\"ACTIVE\"')","before=jsonb_set(before,'{configured_status}','\"PAUSED\"')","action='create_meta_campaign'"]) {
        const item = db.proposal();db.approve(item);db.sql(`UPDATE public.atlas_execution_items SET ${change} WHERE id='${item.id}'`);
        denied(() => db.reserve(item,request));
        assert.equal(db.sql(`SELECT count(*) FROM private.atlas_executor_external_steps WHERE item_id='${item.id}'`),'0');
      }
      const item = db.proposal();db.approve(item);denied(() => db.sql(`UPDATE public.atlas_runs SET source_session_id='${ids.otherSession}' WHERE id='${item.run_id}'`));
    });
    await t.test('escopo Meta e fotografia incompletos recusam aprovação sem gravar aprovação parcial',() => {
      for (const patch of [{ payload:{ objectId:'1234567890123',level:'adset',status:'PAUSED' } },{ before:{} },{ payload:{ adAccountId:'act_800',objectId:'1234567890123',level:'adset',status:'PAUSED' } },{ payload:{ adAccountId:'act_700',objectId:'1234567890123',level:'campaign',daily_budget:100 } }]) {
        const item = db.proposal(patch);denied(() => db.approve(item),/42501|22023/);
        assert.equal(db.sql(`SELECT count(*) FROM private.atlas_executor_external_approvals WHERE item_id='${item.id}'`),'0');
      }
    });
    await t.test('expiração, banimento, perfil, módulos, cliente, conta e campos revogados bloqueiam reserva e recibo',() => {
      const changes = [
        [`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${ids.session}'`,`UPDATE auth.sessions SET not_after=NULL WHERE id='${ids.session}'`],
        [`UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='${ids.admin}'`,`UPDATE auth.users SET banned_until=NULL WHERE id='${ids.admin}'`],
        [`UPDATE public.profiles SET status='inactive' WHERE id='${ids.admin}'`,`UPDATE public.profiles SET status='active' WHERE id='${ids.admin}'`],
        ["UPDATE public.atlas_settings SET enabled=false","UPDATE public.atlas_settings SET enabled=true"],
        ["UPDATE public.module_settings SET is_enabled=false WHERE module_name='assistant'","UPDATE public.module_settings SET is_enabled=true WHERE module_name='assistant'"],
        ["UPDATE public.module_settings SET is_enabled=false WHERE module_name='paid_traffic'","UPDATE public.module_settings SET is_enabled=true WHERE module_name='paid_traffic'"],
        [`UPDATE public.clientes SET etapa='lead' WHERE id='${ids.client}'`,`UPDATE public.clientes SET etapa='closed' WHERE id='${ids.client}'`],
        [`UPDATE public.cliente_meta_accounts SET is_active=false WHERE cliente_id='${ids.client}'`,`UPDATE public.cliente_meta_accounts SET is_active=true WHERE cliente_id='${ids.client}'`],
        ["INSERT INTO public.client_field_permissions VALUES('admin','meta_resumo',false)","DELETE FROM public.client_field_permissions"],
        [`INSERT INTO public.user_client_field_permissions VALUES('${ids.admin}','meta_resumo',NULL)`,'DELETE FROM public.user_client_field_permissions'],
      ];
      for (const [revoke,restore] of changes) {
        const item = db.proposal();db.approve(item);const claim = db.reserve(item,request);db.sql(revoke);
        denied(() => db.reserve(item,request));denied(() => db.finish(item,'update',claim.lease,'completed',receipt()));
        db.sql(restore);assert.equal(db.finish(item,'update',claim.lease,'completed',receipt()).item.state,'completed');
      }
    });
    await t.test('colaborador exige ACL atual e orçamento exige campo valor atual',() => {
      db.sql(`UPDATE public.profiles SET role='colaborador' WHERE id='${ids.admin}';INSERT INTO public.traffic_client_access VALUES('${ids.client}','${ids.admin}')`);
      const item = db.proposal();db.approve(item);db.sql('DELETE FROM public.traffic_client_access');denied(() => db.reserve(item,request));
      db.sql(`UPDATE public.profiles SET role='admin' WHERE id='${ids.admin}'`);
      const budget = db.proposal({ payload:{ adAccountId:'act_700',objectId:'1234567890123',level:'adset',daily_budget:9000 },before:{ object_id:'1234567890123',account_id:'act_700',level:'adset',configured_status:'ACTIVE',api_version:'v25.0',currency:'BRL',currency_offset:100,daily_budget:8000,lifetime_budget:0 } });
      db.approve(budget);db.sql("INSERT INTO public.client_field_permissions VALUES('admin','valor',false)");
      denied(() => db.reserve(budget,{ ...request,body:{ daily_budget:9000 } }));db.sql('DELETE FROM public.client_field_permissions');
    });
    await t.test('excluir sessão de origem revoga transporte sem bloquear logout nem apagar o UUID histórico',() => {
      const item = db.proposal();db.approve(item);db.reserve(item,request);
      db.sql(`DELETE FROM auth.sessions WHERE id='${ids.session}'`);
      assert.equal(db.sql(`SELECT source_session_id FROM public.atlas_runs WHERE id='${item.run_id}'`),ids.session);
      denied(() => db.service(`SELECT public.atlas_executor_external_get('${item.id}','${ids.session}')`));
      db.sql(`INSERT INTO auth.sessions VALUES('${ids.session}','${ids.admin}',NULL)`);
    });
    await t.test('requisição é fixa, absoluta e exatamente igual aos campos aprovados',() => {
      const item = db.proposal();db.approve(item);
      for (const altered of [{ ...request,path:'https://evil.invalid' },{ ...request,path:'/v24.0/1234567890123' },{ ...request,body:{ status:'ACTIVE' } },{ ...request,body:{ status:'PAUSED',daily_budget:5000 } },{ ...request,headers:{ Authorization:'private' } },{ ...request,method:'GET' }]) denied(() => db.reserve(item,altered),/22023/);
      assert.equal(db.sql(`SELECT count(*) FROM private.atlas_executor_external_steps WHERE item_id='${item.id}'`),'0');
    });
    await t.test('recibo precisa comprovar objeto, conta, estado e lease; terminal replay é exato',() => {
      const item = db.proposal();db.approve(item);const claim = db.reserve(item,request);
      for (const wrong of [receipt({ verified:false }),receipt({ verified:'true' }),receipt({ id:'123456' }),receipt({ account_id:'act_800' }),receipt({ snapshot:{ ...receipt().snapshot,configured_status:'ACTIVE' } })]) denied(() => db.finish(item,'update',claim.lease,'completed',wrong),/22023/);
      denied(() => db.finish(item,'update',id(9999),'completed',receipt()));
      const done = db.finish(item,'update',claim.lease,'completed',receipt());assert.equal(done.item.state,'completed');
      assert.equal(db.finish(item,'update',claim.lease,'completed',receipt()).state,'completed');
      denied(() => db.finish(item,'update',claim.lease,'uncertain',receipt({ verified:false })),/40001/);
      assert.equal(db.reserve(item,request).claimed,false);
    });
    await t.test('tentativa abandonada expira para incerta e conserva reserva; conferência pode concluir sem nova reserva',() => {
      const item = db.proposal();db.approve(item);const claim = db.reserve(item,request);
      db.sql(`UPDATE private.atlas_executor_external_steps SET expires_at=now()-interval '1 second' WHERE item_id='${item.id}'`);
      const saved = JSON.parse(db.service(`SELECT public.atlas_executor_external_get('${item.id}','${ids.session}')`));
      assert.equal(saved.item.state,'uncertain');assert.equal(saved.steps[0].state,'uncertain');assert.equal(db.reserve(item,request).claimed,false);
      assert.equal(db.finish(item,'update',claim.lease,'completed',receipt()).item.state,'completed');
    });
    await t.test('mensagem upstream privada não entra no erro persistido e transação inválida mantém reserva',() => {
      const item = db.proposal();db.approve(item);const claim = db.reserve(item,request);
      const result = db.finish(item,'update',claim.lease,'uncertain',receipt({ verified:false }),{ code:'META_NETWORK',message:'synthetic-secret' });
      assert.doesNotMatch(JSON.stringify(result),/synthetic-secret/);assert.equal(result.item.state,'uncertain');
      denied(() => db.finish(item,'update',claim.lease,'completed',receipt({ account_id:'act_800' })),/22023/);
      assert.equal(db.sql(`SELECT state FROM private.atlas_executor_external_steps WHERE item_id='${item.id}'`),'uncertain');
    });
    await t.test('criação real do builder reserva quatro requisições fixas, pausadas e vinculadas aos recibos',async () => {
      const plan = validateMetaCampaignPlan({ campaign_name:'Campanha QA',adset_name:'Conjunto QA',creative_name:'Criativo QA',ad_name:'Anúncio QA',objective:'OUTCOME_TRAFFIC',special_category:'none',budget:{ type:'daily',amount:'10.50' },countries:['BR'],age_min:25,age_max:65,gender:'all',start_time:'2026-11-13T12:00:00Z',creative:{ mode:'post',page_id:'123456',post_id:'123456_789012' } },
        { accountId:'act_700',currency:'BRL',authorizedAssets:{ account_id:'act_700',pages:[{ id:'123456',source:'promote_pages',can_advertise:true }],posts:[{ id:'123456_789012',page_id:'123456',promotable:true,url:'https://example.invalid/post' }] },now:'2026-11-12T00:00:00Z' });
      const item = db.proposal({ action:'create_meta_campaign',payload:{ plan },before:null });db.approve(item);
      let posts = 0;const ids = { campaign:'1234560001',adset:'1234560002',creative:'1234560003',ad:'1234560004' },leases = new Map();
      const calls = {
        plan,
        reserveStep:async ({ step,request }) => { const row = db.reserve(item,request,step);leases.set(step,row.lease);return row; },
        finishStep:async ({ step,state,receipt,error }) => db.finish(item,step,leases.get(step),state,receipt,error),
        callGraph:async call => {
          if (call.method === 'POST') { posts++;return { ok:true,status:200,data:{ id:ids[['campaign','adset','creative','ad'][posts - 1]] } }; }
          const entity = call.path.split('/').at(-1),step = Object.keys(ids).find(key => ids[key] === entity);
          return { ok:true,status:200,data:{ id:entity,account_id:'700',status:'PAUSED',objective:'OUTCOME_TRAFFIC',...(step === 'adset' && { campaign_id:ids.campaign }),...(step === 'ad' && { adset_id:ids.adset,creative:{ id:ids.creative } }) } };
        },
      };
      assert.equal((await executeMetaCampaignPlan(calls)).state,'completed');assert.equal(posts,4);
      assert.equal((await executeMetaCampaignPlan(calls)).state,'completed');assert.equal(posts,4);
      assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${item.id}'`),'completed');
      const other = db.proposal({ action:'create_meta_campaign',payload:{ plan },before:null });db.approve(other);
      denied(() => db.reserve(other,{ method:'POST',path:'/v25.0/act_700/campaigns',body:{ name:'Outra campanha',status:'PAUSED' } },'campaign'),/22023/);
      denied(() => db.reserve(other,{ method:'POST',path:'/v25.0/act_700/adsets',body:{ campaign_id:ids.campaign,status:'PAUSED' } },'adset'),/22023/);
    });
  } finally { db.stop(); }
});
