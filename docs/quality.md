## Gestor IA — consulta e fluxos oficiais

A Rotina semanal possui `node --test scripts/gestor-ia/routine.test.mjs scripts/gestor-ia/routine-data.test.mjs` e `node scripts/gestor-ia/routine.component.test.mjs`. Cobrem coorte de primeira entrada/agendamento posterior, IDs exatos, paginação com teto menor do servidor, revogação, conflitos, preservação de campos, leitura salva e retorno entre semanas sem cache desatualizado. A prévia isolada abre `http://127.0.0.1:4392/#/gestor-ia/rotina?semana=2026-11-02`; o salvamento compartilhado tem a fixture `python3 scripts/traffic-save-preview/verify-db.py`. [Escopo e limites](continuidade-planeje/referencias/gestor-ia-rotina-semanal-local-2026-11-11.md).

`node --test scripts/gestor-ia/*.test.mjs` verifica ACL, janelas, dados parciais, navegação, permissões e gravações focadas com fonte fictícia. Os testes React usam o runtime QA em `/tmp/planeje-crm-ui-qa`. O build temporário é `npm run build:check`. A prévia e os limites dos fluxos operacionais constam no [checkup do Gestor IA](continuidade-planeje/referencias/gestor-ia-scaleos-checkup-2026-11-07.md).

`accounts-overview.test.mjs`, `data.test.mjs` e `component.test.mjs` também cobrem o colaborador com `valor` oculto: leitura e atualização de métricas da carteira, lotes mistos, recusa de sessão/módulo/campo/vínculo, cobrança protegida e revogação. A prévia isolada aceita `?perfil=colaborador`. Os testes não usam tokens reais ou a Meta; [escopo e estado da correção](continuidade-planeje/referencias/gestor-ia-acesso-colaborador-2026-11-11.md).

Na conversa do Rastreamento, `node --test scripts/atendimentoMediaDownload.test.mjs scripts/rastreamentoLeadConversa.test.mjs scripts/rastreamentoMulticanal.test.mjs scripts/rastreamentoLeadFicha.test.mjs scripts/rastreamentoMiniCrmResumo.test.mjs` cobre cache, nova tentativa, tipos de mídia, remoção, escopo de cliente/canal e contratos da ficha. `node scripts/rastreamento-multicanal-preview/component.test.mjs` usa o runtime React QA e mídias fictícias para conferir os controles e falhas, sem downloads de provedores. A demonstração isolada de mídia usa `http://127.0.0.1:4385/?gestor=1&midia=1`.

Os testes `decision-edge.test.mjs` e `decision-log.test.mjs` usam a versão instalada do SDK Supabase com transportes simulados. `node scripts/gestor-ia/verify-decision-access.mjs` exercita sessão, ACL, isolamento do titular e transições do histórico, incluindo o vínculo e o veredito, em um PostgreSQL 16 ou 17 descartável. O script cria seu próprio diretório temporário e usa socket Unix privado, sem conexão com bancos existentes.

`node scripts/gestor-ia/verify-media-goals.mjs` usa um PostgreSQL descartável para conferir os objetivos, as permissões de cliente e conta e a gravação de verba ou volume com versão. Duas gravações concorrentes da mesma versão devem produzir um salvamento e um conflito.

# Qualidade e evidência local

## Menu principal por categorias

`node --test scripts/teamNav.test.mjs scripts/teamNavHistory.test.mjs scripts/moduleManagementConfig.test.mjs`
verifica cobertura sem duplicação, permissões e módulos, categorias vazias,
atalhos móveis estáveis, rotas por perfil e limites do destaque. O teste de
histórico monta as duas interfaces reais com React 18 e MemoryRouter e reproduz
seleção manual, Voltar e Avançar. Usa o mesmo runtime QA temporário em
`/tmp/planeje-crm-ui-qa`; portais e serviços externos são substituídos, sem
dependência nova no produto. Foco e aparência são conferidos no navegador.

A conferência visual isolada usa perfis fictícios, rede externa bloqueada e
as larguras de 1280, 390 e 320 px. Abrange atalhos, categorias, preservação do
Squad, teclado, foco, redimensionamento, permissões, carregamento, histórico e
movimento reduzido. [Evidência e limites](continuidade-planeje/referencias/menu-categorias-local-2026-11-11.md).

## CRM IA — entrega, voz e calendário

Os testes de `scripts/crm-ia/` usam dados sintéticos, transporte falso e PostgreSQL descartável. Os arquivos `*.database.test.mjs` criam um cluster próprio por socket Unix com `listen_addresses=''`; precisam de `initdb`, `pg_ctl` e `psql` no PATH. Não aceitam DSN produtivo. Execute os testes de banco uma vez por processo, sem duplicar o mesmo arquivo em paralelo.

`node --test scripts/crm-ia/api.test.mjs scripts/crm-ia/ui-model.test.mjs scripts/crm-ia/calendar-callback-ui.test.mjs scripts/crm-ia/calendar-runtime.test.mjs scripts/crm-ia/delivery-scheduler.test.mjs` cobre escopo da conta/canal, limpeza antecipada do retorno OAuth, agenda consultada antes de oferecer horários, repasse em falha e limite de tempo do Google sem atrasar o legado. `ui-contract.test.mjs` usa React 18 e renderer no runtime QA temporário `/tmp/planeje-crm-ui-qa`; não instala dependência de produto.

As suítes `voice*.test.mjs` cobrem autorização explícita, reserva antes do custo, geração/transcrição únicas, limite de 4 MB, contexto e retorno ao texto. As suítes `calendar.test.mjs`, `calendar-endpoint.test.mjs`, `calendar-drive-bridge.test.mjs`, `calendar.database.test.mjs` e `calendar-delivery.database.test.mjs` verificam OAuth por usuário/sessão, privacidade, versões, conflitos externos e recibos antes da confirmação. Não fazem chamadas reais aos provedores. `template-agent.database.test.mjs` acrescenta cópia entre clientes, normalização legada, preservação de origem/OIDs/provas e validação dos limites de agenda antes da gravação.

`node --test scripts/crm-ia/agenda-week.test.mjs scripts/crm-ia/ui-agenda-week.test.mjs scripts/crm-ia/preview-contract.test.mjs` cobre grade e intervalo semanal, fuso autoritativo, sobreposição, acesso de consulta, totais antes da paginação, ausência com versão/canal e rascunho da prévia sem ativação. A revisão de rascunhos e áudio espelhado usa também `ui-agent-draft.test.mjs`, `ui-agent-editor.test.mjs` e `drafts.database.test.mjs`; publicação real depende da integração de suas migrations novas.

`tags.database.test.mjs` usa `leads.etiquetas text[]`, como o schema produtivo, e cobre captura, salvamento/importação, omissão, limpeza, limites, ACL, versão e rollback do lote. `appointment.database.test.mjs` inclui uma corrida real entre marcação humana e limpeza de recuperação; compara o marcador completo e a versão antes de remover o retorno. Os loaders integrados preservam a ordem das migrations publicadas; oito consumidores do leitor compartilhado já exercitam a16ª migration.

`profiles.test.mjs`, `profiles-runtime.test.mjs`, `profiles.database.test.mjs` e `leads-read.database.test.mjs` cobrem perfis publicados, ações limitadas, RLS legada real, snapshots, histórico sem inflar conversões, resumo autorizado, totais antes da paginação e lotes/importação atômicos. As corridas usam duas conexões e espera comprovada no lock; revogação invalida a operação antes de noop ou mutação. `loja-agent-summary.test.mjs` verifica a projeção no consumidor legado, propagação do erro e serialização do filtro JSON na versão instalada do cliente.

`ui-profile-editor.test.mjs`, `ui-lead-controls.test.mjs`, `ui-import-mapping.test.mjs`, `ui-embedded-conversation.test.mjs`, `lead-model.test.mjs` e `preview-leads.test.mjs` cobrem ordem/identidade dos perfis, CSV, preferências visuais por pessoa/cliente, seleção versionada, ações do Kanban e conversa canônica por canal. `ui-workspace.test.mjs` cobre o seletor persistente durante carga, erro e troca de conta. Os testes React usam o mesmo runtime QA temporário React18 já citado.

`notifications.database.test.mjs` e `conversation-controls.database.test.mjs`, junto dos testes de serviço, webhook e interface, cobrem avisos privados, eco comprovado, locks, preservação dos filhos da conversa, feed individual, autoria IA e agendamento idempotente. `conversation-read-performance.database.test.mjs` compara97 envelopes antes/depois com helpers reais de acesso; mede chamadas de função em vez de latência e verifica atributos/grants, revogação e ambiguidades. Não aceita dados ou DSN produtivo.

`conversation-access-performance.database.test.mjs` carrega os helpers reais de sessão e as17migrations anteriores, compara o leitor16 com18 e limita chamadas de sessão/papel em551contatos e mais de31mil mensagens. `conversation-header.database.test.mjs` carrega18migrations e verifica telefone/follow-up da página/estado autorizados, autoria/fotos, paginação,10envelopes, NULLs, isolamento e ACL completa. Ambos usam PostgreSQL descartável por socket Unix privado; execute cada arquivo uma vez por processo. Seis e oito testes passaram respectivamente; [acesso e desempenho](continuidade-planeje/referencias/crm-ia-acesso-leitura-2026-11-11.md) e [contrato do cabeçalho](continuidade-planeje/referencias/crm-ia-cabecalho-dados-2026-11-11.md) registram comandos, publicação e limites.

Para executar o conjunto CRM inteiro sem colisão de sockets, use `node --test --test-concurrency=1 scripts/crm-ia/*.test.mjs`. Após a correção da leitura passaram398/398, sem falhas, cancelamentos ou skips; isso complementa o check completo da05b e não representa uma nova execução desse check nem comprova transporte/modelo/OAuth real. [Verificações e limites](continuidade-planeje/referencias/crm-ia-leitura-performance-2026-11-11.md).

A prévia usa `node node_modules/vite/bin/vite.js --config scripts/crm-ia/preview/vite.config.mjs`, na porta 4401, com rede externa bloqueada e contas fictícias. `npm run check` verifica o conjunto canônico; esses testes dirigidos o complementam. Compilar ou testar não publica nem aplica migrações. [Levantamento](continuidade-planeje/referencias/crm-ia-scaleos-auditoria-2026-11-11.md) e [estado publicado](continuidade-planeje/referencias/crm-ia-producao-2026-11-11.md).

## Comandos canônicos

| Comando | Cobertura e efeito |
| --- | --- |
| `npm run check` | Contexto, testes do harness, lint rápido/tipado, tipos, regras, testes locais e build temporário; para na primeira falha |
| `npm run verify:context` | Nove documentos, links relativos e integridade das skills locais fixadas |
| `npm run test:harness` | Integridade/link incorreto/escape de diretório e interrupção do agregador em falha |
| `npm run lint` | 919 arquivos JS/JSX/TS em src, MCP e Edge Functions; sem autoformatação |
| `npm run lint:typed` | Duas regras assíncronas sobre os arquivos incluídos no tsconfig MCP |
| `npm run typecheck` | TypeScript do MCP com tsconfig estrito preservado |
| `npm run test:rules` | Autoavaliação dos três módulos genéricos do toolkit |
| `npm run test:local` | 74 testes Atlas/voz/sessão/tipos, dois scripts Tráfego e os testes MCP abaixo |
| `npm run test:mcp` | 91 testes de tráfego, SDK, mensagens/webhooks, normalização, históricos e autorização; sem rede real |
| `npm run build:check` | Compila pelo Vite em diretório temporário e o remove, sem substituir dist/ZIPs |

Os testes de banco/API existentes não são automaticamente seguros em conjunto.
Leia cada script e confirme destino descartável antes de executá-lo. Os comandos
acima não publicam, aplicam migrações ou consultam produção. Auditoria de
pacotes é separada: `npm audit` e `npm --prefix planeje-mcp audit` consultam o
registro e podem retornar saída1 quando há alertas.

O histórico MCP usa o Supabase JS instalado com `fetch` fictício restrito a
`fixture.invalid` e GET. Os dez casos cobrem 50 mil mensagens, texto integral,
continuação, teto interno menor do banco, timestamps empatados/microssegundos,
falha de fonte, cliente/filtros/ator e compatibilidade das ferramentas. Isso não
certifica PostgREST, OAuth ou RLS produtivos. [Contrato e evidência local](continuidade-planeje/referencias/mcp-mensagens-sem-teto-local-2026-10-26.md).

## Conversa por conta e resumo do Mini CRM

`node --test scripts/rastreamentoMulticanal.test.mjs scripts/rastreamentoMiniCrmResumo.test.mjs`
usa SupabaseJS2.30 com fetch restrito a fixture.invalid e GET. Cinco testes cobrem contas,
limites, falhas parciais, escopo e resumo sem escrita. `node scripts/rastreamento-multicanal-preview/component.test.mjs`
executa 14 verificações React em memória, incluindo troca de contato/resposta atrasada.
A prévia em porta4385 usa fixture e env isolado. [Escopo, build e limites](continuidade-planeje/referencias/rastreamento-conversa-canais-local-2026-11-06.md). [Publicação e verificação de06/11](continuidade-planeje/referencias/rastreamento-conversa-canais-producao-2026-11-06.md).

## Status externo do CRM — Impacto Noivas

A geração de conexão no CRM tem `scripts/crm-status-sync/self-service/verify_db.py`, `source.test.mjs` e `component.test.mjs`.34SQL/6Node novos/20React, mais seis regressões Node da integração anterior. Testes isolados; migração desta capacidade pertence ao bancoCRM87. [Escopo, build, revisão e limites](continuidade-planeje/referencias/crm-self-service-local-2026-11-05.md).

O controle de conexão também tem `node scripts/crm-status-sync/component.test.mjs`,
React18.2 em QA temporário, sem navegador/rede. O SQL descartável agora cobre RPC,
permissões e worker. [Publicação, validação real e limites de05/11](continuidade-planeje/referencias/crm-status-interface-producao-2026-11-05.md).

`node --test scripts/crm-status-sync/source.test.mjs` usa SDK e transporte fictício.
`node --test scripts/crm-status-sync/bootstrap.test.mjs` cobre configuração JSON incluída no bundle sem acesso a arquivo por requisição; o esbuild antigo recebe a sintaxe equivalente assert no harness. O atributo with foi conferido separadamente no Edge real.
`python3 -m unittest discover -s scripts/crm-status-sync -p 'test_*.py'` cobre o
planejador e limites de confiança. `python3 scripts/crm-status-sync/verify_db.py`
usa PostgreSQL descartável por socket Unix, sem DSN externo; cobre escrita,
concorrência, timeout integral e privacidade do log. Os testes não acessam produção.
O executável `sync.py` é operacional; dry-run é padrão e `--apply` grava dados.
[Entrega e limites](continuidade-planeje/referencias/impacto-crm-status-local-2026-11-02.md).

## Histórico de origens de Rastreamento

O [histórico de origens de Rastreamento](continuidade-planeje/referencias/rastreamento-historico-origens-local-2026-10-28.md)
tem testes Node com SDK/fetch fictícios, três ingressos compilados e PostgreSQL descartável em
`scripts/contact-attribution-history/verify.py`, sem DSN externo. A prévia da ficha real em
`scripts/contact-attribution-preview/vite.config.mjs` usa porta4361 e dados sintéticos;
`verify.cjs` recusa rede externa e cobre páginas, falhas, troca de contato, teclado e celular.
Esses comandos não aplicam SQL produtivo nem enviam conversões reais.

A recuperação pontual da Dinamac tem fixtures em
`node --test scripts/contact-attribution-history/recover.test.mjs` e
`node scripts/contact-attribution-history/recover-db.test.mjs` (PostgreSQL16
descartável, socket temporário, sem DSN). O executável `recover.mjs` é operacional,
restrito à VPS autorizada; não é um teste local. Auditoria é o padrão; aplicação
exige o hash do lote conferido e autorização específica. Não reproduz webhooks.

A apresentação de origem por UTM tem regressões em
`node scripts/rastreamentoTrackableLink.test.mjs` e
`node scripts/rastreamentoLeadFicha.test.mjs`.
`node scripts/contatosCsv.test.mjs` cobre texto externo no CSV, aspas, nulos e
neutralização de fórmulas, sem abrir planilha externa nem acessar produção.
[Entrega e limites](continuidade-planeje/referencias/rastreamento-origem-utm-source-local-2026-10-28.md).

## Consistência da origem em Rastreamento

`node scripts/rastreamentoOriginConsistency.test.mjs` usa dados sintéticos e executa
os helpers e trechos reais de lista/CSV/filtros/calendário. Cobre Linktree legado,
Source personalizado, Google legado, CTWA, primeira origem diante de sinais posteriores,
visibilidade de rastreados e ausência de mutação. Sem rede, banco ou envios reais.
[Contrato e resultado](continuidade-planeje/referencias/rastreamento-origem-consistente-producao-2026-10-29.md).

## Relatórios Meta e Google no Rastreamento

`node scripts/crmRelatorioGoogle.test.mjs` cobre primeira origem, período de São Paulo,
deduplicação/comercial, associação inequívoca de campanha, moeda/falha e paginação
completa por cliente. Usa o SDK instalado com `fetch` sintético restrito a
`fixture.invalid`; não consulta Google nem banco real. Regressões:
`crmRelatorioMetaTracking`, `crmRelatorioMetaSpend`, `rastreamentoHub`,
`rastreamentoLeadFicha` e `googleAdsDashboard`, todos em `scripts/*.test.mjs`.

A prévia `node node_modules/vite/bin/vite.js --config scripts/google-report-preview/vite.config.mjs`
usa porta4378, envDir isolado e adaptador fictício; aceita somente a leitura
`get-campaigns`. CUA conferiu abas, período, filtro, ficha, vazio/erro, troca de cliente
durante leitura e 390/320px. A conversa na ficha não é simulada por essa fixture.
[Entrega e limites](continuidade-planeje/referencias/rastreamento-relatorios-google-local-2026-10-28.md).

## Site e sources em Relatórios

`node scripts/crmRelatorioSite.test.mjs` cobre origem Site principal/legada,
dedupe/comercial, source vazia/textual/reservada, filtro, ausência de Ads e SDK
paginação/cliente/erro. Inclui regressão dos dois legados Site com CTWA posterior:
ficha continua Site, sem criativo/jornada Meta. Usa somente `fixture.invalid`.
Regressões complementares: relatório Google, ficha, links, Mini CRM origens,
Meta tracking/gasto, Hub e dashboard Google. Nenhum desses testes altera produção.
A mesma prévia porta4378 agora tem aba Site, quatro contatos e três sources
sintéticos. [Entrega e limites](continuidade-planeje/referencias/rastreamento-site-source-local-2026-10-28.md).

## Visão geral por origem no Rastreamento

`node scripts/hubOverviewOrigins.test.mjs` cobre All/Meta/Google/Site, primeira
origem, não rastreada, dedupe/comercial, São Paulo e SDK2.30 com paginação limitada,
filtro de cliente, falha e nenhum Ads no All. `hubOverviewDashboard.test.mjs`
acrescenta primeira origem antes de CTWA posterior e formatação USD/BRL. Regressões:
relatórios Google/Site, Hub, Meta tracking/gasto e links. Todos são sintéticos.
A prévia4378 tem modo Visão geral e permite falhas, moedas e corrida entre clientes;
não consulta produção nem envia conversões.
[Entrega e limites](continuidade-planeje/referencias/rastreamento-visao-geral-origens-local-2026-10-28.md).

## Hoje: conversas de tráfego e prioridades

[Contrato, comandos e limites](continuidade-planeje/referencias/trafego-conversas-prioridades-local-2026-10-28.md).
`python3 scripts/traffic-conversations/verify-db.py` usa PostgreSQL descartável por socket Unix.
A prévia em `scripts/traffic-conversations/vite.config.mjs` usa porta4370, auth/RPC fictícias e envDir isolado;
`node scripts/traffic-conversations/verify-ui.mjs` recusa rede externa e cobre contador, erro, timeout,
troca de usuário, polling, teclado e celular. Nenhum desses comandos usa IA, produção ou dados reais.
Os testes puros do worker são selecionados por nome na referência, sem discovery amplo.

## Atlas gerente: verificações locais dirigidas

Comandos e evidência em [entrega local do Atlas](continuidade-planeje/referencias/atlas-gerente-operacional-local-2026-10-18.md).

Para a tela **Conversar**, inicie `./node_modules/.bin/vite --config scripts/atlas-preview/vite.config.mjs`
na porta 4317. Rode `node scripts/atlas-preview/verify-conversar.cjs` com Playwright
disponível (ou use `ATLAS_PLAYWRIGHT_MODULE` e `ATLAS_CHROME_PATH`). O script usa
dados fictícios e bloqueia tráfego externo. Confere carrossel, pausa e movimento
reduzido, URL da sessão após recarregar, favoritos, arquivo, seleção de cliente,
aprovação explícita, recuperação do recibo após falha de transporte, recusa,
restrição de acesso e largura de 390 px. Os scripts `verify.cjs` e `verify-voice.cjs`
na mesma pasta verificam conversa, memória e voz fictícia.
`python3 scripts/atlas-manager-integration/verify.py` usa PostgreSQL instalado
na máquina e cria/remove um cluster fictício por socket Unix, sem aceitar DSN.
As suites Python puras selecionadas e a prévia com rede isolada não são os
scripts remotos antigos. Nunca executar toda a pasta de testes Atlas sem
inspecionar destinos e efeitos. A migração nova foi aplicada somente à fixture;
check/build não publicam nem migram produção.

A [atualização das fontes do acompanhamento](continuidade-planeje/referencias/atlas-acompanhamento-atualizado-local-2026-10-23.md)
acrescenta o teste puro `python3 scripts/atlas-team-pilot/test_progress.py`.
O mesmo runner descartável inclui `source-refresh-checks.sql`, com publicação
por canal/ciclo de correção, snapshot Meta permitido, pausa do dono, versão das
fontes, primeira abordagem e isolamento. Esses comandos não chamam IA nem produção.

## Reparação do ciclo operacional do Atlas

[Escopo, comandos e limites](continuidade-planeje/referencias/atlas-ciclo-operacional-local-2026-10-19.md).
O harness SQL acima inclui o índice produtivo de launch controls e as regressões
em `repair-checks.sql`. Para a conversa da equipe, iniciar a prévia isolada com
`node node_modules/vite/bin/vite.js --config scripts/atlas-team-pilot/preview/vite.config.mjs`
e rodar `node scripts/atlas-team-pilot/verify-retry-ui.mjs` com
`ATLAS_PLAYWRIGHT_MODULE`/`ATLAS_CHROME_PATH` locais quando necessários.
Porta4346 fixa; somente API fictícia e rede externa abortada pelo verificador.
Não usar o dev principal nem credenciais reais para esse teste.

O [aviso recolhível do Atlas](continuidade-planeje/referencias/atlas-aviso-recolhivel-local-2026-10-26.md)
usa a mesma fixture na porta4354 (`--port 4354 --strictPort`) com
`node scripts/atlas-team-pilot/verify-call-notice.mjs`. O verificador aborta rede
externa e cobre temporizador, contador, polling, mensagem nova, teclado e celular.

## Conversa interativa no escritório: verificação isolada

Detalhes em [entrega local](continuidade-planeje/referencias/atlas-conversa-escritorio-local-2026-10-18.md).
`verify-office-chat.mjs` usa a prévia fictícia em `127.0.0.1:4341`;
`verify-map-chat.mjs` usa o mapa compilado em diretório `.local` e a mesma
prévia com `ATLAS_PREVIEW_OFFICE=1` na porta 4342. As rotas Playwright recusam
toda rede externa. Os testes não se conectam à produção nem usam IA real.
A fixture de microfone testa cancelamento/rascunho, sem certificar hardware.
O PostgreSQL descartável também verifica que `service_role` não lê
`auth.sessions` diretamente e que o novo helper recusa sessão/dono inválidos.

## Conversa e atividade real no escritório

A [entrega local de conversa/atividade](continuidade-planeje/referencias/atlas-conversa-atividade-escritorio-local-2026-10-18.md)
registra o conjunto dirigido de 51 testes Node e 32 verificações de navegador.
`node --test scripts/atlasOfficeMissions.test.mjs` cobre lifecycle, espera,
reutilização de especialista, heartbeat, privacidade e destinos. O novo
`node scripts/atlas-manager-integration/verify-live-chat.mjs` usa somente a
prévia fictícia local 4342 e testa clique real no sprite, envio em andamento,
continuação e fim/falha. Requer Playwright/Chrome disponíveis; não instala nem
usa IA ou transporte produtivo. O teste legado de reader/áudio fora do delta
falha na fixture e está disposto na referência; check não cobre toda a pasta.

## Adoção gradual do lint

Não existia configuração de lint operacional. As regras novas foram medidas
primeiro em warn; regras sem ocorrências passaram a error. Nada foi rebaixado.

| Regra | Contagem inicial | Tratamento e próxima ação |
| --- | --- | --- |
| `no-dupe-args`, `no-dupe-keys`, `no-unreachable`, `no-sparse-arrays`, `no-unsafe-finally`, `valid-typeof` | 0 cada | error desde a primeira medição |
| `quality/max-lines` | 191 arquivos | warn, referência 350 linhas; dividir apenas por responsabilidade, com testes |
| `no-undef` | 16 | warn; priorizar reproduções de falhas de uso/imports antes de refatoração estética |
| `react-hooks/rules-of-hooks` | 12 | warn; corrigir ordem/uso por fluxo com teste de renderização |
| `react-hooks/exhaustive-deps` | 139 | warn; revisar closure e efeitos antes de alterar dependências |
| `@typescript-eslint/no-floating-promises` | 0 | error |
| `@typescript-eslint/no-misused-promises` | 1 | warn; callback do servidor MCP em index.ts:636 requer correção delimitada com tratamento de erro |

O lint tipado também relata 11 dos mesmos arquivos grandes; não somar isso como
novas violações únicas. Não há teto crescente, lista de supressões legadas ou
ignore de código de produto para limpar a medição. Promover cada regra quando
chegar a zero; medir novamente após alteração de perfil. Avisos são dívida
visível: check aprovado não significa ausência de avisos.

Medição neste Mac/Node 20: rápido 9,60 s e pico de filhos 379.781.120 bytes;
tipado 5,21 s e pico 607.371.264 bytes. O segundo é a marca máxima acumulada dos
filhos no processo de medição, não uma garantia de consumo em outra máquina.
O perfil tipado fica separado para runners menores. ESLint 8 foi preservado;
o preset CRA sem uso foi substituído pela configuração explícita. Os módulos
genéricos e o autoavaliador vêm da revisão fixa do toolkit; RuleTester foi
adaptado para sintaxe moderna no ESLint 8. Não foram impostos logger, camada
Drizzle/Next ou acesso a dados fictícios que a arquitetura não possui.

## Antes e depois

Baseline: 56 testes e dois scripts Tráfego passaram; build isolado passou;
tsc tinha 18 diagnósticos. Consultas agora preservam literais/projeções e
valores por índice são guardados. Foram acrescentados 18 testes com SDK
Supabase real e fetch fictício; a revisão independente confirmou tipos 0 e
preservação de filtros, fallbacks, destinatários e autorização examinados.
A atualização MCP SDK 1.29.0 para 1.32.1 conserva a linha 1.x. A dependência
aceita Hono Node Server 1.x ou 2.x; um override seleciona 1.19.17, atualizando
o 1.19.14 anterior sem introduzir a exigência de Node 20 do ramo 2.x. O campo
engines legado do MCP foi preservado; esta avaliação executou Node 20.20.2,
sem comprovar suporte completo a Node 18. Rever o override quando a política
de runtime mudar ou o SDK deixar de aceitar 1.x. O transporte de memória
registra schemas reais e recusa entrada inválida antes de acessar dados;
não comprova HTTP/OAuth/RLS produtivos.

Auditoria: raiz 41 para 15 entradas afetadas; MCP 11 para 0, após atualizações
compatíveis e retirada do preset CRA sem uso. Restam na raiz 1 crítica, 7 altas
e 7 moderadas. jsPDF/autotable, Vite e Router têm correções sugeridas em majors;
parte da árvore Tailwind tem alertas sem correção compatível indicada. A
marcação runtime/dev do lockfile não demonstra exploração nem implantação:
Tailwind e seus transitivos também participam da ferramenta de compilação.
Examinar cada caminho e propor as migrações com testes/recuperação próprios;
nenhum audit fix forçado, downgrade ou migração foi usado para fabricar zero.

## Revisão de segurança reutilizável

Fonte fixa: [Prompt 13](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/prompts/13-security-review.md#prompt).
Leia somente o bloco Prompt e execute em modo leitura, com escopo explícito:
baseline do checkout ou base/head resolvidos mais staged/unstaged/untracked.
Use differential-review para diff quando disponível e rastreamento manual
como fallback; conecte entradas, autorização, dados e consumidores reais.

O relatório fica fora do repositório, privado e redigido sem segredos, contendo
severidade, localização, cenário alcançável, evidência, contraevidência,
confiança e próxima validação. Revisão não autoriza uploads, sondagem produtiva,
mudanças, comentários externos ou publicação. Esta adoção recebeu revisão
independente dos três módulos MCP e testes; não houve auditoria integral do
produto ou de sua produção. Arquivos sem baseline Git limitam comparação:
a linha de base real de tsc e os trechos isolados conhecidos delimitam o antes.

Atualize a referência somente após revisar o diff do novo Prompt e preservar
seus limites; não copie o toolkit inteiro. A continuidade de validação do
produto permanece em [seu documento canônico](continuidade-planeje/06-VALIDACAO-E-ACEITE.md).

## Atlas: recuperação da ordem das fontes

`node --test scripts/atlasManagerSourceOrder.test.mjs scripts/atlasManager.test.mjs scripts/atlasPortfolio.test.mjs scripts/atlasWorkerModel.test.mjs scripts/atlasConsultationPresentation.test.mjs scripts/atlasConversationClients.test.mjs` usa fixtures sem rede e cobre o hotfix publicado. A preparação remota executa esses mesmos seis arquivos com Node 20 e confere a contagem TAP de 42 testes. Detalhes, incidentes de QA e limites em [ordem das fontes](continuidade-planeje/referencias/atlas-ordem-fontes-producao-2026-10-18.md).

`node scripts/ingressMessageSources.test.mjs` cobre identidade por fonte/número e o executor existente com fronteira de banco fictícia. `python3 scripts/mini-crm-message-rules/verify-sources.py` aplica somente a migração nova do catálogo em PostgreSQL descartável por socket Unix, sem aceitar DSN; confere seed, isolamento, conta/módulo e grants. Os handlers com transportes isolados estão em `scripts/miniCrmMessageWebhooks.test.mjs` (25 casos). [Escopo e limites](continuidade-planeje/referencias/mini-crm-fontes-webhook-2026-10-26.md).

## Atlas: diálogo e fila assíncrona

A [entrega local de 27/10](continuidade-planeje/referencias/atlas-conversa-equipe-local-2026-10-27.md) registra os comandos selecionados:188 testes Python sem rede/modelo,181 verificações nomeadas em PostgreSQL descartável, helper de paginação/atenção e navegador em fixture isolada. Não usar discovery indiscriminado de scripts de integração nem DSN produtivo. Nova migração de diálogo continua local; revisão/QA não publicam ou disparam IA real.

## Rotina semanal: salvamento e conclusão

[Reparo local de 27/10](continuidade-planeje/referencias/trafego-salvamento-rotina-local-2026-10-27.md).
`python3 scripts/traffic-save-preview/verify-db.py` usa somente PostgreSQL
descartável por socket Unix; não aceita DSN. A prévia Vite na porta 4368 e
`node scripts/traffic-save-preview/verify.mjs` exercitam a interface real com
Supabase fictício e bloqueio de rede externa. Requer Playwright/Chrome locais
(`TRAFFIC_PLAYWRIGHT_MODULE`/`TRAFFIC_CHROME_PATH`), sem instalação automática.
Os comandos e limites de ACL/catálogo da fixture estão na referência.

## Eventos Google: interface e histórico de tentativas

[Entrega local de 28/10](continuidade-planeje/referencias/google-eventos-interface-local-2026-10-28.md).
A prévia existente usa 127.0.0.1:4357 com
`node node_modules/vite/bin/vite.js --config scripts/google-conversions-preview/vite.config.mjs`.
`node scripts/google-conversions-preview/verify.cjs` requer Playwright/Chrome
locais (NODE_PATH pode apontar para o runtime fornecido pelo Codex). Recusa
toda rede externa e usa apenas dados fictícios, incluindo a fronteira da ficha.
Cobre grupos, identificação, histórico, retry/refresh concorrentes, cliente,
falhas parciais, paginação/limite e celular 320/390. Não usar o dev principal ou
credenciais reais para essa QA. Os scripts puros dirigidos estão na referência;
verificação não publica nem envia conversões reais.

## Chatvolt: atribuição de clique entre eventos da mesma conversa

`node scripts/chatvoltConversationAttribution.test.mjs` verifica o helper com Supabase JS instalado e fetch GET restrito a fixture.invalid. `node scripts/miniCrmMessageWebhooks.test.mjs` cobre 53 casos do handler real compilado, com conversões e automação substituídas na fronteira; inclui ambas as ordens, ambiguidade, preservação de atribuição anterior, leitura com erro e concorrência. Os scripts não publicam nem reprocessam contatos produtivos. [Diagnóstico, comandos adicionais e limites](continuidade-planeje/referencias/chatvolt-atribuicao-conversa-local-2026-10-28.md).

## Atlas: necessidade, tarefa e imagem no chat operacional

[Entrega local de 28/10](continuidade-planeje/referencias/atlas-excecoes-contexto-local-2026-10-28.md).
`test:local` inclui os helpers de diálogo e de imagens, com Storage/provedor
fictícios. O verificador SQL existente `scripts/atlas-manager-integration/verify.py`
usa PostgreSQL descartável por socket Unix; não aceita destino produtivo.
As oito suítes Python selecionadas e os três verificadores de navegador estão
na referência. Executar cada suíte Python em processo separado, sem discovery
indiscriminado e sem `test_api.py` (transporte dependente da VPS). A prévia
isolada usa a configuração `scripts/atlas-team-pilot/preview/vite.config.mjs`,
porta 4361 via CLI e rede externa bloqueada nos verificadores. Nenhum teste
aplica a migração em produção, envia mensagem à equipe ou chama IA real.

## MCP: pesquisa geral e permissões

A [entrega local de 29/10](continuidade-planeje/referencias/mcp-pesquisa-geral-local-2026-10-29.md) amplia `test:mcp` com os leitores e guardas reais em transporte fictício, incluindo 50.000 mensagens e projeções. `node --test scripts/mcpToolkitTypes.test.mjs` cobre 18 contratos; `node scripts/miniCrmMessageWebhooks.test.mjs` cobre 59 casos dos handlers reais isolados, incluindo texto de saída integral. O smoke-dossie operacional foi adaptado, mas não é teste seguro automático: pode carregar produção. Sem migração, frontend ou transporte produtivo nesta verificação.

## CS IA no Squad

Na prévia do CS, use `?estado=grupo-inventario&largura=320#/cs-ia/hoje` e `largura=390` para abrir uma janela interna na largura exata. Em 320 px, percorra as seis abas e as sete seções da ficha. A rolagem horizontal da Carteira deve ficar na tabela. Recolha o menu e abra Gestor IA pelo Squad, depois volte ao CS. Em **Carteira → Ações**, abra **Editar avaliação** e **Encerrar acompanhamento** e cancele cada formulário. O foco deve voltar ao botão correspondente na ficha. Em 390 px, abra os sete painéis de Configurações e os editores de grupo e equipe. Com `estado=metas-sem-trafego`, o Squad mostra somente o CS IA.

Em `#/cs-ia/clientes/aurora?aba=historico`, a prévia mostra acontecimentos de Saúde, WhatsApp e Cadastro. Compare os filtros, abra o diário com Enter e confira as janelas de 7, 30 e 90 dias. O atalho **Ver atividade do grupo** abre Conversas. Em Mosaico, o filtro WhatsApp fica vazio. `?perfil=colaborador#/cs-ia/clientes/horizonte?aba=historico` recusa o cliente de outra carteira. `node --test scripts/cs-ia/{data,views,workspace}.test.mjs` verifica as fontes consultadas, a ausência do grupo revogado, os filtros e a recuperação da leitura.

Em `?estado=ficha-fontes-falha#/cs-ia/clientes/aurora?aba=crm`, confirme o aviso e use **Tentar novamente**. Compare os totais de oportunidades, qualificadas e compras e siga a movimentação até a rota da oportunidade. Em Arquivos, atualize a lista e confira o destino **Abrir arquivos e memória**. Mosaico usa o estado vazio. `?estado=ficha-sem-crm` desabilita o módulo. `node scripts/cs-ia/radar.database.test.mjs` verifica o isolamento da carteira e o recorte de cada fonte. `node --test scripts/cs-ia/workspace.test.mjs` verifica a recusa, a recuperação e a alternância de aba.

`?estado=grupo-inventario#/cs-ia/grupos` mostra grupos sem vínculo, arquivados e clientes sem grupo como recortes distintos. Em **Grupos sem vínculo**, localize Equipe de projetos pelo canal, escolha Mosaico e confirme. Só a conversa escolhida deve sair do inventário. `?estado=grupo-inventario-erro` permite testar nova tentativa e `&perfil=colaborador` restringe a tela à carteira autorizada. `node scripts/cs-ia/radar.database.test.mjs` verifica o recorte por canal, o legado, a paginação e a autorização da consulta.

Na mesma prévia, **Arquivar no CS** move apenas o canal selecionado para Arquivados. Abra o seletor de vínculo de Mosaico para verificar que a opção arquivada ficou indisponível. Em Arquivados, confirme a origem de cada registro e restaure o grupo marcado no CS. A suíte descartável verifica versão, origem automática, recusa por vínculo, canal divergente, concorrência com uma gravação de vínculo e preservação de `atendimento_conversas.archived_at`.

Em **Renomear no CS**, altere apenas o nome de Equipe de projetos no canal B. Confira o outro canal, vincule o grupo renomeado a Mosaico e confira a ficha e o nome no seletor antes de restaurar o original. `?estado=grupo-inventario-nome-concorrente` recusa a primeira gravação e oferece **Atualizar nome**. A suíte descartável também confirma RLS e o nome oficial preservado no Atendimento, mesmo após vincular.

Em `?estado=grupo-cadastro#/cs-ia/grupos`, abra **Registrar grupo**. Use o ID fictício `120363000000000042@g.us`, escolha **Outro canal** e informe um nome. Compare a recusa no Canal vinculado, a ausência de atividade no novo cartão, a repetição sem duplicata e o vínculo a Mosaico. `?estado=grupo-cadastro-revogado` recusa a gravação. `node --test scripts/cs-ia/group-members.test.mjs` usa transporte fictício, e `node scripts/cs-ia/radar.database.test.mjs` verifica concorrência, sessão e a regra de duplicatas com mensagens.

Em `?estado=grupo-cliente#/cs-ia/grupos`, **Criar cliente deste grupo** abre o cadastro oficial com o nome sugerido e o canal. Confirme a validação de entregáveis, o responsável e a abertura da ficha em Conversas. Em `?estado=grupo-cliente-resposta-perdida`, repita a gravação no mesmo diálogo e verifique um único cliente na carteira. `?estado=grupo-cliente-revogado` recusa a gravação e mantém o rascunho. A suíte descartável do radar verifica a corrida pelo grupo e a reversão da criação se o espelho falhar.

Em `?estado=grupo-membros-falha#/cs-ia/grupos`, abra **Ver membros do grupo** em Equipe de projetos no canal B e tente novamente. Busque Lia Cardoso e marque-a como equipe. Feche com Escape, confira o foco e abra os dois canais. Vincule B a Mosaico e abra a gaveta pelo cartão vinculado para confirmar a marcação. `node --test scripts/cs-ia/group-members.test.mjs` cobre o transporte fictício. `node scripts/cs-ia/reading.database.test.mjs` verifica permissões, arquivamento e transferência na transação do vínculo.

`?estado=grupo-vinculo#/cs-ia/grupos` permite vincular Mosaico a um dos dois canais da Equipe de projetos. Confirme a busca, o cancelamento, a escolha explícita, a rota do canal salvo, a troca na ficha e o desvínculo. `?estado=grupo-vinculo-concorrente` exige atualizar o formulário e escolher novamente antes de salvar. `node scripts/cs-ia/radar.database.test.mjs` verifica a transação, permissões, preservação de entregáveis e concorrência. A suíte descartável de leitura troca o grupo pela RPC oficial e verifica a pausa do consentimento anterior.

`?estado=grupo-exato#/cs-ia/clientes/aurora?aba=conversas` abre o Atendimento oficial com dois canais fictícios de mesmo JID. Teste a aba da situação atual, o canal do cabeçalho, o histórico legado, os materiais, a chegada do evento fictício e a troca de situação ao assumir. O mesmo link aparece em Hoje e Grupos. `&perfil=colaborador` usa a operação autorizada no link. `?estado=grupo-exato-alterado` troca o vínculo entre a lista e a abertura. `?estado=grupo-exato-sem-acesso` simula a perda de acesso ao registro no Atendimento. `node --test scripts/cs-ia/{group-navigation,views}.test.mjs` cobre a rota, a ausência do JID na URL e os filtros da consulta e dos eventos.

Em `#/cs-ia/clientes/aurora?aba=metas`, a prévia usa o editor do Gestor IA com contas e resultados fictícios. Permite cancelar e salvar uma edição, criar uma meta com campanhas escolhidas, mudar conta e mês, salvar o cadastro e os Indicadores e reler os mesmos dados no Gestor IA. `?estado=metas-revogadas` revoga a carteira antes de salvar. `?perfil=colaborador` permite consultar as metas do cadastro na carteira própria. `?estado=metas-sem-trafego` mostra o atalho para a ficha oficial. `node --test scripts/gestor-ia/data.test.mjs` verifica a projeção de campos, o cliente, o vínculo e a recusa de acesso.

`?estado=metas-objetivos#/cs-ia/clientes/aurora?aba=metas` disponibiliza duas campanhas com alcance próprio, uma com ThruPlays e uma com visitas ao perfil. Permite conferir alcance único indisponível para o conjunto, medição em uma campanha e a diferença entre ThruPlays e visualizações, ou entre visitas ao perfil e cliques gerais. `node scripts/gestor-ia/verify-media-goals.mjs` aplica as migrações em PostgreSQL descartável e grava os objetivos pela RPC oficial.

`?estado=triagem-atlas-atualizada#/cs-ia/hoje` abre o Atlas oficial com transporte fictício. Use **Perguntar ao CS IA**, confira a prévia em Visão geral e envie. A resposta usa o nome de Aurora atualizado no momento do envio. **Missões** mostra a fonte. A mensagem seguinte volta ao chat geral. Em `?estado=triagem-atlas-revogada`, o envio é recusado e o pedido continua disponível. `node --test scripts/cs-ia/{atlas-draft,atlas-triage-edge,workspace}.test.mjs scripts/atlasBackend.test.mjs` verifica paginação, prioridade, projeção ao modelo, autorização, repetição e o contexto individual de abordagem e reunião.

Em `?estado=triagem-atlas-cliente#/cs-ia/clientes/aurora`, a pergunta, a análise, a abordagem e a reunião abrem com a mesma ficha selecionada. Em Metas, altere a verba fictícia de R$ 900 para R$ 960 e envie a pauta. O Atlas e o Gestor IA devem mostrar a meta recalculada de 80 leads. Restaure R$ 900 pelo Gestor. `?estado=triagem-atlas-cliente-sem-meta` mostra só o radar, com aviso sobre metas. `?estado=triagem-atlas-cliente-revogado` preserva o rascunho e recusa a resposta.

Na mesma ficha fictícia, compare os 15 leads medidos, a meta de 75 e a projeção de 50 no dia 9. Pergunte ao Atlas pelo progresso e verifique a data de cobertura. `?estado=triagem-atlas-progresso-parcial` informa dados parciais e `?estado=triagem-atlas-progresso-sem-leitura` mostra o alvo sem progresso. `node --test scripts/cs-ia/atlas-triage-edge.test.mjs scripts/gestor-ia/{data,media-goals,accounts-overview}.test.mjs` verifica o handler, a autorização do cache, a regra de escopo, a moeda, o CPM e a projeção.

Em `?estado=triagem-atlas-diario#/cs-ia/clientes/aurora`, use **Analisar com Atlas** e envie na prévia fictícia. Confira a nota atual de 27, a avaliação de 49 de sete dias atrás, o fator Atendimento e a cobertura de três datas. Em `?estado=triagem-atlas-diario-indisponivel`, o Atlas informa que o diário falhou e ainda responde com as fontes disponíveis. `node --test scripts/cs-ia/{atlas-draft,atlas-triage-edge}.test.mjs` verifica escopo do diário, revogação, troca de vínculo e os campos entregues ao modelo.

Em `?estado=triagem-atlas-crm#/cs-ia/clientes/aurora?aba=crm`, compare as 12 oportunidades, 8 qualificadas e 3 compras da ficha com a resposta individual do Atlas. Confira os 15 resultados mensais de mídia em separado. Em `?estado=triagem-atlas-crm-revogado`, o acesso ao CRM cai no envio e o Atlas mantém a meta. Em Mosaico, confirme o estado sem oportunidades. O handler de `atlas-triage-edge.test.mjs` verifica a data operacional de Brasília e os campos autorizados no contexto enviado ao modelo.

`node --test scripts/cs-ia/{atlas-manager-cs,atlas-triage-edge}.test.mjs` verifica a pergunta de risco pela conversa geral do Atlas, a fila oficial sem duplicidade, a delegação a Clientes, o cruzamento com Tráfego, a fonte no histórico e os bloqueios por revogação ou identidade da equipe. O handler e o executor usam banco e modelo fictícios.

`node --test scripts/cs-ia/atlas-worker-cs.test.mjs` executa o worker e a função do Gestor IA com o cliente Supabase real e todas as respostas HTTP simuladas. Verifica a identidade delegada, a leitura mensal salva, a separação dos dados do CRM, a recusa do cache e a conclusão da missão. `node scripts/cs-ia/radar.database.test.mjs` e `node scripts/gestor-ia/verify-decision-access.mjs` verificam o acesso delegado ao radar, CRM e metas em PostgreSQL descartável, incluindo recusa por titular incorreto, token expirado e Atlas pausado. O cache permanece privado e é consultado pela função do Gestor após a autorização.

`node --test scripts/cs-ia/{atlas-manager-cs,atlas-worker-cs}.test.mjs` verifica a inclusão do Radar do CS na revisão diária existente, a pausa do registro durante a consulta, o monitoramento pausado, a continuidade com outras fontes e a ausência de contato com a equipe. A origem da revisão é a chave diária do trabalho enfileirado. O teste usa serviços fictícios e não inicia o monitoramento nem chama provedores.

Em `?estado=triagem-atlas-missao-geral#/assistant/atlas?view=conversation`, pergunte quais clientes da carteira estão em risco de cancelamento e abra **Missões**. Confira **Pedido encaminhado**, a passagem por Clientes, a leitura do radar e **Ler resultado**. Selecione Aurora Estúdio no Contexto e peça saúde, CRM e meta de mídia. A missão passa por Tráfego e separa 12 oportunidades históricas, alvo mensal de 75 e leitura de mídia de 15 resultados. Repita a pergunta de carteira em `?estado=triagem-atlas-missao-geral-indisponivel` na mesma rota e confira **Consulta limitada**. O navegador usa o executor real, com transporte e modelo fictícios. `node --test scripts/atlasConsultationPresentation.test.mjs` verifica os rótulos.

Em `?estado=carteira-metas#/cs-ia/carteira?busca=Aurora`, abra **Leads da Aurora**, altere a verba fictícia de R$ 900 para R$ 960 e volte pela **Carteira** da ficha. A busca permanece e o cartão mostra 15 de 80 leads. Abra as mesmas metas no Gestor IA e restaure a verba. `?estado=carteira-metas-revogadas` simula revogação após a primeira checagem. O teste `scripts/gestor-ia/data.test.mjs` verifica escopo da página, vínculo ativo e reconfirmação.

Em `?estado=carteira-cadastro-falha#/cs-ia/carteira?busca=Aurora`, abra **Novo cliente** e confira a etapa Fechado. Fechar devolve a busca. Crie uma conta fictícia com Aurora no nome e um entregável. A primeira gravação simula perda da resposta. Repita e confirme uma única conta na carteira. No menu da linha, edite o cadastro, ajuste a avaliação e confirme o encerramento com motivo. `node --test scripts/gestor-ia/client-edit.component.test.mjs` verifica a recuperação com o mesmo identificador e a edição oficial.

Em `?estado=segmentos#/cs-ia/carteira`, selecione **Educação Infantil** e depois **Crítico**. A busca `educacao infantil` encontra as duas grafias. **Sem segmento** mostra Mosaico. `segmentos-revogados` e `segmentos-sem-permissao` ocultam nichos e filtro. `segmentos-falha` permite nova tentativa. Em `carteira-cadastro`, edite **Nicho de mercado** e confira o rótulo atualizado ao voltar. `node scripts/cs-ia/radar.database.test.mjs` verifica o recorte e as permissões do RPC.

Em `?estado=triagem-atlas-sinais-simultaneos#/cs-ia/hoje`, selecione **Queda na nota**, **Resposta pendente** e **Grupo sem atividade recente** separadamente. Aurora aparece nos três e mantém a prioridade crítica. A triagem fictícia do Atlas recebe o sinal principal e os adicionais. Em Configurações, mudar o gatilho de 15 para 25 pontos retira a queda de 22 pontos. Restaure a regra ao final. `sinais-regras-indisponiveis` exercita a fila com a consulta de limites indisponível.

Em `?estado=triagem-atlas-saida-participante#/cs-ia/hoje`, filtre **Saída de participante** e confira Aurora e Lume. Aurora mantém a prioridade crítica. Lume entra na fila pela saída e mostra a data em **Conversas** e no **Histórico**. Volte a Hoje, abra **Perguntar ao CS IA** e envie na prévia fictícia. O Atlas deve mencionar a saída entre os sinais de Aurora. `node --test scripts/cs-ia/{group-departure,views,atlas-draft}.test.mjs` cobre o handler isolado e a projeção. `node scripts/cs-ia/radar.database.test.mjs` confere fonte, recência, ordem de chegada, revisão e RLS em banco descartável.

Em `?estado=canais-cs#/cs-ia/configuracoes`, abra **Conexões** e siga para **Receber msgs**. No canal A, clique em **Ativar saídas no CS IA** e depois em **Configurar na uazapi**. Confira o resultado de cada ação. O canal B deve pedir que o recebimento seja ligado antes de ativar saídas. Em `?estado=canais-cs&perfil=colaborador#/conversas/canais?aba=webhook`, a ação do CS fica oculta. `node --test scripts/cs-ia/webhook-subscription.test.mjs` usa um transporte fictício para verificar eventos, filtros, opções de URL, destinos e a segunda leitura.

Em `?estado=canais-cs-falha&largura=390#/cs-ia/configuracoes`, abra **Conexões**. Confira Canal A conectado com dois clientes e Canal B desconectado com um cliente. A primeira atualização simulada falha e oculta os cartões. A segunda recupera a lista. Com `estado=canais-cs&perfil=colaborador`, apenas o canal vinculado à carteira do perfil aparece. `node scripts/cs-ia/radar.database.test.mjs` verifica a projeção, o vínculo exato, as permissões, o arquivamento e a contagem após perda de acesso a uma conversa. A lista lê o estado registrado no Atendimento.

Em `?estado=canais-cs&largura=390#/cs-ia/configuracoes`, abra **Conexões** e pause o Canal A com Espaço. Confira o foco de volta no interruptor, o Canal B ativo e o estado conectado do Canal A. Em **Grupos**, confira o acompanhamento pausado com o atalho do Atendimento disponível. Volte para Conexões e retome pelo interruptor. A fixture mantém o estado durante a navegação. Execute `node scripts/cs-ia/radar.database.test.mjs` e `node scripts/cs-ia/reading.database.test.mjs` para verificar a transição real com banco descartável, incluindo versão antiga, rotina diária, saídas, autorização individual e reservas em andamento.

Em `?estado=quadro-cs-resposta-perdida&largura=390#/cs-ia/configuracoes`, abra **Tarefas**, desligue o quadro no rascunho, mude de seção e volte. Salve. A primeira resposta simulada falha depois de gravar, e a tela confirma pela releitura. Confira a sala fora do menu e as tarefas ainda disponíveis na ficha de Aurora. Reative o quadro e alterne a movimentação sem fechar a sala. `node --test scripts/cs-ia/{data,workspace}.test.mjs` verifica o acesso direto e a versão. `node scripts/cs-ia/reading.database.test.mjs` confirma a pausa e a retomada no gatilho real em banco descartável.

Em `?estado=leitura-cs-resposta-perdida&largura=390#/cs-ia/configuracoes`, abra **Leitura das conversas**. Teste os controles separadamente, passe por outra seção, descarte e salve. A primeira resposta se perde depois de gravar e a tela confirma o estado ao reler. Na carteira, abra **Lume Atelier → Conversas** e confirme o estado da pausa e as autorizações do grupo. Use `perfil=colaborador` para conferir a consulta sem edição. `node scripts/cs-ia/reading.database.test.mjs` verifica o isolamento das filas, a autorização de gravação, a versão e a invalidação de reservas após as pausas e retomadas.

Em `?estado=fator-conversas&largura=390#/cs-ia/clientes/lume`, confira **Conversas** em Fatores da saúde e expanda o diário em Histórico. Alterne entre 7, 30 e 90 dias para conferir a evidência de cada avaliação. `node scripts/cs-ia/reading.database.test.mjs` verifica a publicação da análise, o peso redistribuído, a comparação de sete dias, a pausa, a expiração, as permissões e a captura diária. `node --test scripts/cs-ia/atlas-draft.test.mjs` verifica o repasse de datas e sinais ao Atlas sem o texto das mensagens.

Em `?estado=pedidos-origem-atlas&largura=390#/cs-ia/clientes/aurora?aba=tarefas`, compare **Tarefa criada pelo Atlas** e **Tarefa vinculada**. Abra a primeira no editor oficial, cancele e confira a marca na sala de Tarefas. `node scripts/cs-ia/reading.database.test.mjs` executa o gravador oficial após alinhamento fictício e verifica reexecução, atribuição, revogação e confirmação do recibo. `node --test scripts/cs-ia/data.test.mjs` verifica o recorte das tarefas e a preservação da lista quando a origem está indisponível.

Em `?estado=tarefas-whatsapp-criacao&largura=390#/cs-ia/clientes/aurora?aba=tarefas`, confira o selo na tarefa de acompanhamento, descarte e salve a regra **Criação de tarefas pelo WhatsApp**. Verifique que a movimentação permanece pausada. Pause a automação geral em Configurações → Tarefas e revogue a autorização na ficha. A tarefa existente continua no quadro. Em `scripts/atlas-events`, `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_cs_reading` verifica classificação, janela e orçamento com modelo fictício. `node scripts/cs-ia/reading.database.test.mjs` verifica a criação e os bloqueios no gravador em banco descartável.

Em `?estado=tarefas-whatsapp-contexto&largura=390#/cs-ia/clientes/aurora?aba=tarefas`, descarte e salve a autorização de **Movimentação pelo contexto da conversa**. Confira a criação e o comando explícito pausados. Abra **Conferir reclamação no WhatsApp** em **Em andamento** e verifique a criação e a movimentação no Histórico. Cancele o editor, pause a regra e confirme que a tarefa continua no quadro. Os mesmos testes Python e PostgreSQL verificam seleção restrita à fonte, autoria, checklist, revogação e registro da transição.

Em `?estado=triagem-atlas-retorno#/cs-ia/hoje`, filtre **Retorno do cliente pendente no grupo**, abra Conversas na ficha de Lume e confira o fim da janela e a explicação. Ao perguntar ao CS IA na prévia, Aurora mantém a prioridade crítica e mostra o retorno entre os sinais adicionais. Em `triagem-atlas-retorno-atualizado`, uma nova mensagem fictícia invalida o sinal de Aurora entre o rascunho e a consulta. Use `node scripts/cs-ia/reading.database.test.mjs` para o banco descartável e `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts/atlas-events python3 -m unittest test_cs_reading` para o classificador com modelo falso.

Em `?estado=triagem-atlas-demanda#/cs-ia/clientes/aurora`, envie a análise fictícia e abra **Preparar demanda no CS**. Confira a ficha fixa e o contexto vazio. Selecione uma frase da resposta e use **Usar trecho selecionado**. Guarde a demanda, prepare o repasse manual, escolha o responsável e confirme a revisão. A tarefa oficial deve mostrar apenas a frase selecionada. `?estado=triagem-atlas-demanda-revogada` recusa a abertura da resposta na ficha. `node --test scripts/cs-ia/{data,atlas-draft,atlas-triage-edge}.test.mjs` confere a origem, titular, cliente, conversa e revogação.

`node scripts/gestor-ia/task-route.test.mjs` cobre o acesso ao editor oficial a partir do CS, incluindo cliente fixado, revogação e retorno à ficha. A prévia isolada permite criar uma tarefa fictícia e mudar seu status com o checklist oficial.

Em `/cs-ia/tarefas`, a prévia verifica o quadro de clientes autorizados, filtros de cliente e situação e volta ao mesmo recorte do editor. `?perfil=colaborador#/cs-ia/tarefas` restringe tarefas pela atribuição. `?estado=sem-tarefas#/cs-ia/tarefas` verifica o bloqueio e a ausência no menu. `workspace.test.mjs` verifica revogação antes da nova consulta de tarefas.

O banco descartável em `node scripts/cs-ia/reading.database.test.mjs` verifica o início pelo WhatsApp ao concluir uma leitura do grupo. A prévia `?estado=movimento-historico#/cs-ia/clientes/aurora?aba=tarefas` abre uma tarefa fictícia com a ação de CS IA no histórico. Em Lume, a leitura fictícia já está ativa para exercitar adesão e pausa.

Na prévia do CS, `?estado=demanda-revogada#/cs-ia/clientes/aurora?aba=tarefas` bloqueia o repasse após abrir o formulário. `?estado=demanda-resposta-perdida#/cs-ia/clientes/aurora?aba=tarefas` simula a perda da primeira resposta de gravação e confirma que a nova tentativa usa o mesmo registro. A Central real roda com análise e gravações fictícias.

`node scripts/cs-ia/reading.database.test.mjs` cobre também o tempo de resposta da Equipe. Verifica as duas janelas, agrupamento de pedidos, espelho tardio, autoria, automação, troca de canal, classificação e revogação. Na prévia, `?estado=tempos-indisponiveis#/cs-ia/equipe` simula falha na primeira leitura e permite testar nova tentativa.

Em Equipe, **Editar WhatsApp** usa o cadastro oficial da pessoa. A prévia sem parâmetros permite verificar conflito com o número fictício de Bruno, cadastro para Luana, reabertura e retirada. `?estado=telefone-concorrente#/cs-ia/equipe` recusa a primeira alteração de Bruno por versão desatualizada. **Atualizar cadastro** permite tentar de novo. `?perfil=colaborador#/cs-ia/equipe` oculta a ação. A suíte descartável de leitura verifica que um cadastro posterior à mensagem não autoriza a movimentação antiga.

Em Conversas na ficha, **Transcrever novos áudios deste grupo** pode ser salvo, atualizado e pausado em prévia. `node --test scripts/cs-ia/audio-worker.test.mjs scripts/atlasAudio.test.mjs` verifica os dois fluxos com transporte fictício. A suíte PostgreSQL de leitura usa a migração oficial de áudio e verifica orçamento diário, privacidade, revogação e convivência com a fila anterior. O worker usa `ATLAS_CS_AUDIO_ENABLED=true` somente quando a ativação real for autorizada.

Em `?estado=pedidos-whatsapp#/cs-ia/clientes/aurora?aba=tarefas`, a prévia mostra uma demanda fictícia de mensagem do grupo. Abra a demanda, analise, revise, aprove e retorne para conferir a tarefa oficial. A ficha de Lume fica sem esse pedido. `?estado=pedidos-revogados#/cs-ia/clientes/aurora?aba=tarefas` simula acesso revogado. A suíte descartável de leitura também executa a projeção oficial do Atlas duas vezes para verificar deduplicação.

Em `?estado=pedidos-whatsapp-fila#/cs-ia/clientes/aurora?aba=tarefas`, use **Atualizar pedidos** duas vezes e compare **Na fila**, **Em análise** e **Analisado · aguardando publicação**. Confira **Publicado** no cenário `pedidos-whatsapp`. Em `pedidos-fila-indisponivel`, a consulta de fila falha e o pedido publicado continua disponível para revisão. `node scripts/cs-ia/reading.database.test.mjs` confirma o titular, os módulos, o vínculo e a projeção sem conteúdo de mensagens.

A suíte descartável de leitura aplica a migração de vínculo do Atlas e cobre registro oficial sem espelho, legado, ambiguidade, JID repetido, troca de canal e projeção após revogação. `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts/atlas-events python3 -m unittest test_source_inventory test_context test_model_context test_claim_freshness` verifica o recorte antes do modelo com transporte fictício. Em uma entrega autorizada, aplique a migração com `atlas_event_resolve_groups` antes de iniciar o worker novo.

`node --test scripts/cs-ia/{data,views,workspace,atlas-draft,group-members}.test.mjs` verifica ordenação, paginação, regras, encerramento, leitura, organização de equipe, revalidação da carteira, rascunho do Atlas e consulta de membros com transporte falso. O teste de montagem usa o React Test Renderer de `/tmp/planeje-crm-ui-qa` das verificações do Gestor. `node scripts/cs-ia/radar.database.test.mjs` e `node scripts/cs-ia/reading.database.test.mjs` usam PostgreSQL descartável por socket Unix, sem aceitar DSN. O primeiro verifica também acesso, versionamento e escrita concorrente de cargos e squads. O ciclo de leitura pode ser testado com `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts/atlas-events python3 -m unittest test_cs_reading`. A prévia isolada usa `scripts/cs-ia/preview/vite.config.mjs` na porta 4393 com transporte fictício. [Escopo e limites](continuidade-planeje/referencias/cs-ia-local-2026-11-09.md).
