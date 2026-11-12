# Atlas: aviso breve publicado na VPS

Publicado em 27/10/2026, às 00h11 de São Paulo, após autorização atual de Josias: “pode sim”. Verificação técnica concluída; aceite humano permanece pendente. [Evidência da publicação](../evidencias/releases/atlas-aviso-recolhivel-producao-2026-10-27.json).

## Comportamento

“Oi, preciso de você” aparece por cinco segundos e recolhe. O robô e o contador de assuntos não lidos permanecem; esconder o balão não marca leitura, encerra demanda ou adia revisão. Uma mensagem nova do Atlas pode apresentar o aviso novamente. Polling, mudança de ordem e leitura de outro assunto não repetem as mensagens já anunciadas durante a montagem atual. Recarregar a página pode mostrar novamente o aviso breve de pendências existentes.

O temporizador pausa enquanto o botão do aviso tem foco de teclado. Outra mensagem na mesma conversa conserva o botão e o foco; depois de sair do foco, contam-se cinco segundos. Clique abre o assunto correspondente. Arraste do robô, contador e fluxo de respostas foram preservados.

## Escopo e verificações

Somente `src/components/atlas/AtlasTeamAssistant.jsx` entrou na sobreposição produtiva. A fixture e o verificador local não foram publicados. [Entrega local e comandos](atlas-aviso-recolhivel-local-2026-10-26.md).

- Cinco verificações de navegador em 1280×900 e 390×844: temporizador/contador, polling, mensagem nova com foco, abertura/leitura e ausência de rede externa/erros. Outra mensagem chegou com o botão focado; foco e visibilidade persistiram por 21 segundos. Cinco verificações existentes de retry também passaram com o componente final.
- Lint dirigido local: zero erros e cinco avisos preexistentes. Build temporário local passou sem alterar `dist`/ZIPs operacionais. O ESLint 8 da VPS não tem configuração publicada; não se declara lint remoto aprovado. A preparação final vinculou o lint local ao SHA exato e compilou com Vite na VPS.
- Revisão independente encerrada sem P1/P2 abertos. Um P2 de perda de foco foi reproduzido e corrigido antes da publicação; a primeira tentativa de correção também foi recusada pelo teste. Onze testes de autorização/publicação/recuperação passaram localmente e na VPS.
- Build produtivo e perfil herdado, guarda das 1.735 fontes, cinco HTTP com hashes exatos, quatro serviços ativos e hashes das unidades preservados passaram. Conteúdo do escritório permaneceu igual.

## Operação

Release: `/root/planeje-releases/atlas-call-notice-20261026-02`. Nova base de fontes e perfil para o próximo frontend: sua pasta `candidate`, com `source-manifest-next.json`/`source-keys-next.json` da release. Herda `/root/planeje-releases/webhook-source-filter-20261026-01/candidate`, inclusive Mini CRM e `.env.production.local` exclusivamente na VPS. Não promover `dist` antigo da raiz ou bundle de teste.

Main `index.b1ae809d.js` / `index.bc73e6cf.css`. Escritório `1ed69416`/`59ec53c3` preservado, assim como assets anteriores. [Abrir versão](https://planeje.jbapex.com.br/?v=b1ae809d#/caixa). Backups de fonte/HTML ficam privados na release. A publicação já foi consumida: não repetir `--publish` nem aplicar migrações anteriores.

A preparação 01 parou por falta de configuração ESLint antes do build e da promoção. A 02 usou a evidência local revisada e concluiu. Nenhum SQL, mudança de worker/unidade, restart, chamada de IA ou mensagem real de teste foi feito. Políticas, limites e leitura de mensagens não mudaram.

Não houve sessão autenticada produtiva usada como fixture nem teste em dispositivo físico. A regressão funcional foi verificada com dados sintéticos e rede isolada; a VPS recebeu conferência de fontes/artefatos/HTTP/serviços. Publicação técnica não equivale a aceite humano ou certificação do ciclo operacional inteiro do Atlas.
