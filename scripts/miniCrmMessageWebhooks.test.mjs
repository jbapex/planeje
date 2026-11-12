import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWaMeRedirectUrl } from '../src/lib/rastreamentoTrackableLink.js';
import { hasStoredContactAttribution } from '../supabase/functions/_shared/rastreamentoMessageAttribution.js';

const message = 'Olá! Vim do perfil e gostaria de agendar uma visita. [Não apagar]';
const client = 'client-fixture', channel = 'channel-fixture', jid = '5511987654321@s.whatsapp.net';
const link = { id: 'link-fixture', cliente_id: client, whatsapp_config_id: channel, is_active: true,
  initial_message: message, default_origin: 'site', default_utm_source: 'Linktree', default_utm_medium: 'clique',
  default_utm_campaign: 'visitas_ao_perfil' };
let db, conversions, outbound, ruleCalls;
globalThis.__captureMiniRule = options => {ruleCalls.push(options);return Promise.resolve({applied:false});};
globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' })[key] } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  outbound.push(String(url));
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
globalThis.__fixtureClient = { rpc: async (name,args) => {
  if(name!=='persist_ingress_contact_attribution')return {data:null,error:null};
  if(db.failPersist)return {data:null,error:{code:'fixture-history-failure'}};
  const rows=db.cliente_whatsapp_contact ||= [];
  let current=rows.find(row=>row.cliente_id===args.p_cliente_id&&row.from_jid===args.p_from_jid);
  const contact=structuredClone(args.p_contact),keep={};
  if(hasStoredContactAttribution(current))for(const key of ['origin_source','utm_source','utm_medium','utm_campaign','utm_content','utm_term','tracking_data'])keep[key]=current[key]??null;
  else contact.tracking_data={...current?.tracking_data,...contact.tracking_data};
  for(const key of ['sender_name','profile_pic_url','phone'])if(!contact[key] || key==='sender_name'&&contact.sender_name_is_fallback&&current?.sender_name)contact[key]=current?.[key]||contact[key]||null;
  delete contact.sender_name_is_fallback;
  if(!current){current={id:`contact-${rows.length}`,cliente_id:args.p_cliente_id,from_jid:args.p_from_jid};rows.push(current);}
  Object.assign(current,contact,keep);
  const history=db.contact_attribution_history ||= [];
  for(const evidence of args.p_evidences)if(!history.some(row=>row.cliente_id===args.p_cliente_id&&row.from_jid===args.p_from_jid&&row.event_key===evidence.event_key))history.push({...structuredClone(evidence),cliente_id:args.p_cliente_id,from_jid:args.p_from_jid});
  return {data:structuredClone(current),error:null};
}, from(table) {
  let filters = [], single = false, action = '', values, projection = '', take = Infinity, orders = [];
  const field = (row, key) => key.startsWith('raw_payload->>') ? row.raw_payload?.[key.slice('raw_payload->>'.length)] : row[key];
  const q = {
    select(columns = '') { projection = columns; return q; }, eq(k, v) { filters.push((r) => field(r,k) === v); return q; },
    is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
    in(k, v) { filters.push((r) => v.includes(r[k])); return q; }, neq() { return q; },
    or() { return q; }, order(key,{ascending=true}={}) { orders.push({key,ascending});return q; }, limit(size) { take = size; return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    insert(v) { action = 'insert'; values = v; return q; }, upsert(v) { action = 'upsert'; values = v; return q; },
    update(v) { action = 'update'; values = v; return q; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (table === 'cliente_whatsapp_contact' && !action) {
        db.contactReads = (db.contactReads || 0) + 1;
        if (db.failContactRead === true || db.failContactRead === db.contactReads) return {data:null,error:{message:'fixture contact read error'}};
      }
      const all = db[table] ||= [];
      let rows = all.filter((r) => filters.every((f) => f(r)));
      if (action === 'insert' || action === 'upsert') {
        const existing = action === 'upsert' ? all.find((r) => r.cliente_id === values.cliente_id &&
          (values.from_jid ? r.from_jid === values.from_jid : values.message_id ? r.message_id === values.message_id : false)) : null;
        const row = existing || { id: `${table}-${all.length}`,created_at:new Date().toISOString() };
        Object.assign(row, values); if (!existing) all.push(row); rows = [row];
      } else if (action === 'update') {
        rows.forEach((r) => Object.assign(r, values));
        if (table === 'cliente_rastreamento_link_clicks' && rows.length && db.attributionDuringClaim) {
          Object.assign(db.cliente_whatsapp_contact[0], db.attributionDuringClaim);
        }
      }
      if (!action) rows = rows.toSorted((a,b)=>{for(const {key,ascending} of orders){const diff=String(field(a,key)||'').localeCompare(String(field(b,key)||''));if(diff)return ascending?diff:-diff;}return 0;}).slice(0,take);
      if (projection.includes('raw_payload->>')) rows = rows.map(row => Object.fromEntries(projection.split(',').map(column => { const [alias,path] = column.split(':'); return [alias,field(row,path || alias)]; })));
      return { data: structuredClone(single ? rows[0] || null : rows), error: null };
    }).then(resolve, reject); },
  }; return q;
} };
globalThis.__fixtureConversion = (options) => { conversions.push(options); return Promise.resolve(); };

const stubs = {
  'miniCrmMessageRunner.js': 'export const runMiniCrmMessage = options => globalThis.__captureMiniRule(options);',
  'server.ts': 'export const serve = handler => { globalThis.__fixtureHandler = handler; };',
  'supabase-js@2': 'export const createClient = () => globalThis.__fixtureClient;',
  'persistAdThumbnail.ts': 'export const attachStoredThumbnail = async (_, tracking) => tracking;',
  'applyRastreamentoConversion.ts': 'export const extractChatLabelsFromPayload = () => []; export const applyRastreamentoConversionFromWebhook = options => globalThis.__fixtureConversion(options);',
  'lojaIaAutoReply.ts': 'export const ensureLojaAtendConversa = async () => null; export const maybeLojaIaAutoReply = async () => null;',
  'googleAdsClickConversion.ts': 'export const maybeSendGoogleLeadSubmitted = async () => null;',
};
const plugin = { name: 'isolated-transports', setup(builder) {
  builder.onResolve({ filter: /.*/ }, (args) => {
    const key = Object.keys(stubs).find((suffix) => args.path.endsWith(suffix));
    return key ? { path: key, namespace: 'stub' } : null;
  });
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }));
} };
let cases = 0;
const directory = await mkdtemp(join(tmpdir(), 'planeje-utm-webhook-'));
try {
  for (const route of ['uazapi-inbox-webhook', 'crm-ingress-webhook']) {
    const built = await build({ entryPoints: [`supabase/functions/${route}/index.ts`], bundle: true,
      platform: 'node', format: 'esm', write: false, plugins: [plugin], logLevel: 'silent' });
    const compiled = join(directory, route + '.mjs');
    await writeFile(compiled, built.outputFiles[0].text);
    await import(pathToFileURL(compiled).href);
    for (const scenario of ['new', 'metadata', 'ambiguous', 'existing-meta', 'different-text', 'team']) {
      db = { clientes: [{ id: client, ingress_webhook_secret: 'fixture-secret' }],
        cliente_whatsapp_config: [{ id: channel, cliente_id: client, webhook_secret: 'fixture-secret', name: 'Canal' }],
        cliente_rastreamento_links: scenario === 'ambiguous' ? [link, { ...link, id: 'duplicate' }] : [link],
        cliente_whatsapp_contact: ['metadata','team'].includes(scenario) ? [{ id: 'existing', cliente_id: client, from_jid: jid,
          origin_source: 'nao_identificado', tracking_data: { owner_phone: '5511999999999', analysis_labels: ['keep'] } }]
          : scenario === 'existing-meta' ? [{ id: 'existing', cliente_id: client, from_jid: jid, origin_source: 'meta_ads', tracking_data: { ctwaClid: 'real-click' } }] : [],
      }; conversions = []; outbound = []; ruleCalls = [];
      let body = route === 'uazapi-inbox-webhook'
        ? { event: 'messages', chatid:jid, messageid:'3EB0ABCDEFABCDEFABCDEFA', message: { chatid: jid, sender: jid, text: scenario === 'different-text' ? 'Olá, tudo bem?' : message,
          messageid: '3EB0ABCDEFABCDEFABCDEFA', type: 'text', fromMe: false }, owner: '5511999999999' }
        : { planeje_ingress:true, phone: '5511987654321', message: scenario === 'different-text' ? 'Olá, tudo bem?' : message,
          message_id: '3EB0ABCDEFABCDEFABCDEFA', name: 'Contato de teste', timestamp: '2026-10-14T15:00:00Z' };
      if(scenario==='team') body=route==='uazapi-inbox-webhook'?{...body,fromMe:true,message:{...body.message,fromMe:true}}:{eventType:'AGENT_MESSAGE_SENDED',userPhoneNumber:'5511987654321',agentResponse:message,messageId:'3EB0ABCDEFABCDEFABCDEFA',createdAt:'2026-10-14T15:00:00Z'};
      const req = new Request(`https://fixture.invalid/${route}?cliente_id=${client}&channel_id=${channel}&secret=fixture-secret`, {
        method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
      });
      const response = await globalThis.__fixtureHandler(req);
      assert.equal(response.status, 200, `${route} / ${scenario}: ${await response.text()}`);
      assert.equal(ruleCalls.length,1,`${route}: rule runner awaited once`);
      const rule=ruleCalls[0];assert.equal(rule.clienteId,client);assert.equal(rule.jid,jid);assert.equal(rule.event.channel,channel);assert.equal(rule.event.fromMe,scenario==='team');assert.equal(rule.event.messageId,'3EB0ABCDEFABCDEFABCDEFA');assert.equal(rule.event.text,scenario === 'different-text' ? 'Olá, tudo bem?' : message);
      const contact = db.cliente_whatsapp_contact.find((r) => r.from_jid === jid);
      assert.ok(contact, `${route} / ${scenario}: contact missing`);
      if (['new', 'metadata'].includes(scenario)) {
        assert.equal(contact.utm_source, 'Linktree', `${route} / ${scenario}`);
        assert.equal(contact.utm_campaign, 'visitas_ao_perfil');
        assert.equal(contact.tracking_data.planeje_link_match_method, 'initial_message');
        assert.equal(contact.tracking_data.planeje_click_id, undefined);
        assert.equal(contact.tracking_data.ctwaClid, undefined);
        if (scenario === 'metadata') assert.deepEqual(contact.tracking_data.analysis_labels, ['keep']);
      } else if (scenario === 'existing-meta') {
        assert.equal(contact.tracking_data.ctwaClid, 'real-click');
        assert.equal(contact.utm_source ?? null, null);
      } else assert.equal(contact.utm_source ?? null, null);
      assert.ok(outbound.every((url) => ['fixture.invalid', '127.0.0.1'].includes(new URL(url).hostname)),
        `${route}: unexpected transport destination`);
      cases++;
    }
  }
  for (const scenario of ['incoming','echo','historical','status','missing-id','missing-time','echo-missing-id','echo-missing-time','other-number','batch','unknown-team','template','interactive']) {
    db = { clientes:[{id:client,ingress_webhook_secret:'fixture-secret'}], cliente_whatsapp_config:[],
      cliente_whatsapp_contact:scenario==='unknown-team'?[]:[{id:'existing',cliente_id:client,from_jid:jid,last_message_at:'2026-10-20T10:00:00Z',mini_crm:{status:'Novo Lead'}}] };
    conversions=[];outbound=[];ruleCalls=[];
    const echo=['echo','historical','unknown-team','template','interactive','echo-missing-id','echo-missing-time'].includes(scenario);
    const meta = {id:'wamid.fixture',timestamp:String(Math.floor(Date.now()/1000)),type:'text',
      ...(echo?{from:'5511999999999',to:'5511987654321'}:{from:'5511987654321'}), text:{body:'Olá, vamos agendar?' }};
    if(scenario.endsWith('missing-id'))delete meta.id;
    if(scenario.endsWith('missing-time'))delete meta.timestamp;
    if(scenario==='template'){meta.type='template';meta.template={name:'agendamento',f3_rendered_text:'Agendado amanhã às 15h'};delete meta.text;}
    if(scenario==='interactive'){meta.type='interactive';meta.interactive={body:{text:'Agendado amanhã às 15h'},footer:{text:'Até lá'}};delete meta.text;}
    const value={metadata:{display_phone_number:scenario==='other-number'?'5511888888888':'5511999999999',phone_number_id:scenario==='other-number'?'222222':'111111'},
      contacts:[{wa_id:'5511987654321',profile:{name:'Pessoa fictícia'}}],
      [scenario==='status'?'statuses':echo?'message_echoes':'messages']:[meta]};
    if(scenario==='batch')value.messages.push({...meta,id:'wamid.second'});
    const body={object:'whatsapp_business_account',entry:[{changes:[{field:scenario==='status'?'messages':echo?'smb_message_echoes':'messages',value}]}],f3_mirror:{historical:scenario==='historical'}};
    const response=await globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(body)}));
    assert.equal(response.status,200,`Meta / ${scenario}`);
    if(['historical','status','missing-id','missing-time','echo-missing-id','echo-missing-time','unknown-team'].includes(scenario))assert.equal(ruleCalls.length,0,scenario+' must not run automation');
    else {
      assert.equal(ruleCalls.length,scenario==='batch'?2:1,scenario);
      assert.equal(ruleCalls[0].event.channel,scenario==='other-number'?'ingress:meta_cloud:222222':'ingress:meta_cloud:111111');
      assert.equal(ruleCalls[0].event.fromMe,echo);assert.equal(ruleCalls[0].jid,jid);
      if(['template','interactive'].includes(scenario))assert.match(ruleCalls[0].event.text,/Agendado amanhã às 15h/);
    }
    if(echo){assert.equal(conversions.length,0);assert.equal(outbound.length,0);assert.equal((db.cliente_whatsapp_inbox||[]).length,0);}
    if(scenario==='unknown-team')assert.equal(db.cliente_whatsapp_contact.length,0);
    if(['historical','echo-missing-id','echo-missing-time'].includes(scenario))assert.equal(db.cliente_whatsapp_contact[0].last_message_at,'2026-10-20T10:00:00Z');
    if(!['status','missing-id','missing-time','echo-missing-id','echo-missing-time'].includes(scenario))assert.ok(db.mini_crm_message_sources?.some(r=>r.id=== (scenario==='other-number'?'ingress:meta_cloud:222222':'ingress:meta_cloud:111111')));
    cases++;
  }
  // Real Chatvolt handler with no configured number: identify each click, never guess from the greeting.
  for (const scenario of ['first', 'second', 'duplicate', 'foreign-client', 'claimed', 'ctwa', 'existing-attribution', 'concurrent-attribution', 'team', 'malformed', 'conflicting', 'truncated-conflict', 'legacy-literal', 'legacy-placeholder']) {
    const clicks = ['PJ-ABC234', 'PJ-XYZ789'].map((match_code, index) => ({ id: `click-${index}`, link_id: link.id,
      cliente_id: client, match_code, origin_resolved: 'google_ads', gclid: `fixture-gclid-${index}`,
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: `fixture-campaign-${index}`,
      utm_content: `fixture-content-${index}`, utm_term: `fixture-term-${index}`, matched_at: null }));
    const index = scenario === 'second' ? 1 : 0;
    if (scenario === 'foreign-client') clicks[0].cliente_id = 'other-client';
    if (scenario === 'claimed') Object.assign(clicks[0], { matched_at: '2026-10-01T12:00:00Z', matched_from_jid: '5511000000003@s.whatsapp.net' });
    db = { clientes: [{ id: client, ingress_webhook_secret: 'fixture-secret' }], cliente_whatsapp_config: [],
      cliente_rastreamento_link_clicks: clicks,
      cliente_whatsapp_contact: scenario === 'existing-attribution' ? [{ id: 'existing', cliente_id: client, from_jid: jid,
        origin_source: 'meta_ads', utm_source: 'keep-source', tracking_data: { ctwaClid: 'keep-ctwa' } }] : [] };
    if (scenario === 'concurrent-attribution') {
      db.cliente_whatsapp_contact = [{id:'existing',cliente_id:client,from_jid:jid,origin_source:'nao_identificado',tracking_data:null}];
      db.attributionDuringClaim = {origin_source:'meta_ads',utm_source:'keep-source',tracking_data:{ctwaClid:'keep-ctwa'}};
    }
    conversions = []; outbound = []; ruleCalls = [];
    const legacy = scenario === 'legacy-literal' ? ' PJ-OLD234' : scenario === 'legacy-placeholder' ? ' {codigo}' : '';
    const opts = { initialMessage: `${message}${legacy} {codigo_oculto}`, appendMatchCode: false };
    const url = buildWaMeRedirectUrl('5511000000001', clicks[index].match_code, opts);
    let text = new URL(url).searchParams.get('text');
    if (scenario === 'malformed') text = text.slice(0, -1);
    if (scenario === 'conflicting') text += '\n' + new URL(buildWaMeRedirectUrl('5511000000001', clicks[1].match_code, opts)).searchParams.get('text');
    if (scenario === 'truncated-conflict') text += '\n' + new URL(buildWaMeRedirectUrl('5511000000001', clicks[1].match_code, opts)).searchParams.get('text').replace('\u2060', '');
    const body = { eventType: scenario === 'team' ? 'AGENT_MESSAGE_FOLLOW_UP' : 'USER_MESSAGE_RECEIVED',
      userPhoneNumber: '5511987654321', userMessage: text, agentResponse: text,
      messageId: `fixture-hidden-${scenario}`, createdAt: '2026-10-27T12:00:00Z', channel: 'whatsapp',
      ...(scenario === 'ctwa' ? { ctwaAttributions: [{ ctwaClid: 'fixture-ctwa', sourceId: 'fixture-ad' }] } : {}) };
    const send = () => globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,
      { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
    const response = await send();
    assert.equal(response.status, 200, `hidden / ${scenario}: ${await response.text()}`);
    const contact = db.cliente_whatsapp_contact.find(row => row.from_jid === jid);
    if (['first', 'second', 'duplicate', 'legacy-literal', 'legacy-placeholder'].includes(scenario)) {
      assert.equal(contact.origin_source, 'google_ads', scenario);
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) assert.equal(contact[key], clicks[index][key], scenario + ': ' + key);
      assert.equal(contact.tracking_data.gclid, clicks[index].gclid);
      assert.equal(contact.tracking_data.planeje_click_id, clicks[index].id);
      assert.equal(clicks[index].matched_from_jid, jid);
      assert.equal(clicks[1 - index].matched_at, null);
      if (scenario === 'duplicate') {
        const claimedAt = clicks[0].matched_at;
        assert.equal((await send()).status, 200);
        assert.equal(clicks[0].matched_at, claimedAt, 'same sender retry keeps the original claim');
        assert.equal(db.cliente_whatsapp_contact.length, 1);
        assert.equal(db.cliente_whatsapp_contact[0].tracking_data.planeje_click_id, clicks[0].id);
      }
    } else if (['existing-attribution','concurrent-attribution'].includes(scenario)) {
      assert.equal(contact.origin_source, 'meta_ads');
      assert.equal(contact.utm_source, 'keep-source');
      assert.equal(contact.tracking_data.ctwaClid, 'keep-ctwa');
      assert.equal(contact.tracking_data.planeje_click_id, undefined);
    } else if (scenario === 'ctwa') {
      assert.equal(contact.tracking_data.ctwaClid, 'fixture-ctwa');
      assert.equal(contact.tracking_data.planeje_click_id, undefined);
      assert.equal(clicks[0].matched_at, null, 'CTWA does not consume a tracked click');
    } else {
      assert.equal(contact?.tracking_data?.planeje_click_id, undefined, scenario);
      assert.equal(contact?.utm_source ?? null, null, scenario);
      if (scenario !== 'claimed') assert.equal(clicks[0].matched_at, null, scenario);
    }
    assert.ok(outbound.every(url => ['fixture.invalid', '127.0.0.1'].includes(new URL(url).hostname)), 'no real transport');
    cases++;
  }
  // The code and phone can arrive in separate events of one authenticated Chatvolt conversation.
  for (const scenario of ['code-first','phone-first','simultaneous','simultaneous-phone-first','site','duplicate','other-conversation','other-org','conflicting-phone','existing-meta','concurrent-attribution','missing-org']) {
    const org = 'org-fixture', conversationId = 'conversation-fixture';
    const click = { id:'split-click',link_id:link.id,cliente_id:client,match_code:'PJ-ABC234',origin_resolved:scenario==='site'?'site':'google_ads',
      gclid:scenario==='site'?null:'fixture-gclid',utm_source:scenario==='site'?null:'google',utm_medium:scenario==='site'?null:'cpc',utm_campaign:scenario==='site'?null:'fixture-campaign',matched_at:null };
    db = {clientes:[{id:client,ingress_webhook_secret:'fixture-secret'}],cliente_whatsapp_config:[],cliente_rastreamento_link_clicks:[click],
      cliente_whatsapp_contact:scenario==='existing-meta'?[{id:'existing',cliente_id:client,from_jid:jid,sender_name:'Nome existente',origin_source:'meta_ads',tracking_data:{ctwaClid:'keep'}}]:[]};
    if (scenario === 'concurrent-attribution') {
      db.cliente_whatsapp_contact = [{id:'existing',cliente_id:client,from_jid:jid,origin_source:'nao_identificado',tracking_data:null}];
      db.attributionDuringClaim = {origin_source:'meta_ads',tracking_data:{ctwaClid:'keep'}};
    }
    conversions=[];outbound=[];ruleCalls=[];
    const initial = { eventType:'AGENT_USER_MESSAGE',channel:'whatsapp',organizationId:org,conversationId,messageId:'split-initial',
      userMessage:new URL(buildWaMeRedirectUrl('5511000000001',click.match_code,{initialMessage:message+' {codigo_oculto}'})).searchParams.get('text') };
    const identified = { eventType:'USER_MESSAGE_RECEIVED',channel:'whatsapp',organizationId:org,conversationId,messageId:'split-identified',userPhoneNumber:'5511987654321',userName:'Contato fictício',userMessage:'Quero este produto' };
    if(scenario==='other-conversation')initial.conversationId='another-conversation';
    if(scenario==='other-org')initial.organizationId='another-org';
    if(scenario==='missing-org'){delete initial.organizationId;delete identified.organizationId;}
    if(scenario==='conflicting-phone')db.cliente_whatsapp_webhook_log=[{cliente_id:client,source:'chatvolt',from_jid:jid,raw_payload:{...identified,messageId:'known-phone'}},{cliente_id:client,source:'chatvolt',from_jid:'5511000000002@s.whatsapp.net',raw_payload:{...identified,userPhoneNumber:'5511000000002',messageId:'foreign-phone'}}];
    const send = body => globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}));
    if(scenario.startsWith('simultaneous'))assert.ok((await Promise.all((scenario==='simultaneous'?[initial,identified]:[identified,initial]).map(send))).every(response=>response.status===200));
    else for(const body of scenario==='phone-first'?[identified,initial]:[initial,identified])assert.equal((await send(body)).status,200);
    const contact=db.cliente_whatsapp_contact.find(c=>c.from_jid===jid);
    assert.ok(contact,scenario);
    if(['code-first','phone-first','simultaneous','simultaneous-phone-first','site','duplicate'].includes(scenario)){
      assert.equal(contact.origin_source,click.origin_resolved,scenario);
      assert.equal(contact.tracking_data.planeje_click_id,click.id,scenario);
      assert.equal(contact.tracking_data.gclid??null,click.gclid,scenario);
      assert.equal(click.matched_from_jid,jid,scenario);
      if(scenario==='phone-first'||scenario.startsWith('simultaneous'))assert.equal(contact.sender_name,'Contato fictício','recovered anonymous event must preserve the known name');
      if(scenario==='duplicate'){
        const claimedAt=click.matched_at;assert.equal((await send(identified)).status,200);assert.equal(click.matched_at,claimedAt);assert.equal(db.cliente_whatsapp_contact.length,1);
      }
    }else{
      assert.equal(contact.tracking_data?.planeje_click_id,undefined,scenario);
      if(['existing-meta','concurrent-attribution'].includes(scenario)){
        assert.equal(click.matched_from_jid,jid);
        assert.ok(db.contact_attribution_history.some(row=>row.attribution.planeje_click_id===click.id),'return evidence stays separate from the principal CTWA');
      }
      else assert.equal(click.matched_at,null,scenario);
      if(['existing-meta','concurrent-attribution'].includes(scenario))assert.equal(contact.tracking_data.ctwaClid,'keep');
    }
    assert.ok(outbound.every(url=>new URL(url).hostname==='fixture.invalid'));
    cases++;
  }
  for (const failContactRead of [1,2]) {
    const protectedContact = {id:'protected',cliente_id:client,from_jid:jid,sender_name:'Nome protegido',profile_pic_url:'https://fixture.invalid/avatar.png',origin_source:'meta_ads',tracking_data:{ctwaClid:'keep'}};
    const initial = {eventType:'AGENT_USER_MESSAGE',channel:'whatsapp',organizationId:'org-fixture',conversationId:'conversation-fixture',messageId:'read-error-initial',userMessage:new URL(buildWaMeRedirectUrl('5511000000001','PJ-ABC234',{initialMessage:message+' {codigo_oculto}'})).searchParams.get('text')};
    db={failContactRead,clientes:[{id:client,ingress_webhook_secret:'fixture-secret'}],cliente_whatsapp_config:[],cliente_whatsapp_contact:[structuredClone(protectedContact)],
      cliente_rastreamento_link_clicks:[{id:'retry-click',cliente_id:client,link_id:link.id,match_code:'PJ-ABC234',origin_resolved:'google_ads',gclid:'fixture-retry-gclid',clicked_at:'2026-10-27T12:00:00Z',matched_at:null}],
      cliente_whatsapp_webhook_log:[{cliente_id:client,source:'chatvolt',from_jid:jid,raw_payload:{...initial,eventType:'USER_MESSAGE_RECEIVED',messageId:'known',userPhoneNumber:'5511987654321',userMessage:'Produto'}}]};
    conversions=[];outbound=[];ruleCalls=[];
    const response=await globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(initial),headers:{'Content-Type':'application/json'}}));
    assert.equal(response.status,500,'recovered identity read failure must permit a provider retry');
    assert.deepEqual(db.cliente_whatsapp_contact,[protectedContact],'failed read of the recovered identity must not erase contact data');
    assert.equal(conversions.length,0);assert.equal(ruleCalls.length,0);assert.equal(outbound.length,0);
    assert.equal((db.contact_attribution_history||[]).length,0);
    if(failContactRead===2)assert.equal(db.cliente_rastreamento_link_clicks[0].matched_from_jid,jid,'second read can fail after a successful claim');
    db.failContactRead=false;
    const retried=await globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(initial),headers:{'Content-Type':'application/json'}}));
    assert.equal(retried.status,200);assert.equal(db.contact_attribution_history.length,1);
    assert.equal(db.cliente_whatsapp_contact[0].tracking_data.ctwaClid,'keep');
    assert.equal(db.cliente_whatsapp_contact[0].sender_name,'Nome protegido');
    cases++;
  }
  for(const route of ['crm-ingress-webhook','uazapi-inbox-webhook','apicebot-inbox-webhook']) {
    const built=await build({entryPoints:[`supabase/functions/${route}/index.ts`],bundle:true,platform:'node',format:'esm',write:false,plugins:[plugin],logLevel:'silent'});
    const compiled=join(directory,'history-'+route+'.mjs');await writeFile(compiled,built.outputFiles[0].text);await import(pathToFileURL(compiled).href);
    db={clientes:[{id:client,ingress_webhook_secret:'fixture-secret'}],cliente_whatsapp_config:[{id:channel,cliente_id:client,webhook_secret:'fixture-secret'}],cliente_whatsapp_contact:[],
      cliente_rastreamento_link_clicks:['PJ-ABC234','PJ-XYZ789'].map((match_code,index)=>({id:'history-click-'+index,cliente_id:client,link_id:link.id,match_code,origin_resolved:index?'meta_ads':'google_ads',gclid:index?null:'fixture-gclid',fbclid:index?'fixture-fbclid':null,utm_campaign:index?'B':'A',clicked_at:`2026-10-${27+index}T12:00:00Z`,matched_at:null}))};
    conversions=[];outbound=[];ruleCalls=[];
    const body=index=>{
      const text=new URL(buildWaMeRedirectUrl('5511000000001',db.cliente_rastreamento_link_clicks[index].match_code,{initialMessage:message+' {codigo_oculto}'})).searchParams.get('text');
      if(route==='crm-ingress-webhook')return {eventType:'USER_MESSAGE_RECEIVED',channel:'whatsapp',userPhoneNumber:'5511987654321',userMessage:text,messageId:'history-'+index,createdAt:`2026-10-${27+index}T12:01:00Z`};
      if(route==='apicebot-inbox-webhook')return {phone:'5511987654321',message:text,id:'history-'+index,timestamp:`2026-10-${27+index}T12:01:00Z`};
      return {event:'messages',chatid:jid,messageid:'history-'+index,message:{chatid:jid,sender:jid,text,messageid:'history-'+index,type:'text',fromMe:false},owner:'5511999999999',timestamp:1793102460+index*86400};
    };
    const send=value=>globalThis.__fixtureHandler(new Request(`https://fixture.invalid/${route}?cliente_id=${client}&channel_id=${channel}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(value),headers:{'Content-Type':'application/json'}}));
    assert.equal((await send(body(0))).status,200,route);
    db.cliente_whatsapp_contact[0].sender_name='Nome preservado';
    for(const index of [1,1])assert.equal((await send(body(index))).status,200,route);
    assert.equal(db.cliente_whatsapp_contact[0].sender_name,'Nome preservado',route+': message without name must preserve the known name');
    assert.equal(db.cliente_whatsapp_contact[0].utm_campaign,'A',route+': first origin stays principal');
    assert.equal(db.contact_attribution_history?.length,2,route+': both days retained; retry deduped');
    assert.equal(db.contact_attribution_history[1].attribution.fbclid,'fixture-fbclid');
    assert.equal(db.contact_attribution_history[0].clicked_at,'2026-10-27T12:00:00.000Z');
    db.failPersist=true;conversions=[];ruleCalls=[];outbound=[];
    assert.equal((await send(body(1))).status,500,route+': failed history must not acknowledge success');
    assert.equal(conversions.length,0);assert.equal(ruleCalls.length,0);
    assert.ok(outbound.every(url=>!url.includes('create-lead-from-contact')));
    cases++;
  }
  {
    const built=await build({entryPoints:['supabase/functions/crm-ingress-webhook/index.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[plugin],logLevel:'silent'});
    const compiled=join(directory,'chatvolt-returns.mjs');await writeFile(compiled,built.outputFiles[0].text);await import(pathToFileURL(compiled).href);
    db={clientes:[{id:client,ingress_webhook_secret:'fixture-secret'}],cliente_whatsapp_config:[],cliente_whatsapp_contact:[],
      cliente_rastreamento_link_clicks:['PJ-ABC234','PJ-XYZ789'].map((match_code,index)=>({id:'return-click-'+index,cliente_id:client,link_id:link.id,match_code,origin_resolved:'google_ads',gclid:'return-gclid-'+index,utm_campaign:index?'Return B':'First A',clicked_at:`2026-10-${27+index}T12:00:00Z`,matched_at:null}))};
    conversions=[];outbound=[];ruleCalls=[];
    const initial=index=>({eventType:'AGENT_USER_MESSAGE',channel:'whatsapp',organizationId:'org-fixture',conversationId:'return-conversation',messageId:'return-'+index,
      userMessage:new URL(buildWaMeRedirectUrl('5511000000001',db.cliente_rastreamento_link_clicks[index].match_code,{initialMessage:message+' {codigo_oculto}'})).searchParams.get('text')});
    const identified={eventType:'USER_MESSAGE_RECEIVED',channel:'whatsapp',organizationId:'org-fixture',conversationId:'return-conversation',messageId:'known-return',userPhoneNumber:'5511987654321',userName:'Nome preservado',userMessage:'Quero mais informações'};
    const send=value=>globalThis.__fixtureHandler(new Request(`https://fixture.invalid/crm-ingress-webhook?cliente_id=${client}&secret=fixture-secret`,{method:'POST',body:JSON.stringify(value),headers:{'Content-Type':'application/json'}}));
    for(const value of [initial(0),initial(1),identified])assert.equal((await send(value)).status,200);
    assert.equal(db.cliente_whatsapp_contact[0].utm_campaign,'First A');
    assert.equal(db.contact_attribution_history.length,2,'two distinct anonymous messages bind their individual evidence');
    assert.deepEqual(new Set(db.contact_attribution_history.map(row=>row.event_key)),new Set(['click:return-click-0','click:return-click-1']));
    assert.equal((await send(initial(1))).status,200);
    assert.equal(db.cliente_whatsapp_contact[0].utm_campaign,'First A');assert.equal(db.cliente_whatsapp_contact[0].sender_name,'Nome preservado');
    assert.equal(db.contact_attribution_history.length,2,'new event does not rewrite the previous entry');
    cases++;
  }
  console.log(`PASS ${cases} webhook-to-rule integration cases`);
} catch (error) {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }
