# Relatórios Google e Site compactos — produção de 28/10/2026

**PUBLICADO E VERIFICADO às21h29 de São Paulo (00h29 UTC de29/10).**
Josias autorizou com “pode”, após a prévia local e a pergunta específica sobre
publicar este ajuste. Aceite humano de uso continua separado.

[Entrega local](rastreamento-relatorios-compactos-local-2026-10-28.md) ·
[Hashes e evidência sanitizada](../evidencias/releases/rastreamento-relatorios-compactos-producao-2026-10-28.json).

## Resultado e composição

Cartões menores e sombras mais definidas nas abas Google/Site. Grade adaptável,
filtro Google em linha quando há espaço e fontes do Site com nome/contagem em
linha e seleção/foco visíveis. Período, consultas, filtros, cálculos e tabelas
preservados; comparação estrutural confirmou somente classes/sombra alteradas.
A aba Meta recebe apenas o menor espaçamento externo das abas compartilhadas.

Overlay de dois JSX: CrmRelatorioGoogle e RastreamentoRelatorios. Candidata
`/root/planeje-releases/rastreamento-report-compact-20261028-01/candidate`, herdada
da base Atlas gerente integrado20h42, com suas1.785 fontes e perfil
`.env.production.local` copiado somente na VPS. A atualização Atlas posterior à
prévia foi conferida e preservada; nenhum bundle antigo/dist da raiz foi usado.

Main `index.ac642a92.js`, CSS `index.be735577.css`; HTML SHA-256
`60773a7ce5ce80b09a10f2a37e09bc915fd6d4aa6b92de51b06acd74bc97ed50`.
Publicador frontend anterior reutilizado; promoção/recuperação, publicação e
verificação inalteradas, com base e manifesto exatos atualizados. Troca do HTML
atômica após assets, backup e guardas de concorrência. Ativos anteriores e
escritório preservados; não repetir o publicador.

Sem SQL, migração, restart, auth/permissões, reclassificação, edição comercial,
conversão ou mensagem de teste. Runtime Edge, cinco serviços Atlas e units/drop-ins
mantidos. Nova entrega deve herdar esta base frontend/fontes ou sucessora; os
workers continuam nas candidatas e configurações anteriores.

## Verificação e limites

- Três scripts/lint/build locais e prévia1440/1024/390/320 da etapa anterior.
  Site/Google e lint repetidos antes da promoção, sem problemas.
- Nove scripts de domínio/regressão na candidata e build com perfil produtivo
  passaram.24 testes do publicador locais e24 na VPS passaram.
-1.785 fontes, seis HTTP/hashes (HTML, novos/antigos assets e escritório), cinco
  serviços ativos, units/drop-ins e runtime preservados conferidos após a troca.
- Navegador autenticado: Site com fontes/resumo/lista, filtro por chatgpt.com e
  restauração de Todas as fontes; Google com custo real e indicadores em duas
  linhas. Cartões com63,59px, botões de fonte com51,20px e sombra esperada; sem
  overflow horizontal da página. Retorno final à aba Site.
- Capturas produtivas privadas em visualizações de28/10, sem contatos no recorte:
  `relatorios-compactos-producao.png` e `relatorios-compactos-google-producao.png`.
  Metadados operacionais privados na release da VPS e em `.local/`.

Celular físico e tema escuro não foram inspecionados nesta publicação. A validação
estreita foi realizada na fixture local. Aceite de uso e resultado comercial não
são inferidos dos testes técnicos.
