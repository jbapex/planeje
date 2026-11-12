# Atlas: conversa, fila pessoal e resposta posterior — entrega local

Estado da QA: **implementado e verificado localmente em 27/10/2026**. Posteriormente, Josias autorizou e o conjunto foi [publicado às16h12](atlas-conversa-equipe-producao-2026-10-27.md); primeiro ciclo humano e aceite continuam pendentes. O restante registra a verificação local anterior à publicação. Josias aprovou o [plano](../../superpowers/plans/2026-10-27-atlas-conversa-equipe.md) e pediu registrar justificativa quando o cliente já foi respondido. A aprovação do plano não autoriza migração/publicação produtiva implicitamente.

## Comportamento entregue

- O Atlas guarda dependência, próximo passo e fatos respondidos no mesmo acompanhamento. Reconhece “sou eu mesmo”, confirmação curta e espera por cliente; não volta à pergunta inicial só porque o histórico ultrapassou 40 mensagens.
- Negação, previsão cancelada, previsão vencida e reagendamento têm regressões próprias. Dia informado sem hora permanece separado da revisão calculada. Horários comerciais individuais, dias úteis e uso manual do dono fora do horário foram preservados.
- Comentários, justificativas, etapa, responsáveis, anexo e publicação continuam disponíveis no contexto expansível. Avisos automáticos usam texto curto; título antigo não comprova tarefa existente. Encerrar acompanhamento não promete excluir a tarefa.
- Evidência existente é referenciada por tipo/ID e validada em Python e SQL para a tarefa/cliente/rodada atual; o link vem do registro. Metadados não significam abertura do arquivo ou verificação externa.
- O colaborador vê seus assuntos. Filtros: Precisa responder, Não lidas e Atlas acompanhando. Equipe aparece somente ao superadmin autorizado no próprio escopo. Revisão de entrega e decisão do dono têm prioridade sobre dependências antigas. Mais de 100 assuntos usam páginas completas, sem aceitar sucesso parcial de uma página que falhou.
- Após encaminhamento ou revogação da atribuição, o antigo destinatário perde acesso ao chat completo, inclusive SELECT direto. Histórico permanece para o superadmin do escopo. Não foi criado um arquivo retrospectivo pessoal separado.
- Enviar persiste mensagem/request e confirma o recebimento antes da análise. O campo permite preparar outro texto; navegação não perde a mensagem salva. Uma análise ativa por assunto; próxima mensagem aguarda a resposta anterior. Retentativa usa o mesmo ID sem duplicar texto e preserva rascunho novo na sessão.
- O worker deriva ator/sessão do request, usa lease e reconfere autorização, revisão e fontes antes da escrita. Falhas registram uso disponível da IA. Restart expira processamento abandonado para retentativa explícita, sem replay coletivo de respostas antigas.
- Aprovação pertinente de grupo pode retomar uma thread aguardando cliente. Resultado tipado aponta a thread fornecida no contexto; writer reconfere binding, tarefa/rodada, revisão, todas as fontes citadas e remetente interno atual. “Ok” solto não libera trabalho. Aplicar um retorno não invalida outro do mesmo lote.

## Cliente já respondido

Dentro do assunto, **O cliente já foi respondido?** aparece ao dono ou à conta oficial que também tenha acesso vigente ao chat. Escolher o grupo, explicar o atendimento e confirmar **Registrar atendimento e resolver aviso** grava a justificativa com autor/data e resolve o aviso daquela conversa. Não cria mensagem externa, apaga histórico nem conclui tarefas. A base fica marcada como relato humano; não é uma verificação externa da resposta.

Mensagem/versão nova, grupo desvinculado, falta de conta ou executor sem essa responsabilidade impedem a ação. SQL livre não é aceito de conversa ou modelo. O fluxo oficial de `atendimento_conversas`/`pendencias_caixa` continua responsável pelo aviso; não foi criado um motor paralelo de tarefas.

## Leitura produtiva observada, separada da entrega

Na auditoria somente leitura de 27/10, o pipeline de eventos estava em assistência para 24 clientes; transcrição habilitada e 250 áudios concluídos, com conclusão no mesmo dia. Havia trabalhos bloqueados, esperando orçamento e com erro. O monitor geral antigo estava desligado. Isso demonstra atividade do fluxo de grupos/áudio, sem provar cobertura perfeita de todos os atrasos ou que o orçamento do dia tenha acabado. Nenhum desses flags/limites foi alterado por esta entrega local.

## Verificação

- 188 testes Python em oito arquivos selecionados, transportes e respostas de modelo fictícios.
- 181 verificações nomeadas em PostgreSQL16.15 descartável por socket; cenários negativos adicionais usam exceções. 140 contratos históricos rodam antes da nova migração; os demais e regressões de permissão/concorrência rodam depois dela.
- Helper Node cobre 113 assuntos, falha de página, atenção pessoal e revisão/decisão.
- Oito verificações novas de navegador em 1280/390, cinco de retry e cinco do balão existente; zero rede externa e zero erros de navegador. Conferência visual das telas locais realizada.
- `npm run check` passou: contexto, harness, lint rápido/tipado, tipos, regras, testes locais e build temporário. Lint rápido: 358 avisos, zero erros; tipado: 11 avisos, zero erros. Não foram suprimidos.
- Revisão independente e sensível encerrada: oito achados corrigidos, incluindo vínculo revogado, negação, previsão, uso em falha, revisão escondida, assuntos irmãos, todas as fontes e responsabilidade da conta para resolver o aviso. Relatório privado fora do repositório.

Comandos seguros de regressão, sem endpoint produtivo ou modelo:

```sh
node scripts/atlasTeamDialogue.test.mjs
python3 scripts/atlas-manager-integration/verify.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-team-pilot/test_dialogue.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-team-pilot/test_queue.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-team-pilot/test_manager.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-team-pilot/test_progress.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-team-pilot/test_rules.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-events/test_context.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-events/test_model_context.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/atlas-events/test_dialogue_dispatch.py
```

Não substituir a seleção por discovery de todos os `test_*.py`: existem scripts de integração destinados a hosts específicos. Navegador usa fixture da prévia do time em porta própria 4355, com Playwright/Chrome já disponíveis; depende de paths locais declarados nas variáveis do verificador.

## Conjunto validado antes da publicação

Migração nova: `supabase/migrations/20261027170137_atlas_dialogue_team_flow.sql`, SHA-256 `e7693827c1d020ed4ccc59c252c8f33e1b6293eb7df588769528e8d5c4ad89c5`. **Durante esta QA não estava aplicada na VPS; foi aplicada uma vez na publicação posterior vinculada acima.** Migrações anteriores não foram editadas/reaplicadas.

Inventário/hashes e logs estão em `.local/atlas-dialogue-20261027/`; [evidência resumida](../evidencias/releases/atlas-conversa-equipe-local-2026-10-27.json) não contém mensagens reais, chaves ou dados brutos de cliente. Incluir o módulo novo `scripts/atlas-team-pilot/dialogue.py` e os consumidores Python/React/SQL do inventário ao formar a candidata; não atualizar só o frontend. Código preserva modelo/provedor/autenticação e limites existentes; não adiciona dependência.

Etapa prevista na QA, posteriormente autorizada e executada: publicar este conjunto, aplicar apenas a migração nova e reiniciar workers afetados. Antes de montar a candidata produtiva, conferir a release/fontes concorrentes e herdar perfil/flags reais; a publicação de Rastreamento às 13h28 já tinha 1.737 fontes e impede partir de frontend Atlas antigo. Não promover `dist` de teste. Depois, validar um ciclo humano real, sem replay coletivo e sem mensagem externa de teste.

IA real paga, produção e aceite humano não foram verificados por esta QA local. A verificação técnica produtiva posterior está registrada na referência de publicação; modelo real e aceite seguem pendentes. Leitura ao vivo de campanhas, análise dos bytes de vídeo/arquivo e verificação de qualidade/postagem externa permanecem fora do escopo. Naturalidade em mensagens livres pode precisar de ajustes após o primeiro ciclo real.
