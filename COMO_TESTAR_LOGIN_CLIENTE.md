# 🧪 Como Testar o Login de Cliente

## ✅ Pré-requisitos

1. **Migration SQL executada** ✅ (você já fez isso!)
2. **Sistema rodando** (`npm run dev`)

---

## 🧪 Teste 1: Criar Login de Cliente Manualmente

Como ainda não temos o painel admin, vamos criar manualmente no Supabase:

### Passo 1: Criar Usuário no Supabase Auth

1. Acesse **Supabase Dashboard** → **Authentication** → **Users**
2. Clique em **Add User** → **Create new user**
3. Preencha:
   - **Email:** `cliente@teste.com`
   - **Password:** `senha123`
   - ✅ **Auto Confirm User** (ativar)

### Passo 2: Vincular ao Cliente na Tabela `profiles`

Execute no **SQL Editor** do Supabase:

```sql
-- 1. Encontrar o ID do usuário que acabou de criar
SELECT id, email FROM auth.users WHERE email = 'cliente@teste.com';

-- 2. Encontrar o ID de um cliente existente (ou criar um novo)
SELECT id, empresa FROM clientes LIMIT 1;

-- 3. Criar/atualizar profile vinculando usuário ao cliente
-- Substitua USER_ID e CLIENTE_ID pelos valores encontrados acima
INSERT INTO profiles (id, role, cliente_id, full_name)
VALUES (
  'USER_ID_AQUI',  -- ID do usuário do auth.users
  'cliente',
  'CLIENTE_ID_AQUI',  -- ID do cliente na tabela clientes
  'Cliente Teste'
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'cliente',
  cliente_id = 'CLIENTE_ID_AQUI',
  full_name = 'Cliente Teste';
```

**Exemplo completo:**

```sql
-- Suponha que o usuário criado tem ID: 12345678-1234-1234-1234-123456789012
-- E o cliente tem ID: 87654321-4321-4321-4321-210987654321

INSERT INTO profiles (id, role, cliente_id, full_name)
VALUES (
  '12345678-1234-1234-1234-123456789012',
  'cliente',
  '87654321-4321-4321-4321-210987654321',
  'Cliente Teste'
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'cliente',
  cliente_id = '87654321-4321-4321-4321-210987654321',
  full_name = 'Cliente Teste';
```

---

## 🧪 Teste 2: Login do Cliente

1. Acesse: `http://localhost:3003/#/login-cliente`
2. Use as credenciais criadas:
   - **Email:** `cliente@teste.com`
   - **Senha:** `senha123`
3. Clique em **Entrar**
4. **Esperado:** Redirecionamento automático para `/apexia`

---

## 🧪 Teste 3: Acesso ao ApexIA Autenticado

Após fazer login:

1. **Esperado:** URL deve mudar para `/apexia` ou `/chat/:clientId`
2. **Verificar:**
   - ✅ ApexIA carrega corretamente
   - ✅ Dados do cliente aparecem
   - ✅ Conversas/sessões do cliente aparecem
   - ✅ Cliente só vê seus próprios dados (RLS funcionando)

---

## 🧪 Teste 4: Acesso Público (deve continuar funcionando)

1. **Sem login:**
   - Acesse: `http://localhost:3003/#/chat/:clientId`
   - Substitua `:clientId` pelo ID real de um cliente
   - **Esperado:** ApexIA público deve carregar normalmente

2. **Verificar:**
   - ✅ Link público continua funcionando
   - ✅ Não precisa de login
   - ✅ Mesmos dados (compartilhamento funcionando)

---

## 🔍 Verificações de Segurança (RLS)

Execute no SQL Editor para verificar se o cliente só vê seus dados:

```sql
-- Simular consulta como cliente autenticado
-- Substitua USER_ID pelo ID do usuário cliente criado

SET request.jwt.claims.sub = 'USER_ID_AQUI';

-- Tentar ver TODOS os clientes (deve retornar apenas o próprio)
SELECT id, empresa FROM clientes;

-- Tentar ver sessões de chat (deve retornar apenas do próprio cliente)
SELECT id, client_id, title FROM client_chat_sessions;

-- Tentar ver mensagens (deve retornar apenas do próprio cliente)
SELECT id, session_id, content FROM client_chat_messages LIMIT 5;
```

**Esperado:**
- ✅ Retorna apenas dados do cliente vinculado ao usuário
- ✅ Não retorna dados de outros clientes

---

## 🐛 Troubleshooting

### Problema: Login não funciona
**Solução:**
- Verifique se o usuário foi criado no Supabase Auth
- Verifique se o profile foi criado/atualizado com `role = 'cliente'`
- Verifique se `cliente_id` está preenchido no profile

### Problema: Redireciona para `/login-cliente` após login
**Solução:**
- Verifique se `profile.role = 'cliente'`
- Verifique se `profile.cliente_id` não é NULL
- Verifique console do navegador para erros

### Problema: Cliente vê dados de outros clientes
**Solução:**
- Verifique se as RLS policies foram criadas corretamente
- Execute novamente a parte das policies da migration

### Problema: RLS bloqueando tudo
**Solução:**
- Verifique se o usuário está autenticado (token válido)
- Verifique se `auth.uid()` retorna o ID correto
- Verifique se as policies permitem acesso a usuários autenticados

---

## ✅ Checklist de Testes

- [ ] Criar usuário cliente manualmente no Supabase
- [ ] Vincular profile ao cliente
- [ ] Testar login em `/login-cliente`
- [ ] Verificar redirecionamento para `/apexia`
- [ ] Verificar que ApexIA carrega corretamente
- [ ] Verificar que cliente só vê seus próprios dados
- [ ] Testar que acesso público (`/chat/:clientId`) ainda funciona
- [ ] Verificar que ambos compartilham os mesmos dados

---

## 🎯 Próximos Passos

Após validar que tudo funciona:

1. **Implementar painel admin** para criar logins automaticamente
2. **Adicionar recuperação de senha** para clientes
3. **Melhorar UX** do login de clientes
4. **Adicionar logs** para auditoria

---

**Status:** ✅ Pronto para testes!
