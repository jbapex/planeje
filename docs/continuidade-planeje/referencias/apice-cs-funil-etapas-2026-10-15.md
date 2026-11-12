# Topo, Meio e Fundo nos blocos do funil — 15/10/2026

**Disponível apenas no TESTE integrado 4320; NÃO publicado em produção.**

## Pedido e comportamento

Josias perguntou onde entram Topo e Fundo no novo fluxo e confirmou “isso” para a proposta de classificação explícita em conjuntos/anúncios. Esta confirmação aprova implementar o ajuste, não o aceite visual final nem publicação.

- No painel lateral de Conjunto ou Anúncio, campo opcional **Etapa do funil**: Sem etapa definida, Topo (Atrair), Meio (Despertar interesse), Fundo (Gerar agendamento).
- Etiqueta textual com ponto na paleta roxo/rosa/laranja no próprio bloco e legenda acima do desenho. A legenda orienta selecionar conjunto/anúncio para classificar. Outros tipos de bloco não mostram esse seletor; uma campanha pode reunir etapas diferentes.
- Classificação informada pela pessoa, sem inferir pelo objetivo da Meta, posição no canvas ou conexão. Cada conjunto/anúncio mantém sua escolha; mudar o conjunto não reclassifica seus anúncios. Limpar deixa sem definição. Não reordena blocos nem impõe sequência Topo → Meio → Fundo.
- Persistência em `node.data.funnel_stage` do mesmo `sales_funnel.visual_flow`, com o salvamento, rascunho, revisão e versões existentes. Histórico mostra a etiqueta e leitor da IA recebe `funnel_stage` por bloco; registros anteriores ficam `null` nessa leitura. Nenhum worker/modelo ativado.
- Posições, caminhos, vínculos Meta, trabalhos e tarefas preservados. Não houve atualização automática do exemplo Aurora nem dos rascunhos que Josias está editando. A captura recebida mostrava alterações ainda por salvar; orientar salvar antes de recarregar.

## Banco isolado e validação

Nova migração `20261015044248_consulting_visual_flow_stages.sql` aplicada SOMENTE em `cs_integration` na VPS 103. Guard privado SECURITY INVOKER, `search_path` vazio e EXECUTE revogado de PUBLIC/anon/authenticated. Valida apenas classificações presentes no grafo de Assessoria: string vazia ou top/middle/bottom; escolha preenchida somente em conjunto/anúncio. Campo ausente continua aceito. Não muda RLS, grants de tabelas, RPCs ou status operacional. Não reaplicar a migração no teste; produção ainda não recebeu esta nem as migrações CS anteriores.

- **49 testes Node**: classificação independente, limpeza sem herança automática, compatibilidade e leitor da IA, mais regressões de execução/operação/quadro/Atlas.
- **37 verificações SSR**: legenda, seletor/opções, seleção atual, modo desabilitado, etiqueta, histórico e componentes anteriores.
- **22 verificações API isolada**: plano sem classificação, colaborador salva Topo/Meio/Fundo e releitura, IA/histórico, valores inválidos recusados, rejeição em campanha, limpar somente uma etapa, posições/conexões preservadas, nenhuma tarefa criada, revisão antiga recusada e Aurora comparado sem alterações. Projetos temporários removidos no finally, inclusive no ensaio que encontrou somente diferença de ordem de chaves JSON no teste; comparação corrigida para equivalência estrutural.
- **Cinco verificações** de privilégios e gatilho do guard privado. Como registrado anteriormente, advisors cloud não se aplica a este banco isolado self-hosted; estas conferências não substituem auditoria geral.
- Build completo e bytes de índice/JS/CSS conferidos por HTTP. Integrações externas continuam bloqueadas (403); dados reais e produção intocados. Sem restart de serviço.

**Conferência visual interativa e aceite desta revisão pendentes.** Captura de Josias analisada; o bloqueio anterior do controle do navegador por política de URL não foi contornado. SSR/build/API não validam aparência e interação no navegador. Próximo passo é conferir seleção da etapa, etiqueta, salvar/reabrir e modo ampliado no computador/celular, preservando o rascunho existente.

## Endereço e retomada

`http://127.0.0.1:4320/?v=c533f33b#/projects/11111111-1111-4111-8111-111111110201/planner?plan=funnel`

Assets `index-c533f33b.js` / `index-741f9158.css`. Nove arquivos seletivos reconciliados na candidata; hashes na release. Backup do índice/fonte em `/opt/planeje-cs-integration/releases/funil-etapas-20261015-01`; assets anteriores conservados. Demais frentes de documentação (Atlas escritório/pesquisa) preservadas. Produção 109 permanece no último estado documentado `47519cec`/`2731d631`; Atlas pausado. Publicação futura exige candidato reconciliado e autorização própria.
