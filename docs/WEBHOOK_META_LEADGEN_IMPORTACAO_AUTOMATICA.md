# Importação automática de leads do Meta (webhook leadgen)

Quando um lead preenche um formulário de Lead Ads no Facebook/Instagram, o Meta pode enviar uma notificação em tempo real para o Planeje. O sistema importa o lead automaticamente para o funil configurado.

## O que foi implementado

1. **Tabela** `cliente_meta_leadgen_webhook`: associa **ID da Página do Facebook** (`meta_page_id`) a um cliente, funil e etapa.
2. **Edge Function** `meta-leadgen-webhook`: recebe os POSTs do Meta, busca os dados do lead na API do Meta e cria o lead no CRM (via `create-lead-from-contact`).
3. **UI** no modal "Importar leads do Facebook": seção **Importação automática (webhook)** para ativar por página, e exibição da URL e do token de verificação.

## Configuração no sistema (Planeje)

1. No CRM, abra **Importar leads do Facebook** (Contatos ou aba Leads → Importar → Importar leads do Facebook).
2. Na seção **Importação automática (webhook)**:
   - Informe o **ID da Página do Facebook** (page_id). Você encontra no Meta Business Suite ou na URL da página.
   - Selecione **Funil** e **Etapa** para onde os novos leads devem ir.
   - Clique em **Ativar importação automática**.
3. Copie a **URL do webhook** e o **Token de verificação** para usar no Meta (passos abaixo).

## Configuração no Meta (Developer Console)

1. Acesse [developers.facebook.com](https://developers.facebook.com) → seu App → **Webhooks**.
2. Em **Webhooks**, clique em **Configurar** (ou **Add Subscription**) para o produto **Page**.
3. **Callback URL**: cole a URL do webhook (ex.: `https://seu-projeto.supabase.co/functions/v1/meta-leadgen-webhook`).
4. **Verify Token**: cole o token exibido no modal (padrão: `planeje-leadgen-verify`).  
   Opcional: defina o secret `META_LEADGEN_WEBHOOK_VERIFY_TOKEN` nas Edge Function Secrets do Supabase com o mesmo valor e use esse valor no Meta.
5. Marque o campo **leadgen** e salve.
6. **Instale o app na Página**: no Meta, a Página precisa “inscrever” o app para receber os eventos. Uma forma é usar o [Graph API Explorer](https://developers.facebook.com/tools/explorer):  
   - Método **POST**, endpoint `{page-id}/subscribed_apps?subscribed_fields=leadgen`  
   - Use um token de **Página** (Page access token) com permissões `leads_retrieval`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`, `ads_management`.

## Permissões e token

- O **System User** do Meta (token em `META_SYSTEM_USER_ACCESS_TOKEN`) deve ter a permissão **`leads_retrieval`** e a **Página** atribuída (conforme [GUIA_CONFIGURAR_TOKEN_META.md](../GUIA_CONFIGURAR_TOKEN_META.md)).
- A Edge Function `meta-leadgen-webhook` chama a `meta-ads-api` (que usa esse token) para buscar os dados completos do lead a partir do `leadgen_id`.

## Deploy da Edge Function

```bash
supabase functions deploy meta-leadgen-webhook
```

Se quiser usar um token de verificação customizado, defina o secret no Supabase:

- Nome: `META_LEADGEN_WEBHOOK_VERIFY_TOKEN`
- Valor: o mesmo que você colocar no Meta em "Verify Token".

## Fluxo

1. Usuário preenche o formulário de um Lead Ad no Facebook/Instagram.
2. O Meta envia um POST para `meta-leadgen-webhook` com `leadgen_id`, `page_id`, `form_id`, `ad_id`.
3. O webhook consulta `cliente_meta_leadgen_webhook` pelo `page_id` e obtém `cliente_id`, `pipeline_id`, `stage_id`.
4. Chama a API do Meta (via `meta-ads-api` action `get-lead-by-id`) para obter nome, e-mail, telefone e demais campos do formulário.
5. Chama `create-lead-from-contact` com esses dados e com `tracking_data` (meta_lead_id, form_id, ad_id, field_data), criando o lead (e contato) no CRM.

Leads sem telefone válido (menos de 10 dígitos) não são importados.

---

# Sincronização automática a cada 1 minuto (polling por Form ID)

Em vez de configurar o webhook no Meta, você pode apenas informar o **ID do formulário** no sistema. Um processo roda **a cada 1 minuto**, busca leads novos desse formulário na API do Meta e importa para o CRM. Nada precisa ser configurado no Meta Developer Console.

## O que foi implementado

1. **Tabela** `cliente_meta_leadgen_polling`: associa **Form ID** a cliente, funil e etapa; guarda `last_synced_at` para buscar só leads novos.
2. **Edge Function** `meta-leadgen-sync`: invocada por cron (a cada 1 min). Lê as configs ativas, chama `get-leads-by-form` para cada form_id (desde `last_synced_at - 2 min`), importa via `create-lead-from-contact` e atualiza `last_synced_at`.
3. **UI** no modal "Importar leads do Facebook": seção **Sincronização automática (a cada 1 minuto)** para cadastrar Form ID + Funil + Etapa e listar/remover configs; exibe a URL da função para o cron.

## Configuração no sistema (Planeje)

1. No CRM, abra **Importar leads do Facebook**.
2. Na seção **Sincronização automática (a cada 1 minuto)**:
   - Informe o **ID do formulário** (Form ID) da Gestão de leads dos anúncios.
   - Selecione **Funil** e **Etapa**.
   - Clique em **Ativar sincronização**.
3. Copie a **URL da sincronização** e configure um cron externo (ou pg_cron) para chamá-la a cada 1 minuto (veja abaixo).

## Segurança da Edge Function

A função `meta-leadgen-sync` exige autenticação para evitar chamadas públicas:

- Defina o secret **`META_LEADGEN_SYNC_SECRET`** nas Edge Function Secrets do Supabase (Dashboard → Project Settings → Edge Functions → Secrets).
- O cron deve enviar esse valor no header: `Authorization: Bearer <META_LEADGEN_SYNC_SECRET>`  
  ou como query: `?secret=<META_LEADGEN_SYNC_SECRET>`.

## Agendamento: a cada 1 minuto

### Opção A – Supabase (pg_cron + pg_net)

1. Habilite as extensões `pg_cron` e `pg_net` no projeto (SQL Editor no Dashboard).
2. Guarde no Vault (ou use variável de ambiente) a URL do projeto e o valor de `META_LEADGEN_SYNC_SECRET`.
3. Agende um job que a cada minuto chame a URL da função com o header de autorização.

Exemplo (ajuste `YOUR_PROJECT_REF`, `YOUR_SYNC_SECRET` e a chave se usar anon/service_role):

```sql
SELECT cron.schedule(
  'meta-leadgen-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/meta-leadgen-sync',
    headers := '{"Authorization": "Bearer YOUR_SYNC_SECRET", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### Opção B – Serviço externo (recomendado para começar)

Use um cron externo (ex.: [cron-job.org](https://cron-job.org), GitHub Actions, ou um VPS com crontab) que a cada 1 minuto faça:

- **URL:** `https://<seu-projeto>.supabase.co/functions/v1/meta-leadgen-sync`
- **Método:** GET ou POST
- **Header:** `Authorization: Bearer <META_LEADGEN_SYNC_SECRET>`

Ou GET com query: `https://.../meta-leadgen-sync?secret=<META_LEADGEN_SYNC_SECRET>`

## Deploy da Edge Function

```bash
supabase functions deploy meta-leadgen-sync
```

Defina o secret no Supabase:

- Nome: `META_LEADGEN_SYNC_SECRET`
- Valor: uma string segura (ex.: gerada aleatoriamente); use o mesmo valor no cron.

## Fluxo (polling)

1. O cron chama `meta-leadgen-sync` a cada 1 minuto.
2. A função lê em `cliente_meta_leadgen_polling` todas as linhas com `is_active = true`.
3. Para cada linha: calcula `since = last_synced_at - 2 minutos` (Unix), chama `meta-ads-api` (action `get-leads-by-form`) com `form_id`, `since`, `limit: 100`.
4. Para cada lead retornado com telefone válido: chama `create-lead-from-contact` com cliente, funil, etapa e `tracking_data` (meta_lead_id, form_id, ad_id, field_data, created_time).
5. Atualiza `last_synced_at = now()` para essa config.

Webhook (tempo real) e polling (a cada 1 min) podem coexistir: quem quiser tempo real usa webhook; quem quiser só informar o Form ID usa o polling.
