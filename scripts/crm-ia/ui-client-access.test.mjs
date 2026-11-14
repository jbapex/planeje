import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer');
const session = path.join(root, 'scripts/crm-ia/preview/session.js');
const scratch = await fs.mkdtemp('/tmp/planeje-crm-ui-qa/client-access-'), outfile = path.join(scratch, 'ui.cjs');
await build({ stdin: { contents: `export {default as Workspace} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaClientWorkspace.jsx'))};export {MemoryRouter} from 'react-router-dom';export {fixture,supabase} from ${JSON.stringify(session)};`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'isolated-customer', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true }));
    b.onResolve({ filter: /^@\// }, async ({ path: name }) => {
      if (['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/lib/supabaseFunctions', '@/components/AtlasEntry'].includes(name)) return { path: session };
      const file = path.join(root, 'src', name.slice(2));
      for (const ext of ['', '.jsx', '.js']) { try { await fs.access(file + ext); return { path: file + ext }; } catch {} }
      throw new Error(`Unknown alias ${name}`);
    });
  } }],
});
const originalDocument = globalThis.document;
const listeners = new Set();
globalThis.document = { visibilityState: 'visible', addEventListener: (_name, handler) => listeners.add(handler), removeEventListener: (_name, handler) => listeners.delete(handler) };
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
async function mount(section, query='', enabled=true) {
  delete require.cache[require.resolve(outfile)];
  const app=require(outfile), original=app.supabase.rpc, calls=[];
  Object.assign(app.fixture.profile,{role:'cliente',cliente_id:A,allowed_pages:['crm-ia']});
  app.supabase.rpc=async(name,args)=>{
    calls.push({name,...args});
    if(name==='crm_ia_client_access')return {data:{enabled,client_id:A,nivel:'admin',revision:'grant-1'},error:null};
    const response=await original(name,args);
    if(args?.p_action==='workspace'&&response.data)response.data={...response.data,agents:[],bases:[],templates:[],lead_profiles:[],permissions:{customer:true,operate:true,configure:false,manage:false,provision:false,conversations:true,apply_profile:false}};
    return response;
  };
  let r;
  await act(async()=>{r=create(React.createElement(app.MemoryRouter,{initialEntries:[`/cliente/crm-ia/${section}${query}`]},React.createElement(app.Workspace)));});
  return {r,calls,app};
}
test('client opens only own CRM and can operate without agency configuration controls',async()=>{
  const {r,calls}=await mount('funil');
  try{
    assert.ok(r.root.findAllByType('button').some(n=>text(n)==='Novo lead'));
    assert.equal(r.root.findAllByType('button').some(n=>text(n)==='Configuração'),false);
    assert.equal(r.root.findAllByType('select').some(n=>n.props['aria-label']==='Conta'),false);
    assert.equal(calls.some(c=>c.p_action==='bootstrap'||c.p_client_id&&c.p_client_id!==A),false);
    assert.equal(r.root.findAllByType('a').some(n=>/gestor-ia|cs-ia|assistant|configuracoes/.test(n.props.href)),false);
  }finally{await act(async()=>r.unmount());}
});
for(const section of ['painel','agenda'])test(`links remain in the customer portal in ${section}`,async()=>{
  const {r,calls}=await mount(section);
  try{
    assert.equal(r.root.findAllByType('a').some(n=>n.props.href?.startsWith('/crm-ia')),false);
    assert.equal(calls.some(c=>c.p_action==='usage'),false);
    assert.equal(text(r.toJSON()).includes('Google Agenda'),false);
  }finally{await act(async()=>r.unmount());}
});
test('foreign query, hidden section and denied access never load a workspace',async()=>{
  for(const args of [['leads',`?cliente=${B}`],['configuracoes',''],['leads','',false]]){
    const {r,calls}=await mount(...args);
    try{assert.equal(calls.some(c=>c.p_action==='workspace'),false);assert.ok(r.root.findAllByProps({role:'alert'}).length);}
    finally{await act(async()=>r.unmount());}
  }
});
test('access refresh keeps the mounted workspace until the server confirms revocation',async()=>{
  const {r,app}=await mount('leads');
  let finish;
  const original=app.supabase.rpc;
  app.supabase.rpc=(name,args)=>name==='crm_ia_client_access'?new Promise(resolve=>{finish=resolve;}):original(name,args);
  try{
    const content=r.root.findByProps({className:'crm-ia-content'});
    await act(async()=>{for(const listener of [...listeners])listener();});
    assert.equal(r.root.findByProps({className:'crm-ia-content'}),content,'permission polling must not discard drafts or sending mutexes');
    await act(async()=>finish({data:{enabled:false,client_id:A},error:null}));
    assert.match(text(r.toJSON()),/CRM IA indisponível/);
    assert.equal(r.root.findAllByProps({className:'crm-ia-content'}).length,0);
  }finally{await act(async()=>r.unmount());}
});
after(async()=>{globalThis.document=originalDocument;await fs.rm(scratch,{recursive:true,force:true});});
