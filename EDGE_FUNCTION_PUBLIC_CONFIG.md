# Configuração da Edge Function `openai-chat` para Acesso Público

## ✅ Resposta Rápida

**SIM**, o ApexIA já está configurado para funcionar sem autenticação em qualquer navegador. O código frontend já usa a chave `anon` do Supabase, que permite acesso público.

## 🔧 O Que Precisa Ser Feito no Servidor (Edge Function)

A Edge Function `openai-chat` precisa estar configurada no Supabase para:

1. ✅ Aceitar requisições anônimas (sem autenticação obrigatória)
2. ✅ Buscar a API key do OpenAI **no servidor** (Edge Function), não do cliente
3. ✅ Ter permissões corretas para acessar os secrets

## 📝 Estrutura da Edge Function

✅ **Arquivo completo criado!** Veja `supabase/functions/openai-chat/index.ts`

A Edge Function completa já foi criada no projeto com:
- ✅ Busca API key do servidor (app_secrets ou env var)
- ✅ Aceita requisições públicas (anon)
- ✅ Streaming completo
- ✅ Tratamento de erros robusto
- ✅ CORS configurado
- ✅ Logs detalhados

**Para usar**, veja o arquivo `supabase/functions/openai-chat/README.md` com instruções de deploy.

## 🔐 Configuração de Secrets no Supabase

### Opção 1: Usar Supabase Vault (Recomendado)

1. No Dashboard do Supabase → **Settings** → **Vault**
2. Crie um secret chamado `OPENAI_API_KEY`
3. Insira sua chave da OpenAI
4. A Edge Function acessará automaticamente via `service_role_key`

### Opção 2: Usar Tabela `app_secrets`

Execute este SQL no Supabase:

```sql
-- Salvar a chave (execute como superadmin logado)
SELECT set_encrypted_secret('OPENAI_API_KEY', 'sua-chave-openai-aqui');
```

A Edge Function buscará via RPC `get_encrypted_secret`.

## 🔒 Variáveis de Ambiente na Edge Function

No Dashboard do Supabase → **Edge Functions** → **Settings** → **Secrets**, adicione:

- `SUPABASE_URL`: Sua URL do Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Sua service role key (encontrada em Settings → API)

Ou configure `OPENAI_API_KEY` diretamente como secret da Edge Function.

## ✅ Verificar Se Está Funcionando

1. **Frontend já está correto**: O `PublicClientChat.jsx` já usa `supabase.functions.invoke()` sem autenticação
2. **Teste a Edge Function**: 
   ```bash
   curl -X POST https://seu-projeto.supabase.co/functions/v1/openai-chat \
     -H "Authorization: Bearer sua-anon-key" \
     -H "Content-Type: application/json" \
     -d '{"messages": [{"role": "user", "content": "Olá!"}], "model": "gpt-4o"}'
   ```

## 📌 Pontos Importantes

1. ✅ **Frontend não precisa mudança** - já está correto
2. ✅ **Edge Function deve usar `service_role_key`** para acessar secrets
3. ✅ **CORS deve permitir requisições de qualquer origem** para acesso público
4. ✅ **API key NUNCA deve ir para o cliente** - sempre buscar no servidor

## 🚨 Troubleshooting

Se receber erro "non-2xx status code":

1. Verifique se a Edge Function está deployada
2. Verifique se os secrets estão configurados
3. Verifique os logs da Edge Function no Dashboard do Supabase
4. Confirme que a Edge Function permite requisições `anon`

---

**Resumo**: O frontend já está pronto. Basta configurar a Edge Function no Supabase para buscar a API key no servidor e permitir acesso público (anon).

