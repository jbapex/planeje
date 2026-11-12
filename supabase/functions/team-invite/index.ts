import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { acceptTeamInvite, usableTeamInvite, validateInviteInput } from '../_shared/teamInvite.js';

const headers = {
  'Access-Control-Allow-Origin': 'https://planeje.jbapex.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    if (Number(req.headers.get('Content-Length') || 0) > 4096) return json({ error: 'Pedido inválido' }, 400);
    const body = await req.json();
    const token = validateInviteInput(body);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Serviço indisponível' }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === 'accept') return json(await acceptTeamInvite(admin, body));
    const { data: invite } = await admin.from('invites')
      .select('recipient_email,role,created_by,expires_at,consumed_at,used_by').eq('token', token).maybeSingle();
    const { data: owner } = invite ? await admin.from('profiles').select('id,role,status')
      .eq('id', invite.created_by).maybeSingle() : { data: null };
    if (!usableTeamInvite(invite, owner)) return json({ error: 'Convite inválido, expirado ou já utilizado.' }, 400);
    return json({ recipient_email: invite.recipient_email, role: invite.role, expires_at: invite.expires_at });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir o convite.' }, 400);
  }
});
