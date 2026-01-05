# 🚀 Guia: Executar Migration - Limite Meta

## ⚠️ Erro Atual
```
column clientes.limite_meta does not exist
```

Este erro ocorre porque a coluna `limite_meta` ainda não foi criada no banco de dados.

## ✅ Solução: Executar Migration

### Passo 1: Acessar Supabase SQL Editor
1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. No menu lateral, clique em **SQL Editor**

### Passo 2: Executar o Script SQL
1. Clique em **New Query**
2. Copie e cole o conteúdo do arquivo `EXECUTAR_MIGRATION_LIMITE_META.sql`
3. Clique em **Run** (ou pressione `Ctrl+Enter` / `Cmd+Enter`)

### Passo 3: Verificar se Funcionou
Após executar, você deve ver uma mensagem de sucesso:
```
NOTICE: Coluna limite_meta adicionada com sucesso!
```

### Passo 4: Recarregar a Aplicação
Após executar a migration:
1. Recarregue a página do sistema (F5)
2. O erro deve desaparecer
3. A coluna "Limite R$" na Gestão de Tráfego agora usará `limite_meta` ao invés de `valor`

## 📋 Script SQL Completo

```sql
-- Adiciona a coluna limite_meta se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clientes' 
        AND column_name = 'limite_meta'
    ) THEN
        ALTER TABLE public.clientes 
        ADD COLUMN limite_meta NUMERIC(10, 2) DEFAULT NULL;
        
        RAISE NOTICE 'Coluna limite_meta adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna limite_meta já existe.';
    END IF;
END $$;

-- Adiciona comentário explicativo
COMMENT ON COLUMN public.clientes.limite_meta IS 'Limite de gasto no Meta Ads (custo/despesa). Diferente de valor (quanto o cliente paga - receita).';

-- Garante permissões
GRANT SELECT, UPDATE ON TABLE public.clientes TO authenticated;
```

## 🔍 Verificação

Para verificar se a coluna foi criada, execute:

```sql
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'clientes' 
AND column_name IN ('valor', 'limite_meta')
ORDER BY column_name;
```

Você deve ver ambas as colunas:
- `valor` - Quanto o cliente paga (receita)
- `limite_meta` - Limite de gasto no Meta Ads (custo)

## 📝 Notas Importantes

- **`valor`**: Usado na Gestão de Clientes (quanto o cliente paga)
- **`limite_meta`**: Usado na Gestão de Tráfego (limite de gasto no Meta)
- Os campos são independentes e podem ter valores diferentes
- Se um cliente não tiver `limite_meta` definido, aparecerá como "-" na tabela

