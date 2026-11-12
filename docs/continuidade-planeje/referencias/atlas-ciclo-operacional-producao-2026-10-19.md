# Atlas: reparo do ciclo operacional — publicado para validação

Publicado em **19/10/2026, 23h31 de São Paulo** (20/10, 02h31 UTC), na VPS `72.60.14.109`. Josias autorizou especificamente “Publicar este reparo na VPS”, incluindo migração, robô e reinício do worker da equipe. Aceite e primeiro ciclo humano com a correção continuam pendentes.

[Abrir a versão publicada](https://planeje.jbapex.com.br/?v=91d9d02e#/assistant/atlas) · [Comportamento e testes locais](atlas-ciclo-operacional-local-2026-10-19.md) · [Evidência da publicação](../evidencias/releases/atlas-ciclo-operacional-producao-2026-10-19.json).

## O que foi publicado

A correção trata respostas humanas que falham na análise, retomada pelo mesmo identificador, encaminhamento de conversa para pessoa explicitamente indicada pela conta, mudanças de atribuição que voltam à conta, repetição por paráfrase e consulta de tarefa já acompanhada. Tarefas permanecem a execução oficial; o contato indicado não reassina a tarefa. O detalhamento e os limites estão na entrega local.

Candidata: `/root/planeje-releases/atlas-functional-loop-20261019-01/candidate`. Composta sobre `atlas-office-live-chat-20261018-01/candidate` com quatro overlays exatos: dois módulos Python da equipe, `AtlasTeamAssistant.jsx` e a migração nova. Três hashes anteriores conferiram com a baseline aprovada. Guarda integral passou de 1.726 para **1.727 fontes**. Demais alterações locais, inclusive Calendário social, não foram promovidas.

Main `/assets/index.91d9d02e.js` e CSS `/assets/index.828bc4c4.css`. HTML/bundle do escritório preservados byte a byte: `index-1ed69416.js`/`index-59ec53c3.css`, iframe `conversa-atividade-20261018-01`. Assets anteriores mantidos. Perfil `.env.production.local` herdado dentro da VPS, modo 0600; flags produtivas habilitadas e piloto falso conferidos sem exportar segredos.

## Migração, serviços e recuperação

Aplicada **uma vez**, somente a migração nova `20261020012821_atlas_team_operational_repair.sql`, SHA-256 `8df607d7a37a2fcb6feafcc7974da5d460faa4784558ded94b0c41a6bc56d30d`. Migrações anteriores não foram reaplicadas. Funções/índice/grants conferidos; helpers privados não dão execução anônima nem permitem RPC de máquina a usuário comum.

Somente `planeje-atlas-team` reiniciou e passou à candidata nova. `/proc/MainPID/cwd` confirmou o caminho efetivo. `planeje-atlas`, `planeje-atlas-events` e `planeje-atlas-office` conservaram as unidades/caminhos anteriores; sem reinício de Edge ou mudança de cron/modelo/autenticação. Quatro serviços ativos após publicação.

As guardas selaram fontes, dois HTML, perfil, unidades, funções e índice antes da troca. Há backups e marcadores da tentativa em `.local/atlas-functional-loop-release-20261019-01/` e na release remota. Não repetir o publicador ou a migração após sucesso/interrupção: inspecionar registros. Uma recuperação mantém o esquema compatível e o histórico; não reinstalar cegamente o índice antigo nem excluir consultas para fazê-lo caber. Guardas são otimistas, não um bloqueio universal de edições externas.

## Verificação observada

- Implementação com 91 SQL/RLS, 110 Python, 56 Node dirigidos, cinco verificações de navegador fictício e `npm run check` local aprovados antes da publicação.
- Build na candidata remota com perfil herdado passou; marcadores de produção presentes, fixtures ausentes. Escritório igual ao anterior.
- Na VPS, 33 testes do gerente e 56 Node dirigidos passaram. Os 15 testes de publicação/recuperação passaram localmente e na VPS; incluem stop parcial, processo novo já ativo, unit concorrente e restauração dos HTML/fontes.
- Revisões independentes da implementação e do publicador terminaram sem achados pendentes. As correções de índice, recuperação por restart e conferência do cwd foram verificadas antes de publicar.
- Seis HTTP 200 com SHA-256 esperado; 1.727 fontes exatas e quatro serviços ativos. Socket da equipe recusou requisição sem autenticação com 401/403. Contrato SQL e grants conferidos.
- Contagens/hashes de tarefas, threads e mensagens, quantidade de saídas de WhatsApp, política e configuração de eventos ficaram iguais durante a publicação. Sem tarefa, mensagem de validação ou chamada paga disparada pelo publicador; nada foi reprocessado em massa.
- Sessão autenticada abriu a nova versão, exibiu mapa e conversa pessoal do robô com contexto geral. Nenhuma mensagem foi enviada e o botão Enviar permaneceu desabilitado com campo vazio. Captura recortada do painel, sem conteúdo de clientes, fica no artefato privado local.
- Cinco entradas novas do journal da equipe na janela inspecionada; zero marcadores Traceback/Permission denied/ModuleNotFoundError/ImportError/SyntaxError. Isso não certifica ausência de qualquer falha futura.

## Uso e próximo passo

Abrir a versão acima ou recarregar o Planeje. Resposta antiga que falhou permanece no histórico; a pessoa que respondeu pode usar **Tentar novamente** quando o assunto ainda estiver com ela. Não pedir que reescreva a mesma resposta nem executar repetição coletiva.

No próximo expediente, validar um caso real: a conta esclarece a demanda e identifica a pessoa, o Atlas faz o contato exato, a resposta é registrada e a revisão combinada é acompanhada. O dono pode conversar fora do expediente; contatos automáticos continuam seguindo os horários cadastrados e dias úteis. Limites existentes conservados.

Não foi validada retomada usando a sessão real de uma funcionária nem uma nova entrega humana após esta publicação. Relato de entrega ou tarefa concluída continua diferente de conferir a publicação e a qualidade externas. Esta release corrige os bloqueios reproduzidos; não afirma funcionamento perfeito em qualquer contexto.
