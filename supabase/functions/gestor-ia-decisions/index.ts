import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { createDecisionHandler } from './analysis.js';
import { DecisionProviderError, requestDecisionModel } from './provider.js';
import { createMetaCache } from '../gestor-ia-meta/cache.js';

const auth = { persistSession: false, autoRefreshToken: false };

function openService() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new DecisionProviderError('PILOT_STORAGE');
  return createClient(url, serviceKey, { auth });
}

async function providerKey(admin: ReturnType<typeof openService>) {
  let key = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!key) {
    const { data, error } = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENAI_API_KEY' });
    if (!error && typeof data === 'string') key = data.trim();
  }
  if (!key) throw new DecisionProviderError('PROVIDER_CONFIG');
  return key;
}

serve(createDecisionHandler({
  pilot: () => Deno.env.get('GESTOR_IA_DECISIONS_ENABLED') === 'true' ? {
    actorId: Deno.env.get('GESTOR_IA_DECISIONS_PILOT_USER_ID')?.trim(),
    clientId: Deno.env.get('GESTOR_IA_DECISIONS_PILOT_CLIENT_ID')?.trim(),
    runId: Deno.env.get('GESTOR_IA_DECISIONS_PILOT_RUN_ID')?.trim(),
  } : null,
  openCaller: (authorization: string) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth, global: { headers: { Authorization: authorization } },
  }),
  openCache: () => createMetaCache(openService()),
  checkPilot: async ({ runId }: { runId: string }) => {
    const admin = openService();
    const { data, error } = await admin.rpc('gestor_ia_piloto_disponivel', { p_pilot_id: runId });
    if (error || typeof data !== 'boolean') throw new DecisionProviderError('PILOT_STORAGE');
    if (!data) throw new DecisionProviderError('PILOT_USED');
    await providerKey(admin);
  },
  callModel: async (messages: Array<{ role: string; content: string }>, scope: { runId: string; actorId: string; clientId: string }) => {
    const admin = openService();
    const key = await providerKey(admin);
    const { data: claimed, error: claimError } = await admin.rpc('gestor_ia_reservar_piloto', {
      p_pilot_id: scope.runId, p_actor_id: scope.actorId, p_client_id: scope.clientId,
    });
    if (claimError || typeof claimed !== 'boolean') throw new DecisionProviderError('PILOT_STORAGE');
    if (!claimed) throw new DecisionProviderError('PILOT_USED');
    return requestDecisionModel({ key, messages });
  },
}));
