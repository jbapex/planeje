# Executor externo Meta — contrato e evidência local

Data: 12/11/2026. Implementação local autorizada do executor Conversar. Este registro não comprova publicação, execução na Meta ou aceite humano de produção.

## Arquivos e responsabilidade

- `supabase/functions/_shared/atlasExecutorExternal.js`: preparação de atualização Meta; decisão e reconciliação de atualização e criação; callbacks persistidos por etapa.
- `supabase/migrations/20261112043423_atlas_executor_external.sql`: estado `executing`, aprovações e tentativas privadas, autorização atual, reserva atômica e recibos.
- `scripts/atlas-executor/external*.mjs`: fixtures isoladas, transporte SDK/Graph falso e PostgreSQL 16 descartável.

A migração depende da base `20261112032940_atlas_executor.sql` e das tabelas nativas de acesso do Tráfego. Não substitui o dispatcher SQL interno, a allowlist da base, o catálogo ou o endpoint. Essas integrações pertencem ao coordenador. O módulo consome os contratos novos de `metaWriteAuthorization.js`, `atlasMetaCampaign.js` e `atlasExecutorMetaCampaign.js`.

## API JavaScript para o endpoint

```js
prepareExecutorMetaUpdate(caller, {
  clientId, input, request, createCaller?, readToken, graphFetch?, signal?
}) // -> proposta normalizada

decideExecutorExternal({
  caller, service, request, createCaller?, readToken,
  id, revision, graphFetch?, signal?, now?
}) // -> item persistido; somente aprovação de ação externa

reconcileExecutorExternal({
  caller, service, request, createCaller?, readToken,
  id, graphFetch?, signal?, now?
}) // -> item; nunca faz POST na Meta

createExecutorExternalSteps({
  caller, service, request, item, sourceSessionId?
}) // -> {reserveStep, finishStep, get, current, sourceSessionId}
```

`caller` conserva o JWT real do usuário. `service` é um cliente distinto, usado somente nos três RPCs estreitos de ledger. Nunca é passado como usuário para guardas ou consultas de aplicação. `createCaller`, quando fornecido na atualização, recebe o mesmo cabeçalho Authorization da requisição. `readToken` é uma dependência exclusivamente do servidor. `now` serve à validação determinística de testes; não vem do modelo nem do corpo público.

O endpoint roteia `approve` de `gestor/update_meta` e `gestor/create_meta_campaign` para `decideExecutorExternal`. Rejeição e cancelamento de propostas continuam na decisão interna existente. `id` e `revision` são dados da revisão humana; o modelo não escolhe RPC, URL, conta de outro cliente ou operação arbitrária.

### Atualização de status ou verba

Entrada humana permitida:

```js
{
  account_id: "act_700",  // obrigatória e explicitamente vinculada ao cliente
  object_id: "1234567890123",
  level: "campaign" | "adset" | "ad",
  status?: "ACTIVE" | "PAUSED",
  daily_budget?: 9000,    // inteiro em unidades mínimas da moeda da conta
  lifetime_budget?: 9000
}
```

Somente um tipo de verba, somente para conjunto (`adset`), entre 100 e 100000000 unidades mínimas. A proposta usa `app: gestor`, `action: update_meta`, `operation: meta.update`; o payload aprovado fica `{adAccountId,objectId,level,...changes}`. A operação não depende da string `operation` para despachar.

A preparação não aprova, reserva ou escreve. Após provar usuário, sessão, cliente, campos e conta, faz GET fixo do objeto e da conta para conferir nível, identidade, status, verbas pertinentes e moeda. A fotografia inclui `currency` e `currency_offset`. O preview mantém valores inteiros e também valor decimal exato, por exemplo `9000 BRL` -> `90.00 BRL`, sem inferir a moeda pela interface. O link contextual é `/gestor-ia/clientes/<clientId>?conta=<accountId>`.

A execução aprova e reserva a tentativa no banco antes de buscar token e consultar a Meta. Compara a fotografia atual inteira com `before`. Mudança termina em `conflict`, sem POST. Revalida a autorização antes de cada GET, inclusive entre a leitura do objeto e a consulta da moeda, e imediatamente antes do POST. Faz um único POST com campos absolutos e host/caminho fixos; a releitura deve confirmar conta, objeto, nível, moeda e valores pedidos para concluir.

### Criação de campanha

A criação recebe apenas o `plan` canônico já produzido pelo adapter. Revalida moeda, ativos, autorização atual e programação antes da aprovação, e usa o planner real para as etapas `campaign`, `adset`, `creative`, `ad`. Campanha, conjunto e anúncio nascem pausados; ativação exige outra proposta. O ledger SQL deriva o corpo exato do plano aprovado e os IDs dos pais dos recibos concluídos. Alterar nome, verba, segmentação, criativo, status, conta, versão ou caminho na reserva é recusado.

Os callbacks têm o contrato:

```js
reserveStep({step, account_id, request: {method: "POST", path, body}})
// -> {claimed:true, state:"reserved", lease,...}
// ou {claimed:false, state, receipt?, error?, lease,...}

finishStep({step, lease?, state, receipt?, error?})
// -> linha persistida sem request, mais item atualizado
```

Cada GET/POST da execução de criação passa antes por `callbacks.current()`, que revalida o usuário real e a sessão original via caller. O transporte de criação impõe host, conta, versão, corpo e IDs recebidos; não admite URL livre. Etapas com recibo concluído são reutilizadas sem POST.

## RPCs e armazenamento

RPCs autenticados, sem concessão a `service_role`:

| RPC | Argumentos | Retorno |
| --- | --- | --- |
| `atlas_executor_external_approve` | `p_id uuid, p_revision integer` | `{item,source_session_id}` |
| `atlas_executor_external_status` | `p_id uuid` | `{item,source_session_id}` |

RPCs exclusivos do serviço, sem concessão a `authenticated` ou `anon`:

| RPC | Argumentos | Retorno |
| --- | --- | --- |
| `atlas_executor_external_reserve` | `p_item uuid,p_source_session uuid,p_step text,p_request jsonb` | tentativa com `claimed`, sem corpo de request |
| `atlas_executor_external_finish` | anteriores de identidade + `p_step,p_lease uuid,p_state text,p_receipt jsonb,p_error jsonb` | tentativa persistida + item |
| `atlas_executor_external_get` | `p_item uuid,p_source_session uuid` | `{item,steps}` sem corpos de request |

O serviço precisa ter `auth.role() = service_role` e `auth.uid() IS NULL`. Cada RPC revalida o proprietário persistido, a sessão de origem viva em `auth.sessions`, banimento, perfil ativo de equipe, dono/configuração habilitada do Atlas, módulos `assistant` e `paid_traffic`, cliente fechado, ACL nativa atual do Tráfego, vínculos ativos da conta, campo `meta_resumo` e, para verba/criação, `valor`. Não altera claims nem aceita delegação como autenticação do usuário.

As duas tabelas em `private` têm RLS habilitada e nenhum acesso direto concedido ao caller ou serviço:

- `atlas_executor_external_approvals`: item, UUID histórico da sessão, payload, fotografia, ação, conta e horário aprovados.
- `atlas_executor_external_steps`: chave única `(item_id,step)`, request exato, estado, lease, vencimento, recibo, erro seguro e horários.

A sessão histórica não tem FK que bloqueie logout ou apague o UUID. Exclusão ou expiração da sessão bloqueia qualquer transporte seguinte. As verificações reconsultam a sessão atual; o UUID histórico sozinho não autoriza nada.

Cada reserva bloqueia a linha do item dentro de uma transação curta. Não há transação aberta durante a rede. Duplo clique ou chamadas concorrentes recebem a mesma tentativa e somente uma delas recebe `claimed:true`. Payload, `before`, ação e sessão precisam continuar idênticos à aprovação. Recibos terminais aceitam somente replay exato. Recebido `verified:true` precisa ser booleano, e a atualização deve conter uma fotografia que confirme a alteração.

## Incerteza e experiência de recuperação

Uma reserva vale por três minutos. Seu vencimento muda a tentativa para `uncertain`, conservando request e lease; nunca cria nova reserva ou autoriza outro POST. O vencimento é materializado por `status/get/reserve`, sem cron.

| Situação | Estado e próxima ação |
| --- | --- |
| POST explicitamente recusado por erro definitivo | `failed`; não reenvia |
| Objeto mudou antes de POST | `conflict`; preparar nova revisão |
| Resposta, releitura ou recibo não confirmados | `uncertain`, ou `executing` com `external_unconfirmed` enquanto a reserva segue ativa |
| Reserva ainda ativa | Conferir retorna o estado atual, sem competir com tentativa em curso |
| Update incerto | Conferir faz somente GET do objeto conhecido; valor observado confirmado pode concluir |
| Criação incerta com ID conhecido | Conferir relê esse recibo e pais comprovados; não cria etapas ausentes |
| Criação reconciliada com etapas ausentes | Volta a `executing`; botão explícito **Continuar etapas aprovadas** chama a decisão para executar somente etapas ainda sem tentativa |
| Criação incerta sem ID | Permanece bloqueada; não procura por nome nem tenta criar novamente |

O botão **Conferir resultado** chama somente a reconciliação. Ações de continuação não devem ser disparadas automaticamente ao carregar a página. Permissão ou sessão revogada bloqueia consultas e execução até que o acesso válido seja restabelecido; não se troca de sessão para contornar a origem aprovada.

Erros persistidos contêm código controlado e mensagem local, sem texto upstream, tokens ou URLs de erro. Atualização confirmada por GET representa estado observado (`verification: observed_state`), sem afirmar que outro ator não possa ter aplicado o mesmo valor. Não existe transação atômica entre PostgreSQL e Meta, nem garantia de recuperação automática quando a Meta criou um objeto e nenhuma resposta com ID sobreviveu.

## Versão e prazos

O mutador e a criação usam `v25.0`. A verificação oficial de versão feita pelo coordenador via Context7 registrou fim de suporte da Marketing API v24 em 10/11/2026; v25 é a menor versão ainda suportada em 12/11/2026. Fontes: [changelog v24](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version24.0.md) e [versionamento](https://developers.facebook.com/docs/marketing-api/overview/versioning/). As leituras legadas de outras ações não foram migradas neste trabalho.

GETs têm limite de dez segundos e POSTs de quinze segundos, combinados com cancelamento recebido. A decisão externa propaga um limite total de 55 segundos e a reconciliação de 45 segundos às chamadas Graph, sem depender de `AbortSignal.any`. Os RPCs do cliente também precisam herdar o transporte limitado do endpoint; esse módulo não substitui o timeout da camada HTTP/Supabase. Timeout nunca autoriza repetição do POST.

## Validação local e limites

RED observado: RPC de aprovação inexistente e módulo externo inexistente antes das implementações correspondentes. GREEN final:

```sh
node --test scripts/atlas-executor/external.test.mjs scripts/atlas-executor/external.database.test.mjs
# 30/30: 15 testes Node; 14 casos PostgreSQL + contêiner do conjunto.

npx eslint supabase/functions/_shared/atlasExecutorExternal.js scripts/atlas-executor/external.test.mjs scripts/atlas-executor/external-fixture.mjs scripts/atlas-executor/external.database.test.mjs scripts/atlas-executor/external-database-fixture.mjs
# Sem ocorrências.
```

O PostgreSQL usa socket privado, porta lógica 55536 e `listen_addresses=''`; processo e dados descartados ao terminar. O fixture aplica a base real do executor, a migração externa real e funções reais atuais de sessão/acesso e ACL de Tráfego, sobre tabelas e identidades fictícias. Exercita concorrência em conexões distintas, revisão/sessão, grants, revogações, logout, rollback, payload/snapshot imutáveis, erros seguros, leases, recibos, requests exatos e quatro etapas reais do planner com replay.

Os testes Node usam o SDK Supabase real sobre transporte falso, planner/transporte de criação reais e respostas Graph fictícias. Cobrem execução de ambos os tipos, moeda, comparação antes, duplo clique, incerteza, perda de confirmação, recuperação GET-only, continuação de etapas restantes e revogação entre POST e GET. Não houve chamada à Meta, banco produtivo, consulta de segredo, envio real, migração remota ou publicação. A revisão e validação do endpoint/UI integrados continuam com o coordenador.
