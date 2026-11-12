# Chamados do Atlas dentro do escritório

Josias pediu saber, dentro do escritório, quem o robô chamou, sobre qual cliente, o que perguntou e se houve retorno. O filtro “Aguardando você” mostrava tarefas das filas relacionadas e escondia a decisão concreta.

## Publicado

- Nova entrada **Chamados** na navegação e no painel lateral. Perguntas, propostas antigas e sugestões dos grupos aparecem como decisões do dono, sem serem apresentadas como mensagens enviadas à equipe.
- **Aguardando Josias** usa o nome do proprietário e abre diretamente os assuntos para revisão. Uma sugestão vinculada a várias filas aparece uma vez na lista.
- **Aguardando equipe** abre conversas reais do robô, identificando destinatário, cliente, assunto, última mensagem do Atlas, último retorno humano e próxima revisão. Não afirma entrega, leitura ou execução que os registros não comprovem.
- Filtros Em aberto, dono, equipe, revisões e encerrados. Botão abre o assunto exato no robô; outro acessa a tarefa existente quando ela está no snapshot autorizado. Ao abrir o robô, sai do modo ampliado para a conversa ficar acessível.
- Sugestões abrem a demanda exata no perfil; perguntas e propostas antigas mantêm seus formulários de revisão. Sem aprovação automática.
- Contadores contam agentes com cada condição e podem se sobrepor. Um chamado interno não desaparece porque a mesma fila também depende do dono ou tem problema de cobertura. O painel mostra contagens de assuntos, separadas das contagens dos agentes.
- Corrigido “tentativas por gatilho” para **“tentativas de análise hoje”** nas duas apresentações.

## Fontes e acesso

Somente frontend. `atlasOfficeActivity.js` consulta as tabelas já existentes pela sessão normal e RLS, com escopo do proprietário. Conversas ativas paginadas; histórico exibe os vinte encerrados mais recentes. Duas relações embutidas filtradas por papel retornam só a mensagem mais recente de cada lado. A conversa completa continua no robô, pela RPC existente (últimas quarenta mensagens). Não há nova função SQL nem uso de service key no navegador.

Sugestões usam `atlas_event_findings` e o estado da demanda vinculada; vinculadas, arquivadas, encerradas ou já transformadas em conversa não viram novas pendências do dono. Uma falha de consulta aparece explicitamente e não é tratada como ausência de chamados. Os dados são atualizados junto do escritório, inicialmente a cada quinze segundos enquanto visível.

Leitura conferida em produção: **zero conversas/mensagens internas**, cinco sugestões privadas da Impacto. A demonstração com pergunta, resposta, revisão e encerramento ocorreu apenas na prévia fictícia local. Não criar conversas reais para comprovar a interface só para testar a interface.

## Validação e operação

Quatorze testes de contexto/apresentação/SDK e expediente; trinta regressões do escritório; build completo sobre 1.662 fontes produtivas preservadas. Navegador fictício conferiu filtros, retorno/revisão, histórico encerrado, abertura do assunto exato no robô e saída do modo ampliado. Tela estreita local: documento 390 px, iframe 366 px, sem overflow; viewport restaurado. Consultas relacionais conferidas contra o PostgREST produtivo, sem IA ou escrita.

Navegador autenticado real conferiu proprietário, três agentes associados aos cinco assuntos, lista da equipe vazia e link para a demanda correta. Tela estreita produtiva: documento/CSS 433 px, iframe 416,23 px; viewport restaurado. Uso real de uma conversa por funcionário continua pendente: não existe conversa produtiva para simular um retorno.

Assets **`index.f054f258.js` / `index.48915503.css`**. Escritório **`index-b0d38839.js` / `index-fa6fc7d5.css`**. Conserva os anteriores. Base atual: `/root/planeje-releases/atlas-office-calls-20261017-01/candidate`; guardas `source-keys-next.json` e `source-manifest-next.json`, 1.668 fontes. Webroot `/var/www/planeje`.

Sem SQL, restart, chamada ao modelo, tarefa oficial ou mensagem criada nesta entrega. Observação, limites e aprovações mantidos. O baseline desta revisão já tinha quatro chamadas e 198.224 tokens combinados; não atribuir a quarta chamada a esta alteração de interface. Backend continua na release `atlas-events-production-20261016-01`.

[Release](../evidencias/releases/atlas-chamados-escritorio-2026-10-16.json) · [Tela real](../evidencias/atlas-chamados-producao-desktop-2026-10-16.png) · [Exemplo fictício](../evidencias/atlas-chamados-previa-desktop-2026-10-16.png).
