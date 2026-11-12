# Gestor IA / Neuro — preenchimento MCP e validação humana

Estado: implementado e publicado em 12/11/2026, às 09h25 de Brasília, na release `gestor-neuro-20261112-01`, por autorização explícita de Josias (“publicar vps”) depois do preview nesta conversa. Branch `feat/gestor-ia`, produto aprovado no commit `000f39c`; publicação composta sobre a base produtiva mais recente, `crm-ia-base-secoes-20261112-01`. O aceite de uso após publicação permanece separado.

## Contrato e desenho

Manter `traffic_weekly_reviews` e `TrafficWeeklyReviewEditor`; preservar `/paid-traffic/rotina`. Acrescentar origem/estado e histórico, sem uma nova planilha ou motor de tarefas. IA sempre grava rascunho; somente equipe humana autenticada conclui/valida pelo fluxo oficial. Semana validada bloqueia escrita IA até reabertura humana.

As cinco ferramentas MCP têm nomes e argumentos definidos por Josias. Usam carteira, módulos e `central_trafego_can_access_client`; somente consultas locais ao banco. Nenhuma chamada Meta/Google ou mudança de campanhas. Serviço MCP escreve por RPC restrita ao serviço com ator aprovado e verificação transacional de versão.

Leads seguem a primeira entrada na semana de Brasília. Agendamento CRM exclui negações. Confirmação explícita de data/hora na conversa é evidência separada com alerta de CRM desatualizado; não altera tags. Telefones aparecem mascarados na lista/resposta MCP; a ficha autorizada carrega o contato ao abrir. Leads sem correspondência Meta aparecem separadamente, sem atribuição por nome.

`ver_mensagens_rastreamento` recebe `chat_jid` e reutiliza o leitor paginado existente de conversas/grupos, com isolamento de cliente.

## Plano de implementação e aceitação

1. Recuperar fontes publicadas para checkout separado, conferir hashes e registrar baseline Git. Preservar os checkouts originais.
2. Acrescentar migration com origem/estado, fronteira humano/IA, histórico e RPCs. Testar ACL, versões, semana validada, reabertura, rollback e legado em PostgreSQL descartável.
3. Registrar/testar as cinco ferramentas MCP e filtro de grupo; nenhuma ferramenta pode concluir a revisão.
4. Compartilhar seleção, máscara e sinais de agendamento entre interface e MCP; testar coorte, negações, confirmação/cancelamento e dados sem vínculo.
5. Acrescentar selo, filtro, sugestão e Validar no editor existente. Conferir fluxo antigo, rascunhos e permissões.
6. Preview isolado em 127.0.0.1, com Impacto Noivas `9196d07f-f0a8-4eb2-9f9a-3dade28d4a69`, semana 2026-11-09 e dados sintéticos. Provar rascunho pelo MCP e validação exclusivamente humana; sem banco produtivo.
7. Revisão diferencial, testes dirigidos/check/build; commit e push da branch. Entregar link, arquivos/migration, resultados e limites, aguardando OK posterior ao preview.

## Decisões técnicas do implementador

Campos propostos: `fill_origin`, `validation_state`, `ai_suggestion`; histórico com `actor_type`. Validação mantém exigências existentes de análise, próxima ação e semana encerrada. O relógio do ensaio ponta a ponta poderá simular a semana encerrada, sem alterar a data produtiva.

A cópia GitHub está em maio; a baseline produtiva traz as dependências posteriores necessárias à rotina. A recuperação foi identificada em commit separado. Não trazer ambiente, credenciais, dumps ou dados de clientes da VPS.

## Entrega e verificação

- A baseline publicada foi recuperada por hashes no commit `37e49383b104f2a41911da436a13f8d55635cc60`, já enviado à branch `feat/gestor-ia`. Nenhum checkout/reset nos diretórios originais. A base GitHub era `c16f50234110da2a45a049963c3041cdc103a206`, de 03/05/2026; por isso a recuperação inclui dependências e funcionalidades publicadas depois dessa data. O manifesto registra 2.149 fontes frontend e 37 MCP; nove arquivos locais de metadados do CLI não foram versionados.
- Mantidos a tabela, o editor, o salvamento, o histórico e as tarefas oficiais. A IA não valida, reabre, escolhe uma tarefa sucessora nem altera campanhas. O humano continua sujeito aos requisitos oficiais de análise, próxima ação e semana encerrada.
- Cinco ferramentas MCP registradas no catálogo/políticas e OAuth, que passa a 64 ferramentas. Sessão pessoal ativa da equipe obrigatória; uma chave administrativa sem pessoa identificada é recusada. Edição exige a `revision` lida; omissão somente para criar registro novo. Não existe ferramenta MCP de validação.
- A proteção de telefone ocorre no banco, antes da resposta da lista: nomes com números são mascarados, JID/payload/UTMs livres são omitidos e a projeção conserva apenas identificadores necessários. Mensagens viram vocabulário limitado de agendamento/data/hora/modalidade, sem corpo integral. O mesmo classificador JS é usado no MCP e na tela. Origem explícita, Linktree/site e sinais legados foram preservados.
- `npm run check` passou: contexto, harness, lint, lint tipado, tipos, regras, testes locais e build temporário. Lint mantém 354 avisos e o tipado 11, sem erros. As suítes do check registraram 4 testes do harness, 83 do grupo local e 127 MCP, além dos scripts operacionais locais. Build compilou em 43,87s.
- Rotina: 18 testes de modelo/adaptador e 76 verificações React passaram. Cada ferramenta nova tem testes; 19 testes MCP dirigidos passaram, além das 31 regressões de mensagens/grupo/cursor. Mini CRM e Indicadores compartilhados passaram.
- Banco: dez grupos passaram em PostgreSQL descartável, incluindo ACL/sessão/banimento, gerador sem JWT, legado, validação humana, reabertura, histórico, rollback e disputa real de versão. Coorte de 1.001 contatos e pipeline SQL/classificador JS também passaram. Advisors de segurança no banco descartável: zero erros.
- E2E final `npm run test:gestor-ia:e2e`: 1/1 passou. Usa servidor MCP real em memória, SDK instalado, SQL canônico e leitores reais da interface. Salva o cliente/semana solicitados como IA, comprova tarefa pendente, valida por sessão humana, bloqueia nova escrita IA, reabre por edição humana e devolve outro rascunho. A resposta HTTP bruta também é conferida contra telefones/JIDs/payloads livres.
- CUA: filtro de rascunhos, selo, sugestão, três leads Meta, dois sem vínculo, máscara e alerta CRM conferidos. O botão Validar concluiu uma revisão sintética e o filtro Validados exibiu o cliente. A candidata final foi reiniciada apenas com outro banco sintético e ficou como `rascunho_ia`, para Josias testar. Formato estreito observado: 355 CSS px, sem transbordamento do ambiente da aplicação, com rolagem própria da tabela. Viewport restaurado.
- Revisão diferencial privada: três P2 identificados, corrigidos e reverificados; nenhum P1/P2 pendente. O relatório privado vincula cinquenta hashes de fontes e descreve limites. Nenhum upload de código para auditoria externa.

Os scripts/configurações de qualidade locais já existentes foram recuperados porque os manifests da VPS não continham os comandos documentados. Requisitos de React, Vite, Supabase e SDK MCP preservados; TypeScript e o override de segurança já existentes no checkout foram mantidos, sem trocar provedor/modelo/autenticação.

## Preview e operação local

Abra [o painel](http://127.0.0.1:4394/gestor-ia/rotina?semana=2026-11-09) ou [o rascunho de Impacto](http://127.0.0.1:4394/gestor-ia/rotina?semana=2026-11-09&cliente=9196d07f-f0a8-4eb2-9f9a-3dade28d4a69). São dados inteiramente sintéticos. Somente a fixture usa 16/11/2026 para que a semana 09–15/11 esteja encerrada. O nome/ID pedidos identificam o exemplo, sem copiar registros reais do cliente.

Na raiz da branch: `npm run preview:gestor-ia`. Exige dependências instaladas e PostgreSQL local no PATH; não aceita DSN. O servidor atende apenas 127.0.0.1:4394, com rede externa bloqueada, assets estáticos e banco em socket privado. Reiniciar recria somente o banco descartável próprio. O [README do preview](../../../scripts/gestor-ia/neuro-preview/README.md) documenta os comandos e a limpeza.

A primeira prévia de desenvolvimento teve módulos Vite com hashes misturados/HTTP 504. Foi substituída pela candidata compilada, com testes automáticos de página/assets/MIME/API; o processo antigo foi encerrado. A nova candidata não usa HMR. Estado do processo é evidência temporal, não serviço permanente.

## Migration e pendências

Única migration nova: `supabase/migrations/20261112043818_gestor_ia_routine_mcp.sql`. Acrescenta origem/estado/sugestão, autoria/campos alterados no histórico, guardas e RPCs. Foi aplicada uma vez em produção na publicação autorizada das 09h25, depois dos ensaios descartáveis. Não reaplicar esta migration nem as anteriores.

A autorização posterior ao preview foi dada por Josias e a publicação técnica está concluída. Faltam a homologação externa do Neuro com sua sessão pessoal e o volume produtivo. Não houve preenchimento ou validação de semana real, teste de IA externa, coleta Meta/Google nem celular físico nesta entrega; o reconhecimento de confirmação é conservador e não entende todas as formas de linguagem.

Os processos e hashes da prévia constam na evidência local histórica. A publicação posterior está no registro abaixo: houve promoção de frontend/MCP e a única migration autorizada; não houve coleta publicitária, envio ou preenchimento de semana real.

## Arquivos desta entrega na branch

A recuperação da base produtiva está no commit separado e no manifesto de baseline. A lista abaixo corresponde ao complemento funcional, QA e documentação posterior à recuperação.

```text
.codex/config.toml.example
AGENTS.md
CLAUDE.md
docs/continuidade-planeje/01-ESTADO-ATUAL.md
docs/continuidade-planeje/02-FASES-E-ENTREGAS.md
docs/continuidade-planeje/03-DECISOES-E-REGRAS.md
docs/continuidade-planeje/04-MAPA-TECNICO.md
docs/continuidade-planeje/05-AMBIENTE-E-OPERACAO.md
docs/continuidade-planeje/06-VALIDACAO-E-ACEITE.md
docs/continuidade-planeje/07-PENDENCIAS-E-PROXIMOS-PASSOS.md
docs/continuidade-planeje/08-PROMPT-DE-RETOMADA.md
docs/continuidade-planeje/09-INDICE-DE-EVIDENCIAS.md
docs/continuidade-planeje/README.md
docs/continuidade-planeje/evidencias/gestor-neuro-preview-2026-11-12/desktop-top.png
docs/continuidade-planeje/evidencias/gestor-neuro-preview-2026-11-12/desktop.png
docs/continuidade-planeje/evidencias/gestor-neuro-preview-2026-11-12/leads.png
docs/continuidade-planeje/evidencias/releases/gestor-neuro-local-2026-11-12.json
docs/continuidade-planeje/referencias/gestor-ia-neuro-mcp-2026-11-12.md
docs/quality.md
eslint.config.js
eslint.typed.config.js
package-lock.json
package.json
planeje-mcp/package-lock.json
planeje-mcp/package.json
planeje-mcp/scripts/gestorIaRoutine.test.ts
planeje-mcp/scripts/messageHistory.test.ts
planeje-mcp/scripts/metaTraffic.test.ts
planeje-mcp/scripts/probe-chatgpt-budget.mjs
planeje-mcp/scripts/researchTools.test.ts
planeje-mcp/scripts/sdkTransport.test.ts
planeje-mcp/scripts/toolAuthorization.test.ts
planeje-mcp/src/chatgptToolBudget.ts
planeje-mcp/src/gestorIaRoutineTools.ts
planeje-mcp/src/hubTools.ts
planeje-mcp/src/metaTools.ts
planeje-mcp/src/pages.ts
planeje-mcp/src/toolAuthorization.ts
planeje-mcp/src/tools.ts
scripts/atlasChatImages.test.mjs
scripts/atlasTeamDialogue.test.mjs
scripts/atlasTeamImages.test.mjs
scripts/gestor-ia/fixtures/routine.mjs
scripts/gestor-ia/neuro-preview/.gitignore
scripts/gestor-ia/neuro-preview/README.md
scripts/gestor-ia/neuro-preview/bridge.mjs
scripts/gestor-ia/neuro-preview/db.mjs
scripts/gestor-ia/neuro-preview/fixture.sql
scripts/gestor-ia/neuro-preview/index.html
scripts/gestor-ia/neuro-preview/main.jsx
scripts/gestor-ia/neuro-preview/mcp.mjs
scripts/gestor-ia/neuro-preview/scenario.mjs
scripts/gestor-ia/neuro-preview/server.mjs
scripts/gestor-ia/neuro-preview/session.js
scripts/gestor-ia/neuro-preview/static-server.mjs
scripts/gestor-ia/neuro-preview/static.mjs
scripts/gestor-ia/neuro-preview/vite.config.mjs
scripts/gestor-ia/routine-coverage.test.mjs
scripts/gestor-ia/routine-data.test.mjs
scripts/gestor-ia/routine-database-checks.sql
scripts/gestor-ia/routine-database-fixture.sql
scripts/gestor-ia/routine-mcp.e2e.test.mjs
scripts/gestor-ia/routine-signals.test.mjs
scripts/gestor-ia/routine.component.test.mjs
scripts/gestor-ia/routine.test.mjs
scripts/gestor-ia/verify-routine-database.py
scripts/mcpToolkitTypes.test.mjs
src/components/gestor-ia/GestorIaRoutine.css
src/components/gestor-ia/GestorIaRoutine.jsx
src/components/gestor-ia/GestorIaRoutineLeads.jsx
src/components/gestor-ia/gestorIaRoutineData.js
src/components/traffic/TrafficWeeklyRoutine.jsx
src/lib/gestorIaRoutine.d.ts
src/lib/gestorIaRoutine.js
src/lib/gestorIaRoutineSignals.js
src/lib/miniCrm.js
src/lib/trafficWeeklyReview.js
supabase/migrations/20261112043818_gestor_ia_routine_mcp.sql
```

[Evidência e hashes](../evidencias/releases/gestor-neuro-local-2026-11-12.json).

## Publicação autorizada na VPS — 12/11/2026, 09h25

[Rotina publicada](https://planeje.jbapex.com.br/#/gestor-ia/rotina). Release `/root/planeje-releases/gestor-neuro-20261112-01/candidate`; [evidência produtiva e hashes](../evidencias/releases/gestor-neuro-producao-2026-11-12.json). Aprovação explícita posterior ao preview: Josias, “publicar vps”. Não houve checkout/reset nos diretórios originais nem push em main.

A VPS havia avançado para `crm-ia-base-secoes-20261112-01`, com 2.236 fontes. Os 18 alvos ainda correspondiam à baseline revisada ou estavam ausentes. A candidata herdou todas as fontes atuais e o perfil `.env.production.local`, acrescentando onze fontes/migration e sete fontes MCP. Três arquivos novos elevaram o manifesto a 2.239 fontes; oito arquivos de QA ficaram somente na candidata. As entregas concorrentes do CRM/Atlas foram preservadas.

Passaram onze guardas do publicador, dois grupos PostgreSQL do guarda e o E2E isolado 1/1 repetido antes da publicação. Na candidata VPS passaram 70 testes Node e 113 MCP. O primeiro preparo parou antes de qualquer SQL/live porque o host não tinha o compilador de desenvolvimento. A tentativa própria foi arquivada, sem instalar dependências produtivas. O segundo usou TypeScript 5.9.3 em diretório QA privado, verificado por manifesto/hash, contra as dependências reais da VPS (SDK MCP 1.29.0, preservado). Tipagem passou; build Vite em 37,99s, 28 artefatos. Revisão independente sem P1/P2 pendentes.

A migration `20261112043818` foi aplicada uma vez, em transação com limite de espera/execução, lock e comparação do catálogo. O guarda conferiu fingerprints dos campos antigos de todas as revisões e do histórico, além das funções canônicas, RLS e grants. Dados antigos ficaram preservados, com a nova classificação coerente com finalized_at. Não há DDL inverso automático nem retry da migration: qualquer falha posterior ao SQL exige inspeção dos recibos.

Assets imutáveis foram instalados antes da troca atômica do HTML; os anteriores continuam disponíveis. Somente o MCP foi reiniciado, mantendo ambiente/configuração/versão. Flags de Decisões, Agenda e Agenda IA seguem false; Edge, runtime, cinco serviços Atlas, workers e dependências produtivas foram conferidos e preservados.

A verificação passou em 44 URLs/controles HTTPS, incluindo hashes de HTML/assets atuais e anteriores, Atlas Office, saúde MCP e rejeição 401 sem autenticação. Uma transação READ ONLY com rollback conferiu painel, leitura da semana, DTO de leads mascarado e recusa de ator não identificado. O lookup do ator do ensaio precisou ocorrer antes de SET ROLE; nenhuma permissão foi ampliada. Nenhum conteúdo de contato/revisão foi registrado.

A sessão autenticada carregou a entrada e os novos filtros Rascunho da IA/Validados, sem abrir/criar uma semana nem editar registros reais. A validação humana e a escrita IA continuam comprovadas no ensaio descartável; a sessão externa do Neuro e carga real ainda não foram homologadas.
