# Adicionar o webhook uazapi manualmente no Supabase

Você pode criar a Edge Function **pelo Dashboard**, sem usar a CLI.

---

## Passo 1 – Abrir Edge Functions

1. Acesse o **Supabase Dashboard**: https://supabase.com/dashboard  
2. Abra o seu projeto.  
3. No menu lateral, clique em **Edge Functions**.

---

## Passo 2 – Criar a função

1. Clique em **“Deploy a new function”** (ou “Create function”).  
2. Escolha **“Via Editor”** (criar pelo editor no navegador).  
3. **Nome da função:** use exatamente:  
   `uazapi-inbox-webhook`  
   (a URL do CRM usa esse nome; se mudar, a URL do webhook deixa de bater.)

---

## Passo 3 – Colar o código

Apague todo o código que vier no template e **cole o código abaixo** no editor:

```typescript
/**
 * Webhook para receber mensagens da uazapi (Caixa de entrada).
 * URL: https://<projeto>.supabase.co/functions/v1/uazapi-inbox-webhook?cliente_id=UUID&secret=SECRET
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const url = new URL(req.url);
  console.log('[uazapi-inbox-webhook] Requisição:', req.method, url.pathname, 'query:', { cliente_id: url.searchParams.get('cliente_id'), has_secret: !!url.searchParams.get('secret') });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, message: 'Webhook uazapi ativo. Use POST para receber eventos.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

  const clienteId = url.searchParams.get('cliente_id');
  const secret = url.searchParams.get('secret');
  if (!clienteId || !secret) {
    return new Response(
      JSON.stringify({ error: 'Query params cliente_id e secret são obrigatórios' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: config, error: configError } = await supabase
    .from('cliente_whatsapp_config')
    .select('webhook_secret')
    .eq('cliente_id', clienteId)
    .single();

  if (configError || !config?.webhook_secret || config.webhook_secret !== secret) {
    return new Response(JSON.stringify({ error: 'Secret inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  } catch {
    console.log('[uazapi-inbox-webhook] Body não é JSON válido ou está vazio');
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload = (body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : body) as Record<string, unknown>;
  const bodyKeys = Object.keys(body);
  console.log('[uazapi-inbox-webhook] body_keys:', bodyKeys, 'payload_keys:', Object.keys(payload));

  const from = (payload.from ?? payload.remoteJid ?? payload.chatId ?? body.from ?? '') as string;
  const bodyText = (payload.body ?? payload.text ?? payload.content ?? body.body ?? body.text ?? '') as string;
  const type = (payload.type ?? body.type ?? 'text') as string;
  const bodyPreview = typeof bodyText === 'string' ? bodyText.slice(0, 200) : '';

  const logRow = {
    cliente_id: clienteId,
    status: 'ok',
    from_jid: from || null,
    type: type || null,
    body_preview: bodyPreview || null,
    body_keys: bodyKeys.length ? bodyKeys : null,
    error_message: null,
  };

  const messageId = (payload.id ?? (payload.key as Record<string, unknown>)?.id ?? payload.messageId ?? body.id ?? `${from}_${Date.now()}`) as string;
  const name = (payload.name ?? payload.pushName ?? payload.senderName ?? payload.contactName ?? body.name ?? '') as string;
  const isGroup = !!(payload.isGroup ?? payload.is_group ?? body.isGroup ?? body.is_group);
  const groupName = (payload.groupName ?? payload.subject ?? body.groupName ?? null) as string | null;
  const ts = (payload.timestamp ?? body.timestamp)
    ? new Date(((payload.timestamp ?? body.timestamp) as number) * 1000).toISOString()
    : new Date().toISOString();

  const fromJid = from || 'unknown';
  const { error: insertError } = await supabase.from('cliente_whatsapp_inbox').upsert(
    {
      cliente_id: clienteId,
      message_id: String(messageId),
      from_jid: fromJid,
      sender_name: name || null,
      msg_timestamp: ts,
      type,
      body: bodyText || null,
      is_group: isGroup,
      group_name: groupName || null,
      raw_payload: body,
    },
    { onConflict: 'cliente_id,message_id' }
  );

  if (insertError) {
    console.error('[uazapi-inbox-webhook] Insert error', insertError);
    await supabase.from('cliente_whatsapp_webhook_log').insert({
      cliente_id: clienteId,
      status: 'error',
      from_jid: from || null,
      type: type || null,
      body_preview: bodyPreview || null,
      body_keys: bodyKeys.length ? bodyKeys : null,
      error_message: insertError.message,
    });
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabase.from('cliente_whatsapp_webhook_log').insert(logRow);
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

---

## Passo 4 – Fazer o deploy

1. Clique em **“Deploy”** (ou “Deploy function”).  
2. Aguarde terminar (alguns segundos).  
3. A função ficará disponível em:  
   `https://slrpesefjkzoaufvogdj.supabase.co/functions/v1/uazapi-inbox-webhook`

Não é necessário configurar variáveis de ambiente: o Supabase já injeta `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas Edge Functions.

---

## Passo 4b – Evitar 401 ao testar a URL

Se ao clicar em **“Testar URL”** no CRM aparecer **erro 401**, a função está exigindo autenticação (JWT). O webhook precisa aceitar chamadas **sem login** (a uazapi chama sem Bearer token).

1. No Supabase Dashboard, abra **Edge Functions** e clique na função **uazapi-inbox-webhook**.  
2. Vá em **Configurações** (ou **Settings**) da função.  
3. Desative **“Enforce JWT”** (ou marque **“Allow anonymous invocations”** / permitir chamadas anônimas).  
4. Salve e teste de novo o **“Testar URL”** no CRM.

Assim a URL do webhook passa a responder tanto para o teste no navegador quanto para a uazapi.

---

## Passo 5 – Testar

- No CRM, aba **Canais**, use o botão **“Testar URL”** (com a URL do webhook já gerada).  
- Ou abra no navegador (GET):  
  `https://slrpesefjkzoaufvogdj.supabase.co/functions/v1/uazapi-inbox-webhook?cliente_id=SEU_CLIENTE_ID&secret=SEU_SECRET`  
  Deve retornar algo como: `{"ok":true,"message":"Webhook uazapi ativo..."}`.

---

## Resumo

| Item | Valor |
|------|--------|
| Nome da função | `uazapi-inbox-webhook` |
| Onde criar | Dashboard → Edge Functions → Deploy a new function → Via Editor |
| Variáveis | Nenhuma (usa as padrão do Supabase) |

Depois de criada, a URL que você cola na uazapi é a mesma que aparece na aba **Canais** do CRM (com `cliente_id` e `secret`).
