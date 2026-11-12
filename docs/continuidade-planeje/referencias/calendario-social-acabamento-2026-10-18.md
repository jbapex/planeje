# Correção visual do calendário — 18/10/2026

Josias rejeitou o resultado publicado às 13h34: cartões estreitos, blocos grandes sem miniatura, excesso de cabeçalhos e painel vazio. A integração ao sistema não corrigiu esses problemas. O aceite visual anterior **não foi dado**. Esta correção pertence à mesma entrega do calendário, cuja publicação havia sido autorizada por “vamos publicar então”.

## Correção

O calendário usa toda a largura disponível. Os detalhes aparecem somente ao selecionar conteúdo, em um diálogo lateral acessível. Cabeçalho genérico e slogan foram removidos; período, criação e filtros ocupam duas faixas compactas. Divisórias dos dias foram recuperadas e hoje é destacado no número.

Cartões sem mídia não reservam uma falsa miniatura. Cliente, título, horário, formato, redes e situação permanecem disponíveis; o prefixo exato do cliente é retirado apenas da apresentação resumida, preservando o título original no detalhe. O título é limitado visualmente a duas linhas. Publicação informada continua distinta da publicação confirmada pela integração. Nenhuma regra de estado, agendamento ou gravação mudou.

Abaixo de 960px de largura útil, a agenda organiza os dias verticalmente, com cartões em colunas conforme o espaço. Sábado, domingo e dias adjacentes continuam disponíveis. O painel abre no início do conteúdo e devolve foco ao cartão ou ao botão “+ mais”; abrir a tarefa encerra o painel sem roubar o foco da tarefa. A personalização opcional do fundo do Dialog preserva os demais consumidores.

## Verificação local

- Fixture ampliada com 22 conteúdos fictícios, títulos longos e maioria sem mídia; moldura com sidebar, cabeçalho e abas do produto. Nenhum dado de cliente foi copiado para a fixture.
- `verify-density.cjs`: 1440/1024/390 px, largura integral, cartão sem mídia até175px, ausência de bloco vazio grande, posição lateral do painel, abertura no topo, Escape/foco, temas e ausência de overflow horizontal. Antes da correção, falhou pela largura reservada ao painel vazio.
- `verify.cjs`: semana/mês, filtros/estados mistos, pesquisa/vazio, diálogo “+ mais” para detalhe, tarefa existente, scroll real até o fim e de volta ao topo, teclado e temas. Nenhuma rede externa ou erro JavaScript na prévia.
- Os testes aguardam o término da montagem/desmontagem do Radix antes de exigir foco ou Escape. Uma medição adicional identificou utilitários do Dialog sobrescrevendo a posição lateral; o seletor específico e a remoção da animação central resolveram a causa, com asserção de geometria.
- 16 testes sociais dirigidos, `npm run check`, lint final e build temporário final passaram. Um aviso preexistente de tamanho do SocialPlanner permanece; regras não foram reduzidas.
- Revisão independente somente leitura, incluindo capturas clara/escura/celular e ajustes de foco, não encontrou bloqueadores. Nove fixtures de recuperação do publicador passaram localmente e na VPS.

Context7 consultou o código/documentação oficial do Radix para diálogo controlado e onCloseAutoFocus; pacote instalado1.1.15. O retorno consultado é do ramo principal e foi confrontado com o código local da versão instalada.

## Publicação

Publicado e conferido às **14h05 de São Paulo**. [Abrir calendário corrigido](https://planeje.jbapex.com.br/?v=f9d86e8c#/social-media?tab=calendar). [Evidência](../evidencias/releases/calendario-social-acabamento-2026-10-18.json).

A primeira correção (`social-calendar-polish-20261018-01`, 14h03) herdou `social-calendar-20261018-01/candidate`, 1.722 fontes sem divergência, e sobrepôs cinco fontes de apresentação. A conferência real revelou o robô Atlas cobrindo parte do botão Novo conteúdo: o complemento `social-calendar-polish-20261018-02` sobrepôs somente uma declaração CSS para colocar a ação junto do período. O robô e suas preferências não foram alterados; cada publicador rodou uma única vez com sua própria guarda.

**Base/perfil frontend atual:** `/root/planeje-releases/social-calendar-polish-20261018-02/candidate`, guarda de 1.722 fontes. Main `/assets/index.f9d86e8c.js` e `/assets/index.ba95b7b8.css`. Perfil produtivo herdado dentro da VPS, sem exposição ou cópia local. Assets das releases anteriores preservados. Build/testes da candidata, guardas, quatro HTTP/hashes e quatro serviços ativos conferidos. Nenhuma migração, alteração de Edge/cron, unidade ou restart.

Navegador autenticado exibiu 16 conteúdos do período, calendário largo e cartões compactos, sem painel vazio. Selecionar conteúdo abriu o painel à direita, focado no início; Abrir tarefa e publicações abriu a tarefa real, fechada em Cancelar sem edição ou envio. Captura final confirmou Novo conteúdo livre do robô. Prova visual privada: `.local/social-calendar-polish-20261018-final/calendario-corrigido.png`.

## Limites

Aprovação com agendamento automático, edição inline por rede, conectores TikTok/YouTube e certificação de envio continuam pendentes. Correção visual e verificações técnicas não substituem o aceite de uso de Josias. Nenhum post ou agendamento de cliente é enviado na conferência.
