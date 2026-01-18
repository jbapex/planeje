# 🔐 Análise: Sistema de Autenticação para Clientes

## 📋 Situação Atual

### ✅ O Que Já Existe

1. **Sistema de Autenticação Interno (Supabase Auth)**
   - Login/SignUp para usuários internos (superadmin, admin, colaborador)
   - Perfis em `profiles` vinculados a `auth.users`
   - RLS (Row Level Security) implementado
   - Context `SupabaseAuthContext` para gerenciar sessões

2. **ApexIA - Chat Público SEM Autenticação**
   - Rota pública: `/chat/:clientId/:sessionId`
   - Acesso baseado apenas no `clientId` na URL
   - Sem verificação de identidade
   - Cliente acessa diretamente pela URL compartilhada

3. **Tabela `clientes`**
   - Armazena dados dos clientes
   - Campo `owner_id` (vinculado ao usuário interno que criou)
   - Sem vínculo direto com sistema de autenticação

4. **Tabela `profiles`**
   - Usada apenas para usuários internos
   - Vinculada a `auth.users` via `id`

---

## 🎯 Objetivo

Criar um sistema onde:
- **Cada cliente pode ter login/senha próprio (OPCIONAL)**
- **Acesso público via link continua funcionando (como está hoje)**
- **Acesso autenticado via login/senha (NOVO)**
- **Ambos os métodos coexistem permanentemente**
- **Usuário cliente vinculado ao registro na tabela `clientes`**
- **Futuro: controle granular de acesso a métricas e materiais**

### 📌 Decisão Importante: Coexistência dos Dois Sistemas

**✅ MANTER AMBOS:**
- **Acesso Público:** `/chat/:clientId/:sessionId` - Continua funcionando (qualquer um com link pode acessar)
- **Acesso Autenticado:** `/apexia` - Novo sistema (cliente faz login antes)

**Vantagens:**
- ✅ Cliente escolhe o método preferido
- ✅ Links já compartilhados continuam funcionando
- ✅ Facilita para clientes que preferem não fazer login
- ✅ Permite acesso mais seguro quando necessário

---

## 🏗️ Arquitetura Proposta

### Opção 1: Usuários Clientes no Supabase Auth (RECOMENDADO)

**Vantagens:**
- ✅ Aproveita infraestrutura existente do Supabase
- ✅ JWT tokens nativos
- ✅ Recuperação de senha automática
- ✅ Segurança robusta
- ✅ Integração natural com RLS

**Desvantagens:**
- ⚠️ Usuários internos e clientes compartilham `auth.users`
- ⚠️ Precisa diferenciar por tipo (role ou tabela separada)

**Estrutura:**

```
auth.users (Supabase Auth)
├── id (uuid) - PK
├── email
└── password (hashed)

profiles (Tabela existente)
├── id (uuid) - FK para auth.users.id
├── role (enum: 'superadmin' | 'admin' | 'colaborador' | 'cliente')
├── full_name
├── avatar_url
└── cliente_id (uuid) - FK para clientes.id (NULL para usuários internos)

clientes (Tabela existente)
├── id (uuid) - PK
├── empresa
├── ... (outros campos)
└── (sem alteração na estrutura)
```

**Fluxo de Login Cliente:**
1. Cliente acessa `/login-cliente`
2. Informa email/senha
3. Sistema autentica via Supabase Auth
4. Busca `profile` com `role = 'cliente'` e `cliente_id`
5. Redireciona para `/apexia` (apenas ApexIA disponível)

---

### Opção 2: Autenticação Customizada (NÃO RECOMENDADO)

**Desvantagens:**
- ❌ Implementar hash de senhas manualmente
- ❌ Gerenciar sessões manualmente
- ❌ Mais complexo e propenso a erros de segurança
- ❌ Não aproveita infraestrutura existente

**Estrutura:**

```
clientes
├── id (uuid) - PK
├── email (novo campo)
├── password_hash (novo campo)
└── ... (outros campos)
```

**Conclusão:** Opção 1 é muito superior em segurança e manutenibilidade.

---

## 📊 Estrutura de Dados Detalhada

### Alterações Necessárias na Tabela `profiles`

```sql
-- Adicionar campos novos
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'colaborador';

-- Atualizar role existente para garantir valores válidos
UPDATE profiles 
SET role = 'colaborador' 
WHERE role IS NULL OR role NOT IN ('superadmin', 'admin', 'colaborador', 'cliente');
```

### Nova Tabela `cliente_user_access` (Opcional - para controle futuro)

```sql
-- Tabela para controlar acesso granular futuro
CREATE TABLE IF NOT EXISTS cliente_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level text DEFAULT 'apexia_only', -- 'apexia_only' | 'metrics' | 'full'
  granted_modules jsonb DEFAULT '["apexia"]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id, user_id)
);
```

**Explicação:**
- `access_level`: Nível de acesso (por enquanto só 'apexia_only')
- `granted_modules`: Módulos permitidos em JSON (futuro: ['apexia', 'metrics', 'reports'])

---

## 🔄 Fluxos Principais

### Fluxo 1: Criação de Usuário Cliente

**Cenário:** Você cria um cliente e quer gerar login/senha para ele

1. **No painel interno (Settings ou Clients):**
   - Botão "Criar login para cliente"
   - Formulário: Email + Senha inicial (ou gerar automaticamente)
   - Ao salvar:
     ```sql
     -- 1. Criar usuário no auth.users (via Supabase Admin API)
     -- 2. Criar/atualizar profile com role='cliente' e cliente_id
     -- 3. Criar registro em cliente_user_access (se usar tabela)
     ```

2. **Enviar credenciais:**
   - Email automático com login/senha
   - Ou compartilhar manualmente

### Fluxo 2: Login do Cliente

1. Cliente acessa `/login-cliente` (ou `/login` detecta tipo de usuário)
2. Informa email/senha
3. Sistema autentica via `signInWithPassword`
4. Verifica `profile.role = 'cliente'`
5. Redireciona para `/apexia` (protegido)

### Fluxo 3: Acesso ao ApexIA - Duas Opções

#### Opção A: Acesso Público via Link (MANTIDO)

**Como funciona (como está hoje):**
- Cliente recebe link: `/chat/:clientId/:sessionId`
- Acessa diretamente sem login
- Sistema busca dados usando `clientId` da URL
- **Componente:** `PublicClientChat.jsx` (mantém como está)

**Uso:**
- Compartilhamento rápido via WhatsApp/Email
- Cliente não precisa criar login
- Links já compartilhados continuam funcionando

#### Opção B: Acesso Autenticado via Login (NOVO)

**Como funciona:**
- Cliente faz login em `/login-cliente`
- Após login, acessa `/apexia`
- Sistema busca `clientId` do `profile.cliente_id` (não da URL)
- **Componente:** `ApexIAAuthenticated.jsx` (novo)

**Lógica:**
```javascript
// Ao acessar /apexia
const { user, profile } = useAuth();
if (!user || profile.role !== 'cliente' || !profile.cliente_id) {
  redirect('/login-cliente');
}
const clientId = profile.cliente_id; // Busca do profile, não da URL
```

**Uso:**
- Acesso mais seguro (com autenticação)
- Histórico persistente vinculado ao usuário
- Base para futuro acesso a métricas e relatórios
- Cliente não precisa de link compartilhado

### 🔄 Sincronização entre Ambos

**Importante:** Ambos compartilham os mesmos dados:
- Mesmas sessões de chat (`client_chat_sessions`)
- Mesmas mensagens (`client_chat_messages`)
- Mesmos dados do cliente (`clientes`)

**Exemplo:**
1. Cliente inicia conversa via link público (`/chat/abc123/session456`)
2. Mais tarde, faz login e acessa `/apexia`
3. **Vê a mesma conversa** porque usa o mesmo `clientId` e `sessionId`

**Ou vice-versa:**
1. Cliente faz login e conversa em `/apexia`
2. Recebe link compartilhado `/chat/abc123/session789`
3. **Continua a conversa** via link público

---

## 🛣️ Rotas e Navegação

### Rotas - Coexistência dos Dois Sistemas

```javascript
// ====== ROTAS PÚBLICAS (Acesso via link) ======
// Mantém funcionamento atual - qualquer um com link pode acessar
<Route path="/chat/:clientId" element={<PublicClientChat />} />
<Route path="/chat/:clientId/:sessionId" element={<PublicClientChat />} />

// ====== NOVAS ROTAS PARA LOGIN DE CLIENTES ======
<Route path="/login-cliente" element={<ClientLogin />} />

// ====== ROTAS PROTEGIDAS (Acesso autenticado) ======
// Novo sistema - cliente precisa fazer login
<Route path="/apexia" element={<ProtectedClientRoute><ApexIAAuthenticated /></ProtectedClientRoute>} />
<Route path="/apexia/:sessionId" element={<ProtectedClientRoute><ApexIAAuthenticated /></ProtectedClientRoute>} />
```

**Nota:** As rotas públicas (`/chat/:clientId`) e protegidas (`/apexia`) **coexistem permanentemente**. Ambas acessam os mesmos dados do cliente.

### Componente `ProtectedClientRoute`

```javascript
const ProtectedClientRoute = ({ children }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return <LoadingScreen />;
  
  if (!user || profile?.role !== 'cliente' || !profile?.cliente_id) {
    return <Navigate to="/login-cliente" replace />;
  }
  
  return children;
};
```

---

## 🔐 Segurança (RLS Policies)

### Policy para `clientes` (visualização)

```sql
-- Cliente só pode ver SEU PRÓPRIO registro
CREATE POLICY "Clientes podem ver apenas seus dados"
  ON clientes FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE id IN (
        SELECT id FROM profiles 
        WHERE role = 'cliente' 
        AND cliente_id = clientes.id
      )
    )
  );
```

### Policy para `client_chat_sessions` e `client_chat_messages`

```sql
-- Cliente só pode acessar suas próprias sessões
CREATE POLICY "Clientes podem ver suas sessões de chat"
  ON client_chat_sessions FOR SELECT
  USING (
    client_id IN (
      SELECT cliente_id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'cliente'
    )
  );
```

---

## 📱 Interface do Cliente

### Tela de Login Cliente (`/login-cliente`)

**Design:**
- Similar ao login atual, mas com identidade visual diferente
- Logo/tema do sistema
- Texto: "Área do Cliente - ApexIA"

**Campos:**
- Email
- Senha
- "Esqueci minha senha" (usa Supabase recovery)

### Dashboard Cliente (Futuro)

**Por enquanto:**
- Apenas acesso ao ApexIA
- Menu simples: "Chat ApexIA"

**Futuro:**
- Métricas e relatórios
- Documentos compartilhados
- Histórico de conversas

---

## 🔄 Coexistência dos Sistemas

### ✅ Decisão: Manter Ambos Permanentemente

**Sistema 1: Acesso Público (Mantido)**
- Rota: `/chat/:clientId/:sessionId`
- Componente: `PublicClientChat.jsx`
- Funcionamento: Qualquer um com link pode acessar
- **Status:** ✅ Mantém como está

**Sistema 2: Acesso Autenticado (Novo)**
- Rota: `/apexia` ou `/apexia/:sessionId`
- Componente: `ApexIAAuthenticated.jsx`
- Funcionamento: Cliente precisa fazer login
- **Status:** 🆕 Novo recurso

### 🎯 Quando Usar Cada Um?

#### Use Acesso Público (`/chat/:clientId`) quando:
- ✅ Quer compartilhar link rápido (WhatsApp, Email)
- ✅ Cliente prefere não fazer login
- ✅ Acesso rápido e simples
- ✅ Links já compartilhados continuam funcionando

#### Use Acesso Autenticado (`/apexia`) quando:
- ✅ Quer mais segurança e controle
- ✅ Cliente precisa acessar métricas futuras
- ✅ Quer histórico vinculado ao usuário
- ✅ Planeja evoluir para dashboard completo

### 🔗 Compartilhamento de Dados

**Importante:** Ambos os sistemas compartilham:
- ✅ Mesmas sessões de chat
- ✅ Mesmas mensagens
- ✅ Mesmos dados do cliente
- ✅ Mesmas configurações do ApexIA

**Exemplo prático:**
```
Cliente conversa em /chat/abc123/session1 (público)
     ↓
Cliente faz login e acessa /apexia
     ↓
Vê a mesma conversa session1 automaticamente
```

**Conclusão:** Não é necessário migrar clientes. Ambos funcionam simultaneamente e acessam os mesmos dados.

---

## 📝 Checklist de Implementação

### Fase 1: Estrutura de Dados
- [ ] Adicionar `cliente_id` em `profiles`
- [ ] Atualizar `role` em `profiles` (adicionar 'cliente')
- [ ] Criar tabela `cliente_user_access` (opcional)
- [ ] Criar/atualizar RLS policies

### Fase 2: Autenticação
- [ ] Criar componente `ClientLogin.jsx`
- [ ] Criar `ProtectedClientRoute.jsx`
- [ ] Atualizar `SupabaseAuthContext` (detectar tipo de usuário)

### Fase 3: Interface Cliente
- [ ] Criar tela `/apexia` (ApexIA autenticado)
- [ ] Componente `ApexIAAuthenticated.jsx` (baseado em `PublicClientChat.jsx`)
- [ ] Adaptar para buscar `clientId` do `profile` ao invés da URL
- [ ] **Manter `PublicClientChat.jsx` funcionando** (acesso público via link)
- [ ] Garantir que ambos compartilham os mesmos dados

### Fase 4: Gerenciamento (Painel Admin)
- [ ] Botão "Criar login" em `Clients.jsx`
- [ ] Formulário para criar usuário cliente
- [ ] Listagem de usuários vinculados ao cliente
- [ ] Opção para resetar senha

### Fase 5: Testes e Migração
- [ ] Testar login de cliente
- [ ] Testar RLS policies
- [ ] Migrar clientes existentes (se necessário)
- [ ] Documentar processo

---

## 🎨 Considerações de UX

### Experiência do Cliente

**Login:**
- Processo simples (email + senha)
- Recuperação de senha automática (via email)
- Não precisa memorizar `clientId` na URL

**Acesso ao ApexIA:**
- Direto, sem necessidade de URL específica
- Histórico de conversas sempre disponível
- Sessão persistente (Supabase Auth gerencia)

### Experiência do Admin

**Criação de Login:**
- Processo simples no painel de clientes
- Geração automática de senha (opcional)
- Compartilhamento de credenciais (email manual ou automático)

---

## 🔮 Evolução Futura

### Próximos Passos (Depois de implementar login básico)

1. **Controle de Acesso por Módulo**
   - Permitir acesso a métricas específicas
   - Controle granular via `cliente_user_access`

2. **Dashboard Cliente**
   - Métricas de campanhas Meta Ads
   - Relatórios de performance
   - Documentos compartilhados

3. **Notificações**
   - Avisos sobre novos materiais
   - Alertas de métricas

4. **Multi-Usuário por Cliente**
   - Múltiplos logins para uma mesma empresa
   - Níveis de acesso diferentes

---

## ❓ Questões para Decidir

1. **Usar tabela `cliente_user_access` ou apenas `profile.cliente_id`?**
   - ✅ **Decisão:** Se só vai ter ApexIA por enquanto, `profile.cliente_id` é suficiente
   - Se planeja controle granular, melhor criar `cliente_user_access`

2. **Manter rota pública `/chat/:clientId/:sessionId`?**
   - ✅ **Decisão:** **SIM - Manter permanentemente**
   - Cliente escolhe: link público OU login autenticado
   - Ambos coexistirão sempre

3. **Geração automática de senha?**
   - Opção 1: Admin define senha inicial
   - Opção 2: Sistema gera senha aleatória e envia por email
   - Opção 3: Cliente define senha no primeiro acesso (link único)

4. **Um cliente pode ter múltiplos usuários?**
   - Por enquanto: 1 usuário = 1 cliente
   - Futuro: múltiplos usuários por cliente

---

## 📚 Referências Técnicas

- **Supabase Auth Docs:** https://supabase.com/docs/guides/auth
- **RLS Policies:** https://supabase.com/docs/guides/auth/row-level-security
- **Componente atual de Login:** `src/components/auth/Login.jsx`
- **Componente atual de ApexIA:** `src/components/pages/PublicClientChat.jsx`
- **Context de Auth:** `src/contexts/SupabaseAuthContext.jsx`

---

## 🎯 Resumo Executivo

**O que fazer:**
1. Usar Supabase Auth para criar usuários clientes (não criar sistema customizado)
2. Adicionar `cliente_id` em `profiles` para vincular usuário a cliente
3. **Manter rota pública `/chat/:clientId` funcionando** (acesso via link)
4. Criar rota protegida `/apexia` para ApexIA autenticado (opcional para clientes)
5. Implementar RLS policies para segurança (proteção adicional para acesso autenticado)
6. Criar interface de login específica para clientes (opcional)

**Benefícios:**
- ✅ Segurança robusta (Supabase Auth)
- ✅ Reaproveita infraestrutura existente
- ✅ Facilita evolução futura (controle de acesso granular)
- ✅ Melhor UX (cliente não precisa de URL com `clientId`)

**Complexidade:** Média (2-3 dias de desenvolvimento)

---

**Status:** ✅ Análise Completa - Pronto para implementação
