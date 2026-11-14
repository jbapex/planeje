# Conversar: orquestração e execução no Squad

## Pedido e autorização

Josias pediu, em 12/11/2026, validar o conversacional do ScaleOS conversando com o Patrício, implementar um equivalente funcional no Planeje e publicar na VPS depois da validação. O objetivo inclui análise, leitura de mensagens autorizadas, coordenação de CRM IA, CS IA e Gestor IA, perguntas em caixas, execução real, atividade animada e avatares dos agentes. O menu deve seguir o Planeje e o Conversar deve usar o avatar Atlas existente. Publicação está autorizada para este trabalho; aceite de uso não está presumido.

O pedido delega as escolhas de implementação e manda começar a execução. Não repetir uma rodada de autorização de desenho. Esta especificação registra as escolhas técnicas do implementador e será revisada antes do código.

## Evidência e estado inicial

- A auditoria anterior está em `docs/continuidade-planeje/referencias/scaleos-conversar-2026-11-10.md`. A interface publicada em 10/11 não implementou a mesma capacidade de execução.
- Em 12/11 foi criada no ScaleOS a sessão `7330ff67-f7b9-4cb4-ba6b-81f832de3e3b`: consulta real ao CRM mostrou a chamada do especialista e os agentes configurados. Um formulário fictício de seis etapas foi preenchido; a resposta consolidou os campos e parou sem gravação, conforme solicitado.
- O formulário mostrou empresa, nome, tom em opções, objetivo, variáveis e etapa. Há progresso, Voltar, Avançar, campos opcionais e alternativa de responder por texto. As respostas ficam no histórico.
- Brain é conhecimento, com lacunas e um atalho Ensinar. Esse atalho envia um pedido de ensino ao chat; não é outro modo de execução. O teste parou sem fornecer dados para cadastro.
- Listas de ferramentas descritas pelo próprio Patrício são evidência declarada, não prova de execução de todas elas. A cobertura final distingue observado, testado e indisponível.
- Atlas já persiste conversa, execução, fontes, missões, memória e revisão de tarefas. O especialista CRM atual é explicitamente de leitura. O novo executor não pode apenas mudar esse prompt.
- Os serviços CRM, CS e Gestor já validam sessão, módulos, cliente, papel e versões. A Agenda Gestor exige `session_id` real e rejeita delegação do worker. Por isso aprovações devem executar na sessão do usuário.

## Abordagens e decisão do implementador

1. Ampliar somente o prompt do Atlas: insuficiente; não cria ferramentas ou recibos.
2. Substituir tudo por outro assistente: perderia conversas, memória, identidade e serviços já existentes.
3. Acrescentar um executor interativo ao Atlas e usar os serviços oficiais: escolhido. O Conversar usa esse caminho; o Escritório e os fluxos operacionais existentes continuam com seus contratos.

O executor usa o mesmo provedor, modelo e autenticação configurados para o chat. Não instala framework ou dependência nova. React18/Vite4/npm e Supabase/Deno/PostgreSQL permanecem.

## Fluxo e arquitetura

`Pedido → leitura autorizada → especialista → pergunta, proposta ou resposta → decisão → serviço oficial → recibo → releitura → continuação`.

- O endpoint `atlas-chat` mantém autenticação e `ownerGate`; o pedido do Conversar identifica o modo de execução na identidade persistida. Repetir um request em outro modo dá conflito.
- Um runtime específico e testável de execução usa as fontes existentes e um catálogo fechado de operações por app. O modelo não escolhe RPC arbitrário, tabela, SQL, URL ou segredo.
- Leituras rodam com o caller autenticado. Fontes têm cliente, período, consulta, paginação, cobertura e links. Indisponível não é vazio. Texto de mensagem só entra quando a fonte oficial autoriza o ator, canal e contato exatos.
- Especialistas CRM IA, CS IA e Gestor IA recebem somente as ferramentas do próprio app. A operação legada pode ser consultada com as ferramentas existentes; delegação não amplia acesso. Profundidade e ciclos são limitados.
- Perguntas e propostas ficam em itens persistidos ligados ao usuário, conversa e run. Cada item registra tipo, app, conteúdo, campos/payload, versão, estado, decisão e recibo. O histórico renderiza os mesmos itens após recarga.
- O runtime pausa ao pedir informação ou aprovação. O próximo turno carrega a pergunta/proposta e o objetivo anterior por ID do servidor. Texto do modelo e resultados de ferramentas são dados, nunca aprovação.
- Perguntas têm texto, área de texto, número, data, hora, opções simples/múltiplas e booleano; IDs, limites, opções e obrigatoriedade são validados. Até12 campos por formulário; teclado, foco, Voltar, progresso, cancelar e resposta livre preservam o pedido.
- Preparação não faz a mutação proposta. Exibe app, cliente, objeto, campos antes/depois e efeitos externos/custos quando houver. Campos omitidos são preservados; payload efetivo e versões são fixados no servidor.
- Aprovar executa o payload imutável com a sessão atual, revalidando acesso, escopo e versão. Recusar não executa. Mudança concorrente exige nova leitura e revisão; não há retry cego.
- Escritas locais e recibo são atômicos numa RPC que despacha apenas operações permitidas para os serviços oficiais. Uma trava do item e o recibo garantem que duplo clique ou resposta perdida não dupliquem criações sem request_id nativo.
- Ações externas usam reserva idempotente, transporte oficial e releitura. Falha/resultado incerto permanecem explícitos; não afirmar envio/publicação por resposta gerada. Não repetir transporte sem conciliar recibo/estado.
- A aprovação/recusa/resposta continua o objetivo com request de retomada estável. O resultado gravado é conferido no app, com link ao registro. Uma ferramenta falha não vira sucesso do plano inteiro.
- O orçamento existente de modelo é preservado. Cancelar/expirar não desfaz ações confirmadas; mostra o que foi concluído e o que parou. O progresso vem de eventos reais, sem encenação por temporizador.

## Cobertura funcional a entregar

### CRM IA

Leitura das páginas oficiais: painel, funis/etapas, leads/ficha, conversas e mensagens, agentes, conhecimento, produtos, agenda, modelos e configurações. Configuração assistida de funil e etapas, agente (identidade, tom, objetivo, variáveis e vínculos), bases e produtos, preservando campos atuais. Operação de lead, etapa, responsável, agendamento e estado da conversa pelos contratos oficiais. Mensagem preparada exige revisão de destinatário/canal/texto e usa a fila oficial; entrega pendente não é confirmada. Integração Google exige seu fluxo OAuth nativo, sem coletar credenciais no chat.

### CS IA

Leitura de radar, saúde, histórico, fontes, equipe, tempos de resposta, grupos e controles. Propostas executáveis de saúde manual, regras, acompanhamento de canal, vínculo/identificação de grupo, consentimentos de leitura/áudio, controles de tarefas e equipe. Tarefas continuam no motor oficial. Encerramento de relacionamento, compartilhamento e mensagens são efeitos expressos na revisão, não consequência implícita da análise. Metas CS reutilizam o Gestor; não há armazenamento paralelo.

### Gestor IA

Leituras salvas de carteira, contas, métricas, campanhas, anúncios, resultados, metas, memória, rotina, decisões, relatórios, agenda e portal conforme o acesso atual. Execução de metas, agenda, modelos/relatórios, decisões e configurações disponíveis pelos serviços oficiais. Atualização de métricas, IA, publicação no portal e alterações na Meta mostram seus efeitos antes da aprovação. Meta já tem ajuste de status/orçamento em serviço legado; esse serviço precisa de autorização e verificação de pertencimento do objeto antes de integrar. Não tratar um token global como autorização do usuário. Criação de campanha/anúncio não foi localizada. Como o objetivo exige paridade funcional, essa lacuna permanece requisito aberto: acrescentar serviço autenticado de preparação/criação e recibos por entidade; campanha nova deve nascer pausada, e ativação é outra decisão explícita. Não anunciar ferramenta existente antes de sua implementação e validação.

### Conhecimento e interface

Reutilizar Memória Atlas com cliente, origem, versão, edição/retirada e confirmação de ensino. Não confundir conhecimento do dono com base publicada do agente de atendimento. Preservar histórico e citações das fontes existentes.

Menu padrão do Planeje presente no Conversar, sem substituir por navegação de outro produto. Avatar Atlas no atalho Conversar e no cabeçalho, acima dos controles do chat. Usar avatares existentes do CRM/CS/Gestor em seleção, delegação, atividade e resultado. Trilha aberta durante execução, recolhível no histórico; estados lendo, chamando especialista, preparando pergunta, aguardando usuário, executando, conferindo, concluído/falho. Animações discretas, foco visível e `prefers-reduced-motion`. Verificar desktop e320/390px sem perda de campo, navegação ou ações.

## Verificação e entrega

1. Matriz das capacidades observadas no ScaleOS e dos serviços Planeje, com limites explícitos; não encerrar por aparência semelhante.
2. Testes do runtime com chamadas de modelo simuladas para delegação real, pausa, resposta, continuação, rejeição, limites, escopo e injeção em fontes.
3. PostgreSQL descartável: serviços oficiais, aprovação atômica, resposta perdida, duplo clique, concorrência, versão, revogação de sessão/módulo/cliente e isolamento de usuário/conversa. Nenhuma fixture produtiva.
4. Interface integrada: perguntas de múltiplas etapas, resposta livre, aprovação/recusa, reload, erro, cancelamento, avatares, menu e progressos reais. Navegar cada página de CRM/CS/Gestor afetada e conferir estado gravado no serviço nativo.
5. Testes dos módulos afetados, lint/tipos/regras/build temporário e revisão sensível privada. Falhas preexistentes são identificadas, não escondidas.
6. Conferir release/fontes/perfil/flags/serviços atuais na VPS; candidata com manifesto, aplicação apenas de migrations inéditas e promoção preservando entregas concorrentes. Não publicar dist local nem flags de fixture.
7. Verificação HTTPS, sessão real, menu/avatares e ciclo autorizado com destino de teste identificável. Não ativar autonomias ou enviar a clientes como QA implícito. Se uma integração depender de OAuth, conta ou destino escolhido por Josias, registrar esse limite sem certificar o que não foi testado.

O objetivo permanece aberto até a auditoria requisito por requisito comprovar comportamento funcional publicado, além da interface.

## Revisão do desenho

Revisão independente somente de leitura em12/11 identificou uma decisão pendente: incluir criação Meta no aceite. O implementador a manteve no escopo pela exigência de paridade, em vez de limitar a entrega aos serviços já fáceis de reutilizar. Nenhuma outra pergunta importante foi levantada. A revisão documental não comprova código, banco ou publicação.
