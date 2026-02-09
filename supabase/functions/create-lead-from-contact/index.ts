/**
 * Edge Function: criar lead a partir de contato (automação "novo contato" ou exportação manual).
 * POST body: { cliente_id?, from_jid?, phone?, sender_name?, contact_id? }
 * - Se contact_id: busca contato em cliente_whatsapp_contact e usa from_jid, phone, sender_name.
 * - Se cliente_id + (from_jid ou phone): usa diretamente.
 * - Se Authorization Bearer = user JWT: cliente_id pode vir do profile (body opcional cliente_id para admin).
 * - Se Authorization Bearer = SERVICE_ROLE: body deve ter cliente_id.
 * Retorna: { created: boolean, lead_id?: string, reason?: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (cleaned.length === 10 || cleaned.length === 11) cleaned = '55' + cleaned;
  if (cleaned.startsWith('550')) cleaned = '55' + cleaned.substring(3);
  return cleaned;
}

function getPhoneVariations(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const variations = new Set<string>([normalized]);
  if (normalized.startsWith('55') && normalized.length > 2) {
    variations.add(normalized.substring(2));
  }
  if (normalized.startsWith('55') && normalized.length === 12) {
    const ddd = normalized.substring(2, 4);
    const number = normalized.substring(4);
    variations.add(`55${ddd}9${number}`);
  }
  if (normalized.startsWith('55') && normalized.length === 13 && normalized.charAt(4) === '9') {
    const ddd = normalized.substring(2, 4);
    const number = normalized.substring(5);
    variations.add(`55${ddd}${number}`);
  }
  return Array.from(variations);
}

function extractPhoneFromJid(jid: string): string {
  if (!jid || typeof jid !== 'string') return '';
  return jid.replace(/@.*$/, '').trim().replace(/\D/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const isServiceRole = token === supabaseServiceKey;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let clienteId: string | null = null;
  if (isServiceRole) {
    const cid = body.cliente_id;
    if (typeof cid !== 'string' || !cid.trim()) {
      return new Response(JSON.stringify({ error: 'cliente_id obrigatório quando chamado com service role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clienteId = (cid as string).trim();
  } else {
    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.id) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('cliente_id, role')
      .eq('id', user.id)
      .single();
    clienteId = profile?.cliente_id ?? null;
    if (!clienteId && profile?.role !== 'superadmin' && profile?.role !== 'admin' && profile?.role !== 'colaborador') {
      return new Response(JSON.stringify({ error: 'Cliente não identificado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof body.cliente_id === 'string' && body.cliente_id.trim() && (profile?.role === 'admin' || profile?.role === 'colaborador' || profile?.role === 'superadmin')) {
      clienteId = (body.cliente_id as string).trim();
    }
  }

  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'cliente_id não disponível' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let fromJid: string | null = typeof body.from_jid === 'string' && body.from_jid.trim() ? body.from_jid.trim() : null;
  let phone: string | null = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  let senderName: string | null = typeof body.sender_name === 'string' && body.sender_name.trim() ? body.sender_name.trim() : null;
  let profilePicUrl: string | null = typeof body.profile_pic_url === 'string' && body.profile_pic_url.trim() ? body.profile_pic_url.trim() : null;
  const contactId = typeof body.contact_id === 'string' && body.contact_id.trim() ? body.contact_id.trim() : null;

  const bodyOriginSource = typeof body.origin_source === 'string' && body.origin_source.trim() ? body.origin_source.trim() : null;
  let origemFromContact: string | null = bodyOriginSource === 'meta_ads' ? 'Meta Ads' : null;
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;
  let utmContent: string | null = null;
  let utmTerm: string | null = null;
  let trackingData: Record<string, unknown> | null = null;
  if (typeof body.utm_source === 'string' && body.utm_source.trim()) utmSource = body.utm_source.trim();
  if (typeof body.utm_medium === 'string' && body.utm_medium.trim()) utmMedium = body.utm_medium.trim();
  if (typeof body.utm_campaign === 'string' && body.utm_campaign.trim()) utmCampaign = body.utm_campaign.trim();
  if (typeof body.utm_content === 'string' && body.utm_content.trim()) utmContent = body.utm_content.trim();
  if (typeof body.utm_term === 'string' && body.utm_term.trim()) utmTerm = body.utm_term.trim();
  if (body.tracking_data && typeof body.tracking_data === 'object') trackingData = body.tracking_data as Record<string, unknown>;

  if (contactId) {
    const { data: contact, error: contactErr } = await supabase
      .from('cliente_whatsapp_contact')
      .select('from_jid, phone, sender_name, profile_pic_url, cliente_id, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data')
      .eq('id', contactId)
      .eq('cliente_id', clienteId)
      .maybeSingle();
    if (contactErr || !contact) {
      return new Response(JSON.stringify({ created: false, reason: 'contact_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    fromJid = contact.from_jid ?? null;
    phone = contact.phone ?? (fromJid ? extractPhoneFromJid(fromJid) : null) ?? null;
    if (contact.sender_name) senderName = contact.sender_name;
    if (contact.profile_pic_url) profilePicUrl = contact.profile_pic_url;
    if (contact.origin_source === 'meta_ads') origemFromContact = 'Meta Ads';
    if (!utmSource && contact.utm_source) utmSource = contact.utm_source;
    if (!utmMedium && contact.utm_medium) utmMedium = contact.utm_medium;
    if (!utmCampaign && contact.utm_campaign) utmCampaign = contact.utm_campaign;
    if (!utmContent && contact.utm_content) utmContent = contact.utm_content;
    if (!utmTerm && contact.utm_term) utmTerm = contact.utm_term;
    if (!trackingData && contact.tracking_data && typeof contact.tracking_data === 'object') trackingData = contact.tracking_data as Record<string, unknown>;
  } else if (fromJid) {
    const { data: contactByJid } = await supabase
      .from('cliente_whatsapp_contact')
      .select('profile_pic_url, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data')
      .eq('cliente_id', clienteId)
      .eq('from_jid', fromJid)
      .maybeSingle();
    if (contactByJid?.profile_pic_url) profilePicUrl = contactByJid.profile_pic_url;
    if (!origemFromContact && contactByJid?.origin_source === 'meta_ads') origemFromContact = 'Meta Ads';
    if (!utmSource && contactByJid?.utm_source) utmSource = contactByJid.utm_source;
    if (!utmMedium && contactByJid?.utm_medium) utmMedium = contactByJid.utm_medium;
    if (!utmCampaign && contactByJid?.utm_campaign) utmCampaign = contactByJid.utm_campaign;
    if (!utmContent && contactByJid?.utm_content) utmContent = contactByJid.utm_content;
    if (!utmTerm && contactByJid?.utm_term) utmTerm = contactByJid.utm_term;
    if (!trackingData && contactByJid?.tracking_data && typeof contactByJid.tracking_data === 'object') trackingData = contactByJid.tracking_data as Record<string, unknown>;
  }

  const phoneNormalized = phone ? normalizePhone(phone) : (fromJid ? normalizePhone(extractPhoneFromJid(fromJid)) : '');
  if (!phoneNormalized) {
    return new Response(JSON.stringify({ created: false, reason: 'phone_required' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const variations = getPhoneVariations(phoneNormalized);
  const manualPipelineId = typeof body.pipeline_id === 'string' && body.pipeline_id.trim() ? body.pipeline_id.trim() : null;
  const manualStageId = typeof body.stage_id === 'string' && body.stage_id.trim() ? body.stage_id.trim() : null;

  let pipelineId: string;
  let stageId: string;

  if (manualPipelineId && manualStageId) {
    const { data: stageRow } = await supabase
      .from('crm_stages')
      .select('id, pipeline_id, nome')
      .eq('id', manualStageId)
      .eq('pipeline_id', manualPipelineId)
      .maybeSingle();
    if (!stageRow) {
      return new Response(JSON.stringify({ created: false, reason: 'invalid_pipeline_stage' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    pipelineId = manualPipelineId;
    stageId = manualStageId;
  } else {
    const isMetaAds = origemFromContact === 'Meta Ads';
    const { data: automations } = await supabase
      .from('crm_contact_automations')
      .select('id, pipeline_id, stage_id, trigger_type')
      .eq('cliente_id', clienteId)
      .eq('is_active', true);

    const metaAdsRule = (automations || []).find((a) => a.trigger_type === 'new_contact_meta_ads');
    const defaultRule = (automations || []).find((a) => a.trigger_type === 'new_contact');
    const chosen = isMetaAds && metaAdsRule ? metaAdsRule : defaultRule;

    if (!chosen) {
      return new Response(JSON.stringify({ created: false, reason: 'no_automation' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    pipelineId = chosen.pipeline_id;
    stageId = chosen.stage_id;
  }

  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id')
    .eq('cliente_id', clienteId)
    .in('whatsapp', variations)
    .limit(1);

  if (existingLeads && existingLeads.length > 0) {
    return new Response(JSON.stringify({ created: false, reason: 'already_exists', lead_id: existingLeads[0].id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: stageRow } = await supabase
    .from('crm_stages')
    .select('nome')
    .eq('id', stageId)
    .single();

  const stageNome = stageRow?.nome ?? 'Novo';
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const leadRow: Record<string, unknown> = {
    cliente_id: clienteId,
    nome: senderName || phoneNormalized || 'Contato WhatsApp',
    whatsapp: phoneNormalized,
    data_entrada: today,
    status: stageNome,
    status_vida: 'ativo',
    pipeline_id: pipelineId,
    stage_id: stageId,
    stage_entered_at: now,
    valor: 0,
    profile_pic_url: profilePicUrl || null,
    created_at: now,
    updated_at: now,
  };
  if (origemFromContact) leadRow.origem = origemFromContact;
  if (utmSource) leadRow.utm_source = utmSource;
  if (utmMedium) leadRow.utm_medium = utmMedium;
  if (utmCampaign) leadRow.utm_campaign = utmCampaign;
  if (utmContent) leadRow.utm_content = utmContent;
  if (utmTerm) leadRow.utm_term = utmTerm;
  if (trackingData && Object.keys(trackingData).length > 0) leadRow.tracking_data = trackingData;

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert(leadRow)
    .select('id')
    .single();

  if (insertError) {
    console.error('[create-lead-from-contact] insert error', insertError);
    return new Response(JSON.stringify({ created: false, reason: 'insert_error', error: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ created: true, lead_id: inserted?.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
