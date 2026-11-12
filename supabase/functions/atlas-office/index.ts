import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { AtlasError,ownerGate,optionalUuid } from '../_shared/atlasCore.js';
import { readAtlasOffice,officeRows,clientOfficeContext,fingerprintContext,officeBusinessTime } from '../_shared/atlasOffice.js';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const check=(res:any)=>{if(res.error)throw new AtlasError('OFFICE_STORAGE_FAILURE','Não foi possível confirmar a operação do escritório. Atualize antes de tentar novamente.',503);return res.data;};
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'Use POST.'},405);
  try {
    const auth=req.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer '))throw new AtlasError('UNAUTHENTICATED','Entre no Planeje.',401);
    const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!anon||!secret)throw new AtlasError('OFFICE_NOT_CONFIGURED','O escritório aguarda configuração.',503);
    const caller=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const identity=await caller.auth.getUser();
    if(identity.error||!identity.data.user)throw new AtlasError('UNAUTHENTICATED','Sua sessão expirou.',401);
    const owner=identity.data.user.id;
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const [settings,profile]=await Promise.all([
      admin.from('atlas_settings').select('owner_id,enabled').eq('id','atlas').maybeSingle().then(check),
      caller.from('profiles').select('id,role,status').eq('id',owner).maybeSingle().then(check),
    ]);
    const gate=ownerGate(identity.data.user,profile,settings);
    if(!gate.enabled)throw new AtlasError('ATLAS_DISABLED','O Atlas está desligado.',403);
    // RLS checks the current auth.sessions row (or the bounded signed Atlas read delegation).
    const access=check(await caller.from('atlas_office_config').select('id').eq('id','atlas').maybeSingle());
    if(!access)throw new AtlasError('OFFICE_FORBIDDEN','Sua sessão atual não tem acesso ao escritório.',403);
    const text=await req.text();if(text.length>6000)throw new AtlasError('INVALID_INPUT','Pedido acima do limite.');
    let body:any;try{body=JSON.parse(text);}catch{throw new AtlasError('INVALID_INPUT','Pedido inválido.');}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new AtlasError('INVALID_INPUT','Pedido inválido.');
    const action=body.action||'snapshot';
    if(action==='status') {
      const [config,state,client_states,questions,proposals]=await Promise.all([
        caller.from('atlas_office_config').select('*').eq('id','atlas').maybeSingle().then(check),
        caller.from('atlas_office_state').select('*').eq('owner_id',owner).maybeSingle().then(check),
        caller.from('atlas_office_clients').select('*').eq('owner_id',owner).then(check),
        officeRows(caller,'atlas_office_questions',{ownerId:owner}),
        officeRows(caller,'atlas_office_proposals',{ownerId:owner}),
      ]);
      return json({ok:true,config,state,client_states,questions,proposals,business_time:officeBusinessTime()});
    }
    if(action==='snapshot') {
      const [office,config,state,clients,questions,proposals]=await Promise.all([
        readAtlasOffice(caller,{ownerId:owner}),
        caller.from('atlas_office_config').select('*').eq('id','atlas').maybeSingle().then(check),
        caller.from('atlas_office_state').select('*').eq('owner_id',owner).maybeSingle().then(check),
        caller.from('atlas_office_clients').select('*').eq('owner_id',owner).then(check),
        officeRows(caller,'atlas_office_questions',{ownerId:owner}),
        officeRows(caller,'atlas_office_proposals',{ownerId:owner}),
      ]);
      // Do not send the potentially large raw traffic JSON into the renderer.
      office.clients=office.clients.map((c:any)=>({...c,meta_resumo:undefined}));
      return json({ok:true,office,config,state,client_states:clients,questions,proposals,business_time:officeBusinessTime()});
    }
    if(action==='request_analysis') {
      const id=optionalUuid(body.client_id,'client_id');if(!id)throw new AtlasError('INVALID_INPUT','Escolha o cliente.');
      const c=check(await caller.from('clientes').select('id').eq('id',id).eq('etapa','closed').maybeSingle());
      if(!c)throw new AtlasError('CLIENT_FORBIDDEN','Cliente fora da carteira atual.',403);
      const config=check(await caller.from('atlas_office_config').select('enabled').eq('id','atlas').maybeSingle());
      if(!config?.enabled)throw new AtlasError('OFFICE_PAUSED','O acompanhamento está pausado.',409);
      const old=check(await caller.from('atlas_office_clients').select('status,requested_at').eq('owner_id',owner).eq('client_id',id).maybeSingle());
      if(old?.status==='analyzing'||old?.requested_at&&old.status==='queued')return json({ok:true,already_pending:true});
      check(await admin.from('atlas_office_clients').upsert({owner_id:owner,client_id:id,status:'queued',requested_at:new Date().toISOString(),retry_after:null},{onConflict:'owner_id,client_id'}));
      return json({ok:true,queued:true});
    }
    if(action==='answer_question') {
      const id=optionalUuid(body.question_id,'question_id');
      if(!id||typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>3000)throw new AtlasError('INVALID_INPUT','Responda em até 3.000 caracteres.');
      const q=check(await caller.from('atlas_office_questions').select('client_id').eq('owner_id',owner).eq('id',id).maybeSingle());
      if(!q)throw new AtlasError('OFFICE_QUESTION_NOT_FOUND','Pergunta não encontrada.',404);
      const result=check(await caller.rpc('atlas_office_answer',{p_question_id:id,p_answer:body.answer.trim()}));
      // Saving is idempotent; retrying a confirmed answer does not enqueue another analysis.
      if(!result.replayed)check(await admin.from('atlas_office_clients').upsert({owner_id:owner,client_id:q.client_id,status:'queued',requested_at:new Date().toISOString(),retry_after:null},{onConflict:'owner_id,client_id'}));
      return json(result);
    }
    if(action==='decide_proposal') {
      const id=optionalUuid(body.proposal_id,'proposal_id');
      if(!id||typeof body.approve!=='boolean'||body.confirmed!==true)throw new AtlasError('INVALID_INPUT','Confira a proposta e confirme sua decisão.');
      const p=check(await caller.from('atlas_office_proposals').select('*').eq('owner_id',owner).eq('id',id).maybeSingle());
      if(!p)throw new AtlasError('OFFICE_PROPOSAL_NOT_FOUND','Proposta não encontrada.',404);
      if(body.approve&&p.state==='pending') {
        const office=await readAtlasOffice(caller,{ownerId:owner});
        const context=clientOfficeContext(office,p.client_id);
        if(!context||await hash(fingerprintContext(context))!==p.source_hash) {
          check(await admin.from('atlas_office_proposals').update({state:'superseded'}).eq('owner_id',owner).eq('id',id).eq('state','pending'));
          throw new AtlasError('OFFICE_PROPOSAL_STALE','Os dados mudaram desde a proposta. Peça uma nova análise antes de criar a tarefa.',409);
        }
      }
      const result=await caller.rpc('atlas_office_decide_proposal',{p_proposal_id:id,p_approve:body.approve,p_confirmed:true});
      if(result.error) {
        const detail=String(result.error.message||'');
        if(/OFFICE_HUMAN/.test(detail))throw new AtlasError('OFFICE_HUMAN_REQUIRED','A criação exige sua aprovação numa sessão pessoal ativa.',403);
        if(/OFFICE_(PROPOSAL|CLIENT|ASSIGNEE|TASK)_/.test(detail))throw new AtlasError('OFFICE_PROPOSAL_CHANGED','A proposta ou seus vínculos mudaram. Atualize e confira as tarefas existentes.',409);
      }
      return json(check(result));
    }
    throw new AtlasError('INVALID_INPUT','Ação não permitida.');
  } catch(error) {
    if(error instanceof AtlasError)return json({ok:false,code:error.code,error:error.message},error.status||400);
    return json({ok:false,code:'OFFICE_FAILED',error:'O escritório não concluiu a consulta. As tarefas foram preservadas.'},500);
  }
});
