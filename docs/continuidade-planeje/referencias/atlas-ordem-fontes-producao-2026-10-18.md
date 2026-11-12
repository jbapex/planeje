# Atlas: recuperação da consulta antes de chamar a equipe

Publicado em 18/10/2026, **13h30 de São Paulo** (16h30 UTC), como correção do
fluxo de consulta interna autorizado para publicação e validação por Josias.
[Evidência](../evidencias/releases/atlas-ordem-fontes-producao-2026-10-18.json).

## Falha confirmada pelo uso real

A captura das 13h13 confirma que o mapa apareceu e a Impacto Noivas foi
reconhecida no contexto do chat. A missão falhou depois do envio. Isso resolve
a observação de renderização no navegador do usuário; não é aceite do gerente.

Leitura produtiva autorizada encontrou uma chamada de modelo e uma ferramenta,
sem nenhuma leitura de fonte. O modelo tentou ask_internal primeiro. A exigência
correta de consultar o cliente antes do contato disparou TOOL_DENIED e encerrou
a missão inteira. Não era falha de reconhecimento do cliente nem prova de
que a equipe tivesse sido chamada.

## Mudança e limite

Somente esse pré-requisito agora devolve resultado de ferramenta com
source_required=true e sent=false, registra a tentativa não enviada e permite
continuar a missão/lote. O Atlas recebe instrução para consultar o especialista
pertinente e perguntar somente o que faltar. O padrão reaproveita a recuperação
já usada para identificadores inválidos.

O mesmo cliente precisa ter fonte disponível antes do contato. Escopo, UUID,
segredos, memória privada, emissor operacional separado, ordem literal para
organize, sessão, lease, política e destinatário permanecem exigidos. Tentativas
recusadas consomem os orçamentos existentes; repetição fica limitada. Não houve
mudança de modelo, autenticação, teto diário, expediente ou autonomia.

O critério genérico de fonte do mesmo cliente já existia e não foi ampliado.
Este hotfix não certifica que o modelo sempre investigará o suficiente nem
comprova entrega ou publicação externa. Tarefas continua sendo a execução oficial.

## Verificação

- Regressão reproduziu o erro original antes da alteração; quatro casos novos
  cobrem recuperação por Operação/tasks, lote ask/read, fontes falhas/de outro
  cliente e limites de chamadas/ferramentas.
- 42 testes Node dirigidos passaram localmente e na candidata Node 20.19.1;
  npm run check passou, com avisos legados de lint/build preservados.
- Oito fixtures de publicação/retomada passaram. A revisão corrigiu rollback
  após start: quando o unit anterior é restaurado, restart carrega o processo
  anterior. Concorrência, falha de stop/IO e stdout após commit são preservados.
- Uma simulação determinística na VPS leu tarefas, publicações e a fonte do
  emissor pelo leitor/RLS reais. Recuperou a ordem inicial inválida; emissor e
  contato foram fictícios. Zero IA paga, RPC de consulta à equipe, mensagem ou
  tarefa real nesse teste. Não interpreta o conteúdo do cliente como resultado.
- Seis HTTP/hashes, quatro serviços ativos, fontes e cwd do processo principal
  conferidos. Estado operacional permaneceu igual durante publicação.

O primeiro preparo parou por um caminho de teste ausente no Node 20; a lista foi
corrigida e a candidata existente foi verificada sem repetir o preparo. A
retomada teve uma referência local indefinida corrigida e ganhou fixture. Nenhum
desses passos havia trocado fontes ativas, unit, frontend ou dados operacionais.
Na simulação, a primeira asserção foi ajustada ao contrato existente: available
é opcional nas leituras de tasks e somente false indica indisponibilidade.
Esses incidentes não foram ocultados nem exigiram mudança adicional de produto.

## Composição e próxima publicação

Base e perfil para a próxima release:
`/root/planeje-releases/atlas-manager-source-order-20261018-01/candidate`.
Guarda de **1.720 fontes**, composta da candidata office-conversation com dois
overlays: atlasManager.js e atlasManagerSourceOrder.test.mjs. Trabalho local
alheio não foi promovido; perfil frontend foi herdado somente no servidor.

Somente planeje-atlas foi parado e iniciado, saindo da candidata provider para
a candidata corretiva. O cwd real do processo confirmou a troca. Team/events
permanecem na operacional anterior; office permanece na events-production de
16/10. Frontend, HTML, assets, runtime Edge e SQL não foram alterados.
Main fc221910/92ba26f1 e mapa d8cebced/e5ae8acc continuam válidos.
Não repetir publicador nem migrações históricas.

Artefatos operacionais locais ficam em
`.local/atlas-manager-source-order-20261018-01/`; no servidor, na release com
mesmo nome. Publicador revisto SHA-256
`2b6e1ee3d13bc515235d0f17bd8949e696594443dd1c127b2c56e4cbac79537c`.
Relatório privado: atlas-source-order-2026-10-18.md no diretório de revisões do
Codex; zero achados materiais abertos no intervalo examinado.

## Validação humana pendente

Na conversa existente, Retomar pedido restaura a mensagem original. Enviar
inicia nova tentativa deliberada; a missão falha anterior foi preservada e não
foi repetida automaticamente. Esperar consultas/fontes e resposta concreta;
se faltar confirmação, deve haver destinatário/assunto reais ou agendamento
para o expediente da equipe. Fora dele, o dono pode consultar, mas o contato
segue a política de horário vigente. Resposta humana voltando à origem e aceite
de Josias permanecem pendentes.
