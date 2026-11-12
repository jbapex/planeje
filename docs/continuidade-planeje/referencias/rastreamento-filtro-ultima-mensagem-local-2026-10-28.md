# Rastreamento: filtro inicial pela última mensagem

28/10/2026. **PUBLICADO E VERIFICADO na VPS às 15h01 de São Paulo.** Josias pediu
abrir Leads pela mensagem mais recente e confirmou “Conversa inteira: recebidas
e enviadas”. Não é um filtro exclusivo de mensagens enviadas pelo contato.

`ContatosPage.jsx` já busca os contatos por `last_message_at DESC`, mas iniciava
o filtro de período como `primeira` quando `standaloneTracking=true`. Assim,
contatos antigos com atividade recente podiam ficar fora do período inicial.

A única mudança de produto inicia `messageDateField` como `ultima` também no
Rastreamento. As opções Primeira mensagem e Última mensagem continuam editáveis.
Período, exportação, datas persistidas, outros módulos e ingestão não mudam.
O comportamento que já existia fora do Rastreamento permanece igual.

Passaram `node scripts/rastreamentoPeriod.test.mjs`,
`node scripts/contatosMessagePeriod.test.mjs`, ESLint do arquivo (zero erros,
dois avisos fora do delta), `npm run build:check` e conferência do diff de uma
inicialização. Nenhuma fixture produtiva, migração ou envio foi usado.

Josias autorizou esta publicação com “pode sim”. Somente a inicialização foi
composta sobre a release produtiva `atlas-learning-20261028-02/candidate`;
o arquivo local inteiro e os demais trabalhos locais não foram promovidos.

## Publicação e conferência

Nova base de frontend: `/root/planeje-releases/rastreamento-default-last-20261028-01/candidate`,
com 1.768 fontes e perfil `.env.production.local` herdado somente na VPS.
Main `index.b606d086.js`, CSS `index.ca294902.css`; HTML SHA-256
`074b7086770a2ebaa3db248e559a79b13af0a83c666a1428005299ae47c079bc`.
O componente composto tem SHA-256 `b16ac138437d388c527a093ff88a4273b79e7a35e6648caf6ba50a8109d18aa5`.

Passaram os dois scripts de período na candidata, build com perfil produtivo,
24 testes do publicador locais e na VPS, cinco HTTP com hash e a conferência
das 1.768 fontes. Os cinco serviços Atlas e o Edge permaneceram ativos;
units efetivos, drop-ins, runtime, escritório e assets antigos preservados.
Sem SQL, migração, reinício, envio comercial ou alteração de credenciais.
Os serviços continuam na candidata Atlas anterior; esta troca é só de frontend.

Navegador autenticado confirmou a abertura em Última mensagem, a seleção
manual de Primeira mensagem e a volta ao padrão Última mensagem após recarregar.
Conversa inteira inclui recebidas e enviadas. Aceite de uso não é inferido.
[Evidência sanitizada](../evidencias/releases/rastreamento-filtro-ultima-mensagem-2026-10-28.json).
