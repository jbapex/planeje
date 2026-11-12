# Atlas: área completa, ampliação e cabeçalho compacto — 15/10/2026

## Pedido e entrega

Josias mostrou a faixa vazia inferior, o escritório estreito e o cabeçalho grande. Acrescentou uma captura do cartão “Sua agência, num só lugar”, que cobria o mapa. Publicado às 12h53, São Paulo.

- Escritório preenche a largura e a altura disponíveis no contêiner do Planeje. Sai a altura fixa `100dvh - 118px` com mínimo de 650 px, que deixava espaço inferior e causava excesso de altura no celular.
- Um cabeçalho reúne marca, navegação, horário, Atualizar, Conversa e **Ampliar**. A faixa externa duplicada só aparece durante carregamento/erro inicial.
- **Ampliar** ocupa o viewport do navegador, cobrindo temporariamente o menu externo. **Reduzir** ou **Esc** retorna à área normal. Não abre outra página, não exige API de fullscreen do navegador e conserva o mesmo iframe e seus rascunhos.
- Cartão persistente “VISÃO DA AGÊNCIA / Sua agência, num só lugar” retirado do mapa, inclusive suas variantes por sala/pessoa/cliente. Seleções e contexto continuam no menu, nos contadores e no painel lateral.
- Posicionamento/câmera ajustados à faixa superior real e às larguras dos painéis; cabeçalho de 60 px no computador e 56 px no celular. Atualizar permanece disponível no celular, na faixa de consulta. Rolagem interna das listas e respostas preservada.

## Arquivos

`src/components/atlas/AtlasOffice.jsx/.css`: preenchimento flex, modo ampliado, Esc, bridge de apresentação e carregamento. `scripts/atlas-office-live/main.ts/office.css`: cabeçalho, controles, câmera e retirada do cartão. Prévia fictícia ajustada em `scripts/atlas-office-live/preview/index.html` para reproduzir a altura disponível. Assets estáticos recompilados.

Sem alteração de autenticação, banco, funções, modelos, limites de IA, regras de tarefas, áudios ou serviços. A expansão é local ao navegador e não muda preferências no banco. Segue a confirmação humana para guardar respostas/criar tarefas. Não foram feitos envios nem escritas operacionais como teste.

## Validação

Build completo da fonte vigente de produção e build do escritório passaram. Conferência no navegador com dados fictícios em 1280×720, 390×844 e 360×740: cabeçalho sem transbordamento, uso da altura, ampliação ao viewport, redução/Esc, preservação de rascunho, Atualizar móvel, acesso à conversa e ditado ainda visível. Após a retirada do cartão: zero elementos `.map-label` na tela. São verificações visuais e de geometria; não foram criados testes que apenas reproduzem CSS.

Produção conferida autenticada e por HTTP; altura normal igual ao contêiner e ampliação igual ao viewport, zero cartões `.map-label`. A conferência detectou iframe antigo no cache após a primeira promoção; a fonte passou a abrir `/atlas-office/index.html?v=layout-20261015-01`, e o carregamento do bundle novo foi confirmado. Futuras atualizações do escritório precisam versionar esta URL junto dos assets. A apresentação intermediária `f2662e09` também foi conservada. Antes, no navegador conferido, a área tinha cerca de 93 px de altura disponível sem uso por causa do desconto fixo. O novo preenchimento usa o contêiner existente, respeitando banners e navegação móvel. Capturas de produção somente em `.local/atlas-layout`, sem dados reais versionados. Aceite de uso de Josias pendente.

## Publicação e recuperação

Release `/root/planeje-releases/atlas-layout-20261015-01`, candidato completo separado da fonte operacional, com guardas de hash e conferência das demais fontes. Somente os arquivos desta entrega promovidos. Não incorpora Assessoria local não publicada.

Assets `index.03465f2e.js` / `index.841037d3.css`, escritório `index-0b828dc0.js` / `index-5acebe14.css`. Conservados assets anteriores `7e61c47a` / `d0485537` e backup do diretório do escritório em `before/served-atlas-office`. Sem SQL, reinício ou alteração de configuração do Atlas.

URL: `https://planeje.jbapex.com.br/?v=03465f2e#/assistant/atlas`.

Para recuperação, restaurar a apresentação usando `before/index.html`, `before/served-atlas-office` e fontes de `before` desta release, preservando dados. Não reaplicar migrações anteriores. Prévia temporária encerrada após a conferência. Validação técnica e publicação não equivalem a aceite de Josias.

## Retorno de Josias em 15/10

Após a publicação, Josias afirmou “Show, está legal” e passou a discutir a operação. Registra-se aceite visual desta revisão; isso não representa aceite do acompanhamento operacional nem das novas regras de delegação.
