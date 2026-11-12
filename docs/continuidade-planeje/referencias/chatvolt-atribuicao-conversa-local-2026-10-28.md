# Chatvolt: atribuição por conversa — reparo local de 28/10/2026

## Diagnóstico e resultado

O relato de contatos vindos do site sem UTMs motivou uma leitura produtiva restrita ao cliente e às conversas informadas. A conferência inicial somente por telefone era incompleta: eventos iniciais sem telefone também precisavam ser examinados pelo conversationId. O leitor já recuperava essas mensagens para exibição; o ingresso não associava seu código de clique ao telefone observado em outro evento da mesma conversa.

Foram distinguidos três casos, sem armazenar contatos, payloads ou identificadores publicitários nesta documentação:

| Caso | Evidência | Conclusão permitida |
| --- | --- | --- |
| A | Mensagem inicial sem telefone com código válido; evento seguinte identifica telefone; clique exato tem GCLID e UTMs | Falha de associação no Planeje; dados do clique existem |
| B | Mesmo encadeamento, mas clique exato sem GCLID e UTMs | Origem site; não atribuir o clique pago mais próximo por horário |
| C | Mensagens mencionam site, sem código de clique | Não há prova para atribuição individual ao Google Ads |

O link ativo tem origem padrão site e identificação invisível habilitada; não fornece UTMs padrão. A inspeção pública do site e do GTM confirmou a decoração dos botões pelo script existente. Tray, GTM, destinos, contas e configuração do link não foram alterados. Esta inspeção não certifica todos os navegadores, visitas ou bloqueios de rastreamento.

## Contrato implementado localmente

Novo helper especializado lookupChatvoltConversationAttribution, chamado apenas pelo crm-ingress-webhook. Usa cliente autenticado, source Chatvolt, organização e conversa exatos, canal WhatsApp, um telefone único com JID coerente e um código válido de mensagem recebida sem telefone. Trata código antes ou depois do telefone. Não infere identidade por nome, frase ou horário.

A consulta projeta somente os campos necessários do JSON, não o payload integral. Resultado vazio, erro, organização/canal divergentes, telefone inconsistente, mais de um telefone/código ou recorte de 201 registros interrompem a recuperação. O nome de exibição usado como fallback vem apenas de evento com telefone/JID já validados; nome conhecido no contato prevalece para a mensagem anônima. O claim de clique existente continua validando cliente, telefone e concorrência; não foi substituído por atualização aberta. Se outro evento vencer o claim atômico, o helper compartilhado relê apenas o mesmo clique/cliente/código/telefone, exigindo matched_at. Essa leitura recupera o resultado do mesmo remetente; outro dono ou erro continua sem correspondência. Os três consumidores existentes (crm, Uazapi e Apicebot) mantêm assinatura e guardas CTWA; não há outro UPDATE de claim.

Atribuição anterior e CTWA prevalecem. O contato é lido novamente depois do claim, preservando uma atribuição registrada por outro evento nesse intervalo. Falha na leitura de um contato recuperado interrompe upsert, conversão e automação desse evento; o log original permanece. Nome e foto conhecidos são preservados quando a mensagem recuperada não os informa.

Uma mensagem antes anônima, agora com vínculo comprovado, passa pelo inbox, criação de lead, conversão e automação já existentes. Não foi criado outro executor. Portanto uma futura publicação poderá acionar os fluxos configurados quando essa mensagem passar a ser identificada; publicar não autoriza replay histórico nem envio publicitário de teste.

## Verificação e revisão

Baseline exato dos arquivos previamente sujos preservado em .local/chatvolt-conversation-attribution-20261028/baseline e baseline.json; comparação não usa HEAD como estado entregue. Testes RED reproduziram a ausência do helper, a perda de contato em erro de leitura e a sobrescrita de CTWA concorrente, a perda de atribuição em eventos simultâneos e o nome apagado na ordem inversa. Os cenários passaram após o reparo.

Comandos dirigidos, com transportes isolados:

- node scripts/chatvoltConversationAttribution.test.mjs: Supabase JS instalado, filtros/projeção, ambas as ordens, identidade, conflitos, truncamento e erro.
- node scripts/miniCrmMessageWebhooks.test.mjs: 53 casos do handler real compilado; inclui preservação de CTWA/nome/foto, erros nas duas leituras e concorrência nos caminhos direto e recuperado.
- node scripts/rastreamentoTrackableClickClaim.test.mjs: Supabase JS instalado, claim atômico, releitura do mesmo dono, cliente/código/dono divergentes e falhas de leitura/escrita.
- node scripts/rastreamentoMessageAttribution.test.mjs.
- node scripts/chatvoltIngress.test.mjs.
- node scripts/chatvoltHistoryRecovery.test.mjs.
- node scripts/rastreamentoHiddenMatchCode.test.mjs.
- node scripts/rastreamentoTrackableLink.test.mjs.

O fetch da fixture da conversa aceita somente GET em fixture.invalid; a fixture do claim aceita apenas GET/PATCH no mesmo destino fictício; conversões e executor no harness são substituídos na fronteira. Nenhum webhook, clique produtivo ou envio Google foi usado para testar. Context7 consultado para JSON/PostgREST no Supabase JS v2: a documentação disponível não fixa a versão 2.30.0 instalada; a requisição dessa versão foi verificada na fixture. Graphify determinístico serviu de orientação; seu grafo anterior não cobre o helper novo, conferido diretamente no código.

Revisão sensível independente retestou dois P1 encontrados durante a implementação: erro de leitura na identidade recuperada e perda de first touch por leitura anterior ao claim. Ambos corrigidos; a disputa de claim entre eventos simultâneos e a preservação de nome também foram incluídas no reteste final. Revisão encerrada sem achados acionáveis abertos; 20 pares simultâneos independentes e 53 casos do handler passaram. npm run check final concluiu com saída zero, mantendo avisos legados de lint. Evidência, hashes, check e relatório privado na [evidência local](../evidencias/chatvolt-atribuicao-conversa-local-2026-10-28.json).

## Estado e limites

IMPLEMENTADO LOCALMENTE; não publicado, sem migração, backfill, replay, edição de contato produtivo ou envio Google. O relato atual autoriza a análise e o reparo local; publicação exige autorização específica conforme AGENTS.md. Contatos já recebidos não foram reparados por esta entrega.

O reparo não introduz serialização global de todos os webhooks nem certifica corridas preexistentes com outras integrações. O índice observado cobre cliente e data, não a expressão JSON de conversa/organização. O teto limita o resultado, não comprova custo constante em clientes de grande volume; não foi executado EXPLAIN ANALYZE produtivo nem criada migração por hipótese. O vínculo depende da consistência dos identificadores enviados pelo Chatvolt e de haver os dois eventos necessários no log. Sem código ou parâmetros no clique original, a correção não cria GCLID/UTMs retroativamente. Validação produtiva e aceite de Josias permanecem pendentes.

## Ampliação solicitada durante a conclusão

Josias pediu que entradas de origens em dias diferentes permaneçam no histórico, sem substituir eventos anteriores, e escolheu explicitamente manter a primeira origem como principal na ficha e nos relatórios. A correção acima preserva a primeira atribuição, mas não implementa esse histórico de novas entradas.

A análise encontrou cliques separados com clicked_at/matched_at, mensagens em log e events_by_date legado. O histórico de tentativas de conversão é outra fonte: retry do mesmo evento não equivale a outro clique/retorno do contato. O próximo desenho deve preservar data, origem, campanha e UTMs/identificadores disponíveis de cada entrada, deduplicando somente o mesmo evento. Esta ampliação ainda não foi implementada nem revisada pelo delta acima.
