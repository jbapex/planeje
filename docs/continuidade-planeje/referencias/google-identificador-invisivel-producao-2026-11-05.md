# Identificação invisível: Impacto e novos links Google — 05/11/2026

Josias autorizou “vamos fazer isso, e também, para todas as próximas integrações Google”. Publicado para validação humana: configuração da Impacto, duas tags GTM e padrão de criação no Planeje. Não houve backfill nem alteração de contatos/históricos.

## Comportamento

Novo link, ao selecionar Google Ads, recebe `{codigo_oculto}` e desliga código visível. A opção **Identificar clique sem mostrar código** permite desligar explicitamente. Editar conserva o modo já salvo, inclusive ao mudar a origem. Site/Meta novos mantêm o padrão anterior; escolher Google e depois voltar a Site conserva a escolha invisível feita no formulário, visível e reversível.

Reutiliza encoder/decoder já publicados no piloto Dinamac. Pixel ainda precisa ser instalado no site de cada cliente; a criação do link não instala tags em outros sites. Primeira origem principal e histórico separado continuam vigentes. Não atribuir clique por proximidade de horário.

## Impacto: configuração e GTM

- Somente `wge1vif4` foi ativado: marcador acrescido ao texto existente, código visível permanece desligado; fallback Site e Source/Medium nulos. Transação bloqueou a linha, exigiu seu hash exato e comparou todos os demais campos antes/depois, preservando número, canal, texto visível, status e demais parâmetros.
- O rascunho da tag de cookies havia sido alterado concorrentemente para o link Padrão, que aponta a outro destino. Essa versão foi preservada privadamente antes da edição. A publicação mantém o destino já usado pelo site, `wge1vif4`; não mudou o número publicado nem configurou outros links.
- GTM `GTM-PPPWRPJP`: versão **8 ativa**, criada/publicada às10h33 de São Paulo. Duas alterações: nova tag Cookies7dias em Initialization e tag de substituição em All Pages. Conteúdos conferidos integralmente com os arquivos testados; GA4/Tintim e pausas mantidos. Versão7 preservada como anterior.
- Site público carregou as duas tags com os 24 parâmetros, expiração e fallback revisados. Seis links observados apontam a `wge1vif4`, sem Google/cpc fixo. Nenhum botão de WhatsApp foi acionado.

## Frontend e verificação

Release `/root/planeje-releases/google-hidden-default-20261105-01/candidate`, herda integralmente `mini-crm-follow-manual-20261031-01` e seu perfil produtivo no servidor. Overlay exato: `src/lib/rastreamentoTrackableLink.js`, `src/components/crm/RastreamentoTrackableLinks.jsx` e teste do identificador. As 1.796 fontes, assets anteriores, escritório, runtime Edge e cinco serviços Atlas conferidos/preservados; sem reinício ou migração.

Main `index.5f729ded.js`; CSS `index.80eb966f.css`. Cinco respostas HTTP200 com hashes esperados. Formulário real recarregado: Site começa como antes, seleção Google marca invisível/desliga visível; opt-out remove marcador e libera visível; edição de link antigo conserva modo mesmo ao selecionar Google. Nenhum link/contato fictício cadastrado.

Testes dirigidos e build local passaram. Na candidata, cinco scripts passaram, incluindo 57 casos do handler publicado. Localmente o harness atual tem 59 casos e passou; as duas diferenças não foram promovidas por este overlay. Revisão independente sem bloqueador, 24 testes do publicador aprovados. Lint: zero erros, warning legado max-lines. O harness antigo `rastreamentoMessageWebhook.test.mjs` falha por fixture RPC de histórico desatualizada, fora do delta; não declarar suíte integral verde.

Observação não bloqueante da revisão: mensagem com 900 caracteres pode chegar a 916 no formulário ao acrescentar marcador; banco text não trunca, identificação usa protocolo existente. Não houve alteração do limite nem truncamento de conteúdo para corrigir isso.

## Evidência e limites

[Publicação](../evidencias/google-identificador-invisivel-2026-11-05/published.json), [verificação](../evidencias/google-identificador-invisivel-2026-11-05/verification.json), [candidata](../evidencias/google-identificador-invisivel-2026-11-05/qa.json) e [configuração/inspeção](../evidencias/google-identificador-invisivel-2026-11-05/integration-published.json). Revisão privada: `/Users/josiasbonfimdefaria/.codex/security-reviews/google-hidden-default-20261105/review.md`.

Capturas privadas: `/Users/josiasbonfimdefaria/.codex/visualizations/2026/11/05/google-identificador-invisivel-padrao.png` e `impacto-gtm-versao8-publicada.png` no mesmo diretório.

A validação humana do percurso foi confirmada em05/11 às14h23 de São Paulo, após Josias informar novo envio. Consulta somente leitura encontrou duas mensagens novas com os84 caracteres invisíveis preservados no payload original e dois cliques associados ao remetente. A ficha atual contém GCLID, UTMs, campanha e o ID do último clique; há evidência datada no histórico. Sem copiar telefone, texto, GCLID ou campanha reais para os artefatos. Isso confirma esse percurso WhatsApp/provedor, não todos os navegadores/dispositivos nem envio/aceite de conversões no Google.

Nenhuma mensagem, conversão, replay ou clique de teste em produção foi enviado pelo agente. Se o provedor apagar o identificador, não se garante associação; se ambos os armazenamentos do navegador estiverem bloqueados, não se garante retenção entre páginas. Contatos antigos conservam sua origem principal; novas evidências devem aparecer no histórico.
