# MCP: páginas grandes e eventos Chatvolt — 30/10/2026

**Atualização:** versão2.9.2 publicada e verificada às15h32. A [referência produtiva](mcp-lotes-eventos-producao-2026-10-30.md) substitui as pendências de publicação abaixo; o restante preserva o estado local original.

Implementação local autorizada por “vamos fazer isso”. **Não publicado; produção segue 2.9.1.** Candidata privada na VPS `/root/planeje-releases/mcp-lotes-20261030-01/candidate`, sem ativação.

## Correções

O índice temporal antes enviava até 500 UUIDs em uma requisição ao log/inbox: URI de19.897 caracteres foi recusada com414, e120 também falhou com502. O leitor agora recupera as chaves em lotes internos de25, com continuação por data/ID caso o banco imponha cap menor. O limite de página solicitado permanece até500; não há teto total nem corte de texto. Falha de qualquer sublote continua erro, sem conclusão falsa.

`AGENT_USER_MESSAGE` com `isAiEnabled=false` e `agentResponse` exatamente `#ai-disabled` não gera fala da equipe. Entrada/anexos legítimos são preservados e áudio é identificado pelo MIME, mesmo com `type=text` armazenado. Texto que apenas cita o marcador não é removido. O log e mensagens originais não são alterados.

`contexto_chatvolt` expõe evento, IA habilitada, agente, responsável atribuído e controle reconhecido, usando somente campos selecionados. Responsável não prova autoria de cada envio. Resposta padrão AGENT_USER_MESSAGE com IA habilitada pode comprovar automação; os demais casos sem evidência suficiente permanecem não identificados. Contexto também é recuperado da evidência correspondente quando a linha canônica enviada não tem payload. Contextos divergentes são marcados ambíguos.

Anexos de evento combinado cuja fala de origem não é comprovada ficam em `anexos_nao_atribuidos`, sem criar áudio fictício da equipe; expurgo também limpa esses anexos. Horário ausente continua declarado como registro. Esta entrega não transcreve arquivos nem consulta API autenticada do Chatvolt.

## Validação

- 107 testes MCP, incluindo50mil mensagens, URI curta,120/500, cap menor da origem, duplicatas/retries, falha intermediária e conflito de autoria. Typecheck e lint dirigido sem erros; lint tipado com11avisos preexistentes.
- Na candidata com dados reais e transporte somenteGET, páginas30/60/120/500 passaram sem falhas.120:75 mensagens/120 examinados em617ms;500:336/500 em1921ms. Valores são medições de uma execução, não SLA.
- Caso indicado: nove mensagens conciliadas, dois áudios recebidos, zero falsas respostas de controle; contexto de agente/responsável presente nas nove.
- Evidências privadas sem conteúdo de cliente: `.local/mcp-lotes-20261030/probe.log`, `case.json`, `tests.log` e `baseline/`. Revisão do implementador: `/Users/josiasbonfimdefaria/.codex/reviews/planeje-mcp-lotes-eventos-20261030.md`.

## Publicação e limites

Publicar somente após autorização específica desta correção, reconciliando fontes produtivas e repetindo a conferência da candidata. Sem migração ou reinício de Edge necessário: somente leitor MCP e seus testes mudam. Não usar esta entrega como prova de auditoria/planilha concluída.

Os502 originais não tiveram causa interna confirmada; o414 por URI longa foi comprovado e a candidata passou no mesmo cenário após os lotes. Dados que o webhook nunca recebeu, transcrições inexistentes e autoria humana não comprovada continuam lacunas explícitas. Outros consumidores do evento de controle fora do MCP não foram alterados.

Referências primárias: [eventos e campos Chatvolt](https://docs.chatvolt.ai/agent/webhooks). Plano: [lotes e eventos](../../superpowers/plans/2026-10-30-mcp-lotes-eventos.md).
