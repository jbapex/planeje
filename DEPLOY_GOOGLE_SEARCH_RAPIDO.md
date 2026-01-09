# 🚀 Deploy Rápido - Funções de Busca

## Opção 1: Via Supabase Dashboard (Mais Fácil) ⭐

### 1. Deploy da função `google-search`

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions** → **Create a new function**
4. Nome: `google-search`
5. Cole o código do arquivo `supabase/functions/google-search/index.ts`
6. Clique em **Deploy**

### 2. Deploy da função `duckduckgo-search`

1. Ainda em **Edge Functions** → **Create a new function**
2. Nome: `duckduckgo-search`
3. Cole o código do arquivo `supabase/functions/duckduckgo-search/index.ts`
4. Clique em **Deploy**

### 3. Verificar Secrets (já configuradas)

As secrets `GOOGLE_API_KEY` e `GOOGLE_CX` já foram adicionadas, então está tudo pronto!

---

## Opção 2: Via CLI (Se preferir)

### 1. Linkar ao projeto

```bash
# Login no Supabase
supabase login

# Linkar ao projeto (substitua pelo seu Project Reference ID)
supabase link --project-ref seu-project-ref-aqui
```

**Onde encontrar o Project Reference ID:**
- Supabase Dashboard → Settings → General → Reference ID

### 2. Deploy das funções

```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje

# Deploy google-search
supabase functions deploy google-search

# Deploy duckduckgo-search
supabase functions deploy duckduckgo-search
```

---

## ✅ Verificar se Funcionou

1. **No Dashboard:**
   - Vá em **Edge Functions**
   - Deve aparecer `google-search` e `duckduckgo-search` na lista
   - Status deve ser "Active"

2. **Testar no Sistema:**
   - Selecione um modelo Gemini (ex: `google/gemini-pro-1.5`)
   - Faça uma pergunta que precise de busca (ex: "Qual é a melhor estratégia de marketing em 2024?")
   - Veja o console do navegador (F12) - deve aparecer logs de busca

---

## 🎯 Pronto!

Depois do deploy, a busca automática funcionará:
- **Google Search** (se configurado com secrets)
- **DuckDuckGo** (fallback automático, sempre funciona)

