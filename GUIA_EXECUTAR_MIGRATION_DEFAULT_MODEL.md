# 🚀 Guia: Executar Migration - Default Model

## ⚠️ Erro Atual
```
column cliente_apexia_config.default_model does not exist
```

Este erro ocorre porque a coluna `default_model` ainda não foi criada no banco de dados.

## ✅ Solução: Executar Migration

### Passo 1: Acessar Supabase SQL Editor
1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. No menu lateral, clique em **SQL Editor**

### Passo 2: Executar o Script SQL
1. Clique em **New Query**
2. Copie e cole o conteúdo do arquivo `EXECUTAR_MIGRATION_DEFAULT_MODEL.sql`
3. Clique em **Run** (ou pressione `Ctrl+Enter` / `Cmd+Enter`)

### Passo 3: Verificar se Funcionou
Após executar, você deve ver uma mensagem de sucesso mostrando que a coluna foi criada.

### Passo 4: Recarregar a Aplicação
Após executar a migration:
1. Recarregue a página do sistema (F5)
2. O erro deve desaparecer
3. Agora você poderá escolher o modelo padrão para cada cliente quando "Tráfego Pago" estiver ativado

## 📋 Script SQL Completo

O arquivo `EXECUTAR_MIGRATION_DEFAULT_MODEL.sql` contém o script completo.

## 🔍 Verificação

Para verificar se a coluna foi criada, execute:

```sql
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'cliente_apexia_config' 
AND column_name = 'default_model';
```

Se a coluna existir, você verá uma linha com `default_model`, `text`, `YES`.
