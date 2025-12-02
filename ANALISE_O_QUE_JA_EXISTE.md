# 🔍 Análise: O Que Já Existe no Sistema

## 📊 Resumo Executivo

**Status:** Sistema tem infraestrutura básica, mas **NÃO tem** personalização de personalidade do ApexIA do cliente.

**O que existe:**
- ✅ Tabela `public_config` para configurações
- ✅ Sistema de agentes de IA (`ai_agents`)
- ✅ Placeholders no prompt dos agentes
- ✅ Exemplos de configurações similares (`CompanyInfoSettings`, `DashboardSettings`)

**O que NÃO existe:**
- ❌ Configuração de personalidade do ApexIA do cliente
- ❌ Interface para personalizar comportamento
- ❌ Sistema de templates de personalidade
- ❌ Integração de configuração no fluxo do chat

---

## ✅ Infraestrutura Existente

### 1. **Tabela `public_config`**

**Localização:** `src/lib/migrations/002_create_public_config.sql`

**Estrutura:**
```sql
CREATE TABLE IF NOT EXISTS public_config (
  key text primary key,
  value text,
  updated_at timestamp with time zone default now()
);
```

**Políticas RLS:**
- ✅ Leitura pública (`public_read`)
- ✅ Escrita para usuários autenticados (`authenticated_upsert`)

**Uso Atual:**
- `company_info_for_ai` - Informações da empresa para IA (`CompanyInfoSettings.jsx`)
- `dashboard_status_config` - Configuração de status do dashboard (`DashboardSettings.jsx`)

**✅ Pode ser usado para:** Armazenar configuração de personalidade do ApexIA

---

### 2. **Sistema de Agentes de IA**

**Tabela:** `ai_agents`

**Campos identificados:**
- `id` (uuid)
- `name` (text) - Nome do agente
- `description` (text) - Descrição do agente
- `prompt` (text) - **Prompt completo do agente**
- `icon` (text) - Ícone (Bot, Sparkles, Lightbulb, Clapperboard)
- `is_active` (boolean) - Se está ativo
- `created_at` (timestamp)

**Gerenciamento:**
- ✅ Interface: `AiAgentsManager.jsx` (Super Admin → Agentes de IA)
- ✅ CRUD completo (criar, editar, deletar, ativar/desativar)

**Placeholders suportados no prompt:**
- `{client_name}` → `client.empresa`
- `{contact_name}` → `client.nome_contato`
- `{client_niche}` → `client.nicho`
- `{client_target_audience}` → `client.publico_alvo`
- `{client_tone}` → `client.tom_de_voz`

**Limitação:** Personalidade está hardcoded no `prompt` de cada agente

---

### 3. **Exemplos de Configurações Similares**

#### A) `CompanyInfoSettings.jsx`

**Localização:** Super Admin → "Info. Empresa (IA)"

**Funcionalidade:**
- Carrega/salva configuração em `public_config` com chave `company_info_for_ai`
- Textarea grande para informações da empresa
- Usado por IAs do sistema para contexto

**Padrão usado:**
```javascript
const CONFIG_KEY = 'company_info_for_ai';

// Carregar
const { data } = await supabase
  .from('public_config')
  .select('key, value')
  .eq('key', CONFIG_KEY)
  .maybeSingle();

// Salvar
await supabase
  .from('public_config')
  .upsert({
    key: CONFIG_KEY,
    value: companyInfo,
  }, {
    onConflict: 'key',
  });
```

**✅ Pode ser usado como:** Template para criar `ApexIAClientPersonalitySettings.jsx`

---

#### B) `DashboardSettings.jsx`

**Localização:** Super Admin → "Config. Dashboard"

**Funcionalidade:**
- Carrega/salva configuração JSON em `public_config`
- Interface com checkboxes e seleções
- Validação e valores padrão

**Padrão usado:**
```javascript
const CONFIG_KEY = 'dashboard_status_config';

// Estrutura JSON
const config = {
  executed: [],
  overdueExclude: [],
  today: [],
  upcoming: [],
};

// Salvar como JSON
await supabase
  .from('public_config')
  .upsert({
    key: CONFIG_KEY,
    value: JSON.stringify(config),
  });
```

**✅ Pode ser usado como:** Template para estrutura JSON de personalidade

---

### 4. **Fluxo Atual do Chat do Cliente**

**Arquivo:** `src/components/pages/PublicClientChat.jsx`

**Linhas 445-452:**
```javascript
let systemPrompt = currentAgent.prompt
    .replace('{client_name}', client.empresa || '')
    .replace('{contact_name}', client.nome_contato || '')
    .replace('{client_niche}', client.nicho || '')
    .replace('{client_target_audience}', client.publico_alvo || '')
    .replace('{client_tone}', client.tom_de_voz || '');
systemPrompt += `\n\n**Informações de Contexto (se necessário):**\n**Projetos Atuais Selecionados:**\n${projectsInfo}`;
systemPrompt += `\n\n**Instrução Importante:** Se o usuário precisar de ajuda humana ou você não souber a resposta, primeiro pergunte se ele gostaria de criar uma solicitação para a equipe. Use o shortcode **[CONFIRMAR_SOLICITACAO]** ao final da sua pergunta. Exemplo: "Para isso, o ideal é falar com nossa equipe. Você gostaria de criar uma solicitação agora? [CONFIRMAR_SOLICITACAO]"`;
```

**O que acontece:**
1. Pega o prompt do agente selecionado
2. Substitui placeholders com dados do cliente
3. Adiciona informações de contexto (projetos)
4. Adiciona instrução sobre solicitações
5. Envia para a IA

**❌ Não há:** Carregamento de configuração de personalidade

---

## 📋 Estrutura do Menu Super Admin

**Arquivo:** `src/components/pages/SuperAdmin.jsx`

**Itens existentes:**
```javascript
const navItems = [
  { path: '/super-admin/modules', label: 'Gerenciar Módulos', icon: <Settings /> },
  { path: '/super-admin/client-permissions', label: 'Permissões de Campos', icon: <ShieldCheck /> },
  { path: '/super-admin/dashboard-settings', label: 'Config. Dashboard', icon: <LayoutDashboard /> },
  { path: '/super-admin/company-info', label: 'Info. Empresa (IA)', icon: <Users /> },
  { path: '/super-admin/diagnostic-leads', label: 'Leads do Diagnóstico', icon: <BarChart2 /> },
  { path: '/super-admin/diagnostic-templates', label: 'Templates Diagnóstico', icon: <Settings /> },
  { path: '/super-admin/diagnostic-settings', label: 'Config. Diagnóstico', icon: <Settings /> },
  { path: '/super-admin/ai-agents', label: 'Agentes de IA', icon: <Sparkles /> },
  { path: '/super-admin/chat-limits', label: 'Limites do Chat IA', icon: <Bot /> },
];
```

**✅ Pode adicionar:** Nova rota para personalidade do ApexIA

---

## 🎯 Dados do Cliente Disponíveis

**Tabela:** `clientes`

**Campos relevantes já usados:**
- `empresa` → `{client_name}`
- `nome_contato` → `{contact_name}`
- `nicho` → `{client_niche}`
- `publico_alvo` → `{client_target_audience}`
- `tom_de_voz` → `{client_tone}`

**Campos adicionais disponíveis:**
- `sobre_empresa` (textarea)
- `produtos_servicos` (textarea)
- `avaliacao_treinamento` (textarea)
- `logo_urls` (array)

**❌ Não há:** Campo específico para personalidade do ApexIA por cliente

---

## 🔧 Componentes UI Disponíveis

**Biblioteca:** shadcn/ui (via `@/components/ui/`)

**Componentes já usados em configurações similares:**
- ✅ `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`
- ✅ `Button`
- ✅ `Label`
- ✅ `Textarea`
- ✅ `Input`
- ✅ `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- ✅ `Checkbox`
- ✅ `Switch`
- ✅ `Badge`
- ✅ `Alert`, `AlertDescription`
- ✅ `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- ✅ `Loader2` (ícone de loading)
- ✅ `useToast` (para notificações)

**✅ Todos disponíveis para:** Criar interface de personalização

---

## 📦 Dependências e Hooks

**Hooks React:**
- ✅ `useState`, `useEffect`, `useCallback` (já usados)
- ✅ `useRef` (para referências)
- ✅ `useMemo` (para otimização)

**Bibliotecas:**
- ✅ `supabase` (`@/lib/customSupabaseClient`)
- ✅ `framer-motion` (para animações)
- ✅ `lucide-react` (ícones)
- ✅ `date-fns` (formatação de datas)

**✅ Todas disponíveis para:** Implementação

---

## 🚫 O Que NÃO Existe

### 1. **Configuração de Personalidade**
- ❌ Nenhuma configuração de personalidade do ApexIA do cliente
- ❌ Nenhuma interface para configurar comportamento
- ❌ Nenhum sistema de templates de personalidade

### 2. **Integração no Fluxo do Chat**
- ❌ `PublicClientChat.jsx` não carrega configuração de personalidade
- ❌ Não há função para construir seção de personalidade
- ❌ Não há merge de configuração com prompt do agente

### 3. **Estrutura de Dados**
- ❌ Nenhuma chave em `public_config` para personalidade
- ❌ Nenhum JSON estruturado para configuração
- ❌ Nenhum padrão definido

---

## ✅ O Que Pode Ser Reutilizado

### 1. **Padrão de Configuração**
```javascript
// Padrão já usado em CompanyInfoSettings e DashboardSettings
const CONFIG_KEY = 'apexia_client_personality_config';

// Carregar
const { data } = await supabase
  .from('public_config')
  .select('key, value')
  .eq('key', CONFIG_KEY)
  .maybeSingle();

// Salvar
await supabase
  .from('public_config')
  .upsert({
    key: CONFIG_KEY,
    value: JSON.stringify(config), // ou texto simples
  }, {
    onConflict: 'key',
  });
```

### 2. **Estrutura de Componente**
```javascript
// Similar a CompanyInfoSettings.jsx
const ApexIAClientPersonalitySettings = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    // Carregar de public_config
  }, []);

  const handleSave = async () => {
    // Salvar em public_config
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    // Interface similar a CompanyInfoSettings
  );
};
```

### 3. **Integração no Chat**
```javascript
// Modificar PublicClientChat.jsx
const loadPersonalityConfig = async () => {
  const { data } = await supabase
    .from('public_config')
    .select('value')
    .eq('key', 'apexia_client_personality_config')
    .maybeSingle();
  
  return data?.value ? JSON.parse(data.value) : null;
};

// Na função handleSendMessage
const personalityConfig = await loadPersonalityConfig();
const personalitySection = buildPersonalitySection(personalityConfig);
systemPrompt += `\n\n**Personalidade e Comportamento:**\n${personalitySection}`;
```

---

## 📊 Comparação: O Que Existe vs. O Que Precisa

| Funcionalidade | Existe? | Onde | Pode Reutilizar? |
|---------------|---------|------|------------------|
| Tabela `public_config` | ✅ | `002_create_public_config.sql` | ✅ Sim |
| Interface de configuração | ✅ | `CompanyInfoSettings.jsx` | ✅ Sim (template) |
| Carregar/salvar config | ✅ | `CompanyInfoSettings.jsx` | ✅ Sim (padrão) |
| Menu Super Admin | ✅ | `SuperAdmin.jsx` | ✅ Sim (adicionar item) |
| Componentes UI | ✅ | shadcn/ui | ✅ Sim (todos disponíveis) |
| Sistema de agentes | ✅ | `ai_agents` table | ✅ Sim (já integrado) |
| Placeholders no prompt | ✅ | `PublicClientChat.jsx` | ✅ Sim (expandir) |
| **Config personalidade** | ❌ | - | ❌ Precisa criar |
| **Interface personalização** | ❌ | - | ❌ Precisa criar |
| **Função buildPersonalitySection** | ❌ | - | ❌ Precisa criar |
| **Integração no chat** | ❌ | - | ❌ Precisa criar |

---

## 🎯 Conclusão

### ✅ **Infraestrutura Pronta:**
- Tabela `public_config` existe e funciona
- Padrão de configuração já estabelecido
- Componentes UI disponíveis
- Exemplos de implementação similares

### ❌ **O Que Falta:**
- Componente `ApexIAClientPersonalitySettings.jsx`
- Rota no Super Admin
- Função `buildPersonalitySection()`
- Integração no `PublicClientChat.jsx`
- Estrutura JSON de configuração

### 🚀 **Próximos Passos:**
1. Criar componente baseado em `CompanyInfoSettings.jsx`
2. Adicionar rota no `SuperAdmin.jsx`
3. Criar função helper para construir seção de personalidade
4. Modificar `PublicClientChat.jsx` para integrar
5. Testar e validar

---

**Data da Análise:** 2024-01-15  
**Status:** Pronto para implementação - toda infraestrutura necessária existe

