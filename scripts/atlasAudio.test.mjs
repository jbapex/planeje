import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasAudioMeter } from '../src/lib/atlasAudioMeter.js';
import { atlasWaveLevel,atlasWavePath } from '../src/lib/atlasWaveform.js';
import { atlasAgentActivity } from '../src/components/atlas/atlasPresentation.js';
import { incomingGroupAudio,audioMessageIds,decodeAudio,downloadGroupAudio,transcribeGroupAudio,attachAudioTranscripts } from '../supabase/functions/_shared/atlasGroupAudio.js';
const row={id:'inbox',is_group:true,type:'ptt',created_at:new Date().toISOString(),message_id:'stored',raw_payload:{data:{message:{key:{id:'exact-id',fromMe:false}}}}};
const b64=Buffer.from('ID3'+'\x00'.repeat(90)).toString('base64');
test('input and playback meters remain independent and decay to silence',()=>{
 let current,closed=false;const samples=[];
 class Context{resume(){return Promise.resolve();}close(){closed=true;return Promise.resolve();}createMediaStreamSource(stream){current=stream;return {connect(){},disconnect(){}};}createAnalyser(){const source=current;return {fftSize:256,getFloatTimeDomainData:array=>array.fill(source.volume),disconnect(){}};}}
 const meter=new AtlasAudioMeter((n,levels)=>samples.push(levels),Context);const mic={volume:.1},speaker={volume:0};
 try{meter.add(mic,'input');meter.add(speaker,'output');meter.sample();assert.ok(samples.at(-1).input>.5);assert.equal(samples.at(-1).output,0);
 mic.volume=0;speaker.volume=.2;meter.sample();assert.ok(samples.at(-1).output>samples.at(-1).input);
 speaker.volume=0;for(let i=0;i<30;i++)meter.sample();assert.ok(meter.level<.0001);
 }finally{meter.stop();}assert.equal(closed,true);assert.deepEqual(samples.at(-1),{input:0,output:0});
});
test('waves follow the audible channel, respect mute/autoplay and never produce invalid SVG',()=>{
 const voice={active:true,status:'hearing',levelsRef:{current:{input:.2,output:.9}}};assert.equal(atlasWaveLevel(voice),.2);assert.equal(atlasWaveLevel({...voice,status:'speaking',muted:true}),.9);
 assert.equal(atlasWaveLevel({...voice,muted:true}),0);assert.equal(atlasWaveLevel({...voice,active:false}),0);assert.equal(atlasWaveLevel({...voice,status:'speaking',needsPlay:true}),0);
 for(const level of [-2,0,.2,1,2,NaN,Infinity]){const path=atlasWavePath({level,time:Infinity});assert.doesNotMatch(path,/NaN|Infinity/);assert.ok(path.endsWith(' Z'));}
 assert.notEqual(atlasWavePath({level:0}),atlasWavePath({level:.8}));
 assert.equal(atlasWavePath({level:1,time:4,reducedMotion:true}),atlasWavePath({level:0,time:0,reducedMotion:true}));
});
test('concurrent delegation stays visible and completed/cancelled work stops animating',()=>{
 const run={status:'running',steps:[{agent:'trafego',kind:'delegation',status:'running'}]};
 assert.equal(atlasAgentActivity([run],{status:'completed',steps:[]},'trafego'),'processing');
 assert.equal(atlasAgentActivity([{...run,status:'cancelled'}],{...run,status:'cancelled'},'trafego'),'interrupted');
 assert.equal(atlasAgentActivity([{...run,steps:[...run.steps,{agent:'trafego',kind:'answer',status:'completed'}]}],null,'trafego'),null);
});
test('only received, retained group audio is eligible and identifiers come from exact source',()=>{
 assert.equal(incomingGroupAudio(row),true);for(const patch of [{is_group:false},{type:'image'},{media_purged_at:'now'},{created_at:'2020-01-01'},{raw_payload:{fromMe:true}},{raw_payload:{data:{message:{key:{fromMe:true}}}}}])assert.equal(incomingGroupAudio({...row,...patch}),false);
 assert.equal(audioMessageIds(row)[0],'exact-id');assert.deepEqual(audioMessageIds({message_id:'chat@g.us_1756789012345'}),[]);
});
test('download only calls configured provider, asks for MP3 and refuses arbitrary URLs',async()=>{
 const calls=[];const audio=await downloadGroupAudio({ids:audioMessageIds(row),config:{subdomain:'example',token:'fixture-token'},fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({base64Data:b64}));}});
 assert.equal(audio.mime,'audio/mpeg');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://example.uazapi.com/message/download');assert.equal(JSON.parse(calls[0].options.body).generate_mp3,true);
 await assert.rejects(downloadGroupAudio({ids:['x'],config:{subdomain:'evil.invalid/path',token:'x'},fetcher:()=>assert.fail()}),/AUDIO_CONFIG/);
 await assert.rejects(downloadGroupAudio({ids:['x'],config:{subdomain:'example',token:'x'},fetcher:async()=>new Response(JSON.stringify({url:'http://127.0.0.1/private'}))}),/MEDIA_UNAVAILABLE/);
 assert.throws(()=>decodeAudio(Buffer.from('<html>'+'.'.repeat(80)).toString('base64')),/AUDIO_FORMAT/);
});
test('transcription sends bounded audio, stores result once by source and never exposes provider errors',async()=>{
 const result=await transcribeGroupAudio({audio:decodeAudio(b64),apiKey:'fixture-only',fetcher:async(url,options)=>{
 assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.body.get('language'),'pt');assert.equal(options.body.get('file').type,'audio/mpeg');return new Response(JSON.stringify({text:'Precisamos alinhar o material.',usage:{input_tokens:10}}));}});
 assert.equal(result.text,'Precisamos alinhar o material.');
 await assert.rejects(transcribeGroupAudio({audio:decodeAudio(b64),apiKey:'fixture',fetcher:async()=>new Response('secret upstream details',{status:500})}),/^Error: PROVIDER_UNAVAILABLE$/);
 const attached=attachAudioTranscripts([{id:'a',sender_name:'Cliente'},{id:'b'}],[{inbox_id:'a',status:'completed',transcript:result.text,finished_at:'today'},{inbox_id:'c',status:'completed',transcript:'Outro cliente'}]);
 assert.equal(attached[0].audio_transcription.source_inbox_id,'a');assert.equal(attached[1].audio_transcription,undefined);assert.equal(attached[0].sender_name,'Cliente');
 const pending=attachAudioTranscripts([{id:'a'}],[{inbox_id:'a',status:'failed',transcript:'incomplete'}]);assert.equal(pending[0].audio_transcription.text,null);
});
import { createManagerReader } from '../supabase/functions/_shared/atlasManagerContext.js';
const clientId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',groupId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',inboxId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function sourceCaller(tables){return {from(table){let rows=tables[table]||[];const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q;},limit(n){rows=rows.slice(0,n);return q;},range(from,to){rows=rows.slice(from,to+1);return q;},order(){return q;},abortSignal(){return q;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};}
test('reader includes transcript provenance and can read all pages without mixing group scope',async()=>{
 const text='Conteúdo do cliente. '.repeat(740);
 const tables={clientes:[{id:clientId,empresa:'JB Apex',etapa:'prospect'},{id:'active',empresa:'Grupo teste',etapa:'closed',entregaveis:{whatsapp_grupo:{conversation_id:groupId,wa_cliente_id:clientId}}}],atendimento_conversas:[{id:groupId,cliente_id:clientId,is_group:true,bloqueada:false,archived_at:null,display_name:'Grupo teste'}],cliente_whatsapp_inbox:[{id:inboxId,conversation_id:groupId,body:'[audio]',type:'audio',sender_name:'Cliente',created_at:'2026-10-09T12:00:00Z'}],atlas_audio_transcripts:[{inbox_id:inboxId,conversation_id:groupId,status:'completed',transcript:text,finished_at:'2026-10-09T12:01:00Z'}]};
 const reader=createManagerReader(sourceCaller(tables),{ownerId:'owner'});
 const conversation=await reader('conversation',{referenceId:groupId});
 assert.equal(conversation.records.messages[0].audio_transcription.truncated,true);
 let offset=0,joined='';do{const page=await reader('audio_transcript',{referenceId:inboxId,offset});assert.equal(page.available,true);joined+=page.records.chunks.join('');offset=page.records.next_offset;}while(offset!==null);
 assert.equal(joined,text);
 assert.equal((await reader('audio_transcript',{referenceId:inboxId,clientId})).available,false);
 tables.atendimento_conversas[0].bloqueada=true;
 await assert.rejects(reader('audio_transcript',{referenceId:inboxId}),{code:'SCOPE_CONFLICT'});
});
