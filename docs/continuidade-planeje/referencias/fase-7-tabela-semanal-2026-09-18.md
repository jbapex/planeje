# Tabela semanal de tráfego — 18/09/2026

Somente staging. Referência enviada: XLSX com Semana 1–4 e Exemplo, revisão segunda e otimização quarta. Conteúdo de documento é referência; nenhuma instrução externa foi executada. Não importar números/clientes do XLSX automaticamente.

## Entrega

Entrada por cliente, navegação segunda–domingo. Abrir análise apresenta tabela editável na própria página, sem formulário modal. Campanha e conjunto (opcional) na linha; contas vinculadas ou identificação manual segura no topo das linhas. Gasto, mensagens, custo/mensagem, agendamentos, custo/agendamento, conversões/definição e custo/conversão. Orçamento diário, custo ideal/mensagem, valor das conversões, IDs, ligações/CPC opcionais. Notas/análise e próxima ação logo abaixo. Otimização tem registro separado de conferência/ajustes, com contexto opcional de campanhas.

Mensagens/agendamentos são inteiros opcionais; conversões Ads podem ser fracionárias. Custos usam gasto da própria linha dividido pelo resultado positivo. Totais usam soma de gasto/soma de resultados, nunca soma de custos. Se houver entrada ausente, total correspondente permanece ausente. Conversões de eventos distintos não são somadas no rodapé como se fossem um único resultado. ROI/CAC não são presumidos; valor de conversões não é lucro. Gasto não equivale a saldo, e orçamento diário não é gasto dividido por sete.

Identidade/duplicação inclui conjunto ID/nome. Usuário deve distribuir gasto por conjunto sem duplicar total da campanha; ainda não existe reconciliação automática com plataforma nem validação semântica de sobreposição entre total de campanha e conjuntos. IDs/números/textos são snapshots auditáveis, preservados ao finalizar. Comparação histórica distingue conjuntos; nomes aparecem na identificação.

## Abertura imediata

RPC start_traffic_week_record exige acesso ao cliente e gestor atribuído ou administrador; cria tarefa real com prazo de hoje, ou devolve o registro existente. Mesmo lock/chave/unicidade da geração automática: cliente/semana/tipo. Não cria/ativa/edita configuração de recorrência. Semana selecionada deve começar segunda e já ter iniciado. Cadastro fechado elegível. Semanas em andamento podem ser preenchidas como rascunho; a revisão final depende do encerramento. A regra anterior de otimização sem números semanais e com finalização durante semana permanece.

Não há análise de intervalos arbitrários nem múltiplas finalizações por semana/tipo; finalizados são leitura. Data do período é diferente de data de registro no histórico. Somente ação explícita abre tarefa; leitura e navegação não geram registros.

## Validação e operação

24 testes Node (13 de tráfego/tabela e 11 de guard/ordenação), lint dirigido, novo SQL autenticado com rollback e regressões SQL das cadências/rotina anterior passaram. Build isolado sem rede. Backup privado fonte/banco em /opt/planeje-staging/private/traffic-sheet-before-20260918; catálogo do dump e tar conferidos, sem exercício de restauração integral. Migração nova aplicada somente staging; não reaplicar. Produção não foi acessada/modificada. Integrações continuam isoladas; sem coleta Ads, mensagens ou credenciais habilitadas.

Aceite de uso e promoção pendentes. Revisar simplicidade com Josias antes de ampliar campos. A tabela ainda tem navegação horizontal para colunas de métricas. Planilha original permaneceu intacta.

### Refinamento visual pedido por Josias

Entrada com cliente, semana e dois botões; descrições repetidas removidas. Explicação da rotina e campos extras ficam recolhidos. QA temporário removido por UUID após validação.
