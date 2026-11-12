import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const Transcripts = createContext({});
export function AtlasGroupTranscripts({ messages, isGroup, children }) {
  const [records,setRecords]=useState({});
  const ids=isGroup?(messages||[]).filter(m=>m.direction==='in'&&m.kind==='audio'&&!m.deleted&&/^[a-f\d-]{36}$/i.test(m.id)).map(m=>m.id).sort().join(','):'';
  useEffect(()=>{
    let alive=true,timer,controller=new AbortController();setRecords({});
    if(!ids)return ()=>controller.abort();
    async function refresh(){
      if(document.hidden){timer=setTimeout(refresh,15000);return;}
      try{
        const {data:allowed,error:gateError}=await supabase.rpc('atlas_is_owner').abortSignal(controller.signal);
        if(gateError||!allowed){if(alive)setRecords({});return;}
        const {data,error}=await supabase.from('atlas_audio_transcripts').select('inbox_id,status,transcript').in('inbox_id',ids.split(',')).abortSignal(controller.signal);
        if(alive)setRecords(error?{}:Object.fromEntries((data||[]).map(t=>[t.inbox_id,t])));
      }catch{if(alive)setRecords({});}
      if(alive)timer=setTimeout(refresh,15000);
    }
    void refresh();
    return ()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[ids]);
  return <Transcripts.Provider value={records}>{children}</Transcripts.Provider>;
}
export function AtlasAudioTranscript({messageId}) {
  const transcript=useContext(Transcripts)[messageId];
  if(!transcript)return null;
  const ready=transcript.status==='completed';
  return <div className="mt-2 border-t border-black/10 pt-2 text-xs leading-relaxed" aria-live="polite">
    {ready?<details><summary className="cursor-pointer text-violet-700">Transcrição · Atlas · só você</summary><p className="mt-2 max-w-sm whitespace-pre-wrap break-words select-text">{transcript.transcript}</p><p className="mt-1 text-[10px] text-muted-foreground">Transcrição automática. Confira o áudio em caso de dúvida.</p></details>:<p className="text-muted-foreground">{transcript.status==='unavailable'?'Transcrição indisponível. Você pode ouvir o áudio.':transcript.status==='failed'?'A transcrição aguarda uma nova tentativa.':transcript.status==='processing'?'Atlas está transcrevendo…':'Áudio na fila de transcrição do Atlas.'}</p>}
  </div>;
}
