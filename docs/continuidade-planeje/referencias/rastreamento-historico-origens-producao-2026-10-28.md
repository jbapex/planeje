# Histórico de origens — produção em 28/10/2026

Atualização13h54: recuperação específica da Dinamac autorizada depois desta publicação e aplicada. [Operação e limites](dinamac-recuperacao-origens-producao-2026-10-28.md).

Às 11h35 de São Paulo, a release `contact-attribution-history-20261028-01/candidate` foi publicada após autorização de Josias, testes e revisão independente. Herda `traffic-conversations-20261028-01` e seu perfil produtivo. São1.766 fontes guardadas, JS `index.7fdbc6e5.js` e CSS `index.ca294902.css`. Assets anteriores e escritório preservados.

Às 12h05, o complemento somente de frontend foi publicado e verificado em `contact-attribution-history-events-20261028-01/candidate`, que é a **nova base vigente**. Herda a release acima/perfil, mantém1.766 fontes e CSS, e serve `index.7bc19ced.js`. Nenhum SQL ou restart adicional. Não repetir a migração da primeira etapa.

## O que foi ativado

Primeira origem principal preservada; novas evidências imutáveis por cliente/contato. Contato e ledger são salvos em uma transação pelos três ingressos. Retry do mesmo clique/mensagem não duplica a evidência. A associação Chatvolt por conversa acompanha o histórico, mantendo vínculo exato e recusando ambiguidades.

A ficha de Leads, aba Anúncio, mostra Histórico de origens. A origem/UTMs antigas continuam visíveis sem fabricar a data de um clique. A ficha aberta a partir de Eventos recebia um resumo sem JID; o complemento resolve o JID por cliente/ID exatos antes da consulta do histórico, sem deduzir pelo telefone. Erro ou contato invisível interrompem essa consulta.

## Publicação e verificação

Somente `20261028130000_contact_attribution_history.sql` foi aplicada, uma vez, antes de ativar os consumidores. Não reaplicar. PostgreSQL produtivo17.6: corpos das duas funções conferidos com o SQL revisado, RLS/leitura/privilégios da tabela e execução exclusiva de serviço verificados. O contrato preexistente de contato permaneceu com o mesmo hash.

Somente `supabase-edge-functions` foi reiniciado. As cinco unidades Atlas permaneceram ativas e intactas. Fontes/HTML/runtime/perfil, seis respostas HTTP com hashes e três OPTIONS dos webhooks passaram. Nos logs desde a ativação, nenhum marcador de erro de persistência/boot foi encontrado no recorte consultado. Ficha real autenticada de um contato legado abriu o histórico vazio sem erro; isso não equivale a um teste real de conversão.

Foram usados 57 casos dos handlers, PostgreSQL16 descartável com concorrência/rollback/RLS, SDK2.30 fictício, oito regressões, navegador1440/390/320, `npm run check` e 36 testes operacionais locais/remotos. Revisão independente: dois P2 corrigidos e retestados; zero pendentes. [Evidência local e hashes](../evidencias/rastreamento-historico-origens-local-2026-10-28.json).

O complemento teve regressão RED/GREEN de SDK e ficha real sem JID, novo check completo, revisão independente restrita ao delta, 24 testes de recuperação locais/remotos e build da candidata. Cinco HTTP/hashes, runtime intacto e cinco Atlas ativos foram conferidos. No navegador autenticado, uma entrada **natural** do Google processada após a ativação apareceu em Eventos com campanha e horário real do clique; contato legado manteve UTMs principais e histórico vazio. Não foi disparado envio, reenvio ou mensagem de teste. [Release e complemento](../evidencias/releases/rastreamento-historico-origens-2026-10-28.json).

## Decisões e limites

- A primeira origem já conhecida permanece principal; principal e evidência são persistidas atomicamente para evitar perda em gravações simultâneas.
- Leitura do histórico segue a visibilidade do contato, sem nova restrição de módulo. Usuários autenticados não inserem nem alteram o ledger.
- Chaves de mensagem exigem ID original do provedor. IDs gerados como fallback não comprovam outra entrada individual; clique estável continua válido.
- Captura distingue clique, mensagem e recebimento. Sem horário original, a interface informa recebimento; sem GCLID/código não presume Google por texto ou horário próximo.
- Política de conversão/encaminhamento e parsers fora do delta são preservados. Não foi feita auditoria integral de dependências nem de todos os perfis produtivos.
- SQL/concorrência foram testados no PostgreSQL16; catálogo/permissões efetivos foram conferidos no17.6. Não houve fixture escrita em contatos produtivos.

Não foi feito backfill, replay de webhooks ou envio publicitário real de teste, nem alteração de Tray/GTM. O histórico registra evidências processadas após a ativação; dados nunca capturados não são recuperados por suposição. Aceite humano e observação do próximo ciclo natural permanecem separados da verificação técnica.

Operação privada inicial: `/root/planeje-releases/contact-attribution-history-20261028-01`; frontend vigente: `/root/planeje-releases/contact-attribution-history-events-20261028-01`. Não repetir os publicadores; uma migração já confirmada é preservada e qualquer recuperação deve ser feita para frente, conferindo fontes/concorrência antes de agir. Aceite humano continua pendente.
