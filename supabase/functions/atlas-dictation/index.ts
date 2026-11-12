import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import {AtlasError,ownerGate,optionalUuid} from '../_shared/atlasCore.js';
import {humanDictationClaims,validateDictationFile,transcribeDictation,DICTATION_MAX_BYTES} from '../_shared/atlasDictation.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const checked=(r:any)=>{if(r.error)throw new AtlasError('DICTATION_STORAGE','Não foi possível confirmar a transcrição.',503);return r.data;};
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({ok:false,error:'Use POST.'},405);
 let admin:any,owner:string,requestId:string,claimed=false;
 try{
  const auth=req.headers.get('Authorization')||'',url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  if(!auth.startsWith('Bearer '))throw new AtlasError('UNAUTHENTICATED','Entre no Planeje.',401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await caller.auth.getUser();if(identity.error||!identity.data.user)throw new AtlasError('UNAUTHENTICATED','Sua sessão expirou.',401);
  owner=identity.data.user.id;admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const [settings,profile]=await Promise.all([admin.from('atlas_settings').select('owner_id,enabled').eq('id','atlas').maybeSingle().then(checked),caller.from('profiles').select('id,role,status').eq('id',owner).maybeSingle().then(checked)]);
  const gate=ownerGate(identity.data.user,profile,settings);if(!gate.enabled||!humanDictationClaims(auth))throw new AtlasError('DICTATION_HUMAN','Use sua sessão pessoal ativa para gravar.',403);
  const access=checked(await caller.from('atlas_office_config').select('id').eq('id','atlas').maybeSingle());if(!access)throw new AtlasError('DICTATION_HUMAN','Sua sessão não tem acesso.',403);
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let total=0;if(!reader)throw new AtlasError('INVALID_INPUT','Pedido vazio.');
  for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>DICTATION_MAX_BYTES+32768){await reader.cancel();throw new AtlasError('DICTATION_SIZE','Áudio acima de 6 MB.',413);}chunks.push(part.value);}
  const raw=new Uint8Array(total);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data')){
   let body:any;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{throw new AtlasError('INVALID_INPUT','Pedido inválido.');}requestId=optionalUuid(body.request_id,'request_id');if(body.action!=='status'||!requestId)throw new AtlasError('INVALID_INPUT','Pedido inválido.');
   const job=checked(await caller.from('atlas_dictations').select('id,state,transcript,question_id').eq('id',requestId).eq('owner_id',owner).maybeSingle());if(!job)throw new AtlasError('DICTATION_NOT_FOUND','Gravação não encontrada.',404);
   return json({ok:true,...job});
  }
  const form=await new Response(raw,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();
  requestId=optionalUuid(form.get('request_id'),'request_id');const question=optionalUuid(form.get('question_id')||null,'question_id');if(!requestId)throw new AtlasError('INVALID_INPUT','Gravação sem identificação.');
  if(question){const q=checked(await caller.from('atlas_office_questions').select('id,state').eq('id',question).eq('owner_id',owner).maybeSingle());if(!q||q.state!=='open')throw new AtlasError('DICTATION_QUESTION','Esta pergunta já mudou. Atualize o cliente.',409);}
  const key=Deno.env.get('OPENAI_API_KEY');if(!key)throw new AtlasError('DICTATION_NOT_CONFIGURED','A gravação ainda está sendo preparada.',503);
  const audio=await validateDictationFile(form.get('audio'),Number(form.get('seconds')));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',audio.bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const lease=checked(await admin.rpc('atlas_dictation_reserve',{p_owner_id:owner,p_id:requestId,p_question_id:question,p_hash:hash,p_size:audio.bytes.length,p_seconds:audio.seconds}));
  if(lease.state==='limited')throw new AtlasError('DICTATION_LIMIT','Você atingiu o limite de 40 gravações de hoje. Continue pelo texto.',429);
  if(!lease.fresh)return json({ok:true,id:requestId,state:lease.state,transcript:lease.transcript,question_id:question});
  claimed=true;
  const transcript=await transcribeDictation({audio,key,model:Deno.env.get('ATLAS_DICTATION_MODEL')||'gpt-4o-mini-transcribe',signal:AbortSignal.timeout(45000)});
  checked(await admin.from('atlas_dictations').update({state:'completed',transcript,finished_at:new Date().toISOString()}).eq('id',requestId).eq('owner_id',owner).eq('state','processing'));
  return json({ok:true,id:requestId,state:'completed',transcript,question_id:question});
 }catch(error){
  if(claimed&&admin)try{await admin.from('atlas_dictations').update({state:'failed',error_code:'TRANSCRIPTION_FAILED',finished_at:new Date().toISOString()}).eq('id',requestId).eq('owner_id',owner).eq('state','processing');}catch{}
  if(error instanceof AtlasError)return json({ok:false,code:error.code,error:error.message},error.status||400);
  return json({ok:false,code:'DICTATION_FAILED',error:'Não foi possível transcrever. Sua mensagem não foi enviada.'},500);
 }
});
