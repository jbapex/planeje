> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Fase 2 — Publicações por canal

## Resultado

A Fase 2 foi implementada e validada somente no ambiente de testes.

Uma tarefa de material agora pode ter várias publicações independentes. Cada publicação guarda canal, destino, responsável, data, status, link de comprovação e ajustes próprios. Publicar em um canal não conclui os demais.

## Regras confirmadas

- A tarefa principal continua controlando produção, revisão e aprovação.
- Cada canal possui sua própria execução.
- Uma publicação concluída exige data e link de comprovação.
- Reagendamento e cancelamento ficam no histórico.
- A tarefa principal não pode ser publicada enquanto houver canal pendente.
- Canais cancelados permanecem registrados, mas não contam no progresso.
- O calendário e as filas mostram cada canal separadamente.
- Tarefas antigas sem publicações vinculadas continuam funcionando pelo fluxo anterior.

## Validação executada

Foi criada a tarefa `TESTE FASE 2 — Material multicanal 14/09` com três ocorrências:

- Instagram: publicado com comprovação.
- YouTube: publicado com comprovação.
- Facebook: reagendado e depois cancelado, preservando o histórico.

O sistema bloqueou corretamente uma publicação sem comprovante e também bloqueou o encerramento da tarefa enquanto havia canais pendentes. Depois de concluir Instagram e YouTube e cancelar Facebook, a tarefa avançou pelo fluxo existente.

Os testes de regras JavaScript, banco de dados, compilação e navegação passaram. A conferência por impressão digital confirmou que as 1.238 tarefas anteriores, 13 automações, 6 funções operacionais e 24 perfis não foram alterados.

## Segurança e recuperação

- Produção não foi alterada.
- Backup validado: `/opt/planeje-staging/private/phase2-before-20260914T142441Z`
- VPS de testes: `2.25.216.103`
- A Fase 2 ainda controla a execução e a comprovação; ela não publica automaticamente nas redes sociais.

## Refinamento de fluidez

O fluxo foi refinado no ambiente de testes em 14/09/2026:

- O campo simples `Plataforma` foi removido da tela das tarefas de conteúdo. Os dados antigos continuam preservados.
- `Adicionar canais` permite escolher várias plataformas antes de configurar cada uma.
- Cada canal aparece como uma etapa de publicação dentro da tarefa.
- O status pode ser alterado diretamente na etapa; ao escolher `Publicado`, o sistema abre data e comprovante.
- A aba `Anexos` separa o material principal dos anexos de Instagram, Facebook, YouTube e demais canais.
- O cartão da tarefa mostra os logos dos canais e o progresso, por exemplo `1/3 canais`.

Validação realizada com `TESTE FLUIDEZ — Canais e anexos 14/09`: três canais, troca rápida de status, comprovante do Instagram e anexo específico do Facebook. O painel permaneceu aberto durante as mudanças e o cartão foi atualizado ao fechar a tarefa.

Backup anterior ao refinamento: `/opt/planeje-staging/private/phase2-fluidity-before-20260914T154143Z`.
