/** Office-only manager. Private server process; the legacy monitor stays independent. */
import { createClient } from '@supabase/supabase-js';
import { createHash,createHmac } from 'node:crypto';
import { readAtlasOffice,officeRows,officeBusinessTime } from '../supabase/functions/_shared/atlasOffice.js';
import { scanOffice } from '../supabase/functions/_shared/atlasOfficeManager.js';
import { scanDemandFollowups } from './atlas-demand-followup.mjs';

const env=process.env;
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','JWT_SECRET','OPENAI_API_KEY'])if(!env[k])throw new Error('Office server configuration missing: '+k);
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const read=async q=>{const {data,error}=await q;if(error)throw new Error('Office storage operation failed.');return data;};
const hash=async text=>createHash('sha256').update(text).digest('hex');
function callerFor(owner) {
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),now=Math.floor(Date.now()/1000);
  const body=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:owner,role:'authenticated',aud:'authenticated',iss:'supabase',planeje_server_delegate:'atlas',iat:now,exp:now+240})}`;
  return createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${body}.${createHmac('sha256',env.JWT_SECRET).update(body).digest('base64url')}`}},auth:{persistSession:false,autoRefreshToken:false}});
}
async function callModel(system,input) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try {
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:env.ATLAS_OFFICE_MODEL||env.ATLAS_MODEL||'gpt-4o-mini',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_object'},max_tokens:900,temperature:0.2})});
    if(!response.ok)throw new Error('Office provider unavailable.');
    const data=await response.json();
    if(data.choices?.[0]?.finish_reason!=='stop')throw new Error('Office answer incomplete.');
    return {value:JSON.parse(data.choices[0].message.content),tokens:data.usage?.total_tokens,
      usage:{model:data.model,input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens,total_tokens:data.usage?.total_tokens,at:new Date().toISOString()}};
  } finally {clearTimeout(timer);}
}
let stopping=false,lastScan=0,lastDemandScan=0,lastOwner=null;
async function tick(force=false) {
  const config=await read(admin.from('atlas_office_config').select('*').eq('id','atlas').maybeSingle());
  if(!config?.enabled)return;
  const atlas=await read(admin.from('atlas_settings').select('owner_id,enabled').eq('id','atlas').single());
  const profile=await read(admin.from('profiles').select('status,role').eq('id',config.owner_id).single());
  if(!atlas.enabled||atlas.owner_id!==config.owner_id||profile.status!=='active'||!['superadmin','admin'].includes(profile.role))return;
  const owner=config.owner_id,now=new Date();lastOwner=owner;
  await read(admin.from('atlas_office_state').upsert({owner_id:owner,heartbeat_at:now.toISOString()},{onConflict:'owner_id'}));
  if(officeBusinessTime(now)&&Date.now()-lastDemandScan>=config.scan_interval_seconds*1000) {
    lastDemandScan=Date.now();
    try {
      const followup=await scanDemandFollowups({admin,ownerId:owner,now});
      await read(admin.from('atlas_office_state').upsert({owner_id:owner,followup_checked_at:now.toISOString(),followup_error:null},{onConflict:'owner_id'}));
      console.log(JSON.stringify({event:'demand_followup_scan',...followup}));
    } catch {
      await read(admin.from('atlas_office_state').upsert({owner_id:owner,followup_error:'O acompanhamento das tarefas não foi conferido. A última leitura permanece datada.'},{onConflict:'owner_id'}));
      console.log(JSON.stringify({event:'demand_followup_scan_failed'}));
    }
  }
  // The event engine replaces this automatic model reader. Keep deterministic
  // task follow-ups above; never run two managers over the same WhatsApp queue.
  const events=await read(admin.from('atlas_event_config').select('enabled').eq('owner_id',owner).maybeSingle());
  if(events)return;
  const states=await read(admin.from('atlas_office_clients').select('*').eq('owner_id',owner));
  const manual=states.some(s=>s.requested_at&&(!s.analyzed_at||s.requested_at>s.analyzed_at));
  if(!force&&!manual&&(!officeBusinessTime(now)||Date.now()-lastScan<config.scan_interval_seconds*1000))return;
  lastScan=Date.now();
  const caller=callerFor(owner);
  const [office,questions,proposals]=await Promise.all([
    readAtlasOffice(caller,{ownerId:owner,now}),
    officeRows(caller,'atlas_office_questions',{ownerId:owner}),
    officeRows(caller,'atlas_office_proposals',{ownerId:owner}),
  ]);
  const inbox=async({key,clientId,title,body,evidence})=>read(admin.from('atlas_inbox').upsert({owner_id:owner,source_key:key,client_id:clientId,kind:'sistema',title,body,severity:'attention',evidence,state:'open'},{onConflict:'owner_id,source_key',ignoreDuplicates:true}));
  const summary=await scanOffice({office,config,states,questions,proposals,hash,now,callModel:async(system,input)=>{
    await read(admin.from('atlas_office_state').upsert({owner_id:owner,heartbeat_at:new Date().toISOString()},{onConflict:'owner_id'}));
    return callModel(system,input);
  },
    saveClient:async(clientId,patch)=>read(admin.from('atlas_office_clients').upsert({owner_id:owner,client_id:clientId,...patch},{onConflict:'owner_id,client_id'})),
    ask:async(clientId,key,question)=>{
      await read(admin.from('atlas_office_questions').upsert({owner_id:owner,client_id:clientId,source_key:key,question},{onConflict:'owner_id,client_id,source_key',ignoreDuplicates:true}));
      const q=await read(admin.from('atlas_office_questions').select('id,state').eq('owner_id',owner).eq('client_id',clientId).eq('source_key',key).single());
      if(q.state==='open')await inbox({key:'office:question:'+q.id,clientId,title:'Atlas precisa de uma orientação · '+office.clients.find(c=>c.id===clientId).empresa,body:question,evidence:{office_client:clientId,office_question:q.id}});
    },
    supersede:async(clientId,fingerprint)=>{
      const outdated=await read(admin.from('atlas_office_proposals').update({state:'superseded'}).eq('owner_id',owner).eq('client_id',clientId).eq('state','pending').neq('source_hash',fingerprint).select('id'));
      for(const p of outdated)await read(admin.from('atlas_inbox').update({state:'resolved'}).eq('owner_id',owner).eq('source_key','office:proposal:'+p.id));
    },
    reserve:async(day,tokens)=>read(admin.rpc('atlas_office_reserve',{p_owner_id:owner,p_day:day,p_tokens:tokens})),
    finish:async(lease,tokens)=>{const ok=await read(admin.rpc('atlas_office_finish_reservation',{p_owner_id:owner,p_lease:lease,p_actual_tokens:tokens}));if(!ok)throw new Error('Office reservation changed.');},
    saveProposal:async draft=>{
      const {type,...fields}=draft;
      await read(admin.from('atlas_office_proposals').upsert({owner_id:owner,...fields,task_type:type},{onConflict:'owner_id,client_id,source_key',ignoreDuplicates:true}));
      const p=await read(admin.from('atlas_office_proposals').select('id,state').eq('owner_id',owner).eq('client_id',draft.client_id).eq('source_key',draft.source_key).single());
      if(p.state==='pending')await inbox({key:'office:proposal:'+p.id,clientId:draft.client_id,title:'Aprovar tarefa · '+draft.title,body:draft.description,evidence:{office_client:draft.client_id,office_proposal:p.id}});
    },
  });
  await read(admin.from('atlas_office_state').upsert({owner_id:owner,last_scan_at:new Date().toISOString(),last_error:null,totals:{...office.totals,...summary}},{onConflict:'owner_id'}));
  console.log(JSON.stringify({event:'office_scan',...summary}));
}
for(const name of ['SIGTERM','SIGINT'])process.on(name,()=>{stopping=true;});
do {
  try {await tick(process.argv.includes('--once'));}
  catch {
    console.log(JSON.stringify({event:'office_scan_failed'}));
    if(lastOwner)try{await read(admin.from('atlas_office_state').upsert({owner_id:lastOwner,last_error:'A conferência não foi concluída; a última leitura permanece datada.'},{onConflict:'owner_id'}));}catch{}
  }
  if(process.argv.includes('--once'))break;
  await new Promise(resolve=>setTimeout(resolve,15000));
} while(!stopping);
