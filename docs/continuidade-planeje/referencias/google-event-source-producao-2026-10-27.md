# Origem dos eventos Google — publicação em 27/10/2026

Publicado às **16h32 de São Paulo** após autorização atual de Josias: “Sim, publicar e validar esse evento”. Às **16h33**, um único reenvio do evento existente de conversa da Dinamac foi recebido pelo Google e passou a **Em processamento**. Isso não confirma atribuição na campanha nem aceite humano do produto.

## Correção e escopo

O retorno detalhado da Data Manager API indicava `REQUIRED_FIELD_MISSING` em `events.events[0].event_source`. A autorização OAuth adwords/datamanager já estava válida. O fluxo WhatsApp passa a preencher `eventSource: MESSAGE` quando ausente, inclusive na cópia de snapshots antigos; fontes já registradas são preservadas. Frontend e backend oferecem retry apenas para esse erro estruturado específico, mantendo as recusas de sucesso, processamento pendente, Purchase sem snapshot e demais HTTP400.

São quatro sobreposições: helper compartilhado Google, predicado da tela e dois testes. GCLID, ação/destino, timestamp e fatos do evento original foram conferidos por igualdade no servidor, sem exibir identificadores de clique. O histórico rejeitado foi conservado. Nenhuma configuração de cliente, credencial, MCC ou regra de automação foi escrita pelo publicador. Não houve SQL, replay coletivo ou mensagem WhatsApp de teste.

## Operação

Nova base: `/root/planeje-releases/google-event-source-20261027-01/candidate`, herdando `atlas-dialogue-20261027-02/candidate` e o perfil `.env.production.local` dentro da VPS. **1.752 fontes** conferidas antes/depois; não promover dist da raiz. JS `index.c03ed00d.js`, CSS `index.ee022d49.css`; escritório e assets anteriores preservados. Somente `supabase-edge-functions` reiniciado; Edge saudável e os cinco serviços Atlas ativos, com as mesmas unidades. HTML, main/CSS novos, main anterior e escritório responderam200 com hashes exatos; OPTIONS do handler Google retornou200.

O publicador mantém os arquivos anteriores e guardas contra fonte/HTML/runtime concorrentes. Não repetir a publicação já marcada como iniciada/concluída; inspecionar registros e hashes antes de qualquer recuperação. Próximas releases devem herdar esta candidata/perfil, preservando Atlas e Rotina semanal.

## Evidência e resultado

RED observado antes do ajuste. Depois passaram 48 casos do handler, consumidor Google e `npm run check` completo; revisão diferencial independente sem achado pertinente aberto. Publicador e recuperação: **24 + 7 testes**, no Mac e na VPS. A candidata passou os 13 scripts dirigidos e build produtivo; perfil e inventário preservados. Revisão operacional independente sem achados; relatórios privados fora do repositório.

O único reenvio autorizado foi feito pela interface publicada, no evento de hoje às14h02. Google devolveu requestId e o registro persistiu origem MESSAGE, fase processing e nenhum erro. Igualdade dos fatos, clique e destino foi confirmada em consulta somente leitura. A UI mostrou um evento em processamento e consulta liberada a partir de **17h03 de 27/10/2026**. Nenhuma consulta prematura, mudança de backoff ou segundo envio foi feita.

A confirmação final exige diagnóstico do requestId no destino correto, com SUCCESS e recordCount1. Até lá, success permanece false por contrato; recebimento não é conversão contabilizada. As falhas anteriores permanecem como histórico. Retentativas simultâneas já podiam realizar chamadas idênticas no baseline; o payload/transactionId é preservado e a deduplicação efetiva depende do Google. Não se afirma uma única chamada física para toda concorrência futura.

[Conexão Cloud/OAuth](google-data-manager-conexao-2026-10-27.md) · [Registro sanitizado](../evidencias/releases/google-event-source-producao-2026-10-27.json) · [Contrato oficial de eventos](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events) · [EventSource](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest#EventSource). Context7 e documentação oficial consultados; nenhum payload real foi enviado à consulta documental. Estado externo e aceite humano permanecem distintos.
