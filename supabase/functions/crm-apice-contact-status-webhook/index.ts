/**
 * Webhook: CRM-Apice (ou automação) envia atualização de status do lead → Planeje grava em contato/lead.
 *
 * POST /functions/v1/crm-apice-contact-status-webhook
 * Header: Authorization: Bearer <status_incoming_secret>  (secret gerado em Canais → CRM-Apice)
 * Body JSON: { "cliente_id": "<uuid>", "status": "texto livre", "phone"?: string, "from_jid"?: string }
 *
 * Correspondência: from_jid exato OU telefone normalizado (variantes BR, mesmo critério do create-lead-from-contact).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(phone: string | number | null | undefined): string {
  if (phone == null || phone === '') return '';
  const s = typeof phone === 'number' && Number.isFinite(phone) ? String(Math.trunc(phone)) : String(phone);
  let cleaned = s.replace(/\D/g, '');
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

function extractPhoneFromJid(jid: string | null | undefined): string {
  if (!jid || typeof jid !== 'string') return '';
  return jid.replace(/@.*$/, '').trim().replace(/\D/g, '');
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) {
    if (b.has(x)) return true;
  }
  return false;
}

/** PostgREST limita ~1000 linhas por request; sem paginação o match pode falhar (404) com muitos registros. */
const PAGE_SIZE = 1000;

// deno-lint-ignore no-explicit-any
async function findMatchingContactId(supabase: any, clienteId: string, targetVars: Set<string>): Promise<string | null> {
  let offset = 0;
  for (;;) {
    const { data: contacts, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, phone, from_jid')
      .eq('cliente_id', clienteId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[crm-apice-contact-status-webhook] list contacts', error.message);
      break;
    }
    const rows = (contacts ?? []) as { id: string; phone: string | null; from_jid: string | null }[];
    if (rows.length === 0) break;
    const match = rows.find((c) => {
      const pv = new Set(getPhoneVariations(c.phone ?? ''));
      const jv = new Set(getPhoneVariations(extractPhoneFromJid(c.from_jid)));
      return setsOverlap(targetVars, pv) || setsOverlap(targetVars, jv);
    });
    if (match?.id) return match.id;
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset > 500000) break;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
async function findMatchingLeadId(supabase: any, clienteId: string, targetVars: Set<string>): Promise<string | null> {
  let offset = 0;
  for (;;) {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, whatsapp')
      .eq('cliente_id', clienteId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[crm-apice-contact-status-webhook] list leads', error.message);
      break;
    }
    const rows = (leads ?? []) as { id: string; whatsapp: string | null }[];
    if (rows.length === 0) break;
    const leadMatch = rows.find((l) => {
      const lv = new Set(getPhoneVariations(l.whatsapp ?? ''));
      return setsOverlap(targetVars, lv);
    });
    if (leadMatch?.id) return leadMatch.id;
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset > 500000) break;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Servidor não configurado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return new Response(JSON.stringify({ error: 'Authorization Bearer obrigatório (secret de Canais)' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  /** Aceita string ou número no JSON (automações às vezes mandam número). */
  const phoneIn =
    body.phone != null && body.phone !== ''
      ? String(body.phone as string | number).trim()
      : '';
  const fromJidIn =
    body.from_jid != null && body.from_jid !== ''
      ? String(body.from_jid as string).trim()
      : '';

  if (!clienteId || !status) {
    return new Response(JSON.stringify({ error: 'cliente_id e status são obrigatórios' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!fromJidIn && !normalizePhone(phoneIn)) {
    return new Response(JSON.stringify({ error: 'Informe phone ou from_jid para localizar o contato/lead' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: fwd, error: fwdErr } = await supabase
    .from('cliente_crm_apice_forward')
    .select('status_incoming_secret')
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (fwdErr) {
    console.error('[crm-apice-contact-status-webhook] read forward', fwdErr.message);
    return new Response(JSON.stringify({ error: 'Erro ao validar configuração' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expected = fwd?.status_incoming_secret?.trim();
  if (!expected || expected !== bearer) {
    return new Response(JSON.stringify({ error: 'Secret inválido ou não configurado (gere em Canais → CRM-Apice)' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const contactUpdates = { crm_apice_lead_status: status, crm_apice_lead_status_at: now, updated_at: now };
  const leadUpdates = { crm_apice_lead_status: status, crm_apice_lead_status_at: now, updated_at: now };

  let updatedContact = false;
  let updatedLead = false;

  if (fromJidIn) {
    const { data: byJid, error: e1 } = await supabase
      .from('cliente_whatsapp_contact')
      .update(contactUpdates)
      .eq('cliente_id', clienteId)
      .eq('from_jid', fromJidIn)
      .select('id');
    if (!e1 && byJid && byJid.length > 0) updatedContact = true;
  }

  if (phoneIn) {
    const targetVars = new Set(getPhoneVariations(phoneIn));
    if (targetVars.size > 0) {
      if (!updatedContact) {
        const contactId = await findMatchingContactId(supabase, clienteId, targetVars);
        if (contactId) {
          const { error: upErr } = await supabase
            .from('cliente_whatsapp_contact')
            .update(contactUpdates)
            .eq('id', contactId)
            .eq('cliente_id', clienteId);
          if (!upErr) updatedContact = true;
        }
      }

      const leadId = await findMatchingLeadId(supabase, clienteId, targetVars);
      if (leadId) {
        const { error: upLead } = await supabase
          .from('leads')
          .update(leadUpdates)
          .eq('id', leadId)
          .eq('cliente_id', clienteId);
        if (!upLead) updatedLead = true;
      }
    }
  }

  if (!updatedContact && !updatedLead) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Nenhum contato ou lead encontrado para phone/from_jid neste cliente',
        hints: [
          'Confira se cliente_id é exatamente o UUID do cliente no Planeje (o mesmo do exemplo em Canais).',
          'Use phone como string com DDI, ex: "5511999999999" (não misturar cliente errado no CRM-Apice).',
          'Lead precisa ter o campo whatsapp preenchido no Planeje; contato precisa ter phone ou from_jid.',
          'Para contato WhatsApp, pode usar from_jid exato, ex: "5511999999999@s.whatsapp.net".',
        ],
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      updated_contact: updatedContact,
      updated_lead: updatedLead,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
