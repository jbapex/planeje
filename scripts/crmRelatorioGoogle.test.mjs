import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildGoogleReportRows, summarizeGoogleReport, fetchGoogleTrackingReport } from '../src/lib/crmRelatorioGoogle.js';

const period={since:'2026-10-01',until:'2026-10-28'};
const contact=(id,extra={})=>({id,phone:`5511000000${id}`,sender_name:`Contato ${id}`,origin_source:'google_ads',first_seen_at:'2026-10-01T03:00:00Z',last_message_at:'2026-10-28T18:00:00Z',utm_campaign:'Busca',...extra});
const contacts=[contact('01',{qualificado:true,comprou:true,valor_venda:100}),contact('02',{origin_source:'site',utm_source:'chatgpt.com'}),contact('03',{origin_source:'meta_ads'}),contact('04',{origin_source:'nao_identificado',tracking_data:{gclid:'fixture-click'},first_seen_at:'2026-09-30T18:00:00Z'}),contact('05',{last_message_at:'2026-10-29T03:00:00Z'})];
const leads=[{id:'l1',whatsapp:contacts[0].phone,utm_source:'google',qualificado:false,comprou:false,valor:200},{id:'l2',whatsapp:'5511888888888',utm_source:'google',utm_campaign:'Busca',created_at:'2026-10-20T15:00:00Z',tracking_data:{}}];
const before=JSON.stringify({contacts,leads});
const data=buildGoogleReportRows(contacts,leads,period);
assert.equal(data.rows.length,3,'only Google; contact + linked lead count once');
assert.equal(data.trackingRows.length,2,'first message cohort differs from last activity cohort');
assert.equal(data.rows[0].qualificado,false,'commercial linked lead has priority');
assert.equal(data.rows[0].comprou,false);
assert.equal(JSON.stringify({contacts,leads}),before);
assert.equal(buildGoogleReportRows([contact('90',{tracking_data:{fbclid:'later-meta'}})],[],period).rows.length,1,'first known Google origin remains primary');
assert.equal(buildGoogleReportRows([contact('91',{origin_source:'site',tracking_data:{gclid:'later-google'}})],[],period).rows.length,0,'later Google signal cannot replace the first Site origin');
assert.equal(buildGoogleReportRows([],[{id:'imported',whatsapp:'5511777777777',origem:'Google Ads',created_at:'2026-10-20T15:00:00Z'}],period).rows.length,1);
const spend={available:true,currency:'BRL',message:'',campaigns:[{id:'10',accountId:'123',name:'Busca',spend:60,currency:'BRL'}]};
const report=summarizeGoogleReport(data,spend);
assert.equal(report.summary.leads,3);assert.equal(report.summary.vendas,0);assert.equal(report.summary.spend,60);assert.equal(report.summary.cpl,20);
assert.equal(report.rows.length,3);assert.equal(report.campaigns.find(row=>row.name==='Busca').leads,3);
assert.equal(summarizeGoogleReport(buildGoogleReportRows([contact('11',{utm_campaign:null})],[],period),spend).campaigns.find(row=>row.name==='Sem campanha identificada').spend,null);
const ambiguous={...spend,campaigns:[...spend.campaigns,{id:'20',accountId:'456',name:'Busca',spend:90,currency:'BRL'}]};
assert.equal(summarizeGoogleReport(data,ambiguous).campaigns.find(row=>row.key==='utm:Busca').spend,null,'do not split cost by an ambiguous campaign name');
assert.equal(summarizeGoogleReport(data,{...spend,available:false,message:'Falha'}).summary.spend,null);
assert.equal(summarizeGoogleReport(data,{...spend,currency:'USD'}).summary.roas,null,'no ROAS comparing USD spend with BRL sales');
const idRow=buildGoogleReportRows([contact('12',{utm_campaign:'10'})],[],period);
assert.equal(summarizeGoogleReport(idRow,spend).campaigns.find(row=>row.key==='123:10').leads,1);
const filtered=summarizeGoogleReport(data,spend,'123:10');assert.equal(filtered.summary.leads,3);assert.equal(filtered.summary.spend,60);

let requests=[];let failTable='',failAccount='',differentCurrency=false;
const fixtureContacts=Array.from({length:1001},(_,i)=>contact(String(i).padStart(4,'0')));
const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init={})=>{
 const url=new URL(input);requests.push({url,method:init.method||'GET'});assert.equal(url.hostname,'fixture.invalid');
 const table=url.pathname.split('/').at(-1);
 if(url.pathname.includes('/rest/v1/')) {
  assert.equal(init.method,'GET');assert.equal(url.searchParams.get('cliente_id'),'eq.fixture-client');
  if(table===failTable)return new Response(JSON.stringify({message:'Fixture failure'}),{status:500});
  if(table==='cliente_google_ads_accounts') {assert.equal(url.searchParams.get('is_active'),'eq.true');return new Response(JSON.stringify([{cliente_id:'fixture-client',google_customer_id:'123'},{cliente_id:'fixture-client',google_customer_id:'456'}]),{headers:{'Content-Type':'application/json'}});}
  const all=table==='cliente_whatsapp_contact'?fixtureContacts:[];
  const offset=Number(url.searchParams.get('offset')||0),limit=Math.min(Number(url.searchParams.get('limit')||500),200);
  const rows=all.slice(offset,offset+limit);
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json','Content-Range':`${offset}-${offset+rows.length-1}/${all.length}`}});
 }
 assert.equal(table,'google-ads-api');const body=JSON.parse(init.body);assert.equal(body.action,'get-campaigns');assert.deepEqual(body.time_range,period);assert.ok(['123','456'].includes(body.customerId));
 return new Response(JSON.stringify(body.customerId===failAccount?{error:{message:'Account failed'}}:{campaigns:[{id:'10',name:'Busca',spend:30}],currency:differentCurrency&&body.customerId==='456'?'USD':'BRL'}),{headers:{'Content-Type':'application/json'}});
}}});
const loaded=await fetchGoogleTrackingReport(client,{clienteId:'fixture-client',...period});
assert.equal(loaded.rows.length,1001,'handle lower server page cap without truncation');assert.equal(loaded.spending.available,true);assert.equal(loaded.spending.campaigns.length,2);
failAccount='456';assert.equal((await fetchGoogleTrackingReport(client,{clienteId:'fixture-client',...period})).spending.available,false);
failAccount='';differentCurrency=true;assert.equal((await fetchGoogleTrackingReport(client,{clienteId:'fixture-client',...period})).spending.available,false);
differentCurrency=false;failTable='cliente_whatsapp_contact';await assert.rejects(fetchGoogleTrackingReport(client,{clienteId:'fixture-client',...period}));
const n=requests.length;await assert.rejects(fetchGoogleTrackingReport(client,{clienteId:'',...period}));assert.equal(requests.length,n);
console.log('PASS Google reports: attribution, periods, deduplication, exact campaign links, currency/errors and tenant-scoped complete pagination');
