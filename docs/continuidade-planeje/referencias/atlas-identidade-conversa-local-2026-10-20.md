# Atlas: identidade da conversa — correção local

Este registro descreve a validação anterior à publicação. **A correção foi publicada em 20/10/2026, 01h41**, após autorização específica. [Estado produtivo, verificações e limites](atlas-identidade-conversa-producao-2026-10-20.md). Revisão independente concluída sem achados abertos.

## Causa e correção

Uma resposta em primeira pessoa foi compreendida no resumo, mas o modelo escolheu outro contato. A validação bloqueou o encaminhamento e substituiu a resposta por uma pergunta de identidade, repetindo-a a cada nova tentativa. Evidência produtiva foi consultada somente em leitura; conteúdo real não foi copiado para esta referência nem para os testes.

A mensagem atual passa a identificar explicitamente o nome e o `actor_id` autenticado. A instrução de acompanhamento diferencia relato da pessoa atual de encaminhamento para outra pessoa: `executor_id=null` mantém o contato, inclusive quando o dono informa que cuida de uma etapa. O modelo recebe apenas os contatos aceitos pela mesma validação de encaminhamento: contato atual ou indicação explícita da conta. A proteção no servidor e no banco permanece.

Nenhuma tarefa é criada ou reassinada por essa confirmação. Status, prazo oficial, evidências, escopo, sessões, isolamento de cliente, provedor, modelo e autenticação não mudaram. Nenhuma migração foi alterada ou adicionada. O único arquivo de runtime alterado é `scripts/atlas-team-pilot/manager.py`; dois arquivos de testes acompanham a mudança.

## Verificação

- Reprodução anterior à correção: o esquema oferecia outros integrantes mesmo quando o dono respondia sobre si; teste falhou antes da implementação.
- `python3 -m unittest discover -s scripts/atlas-team-pilot -p test_manager.py`: 43 testes. Inclui envio pelo fluxo real de reserva/contexto/validação/gravação com transporte fictício, nome do autor na mensagem e nenhum encaminhamento no autorrelato.
- `python3 -m unittest discover -s scripts/atlas-team-pilot -p test_rules.py`: 14 testes de horário.
- `python3 -m unittest discover -s scripts/atlas-events -p test_model_context.py`: nove testes de contexto.
- `python3 scripts/atlas-manager-integration/verify.py`: 94 verificações SQL/RLS em cluster PostgreSQL local descartável, por socket Unix, sem DSN produtivo. Três casos novos conferem que o dono pode registrar andamento e próxima revisão sem selecionar executor, duplicar resposta ou alterar os campos oficiais da tarefa.

Artefatos privados de baseline, diff, manifesto e logs: `.local/atlas-speaker-loop-20261020-01/`. [Evidência resumida](../evidencias/releases/atlas-identidade-conversa-local-2026-10-20.json).

A revisão identificou e resolveu uma regressão de perfis com nome nulo/vazio: o autor conserva a identidade autenticada e recebe rótulo genérico quando não há nome; perfis sem nome não são inferidos como novo contato. As verificações do revisor incluíram 216 combinações de contatos e seis casos adversos. Relatório privado: `/Users/josiasbonfimdefaria/.codex/reviews/atlas-speaker-loop-2026-10-20.md`.

## Limites e próximo passo

Os testes de transporte usam resposta sintética; não certificam a interpretação de uma chamada real à IA. Não foram feitos envios reais à equipe, alterações de dados produtivos, reinícios ou publicação nesta tarefa. A tela não mudou; build e verificações visuais não foram repetidos para um delta somente Python.

A autorização específica foi recebida e executada na publicação vinculada acima. Conferir uma resposta humana no acompanhamento existente, mantendo o histórico. Não repetir respostas antigas em massa nem reaplicar migrações. A confirmação em primeira pessoa não modifica a responsabilidade oficial no módulo Tarefas.
