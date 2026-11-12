# Atlas: conversa no escritório publicada para validação

Publicado em 18/10/2026, **12h49 de São Paulo** (15h49 UTC), após Josias
autorizar explicitamente “Publicar esta versão na VPS”.
[Evidência](../evidencias/releases/atlas-conversa-escritorio-producao-2026-10-18.json).
[Implementação e verificações locais](atlas-conversa-escritorio-local-2026-10-18.md).

## Uso e comportamento publicado

Abrir [Atlas](https://planeje.jbapex.com.br/?v=fc221910#/assistant/atlas) e clicar
em Conversa ou no robô. O mesmo histórico privado fica disponível sobre o mapa.
Um pedido com nome de cliente oferece confirmação; Escolher outro permite buscar
no catálogo autorizado. Visão geral é uma escolha explícita para consultas amplas.
O pedido original é mantido. Escolher o cliente inicia a consulta; apenas abrir
o painel ou conferir as opções não dispara análise.

Missões mostra os passos reais. A conversa de equipe abre o thread registrado;
Retomar pedido restaura a mensagem original para edição. O fluxo de tarefas,
horários, autonomia, modelo, autenticação e orçamento atuais foram preservados.

Na sessão real, o robô abriu o painel e identificou Impacto Noivas com a opção
“Usar este cliente”. Não clicamos nessa confirmação: nenhum job, análise ou
chamado de teste foi iniciado. A [captura do painel](../evidencias/atlas-conversa-escritorio-confirmacao-producao-2026-10-18.jpg)
registra esse estado. A [captura completa](../evidencias/atlas-conversa-escritorio-confirmacao-producao-completa-2026-10-18.jpg)
preserva o contexto da inspeção.

O mapa ficou vazio nessa aba de inspeção, como na observação anterior em que
Josias confirmou que o mapa aparecia normalmente para ele. Isso não estabelece
causa nem comprova a exibição da nova versão no navegador dele. A conversa foi
conferida; **a conferência visual produtiva do mapa não foi declarada concluída**.
O mapa completo e sua ponte foram verificados localmente com rede isolada.

## Composição e migração

- Base e perfil frontend para a próxima versão:
  `/root/planeje-releases/atlas-office-conversation-20261018-01/candidate`.
- Guarda final: 1.719 fontes; 19 arquivos sobrepostos, incluindo os artefatos
  novos do mapa. Trabalho local alheio de assessoria não foi promovido.
- Main: `/assets/index.fc221910.js` e `/assets/index.92ba26f1.css`.
- Mapa: `/atlas-office/bundle/index-d8cebced.js` e `index-e5ae8acc.css`.
- Assets anteriores mantidos. Nenhum dist/ZIP antigo da raiz foi promovido.

A migração `20261018150153_atlas_manager_source_session_acl.sql` foi aplicada
**uma vez**, SHA-256
`87bfc1ce1efba9d80e22b9324a638b72903e6365656e40c51f7331524debe269`.
Não reaplicar esta ou migrações históricas. O helper privado verifica existência
do par sessão/dono; service_role continua sem SELECT em auth.sessions. Anon e
authenticated não executam o helper. A RPC pública continua INVOKER e mantém
lease, sessão, política, cliente e destinatário. A prova produtiva usou apenas
consulta booleana de sessão inexistente em transação somente leitura.

Somente `planeje-atlas` foi parado/reiniciado; as unidades conservam seus caminhos:
principal na candidata provider das 10h03, team/events na operacional anterior,
office na candidata events-production de 16/10. Nenhum worker recebeu código
novo nesta publicação. O runtime Edge recebeu somente atlas-chat para devolver
origin_run_id no histórico e foi reiniciado. O novo SQL é compatível com esses
workers. Não assumir que os serviços apontam à nova candidata frontend.

## Evidência e recuperação

55 verificações SQL locais, 47 Node locais e na candidata remota, 28 verificações
de navegador isolado e npm run check passaram. Builds de main/mapa executados
na VPS com perfil produtivo herdado. Uma reconstrução explícita com VITE_* e
NODE_ENV herdadas removidas confirmou igualdade dos 12 artefatos do main e do
mapa. Nenhuma variável secreta foi exibida ou copiada para documentação.

Duas revisões privadas independentes examinaram produto/SQL e publicador.
Dez fixtures de publicação cobrem falha parcial de stop, concorrência de HTML e
função SQL, mudança de build ou fonte após guarda, falha de Edge/restauração,
ambiente conflitante e perda de stdout depois do marcador. Todos passaram.
Publicador final:
`a550391276b53caa162ca6090e9f1409cfbf03d6558f206dc45282a88df0152a`.

A publicação fixa hashes de fontes, artefatos compilados, perfil, função SQL e
unidades. Cada conteúdo é conferido antes da cópia; HTML troca atomicamente
após assets e prontidão. Backups ficam em before/ na release, e marcadores
impedem repetição cega. Em recuperação, a correção SQL compatível permanece;
arquivos/HTML/Edge anteriores são restaurados com guarda de concorrência e a
reativação do serviço é tentada mesmo se uma restauração falhar. Não houve
rollback produtivo nesta entrega.

Seis HTTP públicos responderam 200 com hashes esperados; quatro serviços ativos;
permissões SQL e execução restrita conferidas. Tarefas, jobs, conversas/mensagens,
saídas e configuração permaneceram iguais durante a publicação. Zero chamadas
de IA, tarefas ou mensagens foram disparadas para validar. Não confundir
ausência dos indicadores de erro pesquisados com aceite operacional completo.

Primeiro pedido real confirmado, resposta da equipe voltando à conversa,
exibição do mapa no navegador do usuário e aceite operacional continuam pendentes.
