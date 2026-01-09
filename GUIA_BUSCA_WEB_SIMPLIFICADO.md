# ✅ Busca Automática na Web - Configuração Simplificada

## Boa Notícia! 🎉

**Você NÃO precisa configurar Google API Key!** 

O sistema agora usa **DuckDuckGo** como padrão, que é **100% gratuito e não requer API key**.

## Como Funciona:

### Opção 1: DuckDuckGo (Padrão - Sem Configuração)
- ✅ **Gratuito** - Sem limites
- ✅ **Sem API Key** - Funciona imediatamente
- ✅ **Privacidade** - Não rastreia usuários
- ✅ **Automático** - Já está configurado

### Opção 2: Google Search (Opcional - Melhor Qualidade)
Se quiser usar Google Search (melhor qualidade, mas requer configuração):
- Configure `GOOGLE_API_KEY` e `GOOGLE_CX` no Supabase
- O sistema automaticamente usa Google quando disponível
- Se não configurado, usa DuckDuckGo automaticamente

## Deploy Necessário:

Apenas faça deploy da função DuckDuckGo:

```bash
supabase functions deploy duckduckgo-search
```

**Pronto!** A busca automática já funciona sem nenhuma configuração adicional.

## Como Usar:

1. Selecione um modelo Gemini (ex: `google/gemini-pro-1.5`)
2. Faça uma pergunta que precise de busca (ex: "Qual é a melhor estratégia de marketing em 2024?")
3. O sistema busca automaticamente e enriquece a resposta

## Vantagens do DuckDuckGo:

✅ **Zero Configuração** - Funciona imediatamente  
✅ **Gratuito** - Sem limites ou custos  
✅ **Privacidade** - Não coleta dados pessoais  
✅ **Automático** - Fallback quando Google não está configurado  

## Quando Usar Google Search:

Use Google Search se:
- Precisar de mais de 100 buscas por dia
- Quiser resultados mais refinados
- Precisar de busca em sites específicos

Mas para a maioria dos casos, **DuckDuckGo é suficiente e mais simples!**

