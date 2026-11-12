# CRM IA — composição das telas e navegação do Squad

## Direção solicitada

Josias esclareceu que a lateral do CRM deve ter as mesmas cores e espaçamentos do Gestor IA e CS IA. Também apontou que Painel, Conversas, Configurações e demais telas têm aparência confusa e bruta em comparação ao ScaleOS. É continuação do pedido integral de reprodução funcional/visual e publicação após verificação. A direção e a execução já estão autorizadas; decisões de composição abaixo são do implementador dentro desse pedido, não um novo aceite humano.

## Evidência atual

A base CRM das14h26 foi herdada pela publicação concorrente `gestor-rastreamento-identificador-20261111-01/candidate`, HTML9ebe3f8d e2.120fontes. A integração deste incremento herda essa base e preserva suas alterações de Mídias/Rastreamento; nenhum dos38arquivos sobrepostos conflita com ela. O CRM já usa o mesmo GestorIaSidebar, mas CrmIa.css sobrescreve sua paleta escura por fundo claro, cores, seleção, fontes, bordas e foco. Essas sobrescritas explicam a divergência apontada. A geometria atual é248/64px, itens36px e gap2px; deve continuar compartilhada.

Nova inspeção autenticada do ScaleOS em11/11: Painel tem indicadores em uma faixa, quatro blocos (espera, evolução por dia, etapas e origens) e resumo de atendimento. Conversas ocupa duas colunas, com busca/segmentos/filtros no topo da lista e histórico à direita. Configurações agrupa navegação em Equipe e atendimento, Leads e canais, Dados e controle; o conteúdo usa seções e linhas de preferência com separadores e estados. Capturas e medidas ficam privadas em `.local/crm-ia-interface-20261111-01/`; não copiar contatos ou conteúdo da referência para fixtures/docs.

## Abordagem

Escolha: reorganizar os componentes atuais e reusar o shell do Squad, preservando todos os contratos e permissões. CSS isolado para Painel/Configurações permite implementação independente; o coordenador detém CrmIa.css, Workspace, Conversas e integração. Correção apenas cosmética de margens não resolve a hierarquia; um frontend/CRM novo duplicaria fluxos canônicos. Sem dependências novas nem alteração de runtime, provedor ou credenciais. O pedido posterior de fotos/autoria requer somente uma migration incremental de leitura, posterior às16 existentes; nenhuma anterior será reaplicada.

### Lateral e cabeçalho

Remover as sobrescritas exclusivas do CRM; herdar fundo, cor, peso, hover, ativo, foco e espaçamentos do Gestor/CS, incluindo rodapé e recolhimento. Preservar o seletor de conta no mesmo pai durante carga/erro/troca e um h1 por página. Em Conversas, cabeçalho compacto e área de trabalho flexível; não aplicar zoom ou escala.

### Painel

Faixa compacta de indicadores; quatro painéis com fila priorizada, gráfico legível por dia, etapas com barras e origens com participação. Atalhos mantêm conta, período e filtros. Exibir zero, indisponibilidade e ausência de amostra corretamente, sem gráficos mínimos fictícios ou comparações sem fonte. Dados de IA/atendimento e agentes usam somente leituras já disponíveis e identificam sua cobertura. Não inventar conversão, tempo de resposta, comparação anterior, atividade ao vivo ou visão de parceiros sem fonte. O agregado de parceiros permanece item funcional da matriz, independente deste refinamento.

### Conversas

Lista e conversa em área contínua, com borda divisória e rolagem própria. Busca, Todas/IA/Humana e filtros adicionais ficam na lista; estado selecionado, prévia e horário são claros. Datas/filtros da publicação anterior permanecem funcionais, com reset de paginação e invalidação de leitura antiga. Detalhe mostra identidade, ações e contexto comercial compacto no cabeçalho, histórico e compositor na mesma coluna; os editores e gates existentes continuam. Fila fica em detalhe acessível, sem ocupar um cartão global permanente. No celular, lista e detalhe alternam com Voltar às conversas; não perde a seleção ao abrir fila nem mistura rascunhos entre canais/contas.

Orientação posterior explícita de Josias, acompanhada de duas capturas: usar a base visual do chat principal do Planeje dentro do CRM e deixar o cabeçalho discreto como no ScaleOS. O refinamento passa a reutilizar o stylesheet do Atendimento, Avatar, badge de espera, bolhas/classes nativas e compositor existentes. Cabeçalho em duas faixas como na captura posterior do ScaleOS: contato/telefone/funil/etapa/responsável em cima; ficha, situação/follow-up, alternância de atendimento e Resolver visíveis embaixo. Canal e atendente continuam identificados no menu acessível; a atribuição comercial é separada. O clique no nome e o ícone da ficha abrem a ficha canônica de Leads, sem ocupar o início do histórico. Mensagens e ações continuam pelas APIs CRM autorizadas; não importar o motor de mensagens completo do Atendimento nem abrir outro transporte.

Último esclarecimento de Josias: cores podem ser personalizadas; estrutura, colunas, clique no nome, funções e telas devem seguir o ScaleOS. A inspeção confirmou duas rotas distintas: selecionar a linha abre o histórico; nome e ícone abrem a mesma ficha completa. No cabeçalho há funil, etapa e responsável comercial editáveis, separados do atendente. A ficha usa dados e abas Resumo/Campos/Jornada à esquerda, etapas e conversa à direita. Implementação reutiliza a ficha e os editores canônicos, preservando validação de motivo/versão, isolamento e permissões; não cria uma segunda ficha. Selecionar um lead deixa de manter a tabela por cima da ficha. As etapas abrem a revisão de mudança existente, sem mover imediatamente.

A revisão independente reproduziu perda de rascunho ao voltar, falta de retorno em erro móvel, fila escopada inacessível no detalhe e contraste insuficiente. A correção mantém a mesma conversa montada e oculta ao voltar, preservando texto/anexo e pausando leituras fora da vista; outra conta/canal mantém desmontagem/isolamento. Todos os retornos oferecem Voltar, o detalhe abre sua própria fila e os textos usam contraste legível. Fechar a fila devolve foco ao acionador real. Essas contraprovas e os hashes rejeitados ficam privados; nenhum desses estados é aceite final.

### Configurações

Navegação agrupada com ícones e seleção discreta. Conteúdo com título, descrição, seções e linhas de preferência; toggles acessíveis, estado visível, salvar explícito e erro próximo da ação. Atendimento e IA separa regras de Respostas rápidas na interface, usando a mesma seção canônica attendance sem apagar os demais campos. Disponibilidade/atendentes e Google Agenda continuam disponíveis; campos, distribuição, entrada, conhecimento, teste e uso mantêm todos os dados e validações atuais. URL reflete a seção e respeita links antigos. A configuração por chat ainda depende do incremento funcional da matriz; não apresentar uma implementação simulada.

## Verificação e limites

- Fixtures sintéticas, fetch externo negado, nenhuma mensagem/modelo/evento Google real neste refinamento.
- Testes de comportamento antes da mudança relevante, incluindo filtros, links, estado vazio, indisponibilidade, seleção, troca/revogação de conta/canal, fila, histórico incremental e gravação versionada das configurações.
- Teclado, foco, rótulos, leitura de erros, desktop,1280×800,390/320px e conteúdo longo; sem transbordamento global ou controles cortados.
- Revisar interfaces e publicador nos hashes finais; conferir base viva e fontes concorrentes antes de publicar. Herdar perfil/flags produtivos;16 migrations anteriores intactas; somente a17ª de leitura será aplicada uma vez sob guarda. Sem reinício ou dist local antigo.
- Publicação e conferência técnica não significam aceite humano nem encerram a meta integral.

## Avatares, remetente e histórico

Novo pedido de Josias: avatares semelhantes ao Gestor e cores individuais. Imagegen nativo gerou CRM azul/ciano e CS verde/esmeralda; Gestor permanece roxo. Imagens e prompts ficam no projeto, componentes pequenos reaproveitam as dimensões e todos os gates/links das laterais. Menus mantêm as mesmas cores e espaçamentos compartilhados; a diferenciação solicitada fica nos avatares.

Cada mensagem tem avatar e identificação abaixo da bolha. O contato usa a foto autorizada; IA usa o avatar do CRM somente com a prova de execução/entrega já existente. Usuário usa nome e foto atuais do perfil ligado ao autor histórico comprovado por recibo manual único e corpo/ator/cliente/canal/contato exatos. Atendente atual não prova autor antigo; legado sem recibo é identificado como autor não identificado, e automação não comprovada como IA mantém sua distinção. A migration20261111185514 apenas enriquece leituras após o RPC canônico autorizar; não muda people, tabelas, índices, permissões de dados, transporte ou16SQLanteriores. Metadados e grants efetivos precisam ser preservados pelo publicador e conferidos na VPS.

Anterior/Próxima saem do histórico. Carregar mensagens antigas acrescenta registros em ordem, sem trocar conversa ou apagar rascunho; duplicatas são removidas por fonte/ID. Poll continua na janela recente. Ao retomar após uma janela sem sobreposição, o cache reinicia na janela atual para poder preencher todo o intervalo; página sem IDs novos força leitura atual antes de continuar. Resposta antiga não ressuscita canal revogado; negar acesso oculta dados/compositor. Posição e foco no histórico são preservados após carregar. Texto, foco e contraste seguem os controles acessíveis existentes.

A segunda atualização concorrente do Gestor alterou somente rastreamentoLeadConversa e sua regressão, sem conflito com os38overlays e sem alteração do perfil. A candidata anterior foi preservada; preparar, migrar, promover e verificar passam a manter os locks compartilhados na mesma execução.
