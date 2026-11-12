import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../../..');
export default defineConfig({
  root: directory,
  envDir: path.join(directory, 'empty-env'),
  cacheDir: path.join(directory, '.vite'),
  publicDir: path.join(project, 'public'),
  plugins: [react()],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture') },
  resolve: { alias: [
    ...['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/lib/supabaseFunctions', '@/components/AtlasEntry'].map(find => ({ find, replacement: path.join(directory, 'session.js') })),
    { find: '@', replacement: path.join(project, 'src') },
  ], dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 4401, strictPort: true, fs: { allow: [project] } },
});
