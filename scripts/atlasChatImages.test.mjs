import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatImage,uploadChatImages} from '../src/lib/atlasChatImages.js';
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2]);
const file=()=>Object.assign(new Blob([png],{type:'image/png'}),{name:'captura.png'});
test('reject unsupported and too large images',async()=>{
 await assert.rejects(validateChatImage(new Blob(['<svg/>'],{type:'image/svg+xml'})),/PNG/);
 await assert.rejects(validateChatImage({size:5242881,type:'image/png'}),/5 MB/);
 await assert.rejects(validateChatImage(new Blob(['fake'],{type:'image/png'})),/formato/);
});
test('private immutable upload belongs to this thread actor and request',async()=>{
 const calls=[];const storage={from(bucket){assert.equal(bucket,'atlas-chat-images');return {async upload(...args){calls.push(args);return {data:{},error:null};}};}};
 const output=await uploadChatImages(storage,{threadId:'thread',actorId:'person',requestId:'request',files:[{id:'file',file:file()}]});
 assert.equal(output[0].path,'thread/person/request/file.png');assert.equal(calls[0][2].upsert,false);assert.equal(output[0].size,png.length);
});
test('retry refuses collision with different existing bytes',async()=>{
 const storage={from(){return {async upload(){return {error:{statusCode:'409'}};},async download(){return {data:new Blob(['other']),error:null};}};}};
 await assert.rejects(uploadChatImages(storage,{threadId:'t',actorId:'a',requestId:'r',files:[{id:'f',file:file()}]}),/outra imagem/);
});
test('abort prevents upload and more than two files rejected',async()=>{
 const controller=new AbortController();controller.abort();const storage={from(){assert.fail('No upload');}};
 await assert.rejects(uploadChatImages(storage,{threadId:'t',actorId:'a',requestId:'r',files:[{id:'f',file:file()}],signal:controller.signal}));
 await assert.rejects(uploadChatImages(storage,{files:[1,2,3]}),/duas/);
});
test('exact byte retry keeps the same immutable metadata',async()=>{
 const storage={from(){return {async upload(){return {error:{statusCode:'409'}};},async download(){return {data:file(),error:null};}};}};
 const result=await uploadChatImages(storage,{threadId:'t',actorId:'a',requestId:'r',files:[{id:'f',file:file()}]});assert.equal(result[0].path,'t/a/r/f.png');
});
test('abort after upload never proceeds to enqueue',async()=>{
 const controller=new AbortController();const storage={from(){return {async upload(){controller.abort();return {error:null};}};}};
 await assert.rejects(uploadChatImages(storage,{threadId:'t',actorId:'a',requestId:'r',files:[{id:'f',file:file()}],signal:controller.signal}),{name:'AbortError'});
});
test('an indefinitely pending upload releases the composer when aborted',async()=>{
 const controller=new AbortController(),storage={from(){return {upload(){return new Promise(()=>{});}};}};
 const result=uploadChatImages(storage,{threadId:'t',actorId:'a',requestId:'r',files:[{id:'f',file:file()}],signal:controller.signal});
 await new Promise(resolve=>setTimeout(resolve,0));controller.abort();
 await assert.rejects(Promise.race([result,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Upload stayed pending')),50))]),{name:'AbortError'});
});
