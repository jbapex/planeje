# Atlas como gerente da agência: auditoria integrada de 28/10/2026

## Resultado e escopo

O Atlas já possui seis especialistas executáveis, leitura de fontes e acompanhamento interno. Ainda não opera como um gerente único desde o pedido até a entrega comprovada: o chat pessoal, o robô operacional e o leitor automático de grupos usam caminhos diferentes; o retorno da equipe não retoma toda a investigação; partes importantes do planejamento e dos resultados não chegam aos leitores.

Esta etapa reúne auditoria de código, reproduções locais com dados fictícios e consultas agregadas somente leitura na VPS. Não alterou código do produto, banco, vínculos, orçamento, workers ou publicação; não consumiu IA nem enviou mensagens reais. A proposta abaixo é recomendação de direção, não implementação aprovada nem aceite de produção.

Objetivo informado por Josias: deixar de depender da própria memória para lembrar pedidos, cobrar a equipe e descobrir atrasos. O gerente deve consultar fontes e especialistas, esclarecer só o que falta, acompanhar a execução oficial, conferir entrega e resultados e aprender contexto durável com fonte/data. O responsável interno da conta é o primeiro contato operacional; Josias recebe decisões e lacunas que realmente dependam dele.

## Base conferida

- Fotografia agregada da VPS: **28/10/2026, 18h16 de São Paulo** (`21:16:48 UTC`). Evidência sanitizada: [JSON](../evidencias/atlas-gerente-integral-auditoria-2026-10-28.json).
- Frontend vigente confirmado: `rastreamento-google-report-20261028-01/candidate`, 1.778 fontes, HTML servido igual ao registro de publicação. A aba Google foi publicada às 18h12; isso não adicionou automaticamente um leitor Google ao Atlas.
- Cinco serviços Atlas ativos. Central/eventos/escritório/demandas usam a candidata `atlas-learning-20261028-02`; equipe usa `atlas-context-20261028-01`.
- `atlasManager.js` e Edge `atlas-chat` locais coincidem com o payload central publicado; gerente/servidor Python coincidem com a release operacional das 17h01.
- `atlasManagerContext.js` e `atlasContext.js` locais contêm alterações concorrentes de consultoria/documentos além daquele payload. Não promover os arquivos inteiros sem reconciliar essas diferenças.
- Graphify de 17/10 foi usado apenas para localização determinística. Relações relevantes foram relidas no código atual; o grafo não certifica frescor.

A continuidade de publicação está em [Atlas 17h01](atlas-excecoes-contexto-producao-2026-10-28.md) e [Google 18h12](rastreamento-relatorios-google-producao-2026-10-28.md). O caso anterior de grupo sem vínculo está em [diagnóstico Rio Sul](atlas-rio-sul-consulta-grupo-diagnostico-2026-10-28.md).

## Especialistas existentes e onde trabalham

O catálogo executável está em `supabase/functions/_shared/atlasManager.js`. São chamadas de modelo com fontes permitidas durante uma missão; não seis funcionários digitais continuamente ativos.

| Especialista | Papel existente | Papel necessário no ciclo integrado |
| --- | --- | --- |
| Clientes | Conversas, pedidos, compromissos, reuniões e documentos | Identificar pedido e resposta pertinente, manter contexto e esclarecer lacunas da conta |
| Operação | Tarefas, prazos, publicações, equipe e dependências | Acompanhar a etapa oficial e a entrega, usando comentários, justificativas e evidências atuais |
| Estratégia | Planejamento, documentos e criação | Comparar pedido, escopo/plano aprovado do mês e objetivos do cliente |
| Tráfego | Campanhas e contexto Meta registrado | Consultar fontes de campanhas e propor correções com período e evidência, incluindo Google quando integrado |
| Resultados | CRM, conversas, agendamentos e vendas registrados | Comparar metas e resultados compatíveis, distinguindo informação ausente de resultado zero |
| Financeiro | Mensalidades, previsões e recebimentos | Apontar restrições pertinentes ao dono, preservando acesso financeiro e separação da equipe |

O Atlas central pode delegar, consolidar e abrir uma consulta interna. O executor atual compartilha limites de 16 chamadas de modelo, 24 ferramentas e 150 segundos por missão; a delegação é sequencial. Não há ferramenta desse núcleo para shell, envio ao WhatsApp, edição de campanhas, publicação ou pagamentos. O catálogo de agentes configurável do ApexIA (`ai_agents`) é outro recurso; alterar seu prompt não modifica o catálogo estático executado pelo Atlas.

**Três caminhos atuais:**

1. Chat pessoal/voz → Edge → missão persistida → worker → central e especialistas com `read_context`/`delegate_specialist`.
2. Conversa operacional do robô → gerente Python → contexto previamente montado e uma chamada JSON, sem ferramentas para buscar uma fonte nova ou delegar aos seis especialistas.
3. Eventos dos grupos → snapshot e uma chamada JSON própria → achados e acompanhamento interno. Também não usa o dispatcher de especialistas.

Há persistência, progresso e retorno à conversa. A separação acima explica por que uma capacidade do chat pessoal não aparece automaticamente na conversa da tarefa. Não basta instruir o modelo a “ser mais inteligente”.

## Fotografia operacional: fatos e limites da leitura

| Medida | Resultado observado | Interpretação permitida |
| --- | --- | --- |
| Clientes selecionados nos eventos | 24 | Universo configurado, não toda a carteira da agência |
| Com grupo canonicamente vinculado | 17 de 24 | Sete precisam de conferência de vínculo; nome parecido não autoriza associação |
| Com responsável interno resolvido | 23 de 24 | Um não foi resolvido pela função atual de conta |
| Com escopo mensal estruturado de outubro | 0 de 24 | Ausência em `client_monthly_scopes`; não prova ausência de contrato ou planejamento em outra fonte |
| Com período de projeto alcançando outubro no recorte SQL | 12 de 24 | Cadastro de período; não certifica plano aprovado ou todo planejamento legado |
| Missões centrais criadas nos últimos sete dias | 0 | Não houve registros recentes em `atlas_jobs` nesse recorte; não prova que nunca foram usadas |
| Acompanhamentos `followup` aguardando resposta | 85 | Threads operacionais abertas; não são 85 pedidos novos do dia |
| Acompanhamentos em conferência de entrega | 25 | Todos sem próxima revisão; revisão humana pode ser legítima, mas precisa de critério e responsável visíveis |
| Acompanhamentos `waiting_review` | 6 | Quatro sem próxima revisão; merecem reconciliação, sem encerrar em massa |
| Pedidos `intake` aguardando resposta | 15 | Threads distintas dos followups |
| Eventos em espera por orçamento | 16 | Estados retidos na fila consultada, não necessariamente criados hoje |
| Uso diário registrado/estimado | 993.763 / 1.000.000 tokens | Cerca de 99,4% do teto usado, sem reserva naquele momento; teto preservado |
| Memórias ativas | 59 do tipo `rule` | Não demonstram aprendizado novo automático; não foram observadas entradas `fact`/`pattern` nesse agregado |

A fila retida também continha 125 estados `blocked`, 353 `completed`, 1 `error`, 7 `queued` e 728 `superseded`. São registros históricos de jobs, não uma contagem de demandas atuais perdidas. Esta auditoria não classificou individualmente todas as causas desses bloqueios. Os serviços ativos não comprovam que o objetivo de cada cliente foi entregue.

## Lacunas confirmadas no código

### 1. Coordenação não compartilhada e conclusão sem exigência de evidência

O robô operacional não oferece `read_context` ou delegação (`scripts/atlas-team-pilot/manager.py`, função `reply`). Já `runAtlasMission` aceita resposta final sem nenhuma leitura. Reprodução com modelo fictício retornou “Tudo em dia.”, zero ferramentas e estado concluído. Isso prova uma lacuna de contrato, não a frequência desse comportamento em produção.

O fallback de investigação também deixa de criar uma missão quando existe outra missão queued/running, mesmo de outro assunto. A consulta interna aceita como prova qualquer fonte disponível do cliente e o emissor não recebe o texto estruturado da pergunta, período e recorte necessários; a reprodução mostrou perda de detalhe.

**Direção:** compartilhar o núcleo de investigação entre entradas, conservar origem/objetivo e exigir evidência pertinente ou motivo verificável de indisponibilidade. Uma consulta da equipe deve continuar restrita ao cliente/assunto e conhecimento compartilhado; nunca herdar o leitor pessoal irrestrito nem a memória privada do dono.

### 2. Fontes importantes não chegam aos especialistas

- `client_monthly_scopes` não é lido pelos readers Atlas.
- O planejamento principal salvo em `campaign_plans.contexto_ia` não está na seleção de `plans`.
- O reader limita projetos recentes sem seleção consistente pelo mês solicitado. O monitor compara mês inicial e pode acusar falta de plano para projeto setembro–novembro em outubro; reprodução local confirmou.
- O leitor pessoal de tarefas é mais raso que `private.atlas_task_record`, já usado pelo robô operacional. Há detalhamento existente a reaproveitar.
- Resultados são amostra do CRM; tráfego é snapshot Meta. O Atlas não lê os relatórios Google existentes, nem um indicador unificado de saúde do cliente.
- `scrubAtlasData` corta arrays em 80, mas a carteira pode continuar marcada como completa. Fixture com 81 clientes produziu 80 registros e `complete:true`.

**Direção:** índice pequeno por cliente/mês com IDs, fontes, versões, cobertura e metas; aprofundamento sob demanda. Reusar escopo, plano, Tarefas, publicações e relatórios existentes. Ausência/falha/recorte parcial não vira zero nem “não existe”. Não enviar todo o histórico e todos os planos em cada pergunta.

### 3. Consulta responde, mas o objetivo não retoma automaticamente

`atlas_manager_sync_consults` devolve o relato e pode marcar a missão analítica como concluída quando a tarefa é organizada ou a informação chega. Não executa novamente os especialistas para verificar o objetivo. O acompanhamento oficial pode continuar em outro thread; essas duas conclusões não são equivalentes.

A consulta explícita devolve o pai para `waiting_review` sem data; o plano preserva essa pausa e o scan ignora esse caso. Entrega vai a `delivery_review` com revisão humana, também sem prazo. O sistema não verifica automaticamente qualidade do conteúdo, publicação externa atual ou impacto comercial.

**Direção:** retorno humano e mudança material devem gerar nova conferência durável no mesmo assunto. Distinguir informação obtida, tarefa organizada, execução acompanhada e entrega conferida. Definir quem verifica o quê e quando; preservar decisões humanas e não inventar conclusão em Tarefas.

### 4. WhatsApp existe, mas falta busca no chat e há lacunas de atualização

O leitor automático usa grupos explicitamente vinculados, recebidas/enviadas e transcrições. O chat operacional não possui busca sob demanda no grupo. No caso Rio Sul, havia ainda ausência de vínculo canônico; são falhas distintas.

`Engine.sources_current` revalida mensagens incluídas no snapshot, mas não detecta uma mensagem nova só pela mudança da cabeça do grupo. Fixture confirmou que editar mensagem incluída invalida; adicionar nova cabeça não invalida. O bridge especializado de aprovação possui guarda própria mais forte; não generalizar a falha para ele.

Áudio definitivamente `unavailable` permanece entre pendências de áudio e pode bloquear o job sem saída específica de esclarecimento.

**Direção:** leitura autorizada comum ao chat e aos eventos; atualidade também pelo conjunto/cabeça da fonte. Tratar transcrição pendente e falha definitiva separadamente, esclarecendo só o trecho necessário sem congelar assuntos independentes.

### 5. Saúde e aprendizado precisam demonstrar utilidade

O mecanismo de fatos, padrões e regras, fonte/data, correção e revogação já existe. O agregado atual não demonstra que o ciclo de aprendizagem observada foi efetivamente usado. Não criar outra memória nem salvar status volátil como regra.

Saúde deve apresentar separadamente entrega, relacionamento e resultado: prazo/impedimento; pedido sem retorno; meta e resultado no período. Um atraso isolado não prova mau desempenho comercial; publicação registrada não prova resultado de campanha. Recomendações precisam de objetivo, evidência, ação proposta e data de revisão.

## Direção recomendada e ordem de trabalho

Reaproveitar central, seis especialistas, readers, jobs, threads, leases e writers. **Tarefas continua sendo a execução oficial.** Não criar outro cadastro de responsáveis, status ou conclusão. Não aumentar o teto nem consultar todos os agentes em toda interação.

1. **Conectar investigação e fontes atuais.** Leitor detalhado de tarefa e grupo autorizado disponível a todas as entradas, delegação pertinente, cobertura explícita e guarda de evidência/atualidade. Identificar os sete vínculos e a conta ausente para confirmação cadastral; não corrigir por nome nem presumir ausência de contrato.
2. **Fechar pedido → esclarecimento → execução → conferência.** Retomar o mesmo objetivo após resposta, sem duplicar thread/tarefa ou perguntar novamente o que foi registrado. Acompanhar prazo oficial, retorno prometido, impedimento e nova demanda. Entrega/conferência precisam de critérios e responsável; ficar silencioso quando basta aguardar.
3. **Ligar mês, estratégia e contexto do cliente.** Ler escopo estruturado quando houver, plano principal e revisão aprovada, projetos que abrangem o mês, documentos/reuniões e memórias pertinentes. Perguntar a Josias somente objetivo, preferência, restrição ou novidade que não está em fonte confiável; preservar falta de aprovação quando ausente.
4. **Cuidar de resultados e saúde.** Integrar leitores Meta/Google/CRM por período e cobertura, comparar metas, apontar risco e melhoria, acompanhar decisão e medir efeito. Dados antigos/indisponíveis ficam explícitos. Não executar gasto, publicação ou mensagem externa por uma inferência.

Exemplo desejado: novo pedido em grupo → Clientes consulta a conversa → Operação localiza a tarefa/etapa e os prazos → Estratégia confere plano do mês quando necessário → Atlas esclarece só a lacuna com a conta → resposta retoma a investigação → tarefa oficial segue com executor atual → evidência de entrega é conferida → eventual resultado é revisado no período correto. Josias recebe decisão real ou resumo verificável, sem ser o intermediário de toda cobrança.

Autonomia operacional dentro do escopo já autorizado deve conservar as condições da decisão anterior. Mudança de contrato/verba/regra, destinatário externo ou ação nova de custo continua separada. Não interpretar esta auditoria como autorização de produção ou transporte real.

## Aceitação que deve orientar a implementação

Fixtures isoladas primeiro; depois um ciclo humano real elegível com autorização específica para qualquer IA/contato/publicação necessários. Não usar a equipe real como teste técnico.

1. “Você viu no grupo?” registra leitura pertinente com cliente, mensagem/data e cobertura; vínculo ausente, permissão, falha de transcrição e erro de consulta têm razões distintas. Não declara acesso tentado sem tentativa.
2. Comentário, justificativa, exclusão, responsável atual, link/anexo e publicação oficial já registrados são considerados antes de perguntar. Metadado/link não vira alegação de arquivo aberto ou vídeo assistido.
3. Pedido já respondido, tarefa com prazo futuro e retorno humano ainda válido não geram cobrança repetida. Promessa vencida ou bloqueio relevante produz uma pergunta curta à pessoa certa.
4. Resposta da conta retoma a missão original, preserva fonte/autor/data e encaminha o próximo passo permitido. Organizar tarefa não é entregar o objetivo; retorno humano não é prova externa de publicação.
5. Fonte muda durante análise: nova mensagem, cancelamento, revisão de plano ou atribuição invalida a decisão anterior antes de agir. Reinício/lease vencido não duplica mensagem/tarefa nem perde contabilização.
6. Escopo do mês e plano aprovado são selecionados pelo período/revisão; projeto setembro–novembro atende outubro. Rascunho novo não herda aprovação antiga; ausência de registro estruturado não inventa contrato.
7. Conferência aponta critério, rodada, fonte, responsável e data. Entrega parcial mantém só o que falta; ajustes voltam ao fluxo oficial. Revisão não fica invisivelmente sem dono/retorno.
8. Falha definitiva de áudio preserva a lacuna e permite esclarecer o necessário; teto diário preserva o pedido e mostra espera sem sucesso fictício.
9. Equipe só recebe contexto e assuntos autorizados; dono pode consolidar a agência conforme permissão. Memória privada e dados financeiros não vazam por delegação ou resumo.
10. Meta/Google/CRM usam período, moeda, população e vínculo compatíveis. Sem dado atual ou objetivo, Atlas apresenta o que falta, sem inventar ROAS, venda ou saúde positiva.
11. Fato/padrão aprendido conserva fonte/data e natureza inferida, pode ser corrigido/revogado, e não muda regra/contrato/verba. Medir utilidade por pedidos atendidos, atrasos prevenidos, perguntas evitadas e entregas conferidas, não por quantidade de mensagens.

## Verificação realizada e limites

Três frentes independentes leram os executores, consumidores, migrações e testes. Executaram 35 testes Node e 48 testes Python existentes, todos aprovados; quatro reproduções adicionais demonstraram os gaps de leitura zero, detalhe perdido, missão concorrente e atualidade do grupo, e duas demonstraram corte da carteira e período do projeto. Provedores/leitores das reproduções foram fictícios, sem rede.

O coordenador consultou agregados via transações `BEGIN READ ONLY`, timeout e `ROLLBACK`; conferiu frontend e cwd/estado dos serviços. Somente resultados agregados e metadados operacionais foram retidos na evidência canônica. Relatórios técnicos locais: `.local/atlas-gerente-integral-audit-20261028/{orchestration,operations,client-context}.md`.

Não foi observado nesta etapa um ciclo completo com IA real, retorno de colaborador, verificação externa de conteúdo/publicação e resultado de negócio. Os testes aprovados certificam partes existentes e reproduções dos gaps; não certificam que o gerente integral já funciona. Nenhuma publicação ou aceite de Josias é inferido.
