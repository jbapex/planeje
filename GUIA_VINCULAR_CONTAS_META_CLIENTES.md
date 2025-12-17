# 📘 Guia: Vincular Contas Meta aos Clientes

Este guia explica como vincular contas de anúncios do Meta/Facebook aos clientes cadastrados no sistema.

## 🎯 Objetivo

Permitir que cada cliente tenha suas contas de anúncios vinculadas, facilitando:
- Visualização filtrada dos dados por cliente
- Organização das campanhas por cliente
- Gestão mais eficiente de múltiplos clientes

## 📋 Pré-requisitos

1. ✅ Tabela `cliente_meta_accounts` criada no banco de dados
2. ✅ Edge Function `meta-ads-api` configurada e funcionando
3. ✅ Token do Meta configurado e contas de anúncios acessíveis

## 🚀 Passo a Passo

### 1. Aplicar a Migration

Execute o script SQL no Supabase SQL Editor:

```sql
-- Execute o arquivo: src/lib/migrations/005_create_cliente_meta_accounts.sql
-- Ou copie e cole o conteúdo diretamente no SQL Editor
```

**Ou use o script auxiliar:**
```sql
-- Execute: VINCULAR_CONTAS_META_CLIENTES.sql
```

### 2. Vincular Contas no Formulário de Cliente

1. Acesse **Clientes** no menu
2. Abra ou crie um cliente
3. Role até a seção **"Contas de Anúncios Meta"** (aparece apenas quando editando um cliente existente)
4. Clique em **"Vincular"** e selecione uma conta do Meta
5. A conta será vinculada automaticamente

### 3. Filtrar por Cliente no Meta Insights

1. Acesse **Gestão de Tráfego** → **Meta Insights**
2. No filtro **"Filtrar por Cliente"**, selecione:
   - **"Todos os Clientes"** → Mostra todas as contas disponíveis
   - **Nome do Cliente** → Mostra apenas contas vinculadas àquele cliente
3. Selecione a conta desejada no dropdown de contas
4. Os dados serão filtrados automaticamente

## 🔧 Funcionalidades

### Gerenciamento de Vínculos

- ✅ **Vincular**: Adiciona uma conta ao cliente
- ✅ **Desvincular**: Remove a vinculação (soft delete - pode ser reativada)
- ✅ **Visualização**: Lista todas as contas vinculadas ao cliente
- ✅ **Validação**: Impede vincular a mesma conta duas vezes

### Filtros no Meta Insights

- ✅ **Filtro por Cliente**: Mostra apenas contas vinculadas
- ✅ **Todos os Clientes**: Mostra todas as contas disponíveis
- ✅ **Auto-filtro**: Contas são filtradas automaticamente ao selecionar cliente

## 📊 Estrutura de Dados

### Tabela: `cliente_meta_accounts`

```sql
- id (uuid): ID único da vinculação
- cliente_id (uuid): ID do cliente
- meta_account_id (text): ID da conta do Meta (ex: "act_123456789")
- meta_account_name (text): Nome da conta (para facilitar visualização)
- is_active (boolean): Se a vinculação está ativa
- notes (text): Notas opcionais
- created_at (timestamp): Data de criação
- updated_at (timestamp): Data de atualização
```

### Relacionamentos

- **Many-to-Many**: Um cliente pode ter múltiplas contas
- **Soft Delete**: Desvincular não deleta, apenas desativa (`is_active = false`)
- **Cascade Delete**: Se um cliente for deletado, suas vinculações também são

## 💡 Exemplos de Uso

### Exemplo 1: Cliente com Múltiplas Contas

1. Cliente "Impacto Noivas" tem 3 contas:
   - `act_123456789` - Conta Principal
   - `act_987654321` - Conta de Testes
   - `act_555555555` - Conta de Eventos

2. Todas são vinculadas no formulário do cliente

3. Ao filtrar por "Impacto Noivas" no Meta Insights, apenas essas 3 contas aparecem

### Exemplo 2: Filtrar Dados por Cliente

1. Selecione "Impacto Noivas" no filtro de cliente
2. Selecione "Conta Principal" no dropdown de contas
3. Todos os dados (campanhas, ad sets, ads) serão filtrados automaticamente

### Exemplo 3: Ver Todas as Contas

1. Selecione "Todos os Clientes" no filtro
2. Todas as contas disponíveis do Meta aparecerão
3. Útil para administradores que gerenciam múltiplos clientes

## 🔍 Consultas Úteis (SQL)

### Ver todas as vinculações

```sql
SELECT 
    c.empresa as cliente,
    cma.meta_account_name as conta_meta,
    cma.meta_account_id,
    cma.is_active,
    cma.created_at
FROM cliente_meta_accounts cma
JOIN clientes c ON c.id = cma.cliente_id
ORDER BY c.empresa, cma.created_at DESC;
```

### Ver contas de um cliente específico

```sql
SELECT * FROM cliente_meta_accounts 
WHERE cliente_id = 'uuid-do-cliente-aqui' 
AND is_active = true;
```

### Reativar uma vinculação desativada

```sql
UPDATE cliente_meta_accounts 
SET is_active = true 
WHERE id = 'uuid-da-vinculacao';
```

## ⚠️ Observações Importantes

1. **Apenas Clientes Existentes**: A seção de vinculação só aparece ao editar um cliente já salvo
2. **Contas Disponíveis**: Apenas contas acessíveis pelo token do Meta aparecem para vincular
3. **Filtro Automático**: Ao selecionar um cliente, apenas suas contas vinculadas aparecem
4. **Soft Delete**: Desvincular não deleta permanentemente - pode ser reativada

## 🐛 Troubleshooting

### Problema: "Nenhuma conta vinculada" mesmo após vincular

**Solução**: Verifique se:
- A conta está com `is_active = true` no banco
- O `meta_account_id` está correto
- A conta ainda existe no Meta

### Problema: Conta não aparece para vincular

**Solução**: Verifique se:
- A Edge Function está funcionando
- O token do Meta está configurado
- A conta tem permissões corretas

### Problema: Erro ao vincular

**Solução**: Verifique se:
- O cliente foi salvo primeiro (tem ID)
- A conta não está já vinculada
- Há permissões no banco de dados

## 📝 Próximos Passos

Após vincular contas:
1. Use o filtro por cliente no Meta Insights
2. Visualize dados específicos de cada cliente
3. Organize campanhas por cliente
4. Facilite a gestão de múltiplos clientes

---

**Criado em**: 2024  
**Versão**: 1.0

