# Rastreamento: origem consistente — publicação

Publicado em 29/10/2026,01h17 (São Paulo), após autorização explícita “publciat”. A origem de links Linktree sem Google/CTWA agora é lida de forma consistente na lista, ficha, filtros, estatísticas, relatórios e CSV. Site com `utm_source` usa a fonte registrada, como chatgpt.com. A primeira origem reconhecida prevalece sobre heurísticas posteriores; Google/Meta reais e o rótulo Meta Link específico do Mini CRM permanecem preservados.

## Release e composição

`/root/planeje-releases/rastreamento-origin-20261029-01/candidate`,1.791 fontes. Base/perfil herdados de `atlas-expandido-20261029-01/candidate` (1.790 fontes). Cinco fontes de produto e um teste de regressão; três diferenças locais antigas da barra de ferramentas ficaram fora. Atlas ampliado, responsável/atividade, Nome180px, Ver dados roxo e Funil/Etapa oculto no Rastreamento foram conservados. Visão geral por origem ainda local não foi incluída.

Main `index.b8d86d0b.js`, CSS `index.80eb966f.css` inalterado; HTML SHA-256 `551c08174a9aaf5da3b2a4d3ecb29c292a52cd048e221dca89d919b5b58df375`. Assets anteriores cd869874 e CSS conservados. O manifesto vincula a composição aos hashes revistos; o publicador mantém concorrência, backup e rollback condicionados ao conteúdo próprio.

## Verificação e resultado observado

- Produto local:12 scripts seguros, lint zero erros/dois avisos preexistentes, build temporário e fixture CUA passaram. Revisão independente encerrou três P2; revisão da composição/publicador sem achados.
- Candidata produtiva:11 scripts passaram, incluindo a regressão nova, ficha/links/Mini CRM, relatórios Meta/Google/Site, cockpit, histórico/CSV/eventos Meta. O teste hubOverviewOrigins continua somente local junto do incremento não publicado; não foi incorporado para completar a base.
- 24 testes de recuperação do publicador passaram localmente e na VPS; build com perfil produtivo herdado passou. As1.791 fontes finais, cinco HTTP/hashes, cinco serviços ativos, units/drop-ins, runtime/Edge e escritório foram conferidos.
- UI autenticada no cliente/período indicados: lista e ficha mostram Linktree para o contato relatado; filtro Site o inclui e filtro Meta não o inclui.37 linhas antes e depois; origens finais11Meta,6Linktree,2Google e18não rastreadas. Busca/filtro restaurados ao terminar. Captura privada referenciada na evidência, sem conteúdo pessoal nos documentos.

## Operação e limites

Sem SQL, reaplicação de migração, restart, backfill, regravação de contatos/histórico/configuração de link, mensagem ou conversão real de teste. Esta publicação corrige a leitura; não cria UTMs ou atribuições que não foram recebidas. Celular físico e calendário autenticado não foram certificados; a visibilidade do calendário teve regressão com a função real e dados sintéticos. Aceite humano permanece separado.

Não repetir o publicador. Próxima publicação herda esta base ou uma posterior, confirma concorrência e o perfil vigente. [Evidência de publicação](../evidencias/rastreamento-origem-consistente-2026-10-29/published.json), [verificação](../evidencias/rastreamento-origem-consistente-2026-10-29/verification.json), [conferência de interface](../evidencias/rastreamento-origem-consistente-2026-10-29/browser-verification.json) e [diagnóstico local](rastreamento-origem-consistente-local-2026-10-29.md).
