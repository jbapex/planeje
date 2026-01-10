# 📚 Documentação Completa do Sistema JB APEX

## 🎯 Visão Geral

**JB APEX** é uma plataforma completa de gestão inteligente para agências de marketing digital, desenvolvida especificamente para otimizar o controle de clientes, projetos, tarefas, campanhas de tráfego pago, redes sociais e comunicação com clientes através de assistentes de IA.

### Informações Técnicas
- **Nome:** JB APEX - Sistema de Gestão Inteligente
- **Tipo:** Single Page Application (SPA)
- **Framework Frontend:** React 18.2.0
- **Build Tool:** Vite 4.4.5
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Estilização:** Tailwind CSS + Radix UI
- **Roteamento:** React Router DOM 6.24.1
- **Animações:** Framer Motion 10.16.4
- **Autenticação:** Supabase Auth
- **Banco de Dados:** PostgreSQL (via Supabase)

---

## 🏗️ Arquitetura do Sistema

### Estrutura de Diretórios

```
planeje/
├── src/
│   ├── components/          # Componentes React organizados por funcionalidade
│   │   ├── admin/          # Componentes administrativos
│   │   ├── auth/           # Autenticação (Login, SignUp)
│   │   ├── chat/           # Componentes de chat
│   │   ├── clients/         # Gestão de clientes
│   │   ├── forms/          # Formulários reutilizáveis
│   │   ├── layout/         # Layout principal (Header, Sidebar, Footer)
│   │   ├── pages/         # Páginas principais do sistema
│   │   ├── projects/      # Componentes de projetos
│   │   ├── requests/      # Solicitações
│   │   ├── social/        # Redes sociais
│   │   ├── tasks/         # Gestão de tarefas
│   │   ├── traffic/       # Tráfego pago
│   │   └── ui/            # Componentes UI reutilizáveis (Radix UI)
│   ├── contexts/          # Contextos React (Auth, ModuleSettings)
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Bibliotecas e utilitários
│   │   └── migrations/   # Scripts SQL de migração
│   ├── App.jsx            # Componente principal e rotas
│   └── main.jsx           # Entry point
├── supabase/
│   └── functions/         # Edge Functions (Deno)
│       ├── openai-chat/
│       ├── openrouter-chat/
│       ├── google-search/
│       ├── duckduckgo-search/
│       ├── meta-ads-api/
│       ├── runware-image-generation/
│       └── openrouter-image-generation/
└── public/                # Arquivos estáticos
```

---

## 👥 Sistema de Usuários e Permissões

### Roles (Papéis)

1. **Superadmin**
   - Acesso total ao sistema
   - Configurações globais
   - Gerenciamento de módulos
   - Configuração de IA
   - Acesso ao painel Super Admin

2. **Admin**
   - Acesso a todas as funcionalidades operacionais
   - Gerenciamento de clientes, projetos, tarefas
   - Acesso a relatórios
   - Não tem acesso ao Super Admin

3. **Colaborador**
   - Acesso limitado às funcionalidades operacionais
   - Pode criar e gerenciar tarefas atribuídas
   - Visualização de projetos e clientes
   - Não tem acesso a configurações administrativas

### Autenticação

- **Sistema:** Supabase Auth
- **Métodos:** Email/Senha
- **Perfis:** Tabela `profiles` com informações adicionais
- **Sessão:** Gerenciada automaticamente pelo Supabase
- **Proteção de Rotas:** Componente `ProtectedRoute` com verificação de roles e módulos

---

## 📦 Módulos do Sistema

O sistema é modular e permite ativar/desativar módulos conforme necessário:

### 1. **Dashboard** (`dashboard`)
- Visão geral do sistema
- Estatísticas de tarefas (executadas, atrasadas, hoje, próximas)
- Sugestões inteligentes de tarefas
- Alertas e notificações
- Assistente de IA integrado (`DashboardAssistant`)

### 2. **Clientes** (`clients`)
- CRUD completo de clientes
- Visualização em cards ou lista
- Busca e filtros
- Campos personalizáveis:
  - Informações básicas (empresa, contato, nicho, público-alvo)
  - Informações da empresa (sobre, produtos/serviços)
  - Informações de contrato (tipo, valor, vencimento)
  - Redes sociais e contatos
  - Documentos do cliente
  - Etiquetas e tags
- **Permissões de Campos:** Superadmin pode controlar quais campos cada role pode ver/editar
- **Vault de Dados:** Armazenamento seguro de informações sensíveis
- **Progresso do Cliente:** Acompanhamento visual de métricas

### 3. **Projetos** (`projects`)
- Gestão completa de projetos/campanhas
- Vinculação com clientes
- Status personalizáveis
- Mês de referência
- Ferramentas integradas:
  - **AI Chat Dialog:** Chat com IA para projetos
  - **Campaign Planner:** Planejamento de campanhas
  - **Checklist Generator:** Gerador de checklists
  - **Sales Funnel Builder:** Construtor de funil de vendas
  - **Project Documents:** Documentos do projeto
  - **Project Report:** Relatórios do projeto

### 4. **Tarefas** (`tasks`)
- Sistema completo de gestão de tarefas
- **Múltiplas Visualizações:**
  - Lista
  - Kanban
  - Timeline
  - Calendário
  - Mind Map
  - Acelerio View
- **Funcionalidades:**
  - Subtarefas
  - Comentários
  - Anexos
  - Histórico de alterações
  - Rastreamento de tempo
  - Status personalizáveis
  - Automações e workflows
  - Regras de workflow
- **Filtros Avançados:** Por cliente, projeto, responsável, status, data
- **Atribuições:** Múltiplos responsáveis
- **Prioridades:** Baixa, Média, Alta, Urgente

### 5. **Solicitações** (`requests`)
- Recebimento de solicitações de clientes
- Conversão de solicitações em tarefas
- Acompanhamento de status
- Apenas Admin e Superadmin têm acesso

### 6. **Redes Sociais** (`social_media`)
- Gestão de conteúdo para redes sociais
- Agendamento de posts
- Geração de ideias de Stories (Instagram)
- Análise de imagens com IA
- Integração com clientes

### 7. **Tráfego Pago** (`paid_traffic`)
- Gestão completa de campanhas Meta Ads
- **Integração Meta Ads API:**
  - Vinculação de contas Meta por cliente
  - Sincronização de campanhas
  - Métricas em tempo real
  - Limites de gasto (`limite_meta`)
  - Objetivos de campanha
  - Custo por mensagem e compra
  - ROAS alvo
- **Visualizações:**
  - Lista de campanhas
  - Kanban por status
  - Overview detalhado
  - Insights e métricas
- **Status de Campanha:** Personalizáveis
- **Relatórios:** Performance e ROI

### 8. **Relatórios** (`reports`)
- Relatórios de performance
- Análises de campanhas
- Métricas de equipe
- Exportação de dados

---

## 🤖 Sistemas de IA Integrados

### 1. **ApexIA - Chat para Clientes**

**Componente:** `PublicClientChat.jsx`

**Funcionalidades:**
- Chat público para clientes (sem necessidade de login)
- URL única por cliente: `/chat/:clientId/:sessionId`
- **Personalização Completa:**
  - Personalidade configurável (traços, tom de voz, formalidade)
  - Comportamento (proatividade, uso de emojis)
  - Acesso a dados do cliente (configurável por campo)
  - Regras customizadas
  - Templates pré-definidos (Consultor, Suporte, Vendas, Educativo, Casual)
- **Modelos de IA Suportados:**
  - OpenAI (GPT-5.1, GPT-4o, GPT-3.5 Turbo, etc.)
  - OpenRouter (600+ modelos de múltiplos provedores)
- **Recursos Especiais:**
  - Geração de ideias de Stories do Instagram
  - Análise de imagens
  - Geração de imagens (Runware e OpenRouter)
  - Detecção inteligente de intenções
  - Histórico de conversas
  - Títulos automáticos (limitados a 3 palavras)
- **Integração:**
  - Acesso a dados do cliente
  - Projetos vinculados
  - Documentos do cliente
  - Tarefas relacionadas

### 2. **Assistente de Projetos - Chat Interno**

**Componentes:**
- `AssistantHome.jsx` - Tela inicial
- `SelectClient.jsx` - Seleção de cliente
- `ClientChat.jsx` - Chat específico de cliente
- `GeneralChat.jsx` - Chat geral

**Dois Modos de Operação:**

#### **Modo Cliente Específico:**
- Foco em um cliente por vez
- Conversa isolada por cliente
- Contexto completo do cliente carregado
- Histórico de conversas salvo por cliente
- Acesso a: dados cadastrais, documentos, projetos, tarefas

#### **Modo Geral:**
- Acesso a todos os clientes
- Pode referenciar múltiplos clientes
- Acesso a todas as conversas de clientes específicos
- Visão estratégica ampla
- Comparações entre clientes
- Análises gerais do sistema

**Funcionalidades:**
- Seleção de modelos OpenRouter (600+ modelos)
- Busca na web (Google/DuckDuckGo) para modelos Gemini
- Geração de imagens (Runware e OpenRouter)
- Histórico de conversas
- Ações rápidas (scripts, legendas, análises)
- Interface profissional e intuitiva

### 3. **Dashboard Assistant**

**Componente:** `DashboardAssistant.jsx`

- Assistente de IA integrado ao dashboard
- Ajuda com tarefas e sugestões
- Acesso ao contexto do usuário logado

### 4. **AI Agents Manager**

**Componente:** `AiAgentsManager.jsx`

- Gerenciamento de agentes de IA customizados
- CRUD completo
- Placeholders dinâmicos no prompt
- Ativação/desativação de agentes

---

## 🔧 Configurações e Administração

### Painel Super Admin

**Rota:** `/super-admin/*`

**Funcionalidades Disponíveis:**

1. **Gerenciar Módulos**
   - Ativar/desativar módulos do sistema
   - Controle granular de acesso

2. **Permissões de Campos**
   - Controlar quais campos cada role pode ver/editar
   - Por tabela e por campo

3. **Config. Dashboard**
   - Configurações de status do dashboard
   - Personalização de métricas

4. **Info. Empresa (IA)**
   - Informações da empresa para uso em prompts de IA
   - Contexto para assistentes

5. **Leads do Diagnóstico**
   - Gerenciamento de leads do diagnóstico de marketing

6. **Templates Diagnóstico**
   - Criar e gerenciar templates de diagnóstico
   - Perguntas customizáveis

7. **Config. Diagnóstico**
   - Configurações do sistema de diagnóstico

8. **Agentes de IA**
   - Gerenciar agentes customizados
   - Criar, editar, deletar agentes

9. **Personalidade ApexIA**
   - Configurar personalidade do ApexIA
   - Escolher modelos de IA (OpenAI ou OpenRouter)
   - Templates de personalidade
   - Acesso a dados do cliente

10. **Limites do Chat IA**
    - Configurar limites de uso do chat
    - Controle de quotas

11. **Modelos Assistente**
    - Configurar modelos disponíveis para Assistente de Projetos
    - Selecionar múltiplos modelos do OpenRouter
    - Definir modelo padrão

---

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

#### **Autenticação e Usuários**
- `profiles` - Perfis de usuários
- `auth.users` - Usuários do Supabase Auth

#### **Clientes**
- `clientes` - Dados dos clientes
  - Campos básicos (empresa, nome_contato, nicho, público-alvo)
  - Campos de contrato (tipo, valor, vencimento, limite_meta)
  - Campos de Meta Ads (objetivo_meta, custo_mensagem, custo_compra, roas_alvo)
  - Redes sociais e contatos
  - Documentos (JSONB)
  - Etiquetas
- `cliente_meta_accounts` - Contas Meta vinculadas aos clientes
- `client_field_permissions` - Permissões de campos por role

#### **Projetos**
- `projetos` - Projetos/campanhas
  - Vinculação com clientes
  - Status e mês de referência
  - Metadados

#### **Tarefas**
- `tarefas` - Tarefas do sistema
  - Vinculação com clientes e projetos
  - Status personalizáveis
  - Responsáveis
  - Datas (criação, vencimento, conclusão)
  - Prioridades
  - Subtarefas
  - Comentários
  - Anexos
  - Rastreamento de tempo
- `task_status` - Status personalizáveis de tarefas
- `task_automations` - Automações de tarefas
- `workflow_rules` - Regras de workflow

#### **Solicitações**
- `requests` - Solicitações de clientes
  - Conversão em tarefas
  - Status e acompanhamento

#### **Tráfego Pago**
- `paid_campaigns` - Campanhas de tráfego pago
  - Vinculação com clientes
  - Status personalizáveis
  - Métricas sincronizadas da Meta Ads API
  - Limites e objetivos

#### **Redes Sociais**
- `story_ideas` - Ideias de Stories geradas pela IA
  - Categorias (venda, suspense, bastidores, resultados, engajamento)
  - Expiração automática (7 dias)
  - Vinculação com clientes

#### **IA e Configurações**
- `public_config` - Configurações globais do sistema
  - Chave-valor JSON
  - Configurações de personalidade ApexIA
  - Configurações de modelos de IA
  - Informações da empresa
- `ai_agents` - Agentes de IA customizados
- `assistant_project_conversations` - Conversas do Assistente de Projetos
  - Modo (client_specific ou general)
  - Mensagens em JSONB
  - Histórico completo
- `chat_limits` - Limites de uso do chat

#### **Diagnóstico**
- `diagnostic_templates` - Templates de diagnóstico
- `diagnostic_template_questions` - Perguntas dos templates
- `diagnostic_leads` - Leads do diagnóstico

---

## 🔌 Integrações Externas

### 1. **Supabase**
- **Backend as a Service**
- Banco de dados PostgreSQL
- Autenticação
- Storage (para anexos)
- Edge Functions (Deno)
- Realtime subscriptions

### 2. **OpenAI API**
- Chat GPT (via Edge Function `openai-chat`)
- Geração de imagens DALL-E (via `openai-image-generation`)
- Modelos: GPT-5.1, GPT-4o, GPT-3.5 Turbo, etc.

### 3. **OpenRouter**
- Acesso a 600+ modelos de LLM
- Via Edge Function `openrouter-chat`
- Geração de imagens via modelos OpenRouter
- Modelos de múltiplos provedores:
  - OpenAI (GPT-4o, GPT-3.5)
  - Anthropic (Claude 3.5 Sonnet, Claude Opus)
  - Google (Gemini Pro, Gemini Flash)
  - Meta (Llama 3.1 70B, Llama 3.1 8B)
  - Mistral AI
  - DeepSeek
  - Grok (xAI)
  - Cohere
  - Perplexity
  - Qwen (Alibaba)

### 4. **Meta Ads API**
- Integração completa via Edge Function `meta-ads-api`
- Sincronização de campanhas
- Métricas em tempo real
- Vinculação de contas por cliente
- Requer token de acesso Meta

### 5. **Google Custom Search API**
- Busca na web para modelos Gemini
- Via Edge Function `google-search`
- Fallback para DuckDuckGo (sem API key)

### 6. **Runware (RunDiffusion)**
- Geração de imagens via IA
- Via Edge Function `runware-image-generation`
- Modelos de geração de imagens

---

## 🎨 Interface e UX

### Design System
- **Framework UI:** Radix UI (componentes acessíveis)
- **Estilização:** Tailwind CSS
- **Tema:** Suporte a modo claro/escuro
- **Responsividade:** Mobile-first
- **Animações:** Framer Motion para transições suaves

### Componentes UI Reutilizáveis
- Botões, Cards, Dialogs, Dropdowns
- Formulários (Input, Textarea, Select, Checkbox)
- Tabelas, Tabs, Accordions
- Toast notifications
- Scroll Areas
- Badges, Avatares

### Layout Principal
- **Sidebar:** Navegação principal (desktop)
- **Header:** Informações do usuário, tema, notificações
- **BottomNav:** Navegação mobile
- **MainLayout:** Container principal com padding e scroll

---

## 🔐 Segurança

### Row Level Security (RLS)
- Todas as tabelas principais têm RLS habilitado
- Políticas por role e por usuário
- Acesso baseado em ownership e roles

### Autenticação
- Supabase Auth com sessões seguras
- Tokens JWT
- Refresh tokens automáticos

### Permissões
- Sistema granular de permissões
- Controle por módulo
- Controle por campo (clientes)
- Controle por role

---

## 📊 Funcionalidades Especiais

### 1. **Sistema de Cache**
- Hook `useDataCache` para otimização
- Cache por usuário e role
- Redução de requisições desnecessárias

### 2. **Realtime Updates**
- Supabase Realtime para atualizações em tempo real
- Campanhas Meta atualizadas automaticamente
- Notificações de mudanças

### 3. **Automações e Workflows**
- Sistema de automações de tarefas
- Regras de workflow configuráveis
- Execução automática baseada em eventos

### 4. **Rastreamento de Tempo**
- Time tracking para tarefas
- Configurações personalizáveis
- Relatórios de tempo

### 5. **Múltiplas Visualizações**
- Lista, Kanban, Timeline, Calendário, Mind Map
- Filtros avançados
- Ordenação customizável

### 6. **Exportação de Dados**
- Relatórios em PDF
- Exportação de tabelas
- Screenshots de visualizações

---

## 🚀 Deploy e Infraestrutura

### Frontend
- **Build:** Vite
- **Deploy:** VPS ou plataformas como Vercel/Netlify
- **PWA:** Service Worker para funcionamento offline
- **Manifest:** Configurado para instalação como app

### Backend
- **Supabase:** Hospedado na nuvem
- **Edge Functions:** Deploy via Supabase CLI ou Dashboard
- **Banco de Dados:** PostgreSQL gerenciado pelo Supabase

### Variáveis de Ambiente
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Secrets no Supabase Vault (API keys)

---

## 📝 Migrações e Versionamento

### Sistema de Migrações
- Scripts SQL em `src/lib/migrations/`
- Numeração sequencial
- Execução manual via Supabase SQL Editor
- Documentação de cada migração

### Principais Migrações
1. Criação de tabelas base
2. Configurações públicas
3. Templates de diagnóstico
4. Contas Meta
5. Objetivos Meta
6. Limite Meta
7. Conversas do Assistente de Projetos

---

## 🧪 Testes e Qualidade

### Linting
- ESLint configurado
- Regras do React App

### Error Handling
- Error Boundaries
- Try-catch em operações críticas
- Mensagens de erro amigáveis
- Logs detalhados em desenvolvimento

---

## 📚 Documentação Adicional

O sistema possui documentação extensa em arquivos `.md`:
- Guias de configuração
- Guias de deploy
- Documentação de funcionalidades
- Arquitetura de componentes
- Guias de uso

---

## 🔄 Fluxos Principais

### 1. **Fluxo de Autenticação**
1. Usuário acessa `/login`
2. Autenticação via Supabase Auth
3. Redirecionamento baseado em role
4. Carregamento de perfil e permissões

### 2. **Fluxo de Criação de Tarefa**
1. Selecionar cliente/projeto
2. Preencher formulário
3. Atribuir responsáveis
4. Definir datas e prioridade
5. Salvar no banco
6. Notificações e automações executadas

### 3. **Fluxo de Chat ApexIA**
1. Cliente acessa URL única
2. Carregamento de dados do cliente
3. Seleção de template (opcional)
4. Chat com IA usando configuração personalizada
5. Mensagens salvas em sessão
6. Título gerado automaticamente

### 4. **Fluxo de Sincronização Meta Ads**
1. Vincular conta Meta ao cliente
2. Configurar token de acesso
3. Sincronização automática via Edge Function
4. Atualização de campanhas em tempo real
5. Exibição de métricas no sistema

---

## 🎯 Casos de Uso Principais

1. **Gestão de Agência de Marketing**
   - Controle completo de clientes e projetos
   - Acompanhamento de campanhas
   - Gestão de equipe e tarefas

2. **Atendimento ao Cliente**
   - Chat inteligente com ApexIA
   - Personalização por cliente
   - Histórico completo de interações

3. **Análise e Relatórios**
   - Métricas de campanhas Meta
   - Performance de projetos
   - Relatórios de equipe

4. **Automação**
   - Workflows de tarefas
   - Automações de campanhas
   - Geração de conteúdo com IA

---

## 🔮 Funcionalidades Futuras (Sugeridas)

- Integração com mais plataformas de anúncios
- App mobile nativo
- Notificações push
- Integração com calendários externos
- API pública para integrações
- Sistema de templates de projetos
- Marketplace de automações

---

## 📞 Suporte e Manutenção

### Logs
- Console logs em desenvolvimento
- Logs de Edge Functions no Supabase Dashboard
- Error tracking

### Monitoramento
- Supabase Dashboard para métricas
- Logs de uso de API
- Monitoramento de Edge Functions

---

**Última Atualização:** Dezembro 2024  
**Versão do Sistema:** 1.0.0  
**Desenvolvido para:** JB APEX - Agência de Marketing Digital

