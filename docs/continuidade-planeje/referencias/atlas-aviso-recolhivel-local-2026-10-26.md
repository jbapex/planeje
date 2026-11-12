# Atlas: aviso breve e contador de mensagens

**Atualização em 27/10/2026:** esta entrega foi [publicada na VPS às 00h11](atlas-aviso-recolhivel-producao-2026-10-27.md), após autorização específica. O registro abaixo descreve a etapa local anterior; aceite humano continua pendente.

**26/10/2026 — validado localmente; não publicado.** Josias pediu que “Oi, preciso de você” apareça e logo recolha, deixando somente o sinal de mensagem para ler.

O balão anterior era exibido durante toda a existência de um chamado não lido, sem temporizador. Agora aparece por cinco segundos e recolhe; o robô e o contador de assuntos não lidos permanecem. Recolher o balão não registra leitura nem altera a tarefa, a conversa ou seus lembretes. Uma mensagem nova do Atlas pode mostrar outro aviso; polling, mudança de ordem e leitura de outro assunto não reapresentam as mesmas mensagens durante a montagem atual do componente. Recarregar a página pode apresentar novamente o aviso breve das pendências existentes.

O temporizador pausa enquanto o botão do aviso tem foco de teclado, para não removê-lo durante o uso. Ao sair do foco, conta cinco segundos. Clique no balão abre seu assunto; clique/arraste no robô mantém o comportamento anterior. O estado de avisos apresentados é local à montagem e reiniciado por usuário, sem nova persistência ou dependência.

## Escopo e verificação

Produto: somente `src/components/atlas/AtlasTeamAssistant.jsx`. Fixture: `scripts/atlas-team-pilot/preview/api.js`, agora simula marcação de leitura e chegada de mensagem fictícia. Teste: `scripts/atlas-team-pilot/verify-call-notice.mjs`, prévia isolada na porta4354. API/autenticação são fictícias e toda rede externa é abortada.

- Regressão reproduzida antes da correção: balão continuava visível após sete segundos.
- Cinco verificações de navegador passaram: recolher/contador, polling sem repetição, mensagem nova/foco, celular/abertura/leitura e ausência de rede/erros. Cenários1280×900 e390×844; imagem do celular inspecionada.
- Cinco verificações do fluxo existente de repetição de resposta passaram contra a mesma prévia; porta/saída do script foram adaptadas somente em memória para não sobrescrever evidência antiga.
- ESLint do componente: zero erros e cinco avisos preexistentes, fora das linhas da alteração. Build temporário (`npm run build:check`) passou, sem substituir `dist` ou ZIPs operacionais.

Comandos: iniciar `node node_modules/vite/bin/vite.js --config scripts/atlas-team-pilot/preview/vite.config.mjs --port 4354 --strictPort`; executar o novo verificador com `ATLAS_PLAYWRIGHT_MODULE` e `ATLAS_CHROME_PATH` locais, conforme o runtime instalado; depois encerrar somente essa prévia. [Qualidade](../../quality.md) e [evidência/hashes](../evidencias/releases/atlas-aviso-recolhivel-local-2026-10-26.json).

Foram usadas as orientações de hooks/dependências da skill de boas práticas React, mantendo React18.3.1. Context7 consultou a documentação oficial React18 sobre cleanup de timeout e dependências estáveis. O grafo determinístico de17/10 localizou componente/consumidores; o código atual foi conferido diretamente por estar mais recente que o grafo. Nenhum provedor adicional foi ativado.

Sem SQL, worker, política, leitura produtiva, IA, mensagem real ou publicação nesta rodada. Não houve teste em dispositivo físico nem aceite em produção. Publicação exige autorização específica atual, herança da base/perfil produtivo vigente e conferência de concorrência; a autorização do reparo de23/10 já foi consumida.
