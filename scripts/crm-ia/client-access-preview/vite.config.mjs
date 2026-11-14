import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../preview/vite.config.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
export default {...base,root:directory,envDir:path.join(directory,'empty-env'),cacheDir:path.join(directory,'.vite'),resolve:{...base.resolve,alias:[
 ...['@/contexts/SupabaseAuthContext','@/contexts/ModuleSettingsContext','@/lib/customSupabaseClient','@/lib/supabaseFunctions','@/components/AtlasEntry','@/hooks/useAtendimentoLojaMembro'].map(find=>({find,replacement:path.join(directory,'session.js')})),
 ...['@/components/admin/MiniCrmConfigCopy','@/components/crm/ClienteMetaCtwaAdminPanel'].map(find=>({find,replacement:path.join(directory,'unrelated.jsx')})),
 {find:'@',replacement:path.resolve(directory,'../../../src')},
]},server:{...base.server,port:4402,strictPort:true}};
