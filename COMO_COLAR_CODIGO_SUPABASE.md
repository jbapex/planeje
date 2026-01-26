# 📋 COMO COLAR O CÓDIGO NO SUPABASE - Passo a Passo Visual

## ⚠️ PROBLEMA ATUAL
O erro "Unknown action: get-pages" significa que o código novo ainda não foi deployado no Supabase.

---

## 🎯 SOLUÇÃO: Deploy via Dashboard

### PASSO 1: Abrir a Função
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Clique em **"Edge Functions"** no menu lateral
4. Clique no nome **"meta-ads-api"** (não em "Deploy")

### PASSO 2: Entrar no Editor
1. Você verá o código atual da função
2. Procure por um botão **"Edit"** ou **"Deploy"** ou um ícone de lápis ✏️
3. Clique para entrar no modo de edição

### PASSO 3: Selecionar TODO o Código
1. **Clique dentro da área do código**
2. Pressione **Ctrl+A** (Windows/Linux) ou **Cmd+A** (Mac)
3. Todo o código deve ficar selecionado (azul)

### PASSO 4: Deletar o Código Antigo
1. Pressione **Delete** ou **Backspace**
2. O código antigo deve desaparecer completamente
3. A área deve ficar vazia

### PASSO 5: Copiar o Código Novo
1. Abra o arquivo: `supabase/functions/meta-ads-api/index.ts`
2. Pressione **Ctrl+A** (ou Cmd+A) para selecionar tudo
3. Pressione **Ctrl+C** (ou Cmd+C) para copiar

### PASSO 6: Colar o Código Novo
1. Volte para o Dashboard (onde estava o código vazio)
2. Clique dentro da área vazia
3. Pressione **Ctrl+V** (ou Cmd+V) para colar
4. O código completo deve aparecer (1381 linhas)

### PASSO 7: Salvar/Deploy
1. Procure por um botão **"Deploy"** ou **"Save"** ou **"Update"**
2. Clique nele
3. Aguarde a mensagem: "Deployed successfully" ou "Function updated"

### PASSO 8: Verificar
1. Vá em **"Logs"** ou **"View Logs"**
2. Teste com:
```json
{
  "action": "get-pages"
}
```
3. Deve retornar `{"pages": [...]}` e NÃO `{"error": {"message": "Unknown action"}}`

---

## 🔍 DICAS IMPORTANTES

### ✅ Certifique-se de:
- Copiou TODO o código (todas as 1381 linhas)
- Deletou TODO o código antigo antes de colar
- Clicou em "Deploy" ou "Save" após colar
- Aguardou a mensagem de sucesso

### ❌ Erros Comuns:
- **Não deletou o código antigo** → O código novo fica misturado com o antigo
- **Não copiou tudo** → Faltam linhas no final
- **Não clicou em Deploy** → O código não foi salvo
- **Copiou com caracteres estranhos** → Erro de sintaxe

---

## 🚀 MÉTODO ALTERNATIVO: Via CLI

Se o Dashboard não funcionar, use o terminal:

```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje
supabase functions deploy meta-ads-api
```

---

## ✅ TESTE FINAL

Após o deploy, recarregue a página "Redes Sociais" e clique em "Meta Business".

O erro "Unknown action: get-pages" deve desaparecer! 🎉
