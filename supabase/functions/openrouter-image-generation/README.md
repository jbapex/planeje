# Edge Function: openrouter-image-generation

Esta Edge Function permite gerar imagens usando modelos de geração de imagem disponíveis no OpenRouter.

## 🚀 Deploy

### Via Dashboard do Supabase:

1. Acesse o Dashboard do Supabase
2. Vá em **Edge Functions**
3. Clique em **Create Function**
4. Nome: `openrouter-image-generation`
5. Cole o conteúdo de `index.ts`
6. Clique em **Deploy**

### Via CLI (se o projeto estiver linkado):

```bash
supabase functions deploy openrouter-image-generation
```

## 🔑 Configuração

### Secrets Necessárias:

- `OPENROUTER_API_KEY`: Chave de API do OpenRouter (mesma usada para o chat)

**Como configurar:**
1. Dashboard do Supabase → Edge Functions → Settings → Secrets
2. Adicione `OPENROUTER_API_KEY` com sua chave do OpenRouter

## 📋 Uso

### Request Body:

```json
{
  "prompt": "Uma imagem de um robô futurista",
  "model": "black-forest-labs/flux-pro",
  "width": 1024,
  "height": 1024,
  "n": 1,
  "quality": "standard",
  "imageBase64": "base64_string_here", // Opcional, para img2img
  "strength": 0.7 // Opcional, para img2img
}
```

### Response:

```json
{
  "success": true,
  "imageUrl": "https://...",
  "model": "black-forest-labs/flux-pro",
  "prompt": "Uma imagem de um robô futurista"
}
```

## ⚠️ Nota Importante

**A API do OpenRouter pode não ter um endpoint específico `/api/v1/images/generations`.**

Se você receber erros ao usar esta função, pode ser necessário:

1. **Verificar a documentação oficial do OpenRouter** para o endpoint correto de geração de imagens
2. **Usar modelos de imagem através do endpoint de chat** (`/api/v1/chat/completions`) com um formato específico
3. **Usar APIs diretas** dos provedores (ex: OpenAI DALL-E, Stability AI, etc.)

### Alternativa: Usar Runware

Se a API do OpenRouter não suportar geração de imagem diretamente, você pode continuar usando o Runware através da função `runware-image-generation` que já está implementada.

## 🔧 Modelos Suportados

Modelos de imagem populares no OpenRouter:
- `black-forest-labs/flux-pro`
- `black-forest-labs/flux-schnell`
- `openai/dall-e-3`
- `openai/dall-e-2`
- `stability-ai/stable-diffusion-xl`
- E outros modelos de imagem disponíveis

## 🐛 Troubleshooting

**Erro 404 ou "endpoint não encontrado"**
- O OpenRouter pode não ter este endpoint. Verifique a documentação oficial.

**Erro 401/403**
- Verifique se `OPENROUTER_API_KEY` está configurada corretamente.

**Erro 400**
- Verifique se o modelo selecionado é realmente um modelo de geração de imagem.
- Alguns modelos podem ter parâmetros diferentes.

