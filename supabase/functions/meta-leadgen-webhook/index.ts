/**
 * Webhook para receber notificações em tempo real do Meta (Lead Ads - leadgen).
 * Quando um novo lead preenche um formulário, o Meta envia um POST aqui.
 * Configuração: Meta Developer Console > Webhooks > Page > leadgen.
 * URL: https://<projeto>.supabase.co/functions/v1/meta-leadgen-webhook
 * Token de verificação: configure META_LEADGEN_WEBHOOK_VERIFY_TOKEN no Supabase (Secrets).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const verifyToken = Deno.env.get('META_LEADGEN_WEBHOOK_VERIFY_TOKEN') ?? 'planeje-leadgen-verify';

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { object?: string; entry?: Array<{ id?: string; time?: number; changes?: Array<{ field?: string; value?: { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; created_time?: number } }> }> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (body?.object !== 'page' || !Array.isArray(body?.entry)) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const leadgenIds: { leadgen_id: string; page_id: string }[] = [];

  for (const entry of body.entry) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      if (change?.field !== 'leadgen' || !change?.value) continue;
      const v = change.value;
      const leadgenId = v.leadgen_id != null ? String(v.leadgen_id) : null;
      const pageId = v.page_id != null ? String(v.page_id) : null;
      if (leadgenId && pageId) leadgenIds.push({ leadgen_id: leadgenId, page_id: pageId });
    }
  }

  if (leadgenIds.length === 0) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const configsByPage = new Map<string, { cliente_id: string; pipeline_id: string; stage_id: string }>();
  const { data: configs } = await supabase
    .from('cliente_meta_leadgen_webhook')
    .select('cliente_id, meta_page_id, pipeline_id, stage_id')
    .eq('is_active', true)
    .in('meta_page_id', [...new Set(leadgenIds.map((x) => x.page_id))]);
  for (const row of configs ?? []) {
    configsByPage.set(row.meta_page_id, {
      cliente_id: row.cliente_id,
      pipeline_id: row.pipeline_id,
      stage_id: row.stage_id,
    });
  }

  const functionsUrl = `${supabaseUrl}/functions/v1`;
  let imported = 0;
  let skipped = 0;

  for (const { leadgen_id, page_id } of leadgenIds) {
    const config = configsByPage.get(page_id);
    if (!config) {
      skipped += 1;
      continue;
    }

    const resMeta = await fetch(`${functionsUrl}/meta-ads-api`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get-lead-by-id', leadgen_id }),
    });
    const metaData = await resMeta.json();
    const lead = metaData?.lead;
    if (!lead || metaData?.error) {
      skipped += 1;
      continue;
    }

    const phone = lead.telefone && String(lead.telefone).replace(/\D/g, '').length >= 10 ? lead.telefone : null;
    if (!phone) {
      skipped += 1;
      continue;
    }

    const trackingData: Record<string, unknown> = {
      meta_lead_id: lead.id,
      form_id: lead.form_id,
      ad_id: lead.ad_id,
      field_data: lead.field_data ?? {},
      created_time: lead.created_time,
    };

    const resCreate = await fetch(`${functionsUrl}/create-lead-from-contact`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cliente_id: config.cliente_id,
        phone,
        sender_name: lead.nome ?? null,
        pipeline_id: config.pipeline_id,
        stage_id: config.stage_id,
        origin_source: 'meta_ads',
        tracking_data: trackingData,
      }),
    });
    const createResult = await resCreate.json();
    if (createResult?.created) imported += 1;
    else skipped += 1;
  }

  return new Response(
    JSON.stringify({ received: true, imported, skipped }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
