# Observações recolhidas em um ícone

Publicado em 16/10/2026 às 20h46 (São Paulo), a pedido de Josias: esconder as observações em um ícone e abrir o histórico em popup.

O campo exibe somente o ícone de histórico; ficha e painéis mantêm o rótulo Observação. Nenhum texto da nota ou editor aparece fora do popup. Ao clicar, a janela **Observações do lead** já mostra o histórico e a última nota no campo. **Nova → escrever → Salvar observação** registra outra nota. Todas as entradas (Ficha, Grade, Kanban e Follow-up) usam o mesmo componente.

O popup usa Dialog/Radix e devolve o foco ao ícone; Enter abre e Escape fecha somente a janela de observações, mantendo a ficha. Rascunhos continuam na memória da página ao fechar/reabrir. Cancelar restaura a última nota salva. Histórico, autor, data, paginação, fila e UUID de repetição continuam como na [entrega anterior](mini-crm-observacoes-historico-2026-10-16.md). Última nota permanece em `mini_crm.observacao` para busca e leitores existentes, embora o texto esteja recolhido na interface.

## Validação e publicação

Dez verificações no navegador com candidata exata e dados fictícios passaram: ícone sem editor na ficha; histórico imediato; salvar atualiza a lista; Escape mantém ficha; rascunho ao reabrir; ícone sem texto na Grade; notas após recarregar; popup sem transbordar em CSS 390×844; foco volta ao ícone; Enter abre. Viewport restaurado. Duas notas fictícias e observação legada conferidas. Cinco scripts de regressão e build Vite completo no Mac passaram. HTTP/bytes do índice e assets novos/anteriores conferidos; Nginx, Atlas escritório e equipe ativos. Sem teste de navegador autenticado produtivo ou gravação em lead real.

Duas fontes próprias (componente e CSS), guarda dos 1.643 caminhos da base anterior. Assets `index.d5cf727f.js` / `index.11912e85.css`, conserva `index.3d7f4fb2.js` / `index.4f764e24.css` e demais assets. Nova base frontend `/root/planeje-releases/mini-crm-notes-popup-20261016-01/candidate`; webroot `/var/www/planeje`. Backend Atlas preservado na candidata anterior. Fonte CS incorporada com comparação de hash, sem rebuild/publicação. Sem SQL, reinício, alteração de ambiente, IA ou envio. A migração `20261016231229` já está instalada; **não reaplicar**. Primeiro uso/aceite pendentes.

![Ícone na ficha, dados fictícios](../evidencias/mini-crm-observacoes-icone-2026-10-16.png)

![Popup, dados fictícios](../evidencias/mini-crm-observacoes-popup-2026-10-16.png)
