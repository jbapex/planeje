import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
export default defineConfig({root:here('./'),base:'/atlas-office/',publicDir:here('../atlas-office-preview/vendor/habblaud/client/public'),
  resolve:{alias:[{find:/^\.\/locales\/all$/,replacement:here('../atlas-office-preview/vendor/habblaud/shared/locales/none.ts')}]},
  build:{outDir:here('../../public/atlas-office'),emptyOutDir:true,target:'es2022',assetsDir:'bundle'},
});
