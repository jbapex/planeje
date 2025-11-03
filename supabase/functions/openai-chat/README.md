# Edge Function: openai-chat

Esta Edge Function permite que o ApexIA funcione publicamente, sem necessidade de autenticação do cliente.

## 🚀 Como Deployar

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# 1. Instale o Supabase CLI (se ainda não tiver)
npm install -g supabase

# 2. Login no Supabase
supabase login

# 3. Link com seu projeto
supabase link --project-ref seu-project-ref

# 4. Deploy da função
supabase functions deploy openai-chat
```

### Opção 2: Via Dashboard do Supabase

1. Vá para **Edge Functions** no Dashboard
2. Clique em **Create Function**
3. Nome: `openai-chat`
4. Cole o conteúdo de `index.ts`
5. Clique em **Deploy**

## 🔐 Configurar Secrets

A Edge Function precisa acessar:
- API key da OpenAI
- Service Role Key do Supabase (já está disponível automaticamente)

### Configurar OPENAI_API_KEY

#### Opção A: Via Variável de Ambiente (Mais Fácil)

1. No Dashboard → **Edge Functions** → **Settings**
2. Adicione uma variável de ambiente:
   - Nome: `OPENAI_API_KEY`
   - Valor: Sua chave da OpenAI

#### Opção B: Via Tabela app_secrets (Mais Seguro)

1. Execute este SQL no Supabase (como superadmin logado):

```sql
-- Salvar a chave
SELECT set_encrypted_secret('OPENAI_API_KEY', 'sua-chave-openai-aqui');
```

A função buscará automaticamente da tabela `app_secrets` primeiro, depois das variáveis de ambiente.

## ✅ Testar a Função

### Teste Local (se usar CLI)

```bash
supabase functions serve openai-chat
```

### Teste em Produção

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/openai-chat \
  -H "Authorization: Bearer sua-anon-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Olá! Você está funcionando?"}
    ],
    "model": "gpt-4o"
  }'
```

Ou use o Postman/Insomnia para testar com streaming.

## 🔍 Verificar Logs

No Dashboard do Supabase:
1. Vá para **Edge Functions** → **Logs**
2. Selecione `openai-chat`
3. Veja os logs em tempo real

## 📝 Checklist de Configuração

- [ ] Edge Function deployada
- [ ] `OPENAI_API_KEY` configurada (env var ou app_secrets)
- [ ] Teste feito e funcionando
- [ ] Logs verificados
- [ ] Frontend testando a função

## 🚨 Troubleshooting

### Erro: "OpenAI API key não configurada"
- Verifique se a variável de ambiente `OPENAI_API_KEY` está configurada
- OU execute o SQL para salvar em `app_secrets`

### Erro: "Configuração do servidor incompleta"
- As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` devem estar configuradas automaticamente
- Se não estiverem, adicione manualmente nas configurações da Edge Function

### Erro: "Function not found" (404)
- Verifique se a função foi deployada corretamente
- Verifique se o nome da função está correto: `openai-chat`

### Streaming não funciona
- Verifique se o frontend está processando o `response.body` corretamente
- Veja os logs da Edge Function para erros

## 📌 Notas Importantes

1. **Segurança**: A API key da OpenAI NUNCA é exposta ao cliente
2. **Público**: Esta função aceita requisições `anon` (sem autenticação)
3. **Rate Limiting**: Considere adicionar rate limiting para evitar abuso
4. **Custo**: Monitore o uso da API da OpenAI para controlar custos

