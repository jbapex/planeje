import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
export default defineConfig({
  root: dir, envDir: dir, plugins: [react()],
  resolve: { alias: [
    ...['@/lib/customSupabaseClient', '@/contexts/SupabaseAuthContext'].map(find => ({ find, replacement: path.join(dir, 'fixture.js') })),
    { find: '@', replacement: path.join(root, 'src') },
  ] },
  server: { host: '127.0.0.1', port: 4368, strictPort: true, fs: { allow: [root] } },
});
