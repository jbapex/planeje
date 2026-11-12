# Site e sources em Relatórios — entrega local de 28/10/2026

**Atualização:** [publicado e verificado às18h47](rastreamento-site-source-producao-2026-10-28.md)
após autorização específica posterior. A evidência local abaixo permanece histórica.

**Implementado e verificado localmente; não publicado.** Pedido de Josias para
selecionar contatos Site e ver quantos leads vieram de cada source. Autorização
da publicação Google às18h12 pertence à entrega anterior, já concluída.

## Comportamento e recorte

Terceira aba **Site** junto de Meta/Google, mesmo período próprio compartilhado.
`relatorio_plataforma=site` abre o recorte. Meta permanece padrão e Google mantém
filtro/custos anteriores. Site mostra comercial, contatos e quadro **Leads por
origem (utm_source)** com cartões clicáveis. Todas as fontes remove o filtro;
source ausente aparece como Sem source informado. A lista mostra source e abre
a ficha existente; contatos são contados uma vez mesmo vinculados a um lead.

Fonte usa campo utm_source textual aparado ou tracking_data.utm_source. Caixa é
preservada; chaves prefixadas separam fonte literal `__all__` de seleção global.
Cartões mostram contagem global de leads Site no período, mesmo ao selecionar
uma fonte. Resumo/lista mudam com a seleção. Histórico não multiplica a contagem.

Primeira origem Site registrada é respeitada; Google/Meta ficam nas próprias
abas. Site não é inferido só por frase ou por utm_source desconhecida. Site legado
com planeje_link_origin ou lead.origem explícito também entra. Origem conhecida
prevalece sobre sinais posteriores. Leads/vendas/etiquetas usam última atividade;
conversas reais/qualificados, primeira mensagem, no calendário de São Paulo.

Site não lê contas nem API Google e não mostra gasto/CPL/ROAS de anúncios. Leitor,
paginação completa, RLS/cliente e comercial são os existentes, reutilizados sem
alterar dados, permissões, banco, autenticação ou integrações.

## Implementação e revisão

Seis fontes de produto: crmRelatorioGoogle.js, CrmRelatorioGoogle.jsx,
RastreamentoRelatorios.jsx, rastreamentoHub.js, rastreamentoTrackableLink.js e
rastreamentoLeadFicha.js. Baseline exato em `.local/rastreamento-site-source-20261028/before/`.
Sem novo pacote, migração ou publicação; árvore local anterior preservada.

Revisão independente somente leitura encontrou um P2: Site legado podia ser
reinterpretado como Meta na ficha, pois originLabel mudava só o texto. Os dois
formatos com CTWA foram reproduzidos em teste RED (`meta !== site`). Correção no
resolvedor da ficha e classificação compartilhada `recordedOriginSource` reconhece
origem registrada válida antes de sinais posteriores. Teste GREEN confirma
originKind Site, showCreative/showCapiJourney false. CUA do legado mostrou origem
chatgpt.com e Sem anúncio vinculado, sem jornada Meta. Não houve outro P1/P2;
o reparo posterior foi validado pelo executor, sem segunda revisão completa.
Relatório sensível permanece privado fora do repositório.

## Evidência

- `node scripts/crmRelatorioSite.test.mjs`: quatro testes, domínio e SDK/fetch
  sintético; ausência inicial da funcionalidade e P2 foram observados em RED antes do GREEN.
- Oito regressões passaram: crmRelatorioGoogle, rastreamentoLeadFicha,
  rastreamentoTrackableLink, miniCrmOrigin (17 cenários), crmRelatorioMetaTracking,
  crmRelatorioMetaSpend, rastreamentoHub e googleAdsDashboard (quatro casos).
- ESLint dos seis produtos sem problemas; build:check final saída0, temporário.
- verify:context e diff --check do recorte passaram, sem erro de link ou espaço.
- CUA em fixture: cartões com totais4/2/1/1, fonte vazia, seleção/resumo/lista,
  ficha legada, Meta/Google, período vazio, falha sem falso zero e resposta antiga
  após troca de cliente. Larguras390/320px com cartões acessíveis e rolagem interna
  na tabela; override de viewport restaurado. Nenhuma edição comercial/envio.

![Prévia fictícia](../evidencias/rastreamento-site-source-local-2026-10-28.png)

[390px](../evidencias/rastreamento-site-source-local-390-2026-10-28.png) ·
[320px](../evidencias/rastreamento-site-source-local-320-2026-10-28.png) ·
[Manifesto sanitizado](../evidencias/rastreamento-site-source-local-2026-10-28.json).

## Limites e próxima etapa

Não houve consulta a dados reais, alteração produtiva ou teste em celular físico.
Conversa da ficha não é simulada nesta prévia; classificação e apresentação foram
conferidas. Quantidade segue contatos/primeira origem e coortes do relatório atual,
sem nova garantia de snapshot transacional ou união de cadastros duplicados antigos.
O gasto Google conserva limites do endpoint já publicado, sem mudança neste recorte.

Publicação depende de autorização específica para este complemento. Se autorizada,
reler operação/concorrência, herdar perfil e base vigente (atualmente registro de
Relatórios Google18h12), compor somente o delta e preservar demais entregas.
Sem SQL, restart, reclassificação ou reenvio de conversões previsto.
