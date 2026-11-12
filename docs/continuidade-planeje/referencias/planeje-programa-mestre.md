> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Planeje — Programa mestre de evolução

**Atualizado em:** 16/09/2026  
**Regra de ambiente:** concluir e validar todas as fases na VPS de testes antes de atualizar a produção.

**Ponto de retomada:** fases 1–5 possuem entregas no ambiente de testes; a fase 5 (Onboarding controlado) foi validada tecnicamente e ainda precisa de revisão de uso. Fases 6–7 permanecem planejadas. O contexto consolidado para Claude, Cursor e outros agentes está em [Continuidade do Planeje](../README.md), incluindo refinamentos posteriores, estado atual, decisões, mapa técnico, operação e pendências.

Os registros abaixo preservam a cronologia. Contagens e bundles são medições de cada entrega, e propostas antigas podem ter sido superadas. Não reaplicar alterações por ler um “próximo passo” histórico.

## 1. Pedido original

Analisar o Planeje sem quebrar o sistema que já orquestra a agência e evoluí-lo para controlar toda a empresa: da tarefa simples à produção de conteúdo, aprovação, publicação, tráfego, resultado comercial e gestão.

O sistema deve ser funcional, simples e configurável. Explicações longas devem ficar atrás do ícone `?`. Os processos não podem depender de uma pessoa fixa; funções, responsáveis e substituições precisam ser configuráveis.

## 2. Ambientes e segurança

| Ambiente | Endereço | Uso |
|---|---|---|
| Produção | `72.60.14.109` | Sistema atual da equipe. Não alterar até todas as fases serem concluídas e validadas. |
| Testes | `2.25.216.103` | Desenvolvimento, migrações e validações. |
| Acesso local ao teste | `http://localhost:18080` | Túnel do Mac para a VPS de testes. |

Regras adotadas:

- Criar backup antes de cada alteração estrutural.
- Aplicar banco e interface somente no teste.
- Validar compilação, regras de banco, interface e dados existentes.
- Manter caminho de reversão para cada fase.
- Promover para produção somente após todas as fases e uma autorização final.

### Decisões registradas desde o início

- O acesso SSH foi preparado com chave própria do Planeje no Mac.
- O sistema atual foi lido e comparado com o manual operacional, a especificação e o plano de implantação antes de qualquer mudança.
- A recuperação do snapshot da VPS atual foi confirmada pelo usuário.
- Foi escolhida uma VPS separada para testes, evitando desenvolver dentro da produção.
- O acesso local `localhost:18080` aponta para a VPS de testes; ele não é uma cópia executada somente no Mac.
- O usuário decidiu concluir todas as fases no teste e fazer uma validação geral antes da produção.
- A configuração deve representar etapas e funções substituíveis; pessoas são designadas conforme o momento, preservando a automação de responsáveis já existente.

## 3. Fluxo operacional confirmado

### Produção e aprovação

1. A equipe produz o material.
2. O material segue para revisão interna.
3. Poliana aprova internamente.
4. Josias valida.
5. Jheimisson assume o contato e envia ao cliente.
6. Se o cliente pedir alteração, volta para quem produziu.
7. O material percorre novamente revisão → Poliana → Josias → cliente.
8. Quando aprovado, segue para agendamento e publicação.

As pessoas podem mudar. O sistema deve permitir configurar quem executa cada etapa e manter a automação de troca de responsáveis existente.

### Material publicado em vários canais

- Existe uma tarefa principal de produção.
- Cada canal é uma ocorrência/etapa independente dentro da tarefa.
- Cada canal possui destino, responsável, data, status, formato, versão, legenda, material e comprovação.
- Publicar em um canal não conclui os demais.
- Reagendamento, alteração e cancelamento ficam no histórico.
- A tarefa principal não pode ser publicada enquanto houver canal pendente.
- Um canal publicado exige data e link de comprovação.
- Canais cancelados permanecem registrados e não contam no progresso.

## 4. Diretrizes de experiência

- Mostrar primeiro a próxima ação, o responsável e o prazo.
- Evitar campos duplicados e informações que não se aplicam ao tipo da tarefa.
- Usar seleção múltipla para canais.
- Tratar publicações como etapas da mesma tarefa.
- Separar anexos do material principal dos anexos específicos de cada canal.
- Identificar tarefas multicanal no Kanban e na Lista com logos e progresso.
- Manter instruções complementares atrás de `?`.

## 5. Fases executadas

### Fase 1 — Base do fluxo operacional

Status, funções operacionais e automações existentes foram diagnosticados e organizados no ambiente de testes. O fluxo de revisão, validação, cliente, alteração, agendamento e publicação foi testado sem substituir a automação atual por regras fixas de pessoas.

### Fase 2 — Publicações por canal

Entregue no teste:

- Tabela segura de publicações por canal com histórico.
- Bloqueio de conclusão da tarefa enquanto existirem canais pendentes.
- Filas `A publicar`, `Agendados` e `Concluídos` em Redes Sociais.
- Ocorrências independentes no calendário.
- Seleção de responsável, data, status, destino, versão e comprovação.
- Compatibilidade com tarefas antigas que não possuem publicações vinculadas.

Validação: Instagram e YouTube publicados; Facebook reagendado e cancelado; bloqueios e histórico conferidos.

### Refinamento de fluidez da Fase 2

Entregue no teste:

- Seleção de vários canais antes da configuração.
- Cada canal exibido como etapa da tarefa.
- Troca rápida de status sem sair da tarefa.
- `Publicado` abre data e comprovante.
- Aba Anexos dividida em material principal e canais.
- Logos dos canais e progresso nos cartões do Kanban e da Lista.
- Campo simples `Plataforma` ocultado nas tarefas de conteúdo; valores antigos preservados.
- Correção do cache que podia fechar o detalhe durante uma atualização.

Caso validado: `TESTE FLUIDEZ — Canais e anexos 14/09`.

## 6. Fase 3 — Detalhe operacional da tarefa

**Status:** concluída e validada tecnicamente na VPS de testes em 14/09/2026.

Objetivo: reduzir rolagem, destacar o que precisa ser feito e separar as áreas de trabalho.

Escopo:

- Cabeçalho operacional com etapa atual, prazo, responsáveis e progresso dos canais.
- Abas claras: `Tarefa`, `Publicações`, `Anexos`, `Comentários` e `Histórico`.
- Publicações deixam de ficar misturadas ao formulário e ganham área própria.
- Contadores nas abas para indicar canais e anexos.
- Campos e orientações adequados ao tipo da tarefa.
- Navegação responsiva para celular e desktop.
- Preservar salvamento, automações, briefing, subtarefas e histórico atuais.

Critérios de aceite:

1. O usuário entende etapa, prazo e responsável sem rolar a tela.
2. A área de publicação é acessada em um clique.
3. Alterar um canal não fecha a tarefa nem perde dados do formulário.
4. Tarefas sem canais continuam funcionando normalmente.
5. Nenhuma automação ou tarefa existente é alterada pela atualização visual.

Entregue:

- Resumo fixo no topo com etapa atual, prazo, responsáveis e andamento dos canais.
- Área `Publicações` separada do formulário da tarefa.
- Navegação por `Tarefa`, `Publicações`, `Anexos`, `Comentários` e `Histórico`.
- Contadores de canais e anexos visíveis nas abas.
- Abas com rolagem horizontal em telas estreitas.
- Tarefas de conteúdo sem canais exibem `Publicações 0` e continuam prontas para configuração.
- Tarefas de outros tipos continuam sem depender de publicações.
- Textos auxiliares atualizados para os nomes novos das abas.
- Datas das publicações podem ser digitadas ou escolhidas em um calendário aberto por botão.
- O mesmo calendário foi aplicado em `Data publicada`.

Validação da Fase 3:

- Build Vite concluído com 3.775 módulos.
- Teste automatizado de publicações por canal aprovado.
- Caso multicanal aberto com 3 canais e 2 anexos.
- Status do YouTube alterado para `Agendado` e revertido para `A publicar`; o detalhe permaneceu aberto e os dados do formulário foram preservados.
- Anexos conferidos em material principal, Instagram, Facebook e YouTube.
- Tarefa antiga `[SpeedNet] Arte - Dia da Arvore`, sem canais, aberta sem erro.
- Requisições do navegador e do banco responderam com sucesso durante o teste.
- Quantidades preservadas após a implantação visual: 13 automações de tarefa, 5 automações de CRM, 2 regras de fluxo e 13 status.
- Versão implantada no teste: `assets/index.e62d2f4a.js`.

## 7. Próximas fases planejadas

### Fase 4 — Escopo mensal, fila, capacidade e SLA

**Status:** implementação funcional na VPS de testes. Planejamento manual em Projetos, escopo mensal na ficha do cliente, vínculo material–tarefa, primeira etapa necessária, fila/capacidade e Cobertura operacional por tipo estão integrados. A validação técnica está concluída; o aceite final de uso de Josias continua pendente antes de qualquer promoção para produção.

Complemento solicitado por Josias em 14/09/2026:

- Revisar as páginas e a jornada de criar, escrever, montar, reaproveitar e gerenciar o planejamento por cliente/período em Projetos.
- Tornar a elaboração manual simples e completa, com IA como ajuda opcional e conteúdo editável.
- Compartilhar o escopo mensal entre Projetos e Cobertura; distinguir projeto existente de planejamento efetivamente preparado e de plano aprovado.
- Ligar cada material à tarefa com vínculo estável, evitando geração duplicada e integrando as publicações por canal.
- Relacionar as entregas planejadas com prazos, fila/capacidade e exceções já existentes, sem inventar replanejamento automático.
- Manter no planejamento os objetivos, canais, verba e metas de tráfego previstos nos requisitos iniciais; execução diária, otimizações, resultados comerciais e financeiro continuam no escopo da Fase 7.
- Preservar os fluxos configuráveis já validados, outros usos de Projetos e todos os dados existentes.

A proposta de interface e as decisões ainda abertas estão em [Parecer de Projetos e planejamento](parecer-projetos-planejamento-2026-09-14.md). A revisão não define sozinha novas regras de aprovação do plano nem o momento de liberação das tarefas.

Divisão de responsabilidades esclarecida com Josias: contrato e escopo são administrados na ficha do cliente, com histórico por mês; Projetos consulta esses dados para elaborar o planejamento; Tarefas permanece como único mecanismo de execução e automações. O acompanhamento em Projetos reflete as tarefas vinculadas e abre seus detalhes, sem status de execução ou regras de responsáveis paralelos. A integração dessa divisão foi implementada no complemento abaixo, com validação de uso ainda pendente.

Entregue:

- Escopo mensal próprio por cliente e mês, sem alterar o cadastro geral do contrato.
- Preparação automática dos 22 clientes ativos, copiando o mês anterior quando existir.
- Histórico de criação e alteração do escopo.
- Quantidades mensais de posts, carrosséis, vídeos, stories e anúncios.
- Canais, tráfego Meta/Google, produto, responsável da conta e exceções do mês. A situação do plano permanece como dado legado, sem edição no novo diálogo de escopo.
- Cobertura mensal reaproveitada para comparar contratado, planejado e entregue.
- Cobertura redesenhada com cabeçalho compacto, leitura executiva do mês, cartões de indicadores, busca, filtros e tabela operacional agrupada; cálculos, detalhamento por tipo e atalhos existentes foram preservados.
- Controle recolhível de exceções dentro da tarefa para tipo de demanda, origem, SLA, promessa ao cliente e rodada de revisão.
- Registro obrigatório de motivo junto da tarefa deslocada quando houver replanejamento.
- Alerta visual a partir da terceira rodada de revisão.
- Nova aba `Fila da equipe` com carga semanal, atrasos e tarefas em aberto por função.
- A fila inclui também tarefas do módulo de Redes Sociais e abre cada item diretamente no módulo correto.
- Capacidade semanal configurável por função; sem número inventado pelo sistema.
- Lista de tarefas que ainda não possuem função definida, permitindo adoção gradual.
- Pessoas continuam nos responsáveis da tarefa; funções não substituem as automações existentes.
- A ação `Encaminhar para uma função` agora grava a função na tarefa e troca os responsáveis na mesma execução.
- Tarefas novas inferem a função somente quando os responsáveis pertencem a um único destino possível.
- Prioridade urgente classifica automaticamente a demanda como urgência.
- Tarefas ligadas ao planejamento mensal do mesmo mês são classificadas como planejadas e originadas no plano.
- O retorno para alteração classifica a demanda e soma automaticamente a rodada de revisão.
- O retorno ao produtor também recupera a função registrada quando esse histórico existir.
- A fila carrega todas as páginas de tarefas, possui busca e permite mostrar todas as exceções sem função.
- Fluxos configuráveis foram adicionados para novas tarefas de Arte/Carrossel e Vídeo/Reels.
- Arte segue `A Fazer → Briefing → Em Produção (Design) → Revisão → Josias → Cliente → Postagem → Evidência`.
- Vídeo segue `A Fazer → Briefing → Roteiro → Aprovação do roteiro → Gravação → Edição → Revisão do material → Josias → Cliente → Postagem → Evidência`.
- Cada etapa aponta para uma função; a função resolve as pessoas responsáveis sem gravar nomes fixos no fluxo.
- A tela `Automações > Fluxos` permite trocar a função responsável por cada etapa.
- Tarefas antigas não receberam fluxo automaticamente; a adesão é explícita dentro da tarefa.
- Ao pedir alteração, o sistema procura a última função que realmente produziu aquele material e preserva o ciclo de revisão.
- O formulário mostra o fluxo como uma sequência de etapas e oferece a próxima passagem em um botão.
- Em tarefas com fluxo, os responsáveis são definidos pela etapa e o campo manual deixa de competir com a automação.
- As subtarefas obrigatórias foram preservadas como checklist de conclusão das etapas; nenhuma foi criada por suposição.
- A tela de Tarefas abre na visão das funções da pessoa e inclui também atribuições diretas antigas.
- Nessa visão, o Kanban mostra somente etapas relacionadas às funções da pessoa ou às tarefas que ela precisa resolver.
- O controle `Visão da agência` está disponível para todos e alterna para o quadro completo sem mudar permissões.
- A preferência da visão fica salva para cada usuário.

Validação técnica da base, anterior ao complemento:

- 1.240 tarefas antigas preservadas; nenhuma recebeu classificação presumida.
- 6 funções preservadas, sendo 4 ativas.
- 26 tarefas atuais classificadas a partir das próprias automações ativas; destinos ambíguos permaneceram sem função.
- Gravação de capacidade testada dentro de transação e desfeita ao final.
- Banco bloqueou replanejamento com tarefa deslocada sem motivo.
- Interface da fila e controle recolhível da tarefa conferidos no navegador.
- Teste de publicações por canal aprovado e build Vite concluído com 3.778 módulos.
- Testes do motor operacional: 24 casos aprovados, além do teste de publicações.
- Fluxos de Arte e Vídeo simulados dentro de transações revertidas; nenhum registro de teste permaneceu.
- Interface de nova tarefa de Vídeo conferida iniciando em Briefing com as 12 etapas visíveis.
- Configuração de funções por etapa conferida em `Automações > Fluxos`.
- A coluna separada `Design`, criada no primeiro desenho, foi retirada sem uso; a criação da Arte utiliza o status existente `Em Produção` com a função Design.
- Versão implantada no teste: `assets/index.931fe74f.js`.


#### Complemento implementado em 14/09/2026 — planejamento utilizável

Autorização: após os esclarecimentos sobre contrato na ficha do cliente e preservação das automações de Tarefas, Josias solicitou “vamos codar?”. A implementação permanece exclusiva do ambiente de testes.

- **Ficha do cliente:** seleção de mês/ano, edição e histórico do escopo mensal, incluindo quantidades, canais e metas de tráfego. Abrir a página não cria registros; o salvamento atua no cliente/mês escolhido. Contrato atual e histórico mensal permanecem distintos.
- **Projetos:** lista simples de planos mensais, incluindo planos vazios. Cada plano abre como documento livre; informações estruturadas ficam recolhidas e opcionais.
- **Materiais:** título, tipo, briefing, roteiro, legenda/CTA, referências, canais previstos e datas podem ser desenvolvidos aos poucos. Lista e Calendário utilizam a mesma identificação do material.
- **Atalhos de datas:** cada linha de material permite escolher por calendário a data de criação e a data de postagem sem abrir o editor. Em material vinculado, a alteração também atualiza a tarefa correspondente.
- **Fluxo e responsáveis:** ao abrir a linha, o material mostra o fluxo e quem recebe sua entrada. Um clique abre a sequência completa de etapas, funções e pessoas. O fluxo pode ser automático pelo tipo ou escolhido entre modelos compatíveis; as trocas posteriores continuam no motor de Tarefas.
- **Primeira etapa necessária:** cada material confirma se o briefing está pronto e, em vídeo, a situação do roteiro. A tarefa permanece em A Fazer, já atribuída à função que deve agir primeiro, e `Iniciar` pula somente as etapas confirmadas como concluídas.
- **Painel de materiais:** lista única e compacta, com uma linha por material e colunas para criação, postagem e primeiro passo. Resumo, canais, fluxo, responsáveis e ações aparecem ao abrir a linha. A edição completa foi organizada em Identificação, Preparação e fluxo, Conteúdo para produção e Distribuição.
- **Nomenclatura:** antes de criar a tarefa, cada linha mostra `[Cliente] Tipo Número - Nome`. O número pode ser informado no plano, sugerido pela IA ou completado pela sequência do tipo. Materiais antigos sem número continuam compatíveis; tarefas já criadas não são renomeadas.
- **Reaproveitamento e salvamento:** copiar um plano do mesmo cliente cria novas identificações sem repetir datas, responsáveis ou tarefas. Há salvamento automático/manual, rascunho local e detecção de edição concorrente.
- **Conexão com execução:** vínculo único entre projeto/material e tarefa, criação idempotente e associação explícita de tarefas antigas. O acompanhamento consulta Tarefas; não acrescenta outro motor de status, funções ou responsáveis.
- **Publicações:** canais previstos seguem para a configuração na própria tarefa. Destino, responsável e comprovação continuam sob as regras existentes de Publicações; não são inventados no planejamento.
- **IA opcional:** ajuda sob solicitação, com conferência antes de aplicar. Em `O que será produzido`, a IA lê o documento e prepara uma revisão editável dos materiais; eles só viram tarefas em A Fazer depois da revisão e do comando individual. O fluxo manual funciona sem IA.
- **Atalho operacional:** `O que será produzido` prepara o material e o encaminha para Tarefas; não executa um fluxo paralelo. A edição acontece na própria lista. Após o envio, status, automações, funções, responsáveis e publicações continuam sob o módulo Tarefas.
- **Fluxo de uso:** plano livre → itens que serão produzidos → revisão de cada item → tarefa em A Fazer. O acompanhamento das tarefas fica abaixo do mesmo plano; calendário e referências são acessos secundários.
- **Visão da agência:** o painel completo permanece disponível por um botão, sem ser a entrada obrigatória do planejamento.
- **Documento do plano:** editor visual com formatação equivalente ao editor de documentos do Planeje. O formato salvo continua compatível com planos antigos, e a IA consome uma versão em texto limpo.
- **Cobertura:** consulta o escopo e direciona sua manutenção à ficha do cliente no mesmo período. Compara contratado × planejado × sem tarefa × em execução × entregue por tipo. Um material multicanal conta uma vez no contrato; cada canal é acompanhado como publicação. Nova edição ou novo formato exige outro material e conta separadamente.

Validação registrada deste complemento: **46 testes automáticos aprovados** e **aceitação SQL concluída para rollback e idempotência concorrente**. A interface foi conferida e o usuário ainda não validou esta entrega. O teste da integração externa de IA não é declarado concluído.

Não foram criadas regras novas de aprovação do plano como condição para preparar tarefas nem de redistribuição automática da equipe. As fases 5, 6 e 7 mantêm seus escopos. O histórico detalhado está no [Parecer de Projetos e planejamento](parecer-projetos-planejamento-2026-09-14.md).

### Fase 5 — Onboarding controlado

- **Status em 16/09/2026:** implementação funcional no ambiente de testes, com validação técnica do fluxo completo e concorrência. Autorizada por Josias ao avançar para a fase 5. O aceite de uso permanece separado da implementação e da promoção para produção. Detalhes em [Entrega da fase 5](fase-5-onboarding-controlado-2026-09-16.md).
- Etapas configuráveis.
- Responsável e prazo por etapa.
- Uma etapa concluída gera a seguinte.
- Pendências do cliente e internas separadas.
- Execução na tarefa real da etapa, acessível também pela fila de Tarefas; concluir em qualquer uma das duas telas avança o mesmo onboarding.
- Checklists existentes preservados em “Checklists anteriores”, sem transformar registros históricos em novas tarefas ou iniciar clientes automaticamente.

### Fase 6 — Painéis, alertas e gestão

- Minha fila.
- Cockpit operacional.
- Painel executivo.
- Alertas de atraso, revisão repetida, aprovação e publicação.

### Fase 7 — Tráfego, resultado comercial e financeiro

- Rotina de tráfego auditável.
- Pedido estruturado de impulsionamento.
- Campanhas ligadas a leads, vendas e receita.
- Diagnóstico de gargalo: mídia, criativo, oferta ou atendimento.
- Controle financeiro conforme permissões.

## 8. Backups principais

- Antes da Fase 5: `/opt/planeje-staging/private/phase5-before-20260916` (código, esquema, dados de clientes/tarefas/checklists/status e índice do build anterior).
- Antes da Fase 2: `/opt/planeje-staging/private/phase2-before-20260914T142441Z`
- Antes do refinamento de fluidez: `/opt/planeje-staging/private/phase2-fluidity-before-20260914T154143Z`
- Antes da Fase 3: `/opt/planeje-staging/private/phase3-before-20260914T161917Z`
- Antes da Fase 4: `/opt/planeje-staging/private/phase4-before-20260914T164656Z`
- Antes da automação do controle de demanda: `/opt/planeje-staging/private/phase4-autonomy-before-20260914T173200Z`
- Antes da Cobertura operacional por material: `/opt/planeje-staging/private/coverage-materials-before-20260915T193000Z`
- Antes dos fluxos configuráveis: `/opt/planeje-staging/private/phase4-workflows-before-20260914T180000Z`
- Antes do complemento de Projetos: `/opt/planeje-staging/private/phase4-projects-before-20260914T193445Z`
- Antes da simplificação do planejamento: `/opt/planeje-staging/private/phase4-ux-before-20260914T202500Z`
- Antes do editor visual do plano: `/opt/planeje-staging/private/phase4-richtext-before-20260914T212500Z`
- Antes da correção de colagem formatada: `/opt/planeje-staging/private/rich-paste-before-20260915T100500`
- Recuperação do texto original do plano Toniolo durante a validação: `/opt/planeje-staging/private/plan-recovery-20260915T131500Z`
- Antes da habilitação controlada da IA de texto: `/opt/planeje-staging/private/ai-enable-before-20260915T130000`
- Antes da pré-configuração de tarefas pela IA: `/opt/planeje-staging/private/ai-materials-before-20260915T164500`
- Antes da nomenclatura padrão das tarefas planejadas: `/opt/planeje-staging/private/task-naming-before-20260915T171253Z`
- Antes de permitir retirar do plano um material vinculado: `/opt/planeje-staging/private/linked-material-remove-before-20260915T172552Z`
- Antes dos atalhos de criação e postagem nos cartões: `/opt/planeje-staging/private/material-date-shortcuts-before-20260915T173421Z`
- Antes do seletor de fluxo e da visualização dos responsáveis no material: `/opt/planeje-staging/private/material-initial-assignee-before-20260915T175227Z`
- Antes da primeira etapa necessária e do novo painel de materiais: `/opt/planeje-staging/private/material-entry-ui-before-20260915T183226Z`
- Antes de trocar os cartões pelo modo lista: `/opt/planeje-staging/private/material-list-before-20260915T190500Z`
- Antes do redesign visual da Cobertura: `/opt/planeje-staging/private/coverage-design-before-20260915T223947Z`
- Antes de compactar o cabeçalho da Cobertura: `/opt/planeje-staging/private/coverage-header-before-20260915T231454Z`
- Antes de compactar a barra superior global: `/opt/planeje-staging/private/workspace-header-before-20260915T232155Z`
- Antes de concentrar online e tema no perfil: `/opt/planeje-staging/private/profile-menu-before-20260915T232429Z`
- Antes de aplicar o canvas visual global: `/opt/planeje-staging/private/workspace-canvas-before-20260915T234223Z`
- Antes de explicitar o plano mensal e adicionar o popup de tarefas na Cobertura: `/opt/planeje-staging/private/coverage-actions-before-20260915T235243Z`
- Antes de adicionar Saúde da conta na Cobertura: `/opt/planeje-staging/private/coverage-account-health-before-20260916T000610Z`
- Antes de simplificar o resumo diário da Cobertura: `/opt/planeje-staging/private/coverage-daily-summary-before-20260916T001608Z`
- Antes de aplicar a base escura ao menu interno: `/opt/planeje-staging/private/sidebar-black-before-20260916T002953Z`
- Antes de compactar o Plano do mês e movê-lo para popup: `/opt/planeje-staging/private/plan-dialog-before-20260916T004015Z`

- Antes de padronizar os cabeçalhos compactos das páginas: `/opt/planeje-staging/private/page-headers-before-20260916T011500Z`

- Antes de corrigir a lista de tarefas dentro do projeto: `/opt/planeje-staging/private/project-task-list-before-20260916T014200Z`
- Antes de transformar materiais em um atalho direto para Tarefas: `/opt/planeje-staging/private/20260915T230500Z-material-review`
- Antes de simplificar a revisão da IA e a edição inline dos materiais: `/opt/planeje-staging/private/20260915T234200Z-material-review-ux`
- Antes de simplificar o detalhe da tarefa e o briefing: `/opt/planeje-staging/private/20260916T030000Z-task-detail-simplification`
- Antes de retirar CTA/referências separados e reorganizar os campos do topo: `/opt/planeje-staging/private/20260916T031500Z-task-detail-field-cleanup`

Novos backups serão adicionados aqui no início de cada fase.

## 9. Histórico de validação

- Recuperação da VPS confirmada pelo usuário.
- Fase 1 testada e validada.
- Fase 2 testada tecnicamente.
- Refinamento de fluidez validado pelo usuário em 14/09/2026.
- Fase 3 implantada e validada tecnicamente na VPS de testes em 14/09/2026.
- Base da Fase 4 implantada e validada tecnicamente na VPS de testes em 14/09/2026. O complemento de Projetos/ficha do cliente foi simplificado após o primeiro parecer de uso: planos vazios visíveis, documento livre com editor visual, itens de produção e tarefas no mesmo caminho. Build, 24 testes focados e interface foram conferidos; validação final do usuário permanece pendente.
- Em 15/09/2026, a colagem do editor do plano foi ampliada para preservar formatação comum de documentos, listas e tabelas. Build de staging `index.b5a2a3d1.js`; teste isolado no navegador aprovado. O texto original usado pelo usuário foi recuperado integralmente após a validação e reconfirmado na interface.
- Em 15/09/2026, o Assistente de Campanha foi corrigido na VPS de testes. O leitor de segredos foi compatibilizado com o armazenamento existente, as funções receberam saída de rede dedicada e o Nginx liberou somente `openai-chat` e `openrouter-chat`. A função respondeu HTTP 200 e o fluxo completo pela tela respondeu “OK”. As demais integrações externas permanecem bloqueadas.
- Em 15/09/2026, `O que será produzido` ganhou leitura direta do Plano do mês. A IA cria somente uma prévia de materiais, apresentada em cartões, e o usuário decide quais rascunhos adicionar ao planejamento. As tarefas reais continuam sendo criadas individualmente em A Fazer e seguem o motor de automações. A validação real identificou cinco vídeos e um conjunto de Stories; a amostra foi descartada e nenhum dado de execução foi criado. Build de staging `index.c7f76290.js`.
- Em 15/09/2026, a criação de tarefas pelo planejamento passou a preservar `[Cliente] Tipo Número - Nome`. O número fica visível e editável, a IA reaproveita números do documento e a sequência por tipo atende materiais antigos. Oito testes, duas aceitações SQL com rollback e a interface Toniolo foram conferidos. Build de staging `index.71429eab.js`; produção não foi alterada.
- Em 15/09/2026, materiais que já possuem tarefa vinculada passaram a oferecer `Remover do plano`. A tarefa e todo o seu histórico operacional são preservados. A confirmação foi validada e cancelada com as contagens intactas. Build de staging `index.b98b1407.js`; produção não foi alterada.
- Em 15/09/2026, os cartões de `O que será produzido` ganharam atalhos de calendário para `Criação` e `Postagem`. Materiais em rascunho guardam as datas no plano; materiais vinculados sincronizam a data com a tarefa. A abertura e o fechamento do calendário foram conferidos sem alterar os dados do plano Toniolo e sem erros no navegador. Build de staging `index.bb1d77f5.js`; produção não foi alterada.
- Em 15/09/2026, cada material passou a mostrar `Fluxo` com a pessoa que recebe sua entrada e, ao abrir, todas as etapas, funções e responsáveis. A escolha fica limitada aos fluxos ativos compatíveis com o tipo do material e é transferida à tarefa; o banco também valida essa compatibilidade. O mesmo painel oferece acesso à configuração central das funções e pessoas. Nove testes, duas aceitações SQL com rollback e a interface do fluxo de Vídeo foram aprovados. Build de staging `index.e50fb9f7.js`; produção não foi alterada.
- Em 15/09/2026, o planejamento passou a definir a primeira etapa realmente necessária sem retirar a entrada `A Fazer`. Briefing e roteiro só são pulados quando o usuário confirma que já estão prontos; a função responsável em A Fazer acompanha essa escolha. O editor foi dividido por finalidade. Após o parecer de uso, `O que será produzido` foi convertido de cartões para uma lista compacta: uma linha por material, datas e primeiro passo visíveis, com resumo, canais, fluxo e ações recolhidos. Dez testes, SQL com rollback em três cenários e a interface foram aprovados. Build de staging `index.cd94cbee.js`; produção não foi alterada.
- Em 15/09/2026, a Cobertura recebeu um redesign visual inspirado na hierarquia modular do Lumin: cabeçalho compacto, resumo escuro de alto contraste, indicadores separados, busca, filtros e tabela com operação agrupada. Busca, filtros e detalhamento por tipo foram validados com os dados reais; 14 testes passaram e os backups foram conferidos. Build final de staging `index.76a251ec.js`; produção não foi alterada.
- Em 15/09/2026, a barra superior global foi retirada do desktop para liberar espaço vertical. A busca visual foi removida, mantendo `⌘K`; estado online, modo claro/escuro e saída foram concentrados no perfil lateral. O menu e a alternância de tema foram validados no navegador, 14 testes passaram e os backups foram conferidos. Build de staging `index.8ac89e91.js`; produção não foi alterada.
- Em 15/09/2026, o canvas visual foi aplicado às páginas normais do sistema: cinza azulado com maior contraste no modo claro e azul profundo no modo escuro. Cobertura passou a herdar a mesma regra, sem fundo interno duplicado. Cobertura, Clientes e Projetos foram conferidos no navegador; 14 testes passaram e o backup foi validado. Build de staging `index.943fac2b.js`; produção não foi alterada.
- Em 15/09/2026, a Cobertura passou a informar se o cliente está sem plano, com plano vazio ou com materiais planejados. O atalho cria ou abre o plano do mês, e Tarefas abre um popup com status, origem, responsáveis e datas das demandas que formam a cobertura. Toniolo e clientes sem plano foram conferidos; 14 testes passaram. Build de staging `index.cc52c64f.js`; produção não foi alterada.
- Em 15/09/2026, a Cobertura ganhou Saúde da conta por planejamento. A tarefa conta como planejada somente quando está ligada a um material do plano; as demais entram no improviso. O painel mostra Organizada, percentual planejado, No improviso, Plano vazio ou Sem produção, além do filtro Com improviso. Setembro apresentou 63 conteúdos improvisados em 11 contas; o filtro e a classificação de 50% da Toniolo foram conferidos. Build de staging `index.f3098595.js`; produção não foi alterada.
- Em 15/09/2026, o topo da Cobertura foi convertido em um resumo diário de decisão. O destaque mostra a parcela da produção que nasceu do plano e quantas contas estão no improviso. Os quatro indicadores mostram clientes para planejar, materiais sem tarefa, tarefas atrasadas e publicações pendentes. A faixa de dados repetidos foi removida e Atualizar foi levado ao cabeçalho. Os dados reais, a interface e 25 verificações focadas foram conferidos. Build de staging `index.438d0d88.js`; produção não foi alterada.
- Em 15/09/2026, o menu interno da agência recebeu a mesma base preta do destaque da Cobertura, com luz discreta da marca e seleção colorida. Os modos compacto e expandido foram conferidos; a identidade separada da área do cliente foi preservada. Build de staging `index.13d52556.js`; produção não foi alterada.
- Em 15/09/2026, o editor permanente do Plano do mês foi substituído por um resumo compacto. Planos existentes abrem primeiro em leitura e entram no editor completo por ação explícita; planos vazios mostram `Criar plano` e abrem um documento em branco. Os dois estados foram conferidos sem alterar dados, 17 verificações focadas passaram e o backup foi validado. Build de staging `index.ed3eeedf.js`; produção não foi alterada.
- Em 15/09/2026, o cabeçalho compacto da Cobertura virou um componente reutilizável nas páginas principais da agência, incluindo Projetos, detalhe do plano, Tarefas, Clientes, Caixa, Solicitações, Redes sociais, Onboarding, Automações, Configurações e Assistente. Conversas e CRM mantiveram suas telas próprias. O build, 13 suítes focadas, a interface e os hashes local/staging foram conferidos. Build de staging `index.edacb4dc.js`; produção não foi alterada.
- Em 15/09/2026, a lista `Tarefas deste projeto` foi compactada dentro de um contêiner branco, com status, responsáveis, prazo e ação alinhados por tarefa. Tarefas do plano atual foram separadas das tarefas históricas do projeto; na Toniolo, isso esclareceu que um item semelhante pertence a um material antigo. Nenhum registro foi apagado. Duas tarefas, quatro suítes focadas, build e hashes foram conferidos. Build de staging `index.aecd0cce.js`; produção não foi alterada.
- Em 15/09/2026, `O que será produzido` foi consolidado como atalho entre o plano e Tarefas. Materiais passaram a abrir e editar na própria lista; canais e datas podem ser definidos rapidamente, e o controle operacional continua em Tarefas depois do envio. A revisão da IA passou a exibir e permitir corrigir o texto completo, canais e datas detectadas. A validação real da Maxifarma encontrou quatro Reels e datas coerentes sem criar registros. Build de staging `index.5cd97d4c.js`; produção não foi alterada.
- Ainda em 15/09/2026, a revisão da IA e o material aberto foram simplificados após o teste de uso. A IA passou a apresentar uma lista resumida e abrir somente um item por vez; na lista principal, informações repetidas e campos vazios foram recolhidos. Datas, canais, primeiro passo e envio para Tarefas permaneceram como atalhos. As cinco suítes focadas e a interface Maxifarma foram reconferidas. Build final de staging `index.acbe0f16.js`; produção não foi alterada.
- Em 16/09/2026, o detalhe da tarefa foi simplificado para priorizar os campos realmente usados: cliente, campanha, tipo, urgência, status, entrega, postagem, responsáveis e orientação de execução. Status, entrega e postagem ficam na mesma linha. O antigo formulário `Briefing da peça` deixou de aparecer; roteiro, legenda e gravação são opcionais e recolhidos. CTA e referências não são mais campos separados. O roteiro existente da tarefa Toniolo permaneceu disponível, os dados antigos foram preservados e nenhuma tarefa foi salva durante a validação. Trinta e nove verificações passaram e o navegador não apresentou erros. Build de staging `index.f95750ac.js`; produção não foi alterada.
- Naquele momento, o ajuste de operação estava proposto em `outputs/plano-prazos-etapas-publicacoes-2026-09-16.md`. Foi implementado depois, em 16/09, com entrega comprovada na revisão final, SLA da etapa, justificativas e urgência de postagem; não permanece como migração ainda por executar.
- Complementos de 16/09: Projetos recebeu pendências automáticas visuais desligáveis, marcos do mês anterior, mês inicial do automático, preservação de períodos históricos, largura/altura de Kanban compatíveis com Tarefas, projetos de vários meses e visões Agora/Meus planos. A sequência e as regras finais estão na consolidação de continuidade e nos manifests de `work/planeje-phase4-projects`.
- Fase 5 entregue no teste em 16/09: modelos e snapshots de onboarding, tarefas reais por etapa ativa, avanço idempotente/transacional, pendências equipe/cliente e checklists anteriores preservados. Quatorze testes Node, SQL autenticado, concorrência e jornada pela interface aprovados. Build servido `index.a44f492e.js`; aceite de uso ainda separado.
- Produção permanece sem as mudanças novas.
