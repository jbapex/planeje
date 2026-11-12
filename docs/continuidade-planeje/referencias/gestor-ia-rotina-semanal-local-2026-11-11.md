# Gestor IA — Rotina semanal

Estado: implementado e verificado localmente em 12/11/2026. Não publicado nem homologado por Josias.

Este é o registro da etapa local. A publicação posterior, às 00h43 de 12/11, está documentada na [referência de produção](gestor-ia-rotina-semanal-producao-2026-11-12.md); aceite humano permanece pendente.

## Pedido e contrato

Uma entrada por cliente no Gestor IA abre a planilha semanal existente, com campanha, conjunto, gasto e indicadores. A semana continua de segunda a domingo; escolher uma data abre a semana correspondente. O usuário confirmou: “Ver agendamentos” acompanha os leads cuja primeira entrada ocorreu na semana selecionada e que depois agendaram, mesmo para uma data posterior.

Reusar `traffic_weekly_reviews`, `traffic_routine_client_history`, o editor/salvamento oficial e suas revisões. Nenhuma segunda planilha, conclusão ou motor de tarefas. A tela simplificada salva rascunhos; análise e conclusão da revisão continuam na rotina completa. Não apagar esses campos ao editar a grade. Sem criação de demanda ao abrir a página.

Clientes respeitam a carteira autorizada. Edição usa `can_edit` da rotina; novos registros seguem responsável/administrador e a RPC existente. Consultar leads exige também Rastreamento e acesso ao cliente. Seleção por IDs exatos de conta/campanha/conjunto, primeira origem preservada, deduplicação por contato e paginação completa. Nomes soltos não comprovam atribuição. Falha de consulta não vira zero.

Catálogo e gasto no Gestor usam apenas leituras salvas da Meta, sem coleta automática. Gasto só é aplicado sob ação do usuário e com período completo, moeda BRL e dados de conjuntos completos. Valores manuais preenchidos são preservados pelo fluxo existente.

## Escopo técnico e aceitação

- Nova rota/menu `/gestor-ia/rotina`, entrada compacta por cliente, busca e semana.
- Reuso do editor e da grade; seleção de linhas e painel de leads/agendamentos com ficha existente, sem perder a planilha.
- Acesso de administrador, colaborador responsável, leitura e negação; troca de cliente/semana sem resposta atrasada ou perda silenciosa de rascunho.
- MCP descobre a nova página e consulta os mesmos registros pelas ferramentas de rotina já existentes. Preenchimento automático diário/IA e escrita pelo MCP ficam para uma etapa posterior.
- Testes de período/coorte, IDs, deduplicação, permissões, paginação, fonte salva e preservação do salvamento antigo; conferir prévia isolada no navegador e build temporário.

Nenhuma migração prevista. Publicação exige autorização específica desta entrega, após validação local.

## Fontes consultadas

`TrafficWeeklyRoutine.jsx`, `TrafficCampaignMetrics.jsx`, helpers da planilha, RPCs e migrations já existentes, ficha e helpers do Mini CRM/Rastreamento, fontes salvas do Gestor e catálogo MCP. Context7 confirmou paginação inclusiva/ordenação/AbortSignal; a versão instalada do SDK permanece preservada. Changelog oficial do Supabase consultado, sem atualização de dependências nesta tarefa.

## Verificação

- Dez testes novos de modelo/adaptador, incluindo 1.001 contatos sob teto de 211 por página, negação/revogação e falhas de configuração/consulta.
- 56 verificações React da nova rotina: criar somente ao editar, salvar no mesmo ID/revisão, preservar análise e observações, manter rascunho em conflito, navegação entre semanas e resumo atualizado também após edição na rotina original.
- 145 verificações React do Gestor e regressões de grid/catálogo/colunas/gasto/revisões passaram. Fixture PostgreSQL descartável confirmou ACL, conflito, reabertura canônica, histórico, nova conclusão e rollback atômico.
- MCP: tipos e catálogo com 54 abas passaram. Nova aba `paid_traffic/rotina-gestor` e página `/gestor-ia/rotina` consultam as ferramentas já existentes, sem novo mecanismo de escrita.
- Revisão independente privada em `.local/gestor-rotina-20261111/security-review.md`, sem P1/P2 pendentes. Corrigidos homônimos no gasto, preservação de valores manuais, grade mista Meta/Google, revogação do painel e camadas da ficha. Contraprovas de cache foram incorporadas ao teste React.
- Navegador isolado: entrada/grade, seleção de três linhas, oito leads/cinco agendados, ficha real sobre o painel, retorno e importação/substituição explícita de gasto salvo. Larguras efetivas de 433 e 320 CSS px; documento sem rolagem horizontal, grade com rolagem própria.
- `npm run check` final passou com saída 0: contexto, harness, lint, lint tipado, tipos, regras, testes locais e build temporário. O repositório mantém 362 avisos no lint geral e 11 no tipado, sem erros; os três novos componentes/adaptador não têm avisos. Após o acabamento visual da data, `build:check` e 60 testes Node dirigidos passaram novamente. Não foram alterados ZIPs, `dist` operacional, runtime ou configurações produtivas.

## Limites desta etapa

Consulta por vínculo exato de IDs Meta. Linhas Google/outra plataforma e nomes manuais seguem editáveis, com atribuição não comprovada indicada no painel. Não há leitura automática de mensagens, preenchimento por IA ou escrita MCP. A grade não conclui a tarefa oficial; a rotina completa continua disponível para análise/conclusão.

Os números da grade são manuais; abrir o painel não os substitui pelos resultados rastreados. Agendamento depende de data/status registrado nos campos oficiais do Mini CRM. Nenhum dado de produção, coleta Meta, envio, migração ou publicação executado nesta entrega.

A prévia permaneceu aberta em `/gestor-ia/rotina`. Entrada, planilha e painel móvel possuem screenshots sintéticas; os caminhos e hashes finais constam na [evidência local](../evidencias/releases/gestor-rotina-local-2026-11-12.json). Conferência de colaborador responsável e somente leitura também feita no navegador. A última alteração após a revisão foi somente o espaçamento do ícone no filtro de data, confirmado no DOM e no build.
