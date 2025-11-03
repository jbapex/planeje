# 🔐 Instruções para Configurar o Supabase Vault

## Opção 1: Usar Supabase Vault (Recomendado)

### Passo 1: Acessar o Supabase Dashboard
1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto

### Passo 2: Habilitar Vault (se necessário)
1. Vá em **Database** → **Vault**
2. Certifique-se de que o Vault está habilitado

### Passo 3: Executar o SQL
1. Vá em **SQL Editor** no menu lateral
2. Clique em **New Query**
3. Copie e cole o conteúdo do arquivo `supabase_functions.sql`
4. Clique em **Run** para executar

### Passo 4: Testar
Depois de executar o SQL, você pode testar salvando uma chave nas Configurações do sistema.

---

## Opção 2: Usar Tabela Simples (Alternativa)

Se o Supabase Vault não estiver disponível no seu plano:

1. Acesse o **SQL Editor** no Supabase
2. Execute o arquivo `supabase_functions_alternative.sql`
3. Isso criará uma tabela simples para armazenar os secrets

**⚠️ Atenção**: A versão alternativa usa hash simples. Para produção, você precisará implementar criptografia adequada.

---

## Verificando se Funcionou

Depois de executar o SQL:

1. Vá em **Database** → **Functions**
2. Você deve ver duas funções:
   - `get_encrypted_secret`
   - `set_encrypted_secret`

3. Teste salvando uma chave API nas Configurações do sistema
4. Verifique se a chave é salva corretamente

---

## Solução de Problemas

### Erro: "relation vault.secrets does not exist"
- O Vault pode não estar habilitado no seu projeto
- Use a **Opção 2** (tabela alternativa)

### Erro: "permission denied"
- Verifique se você tem permissões de superadmin
- Execute o SQL como usuário com privilégios adequados

### A função não aparece
- Atualize a página do Supabase Dashboard
- Verifique se o SQL foi executado sem erros

---

## Próximos Passos

Após configurar as funções:
1. Teste salvando uma chave API nas Configurações
2. Teste usando qualquer funcionalidade de IA no sistema
3. A chave agora será armazenada com segurança no Supabase Vault! 🔒

