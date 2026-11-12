# Aviso de espera sem interromper a tarefa — 13/10/2026

Publicado na produção `72.60.14.109` às **09:52 de São Paulo**, a pedido de Josias. Ele relatou que o balão de grupo sem resposta atrapalhava a edição e que seu X fechava a tarefa aberta.

## Causa e correção

`AtendimentoEsperaPopup` tinha camada 70, acima do drawer/modal da tarefa (50). Seu X era uma interação fora do formulário; o drawer interpretava esse clique como pedido de fechamento. O comportamento foi reproduzido com os componentes reais: aviso visível durante a edição, tarefa fechada após clicar no X do aviso.

O popup agora tem camada 40 e estilo próprio que o oculta enquanto um drawer, dialog, alertdialog ou formulário com `aria-modal=true` está aberto. Quando o formulário fecha, o aviso volta se ainda houver cobrança pendente. O X continua adiando somente o aviso pelo intervalo configurado. A camada inferior também protege o formulário quando o navegador não suporta `:has`.

Arquivos alterados:

- `src/components/atendimento/AtendimentoEsperaPopup.jsx`: importação do estilo, classe própria e camada inferior.
- `src/components/atendimento/AtendimentoEsperaPopup.css`: ocultação durante formulários abertos.

Nenhuma regra de espera, configuração de minutos, fila da Minha caixa, tarefa ou dado de cliente foi alterado. Sem SQL, restart de backend, WhatsApp ou CAPI. O acompanhamento automático do Atlas permanece pausado.

## Validação e publicação

- Fonte produtiva corrente copiada para candidato isolado, incluindo alterações não commitadas. Aplicação `src`, pacote e configuração Vite conferidos contra o último candidato publicado.
- Baseline do candidato reproduziu **byte a byte** `index.66ba606f.js` e `index.e981fa67.css`, antes da correção. O `.env.production` legado foi preservado na fonte e arquivado privadamente no `before`; o candidato usou a configuração do build vigente. Não imprimir valores desse arquivo.
- `node scripts/atendimentoAvisoEspera.test.mjs`: passou localmente e no candidato.
- Fixture local com popup, drawer e dialog reais e grupos fictícios: passou em 1280×800 e 390×844. Verificou digitação sem interrupção, texto preservado, ocultação nos formulários, retorno ao fechar, X sem navegação e repetição configurada. Zero erros de navegador.
- Build produtivo passou. Publicação protegeu o index e a fonte contra alterações concorrentes, conservou os assets antigos e trocou o index atomicamente.
- HTTP público: index novo, JS/CSS novos e assets anteriores responderam 200. Estilo efetivamente servido conferido no navegador: visível normalmente, oculto com dialog, visível após fechar. Zero erros de navegador.

Bundle: `index.44e11d16.js` / `index.cb906053.css`. [Abrir Tarefas com a versão atual](https://planeje.jbapex.com.br/?v=44e11d16#/tasks).

Candidato e backup: `/root/planeje-releases/aviso-tarefa-20261013-01/{candidate,before}`. Index anterior: `/var/www/planeje/index.html.bak-aviso-tarefa-20261013-01`. O working tree e os arquivos não rastreados foram preservados. A conexão SSH funcionou com a chave Planeje e `UseKeychain=yes`.

[Release](../evidencias/releases/conversas-aviso-tarefa-2026-10-13.json) · [Testes de navegador](../evidencias/conversas-aviso-tarefa-testes-2026-10-13.json) · [Prévia com dados fictícios](../evidencias/conversas-aviso-tarefa-previa-2026-10-13.png).

**Aceite de Josias pendente.** O teste de edição usou fixture; a conferência pública não abriu nem gravou uma tarefa autenticada real.
