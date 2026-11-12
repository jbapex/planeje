import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { handleCrmIaMessage } from './message.js';

serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = { persistSession: false, autoRefreshToken: false };
  return handleCrmIaMessage({ req,
    voiceAvailable: () => Boolean(Deno.env.get('OPENAI_API_KEY')),
    makeCaller: (authorization: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth, global: { headers: { Authorization: authorization } } }),
    db: createClient(url, key, { auth }),
    download: async (payload: Record<string, unknown>, authorization: string) => {
      const result = await fetch(`${url}/functions/v1/uazapi-download-media`, { method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
      const data = await result.json();
      if (!result.ok || data?.error) throw new Error('media_unavailable');
      return { url: data.url, mimetype: data.mimetype, fileName: data.fileName };
    },
    send: async (payload: Record<string, unknown>) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const result = await fetch(`${url}/functions/v1/uazapi-send-message`, { method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const receipt = await result.json().catch(() => null);
        return { ok: result.ok && receipt?.success === true, messageId: receipt?.message_id || null,
          definitive: [400, 401, 403, 404, 405, 409, 422].includes(result.status) };
      } finally { clearTimeout(timeout); }
    },
  });
});
