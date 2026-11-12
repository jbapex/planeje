import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scratch = await mkdtemp(path.join(tmpdir(), 'planeje-media-cache-'));
const requests = globalThis.__atendimentoMediaFixture = [];
try {
  await build({ entryPoints:['src/lib/atendimentoMediaDownload.js'], outfile:path.join(scratch,'media.cjs'), bundle:true, format:'cjs', platform:'node', plugins:[{
    name:'isolated-media', setup(builder) {
      builder.onResolve({filter:/^@\/lib\/(customSupabaseClient|supabaseFunctions)$/},args=>({path:args.path,namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('customSupabaseClient')
        ? `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture-token'}}})}};`
        : `export async function invokeEdgeFunction(name,body,token){const requests=globalThis.__atendimentoMediaFixture;requests.push({name,body,token});return {data:{url:'https://fixture.invalid/file-'+requests.length,mimetype:'audio/mpeg'},error:null};}` }));
    },
  }] });
  const { fetchAtendimentoMediaUrl, clearAtendimentoMediaCache } = createRequire(import.meta.url)(path.join(scratch,'media.cjs'));
  const request = {clienteId:'client-a',whatsappConfigId:'channel-a',messageIds:['message-a','message-alias'],mediaKind:'audio',chatJid:'5511000000001@s.whatsapp.net'};
  const first = await fetchAtendimentoMediaUrl(request);
  assert.equal((await fetchAtendimentoMediaUrl(request)).url,first.url);
  assert.equal(requests.length,1);
  const refreshed = await fetchAtendimentoMediaUrl({...request,forceRefresh:true});
  assert.notEqual(refreshed.url,first.url);
  assert.equal(requests.length,2);
  assert.equal((await fetchAtendimentoMediaUrl({...request,messageIds:['message-alias']})).url,refreshed.url);
  assert.equal(requests[1].body.cliente_id,'client-a');
  assert.equal(requests[1].body.whatsapp_config_id,'channel-a');
  assert.equal(requests[1].body.chat_jid,request.chatJid);
  assert.equal(requests[1].body.generate_mp3,true);
  await fetchAtendimentoMediaUrl({...request,clienteId:'client-b'});
  await fetchAtendimentoMediaUrl({...request,whatsappConfigId:'channel-b'});
  assert.equal(requests.length,4);
  assert.equal(await fetchAtendimentoMediaUrl({...request,messageIds:[]}),null);
  assert.equal(requests.length,4);
  clearAtendimentoMediaCache();
  console.log('atendimentoMediaDownload: cache, nova tentativa e isolamento conferidos');
} finally {
  delete globalThis.__atendimentoMediaFixture;
  await rm(scratch,{recursive:true,force:true});
}
