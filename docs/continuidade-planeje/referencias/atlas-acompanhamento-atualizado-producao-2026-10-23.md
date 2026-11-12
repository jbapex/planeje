# Atlas: acompanhamento atualizado publicado para validação

Publicado em **23/10/2026, 14h11 de São Paulo** (17h11 UTC), na VPS72.60.14.109, após Josias autorizar especificamente: “pode sim publicar”. [Preparação e limites](atlas-acompanhamento-atualizado-local-2026-10-23.md) · [Evidência sem dados de clientes](../evidencias/releases/atlas-acompanhamento-atualizado-producao-2026-10-23.json) · [Escritório](https://planeje.jbapex.com.br/#/assistant/atlas).

## Comportamento e escopo

O acompanhamento automático relê os registros da tarefa e atualiza o resumo da mesma conversa. Comentários/justificativas têm atribuição e o próximo passo acompanha a etapa: produção, correção, aprovação, publicação ou conferência da entrega. Publicação anterior à última alteração não conclui o novo ciclo. Entrega informada por pessoa e pausa por decisão do dono são preservadas; mensagens anteriores e campos oficiais de tarefa não são reescritos.

A primeira abordagem de um novo acompanhamento ocorre depois de ler as fontes. Conversas antigas recebem uma observação inicial silenciosa quando não há transição efetiva de estado. Atualizações de campanhas do cliente não disparam mensagens de tarefa nem comprovam sua entrega.

Tráfego usa somente o snapshot Meta já registrado, com data/período e limite de cobertura. Não houve nova integração de consulta ao vivo, verificação externa de postagem/qualidade ou interpretação nova por IA em cada varredura. Modelo, provedor, autenticação, orçamento e política de autonomia permanecem os existentes. Contatos automáticos continuam no expediente individual e em dias úteis.

## Publicação e recuperação

Nova candidata: `/root/planeje-releases/atlas-source-refresh-20261023-01/candidate`, sobre a composição `meta-echo-20261023-01/candidate`. Guarda de **1.731 fontes**, com cinco sobreposições: `manager.py`, `server.py`, `time_rules.py`, novo `task_progress.py` e migração incremental `20261023160734_atlas_followup_source_refresh.sql`.

A migração foi aplicada **uma vez**. Migrações anteriores não foram repetidas. Somente `planeje-atlas-team` foi parado/repontado/iniciado, com cwd e unidade efetivos conferidos. Perfil produtivo foi herdado exclusivamente dentro da VPS, modo0600; nenhum `.env` foi transferido ao Mac. Não houve build ou reinício dos outros serviços/Edge. Main `cdee87a3`/`bc73e6cf` e escritório `1ed69416`/`59ec53c3` mantêm os mesmos bytes; assets anteriores preservados.

O publicador recusa fontes/unidades/SQL concorrentes e guarda definição, ACL e dono das funções afetadas. A recuperação restaura os quatro consumidores anteriores antes de iniciar o worker antigo, preservando helpers aditivos e alterações concorrentes. A revisão reproduziu e corrigiu um P2 no ramo de fingerprint igual: esse ramo também compara o contrato completo antes de restaurar o worker. A recuperação produtiva não precisou ser executada. Nunca repetir o publicador ou a migração para limpar uma falha; inspecionar os marcadores e contratos primeiro.

## Evidência técnica e primeira leitura

- Implementação: **96 testes Python** e **140 verificações SQL/RLS** locais passaram. Os96 Python passaram também contra a candidata na VPS, sem IA/rede de teste.
- Publicador: **14 testes** locais e remotos de autorização/unidade/recuperação passaram. Duas revisões independentes encerradas sem P1/P2 abertos; relatórios privados do usuário em `.codex/reviews/atlas-source-refresh*-2026-10-23.md`.
- Verificação produtiva:1.731 fontes, seis HTTP com bytes/hashes, quatro serviços ativos, unidade/cwd do worker, SQL/grants/owner e índice oficial conferidos.
- Na janela de publicação, tarefas e seus hashes, conversas, mensagens, saídas, políticas e configuração de eventos permaneceram iguais. Não houve chamada de IA, tarefa ou mensagem de teste, envio WhatsApp ou reprocessamento de respostas antigas pelo publicador.
- Leitura somente de agregados às14h14: **68 de69 acompanhamentos gerenciados abertos** tinham observação persistida e fonte atual. O restante já estava em `needs_owner`, pois a tarefa vinculada não foi encontrada; não inventar outra tarefa nem encerrá-lo automaticamente. Um evento normal de varredura foi observado; nenhum `team_review_scan_failed` desde a ativação. Atualizar resumos não significa enviar68 mensagens ou criar68 tarefas.

O worker já existente varre a cada30 segundos. A atualização depende de fonte válida, política, carteira selecionada e expediente; o prazo oficial continua pertencendo a Tarefas. A primeira observação produtiva confirma leitura/gravação do resumo, não certifica respostas humanas futuras, semântica irrestrita ou entrega externa. Validar a próxima mudança real na conversa existente e registrar aceite de Josias.

## Continuidade

Não promover `dist` antigo, bundle de teste, migrações anteriores ou autorizações já consumidas. A próxima composição deve herdar esta candidata/perfil e as1.731 fontes. O frontend continua o da release Meta; outros workers conservam suas candidatas anteriores.

Pacote e metadados locais: `.local/atlas-source-refresh-release-20261023-01/`. Backups de funções, estado e perfil ficam somente na VPS. Evidência pública da documentação contém apenas hashes, contagens e limites. Não houve ensaio real de IA nem conferência visual repetida nesta publicação, pois não há alteração de interface.
