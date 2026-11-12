# Campo de observação visível e histórico no ícone

Publicado em 16/10/2026 às 21h04 (São Paulo), após Josias pedir que o campo também aparecesse na ficha. Substitui a apresentação exclusivamente por ícone da release anterior.

Ficha do lead e painéis de formulário (Kanban e Follow-up) mostram o campo com a última nota salva, **Nova** e **Salvar observação**. O ícone ao lado abre um popup somente com o histórico, data e autor disponíveis. O histórico permanece recolhido ao usar o campo. Na Grade, o ícone compacto e o popup com editor/histórico são preservados.

Os dois modos usam o mesmo editor e o mesmo salvamento já instalado. Digitar permanece como rascunho até salvar. Abrir/fechar o histórico conserva o texto; Cancelar restaura a última nota salva. Escape fecha o histórico e mantém a ficha. A busca de histórico só ocorre ao abrir o popup ou quando ele está visível. Nenhuma mudança de tabela, RLS, RPC, fila ou atribuição. Última nota continua em `mini_crm.observacao`; anteriores conservadas no histórico.

## Validação e release

Onze verificações de navegador com candidata exata e dados fictícios passaram: campo visível; histórico recolhido; última após salvar; histórico com nota nova/legada; popup só com histórico; Escape mantendo ficha; rascunho preservado; Cancelar restaura última; campo e popup em CSS 390×844 sem transbordar; Grade continua compacta. Viewport restaurado. Cinco scripts de regressão e build Vite no Mac passaram. HTTP/bytes novos/anteriores e serviços ativos conferidos. Sem navegador produtivo autenticado ou alteração de lead real pelo agente; uso/aceite final pendentes.

Uma fonte própria (MiniCrmObservation.jsx), guarda dos 1.643 caminhos anteriores. Assets `index.8d239b4a.js` / `index.5b3645bc.css`, conserva `index.d5cf727f.js` / `index.11912e85.css`. Nova base `/root/planeje-releases/mini-crm-notes-field-20261016-01/candidate`, webroot `/var/www/planeje`; backend Atlas preservado. Fonte CS sincronizada com guarda de hash, sem rebuild/publicação. Sem SQL/restart/ambiente/IA/envio. A migração `20261016231229` já está instalada; não reaplicar.

![Campo na ficha, dados fictícios](../evidencias/mini-crm-observacoes-campo-2026-10-16.png)

![Campo no celular, dados fictícios](../evidencias/mini-crm-observacoes-campo-celular-2026-10-16.png)
