# Impacto Noivas: auditoria de recuperação Google

29/10/2026. Josias autorizou reler eventos da Impacto, recuperar dados comprovados de Google/GCLID e aplicar na VPS. Auditoria concluída com **zero recuperações elegíveis**; nenhuma atualização de contato/histórico e nenhuma nova release do produto foram necessárias.

## Alcance e resultado

Leitura limitada ao cliente Impacto Noivas, em transações READ ONLY com statement_timeout.133.210 eventos retidos:133.209 Uazapi (05/02 a29/10) e um ingress;5.676 contatos e128 cliques salvos. Não foram usados registros de outro cliente, nomes ou aproximação de horário para atribuir origem.

- Dois contatos já são Google Ads por `utm_source=google`/`utm_medium=cpc`, reconhecidos pela mensagem inicial. Ambos sem GCLID; o filtro Google da interface autenticada mostra os dois no período de outubro.
- Uma única ocorrência textual de GCLID/GBRAID nos webhooks: URL de produto de `www.magazineluiza.com.br` compartilhada em mensagem recebida. Não é campo estruturado de atribuição nem prova de clique em campanha da Impacto. Não foi usada para classificar o remetente.
- Cinco cliques salvos classificados como Google, um com GCLID. Nenhum código desses cliques aparece nos logs retidos. O clique sem vínculo não pode ser associado a um contato.
-72 payloads mencionam códigos visíveis, sete os têm na mensagem recebida atual; parte das menções está em metadados de conversa ou mensagem enviada. Nenhum corresponde aos cliques Google. Zero payloads com o marcador invisível conhecido.

Somente metadados, contagens e limites foram persistidos. Payloads, tokens, telefones, mensagens, códigos e GCLIDs brutos permaneceram em memória na VPS e não foram copiados para documentação ou saída. A ferramenta histórica da Dinamac é específica para Chatvolt e não foi aplicada à Impacto/Uazapi.

## Evidência e operação

[Resumo sanitizado](../evidencias/impacto-recuperacao-google-auditoria-2026-10-29.json). Cópia privada na VPS: `/root/planeje-operations/impacto-attribution-20261029-01/audit.json`, diretório0700/arquivo0600, SHA-256`6b541a6241950f971e6e80e3d5a5e97cada4ae859a09c5b67bec40115609a405`.

Zero INSERT/UPDATE/DELETE produtivos, backfill, replay de webhook, conversão, mensagem, migração, build ou restart. A base frontend continua `rastreamento-origin-20261029-01/candidate`, mainb8d86d0b/CSS80eb966f; HTML SHA-256`551c08174a9aaf5da3b2a4d3ecb29c292a52cd048e221dca89d919b5b58df375` conferido após o registro da auditoria.

Logs apagados ou dados que nunca chegaram ao Planeje estão fora do alcance. A conclusão é zero vínculos comprovados nos registros retidos, não ausência histórica de tráfego Google. Uma futura validação do fluxo de campanha deve testar captura do GCLID no clique e retorno do identificador junto à mensagem; essa configuração prospectiva não foi alterada nesta auditoria.
