# 🚀 PASSO A PASSO COMPLETO - Deploy Edge Function meta-ads-api

## ⚠️ IMPORTANTE: O código local está correto, mas precisa ser deployado no Supabase!

---

## 📋 MÉTODO 1: Via Dashboard (Mais Fácil)

### Passo 1: Acessar o Dashboard
1. Abra: **https://supabase.com/dashboard**
2. Faça login
3. Selecione seu projeto: **slrpesefjkzoaufvogdj**

### Passo 2: Ir para Edge Functions
1. No menu lateral esquerdo, procure **"Edge Functions"**
2. Clique nele

### Passo 3: Encontrar a função meta-ads-api
1. Na lista de funções, procure por **"meta-ads-api"**
2. **Clique no nome da função** (não em "Deploy", mas no nome mesmo)

### Passo 4: Editar o código
1. Você verá uma tela com o código atual
2. Procure por um botão **"Edit"** ou **"Deploy"** ou um ícone de lápis ✏️ no canto superior direito
3. Clique para entrar no modo de edição

### Passo 5: Substituir TODO o código
1. **Selecione TODO o código** na tela (Ctrl+A ou Cmd+A)
2. **Delete tudo** (Delete ou Backspace)
3. Abra o arquivo local: `supabase/functions/meta-ads-api/index.ts`
4. **Selecione TODO o conteúdo** (Ctrl+A ou Cmd+A)
5. **Copie** (Ctrl+C ou Cmd+C)
6. Volte ao Dashboard
7. **Cole o código** (Ctrl+V ou Cmd+V)

### Passo 6: Salvar e Deploy
1. Procure por um botão **"Deploy"** ou **"Save"** ou **"Update"**
2. Clique nele
3. Aguarde a mensagem de sucesso (pode levar alguns segundos)

### Passo 7: Verificar se funcionou
1. Vá em **"Logs"** ou **"View Logs"**
2. Teste com este JSON na aba "Invoke" ou "Test":
```json
{
  "action": "get-pages"
}
```
3. Deve retornar algo como:
```json
{
  "pages": [...]
}
```

---

## 📋 MÉTODO 2: Via CLI (Mais Rápido)

### Passo 1: Abrir Terminal
Abra o terminal no diretório do projeto

### Passo 2: Verificar Login
```bash
supabase login
```
Se já estiver logado, pule para o próximo passo.

### Passo 3: Linkar Projeto (se necessário)
```bash
# Pegue o Project Reference ID em: Dashboard → Settings → General → Reference ID
supabase link --project-ref slrpesefjkzoaufvogdj
```

### Passo 4: Fazer Deploy
```bash
supabase functions deploy meta-ads-api
```

### Passo 5: Verificar
O comando deve mostrar "Deployed successfully" ou similar.

---

## 🔍 VERIFICAÇÃO PÓS-DEPLOY

### Teste 1: Verificar se os endpoints existem
No Dashboard, vá em Edge Functions → meta-ads-api → Logs

Teste com:
```json
{
  "action": "get-pages"
}
```

**Deve retornar:** `{"pages": [...]}` ou `{"pages": [], "error": {...}}`

**NÃO deve retornar:** `{"error": {"message": "Unknown action: get-pages"}}`

### Teste 2: Verificar no sistema
1. Recarregue a página "Redes Sociais"
2. Clique na aba "Meta Business"
3. O erro "Unknown action" deve desaparecer

---

## ❌ PROBLEMAS COMUNS

### Problema: "Unknown action" ainda aparece
**Causa:** O deploy não foi feito corretamente ou o código não foi salvo

**Solução:**
1. Verifique se clicou em "Deploy" ou "Save" após colar o código
2. Verifique os logs da função para ver se há erros de sintaxe
3. Tente fazer o deploy novamente

### Problema: Erro de sintaxe no deploy
**Causa:** Código com erro de TypeScript/JavaScript

**Solução:**
1. Verifique se copiou TODO o código (linhas 1-1382)
2. Verifique se não há caracteres estranhos
3. Tente colar novamente

### Problema: "Function not found"
**Causa:** Nome da função está errado

**Solução:**
- O nome deve ser exatamente: `meta-ads-api` (com hífen, tudo minúsculo)

---

## ✅ CHECKLIST FINAL

- [ ] Código copiado do arquivo `supabase/functions/meta-ads-api/index.ts`
- [ ] TODO o código foi colado no Dashboard
- [ ] Botão "Deploy" ou "Save" foi clicado
- [ ] Mensagem de sucesso apareceu
- [ ] Teste com `{"action": "get-pages"}` retorna sucesso
- [ ] Erro "Unknown action" desapareceu no sistema

---

## 📞 Se ainda não funcionar

1. Verifique os logs da Edge Function no Dashboard
2. Verifique se há erros de sintaxe
3. Tente fazer o deploy via CLI (método 2)
4. Verifique se o nome da função está correto: `meta-ads-api`
