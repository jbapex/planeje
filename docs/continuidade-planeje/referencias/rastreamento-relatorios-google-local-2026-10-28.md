# Relatórios Google no Rastreamento — entrega local em 28/10/2026

**Atualização:** [publicado e verificado às18h12](rastreamento-relatorios-google-producao-2026-10-28.md)
após autorização específica posterior. O registro abaixo preserva a evidência local.

Estado: implementado e verificado localmente. Publicação na VPS e aceite humano
não realizados nem autorizados para este incremento. Nenhuma migração, escrita
produtiva, mudança de permissão, OAuth, reenvio ou nova dependência.

## Comportamento

Relatórios passa a ter abas Meta/Google, Meta inicial e período mensal próprio
compartilhado. `relatorio_plataforma=google` abre Google sem interferir em
`plataforma`, usado por Eventos. O consumidor Meta do CRM direto mantém seu período interno.

Google mostra resumo, filtro/tabela de campanha e contatos com abertura da ficha
existente. Leads/vendas/etiquetas usam última atividade; conversas reais/qualificados
usam primeira mensagem, como Meta. Datas de corte usam São Paulo. Contato e lead
do mesmo telefone contam uma vez; comercial usa o resolvedor existente. Primeira
origem Google é preservada, Meta/Site principais ficam fora e não se reatribui histórico.

Gasto usa `get-campaigns` das contas ativas vinculadas ao cliente. Campanha só é
associada por ID exato ou nome único, respeitando conta conhecida; GCLID sozinho
não informa campanha. Sem correspondência, custo da campanha fica indisponível.
Falha de conta/moedas distintas não gera gasto zero; ROAS somente BRL/BRL.

Contatos e leads são lidos com SDK autenticado/RLS, filtro por cliente e paginação
com contagem exata. Página repetida, vazia prematura, total divergente e teto200mil
falham explicitamente. Escopo/cleanup descartam leitura antiga ao trocar cliente
ou período. Erro de dados não aparece como zero leads; erro de gasto preserva os contatos.

## Fontes e validação

Três módulos novos: `src/lib/crmRelatorioGoogle.js`,
`src/components/crm/CrmRelatorioGoogle.jsx`, `src/components/crm/RastreamentoRelatorios.jsx`.
Deltas pequenos em Meta (período opcional), ContatosRastreamentoPage (painel) e
rastreamentoHub (ajuda). Baseline da tarefa preservado em
`.local/rastreamento-relatorio-google-20261028/before/`; árvore anterior não foi restaurada.

Passaram:

- `node scripts/crmRelatorioGoogle.test.mjs`: domínio e SDK real com fetch fictício;
  1001 contatos e teto do servidor200, primeira origem, datas, dedupe, campanha,
  moeda, falha parcial e escopo por cliente. Falhas RED do módulo ausente e da
  origem principal Google com sinal Meta posterior foram observadas antes do reparo.
- `node scripts/crmRelatorioMetaTracking.test.mjs`,
  `node scripts/crmRelatorioMetaSpend.test.mjs`, `node scripts/rastreamentoHub.test.mjs`,
  `node scripts/rastreamentoLeadFicha.test.mjs`, `node scripts/googleAdsDashboard.test.mjs`.
- ESLint dos seis arquivos de produto: zero erros; dois avisos anteriores de tamanho
  em Meta/Hub. `npm run build:check`: saída0, build temporário, sem alterar dist/ZIPs.
- `npm run verify:context` e `git diff --check` do recorte: saída0.
- Revisão independente somente leitura: zero P1/P2 no delta; teste novo e checks
  extras de datas/contagem/duplicação passaram. Relatório sensível privado fora do repositório.
- CUA em fixture isolada: Meta/Google, período compartilhado, campanha sem custo,
  ficha correta, intervalo vazio, falha Google, falha de dados, clienteA atrasado3s
  seguido de clienteB sem resposta antiga reaparecer. Layout390/320px sem corte dos
  controles; tabelas têm rolagem interna. Override de viewport restaurado.

![Prévia com dados fictícios](../evidencias/rastreamento-relatorios-google-local-2026-10-28.png)

Capturas estreitas: [390px](../evidencias/rastreamento-relatorios-google-local-390-2026-10-28.png)
e [320px](../evidencias/rastreamento-relatorios-google-local-320-2026-10-28.png).
[Manifesto sanitizado](../evidencias/rastreamento-relatorios-google-local-2026-10-28.json).

Context7 consultado para `supabase-js`2.30.0; catálogo não oferecia a versão fixada
e retornou documentação atual. Contrato foi confirmado no SDK instalado e fixture;
nenhuma atualização de pacote ou consulta com segredo.

## Limites e próximo passo

Não certifica rede Google, RLS/OAuth/PostgREST produtivos, gasto real ou celular físico.
A ficha foi aberta, sem editar/enviar; a conversa não faz parte da simulação desta prévia.
`get-campaigns` anterior tem limites10000 métricas/200 atributos e fallback BRL se
a consulta de cliente falhar. A tela herda esse contrato; completude/moeda não são
certificadas em contas que atinjam essas condições. Offset/contagem não é snapshot transacional.

Antes de eventual publicação autorizada, reler operação e base atual: o estado
canônico mais recente registra Atlas17h01, posterior ao UTM15h28. Herdar perfil e
fontes concorrentes; publicar somente os seis arquivos de produto deste delta.
Sem SQL, reinício, reparo de dados antigos ou reenvio de conversões previsto.
