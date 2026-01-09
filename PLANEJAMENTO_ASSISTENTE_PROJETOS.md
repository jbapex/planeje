# 🎯 Planejamento: Assistente Interno para Construção de Projetos

## 📋 Visão Geral

Criar um assistente de IA interno (para Admin e Colaboradores) que ajude a construir projetos para clientes com **profundidade e contexto completo**, evitando respostas rasas e informações perdidas.

---

## 🎯 Objetivos

1. **Ajudar na construção de projetos** com base em dados reais dos clientes
2. **Acesso completo** a todos os clientes, documentos, tarefas e dados cadastrados
3. **Respostas profundas** e contextualizadas, não genéricas
4. **Evitar perda de contexto** que acontece com ChatGPT atual
5. **Foco em projetos** - ajudar a criar planos de campanha, estratégias, etc.

---

## 🔍 Problemas Atuais com ChatGPT

### ❌ Problemas Identificados:
- Se perde com muitas informações
- Cria conteúdo genérico e raso
- Não mantém contexto entre mensagens
- Não usa efetivamente os dados disponíveis
- Respostas superficiais sem profundidade

### ✅ O que precisamos:
- Contexto organizado e hierárquico
- Instruções claras sobre profundidade esperada
- Acesso estruturado aos dados
- Memória de contexto entre conversas
- Foco em qualidade sobre quantidade

---

## 🏗️ Arquitetura Proposta

### 1. **Estrutura de Contexto Hierárquica**

```
📦 CONTEXTO COMPLETO DO SISTEMA
├── 📋 VISÃO GERAL DOS CLIENTES (resumo)
│   ├── Lista de todos os clientes com status
│   ├── Clientes ativos vs inativos
│   └── Estatísticas gerais
│
├── 👤 CLIENTE ESPECÍFICO (quando selecionado)
│   ├── Dados Cadastrais Completos
│   ├── Documentos e Notas
│   ├── Projetos Existentes
│   ├── Tarefas (realizadas e pendentes)
│   ├── Histórico de Interações
│   └── Metas e Objetivos
│
└── 📊 CONTEXTO DE PROJETO (quando em construção)
    ├── Objetivo do Projeto
    ├── Estratégia Proposta
    ├── Cronograma
    └── Materiais Necessários
```

### 2. **Sistema de Seleção de Cliente**

- **Modo 1: Visão Geral** - Acesso a todos os clientes (resumo)
- **Modo 2: Cliente Específico** - Foco em um cliente com contexto completo
- **Modo 3: Comparação** - Comparar múltiplos clientes

### 3. **Estrutura de Prompt Inteligente**

#### **Camada 1: Identidade e Missão**
```
Você é o Assistente de Projetos da JB APEX, um especialista em marketing digital e gestão de campanhas.

SUA MISSÃO:
- Ajudar a construir projetos completos e detalhados para clientes
- Usar TODOS os dados disponíveis sobre o cliente
- Criar estratégias profundas e específicas, não genéricas
- Considerar histórico, tarefas realizadas e contexto completo
```

#### **Camada 2: Regras de Profundidade**
```
REGRAS DE PROFUNDIDADE (CRÍTICO):
- NUNCA dê respostas genéricas ou superficiais
- SEMPRE use dados específicos do cliente mencionados
- SEMPRE considere o histórico e contexto completo
- SEMPRE pergunte se precisar de mais informações antes de criar algo genérico
- SEMPRE estruture respostas em seções claras e detalhadas
- SEMPRE faça conexões entre dados diferentes (ex: tarefas + documentos + projetos)
```

#### **Camada 3: Contexto Estruturado**
```
CONTEXTO DISPONÍVEL:
[Cliente Selecionado: Nome]
[Dados Cadastrais: ...]
[Documentos: ...]
[Projetos Existentes: ...]
[Tarefas Realizadas: ...]
[Tarefas Pendentes: ...]
[Histórico: ...]
```

#### **Camada 4: Instruções Específicas por Tipo de Projeto**
```
QUANDO CONSTRUIR UM PROJETO:
1. Analise TODOS os dados do cliente primeiro
2. Identifique padrões e insights
3. Considere projetos anteriores (o que funcionou?)
4. Considere tarefas realizadas (o que já foi feito?)
5. Crie estratégia específica, não genérica
6. Detalhe cada seção com profundidade
7. Conecte estratégia com dados reais do cliente
```

---

## 📊 Estrutura de Dados a Acessar

### **Dados do Cliente:**
- ✅ Informações cadastrais completas
- ✅ Documentos (`client_documents`)
- ✅ Notas (`client_document` - campo HTML)
- ✅ Etiquetas e classificações
- ✅ Histórico de interações

### **Projetos:**
- ✅ Todos os projetos do cliente
- ✅ Status e histórico
- ✅ Planos de campanha (`campaign_plans`)
- ✅ Estratégias anteriores
- ✅ Resultados e métricas

### **Tarefas:**
- ✅ Tarefas realizadas (com status 'published', 'concluido', etc.)
- ✅ Tarefas pendentes
- ✅ Tarefas relacionadas ao cliente
- ✅ Padrões de trabalho

### **Contexto Adicional:**
- ✅ Mensagens do chat do cliente (ApexIA)
- ✅ Solicitações e pedidos
- ✅ Metas e objetivos do cliente
- ✅ Dados de tráfego pago (se aplicável)

---

## 🎨 Interface Proposta

### **Layout Principal:**

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Assistente de Projetos                    [👤] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  SELECIONAR     │  │  CHAT                        │ │
│  │  CLIENTE        │  │                              │ │
│  │                 │  │  [Mensagens do assistente]   │ │
│  │  [Lista]        │  │                              │ │
│  │  [Busca]        │  │  [Input de mensagem]         │ │
│  │                 │  │                              │ │
│  │  📊 VISÃO GERAL │  │                              │ │
│  │  👤 CLIENTE     │  │                              │ │
│  │  🔄 COMPARAR    │  │                              │ │
│  └─────────────────┘  └─────────────────────────────┘ │
│                                                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │  CONTEXTO CARREGADO                                │ │
│  │  ✓ Dados do cliente                               │ │
│  │  ✓ 5 documentos                                   │ │
│  │  ✓ 3 projetos anteriores                          │ │
│  │  ✓ 12 tarefas realizadas                          │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### **Funcionalidades:**

1. **Seletor de Cliente**
   - Busca rápida
   - Lista de clientes
   - Modo "Visão Geral" (todos os clientes)

2. **Painel de Contexto**
   - Mostra o que está carregado
   - Permite adicionar/remover contexto
   - Indicador de profundidade do contexto

3. **Chat Inteligente**
   - Histórico de conversas
   - Sugestões de perguntas
   - Modos de trabalho (criar projeto, analisar, comparar)

4. **Ações Rápidas**
   - "Criar projeto para [Cliente]"
   - "Analisar histórico de [Cliente]"
   - "Comparar estratégias de [Cliente A] vs [Cliente B]"

---

## 🧠 Estratégia de Prompt para Evitar Respostas Rasas

### **Problema: IA cria conteúdo genérico**

### **Solução: Instruções Explícitas de Profundidade**

```markdown
**REGRAS DE PROFUNDIDADE (OBRIGATÓRIO):**

1. ANTES de responder, SEMPRE analise:
   - Quais dados específicos do cliente estão disponíveis?
   - O que foi feito anteriormente (tarefas, projetos)?
   - Quais padrões você identifica?

2. NUNCA responda com:
   - "Você pode fazer X, Y, Z" (genérico)
   - "Algumas estratégias incluem..." (superficial)
   - Listas sem contexto específico

3. SEMPRE responda com:
   - Dados específicos do cliente mencionados
   - Conexões entre informações diferentes
   - Estratégias baseadas no histórico real
   - Detalhes práticos e acionáveis

4. ESTRUTURA DE RESPOSTA PROFUNDA:
   - **Análise do Contexto**: O que os dados mostram?
   - **Insights Específicos**: Padrões identificados
   - **Estratégia Baseada em Dados**: Não genérica
   - **Plano Detalhado**: Passos específicos
   - **Considerações**: O que considerar baseado no histórico

5. SE não tiver dados suficientes:
   - Diga claramente quais dados faltam
   - Sugira quais informações adicionar
   - NÃO invente ou generalize
```

---

## 🔄 Fluxo de Trabalho Proposto

### **Cenário 1: Criar Projeto Novo**

1. Usuário seleciona cliente
2. Sistema carrega contexto completo:
   - Dados cadastrais
   - Documentos
   - Projetos anteriores
   - Tarefas realizadas
   - Histórico de chat (se houver)
3. Usuário: "Criar projeto de marketing para [Cliente]"
4. IA analisa contexto e cria:
   - Estratégia baseada em projetos anteriores
   - Considerando tarefas já realizadas
   - Usando dados específicos do cliente
   - Profundo e detalhado, não genérico

### **Cenário 2: Analisar Cliente**

1. Usuário seleciona cliente
2. Sistema carrega contexto
3. Usuário: "Analise o cliente [Nome] e me dê insights"
4. IA fornece:
   - Análise profunda dos dados
   - Padrões identificados
   - Oportunidades baseadas em histórico
   - Recomendações específicas

### **Cenário 3: Comparar Clientes**

1. Usuário seleciona múltiplos clientes
2. Sistema carrega contexto de cada um
3. Usuário: "Compare estratégias de [Cliente A] e [Cliente B]"
4. IA compara:
   - O que funcionou em cada um
   - Diferenças e similaridades
   - Aprendizados aplicáveis

---

## 💾 Estrutura de Dados no Prompt

### **Formato Proposto:**

```markdown
**CLIENTE: [Nome da Empresa]**

**DADOS CADASTRAIS:**
- Empresa: ...
- Contato: ...
- Nicho: ...
- Público-alvo: ...
- Tom de voz: ...
- Sobre: ...
- Produtos/Serviços: ...

**DOCUMENTOS E NOTAS:**
[Documento 1: Título]
Conteúdo: ...

[Documento 2: Título]
Conteúdo: ...

**PROJETOS ANTERIORES:**
[Projeto 1: Nome]
- Status: ...
- Estratégia: ...
- Resultados: ...

**TAREFAS REALIZADAS (Últimas 10):**
- [Tarefa 1]: Descrição, Status, Data
- [Tarefa 2]: Descrição, Status, Data
...

**TAREFAS PENDENTES:**
- [Tarefa 1]: Descrição, Prazo
...

**HISTÓRICO E CONTEXTO:**
- Última interação: ...
- Padrões identificados: ...
```

---

## 🎯 Diferenças do ApexIA Atual

| Aspecto | ApexIA (Cliente) | Assistente Projetos (Interno) |
|---------|------------------|------------------------------|
| **Usuário** | Cliente final | Admin/Colaborador |
| **Acesso** | Apenas seu cliente | Todos os clientes |
| **Foco** | Suporte ao cliente | Construção de projetos |
| **Contexto** | Um cliente por vez | Múltiplos clientes possíveis |
| **Profundidade** | Respostas progressivas | Respostas profundas desde o início |
| **Dados** | Limitado por configuração | Acesso completo |
| **Objetivo** | Ajudar cliente | Criar estratégias e projetos |

---

## 🚀 Próximos Passos (Quando Implementar)

1. **Fase 1: Estrutura Base**
   - Criar componente de seleção de cliente
   - Sistema de carregamento de contexto
   - Interface básica do chat

2. **Fase 2: Sistema de Prompt**
   - Estruturar prompt hierárquico
   - Implementar regras de profundidade
   - Sistema de organização de dados

3. **Fase 3: Funcionalidades Avançadas**
   - Comparação de clientes
   - Análise de padrões
   - Sugestões inteligentes

4. **Fase 4: Integração**
   - Criar projetos diretamente do chat
   - Salvar estratégias geradas
   - Histórico de conversas

---

## 📝 Notas Importantes

- **Não implementar ainda** - apenas planejamento
- Sistema atual está seguro e funcionando
- Este documento serve como guia para desenvolvimento futuro
- Pode ser ajustado conforme necessário

---

## ❓ Perguntas para Refinar o Planejamento

1. Quais tipos de projetos são mais comuns? (Marketing, Social Media, Tráfego Pago?)
2. Que nível de detalhamento é esperado? (Alto nível ou muito específico?)
3. Precisa salvar as conversas? (Histórico permanente?)
4. Deve poder editar projetos existentes ou só criar novos?
5. Precisa de integração com outras partes do sistema?

