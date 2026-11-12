import {supabase,supabaseAnonKey} from '@/lib/customSupabaseClient';
import {getSupabaseFunctionsBaseUrl} from '@/lib/supabaseFunctions';
const pause=(signal)=>new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException('Cancelado','AbortError'));return;}const timer=setTimeout(done,1500);function done(){signal?.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Cancelado','AbortError'));}signal?.addEventListener('abort',abort,{once:true});});
async function call(body,signal){
  const {data,error}=await supabase.auth.getSession();if(error||!data?.session?.access_token)throw new Error('Sua sessão expirou. Entre novamente.');
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,50000);
  try{
    const multipart=body instanceof FormData;
    const response=await fetch(getSupabaseFunctionsBaseUrl()+'/atlas-dictation',{method:'POST',headers:{apikey:supabaseAnonKey,Authorization:'Bearer '+data.session.access_token,...(!multipart?{'Content-Type':'application/json'}:{})},body:multipart?body:JSON.stringify(body),signal:controller.signal});
    const value=await response.json();if(!response.ok||!value.ok){const error=new Error(value.error||'Não foi possível transcrever.');error.status=response.status;error.retryNewRequest=[502,422].includes(response.status);throw error;}return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function transcribeAtlasDictation({blob,seconds,requestId,questionId=null,signal}){
  const form=new FormData();form.set('audio',blob,'gravacao');form.set('seconds',String(seconds));form.set('request_id',requestId);if(questionId)form.set('question_id',questionId);
  let result;
  try{result=await call(form,signal);}catch(error){if(signal?.aborted||error.status)throw error;result={state:'processing'};}
  for(let i=0;i<35;i++){
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    if(result.state==='completed'&&typeof result.transcript==='string')return result.transcript;
    if(result.state!=='processing'){const error=new Error('A transcrição não ficou disponível. Você pode tentar novamente.');error.retryNewRequest=true;throw error;}
    await pause(signal);result=await call({action:'status',request_id:requestId},signal);
  }
  throw new Error('A transcrição ainda não foi confirmada. Tente consultar a mesma gravação novamente.');
}
