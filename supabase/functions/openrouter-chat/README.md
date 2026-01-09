# OpenRouter Chat Edge Function

Edge Function para usar OpenRouter como API de LLM no Assistente de Projetos.

## Configuração

### 1. Obter API Key do OpenRouter

1. Acesse https://openrouter.ai/
2. Crie uma conta ou faça login
3. Vá em "Keys" e gere uma nova API key
4. Copie a chave gerada

### 2. Configurar no Supabase

#### Opção 1: Variável de Ambiente (Recomendado)

1. Acesse o Dashboard do Supabase
2. Vá em **Edge Functions** → **Settings** → **Secrets**
3. Adicione uma nova secret:
   - **Name**: `OPENROUTER_API_KEY`
   - **Value**: Sua chave do OpenRouter

#### Opção 2: Tabela app_secrets

Se preferir usar a tabela `app_secrets`, insira a chave lá com o nome `OPENROUTER_API_KEY`.

## Modelos Disponíveis

O OpenRouter oferece acesso a múltiplos modelos. Alguns exemplos:

- `openai/gpt-4o` - GPT-4o da OpenAI
- `openai/gpt-4-turbo` - GPT-4 Turbo
- `openai/gpt-3.5-turbo` - GPT-3.5 Turbo
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `google/gemini-pro-1.5` - Gemini Pro 1.5
- `meta-llama/llama-3.1-70b-instruct` - Llama 3.1 70B

Veja todos os modelos disponíveis em: https://openrouter.ai/models

## Uso

A função aceita os mesmos parâmetros da API OpenAI:

```javascript
const { data, error } = await supabase.functions.invoke('openrouter-chat', {
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'Você é um assistente útil.' },
      { role: 'user', content: 'Olá!' }
    ],
    model: 'openai/gpt-4o', // ou outro modelo do OpenRouter
    stream: true, // ou false
    temperature: 0.7, // opcional
    max_tokens: 1000, // opcional
  }),
});
```

## Deploy

```bash
supabase functions deploy openrouter-chat
```

## Vantagens do OpenRouter

- ✅ Acesso a múltiplos modelos de LLM em uma única API
- ✅ Preços competitivos
- ✅ Sem necessidade de múltiplas contas
- ✅ API compatível com OpenAI
- ✅ Fácil troca de modelos

