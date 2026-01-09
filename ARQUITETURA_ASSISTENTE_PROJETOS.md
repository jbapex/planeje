# 🏗️ Arquitetura: Assistente de Projetos - Dois Modos

## 📋 Visão Geral

Uma **nova página** com **dois modos de operação** distintos, cada um com seu propósito específico:

1. **Modo Cliente Específico** - Foco em um cliente, conversa isolada
2. **Modo Geral** - Visão ampla, acesso a tudo e todas as conversas

---

## 🎯 MODOS DE OPERAÇÃO

### 📌 **MODO 1: Cliente Específico** 
*"Conversar sobre um cliente específico"*

#### **Características:**
- ✅ Foco em **UM cliente** por vez
- ✅ Conversa **isolada** (só sobre aquele cliente)
- ✅ Contexto completo daquele cliente carregado
- ✅ Histórico de conversas **salvo por cliente**
- ✅ Interface mais focada e limpa

#### **Quando usar:**
- Criar projeto para um cliente específico
- Analisar um cliente em profundidade
- Trabalhar em estratégia para um cliente
- Revisar histórico de um cliente

#### **O que a IA tem acesso:**
- ✅ Dados cadastrais completos do cliente
- ✅ Documentos desse cliente
- ✅ Projetos desse cliente
- ✅ Tarefas desse cliente
- ✅ Histórico de conversas anteriores desse cliente
- ❌ NÃO tem acesso a outros clientes

#### **Estrutura de Dados:**
```
Conversa do Cliente: [Nome do Cliente]
├── Mensagem 1: "Criar projeto de marketing"
├── Mensagem 2: "Analisar histórico"
└── Mensagem 3: "Comparar com projeto anterior"
```

---

### 🌐 **MODO 2: Chat Geral**
*"Assistente com acesso a tudo"*

#### **Características:**
- ✅ Acesso a **TODOS os clientes**
- ✅ Pode **referenciar múltiplos clientes** na mesma conversa
- ✅ Acesso a **todas as conversas** de clientes específicos
- ✅ Visão estratégica ampla
- ✅ Comparações entre clientes
- ✅ Análises gerais do sistema

#### **Quando usar:**
- Comparar estratégias entre clientes
- Análise geral do portfólio
- Identificar padrões entre clientes
- Planejamento estratégico geral
- "Qual cliente precisa de mais atenção?"

#### **O que a IA tem acesso:**
- ✅ Lista de todos os clientes (resumo)
- ✅ Dados completos de qualquer cliente (quando mencionado)
- ✅ **TODAS as conversas de TODOS os clientes** (acesso completo)
- ✅ Pode buscar e referenciar qualquer conversa anterior
- ✅ Visão geral de projetos, tarefas, etc.
- ✅ Estatísticas e padrões gerais
- ✅ Histórico completo de interações com qualquer cliente

#### **Estrutura de Dados:**
```
Chat Geral
├── Pode mencionar: Cliente A, Cliente B, Cliente C...
├── Pode acessar: Conversas anteriores de qualquer cliente
├── Pode comparar: Estratégias entre clientes
└── Pode analisar: Padrões gerais
```

---

## 🗂️ ESTRUTURA DE DADOS NO BANCO

### **Tabela: `assistant_project_conversations`**

```sql
CREATE TABLE assistant_project_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Modo da conversa
  mode VARCHAR NOT NULL, -- 'client_specific' ou 'general'
  
  -- Se for modo cliente específico
  client_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  
  -- Se for modo geral (pode ter múltiplos clientes mencionados)
  mentioned_client_ids UUID[] DEFAULT '{}',
  
  -- Mensagens da conversa
  messages JSONB NOT NULL DEFAULT '[]',
  
  -- Metadados
  title VARCHAR, -- Título da conversa (gerado automaticamente)
  context_loaded JSONB, -- Quais dados foram carregados
  
  -- Usuário que criou
  owner_id UUID REFERENCES profiles(id),
  
  -- Tags/classificação
  tags TEXT[] DEFAULT '{}'
);
```

### **Estrutura de Mensagens (JSONB):**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Criar projeto de marketing para este cliente",
      "timestamp": "2025-01-08T23:50:00Z"
    },
    {
      "role": "assistant",
      "content": "Analisando os dados do cliente...",
      "timestamp": "2025-01-08T23:50:05Z",
      "context_used": {
        "client_data": true,
        "documents": ["doc1", "doc2"],
        "projects": ["proj1"],
        "tasks": ["task1", "task2"]
      }
    }
  ]
}
```

---

## 🎨 INTERFACE PROPOSTA

### **Layout da Nova Página:**

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]  Assistente de Projetos                    [👤] [⚙️]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐ │
│  │   MODOS      │  │         ÁREA DE CHAT                    │ │
│  │              │  │                                         │ │
│  │  [●] Cliente │  │  ┌─────────────────────────────────┐ │ │
│  │      Específico│  │  │ Histórico de Conversas         │ │ │
│  │              │  │  │                                 │ │ │
│  │  [ ] Geral   │  │  │ [Conversa 1] [Conversa 2] ...   │ │ │
│  │              │  │  └─────────────────────────────────┘ │ │ │
│  │              │  │                                         │ │
│  │  ┌─────────┐ │  │  ┌─────────────────────────────────┐ │ │
│  │  │SELECIONAR│ │  │  │ Mensagens da Conversa           │ │ │
│  │  │ CLIENTE │ │  │  │                                 │ │ │
│  │  │         │ │  │  │ [Mensagens aparecem aqui]       │ │ │
│  │  │[Busca]  │ │  │  │                                 │ │ │
│  │  │[Lista]  │ │  │  │                                 │ │ │
│  │  └─────────┘ │  │  └─────────────────────────────────┘ │ │
│  │              │  │                                         │ │
│  │              │  │  ┌─────────────────────────────────┐ │ │
│  │              │  │  │ [Input de mensagem]        [Enviar]│ │ │
│  │              │  │  └─────────────────────────────────┘ │ │
│  └──────────────┘  └─────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ CONTEXTO CARREGADO                                        │ │
│  │ ✓ Cliente: [Nome]                                        │ │
│  │ ✓ 5 documentos                                           │ │
│  │ ✓ 3 projetos                                             │ │
│  │ ✓ 12 tarefas                                             │ │
│  │ [Carregar mais contexto]                                 │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 FLUXO DE FUNCIONAMENTO

### **MODO 1: Cliente Específico**

#### **Passo 1: Selecionar Modo**
```
Usuário clica em "Cliente Específico"
→ Interface muda para modo focado
→ Aparece seletor de cliente
```

#### **Passo 2: Selecionar Cliente**
```
Usuário seleciona cliente da lista/busca
→ Sistema carrega contexto completo:
   - Dados cadastrais
   - Documentos
   - Projetos
   - Tarefas
   - Conversas anteriores desse cliente
→ Mostra painel "Contexto Carregado"
```

#### **Passo 3: Iniciar Conversa**
```
Usuário digita: "Criar projeto de marketing"
→ Sistema busca conversas anteriores desse cliente
→ Monta prompt com contexto completo
→ IA responde com foco nesse cliente
→ Resposta salva na conversa desse cliente
```

#### **Passo 4: Continuar Conversa**
```
Usuário continua conversando
→ Todas as mensagens ficam na mesma conversa
→ Contexto mantido durante toda a conversa
→ Histórico salvo por cliente
```

#### **Passo 5: Trocar Cliente**
```
Usuário seleciona outro cliente
→ Nova conversa iniciada (ou carrega conversa anterior)
→ Contexto muda para novo cliente
→ Histórico isolado por cliente
```

---

### **MODO 2: Chat Geral**

#### **Passo 1: Selecionar Modo**
```
Usuário clica em "Geral"
→ Interface muda para modo amplo
→ Não há seletor de cliente fixo
```

#### **Passo 2: Iniciar Conversa**
```
Usuário digita: "Comparar estratégias de Cliente A e Cliente B"
→ Sistema identifica clientes mencionados
→ Carrega contexto de ambos
→ IA responde com comparação
```

#### **Passo 3: Referenciar Conversas Anteriores**
```
Usuário: "O que foi discutido sobre Cliente A na última conversa?"
→ Sistema busca TODAS as conversas do Cliente A (do Modo Cliente Específico)
→ Carrega contexto completo das conversas
→ IA responde baseado nas conversas anteriores
→ Pode referenciar mensagens específicas

Exemplo de resposta da IA:
"Na conversa do dia 05/01 sobre Cliente A, você discutiu:
- Criação de projeto de marketing
- Estratégia focada em Instagram Stories
- Meta de aumentar engajamento em 30%

Baseado nisso, sugiro..."
```

#### **Passo 3.1: Buscar Conversas de Múltiplos Clientes**
```
Usuário: "Mostre o que foi discutido sobre projetos de marketing nos últimos 30 dias"
→ Sistema busca em TODAS as conversas de TODOS os clientes
→ Filtra por assunto/tema
→ IA mostra resumo de todas as conversas relevantes
```

#### **Passo 4: Análise Geral**
```
Usuário: "Quais clientes precisam de mais atenção?"
→ Sistema analisa todos os clientes
→ Considera projetos, tarefas, conversas
→ IA dá análise estratégica geral
```

---

## 💡 DIFERENÇAS CHAVE ENTRE OS MODOS

| Aspecto | Modo Cliente Específico | Modo Geral |
|---------|------------------------|------------|
| **Foco** | Um cliente por vez | Múltiplos clientes |
| **Conversas** | Isoladas por cliente | Uma conversa geral |
| **Contexto** | Completo de um cliente | Pode carregar vários |
| **Histórico** | Por cliente | Geral (mas pode acessar conversas de clientes) |
| **Uso** | Trabalho focado | Análise estratégica |
| **Interface** | Seletor de cliente fixo | Sem seletor fixo |
| **Prompt** | Contexto de um cliente | Contexto flexível |

---

## 🧠 ESTRUTURA DE PROMPT POR MODO

### **MODO 1: Cliente Específico**

```markdown
**MODO: CLIENTE ESPECÍFICO**

**CLIENTE ATUAL:** [Nome do Cliente]

**CONTEXTO COMPLETO DO CLIENTE:**
[Dados completos aqui]

**CONVERSAS ANTERIORES DESTE CLIENTE:**
[Resumo das conversas anteriores]

**INSTRUÇÕES:**
- Você está focando APENAS neste cliente
- Use TODOS os dados disponíveis deste cliente
- Considere conversas anteriores deste cliente
- Seja profundo e específico
- NÃO mencione outros clientes
```

### **MODO 2: Chat Geral**

```markdown
**MODO: CHAT GERAL**

**VISÃO GERAL DO SISTEMA:**
[Lista de clientes com resumo]

**CLIENTES MENCIONADOS NESTA CONVERSA:**
- Cliente A: [Contexto carregado]
- Cliente B: [Contexto carregado]

**ACESSO A CONVERSAS:**
Você tem acesso a TODAS as conversas de TODOS os clientes:

- Cliente A: 3 conversas anteriores
  • Conversa 1: "Projeto Marketing" (05/01)
  • Conversa 2: "Análise de Dados" (03/01)
  • Conversa 3: "Estratégia Instagram" (01/01)

- Cliente B: 2 conversas anteriores
  • Conversa 1: "Plano de Campanha" (06/01)
  • Conversa 2: "Revisão de Projeto" (04/01)

- Cliente C: 1 conversa anterior
  • Conversa 1: "Criação de Conteúdo" (02/01)

**INSTRUÇÕES:**
- Você tem acesso a TODOS os clientes
- Você tem acesso a TODAS as conversas de TODOS os clientes
- Quando o usuário mencionar um cliente ou perguntar sobre conversas anteriores:
  → Carregue o contexto completo do cliente
  → Busque e referencie conversas anteriores desse cliente
  → Use informações das conversas para dar respostas profundas
- Pode comparar estratégias entre clientes usando suas conversas
- Pode identificar padrões entre conversas de diferentes clientes
- Faça análises estratégicas amplas usando todo o histórico disponível
```

---

## 📊 EXEMPLOS DE USO

### **Exemplo 1: Modo Cliente Específico**

```
Usuário seleciona: "Cliente ABC"
Usuário: "Criar projeto de marketing para este cliente"

IA analisa:
- Dados do Cliente ABC
- Projetos anteriores do Cliente ABC
- Tarefas realizadas do Cliente ABC
- Conversas anteriores sobre Cliente ABC

IA responde:
"Baseado nos dados do Cliente ABC, identifiquei que:
- Eles já fizeram 2 projetos de social media (2024)
- O último projeto focou em Instagram Stories
- As tarefas mostram que eles respondem bem a conteúdo educativo
- Seu público-alvo é principalmente mulheres 25-40 anos

PROPOSTA DE PROJETO:
[Estratégia detalhada e específica baseada nos dados]"
```

### **Exemplo 2: Modo Geral - Comparação**

```
Usuário: "Comparar estratégias de Cliente A e Cliente B"

IA:
1. Carrega contexto de Cliente A
2. Carrega contexto de Cliente B
3. Busca TODAS as conversas anteriores de ambos
4. Analisa o que foi discutido nas conversas
5. Compara projetos, estratégias, resultados

IA responde:
"ANÁLISE COMPARATIVA (baseada em conversas anteriores):

CLIENTE A:
- Nas conversas anteriores (3 conversas), você discutiu:
  • Projeto Marketing focou em Instagram Stories
  • Meta de aumentar engajamento em 30%
  • Estratégia de conteúdo educativo funcionou bem
  
- Estratégia atual: [dados específicos]
- Resultados: [dados específicos]
- O que funcionou: [baseado em conversas + tarefas/projetos]

CLIENTE B:
- Nas conversas anteriores (2 conversas), você discutiu:
  • Plano de Campanha focou em Facebook Ads
  • Meta de aumentar vendas em 50%
  • Estratégia de depoimentos teve boa resposta
  
- Estratégia atual: [dados específicos]
- Resultados: [dados específicos]
- O que funcionou: [baseado em conversas + tarefas/projetos]

COMPARAÇÃO:
- Similaridades: [análise usando dados das conversas]
- Diferenças: [análise usando dados das conversas]
- Aprendizados: [insights baseados em conversas anteriores]
- Recomendações: [baseado no que foi discutido anteriormente]"
```

### **Exemplo 3: Modo Geral - Buscar Conversas**

```
Usuário: "O que foi discutido sobre projetos de marketing nos últimos 30 dias?"

IA:
1. Busca em TODAS as conversas de TODOS os clientes
2. Filtra por assunto "projetos de marketing"
3. Filtra por data (últimos 30 dias)
4. Analisa padrões e temas recorrentes

IA responde:
"ANÁLISE DE CONVERSAS SOBRE PROJETOS DE MARKETING (últimos 30 dias):

CONVERSAS ENCONTRADAS:
1. Cliente A - 05/01: "Projeto Marketing"
   - Discutido: Estratégia Instagram Stories
   - Decisões: Focar em conteúdo educativo
   
2. Cliente B - 06/01: "Plano de Campanha"
   - Discutido: Facebook Ads e depoimentos
   - Decisões: Investir em social proof
   
3. Cliente C - 02/01: "Criação de Conteúdo"
   - Discutido: Estratégia de posts educativos
   - Decisões: Criar série de dicas

PADRÕES IDENTIFICADOS:
- 3 clientes focaram em conteúdo educativo
- 2 clientes mencionaram aumento de engajamento como meta
- 1 cliente focou em vendas diretas

INSIGHTS:
- Conteúdo educativo parece ser estratégia recorrente
- Engajamento é objetivo comum
- Cada cliente adaptou a estratégia ao seu nicho"
```

---

## 🔧 IMPLEMENTAÇÃO TÉCNICA

### **Componente Principal: `ProjectAssistant.jsx`**

```jsx
const ProjectAssistant = () => {
  const [mode, setMode] = useState('client_specific'); // ou 'general'
  const [selectedClient, setSelectedClient] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [context, setContext] = useState({});
  
  // Carregar contexto baseado no modo
  useEffect(() => {
    if (mode === 'client_specific' && selectedClient) {
      loadClientContext(selectedClient.id);
      loadClientConversations(selectedClient.id);
    } else if (mode === 'general') {
      loadGeneralContext();
    }
  }, [mode, selectedClient]);
  
  // ...
}
```

### **Estrutura de Rotas:**

```
/assistant/projects
├── /assistant/projects/client/:clientId (Modo Cliente Específico)
└── /assistant/projects/general (Modo Geral)
```

---

## ✅ VANTAGENS DESTA ARQUITETURA

1. **Clareza de Contexto**
   - Modo Cliente: Foco claro, não se perde
   - Modo Geral: Flexibilidade quando precisa

2. **Histórico Organizado**
   - Conversas por cliente ficam organizadas
   - Fácil encontrar conversas anteriores

3. **Performance**
   - Modo Cliente: Carrega só o necessário
   - Modo Geral: Carrega sob demanda

4. **Experiência do Usuário**
   - Interface clara sobre qual modo está ativo
   - Transição fácil entre modos

5. **Profundidade**
   - Modo Cliente: Pode ser muito profundo
   - Modo Geral: Pode fazer análises amplas

---

## 🎯 PRÓXIMOS PASSOS (Quando Implementar)

1. **Criar estrutura de banco de dados**
   - Tabela de conversas
   - Relacionamentos

2. **Criar componente base**
   - Seletor de modo
   - Interface do chat
   - Painel de contexto

3. **Implementar Modo Cliente Específico primeiro**
   - Mais simples
   - Testa a base

4. **Implementar Modo Geral depois**
   - Usa base do Modo Cliente
   - Adiciona flexibilidade

---

## 🔍 ACESSO A CONVERSAS NO MODO GERAL (DETALHADO)

### **Como Funciona:**

No **Modo Geral**, a IA tem acesso completo a **TODAS as conversas** de **TODOS os clientes** que foram criadas no **Modo Cliente Específico**.

### **Exemplos Práticos:**

#### **Exemplo 1: Referenciar Conversa Específica**
```
Usuário (Modo Geral): "O que foi discutido sobre Cliente A na última conversa?"

Sistema:
1. Busca todas as conversas do Cliente A (do Modo Cliente Específico)
2. Identifica a mais recente
3. Carrega contexto completo dessa conversa
4. Passa para a IA

IA responde:
"Na última conversa sobre Cliente A (05/01), você discutiu:
- Criação de projeto de marketing para Instagram
- Estratégia focada em Stories educativos
- Meta de aumentar engajamento em 30%
- Decisão de criar série de 10 posts sobre [tema específico]

Baseado nessa conversa e nos dados atuais do cliente..."
```

#### **Exemplo 2: Buscar por Assunto**
```
Usuário (Modo Geral): "Quais clientes já discutiram projetos de marketing?"

Sistema:
1. Busca em TODAS as conversas de TODOS os clientes
2. Filtra por palavras-chave: "projeto", "marketing"
3. Retorna lista de clientes e conversas relevantes

IA responde:
"Encontrei conversas sobre projetos de marketing em:

1. Cliente A (05/01): 'Projeto Marketing Instagram'
   - Discutido: Estratégia de Stories, conteúdo educativo
   
2. Cliente B (06/01): 'Plano de Campanha Marketing'
   - Discutido: Facebook Ads, depoimentos
   
3. Cliente C (02/01): 'Estratégia Marketing Digital'
   - Discutido: Conteúdo educativo, SEO"
```

#### **Exemplo 3: Comparar Conversas**
```
Usuário (Modo Geral): "Compare o que foi discutido sobre estratégias de Instagram entre Cliente A e Cliente B"

Sistema:
1. Busca conversas do Cliente A que mencionam "Instagram"
2. Busca conversas do Cliente B que mencionam "Instagram"
3. Carrega contexto completo de ambas
4. Passa para IA comparar

IA responde:
"COMPARAÇÃO DE ESTRATÉGIAS INSTAGRAM:

CLIENTE A (conversa de 05/01):
- Foco: Instagram Stories educativos
- Abordagem: Conteúdo didático, dicas práticas
- Meta: Aumentar engajamento
- Decisões: Criar série de 10 Stories

CLIENTE B (conversa de 06/01):
- Foco: Instagram Feed + Reels
- Abordagem: Depoimentos e cases de sucesso
- Meta: Aumentar vendas
- Decisões: Postar 3x por semana

DIFERENÇAS:
- Cliente A: Educativo vs Cliente B: Social Proof
- Cliente A: Stories vs Cliente B: Feed + Reels
- Cliente A: Engajamento vs Cliente B: Vendas"
```

### **Estrutura de Busca:**

```javascript
// Quando usuário menciona cliente ou pergunta sobre conversas
async function loadClientConversations(clientId) {
  // Busca TODAS as conversas desse cliente (do Modo Cliente Específico)
  const { data } = await supabase
    .from('assistant_project_conversations')
    .select('*')
    .eq('mode', 'client_specific')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  
  return data;
}

// Quando usuário pergunta sobre assunto geral
async function searchAllConversations(searchTerm) {
  // Busca em TODAS as conversas de TODOS os clientes
  const { data } = await supabase
    .from('assistant_project_conversations')
    .select('*, clientes(empresa)')
    .eq('mode', 'client_specific')
    .or(`title.ilike.%${searchTerm}%, messages->content.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false });
  
  return data;
}
```

### **No Prompt da IA (Modo Geral):**

```markdown
**ACESSO A CONVERSAS:**

Você tem acesso a TODAS as conversas anteriores de TODOS os clientes.

Quando o usuário:
- Mencionar um cliente específico → Carregue suas conversas
- Perguntar sobre conversas anteriores → Busque e referencie
- Pedir comparação → Use conversas de múltiplos clientes

FORMATO DE REFERÊNCIA:
"Na conversa do [Cliente] em [data], foi discutido:
- [Ponto 1 específico]
- [Ponto 2 específico]
- [Decisões tomadas]

Baseado nisso e nos dados atuais..."
```

---

## ❓ PERGUNTAS PARA REFINAR

1. **Conversas no Modo Geral:**
   - Devem ser salvas como uma conversa geral única?
   - Ou cada menção a cliente cria uma "referência" à conversa do cliente?
   - **RESPOSTA SUGERIDA:** Uma conversa geral única, mas com acesso completo às conversas dos clientes

2. **Título das Conversas:**
   - Modo Cliente: "Projeto Marketing - Cliente ABC"
   - Modo Geral: "Análise Comparativa Clientes A e B"?

3. **Busca de Conversas:**
   - No Modo Geral, como buscar conversas anteriores?
   - Por cliente? Por data? Por assunto?
   - **RESPOSTA SUGERIDA:** Todas as opções - busca flexível

4. **Transição entre Modos:**
   - Pode levar contexto de uma conversa para outro modo?
   - Ou sempre começa do zero?
   - **RESPOSTA SUGERIDA:** Modo Geral pode acessar conversas do Modo Cliente, mas não o contrário

---

## 📝 RESUMO EXECUTIVO

**NOVA PÁGINA:** `/assistant/projects`

**DOIS MODOS:**
1. **Cliente Específico** → Foco, profundidade, histórico isolado
2. **Geral** → Flexibilidade, comparações, visão ampla

**PRINCIPAIS DIFERENÇAS:**
- Modo Cliente: Um cliente, conversa isolada
- Modo Geral: Múltiplos clientes, acesso a tudo

**BENEFÍCIO:**
- Evita confusão de contexto
- Organiza histórico
- Permite trabalho focado OU estratégico

