import {build} from 'esbuild';
const output=process.argv[2];
if(!output)throw Error('Provide a private output path');
await build({entryPoints:['supabase/functions/admin-client-user/index.ts'],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[{name:'isolated-runtime',setup(b){b.onResolve({filter:/^https:\/\//},a=>({path:a.path,namespace:'runtime'}));b.onLoad({filter:/.*/,namespace:'runtime'},a=>({contents:a.path.includes('/http/server.ts')?'export const serve = handler => { globalThis.__clientLoginHandler = handler; };':'export const createClient = (...args) => globalThis.__clientLoginCreate(...args);'}));}}]});
