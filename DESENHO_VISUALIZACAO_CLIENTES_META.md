# 🎨 Desenho: Visualização de Clientes com Dados Meta

## 📊 Conceito da Visualização

Criar uma **tabela consolidada** na aba "Gestão de Tráfego" que mostra:
- **Linhas**: Cada cliente cadastrado no sistema
- **Colunas**: Métricas do Meta Ads API agregadas por cliente
- **Cores**: Indicadores visuais baseados em limites e status

---

## 🗂️ Estrutura da Tabela

### **Colunas Propostas:**

| Coluna | Descrição | Fonte | Formato |
|--------|-----------|-------|---------|
| **Clientes** | Nome do cliente | `clientes.empresa` | Texto |
| **D. ATUALIZAÇÃO** | Data da última atualização dos dados | `campaigns.updated_time` (mais recente) | Data (dd/mm/yyyy) |
| **Limite R$** | Limite de investimento do cliente | `paid_campaigns.limite` ou `clientes.valor` | Moeda (R$ X.XXX,XX) |
| **V. Acumulado** | Valor total gasto (spend) | Soma de `insights.spend` de todas as campanhas | Moeda (R$ X.XXX,XX) |
| **Mensagens** | Total de mensagens recebidas | Soma de `insights.messaging_conversations_started` | Número |
| **C/ Mensagens** | Custo por mensagem | `V. Acumulado / Mensagens` | Moeda (R$ X,XX) |
| **Alcance** | Total de pessoas alcançadas | Soma de `insights.reach` | Número formatado |
| **Cliques** | Total de cliques | Soma de `insights.clicks` | Número formatado |
| **Impressões** | Total de impressões | Soma de `insights.impressions` | Número formatado |
| **CTR** | Taxa de cliques | `(Cliques / Impressões) * 100` | Porcentagem (X,XX%) |
| **CPM** | Custo por mil impressões | `(V. Acumulado / Impressões) * 1000` | Moeda (R$ X,XX) |
| **Compra** | Total de compras/conversões | Soma de `insights.omni_purchase` (de actions) | Número |
| **Retorno** | Valor total de compras | Soma de `insights.omni_purchase` (de action_values) | Moeda (R$ X.XXX,XX) |
| **C/ compra** | Custo por compra | `V. Acumulado / Compra` | Moeda (R$ X,XX) |
| **META** | Status da campanha | `paid_campaigns.status` ou lógica de status | Badge colorido |
| **OBSERVAÇÃO** | Observações do cliente | `paid_campaigns.observacao` | Texto |

---

## 🎨 Sistema de Cores

### **V. Acumulado (Valor Acumulado)**
- 🟢 **Verde**: `V. Acumulado < Limite R$` (dentro do limite)
- 🟡 **Amarelo**: `V. Acumulado >= Limite R$ * 0.9` (próximo do limite)
- 🔴 **Vermelho**: `V. Acumulado >= Limite R$` (excedeu o limite)

### **C/ Mensagens (Custo por Mensagem)**
- 🟢 **Verde**: `C/ Mensagens <= R$ 5,00` (baixo custo)
- 🟡 **Amarelo**: `R$ 5,00 < C/ Mensagens <= R$ 15,00` (custo médio)
- 🔴 **Vermelho**: `C/ Mensagens > R$ 15,00` (alto custo)

### **META (Status)**
- 🟢 **Verde**: "META ATIVO" - Campanha ativa no Meta
- 🟡 **Amarelo**: "META PAUSADO" - Campanha pausada
- ⚫ **Cinza Escuro**: "META DESATIVADO" - Campanha desativada ou sem dados

---

## 🔄 Fluxo de Dados

```
┌─────────────────┐
│   Clientes      │
│   (Supabase)    │
└────────┬────────┘
         │
         │ Para cada cliente:
         │
         ▼
┌─────────────────┐
│ Contas Meta     │
│ Vinculadas      │
│ (cliente_meta_  │
│  accounts)      │
└────────┬────────┘
         │
         │ Busca contas vinculadas
         │
         ▼
┌─────────────────┐
│ Meta Ads API    │
│ (Edge Function) │
└────────┬────────┘
         │
         │ Para cada conta:
         │ - get-campaigns
         │ - get-account-insights
         │
         ▼
┌─────────────────┐
│ Agregação       │
│ de Dados        │
└────────┬────────┘
         │
         │ Soma/Calcula métricas
         │ por cliente
         │
         ▼
┌─────────────────┐
│ Tabela          │
│ Consolidada     │
└─────────────────┘
```

---

## 📋 Lógica de Agregação

### **Para cada cliente:**

1. **Buscar contas vinculadas:**
   ```sql
   SELECT meta_account_id 
   FROM cliente_meta_accounts 
   WHERE cliente_id = ? AND is_active = true
   ```

2. **Para cada conta vinculada:**
   - Buscar campanhas: `get-campaigns` (Edge Function)
   - Buscar insights da conta: `get-account-insights` (Edge Function)
   - Agregar dados de todas as campanhas

3. **Calcular métricas:**
   - **V. Acumulado**: Soma de `spend` de todas as campanhas
   - **Mensagens**: Soma de `messaging_conversations_started`
   - **Alcance**: Soma de `reach`
   - **Cliques**: Soma de `clicks`
   - **Impressões**: Soma de `impressions`
   - **Compra**: Soma de `omni_purchase` (de `actions`)
   - **Retorno**: Soma de `omni_purchase` (de `action_values`)

4. **Calcular métricas derivadas:**
   - **C/ Mensagens**: `V. Acumulado / Mensagens`
   - **CTR**: `(Cliques / Impressões) * 100`
   - **CPM**: `(V. Acumulado / Impressões) * 1000`
   - **C/ compra**: `V. Acumulado / Compra`

5. **Determinar status (META):**
   - Se tem campanhas ativas → "META ATIVO" (verde)
   - Se todas pausadas → "META PAUSADO" (amarelo)
   - Se sem dados ou desativado → "META DESATIVADO" (cinza)

---

## 🎯 Onde Implementar

### **Nova Aba na Gestão de Tráfego:**

```
Gestão de Tráfego
├── Campanhas Manuais (já existe)
├── Meta Insights (já existe)
└── 📊 Visão Geral Clientes (NOVO!)
```

### **Componente Proposto:**

- **Nome**: `ClientMetaOverview.jsx`
- **Localização**: `src/components/traffic/ClientMetaOverview.jsx`
- **Integração**: Adicionar como nova aba em `PaidTraffic.jsx`

---

## 🔧 Funcionalidades

### **1. Carregamento de Dados**
- Buscar todos os clientes do sistema
- Para cada cliente, buscar contas Meta vinculadas
- Fazer requisições paralelas para Meta API (com rate limiting)
- Agregar e calcular métricas
- Exibir em tabela

### **2. Filtros e Ordenação**
- Filtrar por status (ATIVO, PAUSADO, DESATIVADO)
- Ordenar por qualquer coluna
- Buscar por nome do cliente

### **3. Atualização**
- Botão "Atualizar" para recarregar dados
- Auto-refresh opcional (a cada X minutos)
- Loading state durante carregamento

### **4. Exportação (Futuro)**
- Exportar para CSV/Excel
- Imprimir relatório

---

## 📊 Exemplo de Dados Esperados

| Clientes | D. ATUALIZAÇÃO | Limite R$ | V. Acumulado | Mensagens | C/ Mensagens | META |
|----------|----------------|-----------|--------------|-----------|--------------|------|
| Impacto Noivas | 15/01/2024 | R$ 6.000,00 | 🔴 R$ 6.605,48 | 532 | 🔴 R$ 12,42 | 🟢 ATIVO |
| Lovato | 14/01/2024 | R$ 1.000,00 | 🟢 R$ 786,39 | 432 | 🟢 R$ 1,82 | 🟢 ATIVO |
| APEX Annah CWB | 13/01/2024 | R$ 1.500,00 | 🔴 R$ 1.487,49 | 457 | 🟡 R$ 3,25 | 🟢 ATIVO |

---

## ⚠️ Considerações Técnicas

### **Performance:**
- **Rate Limiting**: Fazer requisições com delays (200-500ms entre contas)
- **Cache**: Armazenar dados por X minutos para evitar requisições excessivas
- **Paralelização**: Processar múltiplos clientes em paralelo (com limite)

### **Tratamento de Erros:**
- Se conta não tem acesso → Mostrar "Sem Dados"
- Se rate limit atingido → Mostrar aviso e tentar novamente
- Se cliente não tem contas vinculadas → Mostrar "Sem Contas Vinculadas"

### **Otimizações:**
- Carregar dados sob demanda (lazy loading)
- Paginação se houver muitos clientes
- Virtual scrolling para tabelas grandes

---

## 🎨 Design da Interface

### **Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Visão Geral Clientes - Meta Ads                        │
├─────────────────────────────────────────────────────────┤
│  [Filtros: Status ▼] [Buscar...] [🔄 Atualizar]        │
├─────────────────────────────────────────────────────────┤
│  [Tabela com scroll horizontal e vertical]               │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┐            │
│  │Client│Data  │Limite│V.Acum│Mensag│C/Mens│ ...        │
│  ├──────┼──────┼──────┼──────┼──────┼──────┤            │
│  │Cliente1│...│...│...│...│...│...                      │
│  │Cliente2│...│...│...│...│...│...                      │
│  └──────┴──────┴──────┴──────┴──────┴──────┘            │
└─────────────────────────────────────────────────────────┘
```

### **Responsividade:**
- Desktop: Tabela completa com todas as colunas
- Tablet: Tabela com scroll horizontal
- Mobile: Cards empilhados (versão simplificada)

---

## ✅ Checklist de Implementação

- [ ] Criar componente `ClientMetaOverview.jsx`
- [ ] Adicionar nova aba em `PaidTraffic.jsx`
- [ ] Implementar busca de clientes
- [ ] Implementar busca de contas vinculadas
- [ ] Implementar chamadas à Meta API
- [ ] Implementar agregação de dados
- [ ] Implementar cálculos de métricas
- [ ] Implementar sistema de cores
- [ ] Implementar filtros e ordenação
- [ ] Implementar loading states
- [ ] Implementar tratamento de erros
- [ ] Testar com múltiplos clientes
- [ ] Otimizar performance

---

## 🚀 Próximos Passos

1. **Aprovar o desenho** ✅
2. **Implementar estrutura básica** (componente + aba)
3. **Implementar busca de dados** (clientes + contas)
4. **Implementar chamadas Meta API**
5. **Implementar agregação e cálculos**
6. **Implementar UI (tabela + cores)**
7. **Testar e otimizar**

---

**Status**: 🎨 **DESENHO** - Aguardando aprovação para implementação

