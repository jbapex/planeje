# Atlas em pixel art no escritório — 17/10/2026

Publicado às 09h16 (São Paulo) na VPS 72.60.14.109. Josias pediu que o Atlas dentro do mapa fosse um personagem no estilo da equipe, em vez de uma imagem 3D estática se deslocando.

## Resultado

O robô usa sprites procedurais de 24×34 pixels, âncora nos pés (12, 31), contornos e escala compatíveis com os personagens existentes. Tem quatro direções, quatro fases de caminhada a cada 140 ms, braços e pernas alternados, visor roxo, antena e piscar discreto quando parado. Quadros são desenhados em canvas e reutilizados em cache. Movimento reduzido é respeitado; a animação não chama IA.

Percursos pela grade, visita ao destinatário de chamados reais, fila de visitas e clique para abrir o assunto exato foram preservados. Encontrar Atlas aproxima o mapa. Sem conversa ativa, clicar abre Chamados. O avatar 3D do botão flutuante permanece; esta entrega trata do personagem dentro do cenário.

## Validação

- 36 verificações Node passaram (robô, atividade, expediente, escritório e clientes).
- Builds do escritório e da aplicação passaram sobre a candidata produtiva completa.
- Folha de sprites conferida: quatro direções e passos, lado a lado com personagem original.
- Prévia fictícia no computador e em 390×844: trajeto, orientação junto à pessoa e clique abriram o assunto correto.
- Navegador produtivo autenticado: novo personagem no mapa e clique em repouso abriu Chamados. Sábado, fora do expediente; não foi criado chamado real para a conferência.
- Seis rotas/arquivos HTTP 200 e quatro serviços Atlas ativos.

## Publicação e guarda

Base: `/root/planeje-releases/atlas-office-pixel-20261017-01/candidate`, derivada da candidata `atlas-office-robot-20261017-01`. Sete arquivos próprios promovidos; guarda completa de 1.689 fontes. Backend continua em `atlas-manager-flow-20261017-01/candidate`.

Main: `index.bc89abee.js` / `index.543d5afd.css`. Escritório: `index-68d0dd78.js` / `index-8c32ba80.css`. Versão do iframe: `robo-pixel-20261017-01`. Assets anteriores conservados. Sem SQL, restart, chamada de modelo, tarefa ou mensagem operacional escrita por esta entrega.

A conferência final de hash agregado de tarefas detectou mudança operacional durante a preparação: último evento às 12:08:18 UTC, anterior à promoção do HTML às 12:16:51 UTC. O publicador somente consulta tarefas. Não houve reversão ou sobrescrita; o publicador não foi repetido. Uma finalização separada confirmou bytes dos HTMLs, todas as fontes e contagens de conversas/mensagens e política preservadas. O JSON registra `task_hash: false` com esta ressalva, sem declarar invariância inexistente.

## Continuidade

A definição da conta da Impacto já foi respondida pelo usuário às 09h05:57 e o assunto de contexto aparece encerrado; não solicitar essa definição novamente com base no registro antigo. Primeiro ciclo real da equipe em expediente, sete vínculos de grupos e aceite visual seguem pendentes. Esta mudança visual não altera a autonomia ativada anteriormente.

## Evidências

- [Produção](../evidencias/atlas-robo-pixel-producao-2026-10-17.png)
- [Passos e direções](../evidencias/atlas-robo-pixel-passos-2026-10-17.png)
- [Prévia](../evidencias/atlas-robo-pixel-previa-2026-10-17.png)
- [Tela estreita](../evidencias/atlas-robo-pixel-mobile-2026-10-17.png)
- [Release](../evidencias/releases/atlas-robo-pixel-2026-10-17.json)
