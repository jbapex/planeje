# 📋 Revisão Detalhada: Personalização do ApexIA do Cliente

## 🎯 Objetivo
Permitir que o Super Admin configure a personalidade e comportamento do ApexIA que aparece no chat dos clientes, de forma centralizada e flexível.

---

## 🔍 Situação Atual

### Como funciona hoje:
1. **Agentes de IA** (`ai_agents` table):
   - Cada agente tem um `prompt` fixo
   - O prompt é usado como `systemPrompt` na chamada da IA
   - Placeholders são substituídos: `{client_name}`, `{contact_name}`, `{client_niche}`, etc.

2. **Código atual** (`PublicClientChat.jsx`, linhas 445-452):
```javascript
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    .replace('{contact_name}', client.nome_contato || '')
    .replace('{client_niche}', client.nicho || '')
    .replace('{client_target_audience}', client.publico_alvo || '')
    .replace('{client_tone}', client.tom_de_voz || '');
systemPrompt += `\n\n**Informações de Contexto (se necessário):**\n**Projetos Atuais Selecionados:**\n${projectsInfo}`;
systemPrompt += `\n\n**Instrução Importante:** Se o usuário precisar de ajuda humana...`;
```

### Limitações:
- ❌ Personalidade hardcoded no prompt do agente
- ❌ Não há configuração centralizada
- ❌ Difícil ajustar comportamento sem editar cada agente
- ❌ Não há personalização por cliente
- ❌ Mudanças requerem editar prompts manualmente

---

## ✨ Proposta de Solução

### Abordagem: **Configuração Global + Template Reutilizável**

### 1. **Nova Página de Configuração**
**Localização:** Super Admin → "Personalidade ApexIA Cliente"

**Campos da Interface:**

#### Seção 1: Personalidade Base
- **Traços de Personalidade** (multiselect):
  - Prestativo
  - Empático
  - Direto
  - Técnico
  - Criativo
  - Profissional
  - Amigável
  - Formal

- **Tom de Voz** (textarea):
  - Exemplo: "Amigável mas profissional, como um consultor experiente que se importa com o sucesso do cliente"

- **Nível de Formalidade** (select):
  - Casual
  - Profissional
  - Formal

#### Seção 2: Comportamento
- **Proatividade** (slider 0-100):
  - Quão proativo o ApexIA deve ser em sugerir ações

- **Uso de Emojis** (select):
  - Nenhum
  - Moderado (1-2 por resposta)
  - Frequente (quando apropriado)

- **Formato de Resposta** (multiselect):
  - Listas numeradas
  - Parágrafos
  - Exemplos práticos
  - Destaques/bold

#### Seção 3: Regras e Diretrizes
- **Regras Personalizadas** (textarea grande):
  - Exemplo:
    ```
    - Sempre ser respeitoso e paciente
    - Oferecer ajuda proativa quando relevante
    - Usar linguagem acessível, evitando jargões técnicos
    - Quando não souber algo, sugerir criar solicitação
    - Nunca inventar informações sobre o cliente
    ```

- **Guidelines de Resposta** (checkboxes):
  - [ ] Limitar tamanho máximo de resposta
  - [ ] Sempre incluir exemplos práticos
  - [ ] Usar formatação markdown
  - [ ] Separar informações em seções claras

#### Seção 4: Preview do Prompt Final
- Mostra como o prompt ficará após aplicar todas as configurações
- Atualiza em tempo real conforme o usuário edita

---

## 📊 Estrutura de Dados

### Tabela: `public_config`
**Chave:** `apexia_client_personality_config`

**Valor (JSON):**
```json
{
  "personality": {
    "traits": ["prestativo", "empático", "profissional"],
    "tone_description": "Amigável mas profissional, como um consultor experiente",
    "formality": "profissional"
  },
  "behavior": {
    "proactivity": 75,
    "emoji_usage": "moderate",
    "response_format": ["lists", "paragraphs", "examples"]
  },
  "custom_rules": [
    "Sempre ser respeitoso e paciente",
    "Oferecer ajuda proativa quando relevante",
    "Usar linguagem acessível, evitando jargões técnicos"
  ],
  "response_guidelines": {
    "max_length": null,
    "use_lists": true,
    "use_examples": true,
    "use_markdown": true,
    "section_separation": true
  },
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

## 🔧 Modificações no Código

### 1. Novo Componente: `ApexIAClientPersonalitySettings.jsx`

**Localização:** `src/components/pages/ApexIAClientPersonalitySettings.jsx`

**Funcionalidades:**
- Carregar configuração atual de `public_config`
- Formulário com todas as seções acima
- Preview do prompt final
- Salvar configuração
- Validação de campos

**Estrutura do Componente:**
```jsx
const ApexIAClientPersonalitySettings = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [preview, setPreview] = useState('');
  
  // Carregar configuração
  // Salvar configuração
  // Gerar preview do prompt
  // Renderizar formulário
}
```

### 2. Modificação: `PublicClientChat.jsx`

**Onde:** Função `handleSendMessage` (linha ~445)

**Antes:**
```javascript
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    // ... outros replaces
```

**Depois:**
```javascript
// 1. Carregar configuração de personalidade
const personalityConfig = await loadPersonalityConfig();

// 2. Construir seção de personalidade
const personalitySection = buildPersonalitySection(personalityConfig);

// 3. Construir prompt completo
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    .replace('{contact_name}', client.nome_contato || '')
    .replace('{client_niche}', client.nicho || '')
    .replace('{client_target_audience}', client.publico_alvo || '')
    .replace('{client_tone}', client.tom_de_voz || '');

// 4. Adicionar seção de personalidade configurada
systemPrompt += `\n\n**Personalidade e Comportamento:**\n${personalitySection}`;

// 5. Adicionar contexto (projetos, etc.)
systemPrompt += `\n\n**Informações de Contexto:**\n**Projetos Atuais Selecionados:**\n${projectsInfo}`;

// 6. Adicionar instruções importantes
systemPrompt += `\n\n**Instrução Importante:** Se o usuário precisar de ajuda humana...`;
```

**Nova Função Helper:**
```javascript
const buildPersonalitySection = (config) => {
  if (!config) return '';
  
  let section = '';
  
  // Traços
  if (config.personality?.traits?.length > 0) {
    section += `**Traços de Personalidade:**\n`;
    section += config.personality.traits.map(t => `- ${t}`).join('\n') + '\n\n';
  }
  
  // Tom de voz
  if (config.personality?.tone_description) {
    section += `**Tom de Voz:** ${config.personality.tone_description}\n\n`;
  }
  
  // Comportamento
  if (config.behavior) {
    section += `**Comportamento:**\n`;
    if (config.behavior.proactivity) {
      section += `- Proatividade: ${config.behavior.proactivity}% (${config.behavior.proactivity >= 70 ? 'Alta' : config.behavior.proactivity >= 40 ? 'Média' : 'Baixa'})\n`;
    }
    if (config.behavior.emoji_usage) {
      section += `- Uso de emojis: ${config.behavior.emoji_usage === 'none' ? 'Evitar emojis' : config.behavior.emoji_usage === 'moderate' ? 'Usar moderadamente (1-2 por resposta)' : 'Usar quando apropriado'}\n`;
    }
    section += '\n';
  }
  
  // Regras personalizadas
  if (config.custom_rules?.length > 0) {
    section += `**Regras Importantes:**\n`;
    section += config.custom_rules.map(rule => `- ${rule}`).join('\n') + '\n\n';
  }
  
  // Guidelines
  if (config.response_guidelines) {
    section += `**Diretrizes de Resposta:**\n`;
    const guidelines = [];
    if (config.response_guidelines.use_lists) guidelines.push('Use listas quando apropriado');
    if (config.response_guidelines.use_examples) guidelines.push('Inclua exemplos práticos');
    if (config.response_guidelines.use_markdown) guidelines.push('Use formatação markdown para destacar informações');
    if (guidelines.length > 0) {
      section += guidelines.map(g => `- ${g}`).join('\n') + '\n\n';
    }
  }
  
  return section;
};
```

### 3. Modificação: `SuperAdmin.jsx`

**Adicionar nova rota:**
```jsx
const navItems = [
  // ... itens existentes
  { 
    path: '/super-admin/apexia-client-personality', 
    label: 'Personalidade ApexIA Cliente', 
    icon: <Bot className="h-4 w-4" /> 
  },
];

// No Routes:
<Route path="apexia-client-personality" element={<ApexIAClientPersonalitySettings />} />
```

---

## 📝 Exemplo de Prompt Final Gerado

### Configuração Aplicada:
- Traços: Prestativo, Empático, Profissional
- Tom: "Amigável mas profissional, como um consultor experiente"
- Proatividade: 75%
- Emojis: Moderado
- Regras: "Sempre ser respeitoso", "Oferecer ajuda proativa"

### Prompt Resultante:
```
Você é o ApexIA, assistente de inteligência artificial da JB APEX para {client_name}.

[Prompt base do agente aqui...]

**Personalidade e Comportamento:**

**Traços de Personalidade:**
- Prestativo
- Empático
- Profissional

**Tom de Voz:** Amigável mas profissional, como um consultor experiente que se importa com o sucesso do cliente

**Comportamento:**
- Proatividade: 75% (Alta)
- Uso de emojis: Usar moderadamente (1-2 por resposta)

**Regras Importantes:**
- Sempre ser respeitoso e paciente
- Oferecer ajuda proativa quando relevante
- Usar linguagem acessível, evitando jargões técnicos

**Diretrizes de Resposta:**
- Use listas quando apropriado
- Inclua exemplos práticos
- Use formatação markdown para destacar informações

**Informações de Contexto:**
**Projetos Atuais Selecionados:**
- Projeto: "Campanha Janeiro", Status: em_andamento, Mês: Janeiro

**Instrução Importante:** Se o usuário precisar de ajuda humana ou você não souber a resposta, primeiro pergunte se ele gostaria de criar uma solicitação para a equipe...
```

---

## 🎨 Interface Proposta

### Layout da Página:

```
┌─────────────────────────────────────────────────────────┐
│  Personalidade ApexIA Cliente                          │
│  Configure como o ApexIA se comporta no chat dos clientes│
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Seção 1: Personalidade Base]                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Traços de Personalidade:                          │ │
│  │ ☑ Prestativo  ☑ Empático  ☐ Direto  ☐ Técnico  │ │
│  │                                                    │ │
│  │ Tom de Voz:                                        │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ Amigável mas profissional, como um...        │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  │                                                    │ │
│  │ Nível de Formalidade: [Profissional ▼]          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Seção 2: Comportamento]                               │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Proatividade: [━━━━━━━━━━━━━━━━━━━━] 75%       │ │
│  │                                                    │ │
│  │ Uso de Emojis: [Moderado ▼]                     │ │
│  │                                                    │ │
│  │ Formato de Resposta:                             │ │
│  │ ☑ Listas numeradas  ☑ Parágrafos  ☑ Exemplos  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Seção 3: Regras e Diretrizes]                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Regras Personalizadas:                            │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ - Sempre ser respeitoso e paciente          │ │ │
│  │ │ - Oferecer ajuda proativa quando relevante  │ │ │
│  │ │ - Usar linguagem acessível...               │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Seção 4: Preview do Prompt]                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Como o prompt ficará:                             │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ Você é o ApexIA...                          │ │ │
│  │ │ [Preview completo aqui]                     │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│                              [Cancelar]  [Salvar]       │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Fluxo de Implementação

### Fase 1: Estrutura Base
1. ✅ Criar componente `ApexIAClientPersonalitySettings.jsx`
2. ✅ Adicionar rota no `SuperAdmin.jsx`
3. ✅ Criar estrutura de dados padrão
4. ✅ Implementar carregamento/salvamento em `public_config`

### Fase 2: Interface
1. ✅ Criar formulário com todas as seções
2. ✅ Implementar preview em tempo real
3. ✅ Adicionar validações
4. ✅ Estilizar com Tailwind (seguindo padrão do sistema)

### Fase 3: Integração
1. ✅ Modificar `PublicClientChat.jsx` para carregar configuração
2. ✅ Criar função `buildPersonalitySection()`
3. ✅ Integrar no fluxo de construção do `systemPrompt`
4. ✅ Testar com diferentes configurações

### Fase 4: Melhorias (Opcional)
1. ⏳ Adicionar templates pré-definidos (ex: "Consultor", "Suporte", "Vendas")
2. ⏳ Permitir personalização por cliente (override)
3. ⏳ Histórico de mudanças
4. ⏳ Exportar/importar configurações

---

## ✅ Benefícios

1. **Flexibilidade**: Ajustar personalidade sem editar código
2. **Consistência**: Mesma personalidade para todos os clientes
3. **Manutenibilidade**: Configuração centralizada
4. **Escalabilidade**: Fácil adicionar novos campos
5. **Testabilidade**: Fácil testar diferentes personalidades

---

## 🔄 Compatibilidade

- ✅ **Retrocompatível**: Se não houver configuração, usa comportamento padrão
- ✅ **Não quebra**: Agentes existentes continuam funcionando
- ✅ **Opcional**: Configuração é opcional, sistema funciona sem ela

---

## 📋 Checklist de Implementação

- [ ] Criar `ApexIAClientPersonalitySettings.jsx`
- [ ] Adicionar rota no `SuperAdmin.jsx`
- [ ] Criar função `loadPersonalityConfig()`
- [ ] Criar função `buildPersonalitySection()`
- [ ] Modificar `PublicClientChat.jsx`
- [ ] Adicionar preview em tempo real
- [ ] Testar com diferentes configurações
- [ ] Documentar uso

---

## 💡 Próximos Passos

1. **Aprovar proposta** → Implementar Fase 1
2. **Revisar interface** → Ajustar conforme feedback
3. **Testar** → Validar com casos reais
4. **Documentar** → Criar guia de uso

---

**Data da Revisão:** 2024-01-15  
**Status:** Aguardando aprovação para implementação

