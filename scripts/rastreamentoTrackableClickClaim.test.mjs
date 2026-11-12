import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const built = await build({entryPoints:['supabase/functions/_shared/rastreamentoTrackableLink.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const { claimTrackableClickMatch } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const client = 'client-fixture', jid = '5511000000001@s.whatsapp.net';
const click = {id:'click-fixture',link_id:'link-fixture',cliente_id:client,match_code:'PJ-ABC234',gclid:'fixture-gclid',origin_resolved:'google_ads',matched_at:null,matched_from_jid:null};

function fixture({row=click, loseTo, raceOverrides={}, failPatch=false, failReread=false}={}) {
  let stored=structuredClone(row), reads=0, patches=0;
  const sb=createClient('https://fixture.invalid','fixture-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(input), q=url.searchParams, method=init?.method || 'GET';
      assert.equal(url.hostname,'fixture.invalid');assert.ok(url.pathname.endsWith('/cliente_rastreamento_link_clicks'));
      assert.ok(['GET','PATCH'].includes(method));
      const matches=()=>[...q].every(([key,value])=>!value.startsWith('eq.') && !value.startsWith('is.') ||
        (value.startsWith('eq.') ? String(stored?.[key])===value.slice(3) : stored?.[key]==null));
      let result=[];
      if(method==='PATCH') {
        patches++;
        assert.equal(q.get('id'),'eq.'+click.id);assert.equal(q.get('matched_at'),'is.null');
        if(failPatch)return new Response(JSON.stringify({message:'fixture patch failure'}),{status:500});
        if(loseTo)Object.assign(stored,{matched_at:'2026-10-28T10:00:00Z',matched_from_jid:loseTo},raceOverrides);
        if(matches()){Object.assign(stored,JSON.parse(init.body));result=[structuredClone(stored)];}
      } else {
        reads++;
        assert.equal(q.get('match_code'),'eq.'+click.match_code);
        if(reads>1) {
          assert.equal(q.get('id'),'eq.'+click.id);assert.equal(q.get('cliente_id'),'eq.'+client);
          assert.equal(q.get('matched_from_jid'),'eq.'+jid);
          if(failReread)return new Response(JSON.stringify({message:'fixture read failure'}),{status:500});
        }
        if(stored && matches())result=[structuredClone(stored)];
      }
      const wantsObject=new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object');
      return new Response(JSON.stringify(wantsObject ? result[0] || null : result),{headers:{'Content-Type':'application/json'}});
    }},
  });
  return {sb,counts:()=>({reads,patches})};
}
const opts={matchCode:click.match_code,clienteId:client,fromJid:jid};
let f=fixture();assert.equal((await claimTrackableClickMatch(f.sb,opts))?.gclid,click.gclid);assert.deepEqual(f.counts(),{reads:1,patches:1});
f=fixture({loseTo:jid});assert.equal((await claimTrackableClickMatch(f.sb,opts))?.gclid,click.gclid);assert.deepEqual(f.counts(),{reads:2,patches:1});
for(const setup of [{loseTo:'5511000000002@s.whatsapp.net'},{loseTo:jid,failReread:true},{loseTo:jid,raceOverrides:{cliente_id:'other-client'}},{loseTo:jid,raceOverrides:{match_code:'PJ-XYZ789'}},{failPatch:true},{row:{...click,cliente_id:'other-client'}}]){
  f=fixture(setup);assert.equal(await claimTrackableClickMatch(f.sb,opts),null);
}
f=fixture({row:{...click,matched_at:'2026-10-28T10:00:00Z',matched_from_jid:jid}});assert.equal((await claimTrackableClickMatch(f.sb,opts))?.gclid,click.gclid);assert.equal(f.counts().patches,0);
f=fixture({loseTo:jid});assert.equal(await claimTrackableClickMatch(f.sb,{...opts,fromJid:null}),null);assert.deepEqual(f.counts(),{reads:1,patches:1});
console.log('PASS trackable click claim: atomic owner, same-sender race, foreign owner/client, read/write failure and retry');
