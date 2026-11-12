# Atlas: revisão de repasse compacta — teste privado, 15/10/2026

Josias rejeitou com sarcasmo o formulário excessivamente grande e o bloco de explicações permanente: “nada discreto né? kkk”. Correção de apresentação aplicada somente ao piloto persistente em `http://127.0.0.1:4320/#/caixa`, na VPS 103. Produção não publicada.

A revisão tem largura máxima de 1000 px, ação/projeto/tipo na mesma linha no computador, orientação em três linhas redimensionáveis e aprovação ao lado da confirmação. O título já contém `[Nome do cliente]`, sem repetir todo o conteúdo em uma legenda. Responsável e prazo permanecem visíveis e editáveis conforme as regras existentes.

O painel roxo permanente foi substituído por **Cálculo e regras**, recolhido por padrão, e **Recalcular** em controle discreto. Dentro dos detalhes permanecem os motivos da escolha, a fila da pessoa e os limites do calendário. **Editar regras de prazo** abre o editor existente de apuração/produção. Abrir ou fechar não salva, não recalcula e não perde o rascunho. Alertas acionáveis, erros e responsáveis obrigatórios do fluxo continuam fora da área recolhida.

## Verificação e alcance

Build completo do candidato passou. Navegador autenticado conferiu:

- Revisão anterior recolhida: 1391,6 × 936,5 px; revisão nova: 1000 × 551 px, no mesmo viewport de computador.
- Cálculo e editor fechados inicialmente; abertura mostrou responsável da carteira, fila e regras 1/3.
- Valor temporário 2 no editor persistiu ao fechar/abrir; restaurado a 1 sem clicar em salvar. Política persistida não alterada.
- Botão de aprovação desabilitado sem confirmação, habilitado ao marcar e novamente desabilitado ao desmarcar; nenhuma submissão.
- Recálculo disponível, responsável Tráfego de teste e prazo 16/10 preservados.
- Celular 390 × 844: página de 390 px, revisão de 332 px sem excesso horizontal, detalhes com 298 px de largura/rolagem; ação/projeto/tipo em sequência e confirmação/botão empilhados. Viewport restaurado.

Somente `AtlasDemandCentral.jsx`, `AtlasDemandCentral.css` e `AtlasDemandScheduleControls.jsx` foram promovidos ao teste. Cálculo, callbacks de salvamento/aprovação, SQL, IA, chave, serviços e tarefas não foram alterados. Não houve chamada ao modelo ou envio externo. Não foram repetidos testes de API que escrevem fixtures: a alteração é de apresentação. Aceite de uso pendente.

Release remota `/opt/planeje-cs-integration/releases/atlas-repasse-compacto-20261015-01`, com hashes de base, código/index anteriores e build preservados. Assets `index-8a3c4569.js` / `index-a889bd51.css`; anteriores conservados, socket privado preservado, sem reiniciar serviços. Reversão visual restaura o index em `before/index.html` sem apagar dados.

[Captura do computador](../evidencias/atlas-repasse-compacto-2026-10-15.jpg) · [Captura do celular](../evidencias/atlas-repasse-compacto-celular-2026-10-15.jpg) · [Release](../evidencias/releases/atlas-repasse-compacto-2026-10-15.json).
