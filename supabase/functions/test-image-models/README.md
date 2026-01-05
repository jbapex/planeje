# Edge Function: test-image-models

Esta Edge Function testa quais modelos de geração de imagem estão disponíveis na sua conta OpenAI.

## 🚀 Como Deployar

### Via Supabase CLI:

```bash
supabase functions deploy test-image-models
```

### Via Dashboard:

1. Vá para **Edge Functions** no Dashboard do Supabase
2. Clique em **Create Function**
3. Nome: `test-image-models`
4. Cole o conteúdo de `index.ts`
5. Clique em **Deploy**

## 🧪 Como Testar

Após fazer o deploy:

1. Acesse: `http://localhost:3003/#/test-image-models` (ou sua URL de produção)
2. Clique em **"Testar Modelos Disponíveis"**
3. Aguarde alguns segundos
4. Veja quais modelos estão disponíveis:
   - ✅ DALL-E 3
   - ✅ DALL-E 2
   - ✅ GPT-Image-1
   - ✅ GPT-Image-1.5

## 📋 Requisitos

- A mesma `OPENAI_API_KEY` já configurada para o `openai-chat`
- A função usa a mesma infraestrutura de busca de API key

## 🎯 Resultado Esperado

A função retorna:
- Quais modelos estão disponíveis
- URLs de imagens de teste geradas (se disponível)
- Erros específicos para modelos não disponíveis

