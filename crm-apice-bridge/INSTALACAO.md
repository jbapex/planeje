# Ponte CRM-Apice → Planeje (etiqueta em Contatos)

Roda no **Supabase do CRM-APICE**. Cada **cliente** do Ápice pode ter sua própria configuração no app; o **admin** define uma vez o secret do webhook de banco e a URL padrão do Planeje.

## Migrations (ordem)

Aplique no **SQL Editor** ou `supabase db push`:

1. `20260403120000_planeje_status_sync_config.sql` — tabela por cliente  
2. `20260403120100_planeje_status_sync_rls_ui.sql` — RLS para o front (usuário logado)  
3. `20260403120200_planeje_global_settings.sql` — config global + URL opcional por cliente  

## Edge Function + config.toml

- `supabase/functions/notify-planeje-lead-status/index.ts`  
- Bloco `[functions.notify-planeje-lead-status] verify_jwt = false` no `config.toml` do Ápice  

```bash
supabase functions deploy notify-planeje-lead-status
```

## Secrets no Supabase (opcionais — fallback)

Se **nada** for preenchido nas tabelas pelo app, a função ainda pode usar:

| Secret | Quando usar |
|--------|-------------|
| `APICE_NOTIFY_INCOMING_SECRET` | Se `crm_planeje_global_settings.apice_database_webhook_secret` estiver vazio |
| `PLANEJE_STATUS_WEBHOOK_URL` | Se global e por-cliente não tiverem URL |

Recomendado: configurar **tudo pela interface** do Ápice (admin + cada cliente) e deixar os secrets vazios.

## Interface no CRM-Apice

1. Copie `frontend/PlanejeIntegrationPage.example.jsx` para o projeto do Ápice.  
2. Passe `supabase` e `profile` (com `role`, `cliente_id`).  
3. Menu sugerido: **Integrações → Planeje**.  

- **Superadmin:** salva `apice_database_webhook_secret` e `planeje_default_status_webhook_url` em `crm_planeje_global_settings` (id=1).  
- **Usuário com cliente:** salva `planeje_bearer_secret` (+ URL opcional) em `crm_planeje_status_sync`.  

Depois que o admin salvar o **secret do webhook**, copie o **mesmo valor** para o Supabase → **Database → Webhooks** → header `Authorization: Bearer …`.

## Database Webhook (uma vez por projeto Ápice)

- Tabela: `public.leads`  
- Evento: **Update**  
- URL: `https://<REF-APICE>.supabase.co/functions/v1/notify-planeje-lead-status`  
- Header: `Authorization: Bearer <igual a apice_database_webhook_secret salvo no app>`  

## Deploy no Planeje

Função que **recebe** o status: `crm-apice-contact-status-webhook` (ver README principal do repo Planeje).
