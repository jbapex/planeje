# Rastreamento — Nome compacto e dados da campanha publicados

Publicado em 28/10/2026, às 23h57 (São Paulo), após autorização explícita de Josias para levar os dois ajustes aprovados à VPS. Conferência autenticada concluída na virada para 29/10.

## Comportamento e escopo

Somente na tabela de Leads de Rastreamento (`standaloneTracking`), Nome ocupa 180 px, fica em uma linha e usa reticências. O título ao passar o mouse e a ficha mantêm o nome completo. Campanha, Conjunto de anúncios e Anúncio passam à coluna Dados da campanha, cujo botão Ver dados abre os três valores completos. Ausência individual mostra Não informado; ausência de todos mostra travessão.

A ficha e a conversa existentes, os indicadores de eventos, Qualificado, Comprou, Valor, etiquetas, filtros, leitores e CSV foram preservados. A tabela legada do CRM mantém as três colunas. Nenhum gravador ou leitor novo, dependência, SQL, migração, restart ou envio real.

## Operação

Nova base frontend/fontes: `/root/planeje-releases/rastreamento-leads-compact-20261028-01/candidate`, herdando `atlas-chat-space-20261028-01/candidate` e seu perfil produtivo somente dentro da VPS. 1.786 fontes; overlay exato de um arquivo, `src/components/pages/ContatosPage.jsx`, SHA-256 `b5d7c1aa1a955932314d970283ebbaa95e7e93f2d1f78621dab8756284508813`.

A fonte produtiva anterior foi comparada com a local; diferenças antigas de estilo da barra de filtros ficaram fora do overlay. Visão geral por origem e outros incrementos locais não foram promovidos. O dist da raiz não foi usado. Assets novos `index.115191bd.js` e `index.2ced0f84.css`; anteriores `b0eaae9b` e `17fb8259` conservados. Índice HTML SHA-256 `5e03ca88cb81aff5c784a42e8444ede1c783b3abd81c68ac2de78946b51eb79e`.

Runtime/Edge, cinco serviços Atlas, units/drop-ins e escritório preservados. Não repetir o publicador. A próxima entrega deve herdar esta base ou posterior, verificar concorrência e herdar o perfil produtivo.

## Validação e limites

Lint sem erros e com dois avisos anteriores; três scripts de ficha/eventos Meta/CSV e build temporário passaram. A fixture local extrai a tabela JSX exata do payload, usa rede isolada e verificou 180 px, nomes longos/sem espaços, título completo, ausência e fallback de campos, texto HTML escapado, teclado/Escape/foco, tabela legada e Popover dentro de 320 e 433 CSS px. Revisão independente do produto e publicador terminou sem achados pendentes.

24 testes do publicador passaram localmente e na VPS; os três scripts e build da candidata com perfil herdado passaram. Conferência de 1.786 fontes, seis HTTP com hashes, cinco serviços ativos, unidades e Edge passou. Na produção autenticada, os quatro nomes medidos tinham 180 px; um nome longo teve 116 px úteis e 222 px de conteúdo, com reticências e título completo. Cabeçalho único e painel de três campos foram confirmados. A ficha abriu pelo nome, carregou mensagens recebidas/enviadas e manteve os controles comerciais. Nenhuma marcação, mensagem ou conversão de teste foi enviada.

Sem teste em celular físico ou tema escuro nesta publicação. Aceite de uso humano permanece pendente. Capturas produtivas ficam privadas, sem conteúdo de clientes nesta documentação.

[Evidência sanitizada](../evidencias/rastreamento-leads-compactos-2026-10-28/publicacao.json) · [Desenho aprovado](../../superpowers/specs/2026-10-28-rastreamento-leads-compact-design.md) · [Plano executado](../../superpowers/plans/2026-10-28-rastreamento-leads-compact.md).
