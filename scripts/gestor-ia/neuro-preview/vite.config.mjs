import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
export default defineConfig({
  root: dir, publicDir: path.join(root, 'public'), envDir: path.join(dir, 'empty-env'), cacheDir: path.join(dir, '.vite'), plugins: [react()],
  resolve: { alias: [
    { find: /.*\/customSupabaseClient(?:\.js)?$/, replacement: path.join(dir, 'session.js') },
    ...['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/lib/supabaseFunctions'].map((find) => ({ find, replacement: path.join(dir, 'session.js') })),
    { find: '@', replacement: path.join(root, 'src') },
  ], dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 4393, strictPort: true, fs: { allow: [root] }, hmr: { host: '127.0.0.1' } },
});
