# Atlas circulando no escritório — 17/10/2026

Publicado às 09h01 de São Paulo na VPS 72.60.14.109, após pedido de Josias para ver o robô indo até a pessoa que recebeu uma pergunta e abrir a conversa pelo personagem.

O mesmo avatar 3D já aprovado aparece como um visitante próprio do mapa, separado dos sete agentes por pessoa. O movimento consulta somente as conversas internas que já foram carregadas pela sessão autorizada. Cada visita exige uma mensagem Atlas efetivamente registrada, destinatário ativo e assunto aguardando resposta/decisão/conferência. Sugestão ainda não enviada, assunto encerrado, revisão futura combinada, pessoa inativa ou leitura incompleta não inventam chamados.

O robô percorre a grade livre usada pelos personagens, por corredores e portas. Segue o destinatário atual da conversa, inclusive após conta → executor ou retorno para a conta. Mostra `Atlas → Nome` e `Aguardando resposta`; não representa presença humana nem prova de execução do trabalho. Quando há vários chamados, alterna as visitas após permanecer junto de cada destinatário. Mensagem nova tem prioridade; consultas iguais não recomeçam o passeio. Resposta humana mais recente retira a visita pendente até haver nova pergunta registrada.

Clique no corpo do robô abre a conversa exata por `open_team_thread`, mantendo a verificação de que o assunto pertence aos dados autorizados já carregados. Seleção é limpa depois de abrir para o clique funcionar novamente. A estrelinha junto aos controles Aproximar/Afastar/Enquadrar é **Encontrar Atlas no mapa**. Quando não há conversa pendente, o clique abre Chamados e o robô circula entre pontos do corredor durante o expediente; fora do expediente descansa. Movimento reduzido respeitado, sem passeio/balanço contínuo.

Esta camada não envia perguntas, chama IA, cria tarefas, muda revisões, inventa respostas ou amplia leitura de mensagens. Usa os chamados do fluxo publicado às 01h38 e a consulta existente a cada 15 segundos. A animação pode reproduzir a visita de uma pergunta anterior ao abrir o escritório; o horário verdadeiro da mensagem continua na conversa. A criação e o acompanhamento operacional permanecem nos serviços do gerente.

## Validação

13 testes novos de seleção de visitas, resposta mais recente, destinatário, pausa, rota, atualização sem reinício, prioridade de nova pergunta, alternância e movimento reduzido; 23 regressões de escritório/atividade/expediente/clientes: **36 testes Node passaram**. Builds completo e do escritório passaram.

Prévia totalmente fictícia: mascote percorreu a sala até Bia; clique no corpo abriu `[Aurora fictícia] Conferir criativo`. Na tela 390×844, visita a Ana e clique abriram `[Lírio fictício] Conferir entrega`, comprovando destino e conversa diferentes; viewport restaurado. A prévia não envia mensagens nem conecta banco ou IA.

Produção autenticada: Encontrar Atlas aproximou o robô ao personagem Josias; clique no corpo abriu `[Impacto Noivas] Alinhar pedidos recebidos`, com a pergunta real de 01h38 e seletor de responsável. Nenhuma pessoa foi escolhida/respondida pelo agente. Sete rotas/assets públicos retornaram 200, quatro serviços ativos. Hash integral das tarefas, contagem de conversas/mensagens e política de autonomia ficaram iguais ao snapshot anterior à publicação.

## Publicação

- URL: `https://planeje.jbapex.com.br/?v=7a13a956#/assistant/atlas`.
- Main: `index.7a13a956.js` / `index.543d5afd.css`.
- Escritório: `index-e187bf0d.js` / `index-8c32ba80.css`; avatar empacotado `atlas-avatar-3d-v1-860d62c4.png`, mesma imagem aprovada.
- Fonte atual: `/root/planeje-releases/atlas-office-robot-20261017-01/candidate`, webroot `/var/www/planeje`; 1.686 fontes guardadas, 12 arquivos próprios promovidos. Não usar o root sujo ou promover Assessoria/CS.
- Backend continua na candidata `atlas-manager-flow-20261017-01`. **Sem SQL, restart, alteração de configuração ou chamada ao modelo nesta entrega visual.** Migração anterior `20261017034308` não reaplicada.
- Publicação de assets aditiva e HTMLs trocados ao final; anteriores preservados. ZIPs de extensões incidentalmente gerados pelo build não promovidos.
- Continuidade: responder no robô quem cuida da Impacto; primeiro ciclo real com a equipe no expediente, sete vínculos de grupos e aceite de uso seguem pendentes. A pergunta já existente continua para 19/10, 08h.

[Release](../evidencias/releases/atlas-robo-no-mapa-2026-10-17.json) · [Robô na produção](../evidencias/atlas-robo-mapa-producao-2026-10-17.png) · [Clique na conversa real](../evidencias/atlas-robo-mapa-conversa-real-2026-10-17.png) · [Prévia em tela estreita](../evidencias/atlas-robo-mapa-previa-mobile-2026-10-17.png).
