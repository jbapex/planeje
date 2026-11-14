import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../../..');
export default defineConfig({
  root: directory, envDir: directory, publicDir: path.join(project, 'public'), plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:4417'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-fixture'),
    'import.meta.env.VITE_ATLAS_DEMANDS_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_ATLAS_DEMAND_PILOT': JSON.stringify('false'),
    'import.meta.env.VITE_ATLAS_EVENTS_PILOT': JSON.stringify('false'),
  },
  resolve: { alias: [
    { find: '@/lib/atlasApi', replacement: path.join(directory, 'api.js') },
    ...['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/hooks/useAtendimentoSidebarBadge', '@/hooks/useCaixaPendencias', '@/components/atlas/useAtlasInbox'].map(find => ({ find, replacement: path.join(directory, 'session.js') })),
    { find: '@', replacement: path.join(project, 'src') },
  ] },
  server: { host: '127.0.0.1', port: 4417, strictPort: true, fs: { allow: [project] } },
});
