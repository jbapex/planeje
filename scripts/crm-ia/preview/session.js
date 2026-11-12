import { createCrmPreview } from './fixture.js';

const options = new URLSearchParams(globalThis.location?.search || '');
export const previewState = options.get('estado') || 'ready';
export const fixture = createCrmPreview({ state: previewState, ...(options.get('perfil') === 'colaborador' && { role: 'colaborador' }) });
const blocked = ['forbidden', 'negado'].includes(previewState);
const user = { id: fixture.profile.id };
const moduleSettings = { crm: !blocked, clients: true, atendimento: true, rastreamento: true, paid_traffic: true, tasks: true, assistant: true, reports: true, projects: true };
const moduleAccess = { crm: fixture.profile.role === 'colaborador' ? 'responsible' : 'all', clients: 'all', tasks: 'all' };

export const useAuth = () => ({ user, profile: fixture.profile, loading: false, canViewField: () => true });
export const useModuleSettings = () => ({ moduleSettings, moduleAccess, loading: false });
export const useAtlasEntryAccess = userId => Boolean(userId && !blocked && previewState !== 'sem-atlas');
export default function AtlasEntry() { return null; }
export const supabaseUrl = 'https://fixture.invalid';
export const supabaseAnonKey = 'fixture';
export const getSupabaseFunctionsBaseUrl = () => `${supabaseUrl}/functions/v1`;

async function result(operation) {
  try { return { data: await operation(), error: null }; }
  catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
}
export const supabase = {
  rpc(name, args = {}) {
    if (name !== 'crm_ia_workspace') return Promise.resolve({ data: null, error: { message: `RPC fora do contrato da prévia: ${name}` } });
    return result(() => fixture.request(args.p_action, args.p_client_id, args.p_payload || {}));
  },
  functions: { invoke: (name, options) => result(() => fixture.invoke(name, options)) },
  from() { throw new Error('Leitura direta de tabela bloqueada: use o contrato isolado da prévia.'); },
};
export const invokeEdgeFunction = (name, body) => supabase.functions.invoke(name, { body });
