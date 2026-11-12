# Atlas disponível ao dono fora do expediente — 17/10/2026

Publicado às 15h22 de São Paulo na VPS 72.60.14.109. Josias pediu poder trabalhar com o Atlas fora do expediente, mantendo tarefas em dias úteis.

O atendimento manual já era permitido pelos endpoints existentes. A indicação geral de descanso, porém, sugeria que todo o Atlas estivesse indisponível. O cabeçalho agora mostra **Atlas disponível** e o acesso **Trabalhar agora**. O personagem no mapa informa **Disponível para você** quando está em repouso fora do expediente.

O painel oferece conversa e seleção de um cliente acompanhado para **Analisar cliente agora**, pelo mesmo pedido autenticado do escritório. Não dispara análises ao abrir o painel ou escolher um cliente. Mostra acesso ao contexto e às respostas do cliente. Seleção e painel permanecem durante atualizações de dados. Uma solicitação em andamento é respeitada pelos controles e pela deduplicação já existente do endpoint. Configurações pausadas continuam respeitadas. Em telas estreitas, Configurações e Ampliar ficam com ícones para manter o acesso Trabalhar visível.

## Agenda e alcance

Seu uso manual não depende do horário comercial. Perguntas, cobranças e execução automática para a equipe continuam no expediente de segunda a sexta, 08h–17h de São Paulo ou expediente individual cadastrado. Análise solicitada fora do horário pode preparar o contexto; não antecipa o chamado automático à equipe.

Foi conferida, somente por leitura, a função produtiva `private.atlas_manager_finish`: cálculo de um dia útil para apuração/três para produção (regras editáveis), previsão explícita normalizada quando cai no fim de semana e criação automática adiada fora do expediente do executor. `private.atlas_manager_work` pula sábado/domingo nas revisões. Essas regras já estavam publicadas e não foram substituídas. Não foi alterada a data de tarefa existente nem criado um bloqueio geral sobre edições manuais em Tarefas.

## Verificação

49 verificações Node passaram, incluindo cálculo de dias úteis, expediente e regressões do escritório/robô. Builds principal e escritório passaram. Prévia fictícia: painel em computador e 390×844, seleção de cliente, pedido de análise aceito no sábado e abertura da conversa. Cabeçalho estreito corrigido e conferido novamente. Não foi enviada mensagem nem acionado modelo real nessa prévia.

Produção autenticada: novo painel aberto, 24 clientes disponíveis e Impacto selecionada, sem clicar na análise real para teste. Seis HTTP/bytes 200, quatro serviços ativos. Política/autonomia, configuração de eventos e contagens de conversas/mensagens permaneceram iguais durante a publicação. Nenhum SQL, restart, chamada de modelo, tarefa ou mensagem operacional foi feito por esta entrega.

## Base produtiva

`/root/planeje-releases/atlas-owner-hours-20261017-01/candidate`, derivada da candidata pixel anterior; sete arquivos próprios e guarda de 1.691 fontes. Main `index.636ec797.js` / `index.543d5afd.css`; escritório `index-72e27436.js` / `index-e5ae8acc.css`; versão do iframe `atendimento-manual-20261017-01`. Backend continua em `atlas-manager-flow-20261017-01/candidate`. Assets anteriores preservados. Arquivos ZIP gerados incidentalmente pelo build foram restaurados antes de montar o pacote; não foram promovidos.

Uso real da nova entrada e aceite pendentes. Primeiro ciclo automático da equipe em expediente e sete vínculos de grupos continuam como pendências anteriores.

[Produção](../evidencias/atlas-atendimento-manual-producao-2026-10-17.png) · [Prévia](../evidencias/atlas-atendimento-manual-previa-2026-10-17.png) · [Tela estreita](../evidencias/atlas-atendimento-manual-mobile-2026-10-17.png) · [Release](../evidencias/releases/atlas-atendimento-manual-2026-10-17.json).
