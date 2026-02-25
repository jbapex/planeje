/**
 * Sincronização automática de leads do Meta por Form ID (polling).
 * Invocada a cada 1 minuto por cron (externo ou pg_cron). Busca configs em
 * cliente_meta_leadgen_polling, para cada uma chama get-leads-by-form e importa
 * via create-lead-from-contact. Protegida por META_LEADGEN_SYNC_SECRET.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return false;
  return String(phone).replace(/\D/g, '').length >= 10;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const syncSecret = Deno.env.get('META_LEADGEN_SYNC_SECRET') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') ?? '';

  const authorized = syncSecret && (token === syncSecret || querySecret === syncSecret);
  if (!authorized) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Missing or invalid META_LEADGEN_SYNC_SECRET' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  const { data: configs, error: configError } = await supabase
    .from('cliente_meta_leadgen_polling')
    .select('id, cliente_id, form_id, pipeline_id, stage_id, last_synced_at')
    .eq('is_active', true);

  if (configError) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch configs', details: configError.message, configs_processed: 0, leads_imported: 0, errors: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const rows = configs ?? [];
  let totalImported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const since = new Date(row.last_synced_at).getTime() / 1000 - 120; // 2 minutos atrás
    const sinceTs = Math.floor(since);

    try {
      const resMeta = await fetch(`${functionsUrl}/meta-ads-api`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get-leads-by-form',
          form_id: row.form_id,
          since: sinceTs,
          limit: 100,
        }),
      });
      const metaData = await resMeta.json();
      if (metaData?.error) {
        errors.push(`form_id=${row.form_id}: ${metaData.error.message || JSON.stringify(metaData.error)}`);
        continue;
      }

      const leads = metaData.leads ?? [];
      let imported = 0;
      for (const lead of leads) {
        if (!isValidPhone(lead.telefone)) continue;
        const trackingData: Record<string, unknown> = {
          meta_lead_id: lead.id,
          form_id: lead.form_id ?? row.form_id,
          ad_id: lead.ad_id ?? null,
          field_data: lead.field_data ?? {},
          created_time: lead.created_time ?? null,
        };
        const resCreate = await fetch(`${functionsUrl}/create-lead-from-contact`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cliente_id: row.cliente_id,
            phone: lead.telefone,
            sender_name: lead.nome ?? null,
            pipeline_id: row.pipeline_id,
            stage_id: row.stage_id,
            origin_source: 'meta_ads',
            tracking_data: trackingData,
          }),
        });
        const createResult = await resCreate.json();
        if (createResult?.created) imported += 1;
      }
      totalImported += imported;

      const { error: updateErr } = await supabase
        .from('cliente_meta_leadgen_polling')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateErr) errors.push(`form_id=${row.form_id} update last_synced_at: ${updateErr.message}`);
    } catch (err) {
      errors.push(`form_id=${row.form_id}: ${err?.message ?? String(err)}`);
    }
  }

  return new Response(
    JSON.stringify({
      configs_processed: rows.length,
      leads_imported: totalImported,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
