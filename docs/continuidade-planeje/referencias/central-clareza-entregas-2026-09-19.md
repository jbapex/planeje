# Clareza da Central de Tráfego — quatro entregas (19/09/2026)

Estas entregas **não** são as fases 1–7 do programa mestre. São o recorte para a página de tráfego pago ficar simples e o gestor entender o que fazer. Tarefas continua sendo o motor de execução. Sem coleta automática Ads/CRM na rotina.

Autorização: Josias pediu as mudanças por fase, depois da análise das sete abas.

| Entrega | Estado | O que entra |
| --- | --- | --- |
| **A — Fila única** | Publicada 19/09; ajuste no mesmo dia (chip da Meta e teto do mês) | Hoje é a verdade do dia. Alerta duro (pagamento, teto, Meta desligada) não some por outra demanda. Conta sem Meta ligada entra na fila. Teto da ficha (gasto do mês no snapshot, não só o dia) entra. Quadro Aguardando junta espera / revisão 48h / publicação / demais. Chip do Dashboard usa a mesma indisponibilidade da Situação (Vincular a Meta). Rotina vazia não manda ligar a recorrência. |
| **B — Painel abre quem precisa** | Código nesta data; publicação conforme release | Conta desligada no seletor; criar demanda no Painel; card diz se o número é de hoje, 7 dias ou mês; alerta de teto abre o mês; alerta de qualidade abre o recorte do Hoje. Sem puxar gasto automático. |
| **C — Check-up honesto** | Código nesta data; publicação conforme release | “Fora da escala de hoje” quando ninguém está no roster do dia, em vez de “já têm visto”. Situação do colaborador: a pill já aponta ao Painel. |
| **D — Enxugar o topo** | Código nesta data; Dashboard do gestor restaurado no mesmo dia | Gestor no dia a dia: Hoje, Rotina, Dashboard, Situação, Painel. Solicitações/Insights admin-only. Lista de Solicitações deixa de ser a lista Meta. Assistente fala da fila do Hoje. Não fundir `paid_campaigns` com Tarefas nesta leva. |

Decisões desta leva (até Josias mudar):

- Não ligar Rotina em massa. Colunas vazias do quadro só dizem que não há análise/otimização nesta semana. Rotina ligada cuja tarefa ainda não existe aparece só em **Ver próximas**, não na fila do dia.
- Solicitações permanece esteira admin, paralela, até a entrega D.
- Check-up no sábado continua visível; o texto honesto é a entrega C.
- Dashboard da carteira permanece visível ao gestor (pedido de Josias em 19/09). Solicitações/Insights continuam só para admin.
- Última análise da Meta fica salva (10 min ou Atualizar). Trocar de aba não busca de novo. Limite da API conserva o que já estava.
- Aviso da Meta não duplica a demanda: cola no cartão da tarefa. O aviso sozinho continua o lembrete até virar demanda.

Josias validou este recorte em 19/09. Não substitui o aceite geral de uso das fases 6–7.

Não reaplicar SQL. Não importar configuração do staging.
