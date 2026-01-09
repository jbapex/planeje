# Guia de Configuração do OpenRouter

## O que é OpenRouter?

OpenRouter é uma plataforma que oferece acesso unificado a múltiplos modelos de LLM (Large Language Models) através de uma única API. Isso permite usar modelos da OpenAI, Anthropic, Google, Meta e outros sem precisar de múltiplas contas.

## Passo a Passo para Configurar

### 1. Criar Conta no OpenRouter

1. Acesse https://openrouter.ai/
2. Clique em "Sign Up" ou "Login"
3. Crie sua conta (pode usar GitHub, Google, etc.)
4. Confirme seu email se necessário

### 2. Gerar API Key

1. Após fazer login, vá em **Keys** no menu
2. Clique em **Create Key**
3. Dê um nome para a chave (ex: "JB APEX - Assistente de Projetos")
4. Copie a chave gerada (ela só aparece uma vez!)

### 3. Configurar no Supabase

#### Método Recomendado: Variável de Ambiente

1. Acesse o Dashboard do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions** no menu lateral
4. Clique em **Settings**
5. Role até a seção **Secrets**
6. Clique em **Add new secret**
7. Preencha:
   - **Name**: `OPENROUTER_API_KEY`
   - **Value**: Cole a chave que você copiou do OpenRouter
8. Clique em **Save**

### 4. Fazer Deploy da Edge Function

No terminal, execute:

```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje
supabase functions deploy openrouter-chat
```

Se ainda não tiver o Supabase CLI instalado:

```bash
# Instalar Supabase CLI (macOS)
brew install supabase/tap/supabase

# Ou via npm
npm install -g supabase
```

### 5. Verificar se Funcionou

1. Acesse o Assistente de Projetos no sistema
2. Tente fazer uma pergunta no Chat Geral ou Chat de Cliente
3. Se funcionar, está configurado corretamente!

## Modelos Disponíveis

O OpenRouter oferece acesso a diversos modelos. Alguns exemplos:

### OpenAI
- `openai/gpt-4o` - GPT-4o (recomendado)
- `openai/gpt-4-turbo` - GPT-4 Turbo
- `openai/gpt-3.5-turbo` - GPT-3.5 Turbo (mais barato)

### Anthropic (Claude)
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `anthropic/claude-3-opus` - Claude 3 Opus

### Google
- `google/gemini-pro-1.5` - Gemini Pro 1.5
- `google/gemini-flash-1.5` - Gemini Flash (mais rápido)

### Meta (Llama)
- `meta-llama/llama-3.1-70b-instruct` - Llama 3.1 70B
- `meta-llama/llama-3.1-8b-instruct` - Llama 3.1 8B

Veja todos os modelos e preços em: https://openrouter.ai/models

## Vantagens do OpenRouter

✅ **Múltiplos Modelos**: Acesso a modelos de diferentes provedores  
✅ **Preços Competitivos**: Compare preços entre modelos  
✅ **Uma Única API**: Não precisa gerenciar múltiplas contas  
✅ **Compatível com OpenAI**: Mesma estrutura de API  
✅ **Fácil Troca**: Mude de modelo sem alterar código  

## Troubleshooting

### Erro: "Could not retrieve OpenRouter API key"

- Verifique se a secret `OPENROUTER_API_KEY` foi adicionada no Supabase
- Confirme que o nome está exatamente como `OPENROUTER_API_KEY`
- Tente fazer deploy novamente da função

### Erro: "Chave de API do OpenRouter inválida"

- Verifique se copiou a chave completa
- Confirme que não há espaços extras no início/fim
- Gere uma nova chave no OpenRouter se necessário

### Erro: "Limite de requisições excedido"

- Verifique seus créditos no OpenRouter
- Adicione créditos se necessário
- Considere usar um modelo mais barato temporariamente

## Suporte

- Documentação OpenRouter: https://openrouter.ai/docs
- Dashboard OpenRouter: https://openrouter.ai/keys
- Lista de Modelos: https://openrouter.ai/models

