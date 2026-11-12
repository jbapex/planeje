import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'planeje-client-login-'));let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
try{
 const built=await build({entryPoints:['src/lib/adminClientUser.js'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'transport',setup(b){b.onResolve({filter:/customSupabaseClient$/},()=>({path:'fixture',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const supabase = { functions: { invoke: (...args) => globalThis.__clientLoginInvoke(...args) } };'}));}}]});
 const file=join(dir,'client.mjs');await writeFile(file,built.outputFiles[0].text);const {parseAdminClientUserError:parse,createOrLinkClientUser:create}=await import(pathToFileURL(file));
 check(await parse({message:'generic'},{error:'E-mail já vinculado'}),'E-mail já vinculado');
 const context=new Response(JSON.stringify({error:'Este e-mail pertence a um usuário interno.'}),{status:409});
 check(await parse({message:'Edge Function returned a non-2xx status code',context}),'Este e-mail pertence a um usuário interno.');
 check((await context.json()).error,'Este e-mail pertence a um usuário interno.');
 check(await parse({message:'Falha na rede',context:new Response('bad gateway',{status:502})}),'Falha na rede');
 check(await parse({message:'fallback',context:new Response(JSON.stringify({error:{private:'not displayed'}}))}),'fallback');
 check(await parse('erro textual'),'erro textual');check(await parse(null,null),'Erro ao criar ou vincular login');
 let input;globalThis.__clientLoginInvoke=async(...args)=>{input=args;return{data:{ok:true,user_id:'fixture'},error:null};};
 const body={email:' CLIENTE@EXAMPLE.INVALID ',password:'fixture-private',fullName:'Conta fictícia',clienteId:'fixture-client'};
 check(await create(body),{ok:true,user_id:'fixture'});check(input,['admin-client-user',{body:{email:'cliente@example.invalid',password:body.password,full_name:body.fullName,cliente_id:body.clienteId}}]);
 globalThis.__clientLoginInvoke=async()=>({error:{message:'generic',context:new Response('{"error":"Erro específico do cadastro"}',{status:400})}});
 await assert.rejects(create(body),{message:'Erro específico do cadastro'});passed++;
 globalThis.__clientLoginInvoke=async()=>({data:{error:'Resposta de erro'}});await assert.rejects(create(body),{message:'Resposta de erro'});passed++;
 globalThis.__clientLoginInvoke=async()=>({data:{}});await assert.rejects(create(body),{message:'Resposta inválida ao criar login'});passed++;
 console.log(`PASS ${passed} client login presentation checks`);
}finally{await rm(dir,{recursive:true,force:true});delete globalThis.__clientLoginInvoke;}
