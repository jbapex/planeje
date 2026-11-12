# Calendário social — cabeçalho compacto (19/10/2026)

## Pedido e escopo

Josias pediu reduzir o espaço ocupado pelo título, abas e controles acima do calendário na prévia local da porta 4350. Esta entrega reorganiza a apresentação de Redes Sociais e preserva dados, filtros, ações e a grade mensal responsiva já entregue. Estado: local, sem publicação e sem aceite humano inferido.

## Alteração

- Título, ajuda e cliente em uma faixa simples, sem o cartão alto e o selo redundante “Publicações”. Estilo limitado a Redes Sociais; o componente compartilhado de cabeçalho permanece intacto.
- Sete abas em uma linha, com rolagem lateral quando necessário e navegação por teclado preservada.
- Mês, navegação, período, criação, busca e canal na mesma faixa quando há largura. Situação do conteúdo logo abaixo.
- Até 760 px de largura do calendário, controles distribuídos em três linhas; toque mantém alvos de 44 px e busca/canal com fonte de 16 px. Em 320 px, situações podem rolar lateralmente dentro da faixa.
- Ordem do DOM acompanha a apresentação visual. Sem dependências novas, alterações de API, permissões, aprovação ou envio.

Arquivos: `src/components/pages/SocialMedia.jsx`, `src/components/social/SocialPlanner.jsx`, `src/components/social/SocialWorkspace.css` e `src/components/social/SocialPlannerVisual.css`.

## Evidência local

Na mesma prévia, a distância do topo da página até a grade caiu de 271,77 para 216,09 px em 1440/1024 px (aproximadamente 20%) e de 562,84 para 373,28 px em 390 px com toque (aproximadamente 34%). Inclui o aviso exclusivo da prévia; não é medição de produção.

- Matriz específica: 1440, 1024, 768, 390 e 320 px; busca, filtro Facebook, modo semanal, última aba pelo teclado e ausência de overflow horizontal da página. Zero erros JavaScript, requisições externas ou gravações na fixture.
- `scripts/social-operations-preview/verify-month.cjs`: 1440×900, 1366×768, 1024×768 e 390×844; cinco/seis semanas, nove conteúdos no dia, lista/detalhe/foco, cliente, resize e contêiner limitado passaram.
- `scripts/social-operations-preview/verify.cjs`: sete abas, cinco abas da tarefa, filtro de cliente, filas e horário preservados em 1440/390 px. Rede isolada e gravações somente na fixture descartável previstas por esse verificador.
- ESLint nos dois JSX: zero erros; dois avisos existentes de tamanho de arquivo.
- `npm run build:check`: passou (7min13s nesta execução), em diretório temporário, sem alterar `dist` ou ZIPs operacionais.
- Revisão independente somente leitura sem bloqueios. Prévia no navegador do usuário conferida e deixada no mês.

Evidências temporárias, sem dados reais: `.local/social-header-20261019/`. `before.json` e `verification.json` registram geometria; `month/` e `operations/` contêm relatórios/capturas; `header-desktop.png` mostra o resultado. O primeiro ensaio mensal teve timeout de carregamento com verificações concorrentes; repetição serial final passou. Um ensaio inicial do cabeçalho exigia cartões mensais no DOM em 320 px, onde o modo compacto usa dia/quantidade; a asserção foi corrigida para conferir os totais visíveis, sem mudar produto para acomodar teste.

## Limites

Não publicado. Em telas muito baixas, como 320×568, ainda é necessário rolar verticalmente para ver todo o mês. Abas e situações usam rolagem lateral interna quando não cabem. A aprovação persistente pelo responsável, o agendamento automático após aprovação e o ciclo real Instagram/Facebook continuam nas pendências da operação social; esta mudança visual não certifica esses fluxos.

## Atualização de publicação — 20/10/2026

O recorte visual foi [publicado na VPS às 12h11](calendario-social-compacto-producao-2026-10-20.md), mantendo as seis abas da base produtiva. O fluxo operacional local e a aba Produção não foram promovidos. Os resultados acima continuam sendo o registro histórico da prévia; aceite humano produtivo pendente.
