> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Entrega de teste — Planejamento e integração da Fase 4

Data: 14/09/2026. Autorização: “vamos codar?”. Implementação disponível somente na VPS de testes `2.25.216.103` pelo endereço local `http://localhost:18080`. Produção `72.60.14.109` não foi alterada.

## O que foi entregue

- Ficha do cliente concentra contrato/escopo mensal, quantidades, canais, metas e histórico. Projetos consulta esse registro.
- Projetos abre o planejamento manual: objetivo, contexto, comunicação, ações e materiais. IA é ajuda opcional com conferência antes de aplicar.
- Cada material tem identificação estável, briefing, roteiro, legenda, CTA, referências, canais previstos e datas com calendário clicável.
- Planejamento e Calendário editam os mesmos materiais. Acompanhamento mostra status e responsáveis das tarefas reais.
- Criar tarefa preserva o motor de funções e automações. O mesmo material não cria duas tarefas ao repetir a ação ou sob concorrência.
- Tarefas antigas podem ser vinculadas explicitamente. Novas tarefas recebem conteúdo e campos equivalentes do briefing, permanecendo em rascunho/A Fazer até o fluxo regular avançar.
- Canais previstos aparecem no resumo e são pré-selecionados em Publicações; destino, data, responsável e comprovação continuam sendo definidos por canal.
- Reaproveitamento copia conteúdo com novas identificações, sem reaproveitar execução anterior: remove também links de comprovação antigos e datas de uso/gravação, preservando referências criativas.
- Salvamento automático, comando Salvar, rascunho recuperável e detecção de edição concorrente.

## Revisão de usabilidade após o primeiro uso

Após Josias informar que não usaria a primeira organização por excesso de abas e informação, a navegação foi refeita na VPS de teste:

- Projetos abre em uma lista simples de planos mensais, com busca e identificação clara de plano vazio ou em construção.
- Planos criados sem conteúdo aparecem normalmente e abrem direto em um documento em branco.
- O cache antigo deixou de esconder planos novos: a lista atualiza os dados reais ao abrir, ao voltar para a janela e pelo botão Atualizar.
- O plano possui um campo livre grande, semelhante a um documento, seguido da seção “O que será produzido”.
- Cada vídeo, arte ou outra entrega é revisado como item do plano e só então enviado para Tarefas em `A Fazer`.
- A IA pode ajudar a escrever ou sugerir itens, sempre sob comando e com conferência antes de aplicar. Nenhuma tarefa é criada pela IA.
- As tarefas vinculadas aparecem abaixo do próprio plano. O painel completo ficou disponível no botão `Visão da agência`.
- Calendário e Referências permanecem como acessos secundários; as quatro abas principais foram removidas.
- O escopo contratado permanece ligado à ficha do cliente e aparece recolhido no plano.
- O documento do plano possui editor visual: títulos, fontes, tamanhos, negrito, itálico, sublinhado, tachado, listas, citação, linha horizontal, alinhamento, recuo, links, imagem por endereço, cores, destaque, desfazer/refazer e limpeza da formatação.
- Planos antigos em texto simples continuam abrindo normalmente. A formatação passa a ser gravada no mesmo campo existente quando o documento é editado.
- Conteúdo colado é filtrado antes de salvar. A IA recebe o texto legível do documento, sem as marcações HTML.

## Validação executada

- Build de produção concluído na VPS de teste com Node 20, sem instalar dependências novas e sem acesso de rede no build.
- 46 testes automáticos passaram na rodada de integração: planejamento, identidade material/tarefa, stories, escopo, métricas operacionais, compatibilidade de fluxos e publicações.
- Após o ajuste final de reaproveitamento, os 4 testes de planejamento passaram, incluindo a remoção de evidências/datas antigas e a preservação da origem.
- Na revisão de usabilidade, 23 casos dos cinco testes focados passaram: escopo mensal, identidade dos materiais, vínculo material/tarefa, planejamento e exibição de planos vazios.
- Com o editor visual, 24 casos dos seis testes focados passaram. Um plano temporário foi escrito, formatado em negrito, salvo, reaberto e conferido no banco; o registro temporário foi removido ao final.
- Aceitações SQL em transação com rollback: criação/vínculo/idempotência, permissões existentes, preservação de tarefa antiga, barreiras de publicação, contexto e versionamento, preenchimento conservador do briefing.
- Concorrência em duas sessões: uma tarefa criada; segunda requisição retornou a mesma tarefa.
- Jornada real no navegador: novo projeto pelo cliente/mês; escrita sem IA; salvamento e reabertura do texto; material com Instagram/Facebook; seleção de 23/09 por clique; criação de tarefa em A Fazer com Poliana pela automação existente; dois canais pré-selecionados; calendário com conteúdo separado; renomeação preservando vínculo; acompanhamento com status real; reaproveitamento com ID novo, sem data nem tarefa antiga.
- Campos herdados do briefing verificados no banco e na interface, sem marcar aprovação.
- Falha de schema encontrada durante QA (`contexto_ia` inexistente) corrigida por migração; o formulário reteve o texto durante a falha e o salvou depois da correção.
- Registros temporários removidos. Contagens restauradas: 1.241 tarefas, 24 projetos, 12 planos e 13 automações.
- A nova lista foi conferida no navegador com os 26 projetos atuais, incluindo os planos vazios criados por Josias; nenhum registro de teste foi criado durante essa conferência.

## Preservação e arquivos

Backup anterior às mudanças: `/opt/planeje-staging/private/phase4-projects-before-20260914T193445Z`. Dump, fonte, dist e diff guardados; listagem dos arquivos e do dump conferida. Não foi executado novo ensaio de restauração neste turno.

Backup anterior à revisão de usabilidade: `/opt/planeje-staging/private/phase4-ux-before-20260914T202500Z`. O dump foi listado pelo `pg_restore` e o pacote da fonte foi lido integralmente pelo `tar`.

Backup anterior ao editor visual: `/opt/planeje-staging/private/phase4-richtext-before-20260914T212500Z`. O dump foi listado pelo `pg_restore` e o pacote da fonte foi lido integralmente pelo `tar`.

Fonte entregue: `/opt/planeje-staging/source`. Build isolado: `/opt/planeje-staging/build-phase2`. Assets antigos foram mantidos; troca do index foi atômica.

Cópia local da fonte: `work/planeje-phase4-projects/source`. Manifesto das alterações: `work/planeje-phase4-projects/arquivos-alterados.txt`. Versão do build e hashes: `work/planeje-phase4-projects/release.json`.

Migrações aplicadas somente no teste:

1. `20260914193700_stable_project_material_tasks.sql`
2. `20260914195815_persist_project_planning_context.sql`
3. `20260914200716_prefill_planned_material_briefing.sql`
4. `20260915172000_standardize_planned_task_titles.sql`
5. `20260915180000_select_planned_material_workflow.sql`
6. `20260915183251_planned_material_entry_stage.sql`
7. `20260915194150_operational_material_coverage.sql`

## Limites e próximo aceite

O complemento da Fase 4 está pronto para validação final de uso por Josias na VPS de teste. O painel de Cobertura por tipo e a contabilização contratual multicanal foram implementados em 15/09/2026, conforme o registro ao fim deste documento. Não foi criada uma trava de aprovação do plano antes da criação de tarefas.

A integração real de geração por IA foi habilitada e validada posteriormente, em 15/09/2026, conforme o registro abaixo. Os textos do plano são anotações de planejamento; alterações posteriores não sobrescrevem o trabalho já registrado na tarefa vinculada.

## Correção de colagem formatada — 15/09/2026

Após o primeiro uso, Josias informou que um texto copiado de outra origem chegava ao Plano do mês sem a formatação esperada. A limpeza do editor preservava a estrutura básica, mas descartava estilos usados por editores como Google Docs, Word e páginas web.

- A colagem passou a preservar títulos H1–H6, negrito, itálico, sublinhado, tachado, listas, citações, links, fontes, tamanhos, cores, alinhamento, recuos, código e tabelas.
- Estilos executáveis e elementos inseguros continuam removidos.
- Quando a origem fornece somente texto, títulos, listas, citações e marcação simples em Markdown são convertidos para o formato visual do plano.
- A substituição de todo o conteúdo não fica presa dentro do estilo do parágrafo ou título anterior; isso evita documentos inteiros aninhados em um único título e mantém tabelas.
- Testes auxiliares passaram e o teste real no navegador confirmou título, negrito, itálico, sublinhado, lista e tabela, com remoção de código inseguro.
- Build de staging publicado como `assets/index.b5a2a3d1.js` e `assets/index.5c39bccd.css`. Produção não foi alterada.

Antes da alteração dos arquivos, foi criado o backup `/opt/planeje-staging/private/rich-paste-before-20260915T100500`. Durante a validação automatizada no plano Toniolo, a amostra de teste acionou o salvamento automático. O conteúdo imediatamente anterior foi recuperado da versão física ainda preservada pelo PostgreSQL, guardado em `/opt/planeje-staging/private/plan-recovery-20260915T131500Z/original-rich.html` e restaurado integralmente: 7.385 caracteres, iniciando por “PLANEJAMENTO — TONIOLO | SETEMBRO”. A interface foi recarregada e conferida sem a amostra de teste.

## Correção da IA do planejamento — 15/09/2026

O Assistente de Campanha mostrava “Chave de API da OpenAI não encontrada”. A chave existia, mas havia duas causas no ambiente de teste: a função que lia o segredo consultava um armazenamento diferente daquele usado para gravá-lo, e o Nginx bloqueava as rotas de IA de texto antes de elas chegarem ao servidor de funções.

- A função `get_encrypted_secret` passou a consultar o Vault corretamente e a usar `app_secrets` como compatibilidade, restrita a `service_role` ou perfil `superadmin`.
- O contêiner de funções recebeu as variáveis existentes de IA e uma rede de saída dedicada. A rede isolada dos demais serviços foi preservada.
- O Nginx passou a liberar somente `openai-chat` e `openrouter-chat`. Imagem, busca, mensageria, anúncios, webhooks e demais integrações externas continuam bloqueados no staging.
- A chamada do navegador continua passando pelo servidor; não foi aberta comunicação direta entre o navegador e a OpenAI.
- Teste direto da função retornou HTTP 200. No teste completo pela tela do Planeje, a mensagem “Responda somente OK. Não altere o plano.” recebeu “OK”.
- Migração aplicada somente no teste: `20260915130000_fix_encrypted_secret_reader.sql`.
- Backup anterior à habilitação: `/opt/planeje-staging/private/ai-enable-before-20260915T130000`.

Produção `72.60.14.109` não foi alterada.

## Pré-configuração de tarefas a partir do plano — 15/09/2026

O comando de IA de “O que será produzido” foi simplificado para executar a leitura do Plano do mês diretamente, sem abrir o chat e sem exigir duas aplicações intermediárias.

- O botão passou a se chamar `Preparar itens com IA` e mostra `Lendo o plano…` durante o processamento.
- A IA identifica entregas descritas no documento e devolve rascunhos de arte, carrossel, vídeo, reels, story, post ou outro material.
- Cada rascunho pode trazer título, briefing, roteiro ou texto, legenda, CTA, referências, canais e datas quando disponíveis.
- A prévia mostra cartões simples; o conteúdo extenso fica recolhido em `Ver conteúdo preparado`.
- Nenhuma tarefa é criada na leitura. O usuário primeiro adiciona os rascunhos em `O que será produzido`, depois revisa, edita ou remove cada cartão.
- Somente `Enviar para A Fazer` cria a tarefa real. A tarefa entra no motor atual de funções, etapas e automações.
- Itens com mesmo tipo e título já existentes no plano são ignorados para reduzir duplicações.
- Respostas fora do formato esperado são rejeitadas sem alterar o planejamento.

Validação no plano Toniolo: a IA preparou cinco vídeos e um conjunto de Stories, incluindo os roteiros existentes e a data explícita do Dia do Cliente. A prévia foi descartada nas duas rodadas de teste; o projeto permaneceu com zero materiais e zero tarefas. Sete testes do planejamento passaram e o build de staging foi publicado como `assets/index.c7f76290.js`.

Backup anterior à alteração: `/opt/planeje-staging/private/ai-materials-before-20260915T164500`. Produção não foi alterada.

## Nomenclatura das tarefas do planejamento — 15/09/2026

Foi preservado o padrão operacional informado por Josias: `[Nome do Cliente] Tipo Número - Nome da tarefa`, por exemplo `[Ápice Noivas] Video 12 - Pinterest`.

- Cada material do plano possui um número visível e editável, separado do nome da tarefa.
- O cartão mostra o nome completo que será usado antes de `Enviar para A Fazer`.
- A IA preserva números explícitos do documento, como `VÍDEO 01`. Quando o documento não informa um número, o sistema sugere a sequência por tipo.
- Materiais antigos sem o campo de número recebem uma prévia compatível pela ordem do tipo, como `Video 02`, `Video 03` e `Story 01`.
- Títulos antigos que já incluem cliente, tipo e número são limpos ao criar a tarefa, evitando repetição.
- Tarefas já criadas não são renomeadas. Responsáveis, funções, etapas e automações continuam sendo definidos pelo motor de Tarefas.

Validação executada na VPS de teste:

- Oito testes do planejamento passaram, cobrindo número explícito, normalização, sequência por tipo, compatibilidade com materiais antigos e prévia do título.
- A aceitação SQL confirmou, dentro de transação revertida, os títulos `Video 12`, `Video 03`, `Arte 01` e `Arte 02`, mantendo a entrada em `A Fazer` e o fluxo configurado.
- A aceitação completa de criação e vínculo do planejamento também passou sem regressão de permissões, responsáveis, canais, automações, publicação ou idempotência.
- Na interface do plano Toniolo, os materiais antigos foram exibidos como `Video 02` a `Video 05` e `Story 01`. O diálogo mostrou o número editável e a frase `Será criada como` com o título completo.
- Nenhuma tarefa ou material foi criado durante a conferência visual. O navegador não registrou erros nem avisos.
- Build publicado no staging: `assets/index.71429eab.js` e `assets/index.6c67ed9c.css`.

Backup anterior à alteração: `/opt/planeje-staging/private/task-naming-before-20260915T171253Z`. Produção `72.60.14.109` não foi alterada.

## Exclusão de material com tarefa vinculada — 15/09/2026

Após o uso do planejamento, os cinco materiais sem tarefa foram removidos normalmente. O item restante não oferecia exclusão porque já possuía uma tarefa vinculada.

- Todos os cartões agora mostram o comando `Remover do plano`.
- Materiais vinculados também podem ser retirados de `O que será produzido`.
- A confirmação informa o nome da tarefa que será preservada.
- Remover o cartão não exclui a tarefa, seu histórico, responsáveis, publicações ou automações. A tarefa continua disponível em `Tarefas deste projeto` e no módulo Tarefas.
- O mesmo comando também está disponível dentro de `Detalhar material`.

A confirmação foi aberta no material Toniolo vinculado e cancelada. Depois do teste, o banco continuou com um material no plano e uma tarefa vinculada; o navegador não registrou erros. Build de staging: `assets/index.b98b1407.js`. Backup: `/opt/planeje-staging/private/linked-material-remove-before-20260915T172552Z`. Produção não foi alterada.

## Atalhos de datas nos materiais — 15/09/2026

As datas principais de cada material podem ser definidas no próprio cartão de `O que será produzido`, sem abrir `Editar`.

- O atalho `Criação` abre um calendário e registra o prazo de produção.
- O atalho `Postagem` abre um calendário e registra a previsão de publicação.
- Quando uma data já existe, o atalho a mostra em formato brasileiro e oferece `Limpar data`.
- Enquanto o material ainda não virou tarefa, as datas ficam guardadas no planejamento e seguem para a tarefa quando ela for criada.
- Quando o material já possui tarefa vinculada, a alteração é gravada no planejamento e na própria tarefa, evitando datas diferentes nas duas telas.
- A edição completa do material continua oferecendo os mesmos campos de data.

Validação na VPS de teste: os cinco materiais do plano Toniolo exibiram os dois atalhos; os calendários de `Criação` e `Postagem` abriram e foram fechados sem selecionar uma data. O navegador não registrou erros ou avisos. A conferência posterior no banco confirmou cinco materiais sem datas e a tarefa existente preservada com entrega em 15/09/2026, portanto o teste visual não modificou dados reais.

Build de staging: `assets/index.bb1d77f5.js` e `assets/index.6c67ed9c.css`. Backup anterior à alteração: `/opt/planeje-staging/private/material-date-shortcuts-before-20260915T173421Z`. Produção `72.60.14.109` não foi alterada.

## Fluxo e responsáveis nos materiais — 15/09/2026

Cada cartão de `O que será produzido` passou a mostrar o fluxo que receberá a tarefa e as pessoas configuradas para sua entrada, sem exigir a abertura de `Editar`.

- O atalho `Fluxo` mostra o nome do fluxo e quem recebe a tarefa em `A Fazer`.
- Ao abrir o atalho, o usuário vê todas as etapas, funções e pessoas configuradas: briefing, roteiro, gravação, design ou edição, revisão, validação, cliente e postagem.
- Antes de criar a tarefa, o fluxo pode ficar em `Automático pelo tipo` ou ser escolhido entre os fluxos ativos compatíveis com aquele tipo de material.
- A escolha grava o fluxo no material e segue para a tarefa quando `Enviar para A Fazer` for usado.
- Depois que a tarefa existe, o cartão apresenta o fluxo e os responsáveis atuais; as mudanças seguintes continuam no motor de Tarefas.
- Uma pessoa fixa não é gravada como dona de todas as etapas. O comando `Configurar funções e pessoas` abre a configuração central; uma substituição passa a valer para novas tarefas e para as próximas entradas naquela função, sem exigir a edição dos planos.
- O banco rejeita um fluxo incompatível com o tipo do material.

No fluxo atual de Vídeo, a interface confirmou: Poliana Geffer em `A Fazer` e `Briefing`; Gabriel Moraes em `Roteiro` e `Gravação`; Poliana Geffer na aprovação do roteiro e na revisão do material; Samuel Bonfim em `Edição`; Josias BF na validação; Jheimisson Ray De Sousa Lima no cliente e na postagem.

Validação executada:

- Nove testes do planejamento aprovados, incluindo a resolução do tipo usado pelo fluxo.
- Build do frontend concluído com 3.430 módulos.
- Aceitação SQL em transação revertida criou temporariamente o Video 01 com o fluxo `Conteúdo — Vídeo e reels`, função `Planejamento e briefing` e Poliana Geffer; o rollback restaurou a contagem original de uma tarefa.
- Uma segunda aceitação confirmou que um fluxo de Arte não pode ser aplicado a um material de Vídeo.
- O atalho foi aberto no navegador e exibiu as 12 etapas com suas funções e pessoas. Nenhum seletor foi alterado, nenhuma tarefa foi criada e o navegador não registrou erros ou avisos.
- Conferência final no banco: cinco materiais, nenhum fluxo explicitamente escolhido, nenhuma data adicionada e uma tarefa existente preservada.

Build de staging: `assets/index.e50fb9f7.js` e `assets/index.ed0270d3.css`. Migração aplicada somente no teste: `20260915180000_select_planned_material_workflow.sql`. Backup anterior à alteração: `/opt/planeje-staging/private/material-initial-assignee-before-20260915T175227Z`. Produção `72.60.14.109` não foi alterada.

## Primeira etapa necessária e novo painel de materiais — 15/09/2026

O briefing deixou de ser uma passagem repetida para todo material. A tarefa continua sendo criada em `A Fazer`, mas o planejamento define qual é o primeiro trabalho que ainda precisa acontecer.

- O atalho `Começa em` pergunta se o briefing ainda precisa ser preparado ou se já está pronto.
- Em Vídeo/Reels com briefing pronto, o usuário informa se o roteiro ainda precisa ser escrito, está pronto para revisão ou já foi aprovado.
- O resultado direciona a entrada para `Briefing`, `Roteiro`, `Aprovação interna do roteiro`, `Gravação` ou `Produção da arte`, conforme o tipo e as confirmações do usuário.
- Materiais antigos sem confirmação continuam começando em `Briefing`, preservando o comportamento anterior. Nenhuma etapa é pulada pela simples presença de texto.
- Em `A Fazer`, a tarefa já fica ligada à função e às pessoas da primeira etapa necessária. Ao usar `Iniciar`, ela entra diretamente nessa etapa.
- O fluxo continua configurável em Automações. A nova regra usa as etapas, funções e responsáveis do fluxo escolhido; não cria um segundo motor operacional.
- Tarefas existentes não foram migradas ou movimentadas.

`O que será produzido` foi redesenhado para facilitar a leitura e o trabalho diário. Após o teste inicial em cartões, Josias pediu o formato de lista:

- uma linha compacta por material, em sequência única;
- colunas para material, criação, postagem e primeiro passo;
- cor, ícone, número e estado real da tarefa ou marcação de rascunho;
- ao abrir uma linha, aparecem resumo, canais, fluxo, responsáveis e ações;
- datas e primeira etapa continuam acessíveis diretamente na linha;
- ações de menor frequência ficam recolhidas: `Remover`, `Editar`, `Enviar para A Fazer` ou `Abrir tarefa`;
- editor completo dividido em Identificação, Preparação e fluxo, Conteúdo para produção e Distribuição;
- detalhes explicativos permanecem atrás do ícone `?`.

Validação na VPS de teste:

- 10 testes do planejamento passaram.
- O build final compilou 3.430 módulos e foi publicado como `assets/index.cd94cbee.js` e `assets/index.7706f0da.css`.
- A migração foi executada primeiro em transação e revertida; depois foi aplicada no staging.
- Uma criação simulada com rollback confirmou `A Fazer` + primeira etapa `Aprovação interna do roteiro` + função `Revisão interna` + Poliana Geffer.
- Outras duas simulações revertidas confirmaram o padrão conservador `Briefing`/Poliana e o salto aprovado para `Gravação`/Gabriel Moraes.
- A mudança de status simulada confirmou que o motor atual assume a etapa e os responsáveis corretos.
- Após os rollbacks, o projeto permaneceu com as duas tarefas que já existiam e nenhum registro de teste.
- A lista recolhida, a abertura de uma linha, o atalho de preparação e o editor completo foram conferidos no navegador sem editar o plano Toniolo.

Migração aplicada somente no teste: `20260915183251_planned_material_entry_stage.sql`. Backups: `/opt/planeje-staging/private/material-entry-ui-before-20260915T183226Z` e `/opt/planeje-staging/private/material-list-before-20260915T190500Z`. Produção `72.60.14.109` não foi alterada.

## Cobertura operacional por material — 15/09/2026

O painel de Cobertura passou a ligar o escopo mensal da ficha do cliente ao plano, às tarefas e às publicações reais.

- Um material conta uma vez no contrato, mesmo quando será publicado em vários canais.
- Uma adaptação que exige nova edição ou formato deve ser criada como outro material e conta separadamente.
- As publicações por Instagram, Facebook, YouTube ou outro canal aparecem como ocorrências daquele material; elas não aumentam o total contratado.
- O resumo mostra contratado, planejado, material ainda sem tarefa, execução, entrega, publicações e falta de planejamento.
- Cada cliente abre o detalhamento por Posts, Carrosséis, Vídeos, Stories e Anúncios.
- Materiais do plano e tarefas de conteúdo que ficaram fora do plano aparecem separados. Tarefas administrativas e registros sem tipo de conteúdo não entram na cobertura.
- Os atalhos levam ao Plano, às Tarefas e ao Escopo mensal do cliente.
- A consulta anterior de Cobertura foi preservada para compatibilidade; o novo painel usa uma RPC aditiva e mantém fallback.
- O `?` do cabeçalho explica a regra multicanal no próprio sistema.

Validação executada somente no staging:

- 14 testes focados passaram: 4 de cobertura e 10 de planejamento.
- A aceitação SQL transacional confirmou que um vídeo com três publicações conta como um material e três ocorrências de canal. Ao adicionar uma edição específica para YouTube, o total passou a dois materiais. Toda a amostra foi revertida.
- A nova RPC possui execução apenas para `authenticated` e `service_role`; `PUBLIC` e `anon` permanecem sem acesso.
- O identificador temporário usado na aceitação ficou com zero registros em clientes, projetos, tarefas e publicações.
- O navegador mostrou 22 escopos mensais, 19 clientes de conteúdo e o detalhamento por tipo sem erro de interface.
- Na Toniolo, os dados atuais apontam 5 materiais no plano e 5 tarefas de conteúdo fora do plano, totalizando 10 planejados para um escopo de 6. Esse é um diagnóstico dos dados atuais; nenhuma tarefa ou material foi alterado.

Build de staging: `assets/index.fe3a372a.js` e `assets/index.6334eacb.css`. Migração aplicada somente no teste: `20260915194150_operational_material_coverage.sql`. Backup anterior à alteração: `/opt/planeje-staging/private/coverage-materials-before-20260915T193000Z`, com checksums conferidos. Produção `72.60.14.109` não foi alterada.

## Redesign visual da Cobertura — 15/09/2026

O painel de Cobertura foi reorganizado na VPS de testes, usando como referência visual o projeto Lumin, sem copiar sua identidade. A implementação mantém a marca do Planeje e preserva todos os cálculos e vínculos operacionais entregues anteriormente.

- O topo passou a destacar a leitura principal do mês: planejado, contratado e percentual coberto.
- Após a primeira validação visual, o cabeçalho foi reduzido a uma faixa única com título, período e atalhos; a explicação longa permanece no ícone `?`.
- As métricas de falta de planejamento, materiais aguardando tarefa, execução e entrega foram separadas em cartões simples.
- A lista de clientes foi reduzida a seis grupos de informação: cliente, planejamento, operação, publicações, situação e ações.
- A operação agrupa pendente, em execução e entregue no mesmo ponto, evitando excesso de colunas.
- Foram adicionados busca por cliente ou responsável e filtros para atenção, cobertos e acima do escopo.
- O detalhamento por tipo de material continua disponível ao abrir a linha do cliente.
- Os atalhos para Plano, Tarefas e Escopo foram preservados, assim como a visão opcional de tráfego.
- Nenhum contrato, material, tarefa, publicação ou regra de automação foi alterado durante o redesign.

Validação executada somente no staging:

- Filtro `Acima do escopo` retornou Dinamac, 3 Irmãos e Toniolo, três dos 19 clientes de conteúdo.
- A busca por `Toniolo` retornou uma linha e a abertura exibiu Posts e Vídeos com contratado, planejado, sem tarefa, execução, entrega, publicações e falta.
- Os 14 testes focados de cobertura e planejamento passaram.
- O backup anterior ao redesign foi verificado por checksum.
- O componente local e o implantado possuem o mesmo SHA-256: `4cdefb4f210ca6cdce3e6e42587781ac5d4a7a45594dfc4b18331159d84fe6d2`.

Build de staging: `assets/index.76a251ec.js` e `assets/index.701a6e8c.css`. Backups: `/opt/planeje-staging/private/coverage-design-before-20260915T223947Z` e `/opt/planeje-staging/private/coverage-header-before-20260915T231454Z`. Produção `72.60.14.109` não foi alterada.

## Barra superior e menu do perfil — 15/09/2026

Após a validação do painel, o cabeçalho global vazio foi retirado do desktop. O espaço útil das páginas começa imediatamente abaixo da lateral.

- O botão visual de busca foi removido; a busca rápida continua disponível pelo atalho `⌘K`.
- O estado `Online` saiu da barra e passou para o menu do perfil.
- O modo claro/escuro passou para o mesmo menu do perfil.
- A ação `Sair` foi preservada no menu.
- No celular, o cabeçalho compacto continua disponível para não retirar o acesso à conta.
- O modo claro e o modo escuro compartilham a mesma preferência entre o menu lateral e as áreas que usam o perfil compacto.

Validação executada somente no staging:

- A Cobertura abriu sem a barra superior no desktop.
- O perfil lateral abriu com nome, estado online, tema e saída.
- O tema alternou para escuro, apresentou a ação inversa e foi restaurado para claro.
- Os 14 testes focados de cobertura e planejamento passaram novamente.
- Os dois backups desta alteração foram validados por checksum.

Build final de staging: `assets/index.8ac89e91.js` e `assets/index.27424415.css`. Backups: `/opt/planeje-staging/private/workspace-header-before-20260915T232155Z` e `/opt/planeje-staging/private/profile-menu-before-20260915T232429Z`. Produção `72.60.14.109` não foi alterada.

## Fundo global e contraste dos cartões — 15/09/2026

A linguagem visual validada na Cobertura foi transformada em regra global das páginas normais do sistema.

- No modo claro, o fundo usa um cinza azulado mais escuro que os cartões, com luz suave e discreta presença da cor da marca.
- No modo escuro, o fundo usa azul profundo e mantém os cartões em um nível mais claro para separar conteúdo e navegação.
- A regra fica no contêiner global do espaço de trabalho. Clientes, Projetos, Tarefas, Configurações e as demais páginas comuns recebem o mesmo canvas sem repetir implementação.
- A Cobertura deixou de desenhar um fundo próprio e passou a usar o canvas global, eliminando a aparência de um quadrado dentro de outro.
- Conversas e CRM continuam em seus contêineres de tela cheia. Tráfego mantém sua estrutura e componentes próprios.
- Nenhum dado, cálculo, contrato, tarefa, publicação, permissão ou automação foi alterado.

Validação executada somente no staging:

- Cobertura, Clientes e Projetos foram conferidos no navegador no modo claro.
- Projetos e Cobertura foram conferidos no modo escuro.
- Os 14 testes focados de cobertura e planejamento passaram.
- O backup anterior à mudança foi conferido por SHA-256.
- Os arquivos locais e os implantados possuem os mesmos SHA-256.

Build de staging: `assets/index.943fac2b.js` e `assets/index.108c2d15.css`. Backup: `/opt/planeje-staging/private/workspace-canvas-before-20260915T234223Z`. Produção `72.60.14.109` não foi alterada.

## Situação do plano e consulta de tarefas na Cobertura — 15/09/2026

Os atalhos de cada cliente na Cobertura passaram a indicar a situação real do planejamento mensal e permitir a consulta das tarefas sem sair do painel.

- A coluna Planejamento mostra `Sem plano deste mês`, `Plano criado, sem materiais` ou `Plano com X materiais`.
- Quando existe planejamento no mês, a ação `Abrir plano` leva ao projeto correspondente.
- Quando não existe, `Criar plano` abre o cadastro com cliente, ano e mês já preenchidos.
- `Tarefas` abre um popup com as tarefas de conteúdo consideradas na cobertura do cliente e do período.
- Cada tarefa mostra status, vínculo `No plano` ou `Fora do plano`, responsáveis, prazo ou postagem e um atalho para o detalhe.
- O rodapé do popup permite abrir a lista completa de Tarefas já filtrada pelo cliente. O parâmetro anterior, que não era reconhecido pela tela de Tarefas, foi corrigido.
- `Escopo` continua levando à ficha mensal do cliente. Essa ficha é a origem do contratado usado na comparação da Cobertura; o plano representa o que será produzido.
- Nenhuma tarefa, projeto, escopo, responsável ou status foi alterado durante a implementação e a validação.

Validação executada somente no staging:

- Toniolo exibiu `Plano com 5 materiais`, `Abrir plano`, seis tarefas existentes e o Escopo de setembro de 2026.
- O popup mostrou as seis tarefas consideradas na cobertura, com uma ligada ao plano e cinco fora do plano.
- Clientes sem planejamento mostraram `Sem plano deste mês` e `Criar plano` com cliente e período preenchidos no endereço.
- Os destinos para Plano, detalhe da tarefa, lista filtrada de Tarefas e Escopo foram conferidos no navegador.
- Os 14 testes focados de cobertura e planejamento passaram.
- O backup anterior à mudança e os arquivos implantados foram conferidos por SHA-256.

Build de staging: `assets/index.cc52c64f.js` e `assets/index.90933d65.css`. Backup: `/opt/planeje-staging/private/coverage-actions-before-20260915T235243Z`. Produção `72.60.14.109` não foi alterada.

## Saúde da conta por planejamento — 15/09/2026

A Cobertura passou a mostrar se a produção de cada cliente está seguindo o planejamento mensal ou acontecendo no improviso.

- Uma tarefa só conta como planejada quando está vinculada a um material existente no plano mensal.
- Selecionar apenas um projeto na tarefa não a transforma em planejada. Sem o vínculo com o material, ela aparece como conteúdo fora do plano.
- `Organizada` indica que toda a produção do período nasceu do plano.
- Uma porcentagem, como `50% planejada`, indica uma mistura de materiais planejados e conteúdos improvisados.
- `No improviso` indica que há produção, mas nenhum conteúdo veio do plano.
- `Plano vazio` e `Sem produção` distinguem clientes que possuem o projeto mensal sem materiais daqueles que ainda não produziram e não possuem plano.
- O resumo informa a quantidade de conteúdos fora do plano e em quantas contas isso acontece.
- O filtro `Com improviso` mostra somente as contas que possuem ao menos um conteúdo fora do planejamento.
- O ícone `?` no título da coluna explica a regra dentro do sistema.

Validação executada somente no staging:

- Setembro de 2026 apresenta 63 conteúdos fora do plano em 11 contas.
- O filtro `Com improviso` retornou 11 linhas.
- A Toniolo foi classificada como `50% planejada`: cinco materiais no plano e cinco conteúdos fora dele.
- Contas sem plano e com produção aparecem como `No improviso`; contas com plano sem materiais aparecem como `Plano vazio`.
- Os 14 testes focados de cobertura e planejamento passaram.
- O backup anterior à mudança e o arquivo implantado foram conferidos por SHA-256.

Build de staging: `assets/index.f3098595.js` e `assets/index.f9c8bc5f.css`. Backup: `/opt/planeje-staging/private/coverage-account-health-before-20260916T000610Z`. Produção `72.60.14.109` não foi alterada.

## Resumo diário da agência na Cobertura — 15/09/2026

O topo da Cobertura foi simplificado para mostrar somente informações que pedem decisão no dia a dia.

- O destaque principal passou a ser `Saúde do planejamento`: quantas contas estão produzindo no improviso e qual parcela da produção nasceu do plano mensal.
- `No plano` conta tarefas vinculadas a um material real do planejamento do mês. `Fora do plano` conta produção sem esse vínculo.
- `Clientes para planejar` mostra quantas contas ainda possuem entregas contratadas sem previsão no plano. O texto inferior informa quantos conteúdos faltam planejar.
- `Materiais sem tarefa` mostra itens já definidos no plano que ainda não iniciaram a execução em Tarefas.
- `Tarefas atrasadas` mostra as demandas cujo prazo já venceu e que ainda exigem ação.
- `Publicações pendentes` mostra canais configurados que ainda não possuem publicação concluída.
- Os indicadores genéricos de execução e entrega e a faixa repetida de estatísticas foram retirados do topo. Esses dados continuam disponíveis por cliente na tabela.
- A ação `Atualizar` foi movida para o cabeçalho e ficou representada pelo ícone de recarga.
- Nenhum cálculo, tarefa, planejamento, publicação, escopo ou automação foi alterado; esta entrega reorganiza a leitura dos dados existentes.

Validação executada somente no staging:

- Setembro de 2026 mostrou 11 contas no improviso, 5 conteúdos ligados ao plano e 63 fora do plano: 7% da produção registrada nasceu do planejamento.
- O painel mostrou 14 clientes para planejar, com 88 conteúdos ainda não previstos.
- Também mostrou 4 materiais sem tarefa, 43 tarefas atrasadas e 4 publicações pendentes, com 0 de 4 concluídas.
- A faixa repetida deixou de ocupar espaço entre o resumo e a lista de clientes.
- O novo cabeçalho e a tabela foram conferidos juntos no navegador em largura normal.
- Vinte e cinco verificações focadas de escopo, cobertura e planejamento passaram.
- O backup anterior à mudança foi validado por SHA-256.
- O componente local e o implantado possuem o mesmo SHA-256: `180c679f27676025b0f617eec615a18a36c4b45871a90eed7f93bcd875de0762`.

Build de staging: `assets/index.438d0d88.js` e `assets/index.1fd221d5.css`. Backup: `/opt/planeje-staging/private/coverage-daily-summary-before-20260916T001608Z`. Produção `72.60.14.109` não foi alterada.

## Menu interno com a base escura — 15/09/2026

O menu lateral do painel da agência passou a usar a mesma base preta do destaque `Saúde do planejamento`.

- O fundo usa preto profundo com luz rosa e laranja discreta, preservando a identidade do Planeje sem competir com o conteúdo.
- O item ativo mantém um destaque colorido suave e os demais ícones continuam claros.
- Os estados compacto e expandido foram conferidos no navegador.
- A área do cliente mantém sua identidade própria; a mudança foi limitada ao menu interno da agência.
- Nenhuma rota, permissão, módulo, dado ou automação foi alterado.

Build de staging: `assets/index.13d52556.js` e `assets/index.b14595a4.css`. Backup validado: `/opt/planeje-staging/private/sidebar-black-before-20260916T002953Z`. Produção `72.60.14.109` não foi alterada.

## Plano mensal compacto e documento em popup — 15/09/2026

A página do projeto deixou de manter o editor inteiro aberto durante o uso normal. O planejamento passou a ocupar um resumo curto, deixando os materiais e as tarefas mais próximos do topo.

- Quando o documento existe, o resumo mostra um trecho do plano, quantos materiais foram definidos e quantos já estão em Tarefas.
- `Visualizar plano` abre o conteúdo formatado em modo de leitura, sem ferramentas de edição ocupando a tela.
- `Editar plano` abre o editor completo em um popup, com formatação, ajuda de IA e as informações estruturadas opcionais.
- Quando ainda não existe texto, a página mostra `Nenhum documento foi escrito para este mês` e o botão `Criar plano` abre um documento em branco.
- O bloco `O que será produzido` continua na página principal, logo depois do resumo, com a lista compacta de materiais.
- O salvamento automático e a proteção contra edição concorrente foram preservados. Materiais, tarefas, automações, funções e dados do projeto não tiveram suas regras alteradas.

Validação executada somente no staging:

- O plano da Toniolo abriu primeiro em leitura e depois no editor completo, com a barra de formatação e o conteúdo existente preservados.
- O projeto `Fortalecer Marca`, da Ápice Noivas, mostrou o estado vazio e abriu o editor como `Criar plano do mês`, sem texto inicial.
- Os dois popups foram fechados sem editar ou criar dados durante o teste.
- Dezessete verificações focadas de planejamento, vínculo de tarefas e texto formatado passaram.
- O backup anterior à mudança foi validado por SHA-256.
- O componente local e o implantado possuem o mesmo SHA-256: `f49b76c2dfc8873f2ed1f0c795f99a3d586d738c1d86dac6c4572b762416224a`.

Build de staging: `assets/index.ed3eeedf.js`, `assets/index.9771a349.css` e `assets/projectsAiCompletion.79c3f495.js`. Backup: `/opt/planeje-staging/private/plan-dialog-before-20260916T004015Z`. Produção `72.60.14.109` não foi alterada.

## Cabeçalhos compactos nas páginas principais — 15/09/2026

O padrão compacto da Cobertura foi transformado em um componente reutilizável e aplicado às páginas principais da área interna.

- Título, contexto, ajuda `?` e ações importantes ficam na mesma barra branca, com menos altura e leitura mais rápida.
- O padrão foi aplicado em Cobertura, Início, Clientes, Planos mensais, Visão da agência, detalhe do projeto, Tarefas, Caixa, Solicitações, Redes sociais, Onboarding, Automações, Configurações e Assistente.
- Em Projetos, a listagem, a visão geral da agência e o detalhe do plano usam a mesma linguagem visual. O detalhe do projeto mantém Voltar, status, cliente, Calendário, Referências, Editar e Excluir em uma única barra.
- Conversas e CRM preservam suas estruturas próprias de tela cheia.
- Nenhuma tarefa, plano, cliente, automação, função, responsável, status ou regra operacional foi alterada.

Validação executada somente no staging:

- O build de produção do frontend foi concluído com as variáveis públicas corretas do ambiente de teste.
- Cobertura, Projetos, detalhe do projeto, Tarefas, Clientes, Caixa, Solicitações, Redes sociais, Onboarding, Automações, Configurações e Assistente foram conferidos no navegador.
- Treze suítes focadas de escopo, cobertura, planejamento, materiais, publicações, vínculos e compatibilidade do fluxo passaram.
- Os 17 arquivos locais e implantados possuem os mesmos SHA-256.
- O backup anterior à mudança foi verificado por SHA-256.
- O diagnóstico temporário usado durante a validação do build foi removido do `dist` final.

Build de staging: `assets/index.edacb4dc.js`, `assets/index.0bce1d71.css` e `assets/projectsAiCompletion.2fb9f30f.js`. Backup: `/opt/planeje-staging/private/page-headers-before-20260916T011500Z`. Produção `72.60.14.109` não foi alterada.

## Lista de tarefas do projeto corrigida — 15/09/2026

A seção `Tarefas deste projeto` foi reorganizada porque os itens pareciam soltos sobre o fundo e ocupavam espaço excessivo.

- Título, quantidade de tarefas e acesso à fila agora ficam no cabeçalho de um único contêiner branco.
- Cada tarefa ocupa uma linha compacta com nome, status, responsáveis, prazo e ação `Abrir tarefa`.
- A lista separa `tarefas do plano atual` de `Outras tarefas do projeto`. Quando uma tarefa aponta para um material antigo que já saiu do planejamento atual, ela recebe o aviso `Material antigo do projeto`.
- Estados de carregamento, erro e projeto sem tarefas usam o mesmo contêiner.
- Nenhuma tarefa, vínculo, responsável, prazo ou status foi alterado.

A interface foi conferida com as duas tarefas existentes do projeto Toniolo: uma pertence ao material atual e a outra foi identificada como histórica. Quatro suítes focadas passaram, o build foi aprovado e os hashes local/staging e do backup foram validados.

Build de staging: `assets/index.aecd0cce.js`, `assets/index.ee640d29.css` e `assets/projectsAiCompletion.bd822d08.js`. Backup: `/opt/planeje-staging/private/project-task-list-before-20260916T014200Z`. Produção `72.60.14.109` não foi alterada.

## Atalho de materiais entre Plano e Tarefas — 15/09/2026

`O que será produzido` foi ajustado para cumprir uma função única: preparar e encaminhar materiais do planejamento para o módulo Tarefas. Ele não mantém um segundo fluxo operacional.

- A janela separada `Preparar material` e o botão `Editar` foram retirados desse caminho.
- Cada material abre na própria lista e permite editar título, tipo, número, orientações para produção, roteiro ou texto, legenda, canais e primeiro passo.
- Criação e postagem continuam disponíveis como atalhos de data na linha do material.
- Antes de virar tarefa, os canais podem ser escolhidos rapidamente no planejamento. Depois do envio, publicações, responsáveis por canal, status e comprovações passam a ser controlados dentro da tarefa.
- `Enviar para A Fazer` é a ação que cria e vincula a tarefa. Abrir, fechar ou editar o material não cria demanda operacional.
- `Novo material` cria somente um rascunho no plano e já abre seus campos na lista.
- `Ler plano com IA` apresenta uma revisão editável antes de adicionar qualquer material. A revisão mostra o texto completo identificado, separa orientações, roteiro ou texto e legenda, permite corrigir canais e datas e mantém a nomenclatura `[Cliente] Tipo Número - Nome`.
- Datas explícitas do documento são reconhecidas em formatos numéricos e por extenso. A numeração é única por tipo de material, mesmo quando o texto original repete um número.

Validação executada somente no staging:

- O plano real `Aniversário Tunas`, da Maxifarma, foi lido pela IA sem gravar dados.
- A revisão encontrou quatro Reels, preservou o texto completo, numerou de 01 a 04, marcou Instagram e identificou as postagens em 05/09/2026 e 15/09/2026.
- O prazo de criação permaneceu vazio porque o documento não fornecia essa data explicitamente.
- A tela foi deixada aberta para conferência, sem clicar em `Adicionar 4 materiais`; nenhuma tarefa ou material foi criado no teste.
- Doze verificações do planejamento passaram após os últimos ajustes. As suítes focadas de vínculo com tarefas, roundtrip de materiais, publicações por canal e texto formatado também passaram.
- O build final e o backup anterior à mudança foram verificados.

Build de staging: `assets/index.5cd97d4c.js`, `assets/index.2356ad03.css` e `assets/projectsAiCompletion.59a504a3.js`. Backup: `/opt/planeje-staging/private/20260915T230500Z-material-review`. Produção `72.60.14.109` não foi alterada.

### Simplificação após o teste de uso

As duas telas foram reduzidas depois que a revisão completa se mostrou confusa.

- A revisão da IA agora abre como uma lista compacta. Cada linha mostra tipo, número, título, prévia do texto, canais e postagem; somente `Revisar` abre os campos daquele material.
- Uma sugestão pode ser retirada individualmente antes de adicionar as demais ao plano.
- O texto encontrado continua editável, enquanto os campos que não vieram do documento ficam recolhidos em `Adicionar outros campos`.
- Na lista principal, título completo, canais e primeiro passo deixaram de aparecer novamente dentro do material aberto.
- O material aberto mostra apenas os campos preenchidos. Roteiro e legenda vazios permanecem recolhidos.
- Datas, canais e primeiro passo continuam nos atalhos da linha. O botão `Enviar para A Fazer` permanece como único ponto de criação da tarefa.

A nova lista foi conferida visualmente no projeto Maxifarma com quatro materiais já existentes. Nenhum registro foi alterado durante a validação. As cinco suítes focadas passaram novamente e não surgiram erros no build final de staging.

Build final: `assets/index.acbe0f16.js`, `assets/index.83c4a0a8.css` e `assets/projectsAiCompletion.44ccd1cb.js`. Backup anterior ao refinamento: `/opt/planeje-staging/private/20260915T234200Z-material-review-ux`.

## Detalhe da tarefa e briefing simplificados — 16/09/2026

O detalhe da tarefa foi reorganizado para mostrar primeiro somente o que orienta o trabalho diário.

- Nome, cliente, campanha, tipo, urgência, status, prazo, postagem, responsáveis e `Orientações para execução` formam o conteúdo principal da aba Tarefa.
- Cliente e Campanha ficam lado a lado; Tipo e Nível de urgência ficam na linha seguinte; Status, Data de entrega e Data de postagem ocupam uma única linha.
- O texto da execução deixou de aparecer novamente em um formulário obrigatório de briefing.
- Roteiro, legenda e informações de gravação continuam disponíveis em `Conteúdo separado`, recolhido por padrão e usado somente quando a equipe precisa trabalhar essas partes separadamente.
- `Chamada para ação` e `Referências e links` deixaram de ser campos separados no planejamento, no calendário de materiais e na tarefa. A chamada permanece dentro do roteiro ou da legenda; referências continuam no documento do plano ou nos anexos.
- O antigo grupo recolhido `Organização e datas` foi removido porque seus campos são usados com frequência.
- A geração de copy foi movida para `Ferramentas opcionais`.
- Fluxo, controle da demanda, subtarefas, publicações, automações e vínculo com o planejamento não tiveram suas regras alteradas.
- Os campos antigos continuam preservados no payload; a mudança não removeu nem migrou dados existentes.

Validação executada somente no staging:

- A tarefa real da Toniolo foi aberta com o novo formulário e conferida nos estados recolhido e expandido.
- O roteiro existente continuou disponível em `Conteúdo separado`.
- Nenhum botão de salvar foi acionado e nenhum registro foi modificado.
- Doze verificações específicas de briefing e cobertura passaram, incluindo a comparação RPC com os dados reais.
- As cinco suítes focadas de planejamento, vínculo com tarefas, roundtrip de materiais, publicações por canal e texto formatado passaram, totalizando 39 verificações aprovadas.
- Não surgiram erros no console da nova versão.
- Os arquivos locais e implantados possuem os mesmos SHA-256.

Build de staging: `assets/index.f95750ac.js`, `assets/index.a231cfc5.css` e `assets/projectsAiCompletion.5d19d718.js`. Backups: `/opt/planeje-staging/private/20260916T030000Z-task-detail-simplification` e `/opt/planeje-staging/private/20260916T031500Z-task-detail-field-cleanup`. Produção `72.60.14.109` não foi alterada.

O diagnóstico dos atrasos ficou separado desta entrega para evitar mudar regras operacionais junto com a simplificação visual. A próxima rodada está descrita em `outputs/plano-prazos-etapas-publicacoes-2026-09-16.md`: prazo de produção encerra na entrega do material, a etapa atual recebe SLA próprio e cada canal usa sua data de publicação.
