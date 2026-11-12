# Gestor IA — atribuição e agendamentos da semana

Estado: implementação e candidata local concluídas na branch `feat/gestor-ia-atribuicao`, a partir de `d64bef7`. Sem autorização de migração, backfill com gravação ou publicação produtiva nesta rodada. Preview conferido; promoção permanece dependente da aprovação posterior de Josias.

## Contrato e desenho

Manter a rotina, o editor e o Rastreamento existentes. Corrigir primeiro a identidade do anúncio no enriquecimento e oferecer backfill idempotente com dry-run. No Gestor, IDs prevalecem; nomes de campanha e conjunto só comprovam vínculo quando a combinação é inequívoca e não contradiz nenhum ID disponível. Duplicidade entre contas não autoriza escolher uma delas.

Links recebem os quatro campos opcionais pedidos, mantendo configuração e permissões atuais. A UTM Linktree é preservada; a classificação respeita o uso padrão Meta/Site congelado no link, com prioridade de Google/CTWA. Conta/campanha/conjunto são evidências separadas. A configuração fica registrada junto à atribuição do clique/mensagem, preservando histórico diante de edição posterior do link.

O modo atual continua pela entrada do lead. O novo modo `agendados_na_semana` usa eventos de marcação, uma ocorrência por contato na semana de America/Sao_Paulo: histórico automático por message_at e futuras transições manuais pelo log. Mostrar novos/antigos com a entrada; somente novos agendados atribuídos às linhas Meta com gasto conhecido entram no denominador de custo. Histórico manual ausente não será reconstruído a partir do estado atual ou updated_at.

Uma auditoria de transições atende os escritores manuais e o RPC automático, sem duplicar eventos. Gravação fica privada, RLS acompanha o contato e os leitores do Gestor mantêm módulo, carteira, canal, conversa privada e máscara antes da rede. Não alterar campanhas nem converter o preenchimento da IA em revisão validada.

## Evidência inicial, somente leitura

Na semana 09–15/11 da Impacto Noivas, a consulta agregada confirmou 70 leads novos, nenhum com campaign_id/adset_id, 15 com ambos os nomes e 15 com ad/source ID. O histórico automático confirmou 20 contatos marcados na semana: 14 novos e seis antigos. A revisão possui nove linhas. Esses números são o ponto de partida, não um resultado esperado imposto ao algoritmo.

Na baseline, get-ad-by-id pede e devolve somente nomes. O index bruto da VPS diverge do bundle efetivo da API clássica; uma futura publicação deverá preservar esse runtime e sobrepor apenas esta mudança, sem restaurar uma API antiga. A ficha atual consulta a mesma action para a imagem, mas descarta a identidade e não a grava. Reutilizar essa consulta, sem criar coleta repetitiva.

Testes usam fixtures e PostgreSQL descartável. O preview poderá reproduzir contagens reais com contatos, nomes de campanhas, IDs e gastos sintéticos. Nenhuma mensagem, telefone, token ou dump real será copiado para fixtures, documentos, logs ou ferramentas externas. Leituras produtivas desta investigação retornam somente agregados anônimos.

## Plano de implementação

### 1. Enriquecimento Meta e backfill

- Fontes: `supabase/functions/meta-ads-api/index.ts`, helper compartilhado de identidade, `src/lib/funilMetaCreative.js`, ficha atual e script operacional em `scripts/gestor-ia/`.
- Solicitar id/name/account_id da campanha e id/name do conjunto; conservar miniatura e demais contratos. Mesclar somente identidade ausente, com proteção contra troca de anúncio/conta e edição concorrente.
- Backfill exige cliente, usa dry-run por padrão, deduplica buscas por anúncio, limita lote, confere conta vinculada e relata somente quantidades. Não emitir credenciais, payloads ou identificadores pessoais. Aplicação somente após aprovação produtiva posterior.
- RED/GREEN: resposta Graph com IDs, legado apenas com nomes, merge preservando origem/miniatura, conflito, repetição sem nova gravação, limitação e dry-run sem writes. Conferir patch da candidata Edge sobre o bundle vigente.

### 2. Atribuição compartilhada do Gestor

- Fontes: `src/lib/gestorIaRoutine.js`, declaração de tipos, DTO SQL e consumidores UI/MCP.
- IDs primeiro; fallback exato normalizado por par campanha/conjunto e conta disponível. Usar universo completo da revisão para detectar ambiguidade antes de aplicar seleção de linhas. Etiquetar `por nome`; preservar os sem vínculo.
- Nomes de anúncio/campanha/conjunto entram na projeção segura, com máscara de texto e sem body/JID/payload livre.
- RED/GREEN: ID contraditório, nomes duplicados entre contas, seleção parcial, caixa/espaços, nome incompleto, UI/MCP iguais e telefone mascarado.

### 3. Links rastreáveis

- Fontes: tabela `cliente_rastreamento_links`, aba Links, helpers de clique/mensagem, webhooks e funções de origem.
- Campos opcionais `campaign_id`, `campaign_name`, `adset_id`, `adset_name`. Conservar primeiro toque e snapshot do clique; nunca atribuir por horário. Link sem configuração permanece sem conjunto.
- RED/GREEN: Linktree com/sem conjunto, default_origin meta_ads, configuração editada depois do clique, isolamento de cliente/canal e origem antiga preservada.

### 4. Agendados na semana

- Fontes: seletor compartilhado, leitor RPC, painel de leads existente, integração do editor e `gestor_ia_ver_leads`.
- `modo=entrada` mantém a coorte atual; `modo=agendados_na_semana` reúne eventos válidos dentro dos limites locais, deduplica contatos e distingue novos/antigos. Origem histórica sem gasto aparece em linha separada com gasto zero; campanha pausada é identificada pela evidência disponível, sem atribuir gasto ou estado Meta inventado.
- Custo usa somente novos. O mesmo conjunto de dados/semântica atende tela e MCP; não alterar o cálculo manual da rotina antiga.
- RED/GREEN: fronteiras de fuso, repetição, 14/6, agendamento posterior à entrada, campanha pausada/zero, sem origem, coorte antiga intacta.

### 5. Histórico de etapas

- Nova migration, sem editar/reaplicar as anteriores. Registrar contact_id/cliente_id, estado anterior/novo, motivo, ator e instante de cada troca real. Contexto automático vem do RPC; um único escritor evita duplicidade com o guard manual.
- Preservar opt-in, pausa manual, versão/configuração esperadas, idempotência por mensagem, grants e comportamento atual. A troca de etapa não dispara conversão comercial nova.
- RED/GREEN em PostgreSQL descartável: manual, RPC automático, mesma etapa, rollback, spoof de autoria, acesso de outro cliente/canal e somente um log por transição.

### 6. Integração e entrega

- Rodar testes dirigidos, regressões compartilhadas, check/build e revisão diferencial privada vinculada a hashes.
- Preview estático em porta livre de 127.0.0.1, banco isolado e rede externa bloqueada. Conferir antes/depois, estados, filtros e privacidade no navegador. O esperado 20/14/6 só é aceito se sustentado pelos eventos, não por números forçados.
- Registrar arquivos/migrations, comandos, limites e pendências; commit/push da branch. Entregar URL e aguardar OK depois do preview. Não promover `/var/www/planeje`, alterar runtime ou aplicar backfill/migration produtivos.

## Foco da revisão

IDs conflitantes e nomes ambíguos não podem trocar a atribuição; dados completos só na conversa autorizada. Eventos não podem duplicar custo ou usar a data futura do compromisso como data de marcação. O log não pode confiar em metadados editáveis pelo usuário nem ampliar visibilidade. O script não pode sobrescrever webhook/edição concorrente nem ampliar o token. O runtime efetivo da API clássica, o endpoint separado gestor-ia-meta/saved-v4 e os fluxos antigos permanecem preservados.


## Implementação e limites operacionais

A nova migration é `20261112145805_gestor_ia_atribuicao.sql`; não modifica migrations aplicadas. Acrescenta os quatro campos opcionais em `cliente_rastreamento_links`, um snapshot `link_attribution` nos novos cliques, a tabela `mini_crm_status_history` e índices de consulta semanal. O log usa `previous_status`, `status`, `reason`, `actor_id`, `actor_type` e `at`; o booleano de agendamento é congelado na transição, preservando a classificação se uma etiqueta for renomeada depois. As transições reais passam por um único trigger AFTER privado, depois do guard manual existente; o RPC automático fornece contexto confiável e restaura os GUCs. O guard continua SECURITY INVOKER, com os mesmos atributos e grants.

O leitor mantém a assinatura anterior de três argumentos e oferece a de quatro com `p_mode=entrada|agendados_na_semana`. A ferramenta `gestor_ia_ver_leads` aceita `modo` com os mesmos valores e retorna `summary`, `originRows`, nomes seguros, método do vínculo, coorte e instante da marcação. IDs conflitantes ou nomes ambíguos não são atribuídos. O universo inteiro da revisão participa da decisão antes do filtro de linhas. Google, manual e identificação incompleta continuam em `unmatchedLeads`.

A data da marcação automática vem de `mini_crm_message_history.message_at`, reason `appointment`; a manual vem do novo ledger, relógio do servidor e ator humano. Não inferir marcação histórica por tag atual, data futura de visita ou `updated_at`. Campanha pausada aparece somente com estado confirmado no catálogo Meta já salvo; a linha histórica é de consulta, com gasto zero, sem escrever na revisão. Em recorte parcial, outras origens históricas não são incluídas. O CPA exclui agendados antigos, sem vínculo e fora das linhas com gasto Meta conhecido.

O script operacional é `scripts/gestor-ia/backfill-meta-attribution.mjs`. Exige cliente e período, máximo de 93 dias, até 500 contatos por lote (100 padrão), GET deduplicado por anúncio, conta vinculada e CAS por `updated_at`. Não há paginação automática de todo o histórico; ampliar a cobertura exige recortes menores/execuções posteriores. O padrão é dry-run; `--apply` exige autorização produtiva específica depois do preview. Não usar a opção de gravação nesta entrega.

```sh
node scripts/gestor-ia/backfill-meta-attribution.mjs --cliente 9196d07f-f0a8-4eb2-9f9a-3dade28d4a69 --since 2026-11-09 --until 2026-11-15 --limit 100
```

Credenciais ficam no ambiente operacional existente, nunca no comando, relatório ou repositório. O relatório emite apenas contagens e a flag de truncamento. Um conflito, conta desvinculada ou versão concorrente não autoriza escrita.

## Antes e depois da Impacto

Leituras produtivas nesta rodada foram agregadas e somente de leitura, com timeout e sem transportar contatos ou mensagens. A operação permaneceu ativa durante a implementação; por isso as duas medições diferem.

| Medida, semana 09–15/11 | Primeira investigação | Consulta posterior de 12/11 |
| --- | ---: | ---: |
| Leads novos | 70 | 78 |
| Com campaign_id e adset_id | 0 | 0 |
| Com par de nomes | 15 | 15 |
| Vínculo único recuperável por nome nas nove linhas | 14 | 14 |
| Pares ambíguos nas nove linhas | 0 | 0 |
| Contatos agendados pelo histórico da semana | 20 | 22 |
| Novos entre os agendados | 14 | 15 |
| Antigos entre os agendados | 6 | 7 |
| Agendados com par único nas linhas da revisão | 4 | 4 |

O antes/depois do seletor para a fotografia atual é **0 → 14 entradas com conjunto**, por nome. No novo modo semanal, **22 pessoas permanecem visíveis: quatro atribuídas e 18 sem vínculo**. Ausência de identidade não é preenchida por suposição. A produção ainda tem zero IDs porque não houve aplicação da candidata ou backfill com gravação. O preview usa contatos e campanhas sintéticos para reproduzir essas contagens; não é um espelho de dados pessoais reais.

## Candidata Meta

A candidata Edge privada é composta sobre a cópia efetiva de 233.287 bytes, SHA-256 `29f9a787d3255e2b858eaa0b718c1e11b8c011e7a0cd00d75b128520ee687e38`. O compositor `scripts/gestor-ia/patch-meta-runtime.mjs` exige hash integral e AST da action única; só insere o helper e muda fields/identidade dentro de get-ad-by-id. Os demais bytes são preservados. O endpoint separado de métricas salvas não é alterado.

O helper reconhece também `adId`; conflito com `source_id` bloqueia merge, ficha e backfill. A candidata local possui SHA-256 `52887b2510a100f763513bc516384e64855a2532c3dd5180ed440f47c3fdee23`, 238.407 bytes, e receipt privado validado. Candidata e receipt privados não entram no Git. A baseline de código, sem credenciais ou dados, é versionada somente como fixture de teste em `scripts/gestor-ia/fixtures/meta-ads-api-runtime-baseline.ts.txt`; isso torna os testes reprodutíveis sem depender de `.local`. O compositor operacional continua exigindo a cópia privada do runtime e seu hash exato, sem usar a fixture como fonte de publicação. Um runtime produtivo futuro diferente exige nova composição revisada, sem substituir o index inteiro por uma fonte antiga.


## Verificação final

| Comando / conferência | Resultado observado |
| --- | --- |
| `npm run check` | Passou: contexto, quatro harness, lint/typed/tipos/regras, 83 locais, Tráfego, 130 MCP e build Vite 4.5.14. Lint conserva avisos preexistentes. |
| `npm run test:gestor-ia` | 104/104 e 76 verificações do editor real; sem falhas ou skips. |
| `python3 scripts/gestor-ia/verify-attribution-database.py` | 23/23 grupos SQL em cluster descartável, sem DSN externo. |
| `npm run test:gestor-ia:e2e` | 5/5: MCP/UI/SQL reais, validação humana, snapshots 70/20 e 78/22, ambiguidade e pausada. |
| Regressões Tráfego/Mini CRM/Rastreamento | 42/42 testes do conjunto dirigido de 14 arquivos; inclui os casos internos de webhooks e regras. |
| Revisão diferencial privada | Dois P2 reproduzidos e corrigidos: alias adId conflitante e nomes mascarados; nenhum P0/P1/P2 aberto no recorte. |
| Navegador, prévia estática 4395 | 14 vínculos por nome; 22 agendados=15 novos+7 antigos; quatro atribuídos/18 sem vínculo; filtro antigos e busca últimos quatro dígitos; console sem erros e sem overflow no viewport observado 1422×800. |
| Dry-run real do backfill | 78 lidos, 16 elegíveis, 62 sem anúncio, oito GETs Graph, nenhuma falha/conflito/limite/truncamento e zero writes. |

O primeiro `check` parou por dois relatórios históricos que existiam no checkout anterior, mas faltavam nesta branch. Foram recuperados integralmente das cópias existentes, após validação de JSON/hash e inspeção de segredos: `toolkit-setup-local-2026-10-17.json` (SHA `7640ce635afc041fd7a306da373180fab356c30b5bca0ee610580b2cf85e64bd`) e `toolkit-revalidation-local-2026-10-17.json` (SHA `342d0b698a58565ab7033002916355425203ffb20c05c2c0d0b3f26d5de754da`). Nenhum teste/regra foi enfraquecido; o check completo seguinte passou.

O dry-run produtivo não usou `--apply`. Credencial e token permaneceram apenas na memória do processo remoto; o transporte permitiu GET das duas tabelas, uma leitura da credencial existente e GET Graph, bloqueando mutações e RPCs extras. Foram 17 leituras de banco, uma leitura da credencial e oito consultas Graph, sem transporte de payload pessoal para este relatório. **16 elegíveis para enriquecer IDs não significam 16 conjuntos dentro das nove linhas da revisão**; essa atribuição será recontada depois de uma aplicação autorizada.

A revisão preserva a rotina antiga e os caminhos de Rastreamento, salvo a correção explícita da classificação do Linktree configurado como Meta. A lista continua mascarada; a ficha completa só é buscada ao abri-la com acesso vigente.

## Preview e pendências

[Prévia da semana da Impacto (sintética)](http://127.0.0.1:4395/gestor-ia/rotina?semana=2026-11-09&cliente=9196d07f-f0a8-4eb2-9f9a-3dade28d4a69). Selecione as linhas, abra **Ver leads** e alterne **Agendados na semana**. A aba entregue já fica aberta nesse painel. [Como reiniciar a prévia](../../../scripts/gestor-ia/neuro-preview/README.md).

Não houve promoção de `/var/www/planeje`, migração produtiva, troca do runtime ou backfill com gravação. O working tree de `/root/planeje` não recebeu checkout/reset. Não foram certificados uso produtivo após promoção, janela de carga de toda a carteira, interface de celular real ou recuperação de marcações manuais anteriores ao ledger. Falta o OK de Josias depois de ver esta prévia; nenhuma autorização antiga o substitui.


## Arquivos desta entrega

Manifesto de 60 arquivos, comparado à base `d64bef7`. [Evidência estruturada, hashes e resultados](../evidencias/releases/gestor-ia-atribuicao-local-2026-11-12.json). A fixture Meta é somente código de baseline, não dados ou um bundle para promover.

### Aplicação e MCP

- `planeje-mcp/src/gestorIaRoutineTools.ts`
- `src/components/crm/RastreamentoLeadFicha.jsx`
- `src/components/crm/RastreamentoTrackableLinks.jsx`
- `src/components/gestor-ia/GestorIaRoutine.css`
- `src/components/gestor-ia/GestorIaRoutine.jsx`
- `src/components/gestor-ia/GestorIaRoutineLeads.jsx`
- `src/components/gestor-ia/gestorIaRoutineData.js`
- `src/components/traffic/TrafficCampaignMetrics.jsx`
- `src/lib/funilMetaCreative.js`
- `src/lib/gestorIaRoutine.d.ts`
- `src/lib/gestorIaRoutine.js`
- `src/lib/rastreamentoTrackableLink.js`

### Migration

- `supabase/migrations/20261112145805_gestor_ia_atribuicao.sql`

### Edge e helpers

- `supabase/functions/_shared/metaAdEnrichment.js`
- `supabase/functions/_shared/rastreamentoMessageAttribution.js`
- `supabase/functions/_shared/rastreamentoTrackableLink.ts`
- `supabase/functions/meta-ads-api/index.ts`
- `supabase/functions/rastreamento-link-redirect/index.ts`

### Testes, preview e operação

- `planeje-mcp/scripts/gestorIaRoutine.test.ts`
- `scripts/gestor-ia/attribution-database-checks.sql`
- `scripts/gestor-ia/attribution-database-fixture.sql`
- `scripts/gestor-ia/attribution-events.test.mjs`
- `scripts/gestor-ia/attribution-mcp.e2e.test.mjs`
- `scripts/gestor-ia/attribution.component.test.mjs`
- `scripts/gestor-ia/attribution.test.mjs`
- `scripts/gestor-ia/backfill-meta-attribution.mjs`
- `scripts/gestor-ia/backfill-meta-attribution.test.mjs`
- `scripts/gestor-ia/fixtures/meta-ads-api-runtime-baseline.ts.txt`
- `scripts/gestor-ia/link-attribution.component.test.mjs`
- `scripts/gestor-ia/link-attribution.test.mjs`
- `scripts/gestor-ia/meta-enrichment.test.mjs`
- `scripts/gestor-ia/meta-runtime.test.mjs`
- `scripts/gestor-ia/neuro-preview/README.md`
- `scripts/gestor-ia/neuro-preview/attribution-current.sql`
- `scripts/gestor-ia/neuro-preview/attribution.mjs`
- `scripts/gestor-ia/neuro-preview/attribution.sql`
- `scripts/gestor-ia/neuro-preview/bridge.mjs`
- `scripts/gestor-ia/neuro-preview/db.mjs`
- `scripts/gestor-ia/neuro-preview/fixture.sql`
- `scripts/gestor-ia/neuro-preview/main.jsx`
- `scripts/gestor-ia/neuro-preview/scenario.mjs`
- `scripts/gestor-ia/neuro-preview/server.mjs`
- `scripts/gestor-ia/neuro-preview/static-server.mjs`
- `scripts/gestor-ia/neuro-preview/static.mjs`
- `scripts/gestor-ia/patch-meta-runtime.mjs`
- `scripts/gestor-ia/routine-data.test.mjs`
- `scripts/gestor-ia/routine.test.mjs`
- `scripts/gestor-ia/verify-attribution-database.py`
- `scripts/rastreamentoOriginConsistency.test.mjs`

### Comandos e continuidade

- `AGENTS.md`
- `docs/continuidade-planeje/01-ESTADO-ATUAL.md`
- `docs/continuidade-planeje/03-DECISOES-E-REGRAS.md`
- `docs/continuidade-planeje/07-PENDENCIAS-E-PROXIMOS-PASSOS.md`
- `docs/continuidade-planeje/README.md`
- `docs/continuidade-planeje/evidencias/releases/gestor-ia-atribuicao-local-2026-11-12.json`
- `docs/continuidade-planeje/evidencias/releases/toolkit-revalidation-local-2026-10-17.json`
- `docs/continuidade-planeje/evidencias/releases/toolkit-setup-local-2026-10-17.json`
- `docs/continuidade-planeje/referencias/gestor-ia-atribuicao-2026-11-12.md`
- `docs/quality.md`
- `package.json`
