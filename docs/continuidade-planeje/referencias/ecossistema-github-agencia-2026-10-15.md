# Pesquisa de projetos públicos para a operação e as entregas da agência

Consulta em 15/10/2026, no fuso de São Paulo. Josias mudou o foco da possível instalação do Roast Room para uma pesquisa ampla de projetos públicos que contribuam para a agência. Confirmou prioridade em **operação, prazos, qualidade e menor dependência dele**, junto de **tráfego, criação e resultados dos clientes**. Nenhum repositório foi aprovado para adoção ou publicação nesta etapa.

A recomendação é fortalecer o fluxo existente do Planeje com componentes que resolvam lacunas demonstradas. Os melhores candidatos encontrados ajudam a testar campanhas, revisar materiais, identificar rotinas interrompidas e avaliar o Atlas. O benefício depende do processo, dos responsáveis e da medição do resultado do piloto. Uma coleção de aplicativos não garante uma agência funcionando bem.

## O que foi pesquisado

Triagem de 60 repositórios públicos, cobrindo automação, confiabilidade, qualidade de páginas, criação, revisão de materiais, dados, relatórios, IA, documentos, conhecimento, atendimento e comercial. Foram conferidos README e arquivo de licença dos 60; 58 também tiveram metadados consultados pela API pública do GitHub. Nos outros dois, Formbricks e Roast Room, a API atingiu seu limite e a conferência usou diretamente os documentos oficiais. Não é um levantamento exaustivo de todo o GitHub.

A evidência estruturada registra links, sinais de atividade disponíveis, licença informada e avaliação de aderência. Último push não comprova estabilidade, qualidade nem ausência de vulnerabilidades. As indicações de prioridade e esforço abaixo são julgamento de integração, não afirmações dos mantenedores. Não foram instalados serviços, executados projetos de terceiros ou auditados os recursos atuais da VPS nesta pesquisa.

Também foram consultadas páginas de release de Playwright, Clapshot, Healthchecks, Lighthouse CI e Promptfoo. No Promptfoo, o endereço `releases/latest` levou a uma versão da ação de análise de código, e não à ferramenta CLI inteira. Uma adoção deve fixar a versão correta do componente; esta pesquisa não recomenda instalar uma referência móvel `latest`.

## Base que deve ser aproveitada

O Planeje já tem Clientes, Tarefas, Projetos, documentos com histórico, Rotina semanal, Tráfego, rastreamento, CRM, atendimento, reuniões e financeiro. Atlas tem consulta a fontes, especialistas, memória e missões persistentes. A documentação registra testes, backups e transcrição. A cobertura e a cadência atuais precisam ser verificadas antes de adicionar ferramentas equivalentes.

Tarefas continua sendo a execução oficial. Uma integração deve ligar material, demanda e resultado ao registro existente, preservando responsáveis, etapas, versões, aprovação e histórico. Nova ferramenta de revisão não deve criar uma segunda fila desconectada. A Assessoria integrada continua em teste persistente, com conferência visual e publicação pendentes. A pesquisa não altera as sete fases do programa e não adia automaticamente essa entrega.

## Candidatos com maior relação entre utilidade e esforço

| Necessidade | Candidato e capacidade documentada | Encaixe proposto | Esforço relativo e condição |
| --- | --- | --- | --- |
| Conferir páginas e formulários antes da campanha | [Playwright](https://github.com/microsoft/playwright) testa jornadas em navegadores; [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) compara auditorias técnicas | Verificar página móvel, links, UTMs e formulário em ambiente controlado; registrar evidência junto à demanda | Médio. Definir a jornada e usar destinos fictícios. Não comprova conversão real nem resultado de anúncios. |
| Perceber falhas silenciosas | [Healthchecks](https://github.com/healthchecks/healthchecks) acompanha execuções esperadas; [Uptime Kuma](https://github.com/louislam/uptime-kuma) acompanha disponibilidade | Verificar lacunas na cobertura atual de sincronizações, publicações agendadas e serviços | Baixo a médio. A rotina deve emitir confirmação verdadeira; servidor disponível não prova tarefa executada. Alertas externos exigem escopo próprio. |
| Avaliar a qualidade do Atlas | [Promptfoo](https://github.com/promptfoo/promptfoo) executa avaliações e comparações | Criar casos fictícios para carteira fechada, dados ausentes, reação isolada, período incorreto, cliente errado e recomendação sem fonte | Médio. Reutilizar regressões existentes; definir resultado esperado e consumo. Não há medição feita nesta pesquisa. |
| Conferir arquivos antes da entrega | [FFmpeg](https://github.com/FFmpeg/FFmpeg) processa mídia; [sharp](https://github.com/lovell/sharp) processa imagens | Ler duração, dimensões, formato e outros critérios técnicos do canal; gerar prévias por versão | Médio. Regras de cada canal e escopo devem ser explícitas. Revisão de texto, marca e composição continua necessária. |
| Tornar correção de vídeo objetiva | [Clapshot](https://github.com/elonen/clapshot) oferece anotações, comentários e navegação por quadro | Avaliar com vídeos fictícios e ligar comentários ao material e à tarefa do Planeje | Médio a alto. Projeto de comunidade menor; autenticação por proxy, isolamento entre clientes, versões e experiência móvel precisam ser provados. |
| Ligar ferramentas externas | [Activepieces](https://github.com/activepieces/activepieces) oferece fluxos e conectores | Provar um único evento útil ligado ao Planeje, com repetição segura e erro visível | Médio a alto. Validar conector e edição, manter Tarefas como origem de status e impedir envios em teste. |
| Ler anexos com mais estrutura | [MarkItDown](https://github.com/microsoft/markitdown) converte arquivos; [Docling](https://github.com/docling-project/docling) trata layout, tabelas e OCR | Recuperar conteúdo de documentos autorizados, sempre associado à origem e à versão | Médio. Começar pelos formatos usados; escaneados e tabelas exigem comparação. Texto extraído não deve virar instrução ou memória verdadeira por conta própria. |
| Entender entregas e resultados | [Metabase](https://github.com/metabase/metabase) permite consultas e painéis | Consultar visões revisadas somente de leitura para atrasos, retrabalho e resultado registrado | Médio a alto. Conferir relatórios atuais, acesso por cliente e edição. Informação ausente não equivale a zero. |
| Entender custo e falha de IA | [Langfuse](https://github.com/langfuse/langfuse) reúne rastreamento e avaliações | Identificar consultas, ferramentas, versões e consumo das missões do Atlas | Alto frente a um piloto de avaliações. Só adotar se os registros existentes não responderem ao diagnóstico; definir minimização e acesso aos registros. |
| Medir comportamento nas páginas | [Umami](https://github.com/umami-software/umami) acompanha eventos de sites | Complementar uma lacuna demonstrada de GA4/rastreamento, mantendo ligação com o CRM | Médio. Visita, clique, lead, agendamento e venda devem continuar distintos. |
| Produzir variações com consistência | [Remotion](https://github.com/remotion-dev/remotion) cria vídeos em React | Modelos aprovados de vídeos, formatos e versões para trabalhos repetidos | Médio a alto. Verificar licença própria, volume e tempo de revisão; não é um editor completo pronto para a equipe. |
| Capturar percepção do cliente | [Formbricks](https://github.com/formbricks/formbricks) oferece pesquisas | Feedback após entrega com encaminhamento para quem possa resolver | Médio. Usar apenas se houver processo para tratar respostas; nenhum convite ou pesquisa foi enviado. |

## Sequência proposta para os primeiros pilotos

1. **Conferência do fluxo atual.** Percorrer uma demanda desde o alinhamento até a entrega, aprovação e publicação. Registrar onde falta responsável, prazo, material, evidência ou retorno. Conferir cobertura já existente de testes, monitoramento e backup. Esta etapa pode concluir que a lacuna se resolve no Planeje sem biblioteca nova.
2. **Campanha conferida antes de ir ao ar.** Provar Playwright com Lighthouse CI numa página e formulário controlados, com dados fictícios. A evidência precisa mostrar o destino correto, tratamento das UTMs e resultado do formulário. Falha deve ficar visível antes da liberação humana.
3. **Revisão de uma peça sem ambiguidade.** Provar verificações técnicas com FFmpeg/sharp e avaliar comentários ligados ao tempo no Clapshot. Medir correções repetidas e tempo entre envio e aprovação, mantendo versão e tarefa únicas no Planeje.
4. **Atlas avaliado por casos reais transformados em exemplos fictícios.** Aplicar um conjunto pequeno de regressões com Promptfoo. Comparar evidência, escopo, reconhecimento de dado ausente, tempo e consumo antes de ampliar agentes, conselhos ou automações.
5. **Integrações e relatórios somente para lacunas demonstradas.** Escolher um candidato por necessidade: automação, documento, análise de dados ou telemetria. O piloto deve ter benefício medido, custo de operação conhecido e uma forma clara de desativação.

Esta ordem é proposta de trabalho, não autorização para implantar os repositórios. A VPS de produção indicada por Josias é o destino desejado se houver uma futura instalação, e não transforma esta pesquisa em autorização de publicação. O acompanhamento automático do Atlas continua pausado.

## Como avaliar o ganho para a agência

| Resultado esperado | Medição inicial sugerida | Evidência necessária |
| --- | --- | --- |
| Entregas previsíveis | Percentual entregue no prazo e tempo por etapa | Prazo de referência, chegada à etapa e entrega real; separar espera do cliente |
| Menos retrabalho | Rodadas de correção e motivo por peça | Versão, comentário, autor e resolução |
| Campanhas conferidas | Falhas detectadas antes da liberação e recorrência | Jornada testada, arquivo/URL, data e correção confirmada |
| Menos dependência de Josias | Intervenções necessárias por demanda | Registro do impedimento e de quem tinha condição de resolver |
| Resultado comercial confiável | Lead, agendamento, comparecimento e venda no mesmo recorte | Origem, data, identificação compatível e preenchimento do CRM |
| Atlas útil | Acerto dos casos, uso de fonte, tempo e consumo | Resultado esperado, resposta e consultas realizadas |
| Recuperação operacional | Tempo medido em restauração isolada | Backup consistente, arquivos necessários e verificação de integridade |

As metas numéricas devem partir de uma linha de base observada. A pesquisa não inventa percentuais de economia, prazo de implantação, retorno financeiro ou capacidade livre da VPS.

## Escolhas que não priorizaria agora

Um novo CRM como Twenty, ERP como ERPNext, central de atendimento como Chatwoot ou publicador como Postiz pode ser útil em outro contexto. No Planeje, a hipótese inicial é sobreposição, migração e fragmentação de histórico. A adoção precisaria demonstrar uma capacidade necessária que o fluxo atual não entrega.

Meridian e Robyn são referências de modelagem de mix de marketing e dependem de dados e desenho de medição apropriados. Não resolvem por instalação os campos ausentes do CRM. Roast Room permanece como referência de debate de decisões e abaixo das prioridades de operação e entrega.

## Licença e manutenção mudam a seleção

O arquivo de licença foi consultado além do rótulo da API. Activepieces e Langfuse têm núcleo MIT e partes comerciais. n8n usa Sustainable Use License. Outline usa BSL 1.1. Remotion tem licença própria. Phoenix e Soda apresentam Elastic License 2.0 na fonte consultada. Outros projetos têm AGPL, GPL ou combinações por componente. Esses rótulos descrevem as fontes; não são uma conclusão jurídica sobre uma futura integração específica.

Antes de uma adoção concreta, a versão, a edição e os componentes efetivamente usados precisam ser conferidos. Código público não assegura que toda funcionalidade anunciada esteja na edição comunitária. Bibliotecas de processamento e modelos também podem ter termos próprios. [Activepieces](https://github.com/activepieces/activepieces/blob/main/LICENSE), [Langfuse](https://github.com/langfuse/langfuse/blob/main/LICENSE), [n8n](https://github.com/n8n-io/n8n/blob/master/LICENSE.md), [Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

As consultas também encontraram mudanças de endereço. A API redirecionou dbt-core para dbt-labs/dbt, Great Expectations para fivetran/great_expectations, Ragas para vibrantlabsai/ragas e cal.com para calcom/cal.diy. O README de BookStack informa desenvolvimento no Codeberg. A matriz usa os nomes canônicos recebidos e mantém as referências consultadas na evidência.

## Matriz dos 60 repositórios

As classificações são propostas relativas ao contexto atual. Alternativa significa comparar com outro candidato da mesma função, e não implantar ambos. Candidato a piloto não significa validado tecnicamente.


### Qualidade de entrega

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [microsoft/playwright](https://github.com/microsoft/playwright) | Candidato a piloto | Apache-2.0 | Testar formulário, links, navegação e jornadas críticas com dados fictícios. |
| [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse) | Componente do piloto | Apache-2.0 | Auditar desempenho, acessibilidade e boas práticas técnicas das páginas de campanhas. |
| [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) | Candidato a piloto | Apache-2.0 | Comparar auditorias entre versões; pontuação técnica não mede conversões comerciais. |

### Revisão e entrega

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [PicPeak/picpeak](https://github.com/PicPeak/picpeak) | Condicional | MIT | Galerias e seleção de fotos; provar necessidade além do Drive e documentos existentes. |
| [elonen/clapshot](https://github.com/elonen/clapshot) | Candidato a piloto | GPL-2.0 | Comentários e anotações ligados ao tempo do vídeo; autenticação, isolamento e integração pendentes. |
| [arita-yuto/video-review](https://github.com/arita-yuto/video-review) | Alternativa experimental | MIT | Revisão de versões com foco também em jogos; comunidade menor e adequação ainda não testada. |

### Criação

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | Condicional | Licença própria Remotion | Vídeos por modelos reutilizáveis; medir volume, revisão humana e condições comerciais. |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | Candidato a piloto | LGPL-2.1+; varia com componentes e build | Ler especificações, preparar prévias e executar verificações técnicas de mídia. |
| [imgproxy/imgproxy](https://github.com/imgproxy/imgproxy) | Alternativa | Apache-2.0 no núcleo; Pro separado | Gerar imagens e miniaturas por serviço; comparar com uma biblioteca integrada. |
| [lovell/sharp](https://github.com/lovell/sharp) | Candidato a piloto | Apache-2.0 | Conferir e adaptar imagens; não substitui revisão de composição, texto ou marca. |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | Condicional | BSD-2-Clause no código; modelos têm termos próprios | Legendas com tempo por palavra e diarização; comparar qualidade, hardware e transcrição existente. |
| [openai/whisper](https://github.com/openai/whisper) | Alternativa | MIT | Transcrição local como alternativa; Atlas e reuniões já possuem caminhos de transcrição. |

### Atlas

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | Condicional | MIT no núcleo; enterprise comercial | Rastrear chamadas, ferramentas, custos e avaliações; requer instrumentação e operação do serviço. |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | Candidato a piloto | MIT | Comparar versões do Atlas por casos controlados, evidência, escopo e falhas conhecidas. |
| [Arize-ai/phoenix](https://github.com/Arize-ai/phoenix) | Alternativa | Elastic License 2.0 | Alternativa de observabilidade de IA; conferir condições próprias da licença. |
| [vibrantlabsai/ragas](https://github.com/vibrantlabsai/ragas) | Adiar | Apache-2.0 | Avaliar recuperação de documentos quando houver base e conjunto de referência adequados. |

### Confiabilidade

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma) | Piloto se houver lacuna | MIT | Verificar disponibilidade dos serviços e certificados; não comprova a entrega da equipe. |
| [healthchecks/healthchecks](https://github.com/healthchecks/healthchecks) | Piloto se houver lacuna | BSD-3-Clause | Detectar rotina que deixou de executar, por confirmação de início e término. |
| [restic/restic](https://github.com/restic/restic) | Condicional | BSD-2-Clause | Complementar backups existentes somente com recuperação isolada e backup consistente do banco. |
| [grafana/grafana](https://github.com/grafana/grafana) | Adiar | AGPL-3.0; edições comerciais separadas | Visibilidade técnica ampla; dimensionar necessidade antes de instalar outro conjunto de serviços. |
| [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) | Condicional | Apache-2.0 | Instrumentar duração e falhas; precisa de um destino para consultar a telemetria. |
| [Infisical/infisical](https://github.com/Infisical/infisical) | Condicional | MIT no núcleo; enterprise comercial | Centralizar segredos se a gestão atual exigir; adiciona um serviço crítico para manter. |
| [crowdsecurity/crowdsec](https://github.com/crowdsecurity/crowdsec) | Condicional | MIT | Defesa da infraestrutura conforme diagnóstico; não substitui autorização e isolamento no aplicativo. |

### Automação

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [activepieces/activepieces](https://github.com/activepieces/activepieces) | Condicional | MIT no núcleo; enterprise comercial | Conectar ferramentas externas por eventos, mantendo a tarefa oficial no Planeje. |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | Alternativa | Sustainable Use License; enterprise separada | Alternativa de automação; conferir edição, conectores e condições do uso pretendido. |
| [windmill-labs/windmill](https://github.com/windmill-labs/windmill) | Alternativa | AGPL e Apache por componente; enterprise comercial | Executar scripts e fluxos; exige manutenção técnica e compete com outros orquestradores. |
| [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) | Alternativa | Apache-2.0 | Trabalhos longos e tentativas; avaliar antes de substituir o worker persistente existente. |
| [inngest/inngest](https://github.com/inngest/inngest) | Alternativa | SSPL com licença futura Apache conforme fonte | Orquestração durável; verificar versão e termos antes de comparar com worker existente. |
| [timgit/pg-boss](https://github.com/timgit/pg-boss) | Condicional | MIT | Fila Node sobre PostgreSQL; introduzir apenas se as limitações atuais forem demonstradas. |

### Documentos

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [docling-project/docling](https://github.com/docling-project/docling) | Condicional | MIT no código; componentes e modelos próprios | Extrair estrutura, tabelas e OCR; medir qualidade e processamento nos documentos usados. |
| [microsoft/markitdown](https://github.com/microsoft/markitdown) | Condicional | MIT | Converter anexos para texto estruturado; preservar versão, origem e acesso do documento. |
| [Unstructured-IO/unstructured](https://github.com/Unstructured-IO/unstructured) | Alternativa | Apache-2.0; plataforma comercial separada | Processamento documental mais amplo; comparar necessidade e dependências com as opções menores. |

### Resultados

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [metabase/metabase](https://github.com/metabase/metabase) | Condicional | AGPL no núcleo; enterprise comercial | Analisar operação e resultados em visões autorizadas somente de leitura. |
| [apache/superset](https://github.com/apache/superset) | Alternativa | Apache-2.0 | BI mais amplo; evitar duplicar relatórios existentes ou ampliar infraestrutura sem necessidade. |
| [evidence-dev/evidence](https://github.com/evidence-dev/evidence) | Alternativa | MIT | Relatórios definidos em código; depende de consultas confiáveis e manutenção técnica. |
| [umami-software/umami](https://github.com/umami-software/umami) | Condicional | MIT | Medir eventos de sites; conferir lacunas de GA4 e rastreamento antes de acrescentar coleta. |
| [plausible/analytics](https://github.com/plausible/analytics) | Alternativa | AGPL-3.0 | Alternativa de análise de sites; escolher uma solução conforme a lacuna real. |
| [matomo-org/matomo](https://github.com/matomo-org/matomo) | Alternativa | GPL-3.0; extensões podem ter termos próprios | Análise de sites mais ampla; implantação e manutenção precisam se justificar. |
| [google/meridian](https://github.com/google/meridian) | Adiar | Apache-2.0 | Modelagem de mix de marketing exige séries históricas e desenho de medição adequados. |
| [facebookexperimental/Robyn](https://github.com/facebookexperimental/Robyn) | Adiar | MIT | Modelagem de mix não substitui atribuição e CRM; validar adequação e dados disponíveis. |

### Qualidade dos dados

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [dbt-labs/dbt](https://github.com/dbt-labs/dbt) | Condicional | Apache-2.0 no repositório consultado | Organizar transformações e testes quando a complexidade justificar além das regras SQL atuais. |
| [fivetran/great_expectations](https://github.com/fivetran/great_expectations) | Condicional | Apache-2.0 | Conferir integridade dos dados; regras simples podem começar no banco existente. |
| [sodadata/soda-core](https://github.com/sodadata/soda-core) | Alternativa | Elastic License 2.0 na fonte consultada | Contratos de dados; comparar licença e esforço antes da escolha. |

### Conhecimento

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [docmost/docmost](https://github.com/docmost/docmost) | Condicional | AGPL-3.0; conferir edição enterprise | Procedimentos da equipe se o armazenamento atual não resolver autoria, busca e atualização. |
| [BookStackApp/BookStack](https://github.com/BookStackApp/BookStack) | Referência | MIT | README informa desenvolvimento no Codeberg; usar o endereço canônico atual em nova avaliação. |
| [outline/outline](https://github.com/outline/outline) | Alternativa | Business Source License 1.1 | Base de conhecimento com licença própria; conferir escopo antes de incorporar ao produto. |

### Relacionamento

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [formbricks/formbricks](https://github.com/formbricks/formbricks) | Condicional | AGPL-3.0; conferir edição e componentes | Coletar feedback estruturado do cliente quando houver processo para tratar as respostas. |

### Pesquisa

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | Condicional | AGPL-3.0; serviço hospedado separado | Extrair sites para pesquisa; não é integração pronta com fontes privadas de anúncios. |
| [scrapy/scrapy](https://github.com/scrapy/scrapy) | Alternativa | BSD-3-Clause | Coleta programática de sites quando houver objetivo, fontes e manutenção definidos. |

### Publicação

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | Adiar | AGPL-3.0 | Pode ampliar canais, mas sobrepõe calendário e publicação já existentes no Planeje. |
| [inovector/mixpost](https://github.com/inovector/mixpost) | Alternativa | MIT no repositório; Pro e Enterprise separados | Comparar funcionalidades por edição e canais realmente necessários antes de adicionar outro publicador. |

### Atendimento

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | Adiar | MIT no núcleo; enterprise comercial | Atendimento omnicanal sobrepõe Conversas e Atendimento já existentes; avaliar só lacuna específica. |

### Comercial

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [documenso/documenso](https://github.com/documenso/documenso) | Condicional | AGPL-3.0; conferir componentes e edição | Assinatura de contratos se houver gargalo comprovado; preservar documento e histórico do cliente. |
| [docusealco/docuseal](https://github.com/docusealco/docuseal) | Alternativa | AGPL-3.0; recursos comerciais separados | Alternativa de assinatura; escolher conforme fluxo, requisitos e integração necessários. |
| [twentyhq/twenty](https://github.com/twentyhq/twenty) | Adiar | AGPL predominante; MIT e enterprise por componente | Novo CRM traria migração e duplicação de cadastros já atendidos pelo Planeje. |
| [calcom/cal.diy](https://github.com/calcom/cal.diy) | Adiar | MIT na fonte canônica consultada | Agenda externa só se o fluxo de reuniões existente deixar uma lacuna concreta. |

### Gestão

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [frappe/erpnext](https://github.com/frappe/erpnext) | Adiar | GPL-3.0 | ERP amplo exige projeto próprio; não é complemento pequeno para a operação atual. |
| [OCA/contract](https://github.com/OCA/contract) | Adiar | AGPL-3.0; conferir cada módulo | Módulos do ecossistema Odoo exigem a plataforma; pouca aderência como complemento ao Planeje. |
| [OCA/server-ux](https://github.com/OCA/server-ux) | Adiar | AGPL-3.0; conferir cada módulo | Extensões Odoo sem benefício direto demonstrado para o sistema e fluxo atuais. |

### Estratégia

| Projeto | Avaliação | Licença observada | Contribuição e condição |
| --- | --- | --- | --- |
| [nateherkai/roast-room](https://github.com/nateherkai/roast-room) | Adiar | MIT | Referência de debate de decisões; prioridade abaixo de operação, qualidade e medição. |

## Evidência e estado da pesquisa

[Evidência estruturada](../evidencias/ecossistema-github-agencia-2026-10-15.json) · [Manifesto da pesquisa](../evidencias/releases/ecossistema-github-pesquisa-2026-10-15.json). Pesquisa concluída; escolha, piloto, aceite e publicação são etapas futuras distintas. Nenhuma VPS, aplicação, tarefa, banco, canal externo ou configuração do Atlas foi alterada.
