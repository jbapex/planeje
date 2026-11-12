import path from'node:path';import{fileURLToPath}from'node:url';import{defineConfig}from'vite';import react from'@vitejs/plugin-react';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
export default defineConfig({root:dir,plugins:[react()],resolve:{alias:[...['@/lib/atlasEvents','@/lib/atlasDemands','@/lib/customSupabaseClient','@/lib/workflow','@/contexts/SupabaseAuthContext'].map(find=>({find,replacement:path.join(dir,'api.js')})),{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:4337,strictPort:true,fs:{allow:[root]}}});
