import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../..');
export default defineConfig({ root: directory, plugins: [react()], resolve: { alias: [
  { find: '@/lib/atlasApi', replacement: path.join(directory, 'api-fixture.js') },
  { find: '@/contexts/SupabaseAuthContext', replacement: path.join(directory, 'auth-fixture.js') },
  { find: '@', replacement: path.join(project, 'src') },
] }, server: { host: '127.0.0.1', port: 4317, strictPort: true, fs: { allow: [project] } } });
