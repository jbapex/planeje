# Rotina semanal de tráfego — primeiro recorte da fase 7

**Registro da primeira rodada:** as regras vigentes de dois dias/campanhas estão no [refinamento posterior de 17/09](fase-7-campanhas-e-otimizacao-2026-09-17.md). A unicidade atual inclui tipo de rotina.

Entrega em 17/09/2026 **somente no staging** (`https://app.planeje.online/#/paid-traffic/rotina`). Josias priorizou uma rotina simples, com histórico, após descrever o controle semanal de um parceiro. Esta rodada não conclui a fase 7, não inicia a fase 6 nem autoriza nova promoção de produção.

## Uso diário

1. Em Tráfego → Rotina semanal, gestor da agência configura cada cliente: pessoa, dia útil da revisão, início e resultado principal (ex.: agendamentos).
2. No dia escolhido, o servidor cria uma tarefa real para revisar a semana anterior, de segunda a domingo. A tela mostra o que revisar e as próximas ações ainda abertas. Comigo usa atribuições reais.
3. Responsável registra investimento em mídia, contatos únicos gerados pela mídia, quantos desses contatos atingiram o resultado, análise e próxima ação. Pode salvar rascunho. Zero exige conferência; dado ausente continua ausente.
4. Pode manter/acompanhá-la, vincular tarefa acessível do mesmo cliente ou criar ação com pessoa e prazo. A tarefa da ação só nasce ao finalizar, e permanece aberta independentemente da revisão.
5. Histórico permite semanas recentes e consulta completa por cliente em páginas. Abrir revisão mostra quem finalizou/quando, análise, números e ação atual; alterações de rascunho têm autor, data e snapshot auditável. Registros finalizados são de leitura.

## Regras implementadas

- Opt-in por cliente; nenhuma rotina real ativada automaticamente na migração. Início inicial deve ser hoje/futuro; sem obrigações históricas antes da ativação.
- Revisão cobre segunda–domingo anterior ao dia de cobrança, no fuso São Paulo. Semana precisa estar encerrada ao finalizar.
- Cron PostgreSQL `planeje-traffic-weekly-reviews` executa na hora, minuto 10; somente SQL local. Configurar/Atualizar também gera ciclos já devidos. Leitura do quadro não grava tarefas e não monta as visões legadas de geração/Ads em segundo plano.
- Recupera ciclos ativos perdidos, limitado aos últimos 365 dias. Desligar conserva tarefas/histórico; religar ou trocar o dia retoma a partir de hoje. Não recupera o intervalo desativado. Troca de dia após revisar a semana mostra a cobrança do ciclo seguinte; não cobra novamente o ciclo finalizado.
- Cada cliente/semana tem revisão única e uma tarefa vinculada. Chave de geração contém cliente e semana. Lock e restrições impedem duplicações.
- Status, pessoa e prazo de execução vêm de `tarefas`. Pessoa padrão da conta continua em `traffic_client_ops`; alterações de configuração não reatribuem nem reprogramam revisões anteriores.
- Resultado principal é snapshot da revisão. Conversão = contatos dessa mesma semana que atingiram o objetivo ÷ contatos; custo = investimento ÷ resultados, com denominadores válidos. Contatos orgânicos ou de semanas antigas ficam fora dessa taxa.
- Valores são informados/conferidos pelo gestor; não há coleta automática de Meta/Google/CRM nesta rodada. Não inventar causalidade de venda nem misturar verba de mídia com faturamento da agência.
- Equipe interna ativa lê conforme carteira/atribuição. Gestor da agência configura; responsável real ou gestor ajusta/finaliza. Novas tabelas não aceitam DML direto autenticado; RPCs protegidas, RLS e schema privado fechado.
- Finalização tem conflito de versão e é idempotente. A revisão deve ser finalizada pela RPC, inclusive se a tarefa for aberta pela fila. Gate impede concluir diretamente sem análise e impede um leitor de assumir/editar a tarefa para contornar a ACL. Trocar responsáveis exige permissão de atribuição e pessoas internas ativas.
- Pessoa ausente/inativa gera aviso por ciclo, sem tarefa parcial. Reparo/retry limpa o aviso e gera uma única revisão. Cliente encerrado conserva histórico acessível.
- Rotinas/relatórios legados foram preservados. Não houve conversão, limpeza, habilitação automática de conta nem envios externos.

## Fonte, migração e operação

Fonte completa: `root@2.25.216.103:/opt/planeje-staging/source`. Preservar working tree. Aplicadas no staging: `20260917041000_traffic_weekly_reviews.sql` e `20260917042000_traffic_weekly_history_visibility.sql`, `20260917042100_traffic_weekly_task_edit_acl.sql`; não reaplicar CREATE.

Frontend: `TrafficWeeklyRoutine.jsx/.css`; helpers/testes `trafficWeeklyReview.js`, `trafficWeeklyReview.test.mjs`; rota `paidTrafficRoutes.js`/`PaidTraffic.jsx`; atalho `TaskTrafficWeeklyShortcut.jsx`/`TaskDetailsTab.jsx`; conclusão da Central redireciona para revisão semanal em `CentralTrafegoConcluirDialog.jsx`.

Banco: `traffic_weekly_settings`, `traffic_weekly_reviews`, `traffic_weekly_history`, `traffic_weekly_generation_issues`. RPCs: `save_traffic_weekly_settings`, `refresh_traffic_weekly_routine`, `traffic_weekly_board`, `traffic_weekly_client_history`, `save_traffic_weekly_review`, `can_use_traffic_weekly`. Funções privadas fazem geração/criação/gate; permanecem inacessíveis ao aplicativo.

Backup privado anterior: `/opt/planeje-staging/private/traffic-weekly-before-20260917` (fonte, frontend, dump). Catálogo do dump/tars verificados; esta rodada não exerceu restauração integral. Build isolado `dist-traffic-weekly-20260917-final`; assets antigos retidos e index trocado atomicamente. Staging mantém os bloqueios de integrações e webhook de notificações desabilitado.

## Validação e limites

- 19 testes Node: oito da rotina semanal, seis do guard de salvamento, cinco de ordem/prazos; rotina fixa legada também passou.
- SQL autenticado/RLS com rollback: opt-in/corte, cliente/ciclo único, geração real sem JWT de navegador, repetição, conflito de versão, ACL do responsável, rascunho sem tarefa de ação, finalização/ação independente, histórico, cliente encerrado, cross-client negado e acesso não interno negado. Simulação de ciclo ativo perdido valida desligamento, falha por pessoa ausente e reparo/retry.
- Regressões SQL de fluxo de conteúdo e onboarding passaram com rollback. Build passou; lint dirigido de sintaxe/nome/hooks usado por ausência de configuração ESLint no legado.
- Jornada de interface com cliente exclusivamente fictício: configurar, gerar, registrar números/ação, salvar rascunho, ler audit, finalizar, consultar histórico e verificar ação ainda pendente. Fictícios removidos ao terminar, sem resetar dados reais.
- Deduplicação exercida sequencialmente e conflito com versão antiga; concorrência simultânea real não foi ensaiada nesta rodada. Repetição operacional do cron em vários dias é observação posterior de uso.
- Aceite de Josias pendente. Correção de revisão já finalizada, relatórios/exportação gerencial, reuniões/calendário adicionais, coleta e atribuição Ads/CRM, orçamento/alçada e financeiro continuam por delimitar. Não presumir necessidade universal desses campos.

Produção permanece na promoção seletiva 1–5 de 16/09. A nova rotina precisa de revisão de uso e autorização própria antes de produção.
