# Histórico de origens — implementação local de 28/10/2026

Estado: implementação local validada e revisão independente aprovada, sem achados pendentes. Josias aprovou o desenho e, depois, autorizou publicar na VPS após concluir e passar os testes. Essa autorização cobre somente a entrega atual e sua migração; não inclui recuperar dados antigos em massa ou enviar conversões reais de teste.

Continuação: [publicação e complemento de Eventos verificados](rastreamento-historico-origens-producao-2026-10-28.md). As evidências abaixo descrevem o alvo local inicial; o complemento acrescenta resolução de JID por cliente/ID para fichas resumidas. Não reaplicar migração ou publicar novamente por causa deste registro local.

## Comportamento e alcance

A primeira origem já conhecida permanece principal. Os ingressos CRM/Chatvolt/Meta, Uazapi e Apicebot passam a salvar o contato e cada nova evidência na mesma transação. A nova tabela `contact_attribution_history` usa identidade estável de clique ou mensagem; repetição do mesmo evento não cria outra entrada. A origem recebida é capturada antes da preservação da principal.

A ficha real mostra Histórico de origens na aba Anúncio, com páginas de 20 entradas e detalhes de UTMs/identificadores. A data distingue clique, mensagem e recebimento; contatos legados continuam com sua atribuição principal, sem data de clique inventada. As políticas de leitura seguem o acesso atual ao contato. Apenas o serviço pode executar a persistência; usuários autenticados não gravam o histórico.

A associação Chatvolt mantém cliente, organização, conversa, telefone/JID e código exatos. Permite retornos em mensagens distintas da mesma conversa. Códigos conflitantes na mesma mensagem e identidade ambígua continuam recusados. Um recorte de mais de 200 eventos é recusado por não comprovar unicidade. Mensagem sem identificador individual pode indicar Site pela frase exclusiva, mas não comprova GCLID ou anúncio Google.

## Verificação segura

- `node scripts/contactAttributionHistory.test.mjs`: datas, snapshots permitidos, identidade estável e erros com SDK2.30/fetch fictício.
- `PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH python3 scripts/contact-attribution-history/verify.py`: PostgreSQL descartável por socket Unix, sem DSN. Migração real, duas datas, concorrência com chaves iguais/diferentes, rollback de contato existente/novo, RLS e privilégios.
- `node scripts/miniCrmMessageWebhooks.test.mjs`: 57 casos compilam os três handlers reais com transportes fictícios, incluindo retorno Chatvolt e falha da persistência antes da conversão/automação.
- `node scripts/rastreamentoLeadAttributionHistory.test.mjs`: filtro cliente/JID, paginação por data/UUID com microssegundos, falhas e cursor inválido.
- Prévia: `node node_modules/vite/bin/vite.js --config scripts/contact-attribution-preview/vite.config.mjs`; `node scripts/contact-attribution-preview/verify.cjs` com Playwright instalado via `NODE_PATH`, porta4361, rede externa abortada. Ficha real, páginas, duplicata, falha/retry, resposta obsoleta, legado, teclado e larguras1440/390/320.
- Regressões selecionadas: `chatvoltConversationAttribution`, `rastreamentoTrackableClickClaim`, `rastreamentoMessageAttribution`, `chatvoltIngress`, `chatvoltHistoryRecovery`, `rastreamentoHiddenMatchCode`, `rastreamentoTrackableLink`, `rastreamentoLeadFicha`, `rastreamentoLeadConversa`, em `scripts/*.test.mjs`.

O `npm run check` final passou. A revisão independente reproduziu e retestou dois P2: erro de leitura do contato recuperado agora retorna500 para permitir retry, inclusive depois do claim; Apicebot sinaliza nome derivado de telefone para preservar o nome já conhecido. Não há achado pendente. Os 36 testes de publicação/recuperação também passaram, sem rede produtiva. [Evidência e hashes finais](../evidencias/rastreamento-historico-origens-local-2026-10-28.json).

Baselines exatas e logs desta tarefa ficam em `.local/contact-attribution-history-20261028`; o complemento está em `.local/contact-attribution-history-events-20261028`. HEAD contém mudanças anteriores e não representa sozinho o antes desta entrega. Os testes não usam `.env`, contas ou conversões reais; a prévia usa somente fixtures. Candidatas, catálogo/ACL e navegação produtivos foram conferidos na continuação acima; teste sintético e observação natural permanecem distintos.

## Operação e limites

Aplicar somente a nova migração `20261028130000_contact_attribution_history.sql`, uma vez, antes dos consumidores. Herdar a release e `.env.production.local` vigentes, conferir concorrência, compor arquivos selecionados e preservar assets/serviços anteriores. Não promover `dist` da raiz nem outras migrações locais.

O histórico começa com evidências processadas após a ativação. Não foi feito backfill, atribuição por proximidade de horário, alteração de Tray/GTM ou replay de conversões. Verificação técnica, publicação e aceite humano são estados distintos.
