# Guia: Gerar Imagens via OpenRouter no Assistente de Projetos

## 🎨 Funcionalidade

Agora é possível gerar imagens diretamente pelo chat do Assistente de Projetos usando modelos de geração de imagem disponíveis no OpenRouter, como:
- **Flux Pro** (`black-forest-labs/flux-pro`)
- **Flux Schnell** (`black-forest-labs/flux-schnell`)
- **DALL-E 3** (`openai/dall-e-3`)
- **DALL-E 2** (`openai/dall-e-2`)
- **Stable Diffusion XL** (`stability-ai/stable-diffusion-xl`)
- E outros modelos de imagem disponíveis no OpenRouter

## 🚀 Como Usar

### 1. Selecionar um Modelo de Imagem

1. No chat do Assistente de Projetos (Cliente Específico ou Chat Geral)
2. Clique no seletor de modelos no cabeçalho
3. Escolha um modelo de geração de imagem (ex: `black-forest-labs/flux-pro`)

### 2. Gerar Imagem

1. Digite o prompt descrevendo a imagem que deseja gerar
2. (Opcional) Anexe uma imagem de referência usando o botão da câmera
3. Pressione Enter ou clique em Enviar
4. A imagem será gerada automaticamente usando o modelo selecionado

### 3. Exemplo de Uso

**Prompt de texto:**
```
Crie uma imagem de um robô futurista em uma cidade cyberpunk
```

**Com imagem de referência:**
1. Clique no botão da câmera
2. Selecione ou tire uma foto
3. Digite o prompt (ex: "Transforme esta imagem em estilo anime")
4. Envie

## 📋 Requisitos

### 1. Edge Function Deployada

A Edge Function `openrouter-image-generation` precisa estar deployada no Supabase:

**Via Dashboard:**
1. Acesse o Dashboard do Supabase
2. Vá em **Edge Functions**
3. Clique em **Create Function**
4. Nome: `openrouter-image-generation`
5. Cole o conteúdo de `supabase/functions/openrouter-image-generation/index.ts`
6. Clique em **Deploy**

**Via CLI (se o projeto estiver linkado):**
```bash
supabase functions deploy openrouter-image-generation
```

### 2. API Key do OpenRouter Configurada

A mesma `OPENROUTER_API_KEY` usada para o chat já funciona para geração de imagens. Verifique se está configurada nas secrets da Edge Function.

## 🔧 Como Funciona

1. **Detecção Automática**: O sistema detecta automaticamente quando um modelo de imagem é selecionado
2. **Geração**: Quando você envia uma mensagem com um modelo de imagem selecionado, em vez de gerar texto, o sistema gera uma imagem
3. **Exibição**: A imagem gerada aparece no chat junto com o prompt usado

## 🎯 Modelos Suportados

O sistema detecta automaticamente modelos de imagem baseado em padrões no nome:
- `flux` - Modelos Flux (Black Forest Labs)
- `dall-e` ou `dalle` - Modelos DALL-E da OpenAI
- `stable-diffusion` - Modelos Stable Diffusion
- `imagen` - Modelos Imagen do Google
- `midjourney` - Modelos Midjourney
- E outros modelos de imagem disponíveis no OpenRouter

## 💡 Dicas

1. **Modelos Diferentes**: Experimente diferentes modelos para diferentes estilos
   - Flux Pro: Alta qualidade, mais detalhado
   - Flux Schnell: Mais rápido, boa qualidade
   - DALL-E 3: Excelente para prompts descritivos

2. **Prompts Detalhados**: Quanto mais detalhado o prompt, melhor o resultado

3. **Imagem de Referência**: Use imagens de referência para transformar ou modificar imagens existentes

4. **Mudança de Modelo**: Você pode mudar o modelo a qualquer momento durante a conversa

## ⚠️ Observações

- A geração de imagem pode levar alguns segundos
- Alguns modelos podem ter limites de uso ou custos diferentes
- Imagens geradas são salvas no histórico da conversa
- Você pode continuar a conversa normalmente após gerar uma imagem

## 🐛 Troubleshooting

**Erro: "OpenRouter API key não encontrada"**
- Verifique se `OPENROUTER_API_KEY` está configurada nas secrets da Edge Function

**Erro: "Não foi possível gerar a imagem"**
- Verifique se o modelo selecionado é realmente um modelo de imagem
- Alguns modelos podem não estar disponíveis ou ter limites de uso

**Imagem não aparece**
- Verifique o console do navegador para erros
- Certifique-se de que a Edge Function está deployada corretamente

