import {AtlasError} from './atlasCore.js';
export const DICTATION_MAX_BYTES=6*1024*1024;
export function humanDictationClaims(auth) {
 try {const part=auth.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const c=JSON.parse(atob(part));return typeof c.session_id==='string'&&c.session_id.length>0&&!c.planeje_server_delegate;}catch{return false;}
}
export async function validateDictationFile(file,seconds) {
 if(!file||typeof file.arrayBuffer!=='function'||file.size<100||file.size>DICTATION_MAX_BYTES)throw new AtlasError('DICTATION_FILE','Grave um áudio de até 2 minutos e 6 MB.',400);
 if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw new AtlasError('DICTATION_DURATION','O áudio deve ter até 2 minutos.',400);
 const type=String(file.type).split(';')[0].toLowerCase(),bytes=new Uint8Array(await file.arrayBuffer());
 const word=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
 const formats=[['audio/webm','webm',bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3],['audio/mp4','m4a',word(4,8)==='ftyp'],['audio/ogg','ogg',word(0,4)==='OggS'],['audio/wav','wav',word(0,4)==='RIFF'&&word(8,12)==='WAVE'],['audio/mpeg','mp3',word(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224]];
 const match=formats.find(f=>f[0]===type&&f[2]);
 if(!match)throw new AtlasError('DICTATION_FORMAT','Formato de gravação não reconhecido. Grave novamente pelo microfone.',400);
 return {bytes,type,extension:match[1],seconds};
}
export async function transcribeDictation({audio,key,model='gpt-4o-mini-transcribe',fetcher=fetch,signal}) {
 const form=new FormData();form.set('file',new Blob([audio.bytes],{type:audio.type}),'resposta.'+audio.extension);form.set('model',model);form.set('language','pt');form.set('response_format','json');
 const response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal,redirect:'error'});
 if(!response.ok)throw new AtlasError('DICTATION_PROVIDER','Não foi possível transcrever agora. Sua mensagem não foi enviada.',502);
 const data=await response.json(),text=typeof data.text==='string'?data.text.trim():'';
 if(!text||text.length>12000)throw new AtlasError('DICTATION_EMPTY','Não consegui identificar uma fala dentro do limite. Tente uma gravação mais curta.',422);
 return text;
}
