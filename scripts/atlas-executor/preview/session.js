export const OWNER = '00000000-0000-4000-8000-000000000001';
export const CLIENT = '00000000-0000-4000-8000-000000000002';
const user = { id: OWNER };
const profile = { id: OWNER, full_name: 'Operador sintético', role: 'superadmin', status: 'active', email: 'fixture@example.invalid' };
const moduleSettings = Object.fromEntries(['assistant', 'clients', 'tasks', 'crm', 'atendimento', 'paid_traffic', 'projects', 'dashboard', 'financeiro', 'onboarding', 'automacoes', 'requests', 'social', 'reports', 'cobertura', 'pgm'].map(key => [key, true]));
export const useAuth = () => ({ user, profile, signOut: async () => {} });
export const useModuleSettings = () => ({ moduleSettings, loading: false });
export const useAtendimentoSidebarBadge = () => ({ badgeTotal: 0 });
export const useCaixaPendenciasBadge = () => ({ badgeTotal: 0 });
export default function useAtlasInbox() { return { unread: 0, items: [], loading: false, visible: true }; }
export const supabaseUrl = 'http://127.0.0.1:4417';
export const supabaseAnonKey = 'synthetic-fixture';
export const supabase = {
  from(table) {
    if (table !== 'atlas_settings') throw new Error('Consulta bloqueada na fixture sintética: ' + table);
    const filters = {};
    const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: filters.owner_id && filters.owner_id !== OWNER ? null : { owner_id: OWNER, enabled: true }, error: null }) };
    return query;
  },
  rpc: async name => { if (name === 'atlas_demand_access') return { data: false, error: null }; throw new Error('RPC bloqueada na fixture sintética: ' + name); },
  auth: { getSession: async () => ({ data: { session: null } }) },
};
