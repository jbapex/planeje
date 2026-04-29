# Diagnóstico: evento do Planeje não chega no Webhook Genérico (CRM-Apice)

## 1. Testar o CRM-Apice diretamente

No **CRM-Apice**, em **Integrações → Webhook Genérico**, copie a **URL completa** (com `user_id` e `secret`).

No terminal (ou Postman), rode (substitua pela sua URL):

```bash
curl -X POST "COLE_A_URL_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"planeje_whatsapp","payload":{"source":"uazapi","phone":"5511999999999","sender_name":"Teste"}}'
```

- **Resposta 200 + `{"success":true,...}`** → O CRM-Apice está recebendo. O problema está no **Planeje** (config ou cliente_id).
- **404** → A função **generic-webhook** não está deployada no Supabase do **CRM-Apice**. Faça o deploy.
- **401** → `user_id` ou `secret` incorretos. Gere nova URL no CRM-Apice e cole de novo no Planeje.
- **500** → Erro no CRM-Apice (tabela `generic_webhook_events` ou `user_settings.generic_webhook_secret` faltando). Rode o SQL `supabase_generic_webhook_setup.sql` no Supabase do CRM-Apice.

---

## 2. Verificar no Planeje (Canais)

1. Acesse **Planeje → Cliente → CRM → Canais** (com o **mesmo cliente** que recebe as mensagens no webhook).
2. Role até **"Encaminhar eventos para CRM-Apice"**.
3. Confira:
   - **URL** está preenchida com a URL do Webhook Genérico do CRM-Apice (a mesma da tela Integrações).
   - **"Ativar encaminhamento"** está **ligado**.
   - Clique em **Salvar**.

O **cliente** da página (ou o cliente selecionado no dropdown, se for admin) deve ser o **mesmo** `cliente_id` que vem na URL do webhook da uazapi/apicebot. Se a uazapi chama com `cliente_id=AAA` e a URL foi salva para o cliente `BBB`, o encaminhamento não ocorre.

---

## 3. Logs do Planeje (Supabase)

**Supabase do Planeje** → **Edge Functions** → **uazapi-inbox-webhook** (ou **apicebot-inbox-webhook**) → **Logs**.

Envie uma mensagem de teste e procure:

| Log | Significado |
|-----|-------------|
| `Nenhuma URL CRM-Apice configurada para cliente_id=...` | Não existe linha em `cliente_crm_apice_forward` para esse cliente, ou está desativada. Configure em Canais e salve. |
| `cliente_crm_apice_forward read error` | Erro ao ler a tabela (ex.: tabela não existe). Rode a migration do Planeje que cria `cliente_crm_apice_forward`. |
| `Encaminhando para CRM-Apice, URLs= 1` | Envio foi tentado. |
| `forward to CRM-Apice OK 200` | CRM-Apice respondeu sucesso. Se o evento não aparecer na tela, o problema é no front ou na tabela do CRM. |
| `forward to CRM-Apice ERRO 401` | URL ou secret errados. Atualize a URL no Planeje (copie de novo do CRM-Apice). |
| `forward to CRM-Apice ERRO 404` | Função **generic-webhook** não existe no projeto do CRM-Apice. Deploy no Supabase do CRM-Apice. |
| `forward to CRM-Apice ERRO 500` | Erro no CRM-Apice (tabela/coluna ou código). Veja os logs da generic-webhook no Supabase do CRM-Apice. |
| `forward to CRM-Apice fetch failed` | Rede/DNS/timeout. Verifique se a URL está acessível. |

---

## 4. Checklist rápido

- [ ] No **Supabase do CRM-Apice**: função **generic-webhook** existe e está deployada.
- [ ] No **Supabase do CRM-Apice**: tabela **generic_webhook_events** existe; **user_settings** tem coluna **generic_webhook_secret** (rode `supabase_generic_webhook_setup.sql` se precisar).
- [ ] No **Planeje → Canais**: URL do Webhook Genérico colada, **Ativar encaminhamento** ligado e **Salvar** clicado.
- [ ] O **cliente** em que você configurou o encaminhamento é o **mesmo** da URL do webhook (mesmo `cliente_id`).
- [ ] Depois de qualquer alteração: **deploy** das funções **uazapi-inbox-webhook** e **apicebot-inbox-webhook** no Supabase do **Planeje**.
