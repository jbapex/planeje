# Criação Meta pelo Atlas — contrato de 12/11/2026

Escopo autorizado: preparar e executar campanha, conjunto, criativo e anúncio com revisão, recibos por entidade e entrega desligada. Este registro não comprova uma criação real na Meta.

## Fontes e versão

Consulta pública ao Context7 em 12/11/2026, usando os índices oficiais `/websites/developers_facebook_ads-commerce_marketing-api` e `/websites/developers_facebook_marketing-api`. O acesso HTTP direto à documentação retornou429; o MCP Meta DevTools não estava disponível. Nenhum segredo ou dado de cliente foi consultado.

O [changelog de Marketing API](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog.md) informa v24.0 disponível até10/11/2026 e v25.0 até23/02/2027. A [página específica de v24](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version24.0.md) confirma a primeira data. A política de [versionamento](https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/versioning.md) limita o upgrade automático a endpoints sem mudanças relevantes. O novo serviço fixa **v25.0**; não altera os endpoints legados de v24.

Contratos de criação e parâmetros também foram conferidos no [SDK oficial, tag25.0.0](https://github.com/facebook/facebook-python-business-sdk/blob/25.0.0/facebook_business/adobjects/adaccount.py). Campanhas sem orçamento próprio recebem `is_adset_budget_sharing_enabled:false`. Os caminhos de criação são as edges `campaigns`, `adsets`, `adcreatives` e `ads` da conta exata.

## Cobertura inicial e ativos

Cobertura executável inicial: `OUTCOME_TRAFFIC`, destino website, otimização de cliques, cobrança por impressões, orçamento no conjunto, leilão de menor custo sem limite de lance, FacebookFeed e audiência manual. Criativos aceitam um post existente da Página ou um `image_hash` já pertencente à conta. Campanha, conjunto e anúncio nascem `PAUSED`; o criativo não possui estado próprio de entrega. Ativação exige outra decisão.

A edge [promote_pages](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/promote_pages.md) lista Páginas promovidas e exige permissões específicas. A presença histórica nessa lista, isoladamente, não é tratada como prova de permissão atual. O servidor deve combinar o vínculo à conta com capacidade atual de anunciar na Página, conforme as [tarefas de permissão](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/assigned_users). Não aceitar `tasks` ou provas enviados pelo modelo/usuário.

O servidor deve obter imagens pela [edge adimages da conta](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adimages), incluindo hash e account_id. Post existente exige identidade da Página e destino já conferidos. A [referência de criativos](https://developers.facebook.com/docs/marketing-api/reference/adcreative) documenta `object_story_id` e `object_story_spec.page_id/link_data`.

Os [offsets monetários da Meta](https://developers.facebook.com/documentation/ads-commerce/marketing-api/currencies.md) prevalecem sobre suposições de centavos BRL ou casas ISO: por exemplo BRL/USD usam100 e JPY/CLP usam1. O valor humano é convertido por aritmética decimal inteira; a moeda vem da conta autorizada. Orçamento diário não representa um teto rígido diário após futura ativação; a [release oficial v24](https://github.com/facebook/facebook-python-business-sdk/releases/tag/24.0.0) documenta flexibilidade diária.

## Interface de integração

`validateMetaCampaignPlan(input,{accountId,currency,authorizedAssets,now?})` recebe dados humanos tipados e provas exclusivamente do servidor. Retorna plano serializável e prévia com moeda, valores, segmentação, quatro criações e efeito sobre ativos. `authorizedAssets` contém `account_id`, `pages` com `{id,source:'promote_pages',can_advertise:true}`, `images` com `{hash,account_id,status}` ou `posts` com `{id,page_id,url,promotable:true}`. Revalidar essas provas na aprovação.

`executeMetaCampaignPlan({plan,callGraph,reserveStep,finishStep,signal})` recebe transporte autenticado e ledger. `callGraph({method,path,body?,query?,signal})` retorna `{ok,status,data}` e deve fixar host e conta autorizada. O módulo nunca busca token nem aceita URL Graph livre.

`reserveStep({step,account_id,request:{method,path,body}})` deve vincular o pedido imutável à operação aprovada e clamar atomicamente. Retorna `{claimed:true,state:'reserved',lease?}` ou o registro existente `{claimed:false,state,receipt?,error?}`. `finishStep({step,lease?,state,receipt?,error?})` deve persistir e devolver o registro gravado. Um recibo concluído contém `{id,account_id,step,verified:true}` após releitura da entidade. Recibos concluídos são reutilizados; estados reservado, falho ou incerto não autorizam novo POST automaticamente.

Timeout,5xx, resposta inválida, releitura sem confirmação e perda do recibo ficam incertos. Erro Graph explícito não é sucesso, mesmo comHTTP200. Não há chave universal de idempotência inventada, exclusão compensatória ou repetição cega. IDs de dependência vêm exclusivamente dos recibos.

Lacunas do objetivo amplo: leads, vendas, WhatsApp/Messenger/Instagram, categorias especiais, pixels/formulários/catálogos, uploads novos e outros posicionamentos. O módulo deve recusá-las com motivo legível. Integração do endpoint, autorização nativa, persistência/decisão e homologação externa pertencem às próximas etapas; testes desta fatia usam somente transportes fictícios.
