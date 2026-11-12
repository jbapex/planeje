> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Fase 5 — Onboarding controlado

Implementação autorizada por Josias em 16/09/2026 ao avançar para a fase 5 do programa mestre. Disponível na VPS isolada de testes, em `http://localhost:18080/#/onboarding` e `https://app.planeje.online/#/onboarding`. A versão de produção em 72.60.14.109 não foi alterada.

## Como usar

1. Abra **Onboarding → Etapas e prazos** para ajustar o modelo. Cada etapa tem nome, orientações, parte de quem depende, responsável da equipe e prazo em dias úteis. É possível adicionar, remover, reordenar e desativar modelos.
2. Clique em **Iniciar onboarding** e escolha cliente, modelo e responsável pelo acompanhamento. Etapas sem responsável fixo usam a pessoa escolhida ao iniciar.
3. **Continuar etapa** abre as orientações para edição direta, responsável, pendência e prazo. O mesmo trabalho pode ser acessado por **Abrir tarefa**, na fila normal de Tarefas.
4. Concluir uma etapa, no onboarding ou na própria tarefa, encerra aquele trabalho e cria apenas a tarefa da etapa seguinte. O prazo dela começa na ativação. Ao concluir a última, o onboarding fica concluído.

## Regras

- A entrada organiza clientes em **Com a equipe**, **Aguardando cliente** e **Concluídos**, com progresso, ação atual, responsável e prazo. **Comigo agora** filtra o acompanhamento atual do usuário.
- O gestor configura modelos e inicia onboardings. O responsável da etapa ou um gestor pode ajustar ou concluir o trabalho. Clientes e pessoas fora da equipe não acessam as novas tabelas/RPCs.
- Há no máximo um onboarding ativo por cliente e uma etapa ativa por onboarding. Tentativas repetidas ou concorrentes não duplicam tarefas.
- Etapas futuras têm orientações, responsável e duração configurados, mas não têm tarefa, data de início ou prazo correndo.
- As etapas são uma cópia do modelo na data de início. Alterar o modelo não modifica clientes em andamento. Ajustes específicos são feitos na etapa daquele cliente, inclusive nas etapas futuras.
- Quem acompanha uma pendência do cliente é alguém da equipe. Mudar “Depende de” separa a pendência no painel; não envia mensagens nem concede acesso ao cliente.
- O calendário é de dias úteis de segunda a sexta, no fuso `America/Sao_Paulo`; feriados não são incluídos nesta implementação.
- A etapa ativa exige responsável ativo e prazo. Se alguém de uma etapa futura ficar indisponível, o sistema pede ajuste antes de avançar e mantém a conclusão anterior sem efetivar, por transação.
- Reabrir etapas concluídas é bloqueado para não criar um segundo caminho paralelo ao onboarding atual. Tarefas vinculadas não podem perder o cliente ou trocar para um fluxo de conteúdo.
- O detalhe da tarefa de onboarding usa prazo da etapa e um responsável, sem campos de postagem, campanha, plataforma, copy ou comprovante de produção. Anexos, comentários, orientações e histórico continuam disponíveis.
- O status genérico **Concluído** encerra tarefas operacionais. Conteúdo continua seguindo **Publicado** e os comprovantes/publicações por canal; o novo status não libera esse bloqueio.
- Os 31 checklists anteriores, com 57 itens, continuam acessíveis em **Checklists anteriores**. Não houve conversão automática, criação retroativa ou alteração dos registros anteriores.

## Modelo inicial

**Entrada de cliente** vem com uma sequência sugerida, editável antes de iniciar:

| Etapa | Depende de | Prazo sugerido |
| --- | --- | --- |
| Alinhar objetivos e escopo | Equipe | 2 dias úteis |
| Receber informações e acessos | Cliente | 3 dias úteis |
| Organizar a operação | Equipe | 2 dias úteis |
| Confirmar início com o cliente | Cliente | 2 dias úteis |

Os prazos são sugestões do modelo, não acordos atribuídos a clientes existentes. Não foi iniciado nenhum onboarding real automaticamente. O onboarding prepara a entrada; os planos do mês e os materiais continuam em Projetos, conforme a fase 4.

## Validação

- Testes de interface: criar modelo fictício, iniciar cliente fictício, editar orientações e prazo, preservar texto não salvo durante atualização, mudar pendência para cliente, concluir primeira etapa, abrir tarefa real e concluir a última por Tarefas. O painel passou a 100% e Concluídos.
- Aceitação SQL como `authenticated`, com `BEGIN/ROLLBACK`: configuração, etapas futuras sem tarefas/prazos, ordem, snapshot do modelo, edição nas duas telas, autorização do responsável, bloqueio de outro colaborador, acesso negado fora da equipe, idempotência e encerramento. Datas próximas à meia-noite UTC e fim de semana verificadas.
- Duas transações autenticadas concorrentes: início retornou um único onboarding; conclusão criou uma única tarefa seguinte.
- Fluxo da fase 4 de plano → tarefa → entrega comprovada → publicação → conclusão voltou a passar, sem liberar os bloqueios de comprovante, justificativa e postagem.
- 14 testes automáticos aprovados; ESLint `no-undef` e build de staging aprovados.
- Registros temporários removidos. Ao final: 43 clientes, 1.239 tarefas, 31 checklists e 57 itens, iguais ao início. Um modelo inicial e nenhum onboarding real iniciado.

Código da entrega em `work/planeje-phase5-onboarding/source`; backup privado em `/opt/planeje-staging/private/phase5-before-20260916`. O aceite de uso de Josias e eventual promoção para produção são passos separados.
