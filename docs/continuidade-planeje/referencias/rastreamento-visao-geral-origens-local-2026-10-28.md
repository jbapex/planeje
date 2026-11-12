# Visão geral por origem — entrega local de28/10/2026

**Ajuste visual após retorno de Josias:** o cockpit deve preservar os gráficos
como conteúdo principal. Conversão por etapas e evolução diária foram trazidas
para logo após os indicadores; quadros e tabela por origem ficam abaixo deles.
O mesmo funil colorido e o mesmo gráfico existentes são reutilizados. O recorte
anterior terminava antes dos gráficos e não representava bem a tela completa.

Mudança adicional restrita à ordem de blocos no OverviewOrigins. Comparação AST
confirmou os mesmos blocos, props, imports e lógica; lint, cinco testes de origens,
regressão do cockpit e build temporário passaram. CUA em Todos/Google/Site e390px
confirmou funil → diário → origens; sem overflow. Desktop: funil de y726,71 para
335,16; diário de y1143,34 para751,79. Captura atual mostra ambos os gráficos.
A revisão independente anterior permanece válida para o domínio; este ajuste
visual posterior foi conferido pelo executor, sem nova revisão independente.
Publicação continua pendente, sem nova autorização ou ação na VPS.

**IMPLEMENTADO E VERIFICADO LOCALMENTE; NÃO PUBLICADO.** Pedido de Josias para
selecionar Google, Meta, Site ou todas as origens dentro da Visão geral.

## Comportamento

Abas **Todos / Meta / Google / Site**, com Todos como abertura padrão. Seleção
usa `visao_origem` na URL, separada de `relatorio_plataforma` e `plataforma` dos
Eventos; valor inválido volta a Todos. Cliente e período continuam os do Hub.

Todos inclui Não rastreada. Indicadores comerciais, quadro por plataforma e
por origem/source, funil e conversas por dia. Site detalha utm_source, como
chatgpt.com e Linktree. Sem primeira origem Site registrada, uma UTM solta não
inventa esse vínculo. Histórico posterior não substitui a origem principal.

O leitor All reutiliza a paginação completa por cliente e o dedupe comercial dos
relatórios: contato prevalece sobre lead vinculado; vínculo ambíguo não empresta
comercial de outro lead. Não soma histórico como novos contatos. Leads, vendas e
fontes usam última atividade; conversas reais/qualificados usam primeira mensagem
recebida no WhatsApp. Formulários sem conversa não entram em Conversas reais.

Google conserva gasto/CPL/ROAS do leitor de contas existente. Moedas/falhas e falta
de vínculo continuam explícitas; receita comercial é BRL, ROAS indisponível fora
de BRL. Funil usa a moeda do custo Google. Todos/Site não somam gasto nem misturam
receita orgânica em ROAS publicitário. Meta mantém seu cockpit, comparação diária,
gatilhos da jornada e saúde CAPI somente na sua aba. O resumo Meta também respeita
primeira origem Site/Google diante de sinais posteriores de anúncio.

Estado é vinculado a cliente/origem/período e descarta retornos antigos. Meta
remonta nessa troca. Falha de leitura não mostra cartões com falsos zeros.
Nenhuma mudança em SQL, auth/RLS, ingressos, dados, envio de eventos ou publicação.

## Implementação e verificação

Sete produtos, cujos hashes estão na evidência; baseline privado em
`.local/rastreamento-overview-origins-20261028/before/`. Dois helpers/componentes
novos; os gráficos/cartões existentes são reutilizados com padrão Meta preservado.
Fixture4378 ampliada com leitura All, cliente com total distinto e moedas/falhas.

- Cinco testes novos de domínio/SDK real2.30 com fetch sintético: origens,
  primeira origem, dedupe/comercial, fronteira São Paulo, paginação/teto137,
  filtro obrigatório de cliente, falha e nenhuma API Ads no All.
- Regressões hubOverviewDashboard, relatórios Google/Site, Hub, Meta tracking/gasto
  e links passaram (oito scripts no total). RED→GREEN de primeira origem e USD.
- Lint sem erros; dois avisos max-lines já presentes nos dois baselines. Build
  temporário passou,4100 módulos; dist/ZIP raiz preservados.
- Revisão independente cirúrgica identificou P2 de moeda no funil. Correção e
  reteste do JSX real desktop/móvel: USD preservado, Meta BRL padrão. Nenhum
  P1/P2 restante; relatório de segurança privado fora do repositório.
- CUA em1440/1024/390/320: quatro abas, totais/soma, sources, saúde Meta isolada,
  BRL/USD, falha Google sem custo falso, leitura falha sem cartões, resposta antiga
  de A descartada após B, data Hoje compartilhada e vazio, mês restaurado e teclado.
  Sem overflow da página; tabela/gráfico mantêm rolagem interna. Viewport restaurado.
- Graphify local consultado sem IA/rebuild; grafo desatualizado/não cobre helpers
  novos, confirmado por código e revisão. Context7 não oferece versão2.30 do SDK;
  documentação v2.58 de select/range/count foi contrastada com o SDK2.30 instalado
  e sua execução sintética. Nenhum upgrade, novo provedor ou custo foi ativado.

![Prévia fictícia](../evidencias/rastreamento-visao-geral-origens-local-2026-10-28.png)

[390px](../evidencias/rastreamento-visao-geral-origens-local-2026-10-28-390.png) ·
[320px](../evidencias/rastreamento-visao-geral-origens-local-2026-10-28-320.png) ·
[Hashes e evidência](../evidencias/rastreamento-visao-geral-origens-local-2026-10-28.json).

## Próximo passo e limites

Publicação específica ainda não autorizada para esta entrega; o “pode” anterior
já publicou os relatórios compactos às21h29. Se autorizada, herdar base/perfil e
fontes concorrentes vigentes, sem dist da raiz ou reaplicar migração. A última
base observada é report-compact21h29; conferir novamente antes de promover.

Sem validação de dados/API reais, snapshot transacional, tema escuro ou celular
físico nesta etapa. Meta herda seus limites anteriores de leitura; custos Google
herdam o endpoint de contas. Aceite humano separado da validação técnica.
