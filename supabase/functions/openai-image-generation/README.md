# Edge Function: openai-image-generation

Esta Edge Function gera imagens usando DALL-E 3 da OpenAI.

## 🚀 Como Deployar

### Via Supabase CLI:

```bash
supabase functions deploy openai-image-generation
```

### Via Dashboard:

1. Vá para **Edge Functions** no Dashboard do Supabase
2. Clique em **Create Function**
3. Nome: `openai-image-generation`
4. Cole o conteúdo de `index.ts`
5. Clique em **Deploy**

## 📋 Requisitos

- A mesma `OPENAI_API_KEY` já configurada para o `openai-chat`
- A função usa a mesma infraestrutura de busca de API key

## 🎯 Uso

### Request Body:

```json
{
  "prompt": "Um gato astronauta flutuando no espaço",
  "size": "1024x1024",        // Opcional: "1024x1024", "1792x1024", "1024x1792"
  "quality": "standard",      // Opcional: "standard" ou "hd"
  "style": "vivid"            // Opcional: "vivid" ou "natural"
}
```

### Response:

```json
{
  "success": true,
  "imageUrl": "https://...",
  "revisedPrompt": "Prompt revisado pelo DALL-E 3"
}
```

## ⚙️ Parâmetros

- **prompt** (obrigatório): Descrição da imagem desejada
- **size** (opcional): Tamanho da imagem (padrão: "1024x1024")
- **quality** (opcional): Qualidade da imagem (padrão: "standard")
- **style** (opcional): Estilo da imagem (padrão: "vivid")

## 🔒 Segurança

- A API key nunca é exposta ao cliente
- Usa a mesma infraestrutura segura do `openai-chat`

