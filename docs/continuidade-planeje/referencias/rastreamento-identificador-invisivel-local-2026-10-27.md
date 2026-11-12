# Rastreamento por identificador invisível — entrega local

**Atualização posterior:** publicado em 27/10/2026 às13h28 e piloto Dinamac ativado às13h29, após nova autorização. O registro abaixo conserva a evidência da etapa local. [Publicação vigente](rastreamento-identificador-invisivel-producao-2026-10-27.md).

Estado em 27/10/2026: implementação local autorizada por Josias (“Sim, implementar o identificador invisível”). Sem publicação, ativação de link ou aceite produtivo. [Desenho aprovado](../../superpowers/specs/2026-10-27-invisible-click-attribution-design.md), [plano](../../superpowers/plans/2026-10-27-invisible-click-attribution.md) e [evidência/hashes finais](../evidencias/releases/rastreamento-identificador-invisivel-local-2026-10-27.json).

## Comportamento

O link já grava os parâmetros do clique. A nova identificação permite ligar a mensagem recebida a esse registro, inclusive no Chatvolt sem número empresarial identificado no payload. A associação recupera origem, cinco UTMs e gclid do clique; não deduz parâmetros pela frase nem pela proximidade de horário.

A ativação é explícita por link: acrescentar `{codigo_oculto}` ao final da mensagem inicial. O construtor remove o marcador e inclui o código interno `PJ-XXXXXX` em caracteres invisíveis. Nesse modo também remove `{codigo}` e códigos visíveis legados da frase, evitando conflito na atualização de um template. Esse modo prevalece sobre “Mostrar código de atendimento”; o formulário explica isso. Nenhum link real foi editado nesta entrega.

Sem o marcador, o código visível e a mensagem sem código conservam o comportamento anterior. O fallback por mensagem completa permanece sujeito aos filtros existentes. Modos automático, aplicativo e web usam o mesmo construtor. Nenhuma dependência, migração ou alteração de RLS foi necessária.

## Protocolo e associação

- Codec único em `supabase/functions/_shared/rastreamentoHiddenMatchCode.js`, importado pelos helpers frontend e Edge.
- Código ASCII validado por `^PJ-[A-Z0-9]{6}$`, representado por 72 bits: zero U+200C, um U+2060, com seis U+2060 em cada extremidade; total de 84 caracteres invisíveis.
- O enquadramento não pode ocorrer dentro dos bits de um código ASCII válido. A leitura exige tamanho, enquadramento e formato exatos. Uma sequência que ainda contenha enquadramento mas esteja truncada invalida a mensagem, inclusive junto de outro código completo. Códigos diferentes na mesma mensagem e conflito entre código invisível e visível são rejeitados.
- Mensagens que só contêm códigos visíveis mantêm a precedência legada do primeiro código. Emoji e invisíveis de outro formato não viram identificação Planeje.
- `claimTrackableClickMatch` e handlers permanecem com os controles existentes: mesmo cliente, claim atômico, repetição do mesmo remetente, proteção de CTWA e atribuição anterior. O código não é autenticação nem prova de identidade.

## Validação local

O teste inicial falhou porque `{codigo_oculto}` aparecia na frase. Depois da implementação, passaram:

```sh
node planeje-mcp/node_modules/tsx/dist/cli.mjs scripts/rastreamentoHiddenMatchCode.test.mjs
node scripts/miniCrmMessageWebhooks.test.mjs
node scripts/rastreamentoTrackableLink.test.mjs
node scripts/rastreamentoWhatsappInstancia.test.mjs
node scripts/rastreamentoMessageAttribution.test.mjs
node scripts/chatvoltIngress.test.mjs
node scripts/ingressMessageSources.test.mjs
npm run check
```

O novo teste atravessa os dois helpers, URL/JSON, leitor Chatvolt e normalização Edge. O protocolo tem uma fixture ASCII independente do encoder, além de casos de truncamento, bytes inválidos, conflitos, emojis, texto comum, fallback e compatibilidade.

O harness de handlers executou 38 cenários: 25 anteriores de Uazapi/ingress/Meta e treze novos de Chatvolt. Dois cliques com a mesma frase recuperam campanhas, cinco UTMs e gclids próprios; outros casos cobrem repetição, outro cliente, clique já usado, CTWA, atribuição anterior, mensagem da equipe, códigos inválidos e atualização de templates legados. Banco, IA, conversões e transportes são fictícios; nenhum destino produtivo é utilizado. Isso não certifica concorrência ou RLS de um PostgreSQL real.

O check final inclui contexto, quatro testes de harness, lint, lint tipado, tipos, regras, 74 testes locais, 29 MCP e build temporário (14,35 segundos). Passou com 358 avisos no lint e onze no tipado, zero erro; o build não substitui `dist` nem ZIPs. Runtime observado: Node 24.22.0. O helper TypeScript foi executado por tsx e compilado com os handlers por esbuild; Deno não está disponível localmente.

Revisão independente do delta exato identificou dois ajustes importantes: código completo junto de outro parcialmente apagado e ativação sobre template com código visível legado. Ambos foram reproduzidos com falha no teste unitário e no handler isolado, corrigidos e verificados novamente com os 38 cenários. Relatório privado fora do repositório. O checkout contém alterações anteriores de outros escopos, excluídas da revisão desta entrega.

O revisor encerrou com dois achados importantes no snapshot original, zero crítico e zero menor. A rodada de correções foi validada pelo coordenador; não houve segunda revisão independente da árvore corrigida. Nenhum achado permanece aberto para esta entrega local.

## Decisões sobre os limites da revisão

- Transporte/renderização reais: adiar para o teste humano após publicação autorizada. Se o provedor remover invisíveis, a associação não ocorre; a fixture local não comprova o transporte externo.
- Deno implantado: aceitar tsx/esbuild para a entrega local, pois a CLI Deno não está disponível. Diferenças de runtime/empacotamento ainda precisam ser verificadas na preparação da release.
- OAuth, RLS, PostgREST, concorrência e configurações produtivas: manter os contratos existentes sem alteração. As fixtures verificam os filtros e a associação, mas não certificam esses serviços reais.
- Regras preexistentes: preservar a ordem do claim e as políticas de grupos/Apicebot, fora do delta. Não expandir esta entrega para mudar esses comportamentos; a revisão não constitui auditoria integral deles.
- Documentos finais: conferência pelo coordenador, incluindo links, hashes e correspondência com os comandos executados. O revisor independente não avaliou esses documentos; isso limita a evidência editorial, não amplia o aceite produtivo.

## Limites e próximo passo

O codec novo ainda precisa de validação por uma mensagem real após publicação autorizada. Transporte que remova os caracteres ou edição da mensagem pode impedir a associação. O identificador não resolve o desvio do Safari privado que abre o endereço antigo sem passar pelo Planeje.

Tray, GTM, campanhas, números, configurações e histórico de clientes não foram alterados. Não houve reprocessamento ou reatribuição em lote.

Após autorização específica, preparar release a partir da base produtiva vigente, publicar os helpers compartilhados/consumidores e a orientação administrativa, e então ativar somente o link escolhido da Dinamac. Não promover o `dist` da raiz ou reaplicar migrações antigas. O teste humano deve conferir clique, mensagem e UTMs do mesmo evento sem apagar contatos ou enviar conversões de teste por inferência.
