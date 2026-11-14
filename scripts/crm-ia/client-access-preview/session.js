import { createCrmPreview, PREVIEW_IDS } from '../preview/fixture.js';
import { clientHasPageAccess } from '../../../src/lib/clientAllowedPages.js';

const options = new URLSearchParams(globalThis.location?.search || '');
const role = options.get('perfil') === 'agencia' ? 'superadmin' : 'cliente';
export const fixture = createCrmPreview({ role });
const A = PREVIEW_IDS.clientA;
if (role === 'cliente') Object.assign(fixture.profile, { cliente_id: A, allowed_pages: ['crm-ia'] });
let enabled = role === 'cliente' && options.get('estado') !== 'desligado', revision = 1;
const person = { id: role === 'cliente' ? fixture.profile.id : PREVIEW_IDS.otherPerson, user_id: role === 'cliente' ? fixture.profile.id : PREVIEW_IDS.otherPerson,
  full_name: 'Pessoa de demonstração', role: 'cliente', cliente_id: A, status: 'active', allowed_pages: null, nivel: '', ativo: false, revision: '1' };
export const events = [];
const status = () => ({ client: { id: A, empresa: 'Empresa de demonstração', active: true }, enabled, updated_at: String(revision), members: [structuredClone(person)] });
export const useAuth = () => ({ profile: fixture.profile, user: { id: fixture.profile.id }, loading: false, hasPageAccess: key => clientHasPageAccess(fixture.profile, key), signOut: () => {} });
export const useModuleSettings = () => ({ moduleSettings: { crm: true }, moduleAccess: {}, loading: false });
export const useAtendimentoLojaMembro = () => ({ gate: false, nivel: null, loading: false });
export const useAtlasEntryAccess = () => false;
export default function AtlasEntry() { return null; }
export const supabaseUrl = 'https://fixture.invalid', supabaseAnonKey = 'fixture';
export const getSupabaseFunctionsBaseUrl = () => `${supabaseUrl}/functions/v1`;
export const supabase = {
  async rpc(name, args = {}) {
    try {
      if (name === 'crm_ia_client_access') return { data: { enabled, client_id: A, nivel: 'admin' } };
      if (name === 'crm_ia_access_admin') {
        if (role !== 'superadmin' || args.p_client_id !== A) throw Error('Acesso negado na prévia.');
        const payload = args.p_payload || {};
        if (args.p_action === 'set_enabled') {
          if (payload.expected_updated_at !== String(revision)) throw Error('A liberação foi alterada.');
          enabled = payload.enabled; revision++; events.push({ action: 'set_enabled', enabled, no_transport: true });
        } else if (args.p_action === 'save_member') {
          if (payload.expected_revision !== person.revision || payload.user_id !== person.id) throw Error('As permissões foram alteradas.');
          if (payload.allowed_pages?.includes('crm-ia') && (!enabled || !payload.nivel)) throw Error('Libere a conta e escolha o nível de acesso.');
          Object.assign(person, { allowed_pages: payload.allowed_pages, nivel: payload.nivel, ativo: true, revision: String(Number(person.revision) + 1) });
          events.push({ action: 'save_member', nivel: person.nivel, pages: person.allowed_pages, no_password_change: true });
        }
        return { data: status() };
      }
      if (name !== 'crm_ia_workspace' || args.p_client_id !== A || !enabled) throw Object.assign(Error('Sem acesso a esta conta.'), { code: '42501' });
      const data = await fixture.request(args.p_action, A, args.p_payload || {});
      if (args.p_action === 'workspace') return { data: { ...data, agents: [], bases: [], templates: [], lead_profiles: [],
        permissions: { customer: true, operate: true, configure: false, manage: false, provision: false, conversations: true, tracking: false, apply_profile: false } } };
      return { data };
    } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
  },
  from(table) {
    if (!['profiles', 'clientes', 'public_config'].includes(table)) throw Error(`Tabela fora da prévia: ${table}`);
    let single = false;
    const rows = table === 'profiles' ? [structuredClone(person)] : table === 'clientes' ? [{ id: A, empresa: 'Empresa de demonstração', etapa: 'closed', logo_urls: [], painel_cor: null }] : [];
    const query = { select() { return query; }, eq() { return query; }, order() { return query; }, maybeSingle() { single = true; return query; }, single() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject); } };
    return query;
  },
  functions: { invoke: async () => ({ data: null, error: { message: 'Transporte não disponível nesta prévia.' } }) },
};
export const invokeEdgeFunction = (name, body) => supabase.functions.invoke(name, { body });
