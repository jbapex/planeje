/**
 * GET /r/:slug — grava clique e redireciona ao WhatsApp do cliente com código PJ-XXXXXX.
 * Público (sem JWT). Sem token de anúncio.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { linkAttributionSnapshot } from '../_shared/rastreamentoMessageAttribution.js';
import {
  buildWaMeRedirectUrl,
  generateMatchCode,
  mergeClickUtmWithLinkDefaults,
  resolveOriginFromClickParams,
} from '../_shared/rastreamentoTrackableLink.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function pickParam(url: URL, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = url.searchParams.get(k);
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function extractSlug(req: Request, url: URL): string {
  const fromQuery = pickParam(url, 'slug');
  if (fromQuery) return fromQuery.toLowerCase();
  const header = req.headers.get('x-track-slug');
  if (header && header.trim()) return header.trim().toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  // .../rastreamento-link-redirect/<slug> ou /r/<slug> via proxy
  const idx = parts.findIndex((p) => p === 'rastreamento-link-redirect' || p === 'r');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].toLowerCase();
  const last = parts[parts.length - 1];
  if (last && last !== 'rastreamento-link-redirect') return last.toLowerCase();
  return '';
}

function htmlFallback(message: string, status = 404): Response {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Link</title></head><body style="font-family:system-ui;padding:2rem"><p>${message}</p></body></html>`;
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const slug = extractSlug(req, url);
  if (!slug || !/^[a-z0-9][a-z0-9_-]{2,47}$/.test(slug)) {
    return htmlFallback('Link inválido.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return htmlFallback('Serviço indisponível.', 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: link, error: linkError } = await supabase
    .from('cliente_rastreamento_links')
    .select(
      'id, cliente_id, slug, destination_phone, default_origin, is_active, initial_message, append_match_code, whatsapp_open_mode, default_utm_source, default_utm_medium, default_utm_campaign, default_utm_content, default_utm_term, campaign_id, campaign_name, adset_id, adset_name',
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (linkError || !link) {
    return htmlFallback('Este link não está ativo.');
  }

  const gclid = pickParam(url, 'gclid');
  const fbclid = pickParam(url, 'fbclid');
  const mergedUtm = mergeClickUtmWithLinkDefaults(
    {
      utm_source: pickParam(url, 'utm_source'),
      utm_medium: pickParam(url, 'utm_medium'),
      utm_campaign: pickParam(url, 'utm_campaign'),
      utm_content: pickParam(url, 'utm_content'),
      utm_term: pickParam(url, 'utm_term'),
    },
    link,
  );
  const utm_source = mergedUtm.utm_source;
  const utm_medium = mergedUtm.utm_medium;
  const utm_campaign = mergedUtm.utm_campaign;
  const utm_content = mergedUtm.utm_content;
  const utm_term = mergedUtm.utm_term;
  const origin_resolved = resolveOriginFromClickParams({
    gclid,
    fbclid,
    utm_source,
    default_origin: link.default_origin,
  });

  let match_code = generateMatchCode();
  let inserted = false;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    const { error: insertError } = await supabase.from('cliente_rastreamento_link_clicks').insert({
      link_id: link.id,
      cliente_id: link.cliente_id,
      match_code,
      gclid,
      fbclid,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      landing_query: url.search ? url.search.slice(1).slice(0, 2000) : null,
      referer: (req.headers.get('referer') || '').slice(0, 500) || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
      origin_resolved,
      link_attribution: linkAttributionSnapshot(link),
    });
    if (!insertError) {
      inserted = true;
      break;
    }
    if (String(insertError.message || '').includes('duplicate') || insertError.code === '23505') {
      match_code = generateMatchCode();
      continue;
    }
    console.error('[rastreamento-link-redirect] insert click', insertError);
    return htmlFallback('Não foi possível abrir o WhatsApp agora.', 500);
  }

  if (!inserted) {
    return htmlFallback('Não foi possível abrir o WhatsApp agora.', 500);
  }

  const wa = buildWaMeRedirectUrl(link.destination_phone, match_code, {
    initialMessage: link.initial_message,
    appendMatchCode: link.append_match_code !== false,
    openMode: link.whatsapp_open_mode || 'auto',
  });
  if (!wa) {
    return htmlFallback('WhatsApp do cliente sem número configurado.', 500);
  }

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: wa },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: wa,
      'Cache-Control': 'no-store',
    },
  });
});
