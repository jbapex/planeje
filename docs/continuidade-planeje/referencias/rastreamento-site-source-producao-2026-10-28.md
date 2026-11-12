# Site e sources em Relatórios — produção de 28/10/2026

**PUBLICADO E VERIFICADO às18h47 de São Paulo; aceite de uso pendente.**
Josias autorizou com “Publicar”, após a entrega local testada e revisada.
[Implementação local](rastreamento-site-source-local-2026-10-28.md) ·
[Evidência sanitizada](../evidencias/releases/rastreamento-site-source-producao-2026-10-28.json).

## Resultado

Relatórios tem abas Meta/Google/Site com período compartilhado. Em Site, o quadro
**Leads por origem (utm_source)** mostra contagens por fonte; clique filtra resumo
e lista, Todas as fontes remove seleção. Fonte ausente aparece como **Sem source
informado**. A lista mostra source e abre a ficha com origem correspondente.

Primeira origem e comercial/histórico seguem os contratos anteriores. Site não
é inferido por texto nem recebe campanha/custo de anúncios. Google/Meta continuam
em suas abas. O resolvedor compartilhado reconhece origem Site legada registrada
antes de sinais CTWA posteriores, sem consultar criativo ou mostrar jornada Meta
para esses registros. Nenhuma atribuição, mensagem ou origem antiga foi regravada.

## Composição e operação

Nova base frontend/fontes
`/root/planeje-releases/rastreamento-site-source-20261028-01/candidate`, herdada de
`rastreamento-google-report-20261028-01/candidate` (18h12), com perfil
`.env.production.local` herdado somente na VPS. As1.778 fontes de base e seis
baselines locais foram conferidos. Overlay restrito a seis fontes de produto e
um teste novo, totalizando **1.779 fontes**. Sem fixture, dist da raiz ou trabalho
local alheio no payload.

Main `index.4a1638fd.js`, CSS `index.5689d236.css`; HTML SHA-256
`64f47bfb56a21b001a3c5eb099ba39fc63cd2242da6baa982e9271dd7bb877dc`.
Publicador frontend anterior reutilizado com promoção/recuperação inalteradas;
apenas caminhos, manifesto/base, testes e marcadores ajustados. O título Google
agora é dinâmico no componente compartilhado; guarda estável de Campanha Google
e marcadores de Site conferem os dois recortes. Assets antigos e escritório
preservados, com backup e troca atômica do HTML após guardas de concorrência.

Sem SQL, migração, restart, reclassificação, alteração de autenticação/permissão,
reenvio de conversão ou WhatsApp de teste. Runtime Edge, cinco serviços Atlas e
units/drop-ins/candidatas anteriores preservados. Próxima entrega deve herdar
esta base/perfil vigente ou posterior. Não repetir o publicador.

## Verificação e limites

Nove scripts locais e na candidata passaram: Site (quatro casos), Google,
ficha, links, Mini CRM origens, Meta tracking/gasto, Hub e dashboard Google.
Build produtivo e24 fixtures do publicador locais/24 na VPS passaram. Revisão
independente encontrou um P2, corrigido pelo executor com RED→GREEN dos dois
legados e regressões; hashes finais preservados. Sem segunda revisão completa.

Após ativar,1.779 fontes, seis HTTP/hashes, cinco serviços ativos, units/drop-ins
e runtime foram conferidos. Sessão autenticada carregou Site da Dinamac, cartões
por fonte e filtro real, cujo resumo/lista acompanharam a seleção. Uma ficha
existente mostrou source correto e Sem anúncio vinculado; Google com gasto e
Meta também carregaram. Sem controles comerciais, Carregar dados do Meta ou reenvio.
Captura produtiva fica privada no diretório de visualizações de28/10:
`rastreamento-site-source-producao.png`, fora do repositório.

Os cartões contam leads pela última atividade no período; conversas reais e
qualificados usam primeira mensagem, como os relatórios anteriores. Fonte vazia
continua sem source, sem inferência. Celular390/320px foi validado em fixture;
celular físico, aceite humano e garantia de snapshot transacional não foram
certificados. Google conserva os limites de gasto do endpoint anterior.
