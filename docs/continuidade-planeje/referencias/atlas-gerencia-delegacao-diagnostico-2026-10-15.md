# Atlas: diagnóstico do acompanhamento e proposta de delegação — 15/10/2026

Status: auditoria de leitura concluída; evolução operacional descrita abaixo ainda NÃO IMPLEMENTADA. Nenhuma tarefa, pergunta, memória, atribuição, orçamento, serviço ou mensagem real alterada nesta auditoria. Produção continua em `03465f2e` / `841037d3`; escritório ativo e monitor legado pausado.

## Pedido e regras confirmadas

Josias aprovou a apresentação atual (“Show, está legal”) e relatou que o primeiro levantamento por cliente foi útil. O problema de uso começou quando, depois de suas respostas, o Atlas continuou pedindo detalhes operacionais ao dono em vez de preparar repasses à equipe. Ele quer propostas de trabalho/transferência, acompanhamento de tarefas e grupos, leitura das mensagens e áudios e espaços por operação. A automação de atribuições é uma evolução futura condicionada à confiança; não está liberada agora.

A segunda operação é **Ápice Noivas**. Josias confirmou que sua identificação já existe nas etiquetas dos clientes. Usar a etiqueta explícita, sem deduzir a operação pelo nome/nicho, duplicar clientes ou inferir que todo cadastro sem essa etiqueta é necessariamente JB Apex. O serviço/escopo de cada contrato continua independente da marca.

Preservar as respostas anteriores, a aprovação humana de novas tarefas e dos primeiros repasses, seg–sex 08h–17h São Paulo, o ditado com revisão antes de enviar e Tarefas como execução oficial. A resposta de um colaborador deve registrar autor/data/fonte e não se tornar automaticamente uma direção aprovada por Josias. Comunicação interna no app e WhatsApp externo são ações distintas; nenhum envio externo foi liberado nesta conversa.

Pergunta de produto pendente: depois da aprovação, repasse direto ao responsável com acompanhamento da Poliana ou primeiro para Poliana distribuir. Não tratar a recomendação do assistente como regra já escolhida.

## Evidência de leitura

Consultas SQL em transação READ ONLY e inspeção do código vigente, sem testes de escrita na produção. Dados detalhados e respostas de clientes permaneceram somente em `.local/atlas-operacao`, com permissão 600; este registro contém somente agregados e cenários sem identificação.

- 11 respostas de Josias em oito clientes; zero propostas de qualquer estado na consulta. Não significa que todos os 24 clientes já receberam direção.
- Estados dos 24 clientes no momento auditado: 19 aguardando contexto, quatro aguardando orçamento de IA e um erro. O erro não foi diagnosticado como parte desta leitura; não tratá-lo como falta de resposta humana.
- Nove dos 24 clientes fechados têm a etiqueta Ápice Noivas. Os outros 15 não foram classificados por inferência.
- 15 clientes fechados têm vínculo explícito com um grupo ativo. Nos 15 casos, o grupo está armazenado em outro `cliente_id` de canal; o filtro direto do escritório o exclui do contexto do cliente representado. Apenas quatro clientes têm algum grupo ativo no vínculo direto. Isso não comprova ausência das conversas no sistema: comprova falha de associação no acompanhamento automático do escritório.
- 108 transcrições concluídas já disponíveis; transcrição de grupos ligada e monitor legado desligado. Não é necessário retranscrever todo o acervo.
- Orçamento observado do escritório no dia: 12 análises / 45.065 tokens registrados; teto de chamadas já atingido. Os limites atuais são 12 análises e 60 mil tokens/dia. Conversa, voz e transcrição têm consumo separado. Esta auditoria não chamou o modelo, elevou o teto nem zerou o uso.

## Causas no código

`supabase/functions/_shared/atlasOffice.js`: a seleção de clientes não inclui etiquetas nem o vínculo `entregaveis.whatsapp_grupo`. `clientOfficeContext` associa conversas por `cliente_id` direto e fornece apenas a última prévia (até 500 caracteres); não inclui mensagens recebidas/enviadas nem transcrições. A descrição da tarefa é carregada no inventário, mas descartada no contexto enviado ao modelo. Projetos/campanhas são metadados, sem leitura completa de plano, briefing ou Rotina semanal.

`atlasOfficeManager.js`: a instrução manda perguntar a Josias se faltar qualquer informação necessária; pergunta aberta bloqueia a análise daquele cliente. Uma saída contendo pergunta elimina todas as propostas. Faltam destinatário da pergunta e distinção entre decisão do dono e apuração operacional. O esquema atual permite propor criação, mas não transferir uma tarefa existente. Aprovação/idempotência de criação já existem e devem ser preservadas.

`atlasManagerContext.js` e `pulseClientMatch.js`: já há leitura reutilizável de vínculo explícito de grupo, mensagens, compromissos e transcrições. Associação apenas pelo nome é inferência; vínculo ambíguo precisa de conferência. Reutilizar seletivamente a versão produtiva: a cópia local de `atlasManagerContext.js` também contém Assessoria não publicada.

Minha caixa já possui pedidos internos oriundos de comentários de tarefas e ações de acompanhamento. O trigger vigente `criar_pendencias_caixa_comentario` exige a sinalização apropriada de pendência e envia aos responsáveis da tarefa (ou ao proprietário se não houver responsável). Não basta inserir um comentário comum para afirmar que houve repasse. O estado da pendência não substitui a conclusão da tarefa. Este caminho deve ser validado de ponta a ponta com contas fictícias antes de integrá-lo ao Atlas.

## Primeira entrega proposta

Fluxo a implementar: **sinal com origem → proposta de repasse → revisão do dono → tarefa existente/nova aprovada → Minha caixa do responsável → resposta/entrega com evidência → revisão ou exceção para o dono**.

1. **Carteiras por etiqueta e contexto reaproveitado.** Espaço do cliente com direção já registrada, contrato, responsável, tarefas em andamento, grupos vinculados e fontes/datas. Ápice Noivas é filtro explícito; clientes sem classificação ficam identificados para conferência.
2. **Perguntas com destinatário correto.** Direção, escopo, verba e validação estratégica continuam com Josias. Dados de execução, levantamento e andamento viram propostas de apuração para quem já é responsável pela tarefa/função/carteira. Sem responsável confiável, pedir somente a definição de responsável, sem inventar papel. Uma pergunta não deve impedir ações independentes já suficientemente descritas.
3. **Repasse revisável com vínculo real.** Mostrar cliente, motivo, origem, tarefa existente ou nova, responsável sugerido e prazo sugerido claramente separado de prazo prometido. Conferir duplicidade e situação atual antes de aprovar. Reutilizar o editor/validações/histórico/automação de Tarefas; o worker não recebe escrita operacional livre.
4. **Acompanhamento e devolução.** Equipe responde dentro do contexto permitido da tarefa, por texto e, quando disponível, ditado com revisão. Atlas consulta a resposta e entrega registrada, sinaliza impedimentos e mostra ao dono o que requer decisão. Não considerar “estou nisso”, comentário, silêncio ou animação no mapa como entrega concluída.
5. **Mensagens e áudio por alteração.** Recuperar vínculo explícito; ler novos recebimentos e respostas do mesmo grupo em ordem temporal; anexar transcrição concluída pelo ID da mensagem. Falha, ausência de acesso, vínculo incerto e áudio ainda não transcrito aparecem como limitações. Conteúdo de cliente é dado, nunca instrução para alterar regras do sistema.

## Cenários de validação do piloto

Cenários derivados da auditoria, sem copiar dados de clientes para a documentação; são propostas de aceite, não tarefas já criadas:

| Situação | Comportamento esperado |
| --- | --- |
| Dono já informou campanha e indicou planejamento/produção | Preparar repasses para as funções indicadas; pedir ao dono apenas a aprovação da direção/material que realmente dependa dele. |
| Dono pediu conferir resultado de formulário/atendimento | Sugerir levantamento ao responsável de tráfego cadastrado; não pedir ao dono que produza os números. |
| Dono informou que a equipe já recebeu o briefing de uma gravação | Localizar a tarefa/briefing existente e acompanhar; não criar outra entrega nem ampliar o contrato. |
| Grupo ligado pelo cadastro da agência | Incluir no cliente representado somente após resolver o vínculo e preservar origem/data. |
| Resposta da equipe altera premissa comercial | Registrar como informação da equipe e escalar a decisão; não sobrescrever a direção do dono. |
| Aprovação repetida ou tarefa já alterada por humano | Não duplicar; recarregar/revisar proposta e preservar histórico. |

## Economia e critérios de conclusão

Consultas de prazos, filas, responsáveis, etiquetas e contadores são determinísticas; não precisam de uma chamada de IA para cada personagem. Guardar direção/síntese com origem e processar alterações, reutilizando transcrições. Reservar IA para interpretar conteúdo novo e formular uma proposta útil. Priorizar clientes com mudança/risco e exibir explicitamente o que aguarda análise por limite. Não mudar orçamento nem modelo por inferência.

A entrega só estará funcional quando um repasse fictício percorrer revisão, tarefa real, Minha caixa da pessoa certa, resposta e acompanhamento; outra pessoa sem acesso deve ser recusada. Validar também sessão revogada, fonte indisponível, vínculo ambíguo, tarefa existente, aprovação concorrente/repetida, dados desatualizados, falta de responsável, teto de consumo e conservação das respostas anteriores. Publicação não é equivalente a esse aceite.

Nenhuma implementação/publicação desta evolução foi realizada nesta fase. Próximo trabalho técnico deve partir da fonte produtiva preservada, com patch seletivo e testes isolados, sem publicar a Assessoria que permanece em teste.
