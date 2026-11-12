import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react'), { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'attribution-ui-'));
after(() => rm(scratch, { recursive: true, force: true }));
const files = {
  '@/lib/customSupabaseClient': 'export const supabase=new Proxy({}, {get:(_,key)=>globalThis.__attribution.db[key]});',
  '@/components/ui/dialog': 'export const Dialog=({children})=><div>{children}</div>; export const DialogContent=Dialog; export const DialogTitle=({children})=><h2>{children}</h2>; export const DialogDescription=({children})=><p>{children}</p>;',
  '@/components/crm/RastreamentoLeadFicha': 'export default function Ficha(){return <p>Ficha aberta</p>}',
};
await build({ entryPoints: ['src/components/gestor-ia/GestorIaRoutineLeads.jsx'], outfile: path.join(scratch, 'ui.cjs'), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react','react/jsx-runtime'], nodePaths: [path.join(qa,'node_modules')],
  plugins: [{ name: 'isolated', setup(b) {
    b.onResolve({filter:/.*/}, a => files[a.path] ? {path:a.path,namespace:'fixture'} : null);
    b.onLoad({filter:/.*/,namespace:'fixture'}, a => ({contents:files[a.path],loader:'jsx'}));
    b.onResolve({filter:/customSupabaseClient/},()=>({path:'@/lib/customSupabaseClient',namespace:'fixture'}));
    b.onResolve({filter:/^@\//}, ({path:f}) => { const target=path.resolve('src',f.slice(2)); return {path:existsSync(target)?target:existsSync(target+'.jsx')?target+'.jsx':target+'.js'}; });
  } }],
});
const Page = require(path.join(scratch,'ui.cjs')).default;
const row = { id:'row-a', platform:'meta', account_id:'act_10', campaign_id:'20', campaign_name:'Campanha A', adset_id:'30', adset_name:'Conjunto A', spend:120 };
const names = { meta_ad_details:{ ad:{ campaign:{name:'Campanha A'},adset:{name:'Conjunto A'},name:'Criativo A' } } };
const contacts = [
  { id:'new', first_seen_at:'2026-11-10T12:00:00Z',sender_name:'Pessoa nova',tracking_data:names,mini_crm:{status:'Agendado'} },
  { id:'old', first_seen_at:'2026-11-02T12:00:00Z',sender_name:'Pessoa antiga',tracking_data:names },
  { id:'manual', first_seen_at:'2026-11-11T12:00:00Z',sender_name:'Pessoa Google',origin_source:'google_ads',tracking_data:{} },
  { id:'paused', first_seen_at:'2026-11-11T12:00:00Z',sender_name:'Pessoa histórica',tracking_data:{account_id:'10',campaign_id:'21',adset_id:'31'} },
].map(c => ({cliente_id:'client-a',origin_source:'meta_ads',phone:'5511999991234',...c}));
const data = { contacts, messages:[], config:null, niche:'', origin_catalog:[{account_id:'10',campaign_id:'21',campaign_name:'Campanha antiga',adset_id:'31',adset_name:'Conjunto antigo',campaign_status:'PAUSED'}],
  appointment_events:contacts.map(c=>({contact_id:c.id,at:'2026-11-12T12:00:00Z',source:'automatico'})) };
const text = n => typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(' '):n?text(n.children??n.props?.children):'';
const props = { client:{id:'client-a',empresa:'Cliente sintético'},weekStart:'2026-11-09',selection:{rows:[row],allRows:[row],appointmentsOnly:false},profile:{id:'person',role:'colaborador',status:'active'},modules:{paid_traffic:true,rastreamento:true},close(){} };
function fixture(payload=data) {
  const calls=[];
  const db=createClient('https://fixture.invalid','fixture', {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init={})=>{
    const url=new URL(input); assert.equal(url.hostname,'fixture.invalid'); const body=init.body?JSON.parse(init.body):null; calls.push({url,body});
    if(url.pathname.endsWith('/central_trafego_can_access_client'))return Response.json(true);
    assert.ok(url.pathname.endsWith('/gestor_ia_routine_leads_data'),url.pathname);
    return Response.json(payload);
  }}});
  globalThis.__attribution={db}; return calls;
}
async function press(renderer,label){const button=renderer.root.findAllByType('button').find(b=>text(b.props.children).replace(/\s+/g,' ').trim()===label);assert.ok(button,label);await act(async()=>button.props.onClick());}
test('modo semanal mostra novos/antigos, nomes e linha histórica sem alterar a revisão',async()=>{
  const calls=fixture(); const before=structuredClone(props.selection.rows); let r;
  try {
    await act(async()=>{r=create(React.createElement(Page,props));});
    assert.ok(text(r.toJSON()).includes('Pessoa nova')); assert.ok(!text(r.toJSON()).includes('Pessoa antiga'));
    assert.ok(text(r.toJSON()).includes('por nome'));
    await press(r,'Leads novos da semana'); assert.ok(text(r.toJSON()).includes('Pessoa nova'));
    await press(r,'Agendados na semana');
    assert.ok(calls.some(c=>c.body?.p_mode==='agendados_na_semana'));
    const shown=text(r.toJSON()).replaceAll('\u00a0',' '); assert.ok(shown.includes('Pessoa antiga')); assert.ok(shown.includes('Campanha encerrada'));
    assert.ok(shown.includes('Conjunto antigo')); assert.ok(shown.includes('R$ 0,00')); assert.ok(shown.includes('R$ 120,00'));
    assert.match(shown,/Entrada:\s+02\/11\/2026/);
    assert.ok(!shown.includes('5511999991234')); assert.ok(shown.includes('•••• 1234'));
    await press(r,'Antigos 1'); assert.ok(!text(r.toJSON()).includes('Pessoa nova')); assert.ok(text(r.toJSON()).includes('Pessoa antiga'));
    await press(r,'Sem vínculo Meta 1'); assert.ok(!text(r.toJSON()).includes('Pessoa Google'));
    await press(r,'Novos 3'); assert.ok(text(r.toJSON()).includes('Pessoa Google'));
    assert.deepEqual(props.selection.rows,before); assert.ok(calls.every(c=>!c.url.pathname.includes('/functions/')));
  }finally{if(r)await act(async()=>r.unmount());delete globalThis.__attribution;}
});
test('universo da planilha impede confirmar nomes ambíguos após selecionar uma linha',async()=>{
  fixture({...data,contacts:[contacts[0]],appointment_events:[]});let r;
  const allRows=[row,{...row,id:'row-b',account_id:'act_11',campaign_id:'22',adset_id:'32'}];
  try{
    await act(async()=>{r=create(React.createElement(Page,{...props,selection:{...props.selection,allRows}}));});
    assert.ok(!text(r.toJSON()).includes('Pessoa nova'));
    await press(r,'Sem vínculo Meta 1'); assert.ok(text(r.toJSON()).includes('Pessoa nova')); assert.ok(text(r.toJSON()).includes('ambígua'));
  }finally{if(r)await act(async()=>r.unmount());delete globalThis.__attribution;}
});
