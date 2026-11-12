// Source transcripts are untrusted customer content, never Atlas instructions or memories.
const TYPES=new Set(['audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage']);
const MAX_BYTES=24*1024*1024;
const fail=(code,permanent=false)=>Object.assign(new Error(code),{permanent});
function roots(row){const raw=row?.raw_payload||{},payload=raw.data&&typeof raw.data==='object'?raw.data:raw;return {raw,payload,message:payload.message||raw.message||{}};}
export function incomingGroupAudio(row,now=Date.now()) {
 const {raw,payload,message}=roots(row);
 const fromMe=[raw.fromMe,raw.from_me,payload.fromMe,payload.from_me,message.fromMe,message.from_me,raw.key?.fromMe,payload.key?.fromMe,message.key?.fromMe].some(v=>v===true||v==='true'||v===1);
 return !!row?.is_group&&!fromMe&&!row.media_purged_at&&TYPES.has(String(row.type).toLowerCase())&&Number.isFinite(Date.parse(row.created_at))&&now-Date.parse(row.created_at)<35*86400000;
}
export function audioMessageIds(row) {
 const {raw,payload,message}=roots(row);
 const values=[message.messageid,message.messageId,message.key?.id,message.key?.ID,message.id,payload.messageid,payload.messageId,payload.key?.id,payload.key?.ID,raw.key?.id,payload.id,raw.id,row.message_id];
 // Only IDs from this exact message. No timestamp/nearest-message fallback.
 return [...new Set(values.filter(v=>typeof v==='string').flatMap(v=>v.includes(':')?[v.split(':').at(-1),v]:[v]).map(v=>v.trim()).filter(v=>v&&v.length<=250&&!/\s|^sent_\d+$|@.+_\d{13,}$/.test(v)))].slice(0,8);
}
async function boundedJson(response,maximum) {
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw fail('AUDIO_TOO_LARGE',true);chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(result));
}
export function decodeAudio(base64,maxBytes=MAX_BYTES) {
 if(typeof base64!=='string')throw fail('MEDIA_UNAVAILABLE');
 const clean=base64.replace(/^data:[^;]+;base64,/,'').replace(/\s/g,'');
 if(clean.length>Math.ceil(maxBytes/3)*4)throw fail('AUDIO_TOO_LARGE',true);
 if(!clean||!/^[A-Za-z0-9+/]*={0,2}$/.test(clean))throw fail('AUDIO_FORMAT',true);
 const bytes=Uint8Array.from(atob(clean),c=>c.charCodeAt(0));
 if(bytes.length>maxBytes)throw fail('AUDIO_TOO_LARGE',true);
 if(bytes.length<32)throw fail('AUDIO_EMPTY',true);
 const head=new TextDecoder().decode(bytes.slice(0,16));
 let mime,name;
 if(head.startsWith('ID3')||bytes[0]===255&&(bytes[1]&224)===224){mime='audio/mpeg';name='audio.mp3';}
 else if(head.startsWith('RIFF')&&head.includes('WAVE')){mime='audio/wav';name='audio.wav';}
 else if(head.slice(4,8)==='ftyp'){mime='audio/mp4';name='audio.m4a';}
 else if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3){mime='audio/webm';name='audio.webm';}
 else throw fail('AUDIO_FORMAT',true);
 return {bytes,mime,name};
}
export async function downloadGroupAudio({ids,config,signal,fetcher=fetch,maxBytes=MAX_BYTES}) {
 if(!ids.length)throw fail('AUDIO_ID_MISSING',true);
 const host=String(config?.subdomain||'').replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/\.uazapi\.com$/i,'');
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)||!config?.token)throw fail('AUDIO_CONFIG');
 for(const id of ids){
   const response=await fetcher(`https://${host}.uazapi.com/message/download`,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',token:config.token},body:JSON.stringify({id,return_link:false,return_base64:true,generate_mp3:true})});
   if(!response.ok){await response.body?.cancel();if(response.status===429||response.status>=500)throw fail('MEDIA_UNAVAILABLE');continue;}
   const data=await boundedJson(response,maxBytes*1.4);
   if(data.error)continue;
   const base64=data.base64Data||data.base64;if(base64)return decodeAudio(base64,maxBytes);
 }
 throw fail('MEDIA_UNAVAILABLE');
}
export async function transcribeGroupAudio({audio,apiKey,model='gpt-4o-transcribe',signal,fetcher=fetch,language='pt',
  prompt='Planeje, JB Apex, Josias, Poliana, Raphael, Jhemisson, Rayane.'}) {
 const form=new FormData();form.set('file',new Blob([audio.bytes],{type:audio.mime}),audio.name);form.set('model',model);if(language)form.set('language',language);form.set('response_format','json');
 // Vocabulary only: no fabricated context/words or commands extracted from the audio.
 if(prompt)form.set('prompt',prompt);
 const response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',redirect:'error',signal,headers:{Authorization:`Bearer ${apiKey}`},body:form});
 if(!response.ok){await response.body?.cancel();throw fail('PROVIDER_UNAVAILABLE',response.status===413);}
 const data=await boundedJson(response,512000);const text=String(data.text||'').trim();
 if(!text||text.length>30000)throw fail('AUDIO_EMPTY',true);
 return {text,model,usage:data.usage&&typeof data.usage==='object'?data.usage:{}};
}
export function attachAudioTranscripts(messages,transcripts) {
 const byId=new Map(transcripts.map(t=>[t.inbox_id,t]));
 return messages.map(message=>{const t=byId.get(message.id);return t?{...message,audio_transcription:{status:t.status,text:t.status==='completed'?t.transcript?.slice(0,1400):null,truncated:t.status==='completed'&&t.transcript?.length>1400,full_text_section:'audio_transcript',source_inbox_id:message.id,generated_at:t.finished_at,automatic:true}}:message;});
}
