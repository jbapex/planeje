# Funil com edição direta — 15/10/2026

**Disponível apenas no teste integrado da porta 4320. NÃO publicado em produção.**

## Pedido e decisão

Josias enviou captura do funil da versão `572c9bbc`: cartões pequenos em área grande, campos de consulta abaixo e edição em outro lugar. Relatou que não conseguia fazer nada e que a tela estava confusa. A revisão substitui a entrada em mapa de consulta por edição direta; não considera a revisão anterior aceita.

## Comportamento entregue

- Aba Funil abre quatro cartões legíveis. Escolher Descoberta, Consideração, Conversão ou Agendamento mostra o formulário daquela etapa na própria tela, sem mudar para o construtor.
- Perguntas diretas: o que faremos, destino da pessoa, material/mensagem e o que acompanhar. Nome personalizado e público são opções recolhidas. Sugestões são placeholders, nunca conteúdo salvo automaticamente.
- “O contato segue para…” permite criar avanço ou retorno, dar uma explicação opcional, editar o texto e remover somente aquele caminho. Texto opcional vazio recebe rótulo descritivo; caminhos repetidos/auto conexão são recusados na interface. Caminhos antigos permanecem intactos até edição explícita.
- “O que precisa ser preparado?” vincula um trabalho que já está no plano ou adiciona outro. Vincular/desvincular altera apenas `funnel_stage` da ação. Preserva id, tarefa, prazo, responsável, situação e demais campos. Abrir tarefa mantém o retorno ao plano; tarefa nova usa o mecanismo existente de criação/vínculo.
- Salvamento continua explícito e versionado pelo mesmo `cs_save_plan`, com rascunho/conflito preservados. Barra “Salvar funil”/“Tudo salvo” na própria área; plano concluído fica em consulta.
- “Ver desenho do funil” é opcional e consulta os mesmos dados, inclusive o rascunho. Nenhuma seta fictícia é adicionada automaticamente; nenhum fluxo/campanha é executado por definir um caminho.
- A vista fica no endereço (`plan=funnel` ou `plan=details`), conservando outros parâmetros. Recarregar o link do funil mantém essa vista. Mudança de vista não salva nem descarta o rascunho.
- Paleta, versões, projetos tradicionais, Rotina e histórico existentes preservados. Interface responsiva em CSS; sem novo backend, esquema ou dependências.

## Validação e limites

- 22 testes Node: sete de edição/caminhos/vínculos do funil e 15 regressões de execução/período/retorno à Assessoria.
- 12 verificações de renderização estática: campos imediatamente editáveis, valores preservados, desenho opcional, acesso aos trabalhos/tarefas, salvar e modo de consulta.
- 24 verificações na API isolada: edição de etapa/caminhos de avanço e retorno, nome/público/materiais preservados, vínculo da ação à etapa, mesma tarefa/status, remoção de caminho e referência sem apagar ação/tarefa, versões e conflito. Projeto/tarefa temporários removidos; plano de Aurora comparado antes/depois sem alteração.
- Build completo passou; avisos de tamanho do bundle/Browserslist já existentes.
- Índice e bytes dos assets conferidos por HTTP no teste isolado.
- A captura enviada foi usada para o diagnóstico. **Conferência visual interativa deste novo candidato e aceite de Josias permanecem pendentes.** O bloqueio anterior do controle do navegador por política de URL não foi contornado. Renderização estática/build/API não equivalem a teste visual.

## Ambiente e retomada

- URL direta: `http://127.0.0.1:4320/?v=2b601486#/projects/11111111-1111-4111-8111-111111110201/planner?plan=funnel`.
- Assets: `index-2b601486.js` / `index-06c66d15.css`.
- Backup seletivo: `/opt/planeje-cs-integration/releases/funil-direto-20261015-01`; assets anteriores conservados. Fonte da candidata comparada com a revisão anterior antes da sobreposição de sete arquivos.
- Nenhuma migração/restart, escrita em dados reais, envio externo, ativação do Atlas ou alteração produtiva.
- Próximo passo: conferência de uso da edição direta; ajustar dificuldades demonstradas. Publicação futura exige candidato reconciliado e autorização própria.
