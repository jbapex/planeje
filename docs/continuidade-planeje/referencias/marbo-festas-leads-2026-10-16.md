# Marbô Festas — cadastro dos leads em 16/10/2026

Dados aplicados em produção às 18h19, São Paulo, a pedido de Josias, usando a planilha fornecida e o login indicado para identificar a loja. Conta Auth e perfil foram consultados apenas em leitura; confirmados papel cliente, vínculo exato e nome Marbô Festas. Não houve alteração de senha, papel, estado ou vínculo.

## Resultado

406 linhas válidas da aba CRM, sem telefones repetidos ou correspondências ambíguas. Dois contatos já existiam e foram atualizados; 404 foram incluídos. O total passou de 42 para 446, preservando os outros 40 contatos. A conciliação posterior encontrou os mesmos 406 contatos e nenhuma nova alteração ou inclusão pendente.

Foi mantido o padrão de etapas usado na entrega anterior da Marbô Noivas, por orientação de Josias: Lead Qualificado vira Em Atendimento com Qualificado = Sim; Não Respondeu vira Follow Up com Não respondeu = Sim; Não Compareceu vira Follow Up com Compareceu = Não. Agendamento, reagendamento, negociação e venda comprovados pela planilha marcam qualificação, exceto a desqualificação explícita. Dez linhas não tinham status: quatro com data de agendamento entraram em Agendado; seis sem agendamento entraram em Novo Lead.

As 22 vendas realizadas têm valor positivo e data de agendamento informados. Data da venda recebeu essa data apenas nessas vendas, conforme o critério confirmado por Josias na entrega anterior. Nenhum horário foi inventado. Quinze linhas tinham número ou identificador em lugar de nome; os contatos foram cadastrados sem inventar nome nem bloquear a identificação futura recebida do WhatsApp.

Distribuição dos 406 contatos importados: 12 Agendado, 22 Venda Realizada, cinco Em Negociação, 224 Follow Up, 30 Venda Perdida, 74 Lead Desqualificado, 31 Em Atendimento, um Reagendado e sete Novo Lead. São 91 qualificados e 190 com a marca Não respondeu.

## Configuração e origem

A loja não tinha mini_crm_config salvo. Foi criado um registro apenas para a Marbô Festas, com o padrão atual de etapas/colunas/cadência e as quatro consultoras da planilha. Próxima Ação foi conservada como coluna porque havia duas linhas com conteúdo nesse campo. Nenhuma configuração da Marbô Noivas ou de outra loja foi alterada.

Todos os 406 contatos da planilha declaram Meta Ads como origem: 361 via link rastreável e 45 via campanha de mensagem. A origem foi registrada como Meta Ads, conservando o texto original e a proveniência de planilha em tracking_data. Não foram criados CTWA, fbclid, identificador de anúncio ou evento de conversão. Os dois contatos existentes conservaram metadados anteriores, canais, UTMs e imagens. Os leitores reais usados pela interface reconheceram os 406 importados no grupo Meta; o total da loja nesse grupo é 410, incluindo quatro contatos anteriores identificados por rastreamento.

## Acesso e verificação

Josias autorizou disponibilizar o Mini CRM para o login indicado. A leitura inicial de allowed_pages = Dashboard havia sido interpretada incorretamente como bloqueio do Mini CRM. A navegação e a rota atuais já disponibilizam Mini CRM e Calendário aos clientes independentemente dessa lista; a informação foi corrigida durante o trabalho. Portanto não foi necessário gravar permissões nem ampliar acesso a outros módulos. O login ficou preservado integralmente.

Backup privado anterior foi salvo localmente e na release de produção. A simulação usou tabelas temporárias. A transação produtiva conferiu o cliente, o login, a ausência inicial de configuração, cada registro anterior e o número de linhas alteradas, com guardas de concorrência e detecção de contatos criados após a comparação. Todos os campos não previstos e os contatos fora da planilha foram preservados. Contagens/hashes das conversas recebidas e enviadas e dos contatos da Marbô Noivas permaneceram iguais dentro da transação. Esquema e gatilhos foram preservados.

A leitura posterior verificou os 406 contatos, a nova configuração, os valores/datas das 22 vendas, as marcas e a origem. Uma segunda conciliação resultou em zero atualizações/inclusões. Verificação com as funções reais de leitura da interface confirmou total 446, Meta 410, os 406 importados como Meta, 91 qualificados, 190 sem resposta e 22 vendas com as datas iguais. Não se abriu uma sessão como Marbô Festas: a sessão disponível no navegador era da Marbô Noivas e foi preservada. Entrada/uso pelo cliente e aceite seguem pendentes.

Sem mudança de código do produto, build, migração, reinício, credencial, envio WhatsApp, chamada de IA ou CAPI. Nenhuma mensagem ou conversa foi criada pelo agente. Somente dados do Mini CRM da Marbô Festas foram gravados.

Operações e registros individuais permanecem exclusivamente em `.local/marbo-festas-20261016` e `/root/planeje-releases/marbo-festas-import-20261016-01` na produção. Não copiar dados individuais ou backups para a documentação.

[Registro agregado](../evidencias/releases/marbo-festas-leads-2026-10-16.json).
