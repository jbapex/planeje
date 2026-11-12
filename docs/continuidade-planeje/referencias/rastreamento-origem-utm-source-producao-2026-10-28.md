# Rastreamento: origem por UTM — produção de 28/10/2026

**PUBLICADO E VERIFICADO às 15h28 de São Paulo; aceite de uso pendente.**
Josias autorizou especificamente “publciar” após a entrega local testada e revisada.
[Implementação e testes locais](rastreamento-origem-utm-source-local-2026-10-28.md) ·
[Evidência sanitizada](../evidencias/releases/rastreamento-origem-utm-source-producao-2026-10-28.json).

## Resultado

Site com `utm_source` textual não vazio mostra a fonte, por exemplo chatgpt.com,
na lista, ficha e entrada correspondente do histórico. Sem fonte, mantém Site.
Google/Meta, primeira origem registrada e categorias/filtros anteriores preservados.
O CSV acompanha o rótulo, inclui leads sem contato e serializa fontes externas
como texto, neutralizando fórmulas. Nenhum contato ou histórico foi regravado.

## Composição e operação

Base frontend `/root/planeje-releases/rastreamento-utm-source-20261028-01/candidate`,
herdada de `rastreamento-default-last-20261028-01/candidate`, com perfil
`.env.production.local` herdado somente na VPS. São 1.770 fontes: cinco arquivos
de produto e três de teste neste overlay. Main `index.18f01b57.js`, CSS
`index.ca294902.css`; HTML SHA-256
`81e46742d595a9e5af7289889b603e202baa48942b40a936c36983d3ad6985e3`.

Aplicados somente os grupos exatos do delta revisado sobre os fontes publicados.
`ContatosPage.jsx` composto tem SHA-256
`de622c23f369bcc164792edc5d59253c16cde89d496245ba380e21222818a67b`;
difere do arquivo local inteiro porque o checkout inclui mudanças anteriores
não publicadas. Os demais quatro arquivos de produto coincidem com os hashes
revisados. Não promover dist ou arquivos inteiros da árvore suja em outra entrega.

O publicador frontend existente foi reutilizado, com manifesto exato, baseline
completa, perfil produtivo, assets imutáveis antes do HTML e recuperação por hash.
Preservou assets antigos, escritório, runtime Edge e units efetivos/drop-ins.
Os cinco serviços Atlas continuam ativos na candidata Atlas anterior; Edge ativo.
Sem SQL, migração, restart, reenvio Google/Meta, mensagem ou mudança de autenticação.

## Verificação e limites

Oito scripts Node na candidata, 24 testes do publicador locais e remotos,
build produtivo e cinco HTTP com hashes passaram. As 1.770 fontes de trabalho
foram conferidas após a publicação. A conferência autenticada de um contato
existente confirmou chatgpt.com na lista, origem da ficha e histórico do clique,
com datas e Última mensagem inicial preservadas. Nenhuma ação comercial foi usada.
A captura está fora do repositório, no diretório privado de visualizações.

A revisão independente local encerrou sem P2+ pendente, com os dois achados
corrigidos. O CSV não foi aberto em planilha externa nem exportado com dados
reais nesta validação. Aceite humano permanece separado da publicação técnica.
