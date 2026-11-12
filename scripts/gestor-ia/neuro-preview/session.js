import { createClient } from '@supabase/supabase-js';

export const profile = { id: '00000000-0000-0000-0000-000000000001', role: 'colaborador', status: 'active', full_name: 'Gestora sintética' };
const modules = { paid_traffic: true, rastreamento: true, clients: false, tasks: false, assistant: false, reports: false };
export const useAuth = () => ({ user: { id: profile.id }, profile, loading: false,
  canViewField: (field) => ['responsavel', 'nicho'].includes(field), hasPageAccess: () => true });
export const useModuleSettings = () => ({ moduleSettings: modules, moduleAccess: {}, loading: false });
export const supabaseUrl = location.origin;
export const supabaseAnonKey = 'fixture-anon-only';
const session = { access_token: 'fixture-human-only', user: { id: profile.id } };
const localFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.origin);
  if (url.origin !== location.origin || url.hostname !== '127.0.0.1') return Promise.reject(new Error('Rede externa bloqueada na prévia Neuro.'));
  return localFetch(input, init);
};
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` }, fetch: window.fetch },
});
supabase.auth.getSession = async () => ({ data: { session }, error: null });
supabase.auth.onAuthStateChange = (callback) => {
  queueMicrotask(() => callback('INITIAL_SESSION', session));
  return { data: { subscription: { unsubscribe() {} } } };
};
const channel = { on: () => channel, subscribe: () => channel };
supabase.channel = () => channel;
supabase.removeChannel = async () => 'ok';
export const getSupabaseFunctionsBaseUrl = () => `${supabaseUrl}/functions/v1`;
export const invokeEdgeFunction = (name, body) => supabase.functions.invoke(name, { body });
