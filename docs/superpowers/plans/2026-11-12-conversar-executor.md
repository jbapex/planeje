# Conversar executor — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano por tarefa. As investigações independentes seguem superpowers:dispatching-parallel-agents.

**Goal:** Entregar no Planeje o conversacional que coordena e executa nos módulos CRM IA, CS IA e Gestor IA, com perguntas, decisões, recibos, menu e avatares, validado e publicado na VPS.

**Architecture:** Reusar conversas/runs e autenticação de `atlas-chat`, acrescentando runtime interativo, catálogo fechado e itens persistidos de pergunta/aprovação. A sessão real executa as ações oficiais; operações locais e recibo são atômicos, externas têm reserva e reconciliação.

**Tech Stack:** React18/JSX, Vite4, Tailwind3/Radix, npm/package-lock, Supabase/PostgreSQL, Edge Deno. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-12-conversar-executor-design.md`.

## Global Constraints

- Preservar checkout e trabalho local; nenhum reset, limpeza, stage geral ou dist operacional.
- Manter provedor/modelo/limites/sessão existentes e isolamento por usuário, cliente, canal e módulo.
- Tarefas é execução oficial; nenhum motor paralelo de responsáveis/status/conclusão.
- Publicação autorizada para este trabalho após testes; não inferir aceite humano nem autorização para envios reais a clientes.
- Somente migrations inéditas; herdar release/perfil/flags atuais na VPS e conferir concorrência antes de promover.
- Distinguir resultado confirmado, pendente, incerto, conflito e falha. Sem retry cego de criação/transporte.

## Review Focus

- Duplo clique, resposta perdida e recarga entre aprovação e retomada não podem duplicar gravação nem esconder recibo.
- Permissão, sessão, vínculo ou versão revogados após preparar devem impedir a execução e pedir revisão nova.
- Campo omitido numa alteração deve preservar a configuração existente, inclusive campos desconhecidos pelo modelo.
- Texto de fonte/ferramenta não pode conceder autorização, escolher outro cliente ou executar RPC/URL arbitrário.
- Roteiro misto com etapas concluídas e falha não pode ser resumido como sucesso total nem revertido silenciosamente.

## Tarefa1 — Evidência, catálogo e runtime

**Arquivos:** `supabase/functions/_shared/atlasExecutor.js`, `supabase/functions/_shared/atlasExecutorCatalog.js`, adaptadores `atlasExecutorCrm.js`/`atlasExecutorSquad.js`, `scripts/atlas-executor/runtime.test.mjs`, `scripts/atlas-executor/catalog.test.mjs` e referência de paridade.

**Interfaces:**

- `runAtlasExecutor({message,history,clientId,memories,interactions,callModel,readApp,prepareAction,requestInput,readContext,onProgress,signal,limits})` retorna `{content,steps,usage,pending}`. Dependências explícitas e sem transporte produtivo nos testes.
- Ferramentas do modelo: `read_app({app,view,input})`, `prepare_action({app,action,input})`, `ask_user({title,fields,action?})`, `call_agent({agent,task})` e `read_context({section,reference_id,offset})`. Cliente vem da conversa, nunca de argumento livre do modelo.
- `EXECUTOR_AGENTS` descreve Atlas, CRM IA, CS IA, Gestor IA e especialistas existentes; `validateExecutorQuestion` e `validateExecutorAnswers` validam o formulário/valores.
- `executorOperation(app,mode,name)` resolve allowlist e metadados, incluindo efeitos. `readExecutorApp(caller,scope)` e `prepareExecutorAction(caller,scope)` usam os serviços canônicos.

- [x] Auditar ScaleOS por conversa real, formulário fictício e Brain; mapear contratos CRM/CS/Gestor e revisar desenho.
- [ ] Escrever testes que falham para chamada real de especialista, pergunta persistida, bloqueio de ferramentas cruzadas, dados como instrução, ciclo/limite, cancelamento e fonte parcial.
- [ ] Implementar catálogo e runtime; nenhuma função de execução inventada pelo modelo é aceita. Pausa propaga do especialista ao coordenador.
- [ ] Testar adaptadores com SDK real e rede fictícia: preservação de campos, versões, não-mutação na preparação, leitura autorizada e tipos válidos.
- [ ] Rodar `node --test scripts/atlas-executor/runtime.test.mjs scripts/atlas-executor/catalog.test.mjs` e regressões Atlas de fontes/delegação.

## Tarefa2 — Persistência, decisão e execução local atômica

**Arquivos:** migration inédita gerada pelo CLI `atlas_executor`, teste `scripts/atlas-executor/database.test.mjs`; harness descartável reaproveitado dos módulos.

**Interfaces:** tabela `atlas_execution_items` ligada a owner/conversation/run; RPCs de preparar/perguntar, responder/decidir e listar. Item contém `id,revision,kind,app,action,client_id,title,fields,payload,before,preview,state,answers,result,error,resume_request_id`.

- [ ] Escrever/observar testes falhando para item de outro usuário/conversa, alteração do payload, decisão sem sessão, replays, corrida e revogação.
- [ ] Guardar pergunta/proposta vinculada ao run e modo executável. Preparação não chama mutação oficial, inclusive abertura de rascunho de agente.
- [ ] Aprovar com lock do item, revalidar sessão/escopo e chamar apenas ações catalogadas. Gravação e recibo na mesma transação; recusar não grava no módulo.
- [ ] Preservar versão e campos atuais para CRM/agentes/config, CS/regras, Gestor/metas/agenda/modelos/decisões. Serviços canônicos prevalecem.
- [ ] Testar os serviços reais em PostgreSQL descartável, sem TCP/prod; verificar registros nativos e retorno após resposta perdida.

## Tarefa3 — Integração do chat e retomada

**Arquivos:** `atlas-chat/index.ts`, `atlasCore.js`, `src/lib/atlasApi.js`, `useAtlas.js`, testes de endpoint/hook e fixtures `scripts/atlas-preview`.

- [ ] Teste RED para modo executor na identidade do request; `executor=true` não combina com outros modos implícitos.
- [ ] Conversar chama o runtime com caller real e os itens relevantes. Escritório mantém seu contrato.
- [ ] Histórico retorna itens; resposta/aprovação usa ID+revisão e request de retomada persistido. O servidor monta o contexto com o recibo armazenado.
- [ ] Recuperar operação já aplicada mesmo quando a continuação/modelo falhar; manter erro visível e opção de continuar sem reaplicar.
- [ ] Confirmar limites de custo, cancelamento e progresso guardado por run. Testar respostas tardias após troca de sessão/conversa.

## Tarefa4 — Menu, avatar, perguntas e atividade

**Arquivos:** `MainLayout.jsx`, `Sidebar.jsx`, `GestorIaSidebar.jsx`, `AtlasPage.jsx`, `AtlasAgentMark.jsx`, novos componentes `AtlasExecutorItems.jsx`/`AtlasExecutorActivity.jsx`, CSS e verificador de navegador.

- [ ] Teste RED de menu Planeje e avatar Atlas nos atalhos/cabeçalho; manter controle de acesso do atalho.
- [ ] Menu padrão visível e histórico de sessões acessível sem duplicar navegação principal. Reusar imagens CRM/CS/Gestor.
- [ ] Formulário por etapas com tipos, validação, progresso, Voltar, foco, cancelar/resposta livre e persistência de respostas no histórico.
- [ ] Proposta mostra antes/depois, cliente/objeto/efeito; aprovar/recusar e recibo com link oficial.
- [ ] Atividade animada baseada nos eventos reais de leitura/delegação/execução/conferência; reduced-motion e leitores de tela.
- [ ] QA integrado desktop1280/1600 e390/320: reload, erro, corrida, teclado, troca de contexto, sem overflow nem rede real.

## Tarefa5 — Transportes, Meta e cobertura entre páginas

**Arquivos:** adaptadores/handlers oficiais necessários; testes de entrega/Meta com transportes falsos; matriz de paridade.

- [ ] Mensagens e agenda usam filas/serviços nativos, request IDs e estados de entrega. OAuth continua na superfície oficial.
- [ ] Meta status/verba: guardar proposta com fotografia/conta/moeda, guardas no serviço de mutação, comparar antes de POST e confirmar por releitura; resultado incerto não repete POST.
- [ ] Criação Meta: consultar documentação oficial da versão real, adicionar contrato autenticado para campanha/conjunto/criativo/anúncio com entidades pausadas, validação e recibos por etapa. Ativação precisa de outra proposta.
- [ ] Conhecimento: ensino confirmado reutiliza Memória Atlas; base CRM é uma ação própria, sem vazamento de memória privada.
- [ ] Navegar e validar cada página afetada de CRM/CS/Gestor. Matriz registra ação real, serviço, teste, evidência visual e limites; lacuna mantém objetivo aberto.

## Tarefa6 — Revisão, release e conferência produtiva

- [ ] Testes dirigidos, `npm run check`, build temporário e revisão independente/sensível privada com fontes exatas. Resolver achados pertinentes e repetir somente checks afetados.
- [ ] Ler release vigente e estado remoto; preparar overlay e manifesto apenas do escopo, herdando perfil/flags de produção. Não promover outros trabalhos locais.
- [ ] Validar candidata, aplicar migrations inéditas uma vez, publicar endpoints/frontend/runtime afetados com locks e recuperação por recibo.
- [ ] Verificar hashes/HTTPS, serviços, sessão real, menu/avatar, fontes e fluxos com destino autorizado de teste. Não ativar autonomias/rotinas/clientes como atalho de QA.
- [ ] Atualizar continuidade e auditar a especificação requisito por requisito. Concluir meta apenas com execução publicada comprovada, mantendo limites de integrações sem homologação explícitos.

## Registro de execução

-12/11: checkout `codex/atlas` tem extenso trabalho local e releases posteriores à entrega anterior; nenhuma limpeza/stage/commit realizado. Duas auditorias de contratos e uma revisão de desenho somente leitura concluídas.
- Decisão do implementador: criação Meta permanece requisito aberto, pois a meta é paridade funcional. Ausência de serviço atual não reduz o aceite.
- Execução seguirá por contratos testados; autorização de implementar/publicar já recebida. Commits não são pré-requisito de publicação e não incluirão trabalho de outras tarefas.
