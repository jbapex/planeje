# Operação de conteúdo da agência — Instagram e Facebook

Data: 18/10/2026. Estado: organização do fluxo e correções locais; não publicado.

## Decisões do usuário

- A agência precisa acompanhar o trabalho inteiro no Planeje, com abas funcionais.
- A pessoa responsável pelo cliente aprova o conteúdo.
- A aprovação deve disparar o agendamento automaticamente.
- Instagram e Facebook vêm primeiro, conforme resposta explícita em 18/10.
- O calendário visual escolhido permanece; Tarefas continua sendo a execução oficial.

Não há aceite humano da operação completa nem autorização nova de publicação,
migração, envio de teste ou ativação de integrações nesta rodada.

## Etapas e critérios de passagem

| Etapa | Quem atua | O que precisa estar pronto para avançar |
| --- | --- | --- |
| Planejamento | Responsável do cliente/equipe | Tarefa vinculada ao cliente, objetivo, prazo de produção, redes, contas e horários por rede. Ausência de horário é pendência, não um horário inventado. |
| Produção | Responsáveis da etapa existente | Material e legenda ligados à mesma tarefa, sem duplicar o fluxo de execução. |
| Revisão | Função de revisão do fluxo | Material conferido; ajustes voltam ao produtor e preservam histórico e prazos. |
| Aprovação | Responsável ativo cadastrado no cliente | Aprovação explícita da versão do material, legenda, formato, conta e horário. Mudança desse conjunto exige nova aprovação. |
| Agendamento | Servidor do Planeje | Aprovação válida e registro persistente por rede. A operação não depende de a aba continuar aberta. Falha em um canal não apaga sucesso de outro. |
| Publicação | Integração de cada rede | Envio no horário, com controle de concorrência. Resposta incerta exige conferência; não repetir uma postagem possivelmente enviada. |
| Comprovação | Integração ou responsável | ID/link real do post; confirmação manual identificada como manual. A exceção existente “Cliente publica” continua explícita. |

Sem responsável ativo, conta válida, material ou horário futuro, o conteúdo deve
permanecer pendente com motivo. Atraso não autoriza mudar silenciosamente para
“Enviar agora”. Conclusão da produção não é confirmação de publicação.

## Papel de cada aba

| Aba | Fonte e finalidade |
| --- | --- |
| Visão Geral | Contas vinculadas e métricas; não é uma prova de que a fila está operacional. |
| Calendário | Ocorrências por rede, agrupadas quando compartilham tarefa/horário; semana, mês, filtros e detalhe. |
| Produção | As tarefas de conteúdo ainda em andamento, com etapas e responsáveis existentes. Pode coexistir com ocorrências já planejadas. |
| A publicar | Pendências, falhas, datas sem intenção de envio e resultados ainda sem confirmação. |
| Agendados | Intenção explícita de agendamento no Planeje ou registro de agendamento na Meta. Ainda não significa publicado. |
| Concluídos | Publicações por integração, informadas manualmente ou sob responsabilidade do cliente. Histórico antigo de tarefas fica identificado separadamente. |
| Perfil e feed | Conferência do destino e dos posts efetivamente disponíveis na rede. |

Na tarefa, **Tarefa** controla execução; **Publicações** controla contas,
legendas e horários por rede; **Anexos**, **Comentários** e **Histórico**
preservam material, conversa e rastreabilidade. A data geral da tarefa não
substitui os horários por canal.

## Rodada 1 — correções locais realizadas

- A consulta e o Realtime usam todos os sete tipos de conteúdo: arte,
  carrossel, vídeo, reels, post, story e social_media.
- Filas e calendário usam a mesma evidência para distinguir programação de
  uma data apenas informada. Resultados incertos aparecem para conferência.
- Produção fica acessível pelas mesmas tarefas. Registros legados concluídos
  não são apresentados como comprovação de postagem.
- Abrir a tarefa pelo calendário entra em Publicações. Salvar canais atualiza
  as filas; editar tarefa preserva seu proprietário.
- Editar legenda ou registrar publicação mantém a data/hora de cada canal,
  incluindo segundos. Horários novos continuam independentes por canal.
- Formato explícito prevalece sobre título; “Vídeo” com acento não vira
  “Estático”. Data sem horário deixa de exibir um horário fictício.
- Histórico legado sem data/cor e histórico nulo não derrubam a aba.
- O agendador Instagram exige intenção booleana explícita de envio. Claim e
  progresso usam revisão/token/lease, sem sobrescrever alterações concorrentes.
- Resultado externo incerto não é reenviado automaticamente. As entradas do
  compositor também bloqueiam reenvio até conferência; confirmar manualmente
  permite guardar e abrir o comprovante.

Estas correções não implementam, por si, a aprovação automática abaixo.

## Rodada 2 — aprovação persistente e segurança do envio

Reutilizar `tarefas` e `task_channel_publications`, registrando a aprovação por
ocorrência. Não criar outro quadro de execução ou outro motor de responsáveis.

1. Vincular cada ocorrência à conta exata do cliente. Não escolher a primeira
   conta por aproximação de nome. Usar o identificador do responsável ativo;
   nome legado/ambíguo precisa ser corrigido antes de autorizar envio.
2. Registrar aprovador, instante e snapshot de versão, material, legenda,
   formato, conta, destino e horário. Arquivo do Drive pode mudar mantendo o
   mesmo ID; a versão aprovada precisa conferir também a versão dos bytes.
3. Aprovar por operação transacional no servidor: conferir ator, acesso,
   revisões concorrentes e pré-requisitos; registrar aprovação e intenção uma
   única vez. Trocar o status da tarefa não deve armar um envio.
4. Invalidar a aprovação se o conjunto aprovado mudar. Programação já enviada
   ao Facebook precisa de cancelamento/reconciliação externa antes de mudar.
5. Exigir a ocorrência aprovada nos caminhos de envio e upload Meta. Preservar
   consultas e operações existentes dentro de seus respectivos escopos.

Aceitação: recusar pessoa errada/inativa, conta de outro cliente, arquivo
modificado e horário vencido; clique duplo produz uma intenção; edição
concorrente não aproveita aprovação antiga. Ensaiar com banco isolado/RLS.

## Rodada 3 — ciclo completo de Instagram e Facebook

1. Todo novo conteúdo precisa existir como tarefa/ocorrência antes de qualquer
   envio externo, inclusive publicação imediata e agendamento Facebook.
2. Reutilizar o agendador e os transportes existentes com payload aprovado no
   servidor. Preparar filas sem deixar itens posteriores presos nos primeiros
   slots já prontos ou aguardando horário.
3. Conferir retorno externo: Instagram precisa conciliar resultado incerto;
   Facebook precisa passar de agendado para publicado com ID/link confirmado.
4. Retentar somente falhas comprovadamente seguras, com limite e espera.
   Resultado ambíguo permanece em atenção, preservando o registro.
5. Testar dois canais, horários diferentes, recusa da Meta, token expirado,
   arquivo indisponível, concorrência, retomada, alteração e falha parcial.

Aceitação: o mesmo conteúdo percorre planejamento, produção, aprovação,
agendamento e comprovação; todas as abas mostram os mesmos registros/estado,
sem duplicar tarefas nem reexecutar canais já entregues.

## Rodada 4 — validação operacional e publicação

Somente depois dos testes isolados, preparar uma release com fontes/perfil
produtivos vigentes, recuperação e revisão. Publicação, SQL, credenciais e post
real de teste exigem autorização específica. Conferir um ciclo controlado com
o responsável e registrar aceite humano. Teste de UI não certifica cron,
permissão do provedor ou entrega real.

TikTok e YouTube ficam para uma etapa posterior, com autenticação/permissões e
capacidades próprias. A presença no seletor não comprova integração.

## Evidência desta rodada

- `npm run check` com Node 20 passou: verificações locais canônicas e build
  temporário, sem substituir `dist` ou ZIPs operacionais.
- 65 testes dirigidos de filas, calendário, horários, tarefas e concorrência passaram.
  O teste do handler real usa banco/Graph fictícios: dois workers produzem um
  POST; sem intenção não envia; cancelamento é preservado; resposta incerta
  não repete o envio.
- Página real em `http://127.0.0.1:4350/#/social-media`, com API/autenticação
  fictícias, validada em 1440 e 390 px. Sete abas principais e cinco da tarefa,
  filtros/contagens, legado, histórico inválido e edição de legenda; zero
  erros JavaScript e zero requisições externas. Escrita somente em memória.
- Revisão independente resolveu dois caminhos de reenvio/rotulagem incerta.
  Relatório privado: `/tmp/planeje-social-operations-review-20261018.md`.
- Evidência local: `.local/social-operations-20261018/`; instruções da prévia:
  [README](../../../scripts/social-operations-preview/README.md).

Não houve publicação, migração produtiva, alteração de cliente, postagem ou
mensagem real. Aprovação automática, autorização/vínculo exato de conta,
reconciliação externa e operação produtiva completa continuam pendentes.
