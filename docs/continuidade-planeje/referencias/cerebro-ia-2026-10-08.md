# Cérebro IA — primeira versão — 08/10/2026

Plano de referência de 08/10. A primeira entrega consulta e propõe. Não cria tarefa, não grava comentário e não envia mensagem. Em 08/10, com autorização, a migração foi aplicada uma vez e o frontend publicado (`index.a72afcd0.js`, recarregar `?v=a72afcd0`; conserva `index.12c95261.js`). O piloto permanece desligado.

## O que já existia

| Peça | Onde está | Uso nesta versão |
| - | - | - |
| ApexIA da equipe | `#/assistant`, `AssistantHome`, `ClientChat`, `GeneralChat` | O chat geral e o chat por cliente continuam. A entrada do Cérebro fica em `#/assistant/cerebro`. |
| Histórico do assistente | `assistant_project_conversations` | Continua sendo o chat. A missão pode apontar `conversation_id`; não copia as mensagens. |
| Aprendizado antigo | `ai_learning_feedback`, `ai_user_preferences` | Preferência de resposta. Não tem escopo, versão nem fonte. A memória nova fica em `brain_memories`. |
| Minha caixa | `#/caixa`, `pendencias_caixa` e `caixa_dot_threads` | A decisão usa o tópico já existente `kind = aviso`. A fila da Operação não muda. |
| Tarefas, projetos, planos | `tarefas`, `projetos`, `campaign_plans.materiais` | Estado oficial. A consulta lê de novo na hora. |
| Reuniões | `cliente_reunioes`, `cliente_reuniao_falas` | Fonte. Sem o prefixo Aprovado/Pedido/Ideia/Cancelado, a fala não vira compromisso. A nota estruturada cobre a ata sem transcrição. |
| Comentários | `task_comments` | Leitura de linha `Bloqueio:` ou `Impedimento:`. Não grava. |
| Briefing e cobertura | `briefing_payload`, cobertura mensal, materiais do plano | A cobertura desta versão compara material do plano com `plan_material_id`. Não cria briefing novo. |
| IA | `openai-chat` e `openrouter-chat` | A chave continua no servidor. Esta entrega não chama o modelo para prazo, pessoa ou compromisso. |
| Conta | sem tabela de organização | A agência é a chave `jbapex`. O acesso também olha o cliente e o usuário. |
| Dias úteis | `addBusinessDays` em `collaboratorIndicators.js` | Segunda a sexta. Feriado não entra. |
| Agenda, WhatsApp, cron, fila | existem em outras áreas | Fora desta entrega. |

## Tabelas novas

`brain_settings`, `brain_agents`, `brain_runs`, `brain_actions`, `brain_alignment_items`, `brain_memories`, `brain_feedback`.

O piloto nasce desligado. Sem cliente na lista, nenhum cliente entra. A ação não tem estado `executada`. O autorizador fica vazio até uma etapa posterior. Correção de memória cria versão; o texto vigente não é reescrito.

## Próximo incremento

Execução interna: criar tarefa de pedido já aprovado, comentário com agente e autorizador separados, lembrete, fila e regra de autorização. Reprocessar sem duplicar efeito.
