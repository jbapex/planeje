/**
 * CRM-APICE → Planeje (status do lead na etiqueta Contatos).
 *
 * Lê configuração no POSTGRES do Ápice (qualquer cliente pode ter sua linha em crm_planeje_status_sync).
 * Config global (uma linha id=1): secret do Database Webhook + URL padrão do Planeje.
 *
 * Fallback opcional (se ainda não preencheu no app): env APICE_NOTIFY_INCOMING_SECRET, PLANEJE_STATUS_WEBHOOK_URL
 *
 * Database Webhook: POST esta função com Authorization Bearer = global.apice_database_webhook_secret (ou env).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LeadRow = {
  id?: string;
  cliente_id?: string;
  whatsapp?: string | null;
  status?: string | null;
};

type GlobalRow = {
  apice_database_webhook_secret: string | null;
  planeje_default_status_webhook_url: string | null;
};

type SyncRow = {
  planeje_bearer_secret: string | null;
  planeje_status_webhook_url: string | null;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function trimStr(v: string | null | undefined): string {
  return v != null ? String(v).trim() : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Variáveis Supabase do Ápice ausentes' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: globalRow, error: globalErr } = await supabase
    .from('crm_planeje_global_settings')
    .select('apice_database_webhook_secret, planeje_default_status_webhook_url')
    .eq('id', 1)
    .maybeSingle();

  if (globalErr) {
    console.error('[notify-planeje-lead-status] global read', globalErr.message);
    return jsonResponse({ error: 'Erro ao ler configuração global' }, 500);
  }

  const g = (globalRow ?? null) as GlobalRow | null;
  const incomingFromDb = trimStr(g?.apice_database_webhook_secret);
  const incomingFromEnv = trimStr(Deno.env.get('APICE_NOTIFY_INCOMING_SECRET'));
  const incomingSecret = incomingFromDb || incomingFromEnv;

  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!incomingSecret || bearer !== incomingSecret) {
    return jsonResponse(
      {
        error:
          'Não autorizado. Configure em Integrações Planeje (admin) o secret do webhook de banco ou defina APICE_NOTIFY_INCOMING_SECRET.',
      },
      401
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const type = String(payload.type ?? payload.eventType ?? '');
  const table = String(payload.table ?? '');

  const record = payload.record as LeadRow | undefined;
  const oldRecord = payload.old_record as LeadRow | undefined;

  if (table !== 'leads' || type !== 'UPDATE') {
    return jsonResponse({ ok: true, skipped: true, reason: 'not_leads_update' }, 200);
  }

  if (!record?.cliente_id) {
    return jsonResponse({ error: 'record.cliente_id ausente' }, 400);
  }

  const newStatus = record.status != null ? String(record.status).trim() : '';
  const oldStatus = oldRecord?.status != null ? String(oldRecord.status).trim() : '';

  if (!newStatus || newStatus === oldStatus) {
    return jsonResponse({ ok: true, skipped: true, reason: 'status_unchanged_or_empty' }, 200);
  }

  const phone = record.whatsapp != null ? String(record.whatsapp).trim() : '';
  if (!phone) {
    return jsonResponse({ ok: true, skipped: true, reason: 'lead_sem_whatsapp' }, 200);
  }

  const { data: cfg, error: cfgErr } = await supabase
    .from('crm_planeje_status_sync')
    .select('planeje_bearer_secret, planeje_status_webhook_url')
    .eq('cliente_id', record.cliente_id)
    .maybeSingle();

  if (cfgErr) {
    console.error('[notify-planeje-lead-status] sync read', cfgErr.message);
    return jsonResponse({ error: 'Erro ao ler crm_planeje_status_sync' }, 500);
  }

  const row = (cfg ?? null) as SyncRow | null;
  const planejeBearer = trimStr(row?.planeje_bearer_secret);
  if (!planejeBearer) {
    return jsonResponse(
      {
        ok: true,
        skipped: true,
        reason: 'cliente_sem_config_planeje',
        cliente_id: record.cliente_id,
        hint: 'O cliente deve salvar o Bearer do Planeje na tela Integrações → Planeje.',
      },
      200
    );
  }

  const urlPerClient = trimStr(row?.planeje_status_webhook_url);
  const urlFromGlobal = trimStr(g?.planeje_default_status_webhook_url);
  const urlFromEnv = trimStr(Deno.env.get('PLANEJE_STATUS_WEBHOOK_URL'));
  const planejeUrl = urlPerClient || urlFromGlobal || urlFromEnv;

  if (!planejeUrl) {
    return jsonResponse(
      {
        error:
          'URL do webhook de status do Planeje não configurada. Admin: preencha URL padrão na config global ou defina PLANEJE_STATUS_WEBHOOK_URL.',
      },
      500
    );
  }

  const body = {
    cliente_id: record.cliente_id,
    phone,
    status: newStatus,
  };

  let planejeRes: Response;
  try {
    planejeRes = await fetch(planejeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${planejeBearer}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[notify-planeje-lead-status] fetch planeje', e);
    return jsonResponse({ error: 'Falha de rede ao chamar Planeje', detail: String(e) }, 502);
  }

  const text = await planejeRes.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!planejeRes.ok) {
    console.error('[notify-planeje-lead-status] planeje status', planejeRes.status, text.slice(0, 500));
    return jsonResponse(
      {
        ok: false,
        planeje_status: planejeRes.status,
        planeje_body: parsed,
      },
      502
    );
  }

  return jsonResponse(
    {
      ok: true,
      forwarded: true,
      lead_id: record.id,
      planeje_response: parsed,
    },
    200
  );
});
