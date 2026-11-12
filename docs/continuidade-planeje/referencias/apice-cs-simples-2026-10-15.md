# Plano de assessoria simples — 15/10/2026

**Disponível no ambiente integrado de TESTE, porta 4320. NÃO publicado em produção.**

## Intenção confirmada

Josias rejeitou a complexidade do construtor e a duplicação da Rotina semanal. Esclareceu que o plano deve guardar o objetivo e planejamento de cada assessoria, com etapas e progresso de execução, fácil de alimentar e compreensível para IA. Isso mantém a Assessoria; não substitui a Rotina nem transforma o plano em outra análise semanal.

## Mudança entregue

- Entrada padrão em **Plano do cliente**: objetivo, caminho resumido, período do contrato, progresso e etapas ordenadas. Editar objetivo abre duas perguntas: o que queremos alcançar e como chegar lá.
- Uma linha adiciona uma etapa. Detalhes permite alterar nome/orientação, ordem e, quando pertinente, situação/data do material e evidência/conferência de integração. Todos os ajustes do plano usam Salvar plano e as versões existentes; rascunho e conflito de revisão preservados.
- Cada etapa reutiliza a ação já salva e a mesma tarefa (`project_id + plan_material_id`). Responsável, prazo interno e andamento vêm de Tarefas. Atualizar tarefa abre o editor existente, com suas regras de salvamento/publicação/automações. Ao salvar ou fechar uma tarefa aberta pela Assessoria, retorna ao projeto que efetivamente está vinculado à tarefa. Sem caminho externo ou retorno a outro projeto via parâmetro.
- Etapas sem tarefa oferecem Definir responsável e prazo; usa criação/vínculo já existente, incluindo a opção Operação de Tráfego. Não há novo status de execução salvo no plano.
- Progresso calculado das tarefas terminais e dependências: material precisa estar conferido para uso; rastreamento precisa de conferência e evidência. Corrigida a contagem anterior que podia contar integração sem evidência como concluída mesmo que o encerramento no servidor a recusasse.
- Ordem orienta leitura, sem bloquear execução paralela. Estado atual, atraso interno, atraso da entrega do cliente e pendência de conferência são diferenciados. Falha na consulta não vira progresso zero nem ausência presumida de tarefa.
- Funil, detalhes estratégicos, documentos, resultados e versões permanecem disponíveis. A consulta da Rotina fica recolhida. Não exige duplicar a análise da semana.
- 100% das etapas não encerra o contrato nem comprova meta atingida. A situação do acompanhamento é uma opção separada e conserva as regras existentes de aprovação/encerramento.
- Projetos tradicionais preservados. Paleta existente, bordas/sombras e adaptação responsiva utilizadas. Os exemplos de Aurora não foram reescritos para parecer mais completos.

## Leitura para IA

`consultingExecution` é compartilhado pela tela e pelo adaptador de leitura do Atlas. Retorna objetivo, revisão, etapas em ordem, situação derivada, tarefa, responsáveis, prazos, espera pelo cliente, pendências de conferência, progresso e origem. Consulta por cliente mantém RLS/carteira, limites e referência à versão; cobertura parcial não produz percentual definitivo. A leitura geral da carteira exige selecionar o cliente para obter as etapas.

O adaptador foi exercitado com sessão real do teste em modo somente leitura. Aurora retornou duas etapas, uma em andamento e outra aguardando o cliente, revisão 1. **Nenhum agente/modelo/worker foi iniciado; o Atlas produtivo continua pausado.** O código atualizado do adaptador está na candidata para uma futura publicação autorizada.

## Evidência

- 33 testes Node passaram: execução, dependências, sequência, trabalho paralelo, prazos, leitura parcial, retorno seguro à Assessoria, quadro, período, integração e regressões do Atlas.
- Script `consultingPlan.test.mjs` também passou, preservando versões/documentos/coortes e permissões.
- 31 verificações da API isolada: login, plano simples, tarefa única, atualização pela equipe, reordenação persistida, vínculos/funil preservados, conflito de revisão recusado, conclusão de tarefa sem encerrar projeto, histórico e novo login. Projeto/tarefas temporários removidos ao terminar; plano existente de Aurora conferido sem alterações.
- Sete verificações do adaptador da IA contra a API isolada, somente leitura.
- Build completo passou (avisos existentes de tamanho do bundle e Browserslist). Índice e bytes dos assets servidos comparados com a candidata; marcador de ambiente isolado confirmado.
- **Conferência visual/interativa e aceite de uso ainda pendentes.** A recusa anterior de controle do navegador por política de URL não foi contornada. Build/API não equivalem a teste visual.

## Publicação no teste e continuidade

- URL: `http://127.0.0.1:4320/#/projects/11111111-1111-4111-8111-111111110201`.
- Assets: `index-572c9bbc.js` / `index-44375533.css`.
- Backup seletivo de fonte e índice: `/opt/planeje-cs-integration/releases/plano-simples-20261015-02`; assets anteriores conservados. Candidata atualizada seletivamente, sem copiar alterações locais independentes.
- Nenhuma migração, restart ou configuração de serviço. Nenhuma alteração produtiva, escrita nos snapshots reais, envio externo ou reativação do Atlas.
- Próximo passo: Josias conferir clareza e facilidade no teste; ajustar somente o que dificultar uso. Uma publicação futura depende da validação do candidato corrente e autorização específica.

Referências técnicas consultadas: [RPC Supabase](https://supabase.com/docs/reference/javascript/rpc) e changelog oficial. Nenhuma alteração de versão/API ou esquema foi necessária.
