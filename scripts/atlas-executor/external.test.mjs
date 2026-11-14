import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareExecutorMetaUpdate,decideExecutorExternal,reconcileExecutorExternal,createExecutorExternalSteps } from '../../supabase/functions/_shared/atlasExecutorExternal.js';
import { externalFixture,clientId,accountId,objectId } from './external-fixture.mjs';
import { validateMetaCampaignPlan } from '../../supabase/functions/_shared/atlasMetaCampaign.js';
const posts = f => f.calls.filter(call => call.kind === 'graph' && call.method === 'POST').length;
test('preparação usa caller real e conta explícita, lê antes e não aprova nem envia POST',async () => {
  const f = externalFixture();
  const result = await prepareExecutorMetaUpdate(f.caller,{ clientId,input:{ account_id:accountId,object_id:objectId,level:'adset',status:'PAUSED' },...f.deps });
  assert.equal(result.action,'update_meta');assert.equal(result.before.configured_status,'ACTIVE');assert.equal(result.payload.adAccountId,accountId);assert.equal(result.effect.external,true);
  assert.equal(posts(f),0);assert.equal(f.calls.some(call => call.name?.startsWith('atlas_executor_external_')),false);
  await assert.rejects(prepareExecutorMetaUpdate(f.caller,{ clientId,input:{ object_id:objectId,status:'PAUSED' },...f.deps }));
});
test('aprovação persistida precede GET e POST; releitura salva recibo e replay não envia',async () => {
  const f = externalFixture(),result = await decideExecutorExternal(f.deps);
  assert.equal(result.state,'completed');assert.equal(posts(f),1);
  const reserve = f.calls.findIndex(call => call.name === 'atlas_executor_external_reserve'),token = f.calls.findIndex(call => call.kind === 'token');assert.ok(reserve < token);
  assert.equal(f.steps.get('update').receipt.verified,true);
  assert.equal((await decideExecutorExternal(f.deps)).state,'completed');assert.equal(posts(f),1);
});
test('dois cliques concorrentes produzem um único POST',async () => {
  const f = externalFixture();await Promise.all([decideExecutorExternal(f.deps),decideExecutorExternal(f.deps)]);assert.equal(posts(f),1);
});
test('fotografia alterada termina em conflito sem POST',async () => {
  const f = externalFixture({ changedBefore:true });assert.equal((await decideExecutorExternal(f.deps)).state,'conflict');assert.equal(posts(f),0);
});
test('permissão revogada impede token; revogação entre GET e POST também impede envio',async () => {
  const f = externalFixture({ deny:true });await assert.rejects(decideExecutorExternal(f.deps));assert.equal(f.calls.some(call => call.kind === 'token'),false);
  const changed = externalFixture({ revokeAfterRead:true });await assert.rejects(decideExecutorExternal(changed.deps));assert.equal(posts(changed),0);
  assert.equal(changed.calls.some(row => row.kind === 'graph' && row.path === '/v25.0/act_700'),false);
});
test('resposta perdida permanece incerta; reconciliação só GET e não repete POST',async () => {
  const f = externalFixture({ network:true });assert.equal((await decideExecutorExternal(f.deps)).state,'uncertain');assert.equal(posts(f),1);
  assert.equal((await reconcileExecutorExternal(f.deps)).state,'completed');assert.equal(posts(f),1);
});
test('HTTP200 error ou ok:false não é sucesso, e erro privado não é persistido',async () => {
  for (const post of [{ error:{ code:100,message:'synthetic-meta-secret' } },{ ok:false }]) {
    const f = externalFixture({ post }),result = await decideExecutorExternal(f.deps);
    assert.notEqual(result.state,'completed');assert.equal(posts(f),1);assert.doesNotMatch(JSON.stringify(result),/synthetic-meta-secret/);
  }
});
test('releitura falha/diverge e recibo sem confirmação não concluem',async () => {
  for (const options of [{ readbackFailure:true },{ readbackMismatch:true },{ finishLost:true }]) {
    const f = externalFixture(options),result = await decideExecutorExternal(f.deps);assert.ok(['uncertain','executing'].includes(result.state));assert.equal(posts(f),1);
    await decideExecutorExternal(f.deps);assert.equal(posts(f),1);
  }
});
test('reconciliação revogada nunca consulta Graph e reserva ativa não causa corrida',async () => {
  const f = externalFixture({ finishLost:true });await decideExecutorExternal(f.deps);const reads = f.calls.filter(call => call.kind === 'graph').length;
  assert.equal((await reconcileExecutorExternal(f.deps)).state,'executing');assert.equal(f.calls.filter(call => call.kind === 'graph').length,reads);
  f.revoke();await assert.rejects(reconcileExecutorExternal(f.deps));assert.equal(f.calls.filter(call => call.kind === 'graph').length,reads);
});
test('callbacks da criação mantêm lease e recusam conta diferente sem reserva',async () => {
  const f = externalFixture();f.item.action = 'create_meta_campaign';f.item.payload = { plan:{ account_id:accountId } };
  const callbacks = await createExecutorExternalSteps({ ...f.deps,item:f.item });
  await assert.rejects(callbacks.reserveStep({ step:'campaign',account_id:'act_800',request:{} }));
  const row = await callbacks.reserveStep({ step:'campaign',account_id:accountId,request:{ method:'POST',path:`/v25.0/${accountId}/campaigns`,body:{ status:'PAUSED' } } });
  assert.equal(row.claimed,true);
  const receipt = { id:'123456',account_id:accountId,step:'campaign',verified:true };
  assert.equal((await callbacks.finishStep({ step:'campaign',state:'completed',receipt })).state,'completed');
});
test('orçamento é apresentado com moeda corrente e valor exato; mudança de moeda conflita',async () => {
  const f = externalFixture(),proposal = await prepareExecutorMetaUpdate(f.caller,{ clientId,input:{ account_id:accountId,object_id:objectId,level:'adset',daily_budget:9000 },...f.deps });
  assert.equal(proposal.preview.before['Orçamento diário'],'BRL 80.00');assert.equal(proposal.preview.after['Orçamento diário'],'BRL 90.00');
  assert.equal(proposal.preview.before.Status,'Ativo');assert.equal(proposal.preview.after.Nível,'Conjunto de anúncios');
  assert.equal(proposal.payload.daily_budget,9000);assert.doesNotMatch(JSON.stringify(proposal.preview),/daily_budget|currency_offset|minor|:9000/);
  assert.equal(proposal.links[0].href,`/gestor-ia/clientes/${clientId}?conta=${accountId}`);
  const changed = externalFixture({ currency:'USD' });assert.equal((await decideExecutorExternal(changed.deps)).state,'conflict');assert.equal(posts(changed),0);
});

function campaignFixture(options = {}) {
  const f = externalFixture(),page = '222222',post = `${page}_333333`,created = new Map();let failed = false;
  const plan = validateMetaCampaignPlan({ campaign_name:'Campanha QA',adset_name:'Conjunto QA',creative_name:'Criativo QA',ad_name:'Anúncio QA',objective:'OUTCOME_TRAFFIC',special_category:'none',budget:{ type:'daily',amount:'10.50' },countries:['BR'],start_time:'2027-01-01T12:00:00Z',creative:{ mode:'post',page_id:page,post_id:post } },
    { accountId,currency:'BRL',authorizedAssets:{ account_id:accountId,pages:[{ id:page,source:'promote_pages',can_advertise:true }],posts:[{ id:post,page_id:page,promotable:true,url:'https://example.test/cafe' }] },now:'2026-11-12T00:00:00Z' });
  f.item.action = 'create_meta_campaign';f.item.payload = { plan };f.item.before = { account:{ currency:'BRL' } };
  const graphFetch = async (input,init = {}) => {
    const url = new URL(input),method = init.method || 'GET';assert.equal(url.origin,'https://graph.facebook.com');assert.ok(url.pathname.startsWith('/v25.0/'));
    f.calls.push({ kind:'graph',method,path:url.pathname });
    if (url.pathname === '/v25.0/act_700') return Response.json({ id:accountId,account_id:'700',currency:'BRL',name:'Conta QA',account_status:1,user_tasks:['ADVERTISE'] });
    if (url.pathname.endsWith('/promote_pages')) return Response.json({ data:[{ id:page,name:'Página QA' }] });
    if (url.pathname === `/v25.0/${page}/ads_posts`) return Response.json({ data:[{ id:post,from:{ id:page },is_eligible_for_promotion:true,promotable_id:post,attachments:{ data:[{ media_type:'link',unshimmed_url:'https://example.test/cafe' }] } }] });
    if (url.pathname.endsWith('/adimages')) return Response.json({ data:[] });
    if (method === 'POST') {
      const edge = url.pathname.split('/').at(-1),id = ({ campaigns:'100001',adsets:'100002',adcreatives:'100003',ads:'100004' })[edge];
      assert.ok(id);created.set(id,edge);
      if (options.lostPost) throw Error('synthetic-meta-secret');
      if (options.revokeAfterPost) f.revoke();
      return Response.json({ id });
    }
    const entity = url.pathname.split('/').at(-1),edge = created.get(entity);assert.ok(edge,entity);
    if (options.failReadbackOnce && !failed) { failed = true;throw Error('synthetic-meta-secret'); }
    return Response.json({ id:entity,account_id:'700',status:'PAUSED',objective:'OUTCOME_TRAFFIC',...(edge === 'adsets' && { campaign_id:'100001' }),...(edge === 'ads' && { adset_id:'100002',creative:{ id:'100003' } }) });
  };
  f.deps.graphFetch = graphFetch;f.deps.now = '2026-11-12T00:00:00Z';return f;
}
test('mesmo handler executa quatro etapas Meta pausadas e replay não repete POST',async () => {
  const f = campaignFixture();assert.equal((await decideExecutorExternal(f.deps)).state,'completed');assert.equal(posts(f),4);
  assert.equal((await decideExecutorExternal(f.deps)).state,'completed');assert.equal(posts(f),4);
});
test('criação incerta com recibo conhecido reconcilia só GET e permite continuar etapas aprovadas',async () => {
  const f = campaignFixture({ failReadbackOnce:true });assert.equal((await decideExecutorExternal(f.deps)).state,'uncertain');assert.equal(posts(f),1);
  assert.equal(f.steps.get('campaign').receipt.verified,false);
  assert.equal((await reconcileExecutorExternal(f.deps)).state,'executing');assert.equal(posts(f),1);
  assert.equal((await decideExecutorExternal(f.deps)).state,'completed');assert.equal(posts(f),4);
});
test('criação sem ID confirmado não reconcilia por nome nem repete criação',async () => {
  const f = campaignFixture({ lostPost:true });assert.equal((await decideExecutorExternal(f.deps)).state,'uncertain');assert.equal(posts(f),1);
  const graphs = f.calls.filter(row => row.kind === 'graph').length;
  assert.equal((await reconcileExecutorExternal(f.deps)).state,'uncertain');assert.equal(f.calls.filter(row => row.kind === 'graph').length,graphs);
  assert.equal((await decideExecutorExternal(f.deps)).state,'uncertain');assert.equal(posts(f),1);
});
test('revogar permissão após criação bloqueia GET de releitura e etapas seguintes',async () => {
  const f = campaignFixture({ revokeAfterPost:true });await assert.rejects(decideExecutorExternal(f.deps));assert.equal(posts(f),1);
  assert.equal(f.calls.some(row => row.kind === 'graph' && row.path === '/v25.0/100001'),false);
});
