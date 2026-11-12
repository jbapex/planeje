# Atlas: auditoria de conversa e necessidade dos avisos — 28/10/2026

## Parecer e escopo

**Não atende integralmente ao comportamento de gerente esperado.** A leitura de registros e o transporte das respostas existem; a decisão de interromper alguém e a continuidade do diálogo ainda falham. Josias pediu avaliar comportamento/respostas e reduzir notificações desnecessárias, aproveitando as datas e fontes oficiais de Tarefas. Este registro é diagnóstico e proposta, sem alteração de produto, configuração, filas ou dados na VPS.

Auditoria somente leitura na produção, aproximadamente 13h03–13h10 de São Paulo. Base observada `atlas-learning-20261028-02/candidate`, publicada às12h14. Os hashes de dialogue.py, manager.py, time_rules.py e AtlasTeamAssistant.jsx coincidem com o workspace inspecionado. O grafo local é anterior às entregas atuais: serviu apenas de orientação; conclusões foram conferidas diretamente nos consumidores e definições vigentes. Nenhum provedor alternativo, backend semântico ou modelo pago foi iniciado.

Não são anexadas conversas brutas, identificadores, links privados ou dados de clientes. Métricas abaixo são agregadas; exemplos de reprodução são fictícios. As conversas mostradas nas capturas aconteceram antes da publicação12h14; as duas falhas reproduzidas continuam no código produtivo atual, portanto não foram atribuídas ao novo aprendizado por dedução temporal.

## Evidência agregada

- No recorte de hoje até cerca de13h04: **230 mensagens Atlas, 11 humanas**. São mensagens persistidas, incluindo avisos automáticos/atualizações; não equivalem a230 popups exibidos ou230 cobranças necessárias.
- Últimos sete dias móveis: **1.234 mensagens Atlas e28 humanas**; 21 respostas do dono e sete da conta interna Poliana, em seis assuntos. Os demais colaboradores não têm respostas registradas nesse intervalo. Isso não comprova ausência de trabalho, leitura ou intenção de ignorar o robô.
- **126 assuntos ativos**:110 followups,15 intakes e uma decisão do dono. Por estado:94 aguardando resposta,25 entregas para revisão, seis aguardando revisão e uma decisão do dono.
- Poliana concentra **77 assuntos ativos**:51 aguardando resposta,23 entregas para revisão e três aguardando revisão. Há dez assuntos dela abertos ao menos uma vez e um com a última mensagem marcada como lida. Esses indicadores de abertura não certificam entrega visual ou leitura completa.
- **23 followups aguardando resposta têm produção futura**. Cinco possuem prazo de etapa já vencido, que pode justificar atenção; **18 não têm etapa vencida nem promessa horária vencida**. Todos23 foram abertos pela reconciliação automática de tarefas e ainda não tiveram resposta humana. Não classificar todos como falsos positivos: risco, bloqueio e informação faltante também podem justificar contato; não há filtro explícito equivalente no emissor atual.
- **510 ocorrências adicionais de texto idêntico no mesmo assunto**, em231 grupos de repetição nos sete dias. Parte são lembretes programados; a contagem isolada não prova que todas sejam indevidas.
- Pedidos de resposta nos sete dias:24 concluídos/aplicados e um falho/não aplicado. Funcionamento técnico da fila não certifica interpretação correta.

## Achados confirmados

### 1. A proteção de exclusão destrói respostas de contexto

`dialogue.py:141–142` substitui a resposta inteira quando encontra menção a excluir/apagar, sem distinguir explicar um pedido de prometer executar DELETE. Reproduzido sem IA: resposta fictícia que explica “cliente não quer publicar; pedido de exclusão depende de decisão” vira somente o aviso padrão de encerramento. Isso explica a resposta mostrada nas capturas, inclusive a repetição após “me contextualize”. A conversa de decisão consegue acessar o registro da tarefa por seu acompanhamento de origem; não é ausência geral de acesso ao contexto.

O estado também permanece como decisão pendente apesar de a mensagem atual ser uma pergunta informativa. O próximo reparo precisa responder à pergunta antes de tentar resolver/encaminhar a decisão, preservando a separação entre cancelar uma entrega, encerrar o acompanhamento e excluir uma tarefa.

### 2. Revisão do robô vira cobrança independentemente do prazo oficial

`manager.py:285` normaliza uma próxima revisão padrão de uma hora. `time_rules.py:due_call` pode emitir uma pergunta só porque esse relógio venceu, mesmo quando produção, etapa e postagem estão no futuro. Reprodução fictícia com as três datas futuras gerou “O que falta para concluir essa etapa?”. Não houve modelo ou gravação.

`atlas_manager_reconcile` seleciona tarefas sem data, com produção até o próximo dia ou com prazo de etapa até esse horizonte. Já `refresh_plan`, ao observar primeiro contato, mudança em uma fonte ou estado, produz mensagem que pode virar chamada não lida. Não existe orçamento de interrupção por pessoa: o limite de dois lembretes é por assunto, e o controle semântico também é por assunto.

Existem supressões úteis: entrega pronta para conferência, programação futura completa por canal e mesma chave sem mudança. São insuficientes para o volume atual.

### 3. Informação nova não substitui sempre a dependência antiga

Uma resposta humana informando agendamento foi seguida por “falta o retorno do cliente”, repetido mesmo após a correção da pessoa. O estado persistido continuou `waiting_on=client`, com próximo passo de validação. A tarefa está em estado de agendamento e possui data futura de postagem; a existência de programação externa por canal não estava comprovada nesses registros.

Em `continuity`, a dependência anterior pode ser herdada e toda resposta com `waiting_on=client` é substituída pela mesma frase. O fato de não poder atestar uma postagem externa não autoriza inventar que falta aprovação do cliente. O reparo deve reconhecer o novo relato, confrontar os registros e pedir só uma informação realmente necessária.

### 4. A tela mistura atendimento do grupo com a decisão da tarefa

`AtlasTeamAssistant.jsx:107` mostra “O cliente já foi respondido?” quando há qualquer alerta de grupo permitido para esse cliente. Não exige vínculo semântico com a tarefa discutida. Esse formulário registra a justificativa e resolve o aviso de atendimento; não responde à decisão da tarefa, cancela publicação ou conclui execução. A função é válida, mas sua apresentação dentro da conversa induz a confusão mostrada nas capturas.

### 5. Acompanhamento por prazo não está alinhado à semântica da tela Tarefas

O produto já distingue prazo de produção, prazo da etapa após entrega, postagem e justificativa em `taskUrgency.js` e `taskDeliveryAccountability.js`. O emissor do Atlas usa principalmente seu próprio relógio de revisão. O próximo desenho deve respeitar o contrato oficial de prazo efetivo e fontes atuais, incluindo os estados personalizados, sem transformar cores de urgência da UI em prova de atraso horário.

Etapa que avançou normalmente deve atualizar contexto em silêncio. Material entregue não deve continuar sendo cobrado como produção atrasada; agendamento futuro pede conferência após a data/hora pertinente. Data sem hora não significa descumprimento à meia-noite. Justificativa e previsão revisada devem ser lidas antes do próximo aviso.

### 6. A análise contextual está esperando orçamento enquanto avisos continuam

Configuração observada: eventos ativos em24 clientes,100 mensagens de contexto,51 chamadas registradas e **993.763/1.000.000 tokens utilizados**, sem reserva ativa. Na última leitura havia **16 lotes em budget_wait**, com motivo explícito de teto compartilhado. O número é dinâmico.

Há121 lotes históricos bloqueados por contexto alterado e um erro antigo de fonte. São estados técnicos preservados, não121 pedidos atuais de clientes e não autorização para replay. Não atribuir todas as filas bloqueadas ao orçamento.

As mensagens determinísticas da equipe não dependem de uma nova análise do grupo e podem continuar aparecendo. A interface precisa distinguir “conferência de registros”, “aguardando análise” e “análise concluída”. A estrutura de aprendizado foi publicada, mas o recorte ainda contém59 memórias ativas antigas, sem novos fatos/padrões observados; não há demonstração de aprendizado real neste ciclo.

## O que já funciona

A fila persiste as respostas e processa depois. Comentários, justificativas, anexos, publicações e datas estão disponíveis com limites explícitos. Houve encaminhamento real de uma alteração informada pela conta para o executor interno, mantendo a execução oficial. Uma resposta efetiva de “aguardando aprovação do cliente” foi reconhecida e suspendeu a cobrança imediata daquele followup. Controles de acesso e distinção de registros versus conferência externa devem ser preservados.

## Proposta para a próxima alteração — ainda não implementada

Recomendação: **acompanhamento por exceção**, mantendo os registros do Atlas e a execução oficial existentes. Apenas reduzir o temporizador não resolve a interpretação incorreta; desligar todo acompanhamento também impediria detectar os atrasos que motivaram o Atlas.

| Situação observada | Comportamento proposto |
| --- | --- |
| Produção/etapa dentro do combinado, fontes coerentes | Atualizar contexto em silêncio; nenhuma pergunta de rotina. |
| Mudança normal de etapa ou responsável | Recarregar as fontes e continuar; chamar somente se há uma ação necessária ao novo destinatário. |
| Prazo relevante vencido, bloqueio novo ou risco concreto para postagem | Uma mensagem objetiva à pessoa que pode agir, com motivo e próximo passo. |
| Produção entregue; etapa de revisão ainda pendente | Acompanhar somente a revisão, respeitando seu prazo. |
| Agendamento futuro registrado | Esperar a janela de publicação; conferir sucesso/falha depois, com tolerância definida. |
| Aguardando cliente, com retorno/data já combinados | Manter essa dependência; revisar no combinado ou diante de mensagem nova pertinente. |
| Pessoa corrige o contexto anterior | Atualizar dependência/próximo passo antes de responder; não repetir o estado antigo. |
| Pessoa pede contexto | Explicar quem informou, situação/data, o que já foi consultado e qual decisão falta; sem disparar ação pela pergunta. |
| Mesmo assunto e mesmas fontes, sem fato novo | Não repetir texto nem abrir outro chamado. |
| Várias pendências da mesma pessoa | Fila consolidada por prioridade e aviso breve; reabertura só com mudança relevante ou retorno combinado. |
| Aviso de grupo sem resposta sem relação com a tarefa | Mostrar na fila de atendimento; acesso contextual recolhido e claramente separado. |
| Orçamento insuficiente para análise | Mostrar fila/limite e a data da última análise; não insinuar leitura nova. Priorizar eventos novos sobre revisões sem mudança. |

Aceitação mínima do futuro reparo: reproduzir os dois defeitos atuais antes de editar; cobrir “me contextualize”, correção para “está agendado”, avanço normal de etapa, produção entregue/postagem futura, justificativa vigente, cancelamento solicitado e escopo owner_context/consulta; comprovar que o silêncio não oculta atraso real. Usar fixtures, contratos de identidade/RLS, revalidação de fontes e testes de sequências de várias rodadas. Não basta verificar apenas enqueue/completed.

Nenhuma regra nova, supressão de fila antiga, replay, migração ou publicação foi executada nesta auditoria. A proposta precisa virar um reparo testável antes de uma autorização específica de publicação; o aceite anterior do aprendizado não cobre alterações futuras por inferência.
