> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Parecer: Projetos como local do planejamento

Data: 14/09/2026. Este documento reúne o diagnóstico inicial, as correções de escopo de Josias e o complemento implementado após o pedido “vamos codar?”. As seções de diagnóstico retratam a situação anterior. O registro de implementação ao final descreve a entrega atual, exclusiva do ambiente de testes e ainda pendente de validação de uso.

## Pedido de Josias

Cobertura ainda parece um painel que precisa melhorar. Avaliar a página Projetos, que já se conecta a Tarefas, antes de criar outra área para planejamento. Preservar o fluxo em uso, simplificar a interface e continuar os desenvolvimentos apenas no ambiente de teste.

## Direção adotada após os esclarecimentos do usuário

Evoluir Projetos como local de planejamento por cliente e mês. Tarefas continua sendo o local de execução. Cobertura acompanha automaticamente contratado, planejado e entregue e abre o projeto ou tarefa correspondente.

Não criar um planejamento independente dentro de Cobertura. O escopo mensal existente deve ser compartilhado, sem redigitar quantidades em cada página.

## Evidência examinada

Inspeção somente de leitura do código da VPS de teste e da página Projetos no navegador. A presença de funcionalidades no código não equivale à validação ponta a ponta nesta análise.

- Projetos já tem cliente, mês/ano de referência, responsável, situação e tarefas vinculadas. Seu detalhe reúne Relatório, Plano de Campanha, Calendário, Documentos e Checklist.
- Plano e Calendário editam materiais do mesmo plano de campanha e possuem criação de tarefas com projeto, cliente, descrição, responsável e datas.
- Cobertura já usa os projetos do cliente/mês e o vínculo das tarefas ao projeto. O documento original de requisitos também descreve Cobertura como painel de contratado × planejado × entregue.
- O vínculo projeto–tarefa é direto, mas o painel reconhece o material que originou a tarefa por comparação de títulos. Renomear a tarefa pode deixar o material aparentando estar sem tarefa.
- As ações de criar tarefa do Plano e do Calendário não gravam um vínculo exclusivo com o material nem impedem, nesses caminhos, gerar outra tarefa para o mesmo material.
- Esses geradores ainda enviam uma plataforma textual; precisam ser integrados às publicações por canal já desenvolvidas.
- Checklist tem criação manual de tarefas, mas sua geração por IA informa que não foi implementada e preenche exemplos. Não deve ser apresentada como automação pronta.
- Cobertura guarda uma situação manual do plano, enquanto seu indicador de existência de plano usa a existência do projeto. É necessário distinguir existência, aprovação e execução.

## Ordem proposta para a próxima entrega

1. Definir a organização de Projetos para planejamento mensal sem presumir que todo projeto existente seja um plano mensal: há também campanhas e onboarding.
2. Consolidar material planejado e tarefa executada com vínculo estável e proteção contra geração duplicada, preservando tarefas já existentes.
3. Integrar tipos de material, briefing/roteiro, datas e publicações por canal ao fluxo configurável já validado.
4. Simplificar a navegação: escolher cliente e período, planejar materiais, acompanhar execução; explicações auxiliares em ícones de ajuda.
5. Ajustar Cobertura para consumir esses mesmos dados e apontar faltas por tipo de entrega, separando peça produzida de suas publicações por canal.

## Pontos que não foram decididos

- Momento exato em que a aprovação do planejamento libera execução. A proposta anterior de só gerar tarefas após aprovação não foi confirmada pelo usuário; o manual permite preparar tarefas antes dela.
- Relação entre um planejamento mensal e múltiplas campanhas/projetos do mesmo mês.
- Regra contratual para contar uma mesma peça em vários canais.

## Referências de código

Base examinada: `/opt/planeje-staging/source` na VPS de teste.

- `src/components/pages/Projects.jsx`
- `src/components/pages/ProjectDetail.jsx`
- `src/components/forms/ProjectForm.jsx`
- `src/components/projects/CampaignPlanner.jsx`: criação de tarefa em `confirmCreateTaskFromPlan`.
- `src/components/projects/CampaignMaterialsCalendar.jsx`: criação de tarefa em `confirmTask`.
- `src/components/projects/ChecklistGenerator.jsx`
- `src/lib/projectsOperationalMetrics.js`: `materialHasLinkedTask`.
- `src/components/pages/CoberturaMensalPage.jsx`
- `src/lib/coberturaMensal.js`
- `src/components/coverage/MonthlyScopeDialog.jsx`

A autorização posterior de implementação vale para o ambiente de testes. Não houve autorização de publicação em produção.

## Ampliação do pedido: revisar a experiência inteira de planejamento

Josias esclareceu que o trabalho deve avaliar o fluxo, as páginas e onde escrever, montar, gerenciar e construir o plano. A implementação anterior foi pensada em torno da IA, mas a IA deve ser uma ajuda opcional. Criar e manter o planejamento manualmente precisa ser simples e completo.

### Dificuldades observadas na estrutura atual

- A página se chama Projetos, a ação de entrada se chama Nova campanha e o formulário se chama Novo Projeto. Os termos precisam representar com clareza os usos reais, sem renomear todos os registros indiscriminadamente.
- O detalhe abre em Relatório. A elaboração fica na aba Plano de Campanha.
- A primeira seção do editor é Contexto para IA, incluindo escolha de modelo. Objetivo, estratégia, fases e tráfego aparecem antes de Materiais necessários, a quarta seção.
- O mesmo editor acumula estratégia, materiais e cronograma, além de diversos botões de IA. A edição manual existe, mas a organização dificulta encontrar o próximo passo.
- O Calendário também edita materiais. Essa possibilidade é útil desde que as duas visualizações compartilhem o mesmo registro e a tarefa correspondente.
- Documentos é uma biblioteca do cliente, embora apareça dentro do projeto. Deve servir de referência para o plano sem obrigar a copiar o mesmo conteúdo para vários lugares.

### Jornada proposta para discussão

Projetos → escolher cliente e período/projeto → escrever o plano → montar os materiais → organizar datas → acompanhar execução.

Essas são ações disponíveis e conectadas, não um assistente que obrigue preencher tudo em sequência. Uma pessoa pode começar com uma ideia e completar briefing, datas e responsáveis ao preparar a execução.

| Local | Trabalho principal | Simplificação proposta |
| --- | --- | --- |
| Entrada em Projetos | Localizar o planejamento e retomá-lo | Evidenciar cliente, período, situação e ação de continuar; permitir começar em branco ou reaproveitar um modelo/plano anterior. |
| Planejamento | Escrever contexto do mês, objetivo, prioridades e ações | Blocos editáveis com texto livre dentro de cada bloco; recuperar informações já cadastradas e mostrar o escopo vinculado. Formato de escrita ainda em consulta ao usuário. |
| Materiais do planejamento | Transformar pautas em peças concretas | Adicionar material rapidamente; abrir detalhes para briefing, roteiro/texto, legenda/CTA, referências, canais e prazos conforme necessário. |
| Calendário | Distribuir o mesmo trabalho no tempo | Outra visão dos materiais e publicações, com datas de produção/entrega e postagem claramente distinguidas. |
| Acompanhamento | Saber o que falta e quem está atuando | Consultar o andamento da tarefa vinculada e abrir a tarefa existente, preservando as etapas e automações configuradas. |
| Referências | Consultar materiais e documentos do cliente | Acesso contextual no planejamento/material; não exigir um segundo documento para o mesmo briefing. |

O posicionamento de Materiais como seção visível do Planejamento ou como aba própria ainda é uma decisão de interface. O objetivo é acesso direto e um único conteúdo, sem novo cadastro paralelo.

### Papel da IA

- Disponível sob solicitação para sugerir pautas, ajudar no roteiro, revisar texto, resumir referências ou organizar ideias.
- O usuário deve conseguir concluir o mesmo trabalho sem configurar ou usar IA.
- Sugestões precisam ser revisáveis e editáveis antes de substituir conteúdo existente.
- Configuração técnica de modelo não deve ser o primeiro passo para escrever um plano.

### Critérios de aceitação para a futura implementação

1. Criar e retomar um planejamento manualmente, sem depender de IA e com indicação confiável de salvamento.
2. Adicionar uma ideia/material como rascunho e detalhá-la progressivamente. Campos obrigatórios de execução serão alinhados ao fluxo confirmado, sem impor novas barreiras nesta proposta.
3. Editar o mesmo material pela lista ou pelo calendário sem criar cópias independentes.
4. Abrir a tarefa correspondente e manter o vínculo mesmo após renomear o material/tarefa.
5. Usar a mesma peça em vários canais, com dados próprios de publicação e sem repetir a produção.
6. Preservar planos, documentos, tarefas existentes e as automações já validadas; testar no ambiente de teste.
7. Manter instruções auxiliares em ícones de ajuda e destacar ações concretas na tela.

### Decisões que permanecem em aberto

- Preferência de escrita: blocos editáveis + materiais, documento livre ou calendário como ponto de partida. Pergunta enviada a Josias nesta revisão.
- Momento em que um material se torna tarefa executável e como a aprovação do plano se relaciona com isso.
- Aba inicial para projetos já em execução versus projetos em planejamento.

A aprovação do plano mensal e a revisão/aprovação de cada material são decisões diferentes. Esta revisão não altera o fluxo de revisão do material já confirmado por Josias.

## Conferência com o pedido inicial e a Fase 4

Conferência realizada a pedido de Josias com o manual operacional, a especificação original, o plano de implantação de 30 dias, o programa mestre e o documento da Fase 4. A tabela avalia a proposta; não certifica implantação nem declara que os demais módulos estejam ausentes do sistema.

| Requisito | Encaixe no desenho proposto | Ponto a completar/verificar |
| --- | --- | --- |
| Planejamento por cliente e mês | Atendido pela proposta de Projetos | Fechar formato de escrita, criação e reaproveitamento; implementar e validar. |
| Contratado × planejado × entregue | Parcial | Compartilhar escopo e calcular por tipo, distinguindo peça e publicação por canal. |
| Briefing, roteiro, legenda/CTA e referências | Contemplado em Materiais | Respeitar preparação progressiva e as etapas reais; evitar obrigar o roteiro completo já na criação da tarefa. |
| Responsabilidade configurável por função | Preservação obrigatória | Reutilizar o fluxo e automações existentes; não criar outro fluxo concorrente em Projetos. |
| Mesma peça em vários canais | Contemplado | Integrar a geração de tarefas e manter vínculo estável, sem duplicação de produção. |
| Prazos, fila, capacidade, urgências e replanejamento | Parcial | Tornar consultável a relação com as entregas planejadas; nenhuma redistribuição automática presumida. |
| Objetivos, canais, verba e metas de mídia do mês | Complemento necessário na proposta | O planejamento de tráfego deve aparecer junto ao planejamento do cliente; não reduzir Projetos a um calendário de posts. |
| Uso simples, manual e IA opcional | Diretriz confirmada nesta revisão | Avaliar criação, edição, salvamento, retomada e reaproveitamento; ajuda complementar atrás de ?. |
| Toda a gestão da agência | Escopo do programa completo | A Fase 4 não encerra onboarding, painéis de gestão, execução de tráfego, CRM de resultados e financeiro. |

### Limite entre as fases

A Fase 4 registrada trata de escopo mensal, demanda, fila, capacidade e SLA. Melhorar a elaboração do planejamento e sua passagem para execução é o complemento solicitado para tornar essa base utilizável. Não se trata de substituir essas entregas por uma nova página independente.

Segundo o programa mestre, a Fase 5 cobre onboarding; a Fase 6 cobre painéis, alertas e gestão; a Fase 7 cobre tráfego auditável, resultados comerciais e financeiro. Objetivos e metas de mídia já participam do planejamento mensal da Fase 4; execução e acompanhamento especializados continuam no programa posterior.

O programa mestre e o escopo da Fase 4 foram atualizados para distinguir a base técnica já entregue do complemento ainda pendente. Nenhum código, banco ou fluxo de produção foi alterado nesta conferência.

## Divisão de responsabilidades corrigida com Josias

Josias indicou que contrato e escopo devem estar na ficha do cliente e reforçou que a execução não pode conflitar com automações, fluxos e funções já existentes em Tarefas.

- **Ficha do cliente:** local de cadastro e manutenção do contrato, serviços e quantidades contratadas. O escopo de cada mês permanece vinculado ao cliente, preservando o histórico mensal. Esses controles foram integrados à ficha no complemento descrito abaixo; a validação de uso permanece pendente.
- **Projetos / Planejamento:** consulta o contrato e o escopo do período para montar objetivos, ações e materiais. Mostra contratado versus planejado, sem criar um segundo cadastro do contrato. Uma ação de ajuste deve levar ao cadastro correspondente na ficha do cliente.
- **Tarefas:** continua sendo o único mecanismo de execução: status, automações de responsáveis, funções, etapas, revisões, alterações e publicações. Tarefas originadas no planejamento devem usar o mesmo caminho e as mesmas regras das demais tarefas.
- **Acompanhamento em Projetos:** apresenta o andamento das tarefas vinculadas e permite abrir o detalhe da tarefa. Não mantém um status paralelo de execução nem define responsáveis concorrentes com as automações. A situação do planejamento/projeto é diferente do status de cada tarefa.
- **Cobertura:** consolida os dados da ficha do cliente, dos planejamentos e das tarefas/publicações, sem outro cadastro ou fluxo independente.

Critério de validação: alterações feitas na tarefa precisam aparecer no acompanhamento do projeto, e criar uma tarefa pelo planejamento deve acionar o fluxo configurado sem substituir suas funções, responsáveis ou regras por outra lógica local.


## Implementação autorizada — complemento da Fase 4

**Estado em 14/09/2026:** implementação realizada para a VPS de testes `2.25.216.103`. Os testes automáticos e a aceitação SQL descritos abaixo foram concluídos. A conferência funcional da interface foi concluída; Josias ainda precisa validar a jornada. Produção `72.60.14.109` permanece fora desta entrega.

### Organização das páginas

| Área | Comportamento implementado |
| --- | --- |
| Ficha do cliente | Seção `Contrato e escopo mensal`, com seleção de mês/ano, quantidades, canais, ajustes, metas de tráfego e histórico. O cadastro atual continua sendo a base do contrato. |
| Projetos → Planejamento | Entrada para escrever manualmente o objetivo do período, contexto/prioridades, comunicação, ações e campanhas. Permite começar em branco ou reaproveitar outro plano do mesmo cliente. |
| Planejamento → Materiais | Adição e edição progressiva do título, tipo, briefing, roteiro/texto, legenda, CTA, referências, canais previstos e datas. |
| Calendário | Outra visão e edição dos mesmos materiais do planejamento. Datas e alterações preservam a identificação do material. |
| Acompanhamento | Consulta das tarefas reais do projeto e abertura do detalhe em Tarefas. Não há outro fluxo de execução. |
| Referências | Acesso aos documentos existentes do cliente, sem criar nova biblioteca independente para cada projeto. |
| Cobertura | Consulta os registros existentes e abre o escopo na ficha do cliente e no período selecionado. Não apresenta mais um editor concorrente do contrato. |

A implementação usa blocos editáveis e a divisão `Plano` / `Materiais`. Essa escolha de interface foi executada dentro do desenho autorizado e ainda será avaliada pelo usuário no uso real.

### Contrato, escopo e tráfego

- A ficha do cliente concentra o escopo do mês. O editor está disponível para administradores; as permissões de leitura existentes são preservadas.
- Um novo escopo pode partir do anterior ou do cadastro atual. O registro só é criado quando a pessoa salva; abrir a ficha ou consultar Projetos não prepara contratos de outros clientes.
- Exceções específicas e aprovação do mês anterior não são carregadas automaticamente para o novo mês.
- Objetivo, verba mensal, custo por mensagem/compra e ROAS podem ser registrados no escopo. A verba não é inferida a partir do limite da conta de anúncios.
- Projetos consulta o escopo do cliente/mês. Sem registro mensal, mostra explicitamente a referência atual do cadastro, sem apresentá-la como contrato histórico daquele mês.
- O plano descreve as ações de tráfego, o público e a distribuição pretendida. A edição de verba e metas contratadas permanece na ficha do cliente; valores antigos do plano são preservados como referência.
- A situação do plano deixou de ser editável no diálogo de escopo. O campo legado é preservado no banco, mas não cria uma segunda regra de aprovação ou execução.
- A atualização do escopo detecta alterações concorrentes e evita confirmar um salvamento que não modificou nenhum registro.

### Planejar, salvar e executar

- O planejamento manual possui indicação de salvamento, gravação automática, botão Salvar, rascunho local recuperável e controle de versão para detectar edição em outra janela.
- Reaproveitar um plano copia textos e materiais com novas identificações. Não reutiliza tarefas, datas nem responsáveis antigos como se fossem entregas do novo projeto.
- Materiais do plano e do calendário usam a mesma identificação. A relação com a tarefa usa `project_id` e `plan_material_id`, com unicidade no banco; o título deixa de determinar o vínculo.
- `Criar tarefa` usa uma operação única no banco. Repetir o pedido para o mesmo material retorna a tarefa existente, inclusive sob concorrência.
- Uma tarefa antiga pode ser vinculada por escolha explícita do usuário. Não há associação automática por semelhança de título nem reclassificação em massa.
- Criar pelo planejamento passa pelo motor já existente de Tarefas. O novo acompanhamento não redefine status, funções ou responsáveis por conta própria.
- A tarefa recebe o contexto do material na criação. Alterações posteriores nas anotações do plano não sobrescrevem conteúdo, responsáveis ou andamento já registrados na tarefa.
- Os canais previstos seguem para a tarefa como canais a configurar. Destino, responsável, data, status e comprovação permanecem na área Publicações; o sistema não inventa esses dados para completar uma publicação.
- A tarefa não pode ser encerrada como publicada enquanto faltar a configuração dos canais previstos exigida pela regra adicionada. As regras existentes de publicação por canal continuam valendo.

### IA como apoio opcional

O botão `Ajuda com IA` abre o assistente sob solicitação. A sugestão é apresentada para conferência, podendo ser descartada ou aplicada pelo usuário. O fluxo manual não depende da IA. O funcionamento completo da integração de IA não foi declarado validado nesta entrega; a geração real por IA não foi acionada nesta validação.

### Evidência técnica registrada nesta implementação

- 46 testes automáticos concluídos com sucesso, cobrindo as regras trabalhadas na integração.
- Aceitação SQL concluída para rollback e idempotência, incluindo requisições concorrentes de criação da tarefa do mesmo material.
- Interface conferida no navegador: escrita e persistência, material multicanal, calendário clicável, vínculo da tarefa, automação de responsável, acompanhamento e reaproveitamento. Não há aceite do usuário registrado para este complemento.

Arquivos principais:

- `src/components/projects/ProjectPlanningWorkspace.jsx`
- `src/components/projects/ProjectTaskTracking.jsx`
- `src/components/projects/ProjectMonthlyScope.jsx`
- `src/components/projects/CampaignMaterialsCalendar.jsx`
- `src/components/clients/ClientMonthlyScope.jsx`
- `src/components/clients/MonthlyScopeSummary.jsx`
- `src/components/pages/ClientHubPage.jsx`
- `src/components/pages/ProjectDetail.jsx`
- `src/components/pages/CoberturaMensalPage.jsx`
- `src/lib/projectPlanning.js`
- `src/lib/projectPlanTasks.js`
- `src/lib/clientMonthlyScopes.js`
- `supabase/migrations/20260914193700_stable_project_material_tasks.sql`
- `supabase/migrations/20260914195815_persist_project_planning_context.sql`

### Limites e validação restante

1. Conferir visualmente criar/retomar o plano, detalhar materiais, alternar para Calendário, criar/abrir a tarefa e voltar ao acompanhamento sem perda de dados.
2. Josias validar a clareza das páginas, nomes, campos e próximos passos; o complemento não encerra a Fase 4 sem essa conferência.
3. A comparação completa de Cobertura por tipo de entrega não é declarada concluída nesta entrega. Os cálculos existentes devem ser reconciliados com os novos vínculos antes dessa afirmação.
4. Definir a regra contratual de contabilização de uma mesma peça em vários canais e o tratamento de múltiplos projetos no mesmo mês. O escopo mensal é compartilhado; não foi presumida uma nova cota por projeto.
5. Aprovação do plano e aprovação de cada material permanecem distintas. Não foi introduzida uma nova trava exigindo aprovação do plano antes de preparar uma tarefa.
6. Onboarding, painéis/alertas amplos e execução especializada de tráfego/comercial/financeiro continuam nas fases posteriores do programa.
