# Guia de Configuração - Busca Automática no Google para Gemini

## O que foi implementado:

Quando você seleciona um modelo Gemini (Google), o sistema automaticamente:
- Detecta se a mensagem precisa de busca na web
- Faz busca no Google usando Google Custom Search API
- Adiciona os resultados ao contexto do modelo
- O modelo usa essas informações para dar respostas mais atualizadas

## Como Configurar:

### 1. Criar Google Custom Search Engine

1. Acesse https://programmablesearchengine.google.com/
2. Clique em "Add" para criar um novo motor de busca
3. Configure:
   - **Sites para pesquisar**: Selecione "Search the entire web" ou sites específicos
   - **Nome do motor de busca**: Ex: "JB APEX - Assistente"
4. Clique em "Create"
5. Anote o **Search Engine ID (CX)** que aparece na página

### 2. Obter Google API Key

1. Acesse https://console.cloud.google.com/
2. Crie um novo projeto ou selecione um existente
3. Vá em **APIs & Services** → **Library**
4. Procure por "Custom Search API"
5. Clique em "Enable"
6. Vá em **APIs & Services** → **Credentials**
7. Clique em "Create Credentials" → "API Key"
8. Copie a chave gerada
9. (Opcional) Restrinja a chave para usar apenas Custom Search API

### 3. Configurar no Supabase

1. Acesse o Dashboard do Supabase
2. Vá em **Edge Functions** → **Settings** → **Secrets**
3. Adicione duas secrets:

   **Secret 1:**
   - **Name**: `GOOGLE_API_KEY`
   - **Value**: Sua Google API Key

   **Secret 2:**
   - **Name**: `GOOGLE_CX`
   - **Value**: Seu Search Engine ID (CX)

### 4. Fazer Deploy da Edge Function

No terminal, execute:

```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje
supabase functions deploy google-search
```

## Como Funciona:

### Detecção Automática

O sistema detecta automaticamente quando fazer busca baseado em palavras-chave:

- **Palavras-chave**: pesquisar, buscar, procurar, encontrar, qual é, o que é, etc.
- **Perguntas**: mensagens que começam com "qual", "quem", "onde", "quando", "como", "por que"
- **Informações atualizadas**: "últimas notícias", "tendências", "estatísticas", etc.

### Exemplos:

**Mensagem que aciona busca:**
- "Qual é a melhor estratégia de marketing digital em 2024?"
- "Pesquise sobre tendências de redes sociais"
- "O que é ROAS e como calcular?"

**Mensagem que NÃO aciona busca:**
- "Criar um projeto para o cliente X"
- "Analisar dados do cliente Y"
- "Gerar legenda para post"

## Limites e Custos:

- **Google Custom Search API**: 100 buscas gratuitas por dia
- **Após o limite**: $5 por 1.000 buscas adicionais
- O sistema faz no máximo 5 buscas por mensagem

## Troubleshooting:

### Erro: "Google API Key ou Custom Search Engine ID não configurados"

- Verifique se as secrets `GOOGLE_API_KEY` e `GOOGLE_CX` foram adicionadas no Supabase
- Confirme que os nomes estão exatamente como mostrado (case-sensitive)

### Erro: "Erro ao buscar no Google"

- Verifique se a Custom Search API está habilitada no Google Cloud Console
- Confirme que a API Key tem permissão para usar Custom Search API
- Verifique se o Search Engine ID (CX) está correto

### Busca não está sendo feita

- Verifique se o modelo selecionado é Gemini (google/gemini-*)
- Verifique se a mensagem contém palavras-chave que acionam a busca
- Veja o console do navegador para logs de debug

## Desabilitar Busca Automática:

Se não quiser usar busca automática, simplesmente não configure as secrets `GOOGLE_API_KEY` e `GOOGLE_CX`. O sistema funcionará normalmente sem busca.

## Vantagens:

✅ **Respostas Atualizadas**: Informações recentes da web  
✅ **Dados Reais**: Estatísticas e fatos atualizados  
✅ **Fontes Confiáveis**: Links para verificação  
✅ **Automático**: Funciona sem intervenção do usuário  
✅ **Inteligente**: Só busca quando necessário  

