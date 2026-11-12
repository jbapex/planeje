# Calendário visual publicado — 18/10/2026

Publicado às **13h34 de São Paulo**, após autorização explícita de Josias: “vamos publicar então”.

[Abrir Calendário](https://planeje.jbapex.com.br/?v=398c5cdd#/social-media?tab=calendar).
[Implementação local e correção da rolagem da prévia](calendario-social-visual-local-2026-10-18.md).
[Evidência da release](../evidencias/releases/calendario-social-visual-2026-10-18.json).

## Escopo

Tela de Redes Sociais → Calendário: semana/mês, calendário geral ou por cliente, miniaturas com fallback, busca/filtros, seleção por teclado e painel com material, legenda, canais, destinos, datas e situações. A ação abre a tarefa e as publicações existentes.

O estado de uma rede publicada não encobre outra pendente/falha; filtro de canal ocorre antes do agrupamento. Horário informado sem contrato de envio permanece planejado. Agendamento no Planeje/Meta e publicação informada manualmente têm rótulos distintos. Arraste de Facebook já agendado na Meta é bloqueado para não aparentar uma reprogramação externa que não ocorreu.

Esta publicação **não implementa** aprovação com agendamento automático, edição inline de legenda/horário por rede ou conectores TikTok/YouTube. Esses pontos permanecem pendentes. Nenhum post, agendamento ou dado de cliente foi criado/alterado para validação. Aceite final de uso e certificação do ciclo produtivo de envio permanecem pendentes.

## Base preservada

- Fonte/base mais recente: `/root/planeje-releases/atlas-manager-source-order-20261018-01/candidate`, 1.720 fontes. A primeira preparação detectou essa atualização concorrente e abortou antes de criar candidata ou escrever na produção; só depois da publicação dela a candidata foi preparada novamente.
- Frontend anterior: `atlas-office-conversation-20261018-01`, main `fc221910`/`92ba26f1`, escritório `d8cebced`/`e5ae8acc`, preservados. HTML anterior validado contra o registro publicado, não apenas contra snapshot do servidor.
- Seis arquivos próprios sobrepostos: cinco fontes de produto e o teste do agrupamento. Dois arquivos novos; guarda final de **1.722 fontes**.
- Nova base/perfil frontend: `/root/planeje-releases/social-calendar-20261018-01/candidate`. Perfil `.env.production.local` herdado dentro da VPS, hash conferido; build removeu VITE_* e NODE_ENV externas antes de carregar o perfil. Nenhuma credencial foi exibida ou trazida para o checkout local.
- Main atual: `/assets/index.398c5cdd.js` e `/assets/index.c517fbbf.css`.
- Sem SQL, alteração de Edge/cron, reinício, unidades ou configuração de serviços. Processos mantiveram seus caminhos, inclusive a atualização concorrente do Atlas. Não usar `dist`/ZIP antigo ou bundle da prévia para futuras publicações.

## Verificação

`npm run check` local passou; regressões sociais e build da candidata na VPS passaram. Prévia com fixtures e rede isolada validou 1440/1024/390 px, inclusive scroll físico até o fim e retorno ao topo, semana/mês, vazio, teclado, filtros/canais mistos e diálogo “+ mais”. Lint conserva os avisos preexistentes; não houve rebaixamento de regras.

Publicador recebeu revisão independente somente leitura. Nove fixtures de recuperação passaram localmente e na VPS: sucesso, fonte concorrente, falha após cópia, HTML concorrente/ausente, artefato alterado, falha após HTML e fontes existentes/novas criadas durante a cópia. Cada arquivo revalida a guarda antes de escrever; rollback tenta os demais arquivos mesmo se um não puder ser restaurado. Marcadores `started.json`/`published.json` impedem repetição cega; backups privados ficam em `before/`. Assets são imutáveis e antigos permanecem disponíveis.

Após a troca, raiz, JS, CSS e escritório retornaram HTTP 200 com SHA-256 igual ao servidor. As 1.722 fontes e os hashes das quatro unidades conferiram; `planeje-atlas`, `planeje-atlas-team`, `planeje-atlas-events` e `planeje-atlas-office` ativos.

Navegador autenticado real exibiu a nova tela; filtro de cliente/todos, seleção de conteúdo e painel de Instagram/Facebook conferidos. Rolagem para baixo e retorno ao topo funcionaram no layout integrado. Só leituras e mudanças de visualização; nenhum botão de envio, aprovação ou gravação de tarefa foi acionado. Captura privada no registro `.local/social-calendar-release-20261018-01/calendario-publicado.png`.
