# 📍 Como Acessar e Usar as Contas Meta

## 🎯 Onde Encontrar

### 1️⃣ **VINCULAR CONTAS (No Formulário de Cliente)**

**Passo a passo:**

1. **Acesse o menu "Clientes"** na barra lateral
   - Ou digite na URL: `/#/clients`

2. **Clique em um cliente existente** para editá-lo
   - ⚠️ **IMPORTANTE**: A seção de contas Meta só aparece quando você está **EDITANDO** um cliente que já foi salvo
   - Se for um cliente novo, primeiro salve-o, depois edite novamente

3. **Role a página para baixo** no formulário de edição
   - Você verá uma seção chamada **"Contas de Anúncios Meta"**
   - Ela aparece após os campos de etiquetas

4. **Vincule uma conta:**
   - Clique no dropdown "Selecione uma conta"
   - Escolha a conta do Meta que deseja vincular
   - Clique em **"Vincular"**

5. **Visualize contas vinculadas:**
   - As contas vinculadas aparecem em uma lista
   - Você pode desvincular clicando no ❌ ao lado de cada conta

---

### 2️⃣ **FILTRAR POR CLIENTE (No Meta Insights)**

**Passo a passo:**

1. **Acesse "Gestão de Tráfego"** no menu
   - Ou digite na URL: `/#/traffic`

2. **Clique na aba "Meta Insights"**
   - Se a conexão com Meta não estiver ativa, você verá uma mensagem

3. **No topo da página, você verá dois filtros:**
   - **Primeiro filtro**: "Filtrar por Cliente" (NOVO!)
   - **Segundo filtro**: "Selecione uma conta"

4. **Use o filtro de cliente:**
   - Selecione **"Todos os Clientes"** → Mostra todas as contas disponíveis
   - Selecione um **cliente específico** → Mostra apenas contas vinculadas àquele cliente

5. **Selecione a conta:**
   - Após filtrar por cliente, escolha a conta desejada
   - Os dados serão carregados automaticamente

---

## 🗺️ Mapa Visual

```
📱 Menu Lateral
│
├── 👥 Clientes
│   └── [Clique em um cliente]
│       └── 📝 Formulário de Edição
│           └── ⬇️ Role para baixo
│               └── 🔗 "Contas de Anúncios Meta"
│                   ├── Lista de contas vinculadas
│                   └── Botão "Vincular"
│
└── 📊 Gestão de Tráfego
    └── 📈 Meta Insights (aba)
        └── 🔍 Filtros no topo
            ├── "Filtrar por Cliente" (NOVO!)
            └── "Selecione uma conta"
```

---

## ⚠️ Problemas Comuns

### ❌ "Não vejo a seção de contas Meta no formulário"

**Solução:**
- Certifique-se de estar **EDITANDO** um cliente existente (não criando um novo)
- O cliente precisa ter sido salvo pelo menos uma vez
- Role a página para baixo - a seção aparece após os campos de etiquetas

### ❌ "Nenhuma conta disponível para vincular"

**Solução:**
- Verifique se a Edge Function `meta-ads-api` está configurada
- Verifique se o token do Meta está configurado
- Verifique se há contas de anúncios acessíveis no Meta Business Manager

### ❌ "Filtro de cliente não aparece no Meta Insights"

**Solução:**
- Certifique-se de que a migration foi executada com sucesso
- Verifique se há clientes cadastrados no sistema
- Recarregue a página (F5)

### ❌ "Ao filtrar por cliente, não aparece nenhuma conta"

**Solução:**
- Verifique se o cliente tem contas vinculadas (no formulário do cliente)
- Se não tiver, vincule pelo menos uma conta primeiro
- Verifique se as contas vinculadas estão com `is_active = true`

---

## 🔍 Verificar no Banco de Dados

Se quiser verificar diretamente no banco:

```sql
-- Ver todas as vinculações
SELECT 
    c.empresa as cliente,
    cma.meta_account_name as conta_meta,
    cma.meta_account_id,
    cma.is_active
FROM cliente_meta_accounts cma
JOIN clientes c ON c.id = cma.cliente_id
ORDER BY c.empresa;
```

---

## 📝 Resumo Rápido

| Onde | O que fazer | Quando usar |
|------|-------------|-------------|
| **Formulário de Cliente** | Vincular/desvincular contas | Quando quiser associar contas Meta a um cliente |
| **Meta Insights** | Filtrar contas por cliente | Quando quiser ver dados apenas de um cliente específico |

---

**Dúvidas?** Consulte o `GUIA_VINCULAR_CONTAS_META_CLIENTES.md` para mais detalhes!

