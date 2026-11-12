import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const directory=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(directory,'../../..');
export default defineConfig({root:directory,plugins:[react()],resolve:{alias:[
 {find:'@/lib/atlasApi',replacement:path.join(directory,'api.js')},
 {find:'@/lib/atlasTeam',replacement:path.join(directory,'api.js')},
 {find:'@/lib/customSupabaseClient',replacement:path.join(directory,'api.js')},
 {find:'@/contexts/SupabaseAuthContext',replacement:path.join(directory,'auth.js')},
 {find:'@/components/atlas/AtlasOffice',replacement:path.join(directory,'office.jsx')},
 {find:'@',replacement:path.join(project,'src')},
]},server:{host:'127.0.0.1',port:4341,strictPort:true,fs:{allow:[project]}}});
