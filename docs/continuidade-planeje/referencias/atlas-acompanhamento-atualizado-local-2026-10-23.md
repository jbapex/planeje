**Publicado posteriormente, em23/10/2026 às14h11.** [Estado produtivo e evidência](atlas-acompanhamento-atualizado-producao-2026-10-23.md). O texto abaixo registra a preparação anterior.

# Atlas: acompanhamento atualizado pelos registros

**23/10/2026 — validado localmente; não publicado.** Reparo do acompanhamento previsto no [desenho aprovado do gerente](../../superpowers/specs/2026-10-17-atlas-gerente-operacional-design.md). Não há aceite operacional nem nova autorização de publicação.

## Diagnóstico verificado

A leitura somente de diagnóstico da VPS confirmou o worker da equipe na candidata `atlas-task-record-20261020-01/candidate`. Os três módulos de runtime conferem com a base publicada de 20/10. O leitor já disponibilizava comentários, justificativas e detalhes, mas o lembrete automático apenas dizia que existiam comentários e repetia uma pergunta genérica. A conversa não reobservava entregas em revisão. O leitor pessoal sob demanda e o acompanhamento automático eram caminhos diferentes.

Nenhum conteúdo de cliente foi copiado para os testes ou esta documentação. Os testes descritos abaixo usam somente pessoas, tarefas e campanhas fictícias.

## Comportamento corrigido

- O acompanhamento existente relê etapa, atribuição, histórico, comentário recente com autor/data, justificativa e publicações por canal. Atualiza o resumo e a versão observada; preserva todas as mensagens anteriores.
- Uma mudança relevante gera um reconhecimento dos registros, uma vez. Conversas antigas recebem uma primeira observação silenciosa; novos acompanhamentos só abordam a pessoa depois da leitura das fontes. Uma atualização do snapshot geral de campanhas não dispara mensagens sobre a tarefa.
- Uma tarefa oficialmente concluída ou com todos os canais previstos registrados como publicados segue para conferência da conta interna ativa. O Atlas não altera o status oficial nem afirma verificação externa. Falta de executor não devolve uma entrega válida ao dono como erro de cadastro.
- Alteração posterior retoma o acompanhamento com o responsável oficial válido. Publicação anterior à última correção não conclui o novo ciclo: editar metadados de uma publicação antiga não equivale a publicar novamente.
- Uma entrega informada por pessoa permanece em conferência. A observação humana aplicada mais recente prevalece sobre um snapshot antigo do worker. Comentário novo sozinho não reabre a execução.
- Espera explícita por decisão/esclarecimento do dono preserva a pausa e não ganha um relógio novo, inclusive se a atribuição mudar. Revisão futura combinada e teto existente de duas cobranças não respondidas por dia são preservados.
- Data de agendamento (`scheduled_for`, DATE) e horário exato (`scheduled_at`) são respeitados. Todos os contatos automáticos continuam no expediente individual e em dias úteis.

Para tarefas de tráfego, o mesmo leitor inclui somente o snapshot Meta permitido do cliente: data/período, total ativo, até oito nomes/IDs e indicadores seguros de erro. Só apresenta como recente quando tem até dez minutos, período iniciado no mês corrente e nenhum erro. Mesmo recente, o total geral de campanhas não comprova a entrega de uma tarefa específica. Snapshot antigo, futuro, inválido ou com erro é identificado como insuficiente para afirmar campanhas ativas agora.

## Escopo e proteção

Runtime: `scripts/atlas-team-pilot/{server,time_rules,manager,task_progress}.py`. Migração incremental nova: `20261023160734_atlas_followup_source_refresh.sql`. Migrações anteriores não foram editadas nem reaplicadas na VPS.

O helper continua SECURITY INVOKER, com vínculo exato tarefa/cliente e RLS existente. O apply é exclusivo do worker e revalida seleção/política, revisão da conversa, versão das fontes, pessoa ativa e horário antes de gravar. Uma resposta humana em processamento bloqueia a observação concorrente. Tarefa, atribuição, prazo oficial, arquivos e histórico não são reescritos. O snapshot não entrega credenciais nem a linha completa do cliente.

Não foram acrescentadas chamadas de IA automáticas. Interpretação livre de uma resposta humana continua no modelo/provedor/autenticação existentes. Comentários são citados como relatos atribuídos, não obedecidos como instruções do sistema.

## Verificação local

| Conjunto | Resultado |
| --- | --- |
| Python: expediente/lembretes | 17 testes passaram |
| Python: atualização das fontes e integração do scan | 25 testes passaram |
| Python: gerente/conversa existente | 54 testes passaram |
| PostgreSQL descartável: integração, RPC e RLS | 140 verificações passaram |

As regressões falharam antes das correções nos cenários de comentário ignorado, publicação completa ainda cobrada, entrega relatada recusada, publicação antiga após correção, agendamento DATE, atualização silenciosa adiando revisão e pausa do dono reativada. A revisão independente reproduziu seis P2 e confirmou suas correções; relatório privado em `.codex/reviews/atlas-source-refresh-2026-10-23.md` no diretório do usuário, modo0600.

Comandos usados:

```sh
python3 scripts/atlas-team-pilot/test_rules.py
python3 scripts/atlas-team-pilot/test_progress.py
python3 scripts/atlas-team-pilot/test_manager.py
python3 scripts/atlas-manager-integration/verify.py
npm run verify:context
```

O runner SQL cria/remove um cluster local por socket Unix, sem aceitar DSN ou conectar à VPS; PostgreSQL local16, produtivo17.6. Os testes não chamam IA, serviços externos ou pessoas. Documentação pública PostgreSQL17 consultada via Context7 para locks de linha e SECURITY INVOKER/search_path; a consulta adicional ao changelog Supabase não retornou conteúdo utilizável, e não há mudança de SDK. [Locks](https://www.postgresql.org/docs/17/explicit-locking.html) e [funções](https://www.postgresql.org/docs/17/sql-createfunction.html).

[Evidência sem dados de clientes e hashes](../evidencias/releases/atlas-acompanhamento-atualizado-local-2026-10-23.json). Artefatos privados locais em `.local/atlas-source-refresh-20261023/`: baseline publicada, diff restrito, logs Python e resultado SQL. HEAD não representa a base entregue; não usar o diff global do checkout como pacote desta correção.

## Limites e publicação pendente

Este reparo acompanha registros do Planeje. Não abre bytes de anexos, não consulta redes sociais/Meta/Google em tempo real, não comprova qualidade ou entrega externa e não implementa entendimento novo por IA em cada varredura. Não houve teste semântico real do modelo nem ciclo humano produtivo nesta rodada. UI/build/áudio não foram repetidos porque o delta é de backend/SQL; `npm run check` completo não foi executado.

Publicação exige autorização específica atual, revalidação de fontes/concorrência e migração nova uma vez, com atualização apenas do worker da equipe. Herdar a base produtiva mais recente, inclusive a release de Rastreamento Meta de 23/10; preservar frontend, perfil/flags e outros serviços. Não promover `dist` da raiz, bundle de teste ou migrações antigas. Depois, validar uma mudança real na conversa existente, sem disparo coletivo ou reprocessamento de respostas antigas.
