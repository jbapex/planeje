# Thalita Rodrigues Noivas — importação CQC de 29/10/2026

Josias solicitou importar `conversas-2026-10-29.csv` no Mini CRM da Thalita e autorizou disponibilizar o resultado em produção. Foram gravados 180 contatos únicos: 179 em Novo Lead e um em Lead Qualificado. As 29 linhas sem nome e telefone ficaram fora da carga; o arquivo original foi preservado. Nomes, telefones, datas originais, dados de origem e 13 etiquetas em observações foram conferidos após a gravação. Não havia contatos anteriores para esse cliente.

## Regra explícita de origem

Josias confirmou: “Oque está como Site, pode por como meta link lembra dessa regra que no caso esse site é o link tree”. Neste CSV da Thalita, os 21 registros identificados como Site trazem o tracking link Bio Instagram e representam Linktree. Exibir **Meta Link** no Mini CRM. Regra restrita a essa fonte e cliente: não transformar automaticamente Site de outros clientes em Linktree nem contar esses contatos como anúncios de mensagem da Meta.

A classificação visível foi registrada em `tracking_data.sheet_origem`, com a confirmação humana em `sheet_origin_rule`. A origem e os demais dados originais do exportador permanecem em `tracking_data.cqc_import`; nenhum UTM foi inventado. Resultado: 125 Orgânico, 34 Meta Ads e 21 Meta Link. Os três Orgânico com ID de anúncio preservam a origem declarada e o ID apenas no registro de importação.

## Operação e verificação

Carga em transação, com validação do cliente, ausência de contatos anteriores e configuração existente. A primeira tentativa foi integralmente revertida pelo guard de visibilidade; a carga seguinte foi confirmada sem alterar essa configuração. Depois, o superadmin autenticado habilitou Mostrar leads não rastreados somente para Thalita, para incluir os 125 orgânicos na visão da loja. Configuração de status, colunas, consultoras, cadência e automação preservada.

Os 180 registros foram comparados campo a campo com o lote preparado; as 13 observações e o hash da configuração foram conferidos. O MCP retornou 180 contatos e a interface confirmou 180 no Mini CRM. Após a correção de origem, nova comparação validou os 21 Meta Link e os demais 159 contatos. A interface confirmou também os 21 rótulos Meta Link; captura privada salva em `mini-crm-confirmado.png`, junto da evidência local.

Sem nova versão de código, migração, mensagem, CAPI, replay de webhook ou importação de conversas. A alteração de dados já está em produção. Conferência técnica não substitui aceite humano.

Evidência privada local: `/Users/josiasbonfimdefaria/Downloads/importacao-thalita-2026-10-29/resultado.json`. Fonte SHA-256: `9e488e0e1f7c361eeb4ddbdef1d37461d5809cf2fcdb7e506a154f8634cb8735`. IDs de contatos e conteúdo pessoal ficam fora desta documentação. A regra deve ser revista se um novo arquivo tiver outro significado para Site.
