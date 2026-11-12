# Ápice Noivas: estratégia e sucesso do cliente nas telas existentes

> **Desenho e candidato substituídos após novo pedido de Josias.** A revisão em [Assessoria visual](apice-cs-visual-2026-10-14.md) preserva a interface tradicional, acrescenta aba própria e separa o Histórico do cliente. Não publicar o candidato descrito abaixo; validações remotas são históricas.

Data: 14/10/2026. Estado: implementação realizada após o pedido “vamos criar”, com prévia fictícia e candidato validado na VPS sobre esquema completo e permissões. NÃO PUBLICADA. A migração nova não foi aplicada ao banco operacional. A confirmação do desenho não é aceite de uma implementação, autorização de envios externos ou retomada do monitor pausado do Atlas.

## Resultado esperado

Ao abrir um cliente, responder com fontes: o que foi combinado, o que foi entregue, o que falta, de quem depende e qual é o próximo passo. A leitura deve funcionar por mês e por período maior, preservando a história desde a primeira reunião.

## Regras confirmadas por Josias

- Ápice Noivas e JB Apex são operações da agência e devem ser filtráveis usando as etiquetas dos clientes. Reaproveitar os cadastros existentes.
- Reaproveitar Clientes, Documentos, Reuniões, Projetos, Tarefas, Tráfego/Rastreamento e Atlas. Não criar novas telas para este acompanhamento.
- A Ápice prepara a estratégia, escolhe o funil, orienta e solicita os materiais, confere o que chegou e prepara a execução das campanhas.
- Produção/captação e envio dos materiais são responsabilidade do cliente. Edição pela agência é pontual, quando necessária; vídeos não são uma entrega mensal fixa da equipe neste modelo.
- O plano registra estratégias escolhidas e descartadas, motivos, etapas do funil, finalidade dos criativos e destinos, como perfil ou mensagem direta.
- Preparação inclui conexão do WhatsApp, rastreamento e integrações/eventos de conversão aplicáveis, inclusive CAPI, com conferência do funcionamento.
- Guardar reuniões, resumos, apresentações, relatórios enviados, compromissos assumidos, itens fora do escopo e mudanças posteriores.
- Agendamento é o resultado prioritário do acompanhamento. Josias relatou um intervalo de cerca de 20 a 40 dias até a venda; isso é referência operacional, não prazo garantido nem regra para dar oportunidades como perdidas.

## Distribuição nas áreas existentes

| Área | Responsabilidade |
| --- | --- |
| Cliente / Documentos | Histórico permanente, arquivos, decisões e escopo, acessível também pelo projeto. |
| Reuniões | Registro da reunião e transcrição disponível, relacionado ao resumo e arquivos em Documentos. |
| Projeto | Estratégia e plano de ação do período, materiais necessários, dependências e acompanhamento. |
| Tarefas | Execução real, responsável, prazo, andamento e evidências. |
| Tráfego / Rastreamento | Configurações e resultados nas fontes já existentes. |
| Atlas | Consulta das fontes, identificação de lacunas e proposta do próximo passo. |

Tarefas continua sendo o mecanismo único de execução. Depois de vincular uma ação/material a uma tarefa, o acompanhamento usa essa tarefa; não criar um segundo responsável, prazo ou estado de conclusão concorrente.

## Desenho implementado localmente

### A. Filtro das operações em Projetos

Reaproveitar o catálogo de etiquetas e as chaves marcadas no cliente. O filtro deve afetar cartões, contagens, lista de clientes ao criar plano e visões Agora/Por mês. Preservar a escolha ao navegar. Clientes sem etiqueta não devem ser presumidos como JB Apex; múltiplas etiquetas não duplicam o mesmo cliente nas contagens.

A etiqueta identifica a operação. O modelo do projeto identifica o trabalho: produção de conteúdo ou consultoria e performance. Não converter projetos antigos nem impor um modelo a toda a carteira só pelo nome de uma etiqueta.

### B. Histórico em Documentos

Acrescentar organização por tipo e data, anexos/links e associação opcional ao projeto e à reunião, dentro da interface existente. Reutilizar a integração com Drive quando adequada; escolher o armazenamento de anexos após conferir as permissões e a implementação atual.

Um registro de reunião reúne data/participantes, resumo, fonte, decisões aprovadas, sugestões ainda abertas, itens fora do escopo, pendências e arquivos. Uma mudança posterior preserva o registro do combinado anterior.

Documentos apresentados/enviados devem apontar a versão e a data correspondentes. Criar ou editar um documento não comprova envio ou aprovação. Não substituir retrospectivamente a apresentação/relatório já enviado por uma versão mais nova sem manter a referência anterior.

Salvar documento ou reunião não cria tarefa automaticamente. Uma ação aprovada pode ser vinculada a uma tarefa existente ou transformada explicitamente em tarefa. A leitura da IA respeita o cliente e as autorizações aplicáveis ao documento e ao arquivo.

### C. Plano de consultoria e performance

Usar o formulário e o detalhe de Projetos, com período e revisão do plano. Adaptar os campos e critérios de acompanhamento ao modelo escolhido:

1. Objetivo do período, problema prioritário e critério de resultado.
2. Estratégias selecionadas, alternativas não adotadas e justificativas.
3. Funil: etapa, público, mensagem, destino, objetivo da campanha e medida esperada. Etapa do funil e objetivo da campanha são informações distintas.
4. Materiais solicitados: finalidade, orientação, data combinada, fonte do envio e conferência do recebido.
5. Ações de preparação, configuração, edição eventual e execução, ligadas às tarefas reais.
6. Resultados observados, limitações dos dados e ajustes propostos/aprovados.

Reaproveitar os recursos atuais de funil após definir o vínculo entre o funil do cliente e o plano do período; não manter dois desenhos divergentes como fonte oficial. Preservar a versão usada no plano quando o funil evoluir.

O fluxo de material é: orientar/solicitar → aguardar cliente → conferir → editar se necessário → preparar/usar na campanha. A pessoa da equipe continua responsável pelo acompanhamento enquanto a dependência é do cliente. Não computar esse intervalo como atraso de produção da agência. A obrigação interna de solicitar, conferir e acompanhar permanece visível.

Não reutilizar `postagem_do_cliente` para significar que o cliente grava/envia material: produção do arquivo e responsabilidade pela publicação são conceitos diferentes.

Uma configuração de WhatsApp/rastreamento/CAPI precisa de evidência de validação; tarefa concluída ou checkbox isolado não comprovam funcionamento. Reaproveitar as integrações existentes e conferir sua situação antes de propor qualquer alteração. Não ativar transportes ou enviar eventos reais para validar este desenho.

O modelo não exige cotas de vídeos/posts nem datas de publicação para ações de consultoria/configuração. As regras de produção existentes continuam aplicáveis aos projetos e tarefas de conteúdo correspondentes.

### D. Acompanhamento pelo Atlas

Cruzar o plano e sua versão aprovada com documentos/reuniões, materiais, tarefas e resultados. Cada apontamento traz origem, data, situação observada e próxima ação proposta. Distinguir ausência de registro de ausência de execução.

Exibir separadamente: falta de estratégia, compromisso sem tarefa, tarefa sem responsável/prazo, dependência do cliente, entrega ainda sem evidência e resultado ainda não informado. Não presumir papéis da equipe; a participação de Ray segue como ideia, sem atribuição automática.

Validar os vínculos dos grupos e a cobertura das fontes antes de considerar a leitura completa. Áudio ou arquivo não lido não autoriza concluir que faltou resposta ou entrega. Sugestões da IA não alteram compromissos e não enviam mensagens à equipe/cliente.

O primeiro piloto é por consulta manual. A pausa vigente do monitor automático do Atlas permanece; este plano não programa sua retomada.

## Medição ao longo do tempo

- Movimento do período: contatos qualificados, agendamentos, comparecimentos e vendas ocorridas no intervalo.
- Evolução dos contatos captados no período: acompanhar agendamento, comparecimento e fechamento posterior, sem perder o mês de entrada.
- Exemplo fictício: contato em 20/10, visita em 28/10 e venda em 15/11. A venda pertence ao movimento de novembro e à evolução dos contatos de outubro, sem duplicar o total de vendas.
- Identificar período, fonte e data de atualização. Sem resultado informado não significa zero; sem vínculo de origem não atribuir a campanha por suposição.
- Datas dos eventos e vínculo estável do contato são requisitos para essa leitura. Quando a fonte não os tiver, apresentar a limitação e não reconstruir o passado por inferência.

## Base técnica conferida

Na investigação desta conversa, os cinco arquivos abaixo foram comparados por SHA-256 com a fonte da produção e eram iguais às cópias locais lidas. Isso confirma a referência para o planejamento, não substitui conferir novamente a fonte completa antes de editar.

- `src/components/pages/Projects.jsx`: a consulta de clientes ainda não inclui etiquetas.
- `src/components/projects/ProjectsSimpleHome.jsx`: filtros de período, cliente, situação e responsável; acompanhamento orientado a materiais.
- `src/components/forms/ProjectForm.jsx`: início/fim por mês já existem; novo projeto adere ao fluxo com marcos de planejamento.
- `src/components/pages/ProjectDetail.jsx`: Referências abre documentos do cliente.
- `src/components/projects/ProjectDocuments.jsx`: usa `client_documents` por cliente, editor de texto/links; anexos e histórico de versões precisam ser ampliados.

Outras áreas a conferir na implementação: `ClienteReunioesPanel.jsx`, `ProjectPlanningWorkspace.jsx`, `SalesFunnelBuilder.jsx`, `funilDiagramApi.js`, `projectPlanningWorkflow.js`, `projectPlanTasks.js` e os leitores do Atlas. Definição de schema/migrações fica para a implementação após revisão das regras e permissões existentes.

## Verificações de aceite propostas

1. Filtrar Ápice/JB Apex afeta cartões, totais e criação, preservando clientes/projetos antigos.
2. Consultoria permite estratégia e tarefas de configuração sem exigir vídeo ou publicação.
3. Material aguardando cliente mantém o acompanhamento interno identificado e não vira atraso de produção.
4. Edição eventual se liga a uma tarefa real sem duplicar a solicitação ou a entrega.
5. Primeira reunião, alteração de escopo e versão do relatório enviado permanecem recuperáveis.
6. Abrir o documento pelo cliente ou pelo projeto mostra o mesmo registro e respeita permissões.
7. O funil do período mantém referência/versionamento coerente com as ações executadas.
8. Venda posterior pode ser acompanhada desde a entrada do contato, sem duplicação nem conversão presumida.
9. Atlas cita fontes e mostra informações ausentes; não cria compromissos nem muda o monitor ao consultar.
10. Notebook e celular permanecem utilizáveis nas telas existentes, com formulários compactos.

## Implementação e verificação local

- Projetos usa o catálogo e as etiquetas reais do cadastro. O filtro vale em Agora/Por mês, análise e criação. Clientes sem etiqueta não são inferidos como JB Apex. Iniciar plano abre o formulário para escolher o modelo.
- `planning_model` nasce `content` para o legado; `consulting` é escolhido na criação e não converte projetos anteriores. Consultoria tem período, estratégia, alternativas, critérios, funil, ações, materiais, evidências, revisão e resultados. Sem marcos automáticos de produção ou cotas de conteúdo.
- O funil do período usa `campaign_plans.sales_funnel`. Um mapa de `cliente_funil_diagrama` pode ser adotado como referência: o servidor confere o cliente e preserva nome, data, nós e conexões da versão usada. Não publica nem altera o mapa original; atualização da referência é explícita.
- Ações usam `tarefas.project_id + plan_material_id`. `cs_action_task` cria ou vincula com bloqueio transacional e retorno idempotente; novas ações operacionais usam o tipo já existente `interno`. Responsável, prazo interno e conclusão vêm da tarefa. Data/estado físico do material do cliente são separados. Material ainda não conferido não conta como concluído no plano.
- A aprovação interna registra a revisão aprovada. Ajustes posteriores preservam essa referência; plano concluído precisa ser reaberto antes de editar. Concluir exige tarefas terminais, materiais conferidos e evidência/conferência das integrações. Isso não ativa nem testa transportes reais.
- Documentos preserva `content` existente e usa o editor rico já disponível. Tipos, data, situação, vínculos, participantes, compromissos, fora do escopo, pendências, anexos e acesso da IA ficam em `record_meta` e no campo existente `apexia_access`. Salvar versão é explícito; “Enviado/Aprovado” é registro humano, nunca confirmação automática de envio externo.
- `client_document_versions` e `project_consulting_versions` são históricos imutáveis para sessões comuns. RPCs recusam revisão desatualizada; alterações não salvas podem ser recuperadas na mesma aba. “Reabrir versão salva” descarta o rascunho após confirmação. Documentos arquiva/restaura sem apagar o histórico. Consultoria usa Pausado; exclusão do projeto e de suas tarefas não deve apagar a história, inclusive em telas antigas.
- Anexos até 50 MB usam bucket privado `client-records`, com caminho por documento e links temporários. Arquivos maiores podem usar Drive/link; caminhos já usados não podem ser substituídos/apagados por usuários comuns. A leitura dos bytes pela IA não foi implementada: Atlas informa que anexos não foram lidos.
- Consulta manual do CRM no plano distingue movimento do período e evolução dos contatos que entraram no período, incluindo vendas posteriores. Deduplica por ID do contato, sem somar leads de outra fonte. Lê até 5.000 contatos e indica truncamento; sem data de entrada/venda ou sem informação comercial, apresenta a lacuna. O CRM atual não permite reconstruir todos os reagendamentos/múltiplas vendas nem qualificação/comparecimento por data quando a fonte não a tem.
- Atlas lê planos, revisão aprovada, ações e lacunas, e somente documentos ativos autorizados para IA, com amostra de versões apresentadas/enviadas/aprovadas. Vínculo explícito de grupo tem prioridade; inferência por nome permanece identificada e ausência de grupo não prova ausência de acompanhamento. Resultados no Atlas continuam amostra de até 100 contatos; a medição informa que é parcial. Nenhum monitor ou missão automática foi reativado.

## Testes executados e limites

- 51 testes Node passaram, cobrindo regras novas, planos/períodos, tarefas, texto rico e leitores/orquestração do Atlas.
- 61 verificações PostgreSQL passaram em cluster local descartável: migração real sobre esquema sintético compatível, funções reais de sessão ativa e planejamento, perfis cliente/pendente/revogado, proteção de históricos/arquivos, revisões concorrentes, mapa de outro cliente, captura da fonte pelo servidor, tarefas idempotentes e regras do legado. **Não é validação do esquema completo da VPS.**
- Componentes reais navegados no navegador com API fictícia: filtro, escolha de modelo, falha de salvar, rascunho recuperado, tarefa única, relatório enviado recuperável, venda posterior, link inválido, notebook/celular e rolagem. Sem erro JavaScript ou requisição externa.
- Build Vite passou. Este build local valida compilação; ainda falta gerar/conferir o candidato com a configuração produtiva atual.
- As políticas foram revisadas manualmente e exercitadas no banco local. O CLI disponível (2.75.0) não oferece os comandos novos de advisors; não declarar advisors remotos executados.

## Validação do candidato na VPS — atualização de 14/10

- Acesso à VPS final 109 recuperado após abrir Acesso às Chaves e usar SSH com interação do chaveiro permitida, autenticação por senha desabilitada. Nenhuma senha foi solicitada no chat, revelada ou alterada. Staging ainda recusou a chave.
- Os arquivos de produção continuaram iguais à base local. Foram conferidos também os dois arquivos sem cópia de baseline: mudanças de rótulos em `ProjectsOperationalPanel.jsx` e adaptação dos testes de autorização do Atlas. Nenhum arquivo da fonte operacional foi sobrescrito.
- Candidato construído em `/root/planeje-releases/apice-cs-20261014-01/candidate`, copiando a fonte produtiva atual, preservando sua configuração privada no servidor e aplicando somente os arquivos desta entrega. Build `index.e602149d.js` / `index.448e1a9f.css`; tokens embarcados identificados somente com papel `anon`.
- A primeira restauração de schema não continha ACLs. Ela foi substituída por restauração com proprietários e permissões, sem dados de clientes. `pg_cron` e seu schema foram excluídos; o webhook HTTP de atualização de tarefas foi desabilitado somente no banco descartável. Todos os demais gatilhos de tarefas, planejamento, perfis, documentos e Storage permaneceram ativos.
- A migração final passou no PostgreSQL 17.6.1.136 isolado e em 62 verificações com os gatilhos reais. Os 51 testes Node também passaram no candidato e as 61 verificações locais foram repetidas após a correção SQL.
- 27 testes pela API real temporária passaram: criar projeto, salvar plano, conflito de versões, tarefa idempotente, histórico enviado preservado, upload privado, URL assinada e download, tentativa de sobrescrita/exclusão, bloqueio de anônimo/pendente/cliente/sessão revogada e leitores de planos/documentos/resultados do Atlas. Tokens de teste usaram segredo independente; nenhum transporte, volume de arquivos ou token produtivo foi reutilizado para envio.
- O teste HTTP revelou que conflito de revisão com código `40001` não retornava o aviso a tempo. As duas RPCs agora retornam `PT409` (HTTP 409), e os conflitos de plano/documento foram verificados. [Referência PostgREST](https://docs.postgrest.org/en/v14/references/errors.html#raise-errors-with-http-status-codes).
- Worker candidato preparado a partir da cópia ativa em `atlas-human-20261009-01/candidate`, com os dois leitores e suas dependências. As bases do worker conferem com a fonte e o módulo importa corretamente. Não foi iniciado/reiniciado. Os leitores operacionais são usados pelo worker; não é necessário republicar todas as funções de borda para esta alteração.
- Leitura de cadastro confirmou Casa D Noivas, Marbô Noivas e Marbô Festas fechados e com etiqueta Ápice Noivas. Nessa consulta não havia projetos, documentos ou reuniões nessas três áreas. Isso indica ausência de registro nessas fontes, não ausência de trabalho, e não autoriza inventar estratégia ou compromissos.
- Contêineres da API/Storage de teste e banco `planeje_cs_test_20261014` removidos ao terminar. Logs/esquema privado permanecem no diretório protegido da release na própria VPS. `postgres` operacional não recebeu a migração nem usuários/tarefas fictícias; webhook produtivo continua habilitado e monitor Atlas continua `false`.

## Publicação e aceite pendentes

1. Obter autorização de produção para o candidato concreto. Validação técnica não foi registrada como aceite de Josias.
2. Antes da troca, conferir novamente os hashes da fonte/bundle e a ausência da migração. Fazer backup seletivo dos arquivos afetados e do índice; aplicar somente `20261014043345_apice_consulting_documents.sql`, uma vez. As migrações de convites já publicadas não devem ser reaplicadas.
3. Publicar os assets do candidato preservando os antigos, sincronizar somente fontes alteradas e atualizar os leitores/dependências no diretório efetivo do worker com backup, reiniciando apenas o worker para carregar a versão. Preservar a pausa do monitor e a configuração privada corrente. Usar os hashes e arquivos finais registrados na release candidata.
4. Conferir o schema público da API, os assets servidos e a leitura manual com usuário autorizado. Não criar planos reais sem seus combinados, não enviar WhatsApp/CAPI/e-mail e não transformar validação técnica em aceite de uso.
5. Preencher os pilotos de Casa D Noivas/Marbô a partir das reuniões e documentos reais, após confirmar quais unidades entram. Nenhuma responsabilidade foi atribuída automaticamente a Ray, Poliana ou outro funcionário.

Prévia local: `http://127.0.0.1:4318/projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/planner`, iniciada com `node node_modules/vite/bin/vite.js --config scripts/cs-preview/vite.config.mjs`. Dados fictícios, reiniciados ao recarregar. [Release candidata](../evidencias/releases/apice-cs-candidato-2026-10-14.json) e [evidências](../evidencias/apice-cs-testes-2026-10-14.json).

Nenhum dado privado de cliente, senha, token, dump ou conteúdo de conversa foi copiado para esta documentação. Não houve publicação, alteração no banco operacional, envio de mensagem/e-mail/CAPI ou restart de serviço produtivo nesta implementação.
