# Meta Ads API Edge Function

Edge Function para integração com a API do Meta Ads (Facebook Ads).

## 📋 Pré-requisitos

1. Token do System User do Meta configurado no Supabase Vault
2. Edge Function deployada no Supabase

## 🔧 Configuração

### 1. Configurar Token no Supabase Vault

No Supabase Dashboard:
1. Vá em **Settings** → **Vault**
2. Adicione um secret:
   - **Nome**: `META_SYSTEM_USER_ACCESS_TOKEN`
   - **Valor**: Token do System User do Meta

### 2. Configurar Variáveis de Ambiente (Opcional)

No Supabase Dashboard → **Edge Functions** → **Settings** → **Secrets**:

- `SUPABASE_URL`: URL do seu projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key (encontrada em Settings → API)
- `META_BUSINESS_ID`: (Opcional) ID do Business Manager, se quiser fixar

### 3. Deploy da Edge Function

```bash
# Instalar Supabase CLI (se ainda não tiver)
npm install -g supabase

# Login no Supabase
supabase login

# Linkar ao projeto
supabase link --project-ref seu-project-ref

# Deploy da função
supabase functions deploy meta-ads-api
```

## 📡 Endpoints

### `check-connection`
Verifica se o token está configurado e válido.

**Request:**
```json
{
  "action": "check-connection"
}
```

**Response:**
```json
{
  "connected": true,
  "user": { ... }
}
```

### `get-ad-accounts`
Lista todas as contas de anúncio disponíveis.

**Request:**
```json
{
  "action": "get-ad-accounts"
}
```

**Response:**
```json
{
  "adAccounts": [
    {
      "id": "act_123456789",
      "name": "Minha Conta de Anúncios",
      ...
    }
  ]
}
```

### `get-campaign-insights`
Busca insights de campanhas.

**Request:**
```json
{
  "action": "get-campaign-insights",
  "ad_account_id": "act_123456789",
  "time_range": {
    "since": "2025-01-01",
    "until": "2025-01-31"
  },
  "metrics": ["spend", "impressions", "clicks"]
}
```

### `get-leads-by-form` (Gestão de leads dos anúncios)
Busca leads de um formulário de Lead Ads. Requer permissão `leads_retrieval` e Página atribuída ao System User.

**Request:**
```json
{
  "action": "get-leads-by-form",
  "form_id": "123456789",
  "since": 1482698431,
  "limit": 100,
  "after": "<cursor>"
}
```
- `form_id` (obrigatório): ID do formulário (copie da Gestão de leads no Facebook).
- `since` (opcional): timestamp Unix para filtrar leads a partir dessa data.
- `limit` (opcional): máximo 500.
- `after` (opcional): cursor de paginação.

**Response:** `{ leads: [...], paging: { cursors, next } }` — cada lead com `id`, `created_time`, `ad_id`, `form_id`, `nome`, `email`, `telefone`, `field_data`.

### `get-leads-by-ad`
Busca leads de um anúncio específico (Lead Ads). Mesmos parâmetros que `get-leads-by-form`, trocando `form_id` por `ad_id`.

## 🔍 Troubleshooting

### Erro: "TOKEN_NOT_FOUND"
- Verifique se o secret `META_SYSTEM_USER_ACCESS_TOKEN` existe no Vault
- Verifique se o nome está exatamente correto (case-sensitive)

### Erro: "Invalid token"
- Token pode ter expirado - gere um novo no Meta Business Manager
- Verifique se o System User tem acesso à conta de anúncio

### Erro: "Permission denied"
- System User não foi atribuído à conta de anúncio
- Verifique as permissões no Meta Business Manager

