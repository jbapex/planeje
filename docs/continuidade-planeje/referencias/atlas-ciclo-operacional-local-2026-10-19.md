**Atualização:** este reparo foi [publicado em 19/10, 23h31](atlas-ciclo-operacional-producao-2026-10-19.md). Abaixo permanece a evidência local anterior.

# Atlas: reparar o ciclo operacional — entrega local

Estado em 19/10/2026: **validado localmente, não publicado**. Josias pediu tornar funcional após a auditoria de uso. A autorização desta etapa cobre correções locais. Publicação e migração novas exigem autorização específica; aceite de uso não foi inferido.

## Problema e comportamento corrigido

A auditoria somente leitura encontrou uma resposta humana preservada, mas sem análise aplicada, repetições do mesmo resumo quando a IA reformulava a pergunta, e mudanças de atribuição que voltavam ao dono. O motivo exato da falha histórica não estava persistido; os testes reproduziram duas recusas relevantes, sem afirmar retrospectivamente qual aconteceu.

- Atualização de tarefa existente classificada pela IA como `ready` passa a `progress`; não tenta criar outra tarefa.
- A conta pode identificar uma pessoa ativa de forma afirmativa e inequívoca. O Atlas encaminha a conversa para confirmar o andamento, sem mudar responsável, status ou prazo oficial. Nome incerto pede esclarecimento à conta.
- A autorização de contato vale para o assunto exato e depende de cliente, conta, pessoa, política e atribuições atuais. Alteração dos responsáveis invalida o contato anterior; a conferência retorna à conta durante o expediente. Consultas do dono mantêm suas guardas de origem/sessão.
- A paráfrase de `question` não produz aviso de novo pedido. Assinaturas legadas reconhecem fatos já guardados; mudança real no resumo continua notificada uma vez. Histórico não é apagado.
- Falha fica visível no robô, inclusive após recarregar. “Tentar novamente” usa a mesma mensagem/identificador, sem duplicar o texto humano e sem apagar outro rascunho. Até três tentativas por resposta; permanece o limite existente de vinte tentativas por pessoa/dia. Nenhuma repetição paga automática foi adicionada.
- Consumo acumula tentativas com falha/sucesso. Retomar uma tarefa agendada sem nova IA conserva o consumo anterior. Razão/etapa da falha usa códigos seguros, sem corpo do provedor; metadados de retomada não entram no prompt.
- Consulta e acompanhamento da execução podem coexistir na mesma tarefa. O índice e seus três consumidores mantêm um único acompanhamento de execução; consultas independentes conservam a própria origem e acesso. A versão anterior podia falhar por unicidade quando a tarefa já era acompanhada.

## Arquivos e migração

Runtime: `scripts/atlas-team-pilot/manager.py`, `scripts/atlas-team-pilot/server.py`, `src/components/atlas/AtlasTeamAssistant.jsx`.

Migração nova: `supabase/migrations/20261020012821_atlas_team_operational_repair.sql`. Foi criada às 01h28 UTC de 20/10, ainda 19/10 em São Paulo. **Aplicada apenas em PostgreSQL descartável local.** Contém correções incrementais de funções, projeção da falha e índice; as migrações publicadas de 16/17/18 não foram editadas ou reaplicadas.

O harness agora carrega também `20261016175851_atlas_team_launch_controls.sql`, para representar o índice e a projeção produtivos anteriores. Testes adicionais em `repair-checks.sql`, `test_manager.py` e prévia isolada `scripts/atlas-team-pilot/preview/`; verificador de tela `verify-retry-ui.mjs`.

## Verificações observadas

- 91 verificações SQL/RLS em cluster novo por socket Unix: guarda de sessão/origem, privacidade, retomada/consumo, legado Q1→Q2, contato exato, revogações por cliente/conta/atribuição/pessoa, consulta paralela, execução única, prazo e horário útil.
- 110 testes Python puros: gerente33, horário14, contexto54, contexto do modelo9. Nenhuma suíte remota foi executada por descoberta ampla.
- 56 testes Node dirigidos de gerente/origem/atividade/retorno.
- `npm run check` passou: verificações do toolkit, lint/tipos/regras, testes locais/MCP e build temporário. Avisos preexistentes não foram convertidos em afirmação de lint sem avisos.
- Cinco verificações de navegador com React real e API fictícia, em 1280×900 e390×844: falha persistida, nova falha visível, reload/teclado com identidade preservada, rascunho mantido, limite claro e tamanho da caixa. Zero tráfego externo/erro de navegador. Capturas inspecionadas.
- Revisão independente sensível: achados corrigidos e regressões dirigidas; disposição final registrada na evidência. Sem upload de código/dados para serviços de revisão.

Evidências de execução, baselines exatas, manifestos e capturas em `.local/atlas-functional-loop-20261019-01/`. O relatório sensível fica privado fora do repositório. [Manifesto público sem dados de clientes](../evidencias/releases/atlas-ciclo-operacional-local-2026-10-19.json).

## Próxima publicação e limites

A leitura de produção confirmou que os três arquivos de runtime anteriores têm os mesmos hashes da baseline local e que o índice amplo está aplicado. Isso foi somente leitura; não comprova publicação do reparo.

Se autorizado, compor somente esses três arquivos e a migração nova sobre as candidatas vigentes: frontend/perfil `atlas-office-live-chat-20261018-01/candidate`, worker de equipe `atlas-manager-operational-20261018-01/candidate`. Revalidar fontes/concorrência e unidades antes; herdar `.env.production.local` apenas na VPS, sem expor/copiar segredos para este artefato. Não promover toda a raiz dirty, o dist antigo, os ajustes sociais locais ou o ambiente de teste. Worker principal source-order e demais unidades permanecem nas bases vigentes salvo necessidade demonstrada.

Após autorização: preparar backup e guardas, aplicar a migração uma vez, publicar frontend compatível e reiniciar apenas o worker de equipe necessário; conferir contrato SQL, hashes, serviços e logs. Uma recuperação deve preservar o histórico e o esquema compatível. **Não restaurar cegamente o índice antigo:** consultas e execução podem passar a coexistir; reinstalá-lo depois exigiria análise, nunca exclusão de conversas para fazê-lo caber.

Não houve escrita produtiva, restart, chamada paga, mensagem à equipe/cliente ou alteração de tarefa real nesta etapa. Respostas antigas continuam guardadas; não serão reprocessadas em massa. Depois da publicação, quem respondeu pode retomar a falha visível. Chamados já escalados não foram silenciosamente reclassificados.

Os testes não certificam semântica perfeita em toda conversa nem publicação externa/qualidade da entrega. A primeira resposta e revisão de entrega reais com esta versão continuam pendentes; relato ou status concluído não comprova que o conteúdo foi publicado corretamente.
