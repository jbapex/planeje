import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
export default defineConfig({root:dir,publicDir:path.join(root,'public'),plugins:[react()],resolve:{alias:[
  {find:'@/lib/atlasEvents',replacement:path.join(dir,'event-fixture.js')},
  {find:'@/lib/atlasOfficeActivity',replacement:path.join(dir,'activity-fixture.js')},
  {find:'@/lib/atlasTeam',replacement:path.join(dir,'team-fixture.js')},
  {find:'@/lib/atlasOfficeClients',replacement:path.join(dir,'client-house-fixture.js')},
  {find:'@/lib/atlasDictationClient',replacement:path.join(dir,'dictation-fixture.js')},
  {find:'@/lib/atlasApi',replacement:path.join(dir,'api-fixture.js')},
  {find:'@/lib/workflow',replacement:path.join(dir,'workflow-fixture.js')},
  {find:'@/contexts/SupabaseAuthContext',replacement:path.join(root,'scripts/atlas-preview/auth-fixture.js')},
  {find:'@',replacement:path.join(root,'src')},
]},server:{host:'127.0.0.1',port:4335,strictPort:true,fs:{allow:[root]}}});
