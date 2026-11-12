**Atualização posterior:** publicação autorizada e realizada em 18/10 às 02h27; ver [estado produtivo e validações pendentes](atlas-gerente-operacional-producao-2026-10-18.md). O texto abaixo preserva o estado da entrega local anterior à publicação.

# Atlas gerente operacional — entrega local de 18/10/2026

Implementação autorizada por Josias com “vamos codar”, após o
[desenho](../../superpowers/specs/2026-10-17-atlas-gerente-operacional-design.md)
e executada pelo [plano](../../superpowers/plans/2026-10-17-atlas-gerente-operacional.md).
Código, revisão e testes locais concluídos. Publicação, migração produtiva,
uso com pessoas reais e aceite operacional permanecem pendentes.
[Evidência estruturada](../evidencias/releases/atlas-gerente-operacional-local-2026-10-18.json).

## Comportamento implementado

- A consulta pessoal lê fontes e, quando necessário, registra pergunta interna
  ligada à missão, conversa e sessão de origem. `waiting_team` não bloqueia
  nova mensagem. A resposta volta à mesma conversa com pessoa, data e limite
  da evidência; o botão abre o chamado exato no robô.
- Uma ordem explícita do dono entra no esclarecimento com a conta e usa a
  criação/vínculo de Tarefas já existente. Ideia hipotética não vira execução.
  Demanda de origem pessoal não inventa mensagem ou finding de WhatsApp nem
  solicita o repasse manual antigo novamente.
- Tarefas abertas prioritárias passam à reconciliação do gerente existente.
  Executor único válido recebe acompanhamento; conta esclarece ambiguidades.
  Não são alterados responsável, etapa, prazo ou conclusão oficiais por relato.
- Contatos automáticos respeitam expediente da agência/pessoa e dias úteis
  em São Paulo; fora do horário, ficam agendados. O dono pode consultar e
  organizar uma ordem fora do expediente.
- Memórias anteriores continuam privadas. O dono pode autorizar cada memória
  de cliente para uso com aquela equipe; memória global não é compartilhável.
  A pergunta à equipe é preparada num contexto separado, sem missão, histórico,
  pergunta livre ou parecer privado do núcleo pessoal. Só recebe cadastro
  operacional mínimo, tarefa exata e conhecimento explicitamente compartilhado.
  Para organizar uma nova ordem, recebe também a instrução literal atual do
  dono, sem o histórico. A chamada usa o mesmo provedor/modelo e contabilização
  da missão; nenhuma chamada real foi executada nos testes.
- Sessão revogada, cancelamento, cliente/tarefa/conta/pessoa trocados impedem
  resposta tardia como sucesso. A tarefa oficial já organizada continua em
  acompanhamento após logout do dono. Replay, inclusive com pergunta
  parafraseada, reutiliza a conversa; ordens distintas preservam suas origens.
- Áudio histórico sem transcrição fica separado de áudio novo pendente.
  Referência essencial ausente continua explícita. Cinco assuntos exatos não
  significam excesso; `has_more` agenda continuação com as fontes preservadas,
  inclusive além da janela histórica, e recuperação após falha de publicação.
  Repetir assuntos sem avançar interrompe o loop, conservando a lacuna.
- Grupo exige vínculo explícito. Registros por canal distinguem publicação
  registrada pela integração, publicação relatada e execução ainda sem prova.
  `external_verification=false`: não houve consulta atual da rede social nem
  conferência automática de conteúdo/qualidade.

## Validação reproduzível

```sh
python3 scripts/atlas-manager-integration/verify.py
node --test scripts/atlasManager.test.mjs scripts/atlasPortfolio.test.mjs scripts/atlasConsultationPresentation.test.mjs
PYTHONPATH=scripts/atlas-events python3 -m unittest test_context test_continuation test_claim_freshness test_model_context
PYTHONPATH=scripts/atlas-team-pilot python3 -m unittest test_manager test_rules
npm run check
```

Resultados: 48 checks SQL, 29 testes Node, 82 de contexto/continuação e 43 de
decisão/horário Python passaram. O check canônico passou: contexto, harness,
lint, lint tipado, tipos, regras, testes locais e build temporário. Avisos
legados de lint/tamanho de bundle permanecem; regras não foram relaxadas.

O SQL sobe e remove PostgreSQL local descartável, somente socket Unix em
`/tmp`, com migrações reais sobre esquema mínimo fictício. Não aceita DSN.
Não comprova Auth/PostgREST nem infraestrutura produtiva. Não rodar scripts
remotos antigos como atalho de QA.

Prévia: Vite com `scripts/atlas-manager-integration/preview/vite.config.mjs`,
somente `127.0.0.1:4341`; `verify-ui.mjs` usa Playwright/Chrome existentes,
com `ATLAS_PLAYWRIGHT_MODULE` e `ATLAS_CHROME_PATH` apontados ao runtime local.
Sete verificações passaram: espera sem bloquear escrita, abertura pelo teclado
do chamado exato/agendado, retorno substituindo espera, compartilhamento e
falha de gravação preservando permissão anterior, memória global privada,
largura móvel e ausência de exceções/requisições externas.
Capturas computador 1440×1000 e celular 390×844 foram inspecionadas.
Logs/capturas ficam em `.local/atlas-manager-implementation/`, sem dados reais.

## Revisão e limites

Revisão independente com differential-review contra snapshots anteriores ao
trabalho, e não apenas HEAD, pois o checkout já tinha entregas não commitadas.
Cinco achados materiais corrigidos e rechecados: tarefa mudada de cliente,
paráfrase de memória privada, retenção/recuperação da continuação, duas ordens
simultâneas e deduplicação independente da redação. Nenhum bloqueador local
aberto. Relatório privado fora do repositório, em `.codex/reviews/`.

A linguagem real da IA, custo real, concorrência produtiva, feriados e primeiro
ciclo humano não foram certificados. Áudio definitivamente indisponível não
foi inventado/transcrito; lacunas essenciais continuam pedindo esclarecimento.
Os cadastros ausentes encontrados na auditoria de 17/10 não foram alterados:
confirmar conta/grupo antes de esperar cobertura de toda a carteira. Memórias
privadas antigas precisam de autorização explícita por conteúdo.

## Próxima publicação

Uma migração nova: `20261018014504_atlas_manager_operational_loop.sql`, aplicada
somente na fixture local. Nunca reaplicar migrações já presentes nas releases.
Com autorização específica de publicação, ler operação/release vigente,
conferir concorrência e fontes, compor candidata com perfil/flags produtivos,
inclusive `.env.production.local`, e validar contrato de migração/funções e
workers antes da promoção. Não promover `dist` antigo da raiz.
Depois, validar ciclo autorizado com conta/executor, resposta retornando ao
dono, prazo útil e conferência de entrega. Sem isso, animação e contadores não
comprovam gerência real.
