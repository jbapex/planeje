> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Plano para prazos, etapas e publicações

Data: 16/09/2026  
Ambiente analisado: staging  
Implementação: proposta histórica, implementada posteriormente no staging em 16/09/2026.

**Atualização de continuidade:** produção agora encerra no marco comprovado de revisão final de material ou etapa posterior, e não somente em Aguardando cliente. SLA da etapa, justificativas, urgência/ordenação de postagem e cobertura foram implantados. O texto abaixo preserva a proposta original; consulte [o estado atual](../01-ESTADO-ATUAL.md) e [as decisões finais](../03-DECISOES-E-REGRAS.md) antes de programar ou aplicar SQL.

## Problema confirmado

Hoje a cor de atraso depende quase sempre de `tarefas.due_date` e só desaparece quando o status inteiro da tarefa é terminal. Isso mistura três compromissos diferentes:

1. prazo para a agência entregar o material;
2. tempo gasto na etapa atual;
3. data em que cada canal deve publicar.

Por isso um material já enviado ao cliente pode continuar vermelho enquanto aguarda aprovação, agendamento ou publicação. A regra também está repetida em vários pontos: cartões de Tarefas, capacidade da equipe, saúde da conta, Cobertura e SQL dos painéis.

## Regra proposta

### 1. Prazo de produção

`due_date` continua sendo a data prometida para o material ficar pronto e ser entregue para aprovação. Ele fica vermelho somente enquanto a produção ainda não atingiu o marco de entrega.

- Briefing, roteiro, gravação, design, edição, revisão interna, validação e envio ao cliente mantêm o relógio de produção ativo.
- Ao entrar em `Aguardando cliente`, o sistema registra a entrega real e encerra esse relógio.
- Depois disso, a interface mostra `Entregue em dd/mm`, mesmo que a data original tenha passado.
- Se o cliente pedir alteração, abre-se um novo prazo da etapa de correção; o prazo original permanece como histórico e não volta a deixar a tarefa inteira atrasada.

### 2. Prazo da etapa atual

Cada etapa operacional ganha seu próprio relógio, configurado pela função ou pelo fluxo.

- O relógio começa quando a tarefa entra na etapa.
- A tela mostra `Nesta etapa há X dias` ou `Etapa atrasada X dias`.
- Espera externa, como `Aguardando cliente`, não conta como atraso da equipe.
- Alteração e urgência podem receber SLA próprio sem alterar a data histórica da primeira entrega.

### 3. Data de postagem

A postagem é acompanhada separadamente da produção.

- `tarefas.post_date` já existe e já é usada na criação de tarefas planejadas.
- Cada publicação por canal já possui `task_channel_publications.scheduled_for`, status, `published_on` e evidência.
- Para um único canal, `post_date` pode refletir a data daquela publicação.
- Para vários canais com datas diferentes, cada canal é cobrado pela própria `scheduled_for`; a tarefa não fica marcada como atraso de produção.
- Publicação vencida aparece como `Publicação pendente` no canal correspondente e na área de Redes Sociais.

## Alterações técnicas previstas

### Banco e SQL

- Adicionar em `tarefas` os marcos `production_delivered_at`, `stage_started_at` e `stage_due_at`.
- Adicionar às etapas do fluxo uma classificação de relógio: `production`, `external_wait`, `publication` ou `complete`.
- Atualizar o trigger de mudança de etapa para registrar a primeira entrega e iniciar o prazo da nova etapa.
- Criar uma função ou view única de estado do prazo, consumida por Tarefas, Capacidade, Cobertura e Saúde da conta.
- Sincronizar `post_date` com publicações sem sobrescrever datas diferentes de múltiplos canais.
- Atualizar as RPCs de Cobertura para não contar como atrasado um material já entregue.

### Migração dos dados atuais

- Reconstruir a primeira entrega pelo `stage_execution_history` quando houver transição para `Aguardando cliente`, postagem ou conclusão.
- Usar `published_on` nas publicações já concluídas.
- Quando não houver histórico confiável, marcar o dado como inferido e evitar criar atraso retroativo.
- Preservar `due_date` e `post_date`; a migração acrescenta marcos e não reescreve prazos históricos.

### Interface

- Vermelho: produção ou etapa interna realmente vencida.
- Verde: material entregue, com a data real.
- Cinza/azul: aguardando cliente, sem penalizar a equipe.
- Âmbar: publicação próxima ou pendente.
- Nos cartões, mostrar no máximo um alerta principal e um aviso de publicação, evitando misturar os dois relógios.

## Ordem da próxima rodada

1. criar migração SQL e testes de backfill;
2. centralizar a regra de prazo em uma função compartilhada;
3. ajustar cartões, lista, detalhe, Capacidade, Cobertura e Saúde da conta;
4. validar tarefas em produção, revisão, aguardando cliente, alteração, agendada e publicada;
5. testar múltiplos canais com datas diferentes;
6. documentar e manter exclusivamente no staging até validação do usuário.

## Critério de aceite

- Material já entregue não aparece como atraso de produção.
- Espera do cliente não reduz a saúde operacional da equipe.
- Correção atrasada aparece como atraso da etapa de correção.
- Publicação atrasada aparece no canal correspondente.
- Uma tarefa multicanal pode ter um canal publicado e outro pendente sem perder o histórico.
- Cobertura, Tarefas e Capacidade exibem o mesmo resultado para o mesmo item.
