# Gestor IA / Neuro — preenchimento MCP e validação humana

Estado: em implementação na branch `feat/gestor-ia`, com base em `main` e no snapshot verificado da release `gestor-rotina-20261112-01`. Nenhuma promoção autorizada nesta rodada. Preview local obrigatório antes da decisão de Josias.

## Contrato e desenho

Manter `traffic_weekly_reviews` e `TrafficWeeklyReviewEditor`; preservar `/paid-traffic/rotina`. Acrescentar origem/estado e histórico, sem uma nova planilha ou motor de tarefas. IA sempre grava rascunho; somente equipe humana autenticada conclui/valida pelo fluxo oficial. Semana validada bloqueia escrita IA até reabertura humana.

As cinco ferramentas MCP têm nomes e argumentos definidos por Josias. Usam carteira, módulos e `central_trafego_can_access_client`; somente consultas locais ao banco. Nenhuma chamada Meta/Google ou mudança de campanhas. Serviço MCP escreve por RPC restrita ao serviço com ator aprovado e verificação transacional de versão.

Leads seguem a primeira entrada na semana de Brasília. Agendamento CRM exclui negações. Confirmação explícita de data/hora na conversa é evidência separada com alerta de CRM desatualizado; não altera tags. Telefones aparecem mascarados na lista/resposta MCP; a ficha autorizada carrega o contato ao abrir. Leads sem correspondência Meta aparecem separadamente, sem atribuição por nome.

`ver_mensagens_rastreamento` recebe `chat_jid` e reutiliza o leitor paginado existente de conversas/grupos, com isolamento de cliente.

## Plano de implementação e aceitação

1. Recuperar fontes publicadas para checkout separado, conferir hashes e registrar baseline Git. Preservar os checkouts originais.
2. Acrescentar migration com origem/estado, fronteira humano/IA, histórico e RPCs. Testar ACL, versões, semana validada, reabertura, rollback e legado em PostgreSQL descartável.
3. Registrar/testar as cinco ferramentas MCP e filtro de grupo; nenhuma ferramenta pode concluir a revisão.
4. Compartilhar seleção, máscara e sinais de agendamento entre interface e MCP; testar coorte, negações, confirmação/cancelamento e dados sem vínculo.
5. Acrescentar selo, filtro, sugestão e Validar no editor existente. Conferir fluxo antigo, rascunhos e permissões.
6. Preview isolado em 127.0.0.1, com Impacto Noivas `9196d07f-f0a8-4eb2-9f9a-3dade28d4a69`, semana 2026-11-09 e dados sintéticos. Provar rascunho pelo MCP e validação exclusivamente humana; sem banco produtivo.
7. Revisão diferencial, testes dirigidos/check/build; commit e push da branch. Entregar link, arquivos/migration, resultados e limites, aguardando OK posterior ao preview.

## Decisões técnicas do implementador

Campos propostos: `fill_origin`, `validation_state`, `ai_suggestion`; histórico com `actor_type`. Validação mantém exigências existentes de análise, próxima ação e semana encerrada. O relógio do ensaio ponta a ponta poderá simular a semana encerrada, sem alterar a data produtiva.

A cópia GitHub está em maio; a baseline produtiva traz as dependências posteriores necessárias à rotina. A recuperação será identificada em commit separado. Não trazer ambiente, credenciais, dumps ou dados de clientes da VPS.
