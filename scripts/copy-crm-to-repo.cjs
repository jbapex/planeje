#!/usr/bin/env node
/**
 * Copia o CRM do cliente para um novo repositório (sistema standalone).
 * Uso: node scripts/copy-crm-to-repo.js [targetPath]
 * Exemplo: node scripts/copy-crm-to-repo.js ../planeje-crm
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.resolve(ROOT, process.argv[2] || 'planeje-crm');

function mkdirp(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyRecursive(src, dest) {
  mkdirp(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(path.join(ROOT, src), path.join(TARGET, dest));
}

const CRM_PAGES = [
  'ClientCRM.jsx',
  'LeadDetailPage.jsx',
  'CrmLayout.jsx',
  'ContatosPage.jsx',
  'ClienteCanaisPage.jsx',
  'AutomacoesPage.jsx',
  'ApicebotIntegracaoPage.jsx',
  'ClienteApiPage.jsx',
  'CaixaEntradaPage.jsx',
  'CrmWhatsAppPage.jsx',
];

const CRM_MIGRATIONS = [
  '20260126000000_create_crm_tables.sql',
  '20260126100000_create_apicecrm_leads_tables.sql',
  '20260127100000_create_cliente_whatsapp_config.sql',
  '20260128000000_create_crm_pipelines_stages_events.sql',
  '20260129000000_add_leads_responsavel_id.sql',
  '20260206000000_create_cliente_whatsapp_inbox.sql',
  '20260206100000_add_webhook_secret_whatsapp_config.sql',
  '20260206200000_create_cliente_whatsapp_webhook_log.sql',
  '20260207000000_add_raw_payload_webhook_log.sql',
  '20260207100000_add_phone_profile_pic_inbox.sql',
  '20260207200000_add_use_sse_whatsapp_config.sql',
  '20260208000000_create_cliente_whatsapp_sent.sql',
  '20260209000000_add_webhook_log_source.sql',
  '20260210000000_add_apicebot_api_config.sql',
  '20260211000000_create_cliente_whatsapp_contact.sql',
  '20260212000000_realtime_cliente_whatsapp_contact.sql',
  '20260213000000_create_lead_webhook_event.sql',
  '20260214000000_create_crm_contact_automations.sql',
  '20260215000000_add_profile_pic_contact.sql',
  '20260216000000_multiple_whatsapp_channels.sql',
  '20260217000000_add_crm_tags_and_lead_etiquetas.sql',
  '20260218000000_add_leads_utm_and_tracking.sql',
  '20260219000000_create_crm_vendas.sql',
  '20260220000000_add_crm_servicos_and_item_tipo.sql',
  '20260221000000_add_instance_name_contact.sql',
];

console.log('Target:', TARGET);
mkdirp(TARGET);

// 1. package.json (CRM-only deps)
const pkg = {
  name: 'planeje-crm',
  type: 'module',
  version: '1.0.0',
  private: true,
  scripts: { dev: 'vite --host :: --port 3003', build: 'vite build', preview: 'vite preview --port 3003' },
  dependencies: {
    '@radix-ui/react-accordion': '^1.1.2',
    '@radix-ui/react-alert-dialog': '^1.1.4',
    '@radix-ui/react-avatar': '^1.0.4',
    '@radix-ui/react-checkbox': '^1.0.4',
    '@radix-ui/react-dialog': '^1.0.5',
    '@radix-ui/react-dropdown-menu': '^2.0.6',
    '@radix-ui/react-label': '^2.0.2',
    '@radix-ui/react-popover': '^1.0.7',
    '@radix-ui/react-scroll-area': '^1.0.5',
    '@radix-ui/react-select': '^2.0.0',
    '@radix-ui/react-slot': '^1.0.2',
    '@radix-ui/react-tabs': '^1.0.4',
    '@radix-ui/react-toast': '^1.1.5',
    '@supabase/supabase-js': '2.30.0',
    'class-variance-authority': '^0.7.0',
    'clsx': '^2.0.0',
    'date-fns': '^2.30.0',
    'framer-motion': '^10.16.4',
    'lucide-react': '^0.292.0',
    'react': '^18.2.0',
    'react-dom': '^18.2.0',
    'react-helmet': '^6.1.0',
    'react-router-dom': '^6.24.1',
    'tailwind-merge': '^1.1.4',
    'tailwindcss-animate': '^1.0.7',
  },
  devDependencies: {
    '@vitejs/plugin-react': '^4.0.3',
    'autoprefixer': '^10.4.16',
    'postcss': '^8.4.31',
    'tailwindcss': '^3.3.3',
    'vite': '^4.4.5',
  },
};
fs.writeFileSync(path.join(TARGET, 'package.json'), JSON.stringify(pkg, null, 2));

// 2. vite.config.js (simple)
const viteConfig = `import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
`;
fs.writeFileSync(path.join(TARGET, 'vite.config.js'), viteConfig);

// 3. tailwind.config.js, postcss.config.js, index.html
copyFile('tailwind.config.js', 'tailwind.config.js');
copyFile('postcss.config.js', 'postcss.config.js');
fs.writeFileSync(
  path.join(TARGET, 'index.html'),
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CRM - Planeje</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
);

// 4. src/main.jsx
mkdirp(path.join(TARGET, 'src'));
const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '@/App';
import '@/index.css';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { ModuleSettingsProvider } from '@/contexts/ModuleSettingsContext';
import '@/lib/customSupabaseClient';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from '@/components/ErrorBoundary';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <ModuleSettingsProvider>
            <App />
            <Toaster />
          </ModuleSettingsProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
`;
fs.writeFileSync(path.join(TARGET, 'src/main.jsx'), mainJsx);

// 5. src/App.jsx (CRM-only routes)
const appJsx = `import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import MainLayoutCliente from '@/components/layout/MainLayoutCliente';
import ClientLogin from '@/components/auth/ClientLogin';
import ClientCRM from '@/components/pages/ClientCRM';
import LeadDetailPage from '@/components/pages/LeadDetailPage';
import CrmLayout from '@/components/pages/CrmLayout';

function ProtectedClientRoute({ children }) {
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }
  if (!session || !profile) return <Navigate to="/login-cliente" replace />;
  const isClient = profile.role === 'cliente' && profile.cliente_id;
  const isAdmin = profile.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role);
  if (!isClient && !isAdmin) return <Navigate to="/login-cliente" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login-cliente" element={<ClientLogin />} />
      <Route path="/" element={<ProtectedClientRoute><MainLayoutCliente /></ProtectedClientRoute>}>
        <Route index element={<Navigate to="/crm" replace />} />
        <Route path="crm" element={<CrmLayout />}>
          <Route index element={<Navigate to="leads" replace />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path=":tab" element={<ClientCRM />} />
        </Route>
        <Route path="*" element={<Navigate to="/crm" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
`;
fs.writeFileSync(path.join(TARGET, 'src/App.jsx'), appJsx);

// 6. ModuleSettingsContext (minimal - always allow crm)
mkdirp(path.join(TARGET, 'src/contexts'));
const moduleContext = `import React, { createContext, useContext, useState } from 'react';

const ModuleSettingsContext = createContext();

export const useModuleSettings = () => useContext(ModuleSettingsContext);

export const ModuleSettingsProvider = ({ children }) => {
  const [moduleSettings] = useState({ crm: true });
  const [loading] = useState(false);
  const hasPageAccess = () => true;
  return (
    <ModuleSettingsContext.Provider value={{ moduleSettings, loading, hasPageAccess }}>
      {children}
    </ModuleSettingsContext.Provider>
  );
};
`;
fs.writeFileSync(path.join(TARGET, 'src/contexts/ModuleSettingsContext.jsx'), moduleContext);

// 7. Copy directories
copyRecursive(path.join(ROOT, 'src/components/crm'), path.join(TARGET, 'src/components/crm'));
copyRecursive(path.join(ROOT, 'src/components/ui'), path.join(TARGET, 'src/components/ui'));
copyRecursive(path.join(ROOT, 'src/components/leads'), path.join(TARGET, 'src/components/leads'));
copyRecursive(path.join(ROOT, 'src/hooks/leads'), path.join(TARGET, 'src/hooks/leads'));

mkdirp(path.join(TARGET, 'src/components/pages'));
for (const f of CRM_PAGES) {
  const src = path.join(ROOT, 'src/components/pages', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'src/components/pages', f));
}

mkdirp(path.join(TARGET, 'src/components/layout'));
fs.copyFileSync(
  path.join(ROOT, 'src/components/layout/MainLayoutCliente.jsx'),
  path.join(TARGET, 'src/components/layout/MainLayoutCliente.jsx')
);

mkdirp(path.join(TARGET, 'src/components/client'));
for (const name of ['SidebarCliente.jsx', 'BottomNavCliente.jsx']) {
  const src = path.join(ROOT, 'src/components/client', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'src/components/client', name));
}

mkdirp(path.join(TARGET, 'src/components/auth'));
for (const name of ['ClientLogin.jsx', 'ProtectedClientRoute.jsx', 'ProtectedClientPageRoute.jsx']) {
  const src = path.join(ROOT, 'src/components/auth', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'src/components/auth', name));
}

for (const name of ['SupabaseAuthContext.jsx', 'ClienteCrmSettingsContext.jsx', 'CrmRefreshContext.jsx']) {
  fs.copyFileSync(
    path.join(ROOT, 'src/contexts', name),
    path.join(TARGET, 'src/contexts', name)
  );
}

const hooks = [
  'useCrmPipeline.js', 'useLeads.js', 'useClienteWhatsAppConfig.js', 'useLeadVendas.js',
  'useCrmContactAutomations.js', 'useClientMembers.js', 'useMediaQuery.js',
];
mkdirp(path.join(TARGET, 'src/hooks'));
for (const name of hooks) {
  const src = path.join(ROOT, 'src/hooks', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'src/hooks', name));
}

const libs = ['customSupabaseClient.js', 'contactFromWebhookPayload.js', 'uazapiInboxPayload.js', 'crmFunnelValidation.js', 'leadUtils.js', 'utils.js'];
mkdirp(path.join(TARGET, 'src/lib'));
for (const name of libs) {
  const src = path.join(ROOT, 'src/lib', name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'src/lib', name));
}

mkdirp(path.join(TARGET, 'src/components/admin'));
fs.copyFileSync(
  path.join(ROOT, 'src/components/admin/ClientUserManager.jsx'),
  path.join(TARGET, 'src/components/admin/ClientUserManager.jsx')
);

fs.copyFileSync(path.join(ROOT, 'src/index.css'), path.join(TARGET, 'src/index.css'));
const errBound = path.join(ROOT, 'src/components/ErrorBoundary.jsx');
if (fs.existsSync(errBound)) fs.copyFileSync(errBound, path.join(TARGET, 'src/components/ErrorBoundary.jsx'));

// 8. Supabase migrations (base clientes + profiles first, then CRM list)
mkdirp(path.join(TARGET, 'supabase/migrations'));
const baseMigration = `-- Tabelas base para o CRM standalone: clientes e profiles
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'cliente',
  allowed_pages text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_cliente_id ON public.profiles(cliente_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_by_cliente" ON public.profiles;
CREATE POLICY "profiles_select_by_cliente" ON public.profiles FOR SELECT
  USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (new.id, 'cliente');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;
fs.writeFileSync(path.join(TARGET, 'supabase/migrations/20260125000000_create_clientes_profiles.sql'), baseMigration);

for (const m of CRM_MIGRATIONS) {
  const src = path.join(ROOT, 'supabase/migrations', m);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, 'supabase/migrations', m));
}

// 9. Edge Functions
for (const fn of ['uazapi-inbox-webhook', 'create-lead-from-contact', 'apicebot-inbox-webhook']) {
  const srcDir = path.join(ROOT, 'supabase/functions', fn);
  if (fs.existsSync(srcDir)) copyRecursive(srcDir, path.join(TARGET, 'supabase/functions', fn));
}

// 10. .env.example
fs.writeFileSync(
  path.join(TARGET, '.env.example'),
  `# Supabase (novo projeto)
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
`
);

// 11. README
const readme = `# Planeje CRM (standalone)

CRM do cliente extraído do Planeje – leads, contatos, canais WhatsApp, automações, vendas.

## Pré-requisitos

- Node 18+
- Conta Supabase

## Setup

1. Crie um novo projeto em [Supabase](https://supabase.com).
2. Em SQL Editor, crie as tabelas base \`clientes\` e \`profiles\` (veja \`supabase/migrations/README_MIGRATIONS.md\` ou rode as migrations na ordem do nome).
3. Copie \`.env.example\` para \`.env\` e preencha \`VITE_SUPABASE_URL\` e \`VITE_SUPABASE_ANON_KEY\`.
4. \`npm install\` e \`npm run dev\`.
5. Deploy das Edge Functions: \`supabase functions deploy uazapi-inbox-webhook\`, \`create-lead-from-contact\`, \`apicebot-inbox-webhook\`.

## Migrations

As migrations em \`supabase/migrations/\` devem ser aplicadas em ordem cronológica (nome do arquivo). O CRM depende de \`clientes\` e \`profiles\` – se seu projeto ainda não tiver essas tabelas, crie-as antes (ex.: \`clientes\` com \`id\`, \`empresa\`; \`profiles\` com \`id\`, \`cliente_id\`, \`role\`, vinculado a \`auth.users\`).
`;
fs.writeFileSync(path.join(TARGET, 'README.md'), readme);

console.log('Done. Target:', TARGET);
console.log('Next: cd', path.basename(TARGET), '&& npm install && cp .env.example .env');
