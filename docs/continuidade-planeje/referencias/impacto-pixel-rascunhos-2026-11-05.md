# Impacto Noivas: duas tags Planeje em rascunho no GTM

**Estado posterior:** [publicadas na versão8, identificador ativado e padrão Google entregue](google-identificador-invisivel-producao-2026-11-05.md), após autorização específica de Josias. As seções abaixo preservam o estado de preparação e a análise que motivaram a ativação.

05/11/2026. Pedido de Josias: criar a tag de cookies seguindo a configuração da Dinamac. Estado: **rascunhos salvos e testes locais aprovados; não publicado; banco inalterado**.

## Configuração preparada

Contêiner `GTM-PPPWRPJP`, workspace8, inicialmente sem mudanças. Agora existem exatamente duas alterações:

- Nova `PLANEJE - Campanha de Cookies 7 dias + WhatsApp`, HTML personalizado, `Initialization - All Pages`.
- Modificada `PLANEJE | Substituir links WhatsApp`, HTML personalizado, mantém `All Pages`, observer de links dinâmicos Wix e tratamento anterior de Tintim.

As duas usam o destino Impacto `/r/wge1vif4`, sem query Google/cpc fixa. Preservam os mesmos 24 parâmetros permitidos. Nova campanha explícita gera um snapshot sem herdar identificadores anteriores. Sem parâmetros novos, utilizam o snapshot válido mais recente entre cookie `planeje_trk` e o localStorage legado `impacto_noivas_atribuicao`; expiração de sete dias. Metadados de expiração não entram na query do link.

GA4 e Tintim preservados, incluindo as pausas anteriores. Dinamac consultada somente como referência; nenhuma alteração nela. Sem alterações no frontend, contatos, eventos ou histórico.

## Evidência

Código antes/depois, nova tag, plano, teste e manifesto estão em `.local/impacto-pixel-20261105/`. Conteúdo de cada editor foi comparado integralmente ao arquivo local por cópia nativa antes de salvar. A lista do GTM confirmou duas mudanças e os acionadores acima.

- `pixel-cookies.html`: SHA-256 `55980670db3b902f500d3a6ea3050af89874faf113ded3fb9f34fc000e657a7e`.
- `rewrite-after.html`: SHA-256 `09f01e4a00501a1e9fa4d23dd71c42e7e645a2f3b236f23e096533df3639305b`.
- `node .local/impacto-pixel-20261105/verify.mjs`: passou. Usa somente VM/DOM/cookies/storage fictícios, sem transporte.
- Revisão independente dirigida: todos os achados resolvidos, teste principal e quatro combinações adicionais de carregamento/ordem das tags passaram. Relatório privado em `/Users/josiasbonfimdefaria/.codex/security-reviews/impacto-pixel-20261105/review.md`, SHA-256 `b7e0b14c5d1271fe03f1ecb80e80e659f5e9e20c6bbaffec5075cedd45541fc5`.
- Captura: `/Users/josiasbonfimdefaria/.codex/visualizations/2026/11/05/impacto-pixel-dois-rascunhos.png`.

Os testes incluem acesso neutro, Google/GCLID/GBRAID, outra Source, expiração, fallback legado, cookie inválido, novas campanhas sem mistura e navegação/clique quando uma gravação é bloqueada. Sem teste real anúncio → site → WhatsApp → webhook, preview GTM, Safari físico, mensagens ou conversões. Se cookies e localStorage forem ambos impedidos de persistir, não se garante retenção entre páginas.

## Publicação ainda pendente

Publicar as duas tags exige também corrigir os defaults do mesmo link; caso contrário, seu backend ainda força Google. Consulta restrita e somente leitura confirmou `default_origin=google_ads`, `default_utm_source=google`, `default_utm_medium=cpc` e link ativo. Proposta: `site`, `null`, `null`, preservando todos os outros campos. Manifesto local guarda hash da linha para detectar concorrência antes de uma eventual atualização autorizada.

Não aplicar por inferência das aprovações de outubro. Solicitar autorização específica para publicar essas duas alterações GTM e alterar somente os três defaults do link da Impacto. Nenhuma recuperação ou reclassificação retrospectiva está incluída; os dez contatos já classificados Google continuam sem comprovação de clique pago apenas por esses defaults.

## Conferência posterior: clique capturado, mensagem sem identificador

Josias solicitou análise de um contato de teste; consulta somente leitura. Três cliques próximos aos três envios possuem GCLID e a mesma campanha UTM, mas nenhum tem vínculo de telefone. As mensagens recebidas não contêm código visível ou invisível. A ficha usa `planeje_link_match_method=initial_message`, somente pelo reconhecimento da frase do link; não possui `planeje_click_id` nem os parâmetros dos cliques.

O link `wge1vif4` está com `append_match_code=false` e mensagem sem `{codigo_oculto}`. Logo, os rascunhos de cookies não bastam para identificar individualmente a conversa: precisa preparar também a ativação explícita do identificador invisível nesse link, como no piloto Dinamac, e validar um novo percurso. Não casar cliques com telefone apenas pela proximidade de horário. Nenhuma alteração produtiva nem vínculo manual foi feito nesta análise.

Houve mudança concorrente nos defaults do link: a nova leitura confirmou Source/Medium nulos, enquanto a origem continua `google_ads`. O snapshot/hash anterior em manifest.json está superado e não autoriza atualizar a linha. Reconsultar e preparar a proposta final antes de qualquer publicação autorizada. Esta análise não publicou o GTM nem mudou a configuração do link.
