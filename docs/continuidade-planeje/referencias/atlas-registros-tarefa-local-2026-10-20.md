**Publicado depois desta preparação, em20/10/2026 às13h11.** [Estado produtivo e evidência](atlas-registros-tarefa-producao-2026-10-20.md). O texto abaixo registra o diagnóstico e a validação anteriores.

# Atlas: leitura dos registros da tarefa — somente local

Diagnóstico em 20/10/2026. A auditoria de leitura confirmou que uma tarefa já tinha etapa de alteração, responsável oficial, comentários e justificativa; a conversa do robô não recebia esses registros completos. A resposta genérica devolvia ao dono o dever de acompanhar a equipe. Nenhuma conversa de cliente foi copiada para esta documentação ou para fixtures.

## Correção local

O helper `private.atlas_task_record(uuid)` reúne somente a tarefa e o cliente vinculados à conversa visível, sob SECURITY INVOKER e as permissões existentes. Inclui descrição, briefing, status e atribuição reais, prazos de tarefa/etapa/produção, histórico, comentários com autor/data, justificativas e metadados de anexos/publicações. A cobertura informa recortes; anexos não são abertos e registros de publicação não comprovam conteúdo ou qualidade externos.

O contexto é usado pelo gerente e pelo caminho manual legado. O orçamento considera a mensagem completa em português, incluindo prompt e serialização, sem remover o índice de tarefas necessário à conferência de duplicidade. Fontes antigas são recortadas; briefing/histórico de execução volumosos podem ser omitidos com indicação explícita de cobertura parcial. Fontes continuam sendo dados não confiáveis, não instruções.

A conversa registra em `atlas_team_requests.result.task_stage` a etapa efetivamente observada. Uma primeira leitura rica ou mudança posterior pode oferecer o único responsável oficial ativo para acompanhamento. Respostas legadas que não liam esses registros não bloqueiam a descoberta da etapa. Um relato em primeira pessoa permanece com o autor, sem mudar a atribuição oficial. O ensaio real autorizado fez quatro chamadas: três passaram inicialmente, e a primeira trouxe texto de autorrelato correto com ID de executor errado. A validação agora impede encaminhamento diante de autoidentificação afirmativa explícita (como “sou eu mesmo”). O prompt, esquema e construção das fixtures permaneceram iguais; as quatro saídas originais foram preservadas e passaram no replay pela validação corrigida, sem quinta chamada. Esse replay comprova a correção do servidor nesses casos, não uma nova escolha correta da IA.

Para o contato com o único responsável oficial, o resumo leva até dois trechos recentes dos comentários, com autor e data; o rótulo indica que a íntegra está na tarefa. Assim, o repasse não depende de a IA repetir os ajustes concretos no resumo.

No encaminhamento, o servidor confere cliente, tarefa, pessoa ativa, sessão e versão das fontes; não reassina nem altera prazo/status oficial. O contato aguarda o expediente do destinatário usando a fila já existente. Ao retomar, a revisão do Atlas vencida é renovada; uma previsão histórica da pessoa não é inventada nem convertida em prazo oficial. Alteração das fontes durante a análise ou antes do despacho impede aplicar um resultado desatualizado. Se os dados mudarem enquanto aguarda o expediente, a retomada existente pede confirmação; reanálise autônoma dessa situação não foi adicionada.

Os lembretes recebem status atual e existência de comentários/justificativa. O modelo lê o conteúdo quando a conversa é respondida. Não foi criado um novo motor de tarefas ou uma reanálise por IA em todo lembrete. Datas continuam em dias úteis e o limite de cobranças existente é preservado.

## Verificação

- 54 testes Python do gerente e caminho manual: contrato de fontes, contato oficial, autor autenticado, dados malformados, orçamento do prompt completo com 30 comentários extensos em português, briefing/histórico volumosos e mudança de comentário durante a análise.
- 15 testes de expediente e lembretes; nove de contexto do leitor.
- 109 verificações SQL/RLS reais em cluster PostgreSQL local descartável por socket Unix. Incluem isolamento de conversa/cliente, metadados/autor/ordem, hash das fontes, recusa de resultado desatualizado, contato oficial enfileirado, revisão vencida/previsão histórica na retomada, idempotência, campos oficiais preservados e último snapshot por revisão da conversa, não por horário de tentativa.
- Revisão independente concluída, sem achados técnicos abertos. Três P2 foram reproduzidos e resolvidos: contato da etapa após resposta legada, retomada com revisão vencida e orçamento do prompt completo nos dois caminhos. Revisor reexecutou 67 Python e 109 SQL, conferiu os nove hashes finais e deixou a interpretação real de autorrelato como condição antes de publicar. Relatório privado, modo0600: `/Users/josiasbonfimdefaria/.codex/reviews/atlas-task-record-2026-10-20.md`.

Comandos dirigidos:

```sh
python3 -m unittest discover -s scripts/atlas-team-pilot -p test_manager.py
python3 -m unittest discover -s scripts/atlas-team-pilot -p test_rules.py
python3 -m unittest discover -s scripts/atlas-events -p test_model_context.py
python3 scripts/atlas-manager-integration/verify.py
npm run verify:context
```

Não executar todos os scripts antigos da pasta Atlas: alguns dependem de ambientes remotos. As quatro chamadas reais de IA usaram somente fixtures sintéticas e a credencial já autorizada; não houve envio interno/WhatsApp, criação de tarefa, reinício de serviço ou escrita produtiva nesta validação. UI, build, ditado e hardware não foram repetidos porque o delta é de backend e SQL.

## Publicação e retomada

Migração nova `supabase/migrations/20261020151558_atlas_task_record_context.sql`: aplicada apenas à fixture local. Não editar/reaplicar a migração operacional anterior `20261020012821`. Runtime alterado: `scripts/atlas-team-pilot/manager.py`, `server.py`, `time_rules.py`; testes e fixture acompanham o delta. Manifesto e patch exatos em `.local/atlas-task-record-20261020-01/`; [evidência sem dados de clientes](../evidencias/releases/atlas-registros-tarefa-local-2026-10-20.json).

Josias autorizou este reparo, migração, reinício e quatro testes de IA com a resposta “atutorizo”. As quatro chamadas reais consumiram 14.103 tokens, usando a credencial/modelo existentes e somente dados fictícios; não foram registradas como conversas ou uso produtivo de clientes. O relatório original 3/4 e o replay 4/4 estão separados e vinculados por hash. Antes de publicar, fechar a revisão adicional da validação e do publicador. Não usar tarefa/pessoa real como transporte de teste. Depois, revalidar fontes/concorrência e herdar a base produtiva mais recente, incluindo o calendário social publicado às12h11, seus arquivos e perfil. Somente o worker da equipe exige atualização/reinício; frontend e outros workers não fazem parte deste delta.

A versão observada durante o diagnóstico era o reparo de identidade das01h41. A publicação posterior deste reparo está registrada na referência produtiva; não implica aceite humano. A autorização antiga foi consumida pela release de identidade; a autorização nova deste reparo está registrada separadamente em `.local/atlas-task-record-release-20261020-01/authorization.json`.
