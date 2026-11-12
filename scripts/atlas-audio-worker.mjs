/** Server-only transcription of already received group audio. No outbound messaging API. */
import { createHash } from 'node:crypto';
import { isAgencyEmpresa } from '../src/lib/pulseClientMatch.js';
import { audioMessageIds, incomingGroupAudio, downloadGroupAudio, transcribeGroupAudio } from '../supabase/functions/_shared/atlasGroupAudio.js';

export function createAtlasAudioWorker({admin,callerFor,gate,env,read,fetcher=fetch}) {
  let active=null,lastEnqueue=0,lastCsClaim=0;
  const csEnabled=env.ATLAS_CS_AUDIO_ENABLED==='true';
  async function sourceFor(job,signal) {
    const settings=await gate();
    if(settings?.owner_id!==job.owner_id||(!job.cs_client_id&&!settings.transcribe_group_audio))throw new Error('AUDIO_PAUSED');
    const caller=callerFor(job.owner_id);
    const row=await read(caller.from('cliente_whatsapp_inbox').select('id,cliente_id,conversation_id,whatsapp_config_id,message_id,is_group,type,raw_payload,media_purged_at,created_at').eq('id',job.inbox_id).abortSignal(signal).maybeSingle());
    const conversation=await read(caller.from('atendimento_conversas').select('id,cliente_id,whatsapp_config_id,is_group,bloqueada,archived_at').eq('id',job.conversation_id).abortSignal(signal).maybeSingle());
    if(!row||!conversation||row.conversation_id!==conversation.id||row.cliente_id!==conversation.cliente_id||!conversation.is_group||conversation.bloqueada||conversation.archived_at||!incomingGroupAudio(row))throw Object.assign(new Error('SOURCE_UNAVAILABLE'),{permanent:true});
    if(job.cs_client_id){
      if(!row.whatsapp_config_id||row.whatsapp_config_id!==conversation.whatsapp_config_id)throw Object.assign(new Error('SOURCE_UNAVAILABLE'),{permanent:true});
      const current=await read(admin.rpc('cs_ia_audio_can_process',{p_inbox_id:job.inbox_id,p_lease:job.lease_token}).abortSignal(signal));
      if(current!==true)throw new Error('AUDIO_PAUSED');
      return {row,conversation};
    }
    const client=await read(caller.from('clientes').select('id,empresa').eq('id',conversation.cliente_id).abortSignal(signal).maybeSingle());
    if(!isAgencyEmpresa(client?.empresa))throw Object.assign(new Error('SOURCE_UNAVAILABLE'),{permanent:true});
    const lease=await read(admin.from('atlas_audio_transcripts').select('inbox_id').eq('inbox_id',job.inbox_id).eq('lease_token',job.lease_token).eq('status','processing').gt('lease_until',new Date().toISOString()).abortSignal(signal).maybeSingle());
    if(!lease)throw new Error('AUDIO_LEASE_LOST');
    return {row,conversation};
  }
  async function process(job,controller) {
    const signal=controller.signal; const timeout=setTimeout(()=>controller.abort(),150000);
    let hash=null;
    try {
      const {row,conversation}=await sourceFor(job,signal);
      // Configuration lookup is server-only; the source was checked through owner RLS first.
      const config=await read(admin.from('cliente_whatsapp_config').select('subdomain,token').eq('id',row.whatsapp_config_id||conversation.whatsapp_config_id).eq('cliente_id',row.cliente_id).abortSignal(signal).maybeSingle());
      const audio=await downloadGroupAudio({ids:audioMessageIds(row),config,signal,fetcher,
        maxBytes:job.cs_client_id?4*1024*1024:undefined});
      hash=createHash('sha256').update(audio.bytes).digest('hex');
      await sourceFor(job,signal);
      const result=await transcribeGroupAudio({audio,apiKey:env.OPENAI_API_KEY,model:env.ATLAS_TRANSCRIBE_MODEL||'gpt-4o-transcribe',signal,fetcher,
        prompt:job.cs_client_id?null:undefined});
      await sourceFor(job,signal);
      const saved=await read(admin.rpc('atlas_audio_finish',{p_inbox_id:job.inbox_id,p_lease:job.lease_token,p_text:result.text,p_model:result.model,p_hash:hash,p_usage:result.usage}));
      console.log(JSON.stringify({event:saved?'audio_transcribed':'audio_result_discarded',id:job.cs_client_id?undefined:job.inbox_id}));
    }catch(error){
      const safeCodes=new Set(['SOURCE_UNAVAILABLE','AUDIO_ID_MISSING','AUDIO_TOO_LARGE','AUDIO_FORMAT','AUDIO_EMPTY','MEDIA_UNAVAILABLE','AUDIO_PAUSED','AUDIO_LEASE_LOST','PROVIDER_UNAVAILABLE','AUDIO_CONFIG']);
      const code=signal.aborted?'AUDIO_TIMEOUT':safeCodes.has(error.message)?error.message:'AUDIO_FAILED';
      try{await read(admin.rpc('atlas_audio_finish',{p_inbox_id:job.inbox_id,p_lease:job.lease_token,p_hash:hash,p_error:code,p_permanent:!!error.permanent}));}catch{}
      console.log(JSON.stringify({event:'audio_transcription_stopped',id:job.cs_client_id?undefined:job.inbox_id,code}));
    }finally{clearTimeout(timeout);active=null;}
  }
  return {
    get busy(){return Boolean(active);},
    stop(){active?.controller.abort();},
    async tick(settings){
      if(!settings?.owner_id||(!csEnabled&&!settings.transcribe_group_audio)){this.stop();return;}
      if(active&&!active.cs&&!settings.transcribe_group_audio)this.stop();
      if(settings.transcribe_group_audio&&Date.now()-lastEnqueue>30000){
        const caller=callerFor(settings.owner_id);
        const clients=await read(caller.from('clientes').select('id,empresa').limit(300));
        const ids=clients.filter(c=>isAgencyEmpresa(c.empresa)).map(c=>c.id);
        if(ids.length){const groups=await read(caller.from('atendimento_conversas').select('id').in('cliente_id',ids).eq('is_group',true).eq('bloqueada',false).is('archived_at',null).limit(500));
          if(groups.length)await read(admin.rpc('atlas_audio_enqueue',{p_conversation_ids:groups.map(c=>c.id)}));}
        lastEnqueue=Date.now();
      }
      if(active)return;
      let job=null;
      if(csEnabled&&Date.now()-lastCsClaim>15000){
        lastCsClaim=Date.now();
        job=await read(admin.rpc('cs_ia_audio_claim',{p_owner:settings.owner_id}));
      }
      if(!job&&settings.transcribe_group_audio)job=await read(admin.rpc('atlas_audio_claim'));
      if(!job)return;
      const controller=new AbortController();active={controller,cs:Boolean(job.cs_client_id)};void process(job,controller);
    }
  };
}
