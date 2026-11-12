/**
 * Dispara lembretes WhatsApp agendados em atendimento_conversa_planejamento.
 * Rode via cron a cada minuto com header x-atendimento-planejamento-secret.
 *
 * Deploy: supabase functions deploy atendimento-planejamento-scheduler
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dispatchCrmIaQueue, dispatchLegacyCrmIaQueue } from '../_shared/crmIaDelivery.js';
import { drainCalendarJobs } from '../_shared/crmIaCalendar.js';
import { loadCalendarConfig } from '../_shared/crmIaCalendarHandler.js';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-atendimento-planejamento-secret',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('ATENDIMENTO_PLANEJAMENTO_CRON_SECRET');
  if (!secret || req.headers.get('x-atendimento-planejamento-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Missing Supabase env' }, 500);
  const db = createClient(url, key);
  const now = new Date().toISOString();
  const send = async (payload: Record<string, unknown>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${url}/functions/v1/uazapi-send-message`, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      return {
        ok: response.ok && !data?.error && (data?.success === true || data?.ok === true),
        definitive: !response.ok && [400, 401, 403, 404, 405, 409, 422].includes(response.status),
        messageId: data?.message_id == null ? null : String(data.message_id),
      };
    } finally { clearTimeout(timer); }
  };
  const generateFollowup = async (row: Record<string, any>) => {
    const response = await fetch(`${url}/functions/v1/atendimento-ia`, { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'followup', cliente_id: row.cliente_id, contact_id: row.contact_id,
        whatsapp_config_id: row.ia_followup_whatsapp_config_id,
        message_id: row.crm_ia_runtime?.no_show?.state === 'pending'
          ? `no-show:${row.crm_ia_runtime.no_show.appointment_id}:${row.crm_ia_runtime.no_show.appointment_updated_at}:1`
          : `followup:${row.id}:${row.ia_followup_due_at}:${row.ia_followup_passo}` }),
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) throw new Error('crm_ia_generation_unavailable');
    const result = await response.json();
    return { queued: result.queued === true, skipped: result.skipped || null };
  };
  try {
    const legacy = await dispatchLegacyCrmIaQueue({ db, send, generateFollowup, now });
    let calendar;
    const calendarDeadline = new AbortController();
    const calendarTimer = setTimeout(() => calendarDeadline.abort(), 12000);
    try { calendar = await drainCalendarJobs({ db, config: await loadCalendarConfig(db, { env: name => Deno.env.get(name), supabaseUrl: url }), limit: 1,
      fetchImpl: (target, options) => fetch(target, { ...options, signal: calendarDeadline.signal }) }); }
    catch { calendar = { error: 'calendar_sync_unavailable' }; }
    finally { clearTimeout(calendarTimer); }
    const queue = await dispatchCrmIaQueue({ db, send, now });
    const reminders = legacy.results.filter((item: { kind: string }) => item.kind === 'reminder');
    const followup = legacy.results.filter((item: { kind: string }) => item.kind === 'followup');
    return json({ processed: reminders.length, results: reminders, followup: { processed: followup.length, results: followup }, calendar, queue, checked_at: now });
  } catch {
    console.error('[atendimento-planejamento-scheduler] delivery_tick_failed');
    return json({ error: 'delivery_tick_failed' }, 500);
  }
});
