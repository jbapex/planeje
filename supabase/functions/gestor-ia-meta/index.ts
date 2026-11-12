import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { getGestorMeta } from './readings.js';
import { createMetaCache } from './cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Planeje-Meta-Read': 'saved-v4',
};
const auth = { persistSession: false, autoRefreshToken: false };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const serverDb = () => createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth });
  return getGestorMeta({
    req,
    body: req.method === 'POST' ? await req.json().catch(() => null) : null,
    corsHeaders,
    makeCaller: (token: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth, global: { headers: { Authorization: `Bearer ${token}` } },
    }),
    makeCache: () => createMetaCache(serverDb()),
    async readToken() {
      const token = Deno.env.get('META_SYSTEM_USER_ACCESS_TOKEN');
      if (token) return token;
      const { data, error } = await serverDb().rpc('get_encrypted_secret', { p_secret_name: 'META_SYSTEM_USER_ACCESS_TOKEN' });
      return !error && typeof data === 'string' ? data : null;
    },
  });
});
