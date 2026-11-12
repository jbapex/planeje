# Atlas: sugestões de responsável e prazo — teste privado, 15/10/2026

Josias pediu calcular responsável e datas do repasse. Escolheu expressamente: **“Usar inicialmente 1 dia útil para apuração e 3 dias úteis para produção, deixando essas regras editáveis.”** Implementação somente no piloto CS independente da VPS 103, acessível em `http://127.0.0.1:4320/#/caixa`. Não publicada em produção.

## Como funciona

Ao abrir **Revisar repasse**, tanto uma proposta de IA quanto uma preparação manual recebem sugestão calculada. O campo de responsável e a data aparecem preenchidos quando existe cadastro suficiente. O padrão `[Nome do cliente] Ação da tarefa` continua vigente. Usuário pode ajustar os campos e deve confirmar o repasse. Nada é criado, transferido ou enviado pelo simples cálculo.

Responsável:

- Fluxo existente prevalece: usa os responsáveis da função da entrada, mostrando o grupo completo que o fluxo atribui. Não substitui silenciosamente o fluxo por alguém escolhido pelo modelo.
- Tráfego usa o responsável cadastrado para aquele cliente, sem trocar sua carteira apenas por quantidade de tarefas.
- Nas demais funções compatíveis com o tema, escolhe a menor fila entre integrantes ativos. Considera tarefas abertas de todos os clientes autorizados, não só o cliente da demanda.
- Cadastro inexistente ou mais de uma função compatível gera explicação e solicita escolha. Não atribui ao dono por falta de cadastro. Temas por título/tipo/contexto usam regras determinísticas; palavras no prefixo do cliente são desconsideradas.

Prazo:

- Mantém data informada na proposta ou alterada pelo usuário, com aviso se estiver no passado.
- Se todas as etapas necessárias até a primeira revisão/entrega no fluxo tiverem duração cadastrada, soma os dias úteis de execução. Uma soma parcial não é apresentada como prazo completo.
- Sem duração completa, usa a regra aprovada: apuração **1** dia útil; produção **3**. Valores editáveis em **Regras de prazo**, dentro da revisão, persistem por dono e só afetam novos cálculos.
- Usa a data de São Paulo retornada pelo banco e soma segunda a sexta a partir do dia seguinte; zero dias em fim de semana passa à segunda. Não há calendário de feriados nem cálculo de horas disponíveis. A fila orienta a pessoa; não acrescenta arbitrariamente dias ao prazo.
- Capacidade semanal cadastrada para a função gera aviso quando já atingida. Não desloca compromissos existentes nem promete uma vaga de agenda.

**Recalcular sugestões** consulta a fila e regras atuais. Ajustes de pessoa/data feitos pelo usuário são mantidos. Mudar tipo recalcula a sugestão; atribuição obrigatória de fluxo permanece explícita. Ao salvar regras, a confirmação é desmarcada e o dono revisa novamente.

## Implementação e proteção

- `src/lib/atlasDemandSchedule.js`: cálculo puro e calendário, sem modelo ou API externa.
- `src/components/atlas/AtlasDemandScheduleControls.jsx`: motivos, fila, recálculo e edição de regras.
- `AtlasDemandCentral.jsx` / CSS: abertura da revisão, aplicação de sugestões e envio da fotografia dos dados revisados. Preparação manual pode ser renovada sem chamada ao modelo.
- Migração nova **`20261016000249_atlas_demand_schedule_suggestions.sql`**, gerada pelo CLI (versão UTC; data local da entrega é 15/10). Aplicada somente no CS, uma vez. Não reaplicar ou transportar à produção por inferência.
- Tabela privada por dono `atlas_demand_planning_settings`: RLS, somente SELECT autenticado; escrita por RPC de dono humano ativo/sessão vigente. Sem autorização por metadado editável. Revisão otimista evita sobrepor outra edição.
- RPC `atlas_demand_schedule_context`: invoker, restrita ao dono, retorna funções/fluxos, carteira, política e contagem global de tarefas. Agrega dados autorizados e não entrega esse contexto à equipe ou ao modelo.
- Hash de data local/cadastro/fila/regras é revalidado antes da criação. Mudança exige recálculo. Regras da proposta/cliente e revisão humana continuam válidas.
- Após inserir, confere se os gatilhos mantiveram os responsáveis e a data que o dono revisou; uma troca silenciosa causa rollback. Grupo de entrada de fluxo é mostrado e confirmado por inteiro. Registro em histórico conserva os responsáveis efetivamente revisados.
- Vínculo e transferência de tarefa existente conservam fase, datas e título. Não houve atualização em lote das tarefas anteriores.

Cálculo e recálculo não gastam tokens. Chave de IA, worker, limites e automações do escritório produtivo permaneceram como estavam. Nginx mantém transportes externos bloqueados. Sem nova dependência, porta ou serviço.

## Verificação

13 testes de cálculo cobrem fim de semana, data inválida, carteira, menor fila, pessoa inativa, função ambígua, escolhas do dono, edição das regras, duração completa/parcial de fluxo, capacidade e prefixo de cliente. Mais cinco regressões de plano/operação passaram.

29 verificações API/Auth/RLS passaram: defaults 1/3, fuso correto, fila entre clientes, recusa de equipe/anônimo, escrita direta negada, edição concorrente com um vencedor, regras privadas, regras/fila obsoletas recusadas, tarefas concluídas fora da fila aberta, preservação dos campos revisados e replay sem duplicar. Fluxo real de teste confirmou rollback quando o gatilho tentaria trocar a pessoa; grupo integral revisado foi aceito. Tarefas anteriores permaneceram intactas. Configurações fictícias de função/fluxo foram inseridas pelo serviço do teste para essa verificação e removidas; permissões existentes de configuração não foram ampliadas. Uma tentativa inicial pela conta sintética foi recusada pela RLS e corrigida usando apenas a fixture privilegiada, sem afrouxar a política.

Novo exemplo persistente **“Apurar resultados da campanha · prazo sugerido”**, no Ateliê Aurora fictício, ficou preparado manualmente, sem tarefa criada, para Josias revisar. Criado depois da limpeza das fixtures para conservar contexto válido.

Navegador: responsável Tráfego de teste e 16/10 para apuração; mudar regra a dois dias recalcou para 19/10; produção usou 20/10. Regras restauradas a 1/3. Capturas e regressão de títulos na release. Aceite de uso continua pendente.

## Limites e continuidade

A heurística reconhece temas e cadastros; não conhece horas reais de disponibilidade, férias ou feriados. Se a função não estiver configurada, pede escolha. A data é estimativa revisável, e não promessa automática ao cliente. A integração da central com os grupos WhatsApp e a política de distribuição direta/via Poliana continuam pendentes. Publicação produtiva exige candidato reconciliado e validação da operação real.

Release remota `/opt/planeje-cs-integration/releases/atlas-prazos-20261015-01`, com baseline, cópia anterior da aprovação e index anterior. Reversão de interface restaura o index preservado sem apagar dados. Não remover a tabela de regras ou tarefas por reversão automática; preserve escolhas do usuário.

Assets servidos: `index-fa52ab5c.js` / `index-14203771.css`. Regressão dos títulos: 15 verificações API passaram após a nova função de aprovação. Estado final: sete tarefas anteriores e quatro demandas, sem função/fluxo fictícios de teste restantes; regras persistidas 1/3 na revisão 6. Tela estreita 390 px sem excesso horizontal do painel, viewport restaurado. Exemplo ficou aberto na revisão, sem aprovação nem tarefa criada.
