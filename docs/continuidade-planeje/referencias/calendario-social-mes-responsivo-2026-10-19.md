# Calendário social — mês responsivo

Data: 19/10/2026. Estado: alteração local; publicação e aceite humano pendentes.

## Pedido e comportamento

Josias apontou que o mês ultrapassava a tela, com semanas vazias muito altas.
O mensal agora conserva sete colunas e divide a altura disponível pelas quatro,
cinco ou seis semanas reais. A medição usa a área de rolagem do anfitrião e seu
espaçamento inferior, sem presumir uma altura fixa para os cabeçalhos.

No computador, as publicações usam resumos com horário, cliente/título, rede e
indicação de situação. A quantidade de resumos se ajusta ao espaço; o botão de
excedentes abre a lista completa. Em janelas muito baixas, o número do dia e seu
contador dão acesso à mesma lista. O celular usa esse resumo por dia, com alvos
de toque preservados. O mês cabe na área de leitura, mas cabeçalhos altos podem
exigir rolagem para revelar a grade inteira. O semanal mantém seus cartões.

Tocar no dia abre todos os conteúdos daquele dia e filtro; tocar no conteúdo
abre os detalhes já existentes. Escape devolve o foco à origem. Dias vazios
permitem abrir o compositor existente. Nenhum horário, status, conteúdo ou
regra de envio foi alterado. Selecionar um cliente agora preserva mês e modo:
o cabeçalho condicional não remonta mais o calendário.

## Escopo

- `SocialPlanner.jsx`: altura observada, resumos mensais, dia/lista, foco.
- `SocialPlannerVisual.css`: grade mensal e densidade; celular/toque.
- `SocialClientBoard.jsx`: posição estável do calendário ao filtrar cliente.
- `scripts/social-operations-preview/verify-month.cjs`: verificação isolada,
  inclusive volume sintético acrescentado só à resposta local no navegador.
- `verify.cjs`: relógio fixado no domingo original para a comparação de feed
  não mudar conforme o dia de execução. Sem alteração da regra do produto.

## Verificações

A falha original foi reproduzida em 1440×900: a grade começava em y≈272,
media≈952px e terminava≈324px abaixo da tela. Evidência antes/depois em
`.local/social-month-20261019/`.

A revisão independente encontrou um botão extra ultrapassando a célula em
janelas baixas. Corrigido: quando nenhum resumo cabe, fica o acesso pelo dia e
contador, sem botão redundante. Revisão revalidou seis alturas entre 590 e 1000px,
com onze conteúdos no mesmo dia, sem overflow interno, erro ou gravação.

- Matriz de navegador aprovada em 1440×900, 1366×768, 1024×768 e 390×844
  com toque: 35/42 dias, sete colunas, nove conteúdos em um dia, acesso ao
  último dia, lista completa, detalhe, Escape e retorno do foco. Sem overflow
  horizontal ou botões invadindo outra célula.
- Filtro de cliente preserva Mensal/novembro. Redimensionamento
  1440→1024→390→1440 aprovado. Contêiner limitado simulando cabeçalho e
  navegação inferior também passou; não substitui inspeção produtiva.
- Zero erros JavaScript, tentativas externas, gravações ou acionamentos de
  envio na matriz mensal. Desktop cabe sem rolar; celular pode rolar o
  cabeçalho antes de mostrar a grade inteira.
- Regressão da operação aprovada em 1440/390: sete abas principais, cinco da
  tarefa, filtros, filas e legenda preservando data. Única gravação por tela
  foi a edição explicitamente testada em memória.
- 16 testes Node dirigidos de dados/filas/calendário passaram. ESLint sem
  erros (permanece o aviso de tamanho do SocialPlanner). Build final isolado
  aprovado em 29,14s; não substitui `dist`/ZIPs operacionais.
- Revisão independente terminou sem achados pendentes. Evidência mensal em
  `verification.json`, regressão em `regression/verification.json` e logs de
  build/lint no diretório local indicado acima.

## Limites

Somente prévia local com autenticação/API fictícias e rede externa bloqueada.
Não houve publicação, SQL, alteração de cliente ou postagem real. O shell
produtivo autenticado não foi modificado nem certificado nesta rodada.
A aprovação pelo responsável e agendamento automático continuam pendentes
conforme [etapas da operação social](operacao-social-etapas-2026-10-18.md).

## Atualização de publicação — 20/10/2026

O recorte visual foi [publicado na VPS às 12h11](calendario-social-compacto-producao-2026-10-20.md), mantendo as seis abas da base produtiva. O fluxo operacional local e a aba Produção não foram promovidos. Os resultados acima continuam sendo o registro histórico da prévia; aceite humano produtivo pendente.
