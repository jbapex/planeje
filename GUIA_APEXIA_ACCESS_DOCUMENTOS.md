# 🔐 Guia: Controle de Acesso do ApexIA aos Documentos

## 📋 Visão Geral

Agora você pode controlar quais documentos do cliente o ApexIA pode acessar durante o chat. Cada documento tem uma chave/toggle que permite ou bloqueia o acesso do ApexIA.

---

## ✅ O Que Foi Implementado

### 1. **Campo no Banco de Dados**
- Adicionado campo `apexia_access` (boolean) na tabela `client_documents`
- Por padrão, novos documentos **não têm acesso** (`false`)
- Você pode ativar/desativar o acesso individualmente para cada documento

### 2. **Interface Visual**
- **Toggle/Chave** ao lado de cada documento na lista
- **Ícone de Bot (🤖)** indica visualmente o status do acesso
- **Cor azul** quando ativado, **cinza** quando desativado
- **Tooltip** explicativo ao passar o mouse

### 3. **Integração com ApexIA**
- O ApexIA busca automaticamente documentos com `apexia_access = true`
- Documentos permitidos são incluídos no contexto do chat
- Cada documento aparece com título e conteúdo completo (limitado a 2000 caracteres por documento)

---

## 🚀 Como Usar

### Passo 1: Executar a Migration SQL

Execute o arquivo `ADICIONAR_APEXIA_ACCESS_DOCUMENTOS.sql` no Supabase:

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Cole o conteúdo do arquivo `ADICIONAR_APEXIA_ACCESS_DOCUMENTOS.sql`
4. Clique em **Run**

### Passo 2: Ativar Acesso em Documentos Existentes

Se você já tem documentos e quer dar acesso ao ApexIA:

```sql
-- Ativar acesso para TODOS os documentos existentes
UPDATE client_documents 
SET apexia_access = true;

-- OU ativar apenas para documentos específicos
UPDATE client_documents 
SET apexia_access = true 
WHERE id = 'id-do-documento-aqui';
```

### Passo 3: Usar a Interface

1. **Acesse os Documentos do Cliente:**
   - Vá em **Projetos** → Selecione um projeto → Aba **Documentos**

2. **Ativar/Desativar Acesso:**
   - Na lista de documentos, você verá um **toggle** com ícone de bot 🤖
   - Clique no toggle para ativar/desativar o acesso do ApexIA
   - Uma notificação confirma a alteração

3. **Verificar Status:**
   - **Toggle azul** = ApexIA tem acesso ✅
   - **Toggle cinza** = ApexIA não tem acesso ❌

---

## 🎯 Como Funciona no Chat do ApexIA

Quando um cliente conversa com o ApexIA:

1. O sistema busca automaticamente documentos com `apexia_access = true`
2. Esses documentos são incluídos no contexto do chat
3. O ApexIA pode usar essas informações para responder perguntas do cliente
4. Cada documento aparece com seu título e conteúdo

**Exemplo de como aparece no contexto:**
```
📄 DOCUMENTOS DISPONÍVEIS PARA O APEXIA:

Documento 1: Informações da Empresa
[conteúdo do documento aqui...]

Documento 2: Políticas e Procedimentos
[conteúdo do documento aqui...]
```

---

## 🔒 Segurança e Privacidade

- **Por padrão, documentos NÃO têm acesso** - você precisa ativar manualmente
- **Controle granular** - cada documento pode ser controlado individualmente
- **Apenas documentos permitidos** são incluídos no contexto do chat
- **Conteúdo limitado** - cada documento é limitado a 2000 caracteres no contexto para não exceder limites da API

---

## 📝 Exemplos de Uso

### Cenário 1: Documentos Públicos
- ✅ **Ativar acesso** para documentos que o cliente pode consultar via chat
- Exemplos: Políticas, FAQ, Informações da empresa

### Cenário 2: Documentos Privados
- ❌ **Manter desativado** para documentos internos ou confidenciais
- Exemplos: Contratos, Negociações, Dados sensíveis

### Cenário 3: Documentos Temporários
- Você pode **ativar temporariamente** para uma campanha específica
- Depois **desativar** quando não precisar mais

---

## 🐛 Troubleshooting

### Problema: Toggle não aparece
**Solução:** Verifique se a migration SQL foi executada corretamente.

### Problema: ApexIA não está vendo os documentos
**Solução:** 
1. Verifique se o toggle está **ativado** (azul)
2. Verifique se o documento tem conteúdo
3. Verifique se o campo `client_data_access.client_documents` não está bloqueado nas configurações de personalidade

### Problema: Erro ao salvar toggle
**Solução:** Verifique se você tem permissão para editar documentos do cliente.

---

## 📊 Estrutura Técnica

### Banco de Dados
```sql
client_documents
├── id (uuid)
├── client_id (uuid)
├── title (text)
├── content (jsonb)
├── apexia_access (boolean) ← NOVO CAMPO
├── created_at (timestamp)
└── updated_at (timestamp)
```

### Componentes Modificados
- `src/components/projects/ProjectDocuments.jsx` - Interface com toggle
- `src/components/pages/PublicClientChat.jsx` - Busca e inclusão no contexto

---

## ✅ Checklist de Implementação

- [x] Migration SQL criada
- [x] Campo `apexia_access` adicionado
- [x] Toggle visual implementado
- [x] Função de atualização criada
- [x] Integração com ApexIA implementada
- [x] Documentação criada

---

## 🎉 Pronto para Usar!

Agora você tem controle total sobre quais documentos o ApexIA pode acessar. Use essa funcionalidade para personalizar a experiência do cliente e garantir que apenas informações relevantes sejam compartilhadas!

