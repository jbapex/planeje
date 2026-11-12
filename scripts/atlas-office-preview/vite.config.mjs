import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here('./'),
  publicDir: here('./vendor/habblaud/client/public'),
  resolve: { alias: [{ find: /^\.\/locales\/all$/, replacement: here('./vendor/habblaud/shared/locales/none.ts') }] },
  build: { outDir: here('../../.local/atlas-office-preview/dist'), emptyOutDir: true, assetsDir: 'bundle', target: 'es2022' },
  // Static client only: deliberately no API proxy and no original Habblaud server.
  preview: { host: '127.0.0.1', port: 4330, strictPort: true },
  server: { host: '127.0.0.1', port: 4330, strictPort: true },
});
