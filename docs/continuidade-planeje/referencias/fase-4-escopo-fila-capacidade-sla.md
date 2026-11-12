> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Planeje — Fase 4: escopo, demanda e capacidade

**Ambiente:** VPS de testes `2.25.216.103`  
**Data:** 14/09/2026  
**Produção:** não alterada

**Situação em 14/09/2026:** a base técnica foi implantada no teste. Após a autorização “vamos codar?”, foi implementado o complemento de planejamento manual em Projetos, escopo na ficha do cliente, calendário e vínculo único entre material e tarefa. A fase permanece em refinamento: 46 testes automáticos e aceitação SQL de rollback/idempotência concorrente foram concluídos; a conferência funcional da interface foi concluída e a validação de uso de Josias permanece pendente. A comparação completa de Cobertura por tipo ainda não é declarada concluída.

## Complemento de planejamento dentro da Fase 4

- Elaboração por cliente/período, com contexto, objetivos, prioridades e ações, sem depender de IA.
- Preparação progressiva dos materiais: briefing, roteiro/texto, legenda/CTA, referências, canais, responsáveis e datas conforme as etapas do fluxo confirmado.
- Escopo mensal compartilhado e comparação por tipo de entrega entre contratado, planejado e entregue.
- Contrato e escopo administrados na ficha do cliente; Projetos consulta os dados do período para planejar. A organização foi implementada no complemento descrito a seguir; a validação de uso está pendente.
- Vínculo estável entre material e tarefa, proteção contra duplicação e integração com publicações por canal.
- Acompanhamento em Projetos reflete as tarefas vinculadas. A execução permanece exclusivamente nas automações, fluxos e funções de Tarefas, sem status ou regras de responsabilidade paralelos.
- Consulta das entregas planejadas em relação à fila, capacidade configurada, prazos e exceções. Não há autorização implícita para redistribuir tarefas ou datas automaticamente.
- Planejamento de mídia do mês: objetivos, plataformas, verba e metas pertinentes ao cliente, reaproveitando informações existentes.
- Preservação do fluxo `A Fazer → etapas por tipo/função → revisão → validação → cliente → publicação`, dos checklists e do retorno ao produtor quando houver alteração.

Fase 5 continua dedicada ao onboarding; Fase 6, aos painéis/alertas de gestão; Fase 7, à execução auditável de tráfego, resultados comerciais e financeiro. Os objetivos dessas fases não estão resolvidos apenas pela melhoria de Projetos.

Detalhes, evidências e decisões em aberto: [Parecer de Projetos e planejamento](parecer-projetos-planejamento-2026-09-14.md).

## Objetivo

Permitir que o Planeje responda, com dados registrados:

- O que foi contratado para cada cliente neste mês?
- O que já foi planejado e entregue?
- Por que uma tarefa entrou na fila?
- Qual função executa a tarefa e quais pessoas estão designadas?
- Qual foi a promessa ao cliente?
- Qual entrega foi deslocada quando entrou uma urgência?
- Qual função está acima da capacidade configurada?

## O que foi implantado

### Escopo mensal

O escopo agora é salvo por cliente e mês. Alterar setembro não muda agosto, outubro nem o cadastro geral do contrato.

Campos:

- produto;
- situação do plano mantida como dado legado, sem edição no novo diálogo de escopo;
- posts, carrosséis, vídeos, stories e anúncios;
- canais;
- Meta Ads e Google Ads;
- responsável da conta;
- exceções do mês;
- objetivo e metas de tráfego, incluindo verba mensal, custo por mensagem/compra e ROAS.

A administração fica na ficha do cliente, com seleção de mês/ano e histórico. O novo editor pode usar o escopo anterior ou o contrato atual como base; grava somente o cliente/mês escolhido quando a pessoa salva. Exceções e aprovação anteriores não são reaplicadas automaticamente. Projetos apenas consulta esse registro. A antiga rotina de preparação em lote permanece no banco por compatibilidade, mas não é acionada ao abrir estas páginas.

### Fluxo normal de produção

Novas tarefas de conteúdo recebem um fluxo conforme o tipo. O sistema mostra a sequência completa e um botão para a próxima passagem.

- Arte/Carrossel: A Fazer, briefing, Em Produção com a função Design, revisão interna, validação Josias, envio e espera do cliente, preparação da postagem, agendado e publicado com evidência.
- Vídeo/Reels: A Fazer, briefing, roteiro, aprovação interna do roteiro, gravação, edição, revisão do material, validação Josias, envio e espera do cliente, preparação da postagem, agendado e publicado com evidência.

Cada etapa aponta para uma função operacional. A função define as pessoas que recebem a tarefa. A configuração fica em `Tarefas > Automações > Fluxos`; a troca de uma pessoa é feita em `Funções` e vale nas próximas passagens.

Tarefas antigas não foram colocadas nos fluxos automaticamente. Quando fizer sentido, a própria tarefa oferece `Aplicar fluxo em A Fazer`.

As regras de subtarefas obrigatórias foram mantidas. Elas funcionam como checklist para permitir a próxima passagem, enquanto o fluxo define a ordem e o responsável. Nenhum checklist foi preenchido sem validação da operação.

### Visão por função

Em Tarefas, `Visão da agência: Desativada` mostra somente o trabalho das funções da pessoa e tarefas antigas atribuídas diretamente a ela. As colunas também são reduzidas às etapas necessárias para esse trabalho.

O botão `Visão da agência` está disponível para todos. Quando ativado, mostra todas as tarefas e etapas permitidas pelos acessos já existentes. Essa alternância é apenas visual e não muda permissões. A escolha fica salva por usuário.

Ao entrar em alteração, o sistema devolve à última função registrada em uma etapa real de produção. Depois do ajuste, a interface oferece `Enviar novamente à revisão`.

### Controle de exceções na tarefa

A seção aparece como `Registrar correção, alteração, extra ou urgência`, fica recolhida no trabalho normal e possui ajuda no ícone `?`.

Os campos funcionam como exceção e conferência. O preenchimento automático segue estas regras:

- `Encaminhar para uma função` grava a função e atualiza as pessoas responsáveis na mesma automação;
- tarefa sem fluxo e com responsáveis pertencentes a uma única função recebe essa função;
- prioridade urgente define o tipo `Urgência`;
- tarefa ligada a um planejamento mensal do mesmo mês recebe `Planejada` e origem `Plano mensal`;
- entrada em `Alteração` soma a rodada e classifica a demanda como alteração;
- retorno ao produtor recupera também a função registrada quando houver histórico.

Quando houver mais de uma função possível ou nenhuma regra, o sistema deixa o campo vazio para conferência em vez de escolher por suposição.

Campos:

- tipo: planejada, correção, alteração, extra ou urgência;
- origem: plano mensal, cliente ou interno;
- SLA em dias úteis;
- data prometida ao cliente;
- rodada de revisão;
- tarefa deslocada e motivo do replanejamento.

Ao escolher uma tarefa deslocada, o motivo se torna obrigatório no banco. A partir da terceira revisão aparece um alerta visual.

### Fila da equipe

A aba `Fila da equipe` mostra, por função:

- pessoas vinculadas à função;
- tarefas com entrega na semana;
- tarefas atrasadas;
- total em aberto;
- limite semanal configurado;
- alerta quando a carga da semana ultrapassa o limite.

A consulta cobre as tarefas gerais e as tarefas de Redes Sociais. Ao clicar, o Planeje abre o detalhe no módulo correto.

A consulta pagina todas as tarefas do banco. A lista de exceções possui busca, data e botão `Mostrar todas`.

Sem limite cadastrado, o sistema mostra a carga e informa `Capacidade não definida`. Ele não presume que existe sobrecarga.

Tarefas antigas aparecem em `Tarefas sem função definida`. Elas continuam funcionando e podem ser classificadas aos poucos.


## Complemento implementado: ficha do cliente e Projetos

A navegação principal do projeto agora oferece **Planejamento, Calendário, Acompanhamento e Referências**. O projeto abre no planejamento e continua usando os planos, materiais e documentos existentes.

### Escrita e materiais

- Em `Planejamento > Plano`, a pessoa escreve objetivo, contexto/prioridades, comunicação, ações/campanhas e ações de tráfego.
- Em `Planejamento > Materiais`, começa pelo título e detalha briefing, roteiro, legenda, CTA, referências, canais e datas progressivamente.
- Pode começar em branco ou reaproveitar um plano do mesmo cliente. A cópia recebe novas identificações e não repete datas, responsáveis ou tarefas anteriores.
- Salvamento automático e manual possuem indicação de estado, recuperação de rascunho local e controle de versão contra sobrescrita por outra janela.
- Calendário edita os mesmos materiais. A troca de área tenta concluir a gravação antes de sair.
- `Ajuda com IA` é opcional e apresenta uma sugestão para conferência antes de aplicar. O trabalho manual não exige uso ou configuração de IA.

### Conexão com Tarefas

- `project_id` e `plan_material_id` identificam a tarefa do material. Uma restrição única e a operação de criação no banco evitam duplicação, inclusive em chamadas concorrentes.
- Renomear não rompe o vínculo. Tarefas antigas são associadas apenas por escolha explícita do usuário.
- A tarefa criada segue os fluxos, status, funções e automações existentes. Projetos mostra o acompanhamento e abre essa tarefa.
- Canais previstos são levados à tarefa para configurar as publicações no local existente. Destinos, responsáveis e evidências não são preenchidos por suposição.
- O contexto inicial do material segue para a tarefa. Edições posteriores do planejamento não substituem a execução já registrada nela.
- Não foi introduzida uma nova exigência de aprovação do plano para preparar tarefas.

### Contrato e leitura em Projetos/Cobertura

- A ficha do cliente é o local de edição do contrato/escopo mensal. O histórico e as permissões existentes são preservados.
- Projetos mostra o registro do mesmo mês. Quando ele não existe, informa que está usando apenas a referência atual do cadastro.
- A verba e as metas contratadas são editadas na ficha; o plano descreve as ações de tráfego.
- Cobertura leva à ficha e ao período correto, sem outro editor do contrato. A revisão completa da contabilização por tipo de entrega ainda requer conferência específica.

### Validação deste complemento

- **Concluído:** 46 testes automáticos e aceitação SQL para rollback, idempotência e concorrência na criação da tarefa do material.
- **Concluído:** conferência funcional na interface: ficha → projeto → plano manual → material → calendário → tarefa → publicações previstas → acompanhamento e reaproveitamento.
- **Pendente:** aceite de uso de Josias e revisão das métricas de Cobertura por tipo e da regra contratual de contabilização multicanal.

Este registro não altera a autorização de ambiente: produção continua preservada, e a fase não é marcada como concluída apenas pela implantação do código.

## Compatibilidade preservada

- Nenhuma automação existente foi apagada; a regra ativa de alteração passou a usar a última produção real do fluxo.
- Responsáveis continuam sendo pessoas em cada tarefa.
- Funções servem para organizar a execução e a capacidade.
- As 1.240 tarefas antigas foram preservadas sem classificação automática.
- Publicações por canal, briefing, anexos, subtarefas, histórico e mudança de status continuam no mesmo fluxo.

## Validação realizada na base da Fase 4, anterior ao complemento

- Backup do banco e do build anterior criado antes da fase.
- Migrações aplicadas apenas no teste.
- 22 escopos mensais preparados para setembro de 2026.
- Interface do escopo aberta e salvamento conferido.
- Nova fila carregada com 4 funções ativas e 58 tarefas abertas ainda sem função.
- Controle da demanda aberto dentro de uma tarefa real.
- Regra de replanejamento incompleto bloqueada pelo banco.
- Escrita de capacidade testada em transação e revertida.
- Teste automatizado de publicações por canal aprovado.
- Build Vite concluído com 3.778 módulos.
- Tarefa de conteúdo aberta diretamente em Redes Sociais a partir da fila.
- 26 tarefas existentes classificadas pelas próprias regras ativas.
- Inferência de função única, urgência e planejamento mensal testada dentro de transações revertidas.
- 8 testes de regras operacionais, 16 testes de compatibilidade do motor e teste de publicações aprovados.
- Nova tarefa de Arte testada em `Briefing → Design` com troca automática de Poliana para Jheimisson.
- Nova tarefa de Vídeo testada até `Edição → Revisão`, registrando a saída de uma etapa de produção.
- Interface conferida com 12 etapas do Vídeo e edição da função de cada etapa.
- Entrada `A Fazer → Briefing → Em Produção` da Arte simulada em transação revertida, com troca para a função Design.
- Visão pessoal conferida com Josias mostrando a função `Validação interna`; a visão completa foi ativada e desativada sem recarregar a página.
- Bundle de teste: `assets/index.931fe74f.js`.

## Validação de uso sugerida

1. Abrir `Tarefas > Fila`.
2. Abrir `Automações > Fluxos` e conferir a função de cada etapa de Arte e Vídeo.
3. Criar uma nova tarefa de Vídeo e conferir a entrada em A Fazer e a passagem seguinte para Briefing.
4. Avançar uma tarefa de teste por Roteiro, Aprovação do roteiro, Gravação, Edição e Revisão.
5. Enviar a tarefa para Alteração e conferir se retorna ao último produtor.
6. Conferir o novo envio para Revisão após o ajuste.
7. Definir o limite desta semana para uma função conhecida na Fila.
8. Testar uma urgência que desloca outra tarefa, informando o motivo.

## Reversão

Backup anterior à fase:

`/opt/planeje-staging/private/phase4-before-20260914T164656Z`

Backup anterior ao refinamento automático:

`/opt/planeje-staging/private/phase4-autonomy-before-20260914T173200Z`

Backup anterior aos fluxos configuráveis:

`/opt/planeje-staging/private/phase4-workflows-before-20260914T180000Z`

Arquivos da fase:

- `supabase/migrations/20260914170000_client_monthly_scopes.sql`
- `supabase/migrations/20260914190000_task_demand_control_and_capacity.sql`
- `supabase/migrations/20260914200000_autonomous_task_demand_control.sql`
- `supabase/migrations/20260914210000_configurable_content_workflows.sql`
- `supabase/migrations/20260914220000_workflow_entry_and_art_production.sql`
- `src/components/coverage/MonthlyScopeDialog.jsx`
- `src/components/pages/CoberturaMensalPage.jsx`
- `src/components/tasks/details/TaskDemandControl.jsx`
- `src/components/tasks/details/TaskWorkflowPanel.jsx`
- `src/components/tasks/automations/WorkflowTemplatesPanel.jsx`
- `src/components/tasks/TeamCapacityView.jsx`
- `src/components/tasks/details/TaskDetailsTab.jsx`
- `src/components/pages/Tasks.jsx`


Arquivos adicionais do complemento de planejamento:

- `supabase/migrations/20260914193700_stable_project_material_tasks.sql`
- `supabase/migrations/20260914195815_persist_project_planning_context.sql`
- `src/components/projects/ProjectPlanningWorkspace.jsx`
- `src/components/projects/ProjectTaskTracking.jsx`
- `src/components/projects/ProjectMonthlyScope.jsx`
- `src/components/projects/CampaignMaterialsCalendar.jsx`
- `src/components/clients/ClientMonthlyScope.jsx`
- `src/components/clients/MonthlyScopeSummary.jsx`
- `src/components/pages/ClientHubPage.jsx`
- `src/components/pages/ProjectDetail.jsx`
- `src/lib/projectPlanning.js`
- `src/lib/projectPlanTasks.js`
- `src/lib/clientMonthlyScopes.js`
- `scripts/projectPlanning.test.mjs`
- `scripts/projectMaterialRoundtrip.test.mjs`
- `scripts/projectPlanTasks.test.mjs`
- `scripts/clientMonthlyScopes.test.mjs`
- `scripts/projectPlanTasks.acceptance.sql`
- `scripts/projectPlanningContext.acceptance.sql`
