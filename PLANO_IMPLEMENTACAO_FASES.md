# 🚀 Plano de Implementação - Personalização ApexIA Cliente

## 📋 Visão Geral

**Objetivo:** Permitir que o Super Admin configure a personalidade e comportamento do ApexIA do chat dos clientes através de uma interface centralizada.

**Total de Fases:** 4 fases principais  
**Tempo Estimado:** ~2-3 horas de desenvolvimento

---

## 🎯 FASE 1: Estrutura Base e Componente

### ✅ O Que Vamos Fazer:

1. **Criar componente `ApexIAClientPersonalitySettings.jsx`**
   - Localização: `src/components/pages/ApexIAClientPersonalitySettings.jsx`
   - Baseado em: `CompanyInfoSettings.jsx` e `DashboardSettings.jsx`
   - Funcionalidades:
     - Carregar configuração de `public_config`
     - Formulário com todas as seções
     - Salvar configuração
     - Validação básica

2. **Definir estrutura de dados padrão**
   - JSON com estrutura completa
   - Valores padrão sensatos
   - Schema bem definido

3. **Adicionar rota no Super Admin**
   - Modificar `SuperAdmin.jsx`
   - Adicionar item no menu
   - Adicionar rota no Routes

### 📝 Arquivos a Criar/Modificar:

- ✅ **Criar:** `src/components/pages/ApexIAClientPersonalitySettings.jsx`
- ✅ **Modificar:** `src/components/pages/SuperAdmin.jsx`

### 🎨 Interface da Fase 1:

```
┌─────────────────────────────────────────┐
│ Personalidade ApexIA Cliente            │
├─────────────────────────────────────────┤
│                                         │
│ [Seção 1: Personalidade Base]           │
│ - Traços (multiselect)                  │
│ - Tom de Voz (textarea)                 │
│ - Formalidade (select)                  │
│                                         │
│ [Seção 2: Comportamento]                │
│ - Proatividade (slider)                 │
│ - Emojis (select)                       │
│ - Formato (checkboxes)                   │
│                                         │
│ [Seção 3: Regras]                        │
│ - Regras Personalizadas (textarea)      │
│ - Guidelines (checkboxes)               │
│                                         │
│ [Botão Salvar]                          │
└─────────────────────────────────────────┘
```

### ✅ Critérios de Sucesso:

- [ ] Componente criado e funcionando
- [ ] Rota acessível no Super Admin
- [ ] Carregar configuração existente
- [ ] Salvar configuração em `public_config`
- [ ] Validação básica funcionando

---

## 🎯 FASE 2: Preview em Tempo Real

### ✅ O Que Vamos Fazer:

1. **Implementar preview do prompt final**
   - Mostrar como o prompt ficará
   - Atualizar em tempo real conforme edição
   - Formatação markdown

2. **Melhorar UX**
   - Feedback visual ao salvar
   - Mensagens de sucesso/erro
   - Loading states

### 📝 Arquivos a Modificar:

- ✅ **Modificar:** `src/components/pages/ApexIAClientPersonalitySettings.jsx`

### 🎨 Interface da Fase 2:

```
┌─────────────────────────────────────────┐
│ [Formulário acima]                      │
│                                         │
│ [Seção 4: Preview do Prompt]           │
│ ┌─────────────────────────────────────┐ │
│ │ Como o prompt ficará:               │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Você é o ApexIA...              │ │ │
│ │ │ **Personalidade:**              │ │ │
│ │ │ - Prestativo                     │ │ │
│ │ │ - Empático                       │ │ │
│ │ │ ...                              │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Botão Salvar]                          │
└─────────────────────────────────────────┘
```

### ✅ Critérios de Sucesso:

- [ ] Preview atualiza em tempo real
- [ ] Formatação correta do prompt
- [ ] Preview mostra todas as seções configuradas
- [ ] UX melhorada com feedbacks

---

## 🎯 FASE 3: Integração no Chat

### ✅ O Que Vamos Fazer:

1. **Criar função helper `buildPersonalitySection()`**
   - Localização: `src/components/pages/PublicClientChat.jsx`
   - Função que constrói seção de personalidade do prompt
   - Baseado na configuração carregada

2. **Criar função `loadPersonalityConfig()`**
   - Carregar configuração de `public_config`
   - Retornar JSON parseado ou null
   - Cache simples (opcional)

3. **Modificar `handleSendMessage()` em `PublicClientChat.jsx`**
   - Carregar configuração antes de construir prompt
   - Adicionar seção de personalidade ao prompt
   - Manter compatibilidade (fallback se não houver config)

### 📝 Arquivos a Modificar:

- ✅ **Modificar:** `src/components/pages/PublicClientChat.jsx`

### 🔧 Código da Fase 3:

**Antes:**
```javascript
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    // ... outros replaces
```

**Depois:**
```javascript
// Carregar configuração de personalidade
const personalityConfig = await loadPersonalityConfig();

// Construir seção de personalidade
const personalitySection = buildPersonalitySection(personalityConfig);

// Construir prompt completo
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    // ... outros replaces

// Adicionar personalidade se existir
if (personalitySection) {
    systemPrompt += `\n\n**Personalidade e Comportamento:**\n${personalitySection}`;
}
```

### ✅ Critérios de Sucesso:

- [ ] Configuração carregada no chat
- [ ] Seção de personalidade adicionada ao prompt
- [ ] Funciona mesmo sem configuração (fallback)
- [ ] Prompt final inclui todas as configurações
- [ ] Testado com diferentes configurações

---

## 🎯 FASE 4: Testes e Refinamentos

### ✅ O Que Vamos Fazer:

1. **Testes funcionais**
   - Testar criação de configuração
   - Testar edição de configuração
   - Testar diferentes valores
   - Testar chat com configuração aplicada

2. **Testes de compatibilidade**
   - Chat funciona sem configuração
   - Agentes existentes continuam funcionando
   - Placeholders ainda funcionam

3. **Refinamentos**
   - Ajustar textos e labels
   - Melhorar validações
   - Otimizar performance (cache)
   - Ajustar estilos se necessário

4. **Documentação**
   - Comentários no código
   - Guia de uso (opcional)

### 📝 Arquivos a Modificar:

- ✅ **Modificar:** Todos os arquivos criados/modificados
- ✅ **Testar:** Fluxo completo

### ✅ Critérios de Sucesso:

- [ ] Todos os testes passando
- [ ] Compatibilidade garantida
- [ ] Performance adequada
- [ ] Código limpo e documentado
- [ ] Pronto para produção

---

## 📊 Resumo das Fases

| Fase | Descrição | Arquivos | Tempo Estimado |
|------|-----------|----------|----------------|
| **Fase 1** | Estrutura Base e Componente | 2 arquivos | ~45 min |
| **Fase 2** | Preview em Tempo Real | 1 arquivo | ~30 min |
| **Fase 3** | Integração no Chat | 1 arquivo | ~45 min |
| **Fase 4** | Testes e Refinamentos | Todos | ~30 min |
| **TOTAL** | | | **~2.5 horas** |

---

## 🎯 Ordem de Execução

```
FASE 1 (Estrutura Base)
    ↓
FASE 2 (Preview)
    ↓
FASE 3 (Integração)
    ↓
FASE 4 (Testes)
    ↓
✅ PRONTO!
```

---

## 📋 Checklist Geral

### Fase 1:
- [ ] Criar `ApexIAClientPersonalitySettings.jsx`
- [ ] Adicionar rota no `SuperAdmin.jsx`
- [ ] Implementar carregamento de config
- [ ] Implementar salvamento de config
- [ ] Criar estrutura JSON padrão

### Fase 2:
- [ ] Implementar preview em tempo real
- [ ] Formatar preview corretamente
- [ ] Adicionar feedbacks visuais
- [ ] Melhorar UX geral

### Fase 3:
- [ ] Criar `loadPersonalityConfig()`
- [ ] Criar `buildPersonalitySection()`
- [ ] Modificar `handleSendMessage()`
- [ ] Garantir compatibilidade

### Fase 4:
- [ ] Testar criação de config
- [ ] Testar edição de config
- [ ] Testar chat com config
- [ ] Testar chat sem config
- [ ] Refinar e documentar

---

## 🚀 Próximo Passo

**Começar pela FASE 1** - Criar estrutura base e componente.

**Quer que eu comece a implementação agora?**

