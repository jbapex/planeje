# Assessoria de tráfego: aba separada e construção visual

14/10/2026 — Revisão local concluída para apresentação. NÃO PUBLICADA. Substitui o desenho e o candidato anterior `apice-cs-20261014-01`; não publicar os assets `e602149d`/`448e1a9f`.

## Pedido que alterou o desenho

Josias pediu preservar o que já existe e acrescentar uma aba ao lado dos projetos tradicionais. A assessoria deve atender gestão de tráfego e direcionamento 360, com construção por etapas e uma visão visual do funil, incluindo retornos. A solicitação de revisão não foi autorização de publicação nem aceite do candidato anterior.

## Implementação desta revisão

- Projetos tem duas abas: **Projetos tradicionais** e **Assessoria de tráfego**. Os projetos são separados pelo `planning_model`; nenhum projeto existente é convertido. O modelo novo nasce somente pelo botão da nova aba. O rascunho do formulário tem chave distinta por modelo.
- `ProjectsSimpleHome`, `ProjectsMonthlyKanban` e `ProjectsOperationalPanel` são idênticos às cópias da produção anterior. A assessoria recebe lista própria, busca e filtro pelas etiquetas do cliente, como Ápice Noivas e JB Apex. A etiqueta identifica a operação, independentemente do foco do plano. O formulário continua permitindo escolher qualquer cliente autorizado.
- A assessoria tem **Visão geral**, **Construir plano** e **Mapa do funil**. O construtor divide o trabalho em Direção, Funil, Ações e Acompanhamento. Foco: gestão de tráfego ou direcionamento 360.
- A visão geral apresenta objetivo/estratégia, próximo passo, revisão, mapa, ações e lacunas. O mapa tem etapas clicáveis, zoom, ajuste de enquadramento e conexões explícitas com legenda. Não são inventadas conexões para planos vazios. Etapas sem definição aparecem como pendentes. No celular o mapa fica vertical e as retomadas percorrem a lateral.
- Conexões ficam em `sales_funnel.routes`; foco em `consulting.scope`; relação entre ação e etapa em `consulting.actions[].funnel_stage`. A migração candidata valida as novas propriedades e os snapshots preservam esses campos.
- Tarefas continua sendo o mecanismo de execução. O plano mostra o responsável, prazo e situação da tarefa real. Material aguardando cliente permanece uma dependência própria. Não há entrega fixa de vídeos neste modelo.
- **Documentos** mantém o editor tradicional. **Histórico do cliente** acrescenta os registros com versões, arquivos e vínculos. Registros estruturados não entram na lista tradicional. Documentos com `record_meta={}` continuam editáveis/excluíveis e não recebem versões implicitamente. Um registro versionado não pode perder a metadata para escapar do histórico. A aba tradicional fica montada ao trocar de aba para não cancelar o salvamento pendente.
- Nenhum serviço real, configuração de WhatsApp/CAPI, envio externo ou monitor do Atlas foi ativado.

## Verificações desta revisão

- 37 testes Node em nove arquivos: regras de planejamento, períodos, materiais, vinculação às tarefas, métricas e fontes de consulta.
- 72 verificações PostgreSQL 16 isolado com esquema sintético, migração real e regras de autenticação: inclui preservação de documentos tradicionais, imutabilidade dos históricos, foco/etapa/conexões e snapshots. Sem banco operacional.
- Build Vite local passou. O build usa a árvore local; não é autorização para copiar o bundle inteiro à produção.
- Navegador Codex, usando componentes reais e API simulada: separação das abas, filtro por etiqueta, formulário no modelo correto, novo projeto vazio, salvamento de plano novo e existente, conexão de retorno, inclusão de ação, vinculação de tarefa com responsável/prazo, detalhes do mapa e histórico de documentos separado.
- Notebook no tamanho do painel e celular 390 × 844 conferidos. Construtor sem transbordamento horizontal (390/390); legenda de retorno corrigida e conferida. Evidências JPEG nesta pasta de continuidade. Dimensões temporárias do navegador restauradas.
- `scripts/cs-preview/verify.cjs` foi atualizado para os novos seletores para futuras execuções. Não foi executado nesta revisão; a conferência de UI acima foi feita pelo navegador Codex. A simulação não substitui validação por API/esquema completo.
- Os testes de API/Storage/Atlas e PostgreSQL completo da release anterior são evidência histórica e **não validam esta revisão da migração**.

## Próximo passo e limites

Prévia em `http://127.0.0.1:4318/projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/planner`, somente dados fictícios. Recarregar a prévia reinicia os dados simulados. O servidor Vite deve continuar ativo para acesso local.

Antes de qualquer publicação, reconciliar novamente com a fonte atual da VPS, montar um candidato novo, repetir migração no esquema completo com ACL e API/Storage, conferir o desenho revisado com Josias e obter autorização de publicação. O candidato remoto anterior foi marcado como substituído. Não usar os testes anteriores como aceite do novo desenho.

Produção continua sem esta mudança; SQL `20261014043345` ainda não aplicado. Atlas permanece pausado. Aceite visual e uso real pendentes. Casa D Noivas / Marbô não receberam projetos, tarefas ou compromissos reais desta simulação.

## Complemento de 14/10: paleta da marca e acompanhamento contínuo

Josias pediu a paleta existente do Planeje e explicou que contratos de seis meses frequentemente mantêm a mesma estratégia. A assessoria usa um projeto para todo o período; revisões mensais não exigem duplicar o projeto nem mudar uma estratégia que continua adequada.

- Cores da assessoria passam a usar os tokens existentes de `planeje-brand.css`: laranja nas ações principais, rosa/roxo nas etapas e seleções, superfícies e textos do tema claro/escuro. Conexões e setas do mapa herdam a marca. Nenhuma alteração global na paleta.
- O formulário de assessoria identifica **Período de acompanhamento** e explica que pode abranger todo o contrato. O passo Direção mostra o intervalo salvo. O passo Acompanhamento orienta a indicar o mês/intervalo analisado e salvar uma revisão no mesmo projeto.
- Os campos existentes `mes_referencia` / `mes_fim`, os snapshots e a relação com Tarefas permanecem. Não foi criada recorrência automática de tarefas, geração automática de revisões ou cadastro separado de ciclos mensais. Resultados podem ser consultados pelo intervalo escolhido; relatórios e reuniões continuam em Histórico e documentos.
- Quatro arquivos de frontend alterados. Sem dados, esquema, serviços, envios ou publicação. Os três componentes tradicionais continuam com os mesmos hashes da revisão anterior; o texto e o estilo tradicionais do formulário foram preservados.
- Testes locais: nove testes/subtestes em três arquivos (períodos, assessoria e métricas), todos aprovados. Build completo e build da prévia aprovados. Servidor local respondeu HTTP 200.
- A conferência visual **deste complemento** ficou pendente: o navegador havia recusado a abertura automática por política de URL. Não houve tentativa por outra superfície. As capturas anteriores mostram o desenho anterior e não comprovam a nova paleta. A aba do usuário não foi recarregada nem teve seus dados fictícios reiniciados.
- Evidência específica: `../evidencias/releases/apice-cs-paleta-periodo-2026-10-14.json`. Antes de um candidato novo, incorporar a produção vigente `47519cec` / `2731d631`, validar esquema completo/API e obter autorização de publicação. Atlas segue pausado.

## Complemento de 14/10: contraste dos cartões e orientação de exclusão

Josias enviou a captura das 16h34 e pediu mais sombra, porque os cartões se confundiam com o fundo branco. Bordas e sombras foram reforçadas nos cartões de assessoria, painéis da visão geral, construtor e etapas do mapa. A sombra existe em repouso e aumenta no hover/foco; o tema escuro tem sombra própria. Paleta e geometria foram mantidas. Apenas `consulting.css` alterado neste complemento, sem modificar os componentes tradicionais.

Sobre “como apaga um projeto”: foi conferido o comportamento existente, sem executar nenhuma exclusão. Projetos tradicionais possuem Excluir; na assessoria a opção está oculta, a lista bloqueia a exclusão e a migração candidata protege o histórico. O caminho disponível é abrir o projeto → Editar → Status → Pausado. Pausar mantém o projeto na lista e preserva seu histórico; não equivale a excluir. A pergunta do usuário não foi tratada como autorização para apagar um projeto específico ou mudar essa regra nesta entrega.

Build local aprovado e CSS servido na prévia; não houve nova automação do navegador, recarga da aba ou reinício dos dados fictícios. A captura fornecida é evidência do problema anterior, não validação do ajuste. Conferência visual final e publicação continuam pendentes. Release específica: `../evidencias/releases/apice-cs-contraste-2026-10-14.json`.

## Atualização posterior: exclusão solicitada

Josias pediu “Tem que dar para excluir”. A limitação de apenas Pausado foi substituída na prévia por exclusão confirmada para administradores, preservando tarefas e documentos do cliente. Ver [nova implementação e verificações](apice-cs-exclusao-2026-10-14.md). Ainda não publicado.
