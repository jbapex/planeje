# Rolagem da Automação — 16/10/2026

Josias informou que a nova aba não rolava. A primeira validação conferiu os campos e a geometria, mas não incluiu um gesto de rolagem até o final; esse caso falhou no layout fixo produtivo.

Causa: `.planeje-workspace-main--flush` mantém `overflow:hidden`; o formulário `.mini-rules` tinha `min-height:auto` e transbordava fora da área disponível. Correção somente em `MiniCrmMessageRules.css`: formulário flexível com `min-height:0`, largura limitada, overflow vertical próprio e alinhamento das linhas pelo conteúdo. Navegação permanece visível; rolagem não recria o componente nem descarta rascunhos.

Build completo no Mac, com os mesmos flags produtivos do Atlas. Navegador: gesto de rolagem até o último bloco e volta ao Salvar no computador e tela estreita. Produção autenticada Casa D Noivas: área de 683 px com conteúdo de 1236 px; rolagem alcança 552,78 px (máximo arredondado 553), último bloco termina em 791,66 px no viewport de 841 px. Screenshot do final registrado.

Publicado às 12h57, `index.e2684428.js` / `index.78ec83aa.css`, anteriores `c682c5dd`/`cd788441` conservados. Uma alteração de CSS sobre a candidata exata de produção. Nenhuma migração, restart, regra, canal, contato ou mensagem alterados. Atlas/escritório preservados. Candidata base atual `/root/planeje-releases/mini-crm-automation-scroll-20261016-01/candidate`.

Na reabertura da produção foi observada a regra da Casa D Noivas já ligada, com canal Larissa e palavras configuradas. O agente não acionou Ativar/Salvar na produção e conservou essa configuração. O registro anterior de regras desligadas corresponde ao momento da publicação inicial. Primeira mensagem real e aceite do usuário continuam sem confirmação pelo agente.

[Release](../evidencias/releases/mini-crm-automacao-scroll-2026-10-16.json) · [Tela](../evidencias/mini-crm-automacao-scroll-producao-2026-10-16.png).
