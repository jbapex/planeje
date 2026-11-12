# Calendário social visual — entrega local de 18/10/2026

**Publicação posterior:** [versão produtiva de 18/10/2026, 13h34](calendario-social-visual-producao-2026-10-18.md). As seções abaixo registram a etapa local anterior.

Josias escolheu a versão **Calendário visual** da proposta interativa. Prioridade declarada: experiência visual e confiança no agendamento; regras detalhadas podem vir depois. Direção acordada: responsável pelo cliente aprova, aprovação deve disparar agendamento e cada rede pode ter legenda/data/horário próprios. A escolha visual não comprova aceite da implementação nem funcionamento produtivo do envio.

## Recorte implementado localmente

- Calendário geral da agência ou por cliente; semana de sete dias com navegação semanal e mês preservado.
- Miniaturas com fallback, busca, canal, situação e painel do conteúdo selecionado. Seleção por teclado; painel mostra os canais da mesma tarefa, inclusive horários distintos, e abre a tarefa/publicações existente.
- Publicado em uma rede não encobre outra rede pendente/falha no mesmo slot. Filtro por rede é aplicado antes do agrupamento.
- `scheduled` sem contrato de envio aparece como **Horário definido**, na fila visual de Planejados. Instagram com `meta_dispatch.hold` e instante válido é **Agendado no Planeje**; Facebook com identificador Meta é **Agendado na Meta**. Esses rótulos descrevem registros; não certificam saúde atual da conexão/cron nem entrega futura.
- Publicado manualmente aparece como **Publicação informada**; identificador de publicação da integração distingue o retorno da integração. Não validamos retrospectivamente os links existentes.
- Facebook já agendado na Meta não permite arraste que só alteraria a data local. Os caminhos operacionais existentes seguem na tarefa/editor; não foi criado outro serviço de postagem.
- TikTok/YouTube ficam explicitamente como envio automático ainda não integrado.

## Verificação e revisão

`node scripts/socialPlannerItems.test.mjs`: regressões novas falharam antes da correção e passaram depois. Regressões de `scheduleSocialComposer`, `taskChannelPublications`, `socialQueueOpen` e os 12 casos de `socialMediaData` passaram.

Prévia Vite em `scripts/social-planner-preview/`, porta local 4348, Supabase/auth fictícios, gravação e invocação externa bloqueadas. `verify.cjs` usa Playwright fornecido pelo ambiente via `PLAYWRIGHT_MODULE`; `OUTPUT_DIR` opcional recebe capturas. Navegador conferiu 1440, 1024 e 390 px: semana/mês, navegação, seleção por teclado, canais mistos, filtro por rede, vazio, busca, tema e ausência de overflow horizontal. Fixture `?stress=1` verifica diálogo “+ mais”, com cores próprias fora do calendário. Nenhuma solicitação externa ou erro de execução.

Lint dirigido: zero erros; aviso de arquivo grande de `SocialPlanner.jsx` permanece (arquivo reduzido nesta mudança). Build temporário passou, sem modificar ZIP/dist operacionais. Diff check dos arquivos desta tarefa passou; whitespace preexistente em documentação alheia não foi alterado.

Revisão independente somente leitura encontrou filtro cruzado de canal e datas adjacentes invisíveis no mês móvel; ambos corrigidos e cobertos no navegador. Portal do diálogo também corrigido; revisor confirmou os ajustes e não relatou novas regressões pertinentes. Context7 consultado para date-fns; resultado usa documentação corrente, e a implementação conservou imports/opções presentes em date-fns 2.30.0 instalado, sem migração de versão.

## Pendências e limites

Entrega **somente local**, não publicada. Nenhum SQL, cron, credencial, produção ou publicação de cliente foi alterado. O painel abre o editor operacional existente; edição inline, adaptação da legenda por rede e aprovação que dispara agendamentos ainda precisam de implementação/validação próprias. Não declarar o fluxo completo ou envio automático certificado a partir desta prévia. Validar conexão/permissões, processamento e confirmação em um ciclo autorizado antes de uso produtivo como agendador garantido.

Plano do recorte: [calendário visual](../../superpowers/plans/2026-10-18-calendario-social-visual.md).

## Correção da rolagem da prévia

Após a captura de Josias mostrando o mês congelado, teste com roda do mouse reproduziu a falha. A prévia importava o layout global (`html/body/#root` com altura de viewport e overflow bloqueado), mas seu contêiner não tinha rolagem interna. Adicionado `height: 100%`, `minHeight: 0` e `overflowY: auto` somente no contêiner de `scripts/social-planner-preview/main.jsx`. O layout global e a produção não foram alterados. A validação anterior de navegação/cliques não cobria rolagem física; `verify.cjs` agora verifica a roda do mouse, incluindo fim e retorno ao topo do mês nas três larguras.
