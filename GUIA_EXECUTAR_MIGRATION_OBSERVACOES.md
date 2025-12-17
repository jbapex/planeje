# Guia: Executar Migration de Observações

## Erro Atual
```
Could not find the table 'public.cliente_meta_observations' in the schema cache
```

## Solução

### Passo 1: Abrir o Supabase Dashboard
1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Faça login na sua conta
3. Selecione o projeto do sistema

### Passo 2: Abrir o SQL Editor
1. No menu lateral, clique em **"SQL Editor"**
2. Clique em **"New query"** (Nova consulta)

### Passo 3: Executar o Script
1. Abra o arquivo `EXECUTAR_MIGRATION_OBSERVACOES.sql` neste projeto
2. Copie TODO o conteúdo do arquivo
3. Cole no SQL Editor do Supabase
4. Clique em **"Run"** (ou pressione `Ctrl+Enter` / `Cmd+Enter`)

### Passo 4: Verificar
Você deve ver a mensagem:
```
Tabela cliente_meta_observations criada com sucesso!
```

### Passo 5: Testar no Sistema
1. Volte para a aplicação
2. Recarregue a página (F5)
3. Clique no ícone de mensagem na coluna "Observações"
4. Tente adicionar uma observação

## Se o erro persistir

1. **Verifique se a tabela foi criada:**
   - No Supabase, vá em **"Table Editor"**
   - Procure por `cliente_meta_observations`
   - Se não aparecer, execute o script novamente

2. **Verifique as permissões:**
   - Certifique-se de que as políticas RLS foram criadas
   - O script já inclui todas as permissões necessárias

3. **Limpe o cache do navegador:**
   - Pressione `Ctrl+Shift+R` (Windows/Linux) ou `Cmd+Shift+R` (Mac)
   - Isso força o recarregamento completo da página

## Arquivo SQL
O arquivo `EXECUTAR_MIGRATION_OBSERVACOES.sql` está na raiz do projeto.

