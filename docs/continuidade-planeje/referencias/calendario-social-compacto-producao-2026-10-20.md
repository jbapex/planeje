# Calendário social — publicação do mês responsivo e cabeçalho compacto

Publicado em 20/10/2026, às 12h11 (America/Sao_Paulo), após a autorização específica de Josias “subir vps”. O “isso” anterior confirmou a direção visual; o aceite humano desta publicação ainda está pendente.

## Escopo efetivamente publicado

- `src/components/social/SocialPlanner.jsx`: mês com altura adaptada à área disponível, resumos compactos e lista completa do dia; barra de controles reorganizada.
- `src/components/social/SocialPlannerVisual.css`: grade responsiva, resumos e barra compacta.
- `src/components/social/SocialWorkspace.css`: título, seletor e abas mais compactos, mantendo toque e teclado.
- `src/components/social/SocialClientBoard.jsx`: posição estável do calendário ao trocar cliente, preservando mês e modo.
- `src/components/pages/SocialMedia.jsx`: apenas três alterações de cabeçalho sobre a versão produtiva — espaçamento, classe `social-ws-heading` e retirada do selo redundante “Publicações”.

A versão local completa de SocialMedia não foi promovida. Produção conserva suas seis abas. A aba Produção, novas filas, helpers operacionais, TaskDetail e a automação pós-aprovação permanecem fora desta entrega. No calendário, selecionar uma publicação abre o conteúdo; a tarefa segue acessível por uma ação explícita no detalhe.

## Base, concorrência e publicação

Release `/root/planeje-releases/social-compact-20261020-01`; candidata/base futura em `candidate`. Base anterior confirmada: `/root/planeje-releases/atlas-speaker-loop-20261020-01/candidate`, que já incorporava a atualização da identidade do Atlas. As fontes não foram extraídas do HEAD nem do dist antigo da raiz.

A candidata herdou 1.727 fontes e o perfil `.env.production.local` exclusivamente dentro da VPS. Guarda completa de fontes/HTML, hashes do publicador/manifesto, revisão e testes precederam a promoção. Foram publicados assets de nome imutável e cinco fontes; o index foi trocado atomicamente, com backups e recuperação. O publicador foi executado uma única vez. Não reaplicar.

Assets novos: `index.40625506.js` e `index.bc73e6cf.css`. SHA-256 do index: `213d77d32475e7f62da73a5b8f370d9a6ce22887d0a53be2828f214f357edba5`. Assets anteriores e HTML/bundle do Atlas Office preservados. Nenhuma unidade de serviço ou seu destino foi alterado.

## Verificação

- Cinco scripts Node da candidata remota passaram: socialPlannerItems, scheduleSocialComposer, taskChannelPublications, socialQueueOpen e socialMediaData (este com 12 casos).
- Vite compilou na VPS em 44,84 s; 12 artefatos conferidos, perfil herdado e marcadores de fixture ausentes. ESLint por stdin nos três JSX da candidata: zero erros; advertências de tamanho já existentes.
- Nove testes do publicador/recuperação passaram localmente e na VPS. Revisão independente confirmou exatamente os cinco arquivos, sem alterações operacionais nem bloqueadores.
- Mês: 1440×900, 1366×768, 1024×768 e 390×844 com toque; cinco/seis semanas, sete colunas, dia com nove conteúdos, detalhe, Escape/foco, troca de cliente preservando período, resize e contêiner limitado passaram. Em celular com cabeçalho do cliente, a grade inteira fica visível após rolar o cabeçalho.
- Cabeçalho: larguras 1440, 1024, 768, 390 e 320; busca, canal, semanal, teclado e zero overflow horizontal da página. Em 320, a faixa de situações usa rolagem própria. As duas matrizes terminaram sem erros JavaScript, requisições externas ou gravações.
- A fixture isolada foi adaptada à consulta de tipos já suportada em produção e à porta 4361. A primeira execução bloqueou imagens fictícias ainda apontando para a porta 4350; a URL foi corrigida só na fixture, e as matrizes passaram novamente. Nenhum ajuste de produto foi feito para contornar esses problemas de teste.
- Após publicação: 1.727 fontes e quatro respostas HTTP com hashes correspondentes (HTML principal, JS, CSS e Atlas Office). Quatro serviços Atlas ativos e hashes das unidades inalterados.
- Navegador autenticado carregou os assets novos e seis abas. A grade mostrou todos os 35 dias visíveis de outubro no viewport 1181×893, de y=200,67 a y=856,67, dentro do contêiner (limite y=883,33), sem overflow horizontal. A lista de um dia mostrou seus 11 conteúdos; um item abriu “Detalhes do conteúdo”. Busca filtrou e foi restaurada. Nenhum botão de salvar, aprovar ou publicar foi usado.

## Evidências e limites

Registro durável: [evidência da release](../evidencias/releases/calendario-social-compacto-2026-10-20.json). Logs, diffs, matriz e captura produtiva ficam em `.local/social-compact-release-20261020-01/`; cópia remota em `/root/planeje-releases/social-compact-20261020-01/`.

Não houve SQL, migração, Edge Function, cron, reinício de serviço, postagem de cliente, teste com IA ou alteração de credenciais. Não foi auditado novamente todo o sistema da agência. Aprovação persistente, agendamento automático, primeira publicação real e aceite de Josias continuam pendentes; a publicação visual não comprova esses fluxos.
