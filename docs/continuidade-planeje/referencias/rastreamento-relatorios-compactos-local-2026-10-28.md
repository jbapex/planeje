# Relatórios Google e Site compactos — 28/10/2026

**Atualização:** [publicado e verificado às21h29](rastreamento-relatorios-compactos-producao-2026-10-28.md) após autorização específica posterior. A evidência local abaixo permanece histórica.

**Implementado e verificado localmente; não publicado.** Pedido de Josias após
os prints das duas abas: cartões menores e sombras mais definidas.

## Recorte

Dois JSX alterados: CrmRelatorioGoogle e RastreamentoRelatorios. Somente classes
e a sombra compartilhada das superfícies; comparação de AST sem estilos confirma
que consultas, cálculos, filtros, eventos, clientes, histórico e permissões não
mudaram. Sem dependência, migração, servidor ou dado produtivo alterado.

Indicadores usam grade adaptável ao espaço e cinco colunas a partir de 1024px;
cartões menores, espaçamento reduzido e sombra em duas camadas. O filtro Google
fica em uma linha quando há espaço. Fontes do Site usam nome/contagem lado a lado,
seleção violeta e foco de teclado com afastamento. Tabelas mantêm sua rolagem
horizontal interna. Abas recebem só o ajuste de espaçamento, inclusive Meta.

## Verificação

- Site: quatro testes passaram. Google e navegação do Hub passaram.
- ESLint dos dois JSX: nenhum problema. Build temporário passou; dist/ZIP da raiz
  não são artefatos desta entrega.
- Revisão estrutural local confirmou alteração exclusivamente visual; sem teste
  novo que apenas repita classes CSS.
- Chrome com dados fictícios em 1440, 1024, 390 e 320px; nenhuma rolagem horizontal
  da página. Google seleciona Busca e reduz dois leads para um; chatgpt.com reduz
  quatro Site para dois, Todas as fontes restaura quatro. Foco visível conferido.
- Em 1024px os dez indicadores Google passam de cinco para duas linhas; altura
  individual de 82 para 63,59px (cerca de 22% menor). Início de Por campanha passa
  de y793,74 para y408,53 no mesmo cenário. Override do viewport restaurado.

![Site, dados fictícios](../evidencias/rastreamento-relatorios-compactos-local-2026-10-28-site.png)

![Google, dados fictícios](../evidencias/rastreamento-relatorios-compactos-local-2026-10-28-google.png)

[Hashes e evidência](../evidencias/rastreamento-relatorios-compactos-local-2026-10-28.json).
Baseline privado em `.local/rastreamento-report-compact-20261028-01/baseline/`.

## Limites e próximo passo

Publicação deste ajuste exige autorização específica; o Publicar anterior já
foi atendido na entrega Site/source das18h47. Antes de promover, conferir release,
fontes concorrentes e perfil produtivo vigentes, aplicando só estes dois JSX.
Não usar dist da raiz. Celular físico, tema escuro e visual produtivo não foram
inspecionados nesta etapa. Aceite humano separado da verificação técnica.
