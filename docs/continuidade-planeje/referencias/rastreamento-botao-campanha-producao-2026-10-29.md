# Rastreamento — botão Ver dados com aparência da prévia

Publicado em 29/10/2026, às 00h22 (São Paulo), por pedido explícito de Josias para manter na VPS o visual da versão local mostrado na captura.

## Alteração e escopo

Somente o botão Ver dados em `standaloneTracking`: ícone decorativo de tabela à esquerda, texto `#7447ad`, fundo `#f7f4fd`, borda `#e0d9ee`, hover `#eee7fb`/`#cbb7e8`, espaçamento e cantos arredondados. Reutiliza Button/Popover existentes, preservando foco, rótulo acessível e teclado. Painel e valores, Nome180px, ficha/conversa, eventos, campos comerciais, tabela legada e CSV não receberam alteração funcional. Sem nova dependência, transporte ou escrita de dados.

## Publicação e concorrência

Nova base: `/root/planeje-releases/rastreamento-campaign-button-20261029-01/candidate`, 1.790 fontes. Overlay de um arquivo, `src/components/pages/ContatosPage.jsx`, SHA-256 `7221ba82d3e3709a578892d58b116d641a3cfe6ed19afddf49bbdc2a7bc9d0f7`. A primeira preparação abortou por HTML concorrente, antes de criar candidata/baseline ou alterar produção. A base foi reconciliada e revisada para herdar `atlas-activity-20261028-01/candidate`, publicada00h14, e seu perfil produtivo somente dentro da VPS. A atividade do Atlas e sua migração anterior foram preservadas; nenhuma migração foi repetida.

Assets novos `index.362a3c92.js`/`index.bb8d540f.css`; anteriores `318dea93`/`65c717d0` conservados. HTML SHA-256 `01d3ea6fb0942c85536762f42d22c7a502ecee5f2715b17cc7431044bf40c2fb`. Dist da raiz e outras alterações locais ficaram fora. Sem SQL, restart, IA paga, mensagem ou evento real. Runtime/Edge, cinco serviços, units/drop-ins e escritório preservados. Não repetir publicador; próxima entrega deve herdar esta base ou posterior e seu perfil, verificando concorrência.

## Evidência e limites

Lint: zero erros e dois avisos preexistentes. Três scripts de ficha/eventos Meta/CSV e build temporário passaram. Fixture isolada extraiu a tabela JSX exata: cores RGB conferidas, dois SVGs, Enter/Escape com foco de volta e16colunas legadas preservadas. 24 testes do publicador passaram; revisão independente e adendo da nova base sem achados pendentes, funções de promoção/rollback/autorização/verificação preservadas.

Na candidata: três scripts, build produtivo e perfil herdado passaram. Pós-publicação:1.790 fontes, seisHTTP/hashes, cinco serviços ativos e Edge/unidades/runtime conferidos. UI autenticada confirmou cores e ícone exatos, Nome180px e painel com três campos. Capturas ficam privadas, sem conteúdo de clientes nesta documentação. Sem teste em celular físico ou tema escuro; aceite de uso humano separado.

[Evidência sanitizada](../evidencias/rastreamento-botao-campanha-2026-10-29/publicacao.json) · [Entrega anterior dos Leads](rastreamento-leads-compactos-producao-2026-10-28.md) · [Base Atlas preservada](atlas-atividade-producao-2026-10-29.md).
