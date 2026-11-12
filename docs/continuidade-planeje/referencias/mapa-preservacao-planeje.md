> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Planeje — o que existe, o que preservar e o que melhorar

**Diagnóstico de preservação · 09/09/2026. Somente leitura do sistema; nenhuma implementação funcional.**

**O Planeje já orquestra uma parte importante da agência. A evolução deve completar essa operação, conservando suas tarefas, automações, históricos e integrações.** A necessidade principal é ligar melhor os recursos existentes, controlar cada publicação e tornar as regras independentes de nomes de pessoas.

Esta revisão amplia e corrige os diagnósticos anteriores: há publicador Meta, planejamento com calendário e geração de tarefas, onboarding detalhado, CRM com múltiplas vendas e painel combinado Meta/Google. Eles não devem aparecer no plano como módulos a construir do zero. Também não adotaremos a proposta anterior de um responsável permanente pelo fluxo: Josias esclareceu que a própria tarefa muda de responsável conforme a etapa.

## O que foi efetivamente verificado

Foram cruzados código ligado às rotas atuais, configurações e registros do banco, funções implantadas e processos auxiliares da VPS com os quatro documentos enviados e as correções de Josias. A coleta de banco usada neste relatório ocorreu aproximadamente entre **14h02 e 14h08, horário de Brasília**, com o sistema em uso.

| Evidência encontrada | O que permite afirmar |
|---|---|
| 1.230 tarefas; 1.217 com histórico | Existe uma operação acumulada que precisa ser preservada. |
| 6.669 entradas de histórico marcadas como automação, em 905 tarefas; última às 13h57 de hoje | A orquestração tem registros recentes de execução, além de configuração na tela. O histórico não identifica a versão de cada regra. |
| 1.251 anexos, 1.364 comentários e 46 subtarefas | A tarefa contém contexto e produção; não pode ser migrada apenas como título/status. |
| 24 projetos, 12 planos de campanha, 49 materiais em seis planos | Planejamento e transformação de materiais em trabalho já têm base persistida. |
| 31 checklists de cliente, 16 solicitações e 67 documentos | Onboarding, entrada de demanda e documentação já são partes do produto. |
| 8.670 contatos, 8.163 leads e 1.606 conversas | CRM e atendimento devem manter identidade, origem e vínculos existentes. |

**Limite da conclusão:** código ativo, configuração e histórico não comprovam que todas as integrações funcionam hoje de ponta a ponta. Não foram feitas publicações, envios, mudanças de status, testes de verba ou navegação autenticada que pudesse gravar dados. Algumas telas escrevem automaticamente ao abrir. Os testes descritos abaixo serão feitos em ambiente isolado, depois de autorizada essa etapa.

## Comparação lado a lado

“Existe” significa capacidade identificada no caminho ativo. Quando há registros de uso, isso é indicado; uma integração externa não foi considerada homologada apenas por existir um botão.

| Área | O que existe hoje e deve continuar | Melhoria proposta sobre essa base |
|---|---|---|
| **Tarefa simples** | Cadastro curto, responsável inicial escolhido, prazo, prioridade, cliente/projeto opcionais. | Mostrar campos conforme o trabalho; tarefa interna continua rápida e não exige briefing de produção. |
| **Fila da equipe** | Lista, kanban, agenda, timeline, filtros, prioridades e atualização em tempo real. | Tornar próxima ação e impedimento claros nas mesmas visões; ampliar capacidade e urgência depois de definir sua regra. |
| **Responsáveis por etapa** | Oito regras ativas; adicionar, substituir e recuperar responsáveis pelo histórico. Há execução recente registrada. | Permitir destinatário por função com pessoa designada, usando o motor existente. Preservar escolha inicial, múltiplos responsáveis e histórico. |
| **Etapas e requisitos** | Status configuráveis e subtarefas obrigatórias por tipo e destino. Vídeo tem Roteiro e Captação configurados em A Fazer. | Validar em qual passagem deve haver bloqueio; aplicar a mesma regra nas diferentes entradas. Não trocar todos os status de uma vez. |
| **Briefing e revisão** | Formulário estruturado, rascunho, aviso de incompletude, comentários, anexos e histórico. | Aprovação vinculada à versão e regras de devolução explícitas. Manter o conteúdo já preenchido. |
| **Tempo e produtividade** | Configuração, visualização e sete tarefas com registros de tempo. | Confirmar geração dos períodos e corrigir critérios do relatório antes de usar números para medir capacidade. |
| **Projetos e campanhas** | Cadastro por cliente/mês/evento e painel operacional. Acesso depende do perfil. | Completar acompanhamento de compromissos e exceções sem criar outra estrutura de projeto. |
| **Plano de campanha** | Estratégia, fases, materiais, mídia/verba, cronograma, apoio IA, autosave e PDF. | Acrescentar aprovação e vínculo confiável entre escopo, material e execução, mantendo edição e rascunhos. |
| **Material → tarefa** | Criação pelo planejador/calendário copia conteúdo, tipo, responsáveis e datas. Associação posterior pode depender do título. | Criar vínculo por identificador estável e impedir duplicação. Renomear a peça não pode perder a relação. |
| **Calendário e cobertura** | Datas de entrega/postagem, arraste de materiais e contratado/planejado/entregue; tráfego puro pode ser não aplicável. | Separar unidade produzida de publicação e preservar o contratado por mês. Definir quando uma mudança de data atualiza a tarefa vinculada. |
| **Documentos e checklists** | Documentos por cliente com editor e permissão de uso pela IA; checklist cria tarefas em lote. | Conectar às etapas existentes. A sugestão IA desse checklist específico é simulada; não confundir com os demais recursos IA reais. |
| **Onboarding** | Itens, subtarefas, responsáveis, notas, datas, conclusão, colunas e timeline; 31 checklists registrados. | Evoluir dependências, próxima ação e ativação operacional. Preservar os itens existentes ao ligá-los às tarefas. |
| **Solicitações** | Entrada por origens diferentes, triagem e conversão em tarefa; 16 registros. | Garantir uma conversão por solicitação e preservar origem/contexto, sem exigir redigitação. |
| **Produção → Social** | Publicado move a mesma tarefa para Redes Sociais/concluídos e limpa responsáveis. | Manter acervo, identidade e saída da fila; separar produção concluída de distribuição ainda pendente. |
| **Vários canais** | Tarefa tem plataforma e data; isso não representa várias entregas independentes. | **Confirmado:** publicações vinculadas à tarefa principal, cada uma com destino, responsável, data, situação e evidência. Uma não encerra as demais. |
| **Publicador Meta** | Facebook: texto/link imediato ou agendado. Instagram: imagem por URL e legenda, imediata. Chamadas reais existem, sem envio nesta auditoria. | Ligar o publicador às publicações e registrar resultado externo. Vídeo, carrossel, novos canais e ampliação de postagem automática precisam de escopo próprio. |
| **Produção → anúncio** | Delegar criação de anúncio leva responsável, verba, anexos e origem para campanha interna. | Completar o pedido e preservar vínculo com a peça aprovada. Criar campanha interna não significa publicar anúncio na plataforma. |
| **Tráfego Meta/Google** | Contas vinculadas, consultas e filtros; controle real de status/verba Meta. 16 contas Meta e uma Google vinculadas. | Preservar comandos e IDs corretos; completar autorização e alçadas, sem remover capacidades legítimas da equipe. |
| **Central e rotinas de tráfego** | Checkups, orçamento, responsáveis, demandas e conclusão com evidência/próxima ação; dez rotinas configuradas. | Corrigir geração, evitar duplicação e comprovar execução. Configuração ativa e checkup antigo não demonstram rotina cumprida hoje. |
| **CRM e vendas** | Contatos e leads distintos, pipeline, agenda, motivos, histórico e várias vendas/itens por lead. | Melhorar próxima ação, adoção e conciliação. Preservar registros de venda; não substituí-los por um simples “comprou”. |
| **Captação e integrações comerciais** | Importação Meta manual e por consulta periódica, roteamento para pipeline/etapa, tracking de anúncios para WhatsApp, tentativas de conversão e ponte com CRM Ápice. Configuração/uso são parciais; sucesso atual das conversões não foi comprovado. | Preservar formulários, IDs externos, origem, canal e destinos. Corrigir falhas específicas e validar repetição de eventos sem duplicar leads ou conversões. |
| **Rastreamento e resultados** | Relatório Meta, funil visual e painel combinado Meta/Google; portal e PGM com resultados informados. | Conciliar fonte, período e identidade; evitar gasto ou venda contados duas vezes. Reutilizar os painéis atuais. |
| **Importação e exportação** | Contatos têm exportação completa paginada e exportação da tabela; leads têm CSV/importação próprios. | Corrigir limitações específicas da exportação de leads, mantendo campos, filtros e origem. Não tratar toda exportação como limitada à tela. |
| **Atendimento WhatsApp** | Filas, assumir/transferir/resolver/reabrir, mensagens/mídia, contexto CRM e tarefa criada da conversa. | Preservar cliente/canal/conversa, acesso e deduplicação; tornar pendência e próxima ação consistentes. |
| **Caixa, lembretes e notificações** | Pendências por triggers, lembretes internos e regras de WhatsApp; serviço separado gera resumo e recebe eventos de tarefa. | Unificar observação e prevenir envio duplicado, preservando destinatários e silêncio. Não substituir tudo por uma nova notificação. |
| **Extensão e MCP** | Extensão cria tarefas/solicitações com contexto; MCP ativo tem 63 ferramentas registradas no código e endpoint de saúde respondendo. | Manter esses acessos e compatibilidade. Validar regras também nessas entradas, pois algumas gravam diretamente sem passar pelo motor da tela. |
| **IA e briefing público** | Assistentes internos, ApexIA do cliente, documentos autorizados, histórico e formulário por link/token. | Preservar separação de clientes, conversas privadas, links distribuídos, respostas e arquivos; melhorar contexto sem expor informação interna. |
| **Equipe e permissões** | Papéis de acesso, permissões por módulo/usuário e restrições de cliente/canal. | Acrescentar funções operacionais separadamente. Substituir pessoa não pode apagar regras da empresa ou mudar acessos sem revisão. |
| **Financeiro da agência** | Cadastro comercial e resultados financeiros dos clientes são bases distintas. Não foi encontrada a esteira completa de cobrança da agência. | Desenvolver recebíveis, cobrança e suspensão/liberação segundo regras confirmadas. Não confundir receita do cliente com pagamento à agência. |

## A passagem de responsáveis que precisa ser conservada

| Ação atual | Efeito observado na configuração | Condição para qualquer mudança |
|---|---|---|
| Criar tarefa | Criador escolhe a pessoa inicial; não há regra ativa de atribuição na criação. | Manter essa escolha. |
| Entrar em Em Revisão | Acrescenta dois destinatários e mantém os responsáveis existentes. | Preservar até Josias confirmar se quer mudar a composição. |
| Entrar em aprovação/agendamento configurados | Remove responsáveis anteriores e coloca os destinatários definidos. | Resolver por função sem transformar “trocar” em “adicionar”. |
| Entrar em Josias | O resultado combinado das duas regras é atribuição ao destinatário dessa etapa. | Nomear a função e seu ocupante após validação; não presumir cargo pelo nome do status. |
| Voltar para Alteração | Recupera responsáveis do histórico mais recente de A Fazer. | Não trocar silenciosamente por “quem estava na etapa imediatamente anterior”. Tratar ausência de histórico/pessoa. |
| Entrar em Publicado | Mesma tarefa vai para Social, fica concluída e sem responsáveis atuais. | Preservar histórico e acervo. A nova distribuição precisa manter destinos pendentes sem repetir os disparos históricos. |

Há regras redundantes que chegam ao mesmo conjunto final; isso não prova encaminhamento errado. Um destinatário configurado não foi localizado entre os perfis internos atuais e precisa de identificação antes de qualquer substituição. A ação `notify_user` da regra de vencimento não está implementada no motor examinado; existem outros caminhos de alerta que devem ser avaliados separadamente.

## Pontos concretos que podem quebrar o fluxo se forem ignorados

1. **Excluir uma pessoa pode remover automações que ela criou.** A função de limpeza de usuário implantada contém exclusão das regras pelo criador. Substituir integrantes exige preservar as regras da agência e os autores históricos.
2. **Mudar um status afeta mais do que o kanban.** Automação, Social, calendário, relatórios, cronômetro, MCP e resumo WhatsApp consomem esses valores. O rótulo visível Stand-by usa o valor legado `dezembro`; Agendado usa um identificador pessoal. Isso exige compatibilidade, não renomeação indiscriminada.
3. **Nem toda entrada passa pelo mesmo motor.** Atendimento, planejador, extensão, solicitação e MCP têm caminhos diferentes. Corrigir só a tela de tarefas deixa passagens sem validação e pode duplicar efeitos quando o motor for centralizado.
4. **O serviço separado de briefing envia WhatsApp ao iniciar quando ativo.** Restaurar ou reiniciar sem isolamento pode disparar resumo real. Há caminhos distintos de agendamento; corrigir um sem coordenar os outros pode duplicar mensagens.
5. **Tarefa concluída sem responsável pode ser resultado normal do fluxo Social.** Não preencher em lote com uma pessoa, reabrir ou reclassificar esses registros como “corrompidos”.
6. **Projetos e Solicitações não estão simplesmente desligados.** Existem exceções por usuário. A nova matriz de funções precisa preservar o acesso efetivo de cada perfil.
7. **Resultados usam datas e fontes diferentes.** Primeira mensagem, última interação, dia informado e data da venda produzem recortes diferentes. Um painel novo não resolve isso por soma; é necessário conciliar as definições.

O anexo identifica ainda defeitos localizados a corrigir, como o salvamento do onboarding filtrado, o encaminhamento ao CRM Ápice e ações de relatório sem handler correspondente. Não foram provocados em produção. Preservar o fluxo legítimo não significa conservar falhas de autorização ou perda de dados.

## Como demonstrar que a evolução preservou o sistema

Antes de codar a primeira fase funcional, a proposta é restaurar a cópia em ambiente separado, impedir mensagens/publicações/alterações externas e registrar o comportamento atual. A comparação deve incluir:

| Caso de validação | O que deve permanecer igual ou mudar de forma aprovada |
|---|---|
| Tarefa comum, tarefa de vídeo e devolução de revisão | Cadastro, validações, responsáveis esperados, datas, comentários, anexos e histórico. |
| Tarefa criada por cada entrada | Uma única tarefa, origem preservada e mesmas regras aplicáveis, sem execução duplicada. |
| Material renomeado e reagendado | Vínculo com a mesma tarefa; regra de datas explícita; nenhum duplicado. |
| Publicação antiga e peça nova em três destinos | Históricos antigos intactos; novo controle mostra uma publicada e duas pendentes. |
| Troca de integrante | Regras continuam existindo; pendências têm destino revisado; autoria passada permanece. |
| Cliente e colaborador com permissões diferentes | Cada um mantém os acessos legítimos e não acessa clientes fora de sua permissão. |
| Atendimento, links de briefing e integrações | Identidades, links e respostas permanecem; eventos repetidos não duplicam tarefa ou envio. |
| Resultados com duas vendas, campanhas homônimas e mais de mil contatos | Registros preservados, fontes reconciliadas e filtros consistentes, sem duplicar gasto/receita. |

Depois: mudanças pequenas e aditivas, comparação antes/depois, piloto e liberação por fase. O retorno de versão precisa aceitar os dados novos; restaurar um banco antigo sobre trabalho recém-criado não é um retorno seguro. Os testes acima são **critérios futuros**, não testes já executados.

## Backup e documentos de referência

Josias informou que fez um **snapshot da VPS**; a existência e o estado desse snapshot no provedor não foram inspecionados. O backup criptografado já foi criado e verificado no Mac e na VPS. A revisão acrescentou um pacote protegido do serviço separado de briefing no Mac. **A restauração completa isolada continua pendente.**

- [Plano de fases revisado](plano-fases-preliminar-para-validacao.md): preservação primeiro; depois funções, publicações, operação dos clientes, tráfego/resultados e financeiro.
- [Anexo técnico de preservação](anexo-preservacao-planeje.md): evidências por módulo, regras, dependências e critérios de regressão.
- [Registro do backup](backup-inicial-LEIA-ME.md): conteúdo protegido, verificações e recuperação pendente.

Este mapa é a referência atual para o planejamento. Não altera os quatro documentos originais enviados nem autoriza implementação. As decisões já dadas por Josias estão incorporadas; revisão, contagem contratual, alçadas e demais regras ainda abertas serão confirmadas na fase correspondente. A interface continuará com ação, prazo, responsável e situação visíveis; explicações adicionais ficam no **?**.
