# Assessoria integrada à operação: requisito e diagnóstico

14/10/2026 — Registro de escopo e auditoria de leitura. NÃO É implementação concluída, aceite ou publicação.

Josias pediu que Assessoria se comunique com todo o sistema, especialmente Tráfego e Rotina semanal. Quer um ambiente isolado em que consiga testar a operação funcional, com persistência e continuidade entre áreas, em vez de avaliar somente uma tela. A proposta anterior de ciclos mensais foi explicada pelo assistente; os detalhes de fechamento/transição ainda não são regra aprovada por Josias.

## Evidência atual

- A prévia 4318 monta apenas Projects e ProjectDetail. A API e a autenticação são substituídas por fixtures; os dados reiniciam ao recarregar. Ela serve à revisão de interface e não comprova operação integrada.
- `cs_action_task` cria ou vincula a tarefa real por projeto/ação e cliente. Ao criar, usa `type=interno`; portanto não se deve afirmar que toda ação criada na Assessoria já aparece na operação de Tráfego. Tarefas de Tráfego têm também dados próprios de demanda/campanha. Precisam de integração explícita, sem criar segunda tarefa.
- Assessoria consulta os contatos do CRM/Rastreamento por cliente, mantém versões e documentos e tem links para essas áreas. Ainda não consolida a Rotina semanal nem tem navegação de contexto completa para Tráfego.
- A Rotina vigente é `TrafficWeeklyRoutine` em `/paid-traffic/rotina`, e não a antiga página `/traffic-weekly`. Usa `traffic_weekly_reviews`, revisões/otimizações por cliente e semana, responsável, prazo, histórico, tarefas e RPCs existentes. Abrir uma revisão usa cliente/semana/tipo e, quando disponível, o id da revisão.
- A Rotina já pode gerar demandas recorrentes. Consultar o acompanhamento da Assessoria não deve acionar geradores nem criar outra rotina paralela.
- SSH das VPS 103 e 109 disponível nesta auditoria com a chave Planeje existente. Nenhum arquivo remoto ou serviço foi alterado. A homologação tem os serviços separados em execução; sua fonte/Rotina estão antigas em relação à produção. A página HTTPS de saúde retornou erro TLS, embora serviços internos estejam ativos. O banco de homologação já contém 43 cadastros; não tratar essa base como vazia/anônima nem sobrescrevê-la.
- A homologação possui tabela de revisões semanais, mas não as versões CS. Não tem `supabase_migrations.schema_migrations` neste esquema consultado; aplicar migrações por suposição ou reaplicar um lote histórico não é um procedimento seguro.

## Escopo funcional para a próxima implementação

1. Uma única identidade de cliente e uma referência explícita de período atravessam Assessoria, Tarefas, Tráfego, Rotina, Rastreamento e Histórico. Navegação não perde cliente/período nem troca silenciosamente de operação.
2. Estratégia/funil/compromissos permanecem na Assessoria. Responsável, prazo e execução usam a tarefa real. Quando a execução é de Tráfego, usar o mecanismo de demanda já existente e conservar o mesmo id de tarefa. Vínculo a tarefa já existente deve ser idempotente e impedir outro cliente.
3. Revisões/otimizações da Rotina alimentam a visão do período. Não exigir redigitar números ou análise que já existem. Informar origem, semana, data de atualização e ausência de registro; não converter ausência em zero.
4. Campanhas/resultados/configurações continuam nas fontes de Tráfego e Rastreamento. Contatos, agendamentos e vendas respeitam seus eventos/datas; nenhuma conclusão de tarefa prova que campanha foi publicada ou CAPI validado.
5. Histórico do cliente guarda reuniões, relatórios, versões e arquivos, sem criar cópias concorrentes dos mesmos registros. Retorno à Assessoria deve permitir conferir o vínculo.
6. O contrato permanece ativo enquanto durar o atendimento. Acompanhamento do período deve consolidar a operação semanal; a definição exata de ciclos/fechamento depende do desenho integrado, e não da conclusão automática das tarefas ou fim do mês.

## Ambiente e aceite funcional

Preferência respondida posteriormente por Josias: **clientes fictícios e consulta aos dados reais, sem alterá-los**. A implementação subsequente está em [teste integrado](apice-cs-integracao-teste-2026-10-14.md). No momento desta auditoria inicial, a resposta ainda não havia chegado. A base segura proposta é um ambiente com dados sintéticos persistentes e backend real; nenhuma cópia de dados de clientes está autorizada por inferência. Preservar a homologação existente e seus registros. Reconciliar a fonte atual e o esquema antes de disponibilizar o candidato.

Cenários mínimos de aceite:

- Criar ação no plano, abrir a mesma tarefa em Tarefas e, quando aplicável, na operação de Tráfego; alterar prazo/status e conferir atualização ao voltar.
- Registrar e revisar a semana na Rotina; conferir a mesma análise/semana na Assessoria, sem duplicar tarefa, número ou revisão.
- Anexar documento e recuperar o mesmo registro/versão pelo cliente e pelo projeto.
- Acompanhar material do cliente separadamente da execução interna; concluir uma tarefa não inventa recebimento nem publicação.
- Trocar cliente/período, atualizar página e entrar novamente sem perder dados ou misturar clientes. Testar permissões de gestor/equipe e contas sem acesso.
- Testar falha de salvamento, reconexão e edição concorrente com recuperação de rascunho e erro visível. Não prometer ausência absoluta de interrupções.

Integrações externas do ambiente isolado permanecem restritas. Fluxos internos devem ser reais; métricas externas de demonstração devem ser identificadas. Consulta externa real, se desejada, precisa de acesso de leitura separado. Envio WhatsApp/e-mail, alterações de campanha e eventos CAPI não fazem parte de um teste comum. Atlas continua pausado.

## Estado ao fim desta auditoria

Somente leitura e documentação. Não houve nova implementação, build, migração, serviço iniciado, teste de escrita, projeto real ou alteração da produção. A prévia 4318 segue sendo a prévia visual anterior; o ambiente integrado solicitado ainda não está pronto. A próxima entrega deve ser avaliada pelos cenários acima, não apenas por captura/build da tela.
