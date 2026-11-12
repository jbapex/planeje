# Relatórios Google no Rastreamento — produção de 28/10/2026

**PUBLICADO E VERIFICADO às 18h12 de São Paulo; aceite de uso pendente.**
Josias autorizou com “pode sim”, após a entrega local testada e revisada.
[Implementação local](rastreamento-relatorios-google-local-2026-10-28.md) ·
[Evidência sanitizada](../evidencias/releases/rastreamento-relatorios-google-producao-2026-10-28.json).

## Resultado

Rastreamento → Relatórios tem abas Meta/Google. Google mostra contatos, resultados
comerciais, tabela/filtro de campanha e gasto das contas ativas vinculadas. Período
mensal é compartilhado; Meta permanece inicial quando não há seleção explícita.
Primeira origem, dados comerciais e histórico permanecem nos contratos existentes.

Uma UTM só é associada ao gasto por ID exato ou nome único da campanha, respeitando
conta conhecida. UTMs com nomes diferentes das campanhas do Ads ficam em linhas
separadas, sem custo individual. Isso foi observado na conferência real; não houve
associação por suposição nem regravação da atribuição. O total usa gasto retornado pela API.

## Composição e operação

Nova base frontend/fontes:
`/root/planeje-releases/rastreamento-google-report-20261028-01/candidate`,
herdada de `atlas-context-20261028-01/candidate` (17h01), com perfil
`.env.production.local` herdado somente na VPS. A base tinha1.774 fontes, todas
conferidas; três arquivos existentes coincidiam com o baseline local. Overlay
restrito a seis arquivos de produto e um teste novo, totalizando **1.778 fontes**.

Main `index.f646566d.js`, CSS `index.7b240bf4.css`; HTML SHA-256
`63f1853c99b0700c3ef9d2136cd37ef1c3ad6261ed64e64e9e61827b4620b377`.
Não foi promovido o dist da raiz, fixture ou trabalho local alheio. Assets antigos
e escritório preservados. Publicador frontend anterior reutilizado com algoritmo
de promoção/recuperação inalterado, manifesto exato, guardas de concorrência e
backup antes da troca atômica do HTML.

Sem SQL, migração, restart, mudança de autenticação/permissão, reenvio de conversão
ou mensagem WhatsApp de teste. Cinco serviços Atlas mantêm seus units/drop-ins e
candidatas anteriores; runtime Edge inalterado e container ativo. Não repetir o
publicador. Futura entrega deve herdar esta base e o perfil produtivo vigente.

## Verificação e limites

Seis scripts locais e na candidata passaram: domínio/leitor Google, tracking e
gasto Meta, Hub, ficha e dashboard Google. Build produtivo passou;24 testes do
publicador locais e24 na VPS passaram. Revisão independente do produto encerrou
sem P1/P2; hashes revisados preservados. O delta do publicador foi conferido:
constantes/base/manifesto, lista de testes e marcadores do bundle, sem novo algoritmo.

Após ativar,1.778 fontes e seis HTTP/hashes foram conferidos, incluindo assets
anteriores e escritório. Cinco serviços ativos, runtime/units/drop-ins preservados.
Sessão autenticada carregou o relatório Google da Dinamac, gasto real, contatos e
uma ficha existente; alternou para Meta com mesmo mês. Sem usar controles
comerciais, Carregar dados do Meta ou reenvio. Captura produtiva privada fora do
repositório: diretório de visualizações de28/10, arquivo
`rastreamento-relatorios-google-producao.png`.

Celular390/320px foi verificado em fixture antes da publicação; celular físico e
aceite humano não foram conferidos. A leitura herda os limites10000 métricas/200
atributos e fallback BRL do endpoint `get-campaigns` anterior. A publicação não
certifica completude/moeda para contas que atinjam essas condições. Campanhas sem
associação exata de UTM permanecem sem custo individual, como descrito acima.
