# Atlas: comentários e retorno da equipe — 15/10/2026

Aplicado somente ao piloto persistente CS (`127.0.0.1:4320`). Produção preservada; aceite de uso pendente.

## Problema e correção

O estado “Retorno nos Comentários” verificava apenas se o autor estava entre os responsáveis. Quando a tarefa era atribuída ao próprio dono, os comentários dele eram classificados como retorno da equipe. O caso indicado por Josias é a tarefa fictícia `7aaf4ddb-2edb-4ba2-bec0-e3ee64185f6a`, atribuída ao Gestor de teste.

O acompanhamento recebe o ID do dono pelas fontes existentes, exclui-o da contagem de respostas da equipe e distingue atribuição apenas ao dono (“Atribuída a você”). Isso não modifica a atribuição. Com dono e funcionário na mesma tarefa, somente o funcionário conta como retorno da equipe. Pedidos estruturados de decisão/entrega continuam visíveis até resposta ao pedido correspondente; comentário comum não os encerra.

Quando há apenas comentário comum de um responsável da equipe, o painel mostra “Mensagem da equipe”, autor, data em São Paulo e trecho da última mensagem, ordenada pela data de origem. Não interpreta o conteúdo nem presume execução. Ex-responsáveis não confirmam atribuição atual. As explicações ficam recolhidas em “Como o Atlas acompanha”. A etapa continua vindo da tarefa.

## Validação

- 24 testes Node passaram, incluindo dono como único responsável, dono e funcionário, mensagens fora de ordem, comentário posterior do dono, ex-responsável e prioridade de decisão/entrega.
- Build completo a partir da candidata remota atual: 54,27 s; somente quatro arquivos de frontend sobrepostos. Índice e fontes anteriores conferidos antes da promoção; assets antigos e socket privado preservados.
- Navegador: tarefa do print mostra “Atribuída a você”, quatro comentários originais preservados; abrir/recolher ajuda conserva o rascunho, depois removido sem enviar. Minha caixa mostra “Você · delegação”.
- Comentário fictício já existente da equipe aparece na central e nos Comentários da própria tarefa com Tráfego de teste, 15/10 15:41 e conteúdo canônico. Exemplo com entrega estruturada continua em revisão, com tarefa A fazer.
- Celular 390 px: painel 300 px, conteúdo rolável 298 px, página 390 px, sem transbordamento horizontal; viewport restaurado.

Sem migração, restart, IA, mensagem, alteração de tarefa ou comentário enviado nesta correção. Não foi reexecutada a suíte API mutativa: backend e políticas permanecem os já validados na entrega anterior. O worker produtivo e alertas em segundo plano não foram integrados por esta entrega.

## Operação

Release: `/opt/planeje-cs-integration/releases/atlas-retorno-comentarios-20261015-01`. Assets: `index-1e7b7835.js` / `index-81754a77.css`. Índice SHA256 `6949c9ad1e4a2f13797146d37b56a833ea5a27256e782c9462e9c9de5c50250b`. Backup do índice/fontes anteriores em `before/`; manifesto em `promoted.json`. Qualquer nova revisão deve partir da candidata remota atual, incorporando esta correção, sem promover o piloto completo à produção.

[Release e verificações](../evidencias/releases/atlas-retorno-comentarios-2026-10-15.json).

![Tarefa do print corrigida](../evidencias/atlas-retorno-comentarios-detalhe-2026-10-15.png)

![Mensagem da equipe no piloto](../evidencias/atlas-retorno-comentarios-equipe-2026-10-15.png)
