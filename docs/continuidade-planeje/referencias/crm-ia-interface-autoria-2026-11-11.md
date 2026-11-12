# CRM IA — interface, avatares e autoria

## Estado

Publicado em11/11/2026 às16h53 BRT, com conferência funcional ainda em andamento. A release `crm-ia-interface-20261111-01/candidate` herda `gestor-rastreamento-identificador-20261111-01`, 38 sobreposições e2.138 fontes. A17ª migration foi aplicada uma vez; as16anteriores não foram reaplicadas. Publicação técnica e aceite humano são estados distintos.

## Mudança

Lateral CRM herda cores/espaçamentos do Gestor/CS. Painel reorganizado com fontes e períodos reais; Configurações agrupadas e preferências acessíveis preservam a revisão canônica. Conversas usa visual nativo do Atendimento, cabeçalho em duas faixas com contato e controles comerciais, atendimento e Resolver visíveis. Nome e ícone abrem a mesma ficha de Leads, em dados à esquerda e etapas/conversa à direita; mudanças passam pelos editores/versionamento existentes.

CRM tem avatar azul, CS verde e Gestor mantém o original roxo. Componentes pequenos integram as mesmas imagens aos menus, com gates e links preservados. Os PNGs e prompts da ferramenta imagegen nativa estão no projeto; não houve CLI, troca de provedor ou autenticação.

Cada mensagem mostra foto/avatar e autoria abaixo da bolha. A17ª migration,20261111185514_crm_ia_message_authorship.sql, apenas enriquece leituras já autorizadas. Humano exige recibo manual único com corpo, ator e escopo exatos; IA usa a prova já existente de run/entrega. Atendente atual não é inferência válida. Nome/foto são atuais do perfil do autor histórico; legado sem prova continua identificado como desconhecido ou Automação. Sem backfill ou alteração de registros de clientes.

Carregar mensagens antigas substitui a paginação sob o histórico e preserva rascunho/ordem/foco. Poll mantém janela recente; ausência de sobreposição reinicia a janela acumulada para preencher um intervalo sem lacunas. Página sem IDs novos atualiza a fonte; resposta antiga não reexibe canal revogado.

## Evidência e operação

As bases privadas dos arquivos existentes coincidem com as respectivas fontes produtivas conferidas. Testes UI/preview, CS/Gestor, banco descartável, check completo e revisões privadas complementam a inspeção CUA. Um primeiro parecer encontrou perdas de rascunho/retorno móvel/fila/contraste; outro encontrou lacuna após burst de mensagens e foco insuficiente. Todos exigem rechecagem nos hashes finais; logs intermediários não representam aceite.

A candidata deve herdar perfil/flags atuais,16SQLanteriores e todos os serviços/runtime. Apenas a17ª migration pode ser aplicada uma vez, com guarda da função/alias/owner/ACL; frontend promove somente após revisão. Metadados privados de release ficam em .local/crm-ia-interface-20261111-01 e na pasta operacional correspondente da VPS. Não promover dist/fixtures locais ou alterações alheias por glob.

## Limites

Sem mensagem, modelo, áudio ou evento Google real neste refinamento. O número de teste e a conta de calendário autorizados continuam reservados para homologação funcional; automação geral desligada. A meta integral e a matriz de paridade seguem ativas. Fotos/nome só aparecem onde a fonte fornece identidade comprovada; histórico legado não é reatribuído ao atendente atual.

A segunda atualização concorrente do Gestor alterou somente rastreamentoLeadConversa e sua regressão, sem conflito com os38overlays e sem alteração do perfil. A candidata anterior foi preservada; preparar, migrar, promover e verificar passam a manter os locks compartilhados na mesma execução.

## Publicação e conferência autenticada

Publicador a1589bc, escopo1d79b3f, pacoteaa36fc76; revisões nos hashes completos privados. HTML0b9ba1ba2491c640635a8671c263f40618837bfaf263bb59dc073c44245419c9, entradaindex.0c9e4dd0.js e CSSglobalindex.775a6d7c.css; CRM113ac8df.js/3ee769d7.css.26artefatos da candidata e28 verificações HTTPS. Runtime, perfil/flags, unidades, serviços e assets anteriores preservados. Nenhum reinício, envio, modelo ou evento externo.

Duas publicações concorrentes do Gestor foram detectadas pelas guardas e herdadas sem conflito. A segunda tentativa parou antes de iniciar SQL. A execução final manteve os locks compartilhados durante preparar, migrar, promover e verificar. A candidata anterior e seus metadados foram preservados. Os registros privados `migrations-applied.json` e `release-summary.json` documentam a migration17; `published.json` pertence à fase de promoção do frontend, cujo campo no_sql descreve apenas essa fase.

Na prévia final, 166/166 testes de interface e o check completo passaram; revisões de produto, SQL e publicador terminaram sem achados pendentes. CUA confirmou1280/390/320px, cabeçalho, ficha em duas colunas, controles44px, avatares24px, ausência de transbordamento, histórico50→64, rascunho e foco preservados, e retorno da fila por Esc. A ferramenta imagegen nativa gerou os avatares; prompts e imagens estão no projeto.

Na sessão autenticada, JB APEX carregou o Painel com41conversas em30dias e a lista sem filtro com15 em7dias. A busca por telefone excedeu o statement_timeout de8s. A comparação controlada READ ONLY na mesma conta mediu4,8s sem busca e4,4s com busca; quase3mil chamadas de sessão por leitura dominam o custo. Não foram registrados claims, token, conteúdo de mensagens ou credenciais. A correção incremental está em implementação/teste e não aumenta o timeout nem elimina as regras de privacidade e responsável. O timeout impede declarar o aceite funcional completo deste incremento.

Este documento foi atualizado localmente após a publicação; o arquivo da candidata é a versão de preparação, preservada no manifesto. A próxima publicação deve sobrepor somente os documentos e fontes explicitamente revisados.

A correção SQL18 foi publicada às17h48 BRT. A busca real retornou duas conversas sem timeout; duas leituras controladas mediram0,5–0,6s e18 verificações de sessão. A inspeção visual final do histórico aguarda reconexão do Chrome; o contrato de telefone/follow-up está em ajuste separado. [Evidência e limites da leitura](crm-ia-acesso-leitura-2026-11-11.md).

Às22h33, a migration19 completou telefone/follow-up no DTO da página e do estado, preservando autoria/fotos. Leitura real conferiu os campos; a inspeção visual final ainda aguarda Chrome. [Complemento e limites](crm-ia-cabecalho-dados-2026-11-11.md).
