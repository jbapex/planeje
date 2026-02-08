# Edge Functions – atualização manual no Supabase

Use este guia para criar ou atualizar as funções manualmente no **Dashboard do Supabase** (Edge Functions).

---

## 1. `create-lead-from-contact` (NOVA)

- **Nome no Supabase:** `create-lead-from-contact`
- **Arquivo no projeto:** `supabase/functions/create-lead-from-contact/index.ts`

**Passos:** Edge Functions → Create a new function → nome: `create-lead-from-contact` → colar o código do bloco abaixo no `index.ts` e fazer deploy.

<details>
<summary><strong>Código completo – index.ts (clique para expandir)</strong></summary>

```ts
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
  const contactId = typeof body.contact_id === 'string' && body.contact_id.trim() ? body.contact_id.trim() : null;

  if (contactId) {
    const { data: contact, error: contactErr } = await supabase
      .from('cliente_whatsapp_contact')
      .select('from_jid, phone, sender_name, cliente_id')
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
    const { data: automation } = await supabase
      .from('crm_contact_automations')
      .select('id, pipeline_id, stage_id')
      .eq('cliente_id', clienteId)
      .eq('trigger_type', 'new_contact')
      .eq('is_active', true)
      .maybeSingle();

    if (!automation) {
      return new Response(JSON.stringify({ created: false, reason: 'no_automation' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    pipelineId = automation.pipeline_id;
    stageId = automation.stage_id;
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

  const leadRow = {
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
    created_at: now,
    updated_at: now,
  };

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
```

</details>

---

## 2. `uazapi-inbox-webhook` (ATUALIZADA)

- **Nome no Supabase:** `uazapi-inbox-webhook`
- **Arquivo no projeto:** `supabase/functions/uazapi-inbox-webhook/index.ts`

**Alteração:** Depois do upsert do contato em `cliente_whatsapp_contact`, a função chama `create-lead-from-contact` (automação “novo contato → funil”).

**Passos:** Edge Functions → abrir `uazapi-inbox-webhook` → substituir **todo** o conteúdo do `index.ts` pelo código do bloco abaixo e fazer deploy.

<details>
<summary><strong>Código completo – index.ts (clique para expandir)</strong></summary>

O código completo está no arquivo do projeto. No Supabase, use uma destas opções:

- **Opção A:** Copiar de `supabase/functions/uazapi-inbox-webhook/index.ts` no seu projeto (arquivo já está atualizado).
- **Opção B:** O trecho que foi **adicionado** está entre o upsert do contato e o `} else {`. Procure por:

  ```ts
  if (contactError) console.error(...
  else {
    // Automação: novo contato -> funil (create-lead-from-contact com service role)
    try {
      const fnUrl = `${supabaseUrl}/functions/v1/create-lead-from-contact`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          cliente_id: clienteId,
          from_jid: fromJid,
          phone: phoneFinal || null,
          sender_name: contactName || null,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result?.created) console.log('[uazapi-inbox-webhook] Lead criado por automação', result.lead_id);
    } catch (e) {
      console.error('[uazapi-inbox-webhook] create-lead-from-contact call failed', e);
    }
  }
  ```

  Se a sua função ainda não tiver esse bloco, inclua-o **depois** do `if (contactError) console.error(...)` e **antes** do `} else { console.log('[uazapi-inbox-webhook] Contato não criado...')`.

</details>

---

## Ordem recomendada

1. **Criar/deploy** `create-lead-from-contact` (a outra função chama esta URL).
2. **Atualizar/deploy** `uazapi-inbox-webhook`.

Assim, ao receber mensagem no webhook, o contato é salvo e, se existir automação ativa, o lead é criado no funil.
