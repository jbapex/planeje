# Rastreamento — coluna Funil / Etapa oculta

Publicado em 29/10/2026, às 00h31 (São Paulo), na sequência dos ajustes de Leads na VPS, após pedido explícito de Josias para ocultar a coluna mostrada na captura.

O cabeçalho e as células Funil / Etapa só são renderizados fora de `standaloneTracking`. Rastreamento fica com13colunas; CRM legado mantém16, ou17quando mostra Cliente. Rastreamento com Cliente fica com14. Nome180px, Ver dados roxo, ficha, eventos, comercial, exportação para funil, CSV e dados não foram alterados. Nenhum registro excluído ou etapa modificada.

Nova base: `/root/planeje-releases/rastreamento-hide-funnel-20261029-01/candidate`, herdando `rastreamento-campaign-button-20261029-01/candidate` e perfil somente na VPS.1.790 fontes; overlay de um arquivo `src/components/pages/ContatosPage.jsx`, SHA-256 `5ccf67c9db8c399436462645bae730b60e6f5d6800c21b897d323bf9d27563a2`. Assets `index.0dab5f24.js`/`index.bb8d540f.css`; anterior362a3c92 e CSS idêntico preservados. HTML SHA-256 `60539e0288065b58374ea61bede23d5c5b3e6441f432a5d4522a6a27364ce564`.

Dist da raiz e incrementos locais alheios ficaram fora. Sem SQL, restart, IA, mensagem, conversão ou escrita em contato. Cinco serviços, units/drop-ins, runtime/Edge e escritório preservados. Não repetir publicador; próxima entrega herda esta base ou posterior e perfil, verificando concorrência.

Lint sem erros e dois avisos preexistentes. Três scripts de ficha/eventos Meta/CSV, build temporário,24testes do publicador locais/remotos e build da candidata passaram. Fixture da tabela JSX exata confirmou cabeçalho/4linhas com13células em Rastreamento e16no legado, incluindo valores do funil. Revisão independente sem achados; AST conferiu alinhamento nos quatro modos e rotinas do publicador inalteradas.

Pós-publicação:1.790 fontes, cincoHTTP/hashes (CSS atual/anterior é o mesmo), cinco serviços ativos e runtime/Edge/unidades conferidos. UI autenticada confirmou Conta seguida de Qualificado,13cabeçalhos/células, Nome180px e botão de campanha. Nenhuma marcação/envio pelo agente. Captura privada; sem conteúdo de cliente nesta documentação. Celular físico não conferido; aceite de uso humano separado.

[Evidência sanitizada](../evidencias/rastreamento-ocultar-funil-2026-10-29/publicacao.json) · [Base visual preservada](rastreamento-botao-campanha-producao-2026-10-29.md).
