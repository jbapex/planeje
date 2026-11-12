**12/11/2026, 09h25 — Neuro / Rotina do Gestor IA PUBLICADO na VPS.** Autorização explícita de Josias depois do preview. Release `gestor-neuro-20261112-01`, composta sobre `crm-ia-base-secoes-20261112-01`, com 2.239 fontes e sete sobreposições MCP. Uma migration inédita aplicada uma vez; conteúdo antigo, RLS/grants, perfil, flags e entregas concorrentes preservados. Onze guardas, dois grupos SQL, 70 Node, 113 MCP, tipagem, build e 44 verificações HTTPS passaram; sessão autenticada confirmou os filtros novos. Somente MCP reiniciado; sem coleta ou preenchimento/validação de semana real. Neuro externo/carga e aceite de uso pendentes. [Publicação, evidência e limites](referencias/gestor-ia-neuro-mcp-2026-11-12.md#publicação-autorizada-na-vps--12112026-09h25).

**12/11/2026 — Neuro / Rotina do Gestor IA em PRÉVIA LOCAL, sem promoção.** Branch feat/gestor-ia recupera a release gestor-rotina-20261112-01 e acrescenta rascunho IA, validação humana no editor oficial, cinco ferramentas MCP, grupos e privacidade antes da rede. Check, 18 testes dirigidos, 76 verificações React, 19 MCP, dez grupos SQL e E2E passaram; revisão sem P1/P2 pendentes. Candidata estática em 127.0.0.1:4394, com dados sintéticos. Produção depende da aprovação explícita de Josias depois do preview nesta conversa. [Contrato, arquivos, evidência e limites](referencias/gestor-ia-neuro-mcp-2026-11-12.md).

**11/11/2026, 23h43 — Menu por categorias e indicadores refinados PUBLICADOS na VPS.** Release `menu-categorias-20261111-01/candidate`, seis sobreposições sobre o CRM cabeçalho e2.144 fontes. Três atalhos e cinco categorias; Gestor IA, CS IA e CRM IA continuam no rodapé como o Squad. Perfil e flags herdados; seis testes do publicador, dois Node na candidata, build, revisão independente e39HTTPS passaram. Sessão autenticada confirmou menu e subpáginas; serviços, runtime e assets anteriores preservados, sem SQL ou reinício. Celular real e aceite de uso pendentes. [Publicação, evidências e limites](referencias/menu-categorias-producao-2026-11-11.md).

**11/11/2026, 08h36 — Perfis, Leads e conversa integrada do CRM IA publicados.** Release `crm-ia-20261111-04`, 41 sobreposições e 2.084 fontes; duas migrations novas aplicadas uma vez, treze no total. Check/286 testes locais e 140 da candidata passaram; revisão independente sem achados pendentes e interface autenticada conferida. HTML, 22 assets e oito bundles/OPTIONS verificados; perfil e Atlas/MCP/sincronizador preservados, sem ativação em massa ou envio/modelo/OAuth real. A meta segue em notificações e demais controles da matriz. [Operação e limites](referencias/crm-ia-perfis-leads-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 07h12 — Concierge, rascunhos e agenda semanal do CRM IA publicados.** Release `crm-ia-20261111-03`, 36 sobreposições e 2.063 fontes; três migrations novas aplicadas uma vez, oito bundles e todos os 22 assets HTTPS conferidos. Check/205 testes locais e 125 da candidata passaram; revisão independente e agenda autenticada conferidas, sem mensagem/modelo/OAuth real. Perfil, Atlas/MCP/sincronizador preservados; nenhuma ativação em massa. A meta continua em perfis, leads e demais controles da matriz. [Operação e limites](referencias/crm-ia-concierge-rascunhos-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 05h33 — Voz, transcrição e Google Agenda do CRM IA publicados.** Release `crm-ia-20261111-02`, 54 sobreposições e 2.046 fontes; quatro migrações inéditas aplicadas uma vez, oito bundles Edge e 22 assets HTTPS conferidos. Check/163 testes locais e 109 testes da candidata passaram; sessão autenticada verificada sem salvar agente, consentir Google ou enviar mensagem. Perfil e serviços Atlas/MCP/sincronizador preservados. Autonomia continua desligada; a meta segue nos controles da matriz de paridade, com homologação real dependente das escolhas do usuário. [Release e limites](referencias/crm-ia-voz-agenda-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 03h06 — Núcleo CRM IA publicado no Squad.** Dez áreas, agentes tipados, agenda interna, conversas/mídia, fila reservável e especialista no Atlas. Migrações novas aplicadas uma vez; seis bundles Edge e frontend conferidos, sem ativação em massa ou teste real de mensagens/modelo. Voz e Google Agenda seguem em implementação; não inferir equivalência integral ou aceite. [Release e limites](referencias/crm-ia-producao-2026-11-11.md).

**28/10/2026, 12h14 — Atlas:13 arquivos publicados, dez funções SQL conferidas, cinco consumidores Atlas e cinco arquivos Edge atualizados. Dois leitores compostos sobre a base produtiva só com delta de aprendizado, preservando consultas/documentos locais ainda não publicados.** [Publicação, operação e limites](referencias/atlas-aprendizado-contato-producao-2026-10-28.md)

**28/10/2026 — Histórico de origens:** `contact_attribution_history` e RPC `persist_ingress_contact_attribution` persistem ledger/principal juntos; helper `_shared/contactAttributionHistory.js` atende os três ingressos. Leitor `rastreamentoLeadAttributionHistory.js` filtra cliente/JID e resolve resumo por cliente/ID; ficha exibe páginas de20 na aba Anúncio. [Contrato publicado](referencias/rastreamento-historico-origens-producao-2026-10-28.md).

**28/10/2026, 08h11 — Atlas: seis arquivos e migração nova PUBLICADOS.** UI AtlasTeamAssistant JSX/CSS e manager/server/time_rules;20261027193803 inclui dois helpers privados e sete substituições, ACL/donos anteriores preservados. Índice exclui somente consulta independente com prova. Team/events usam candidata atlas-send-owner-20261028-02; demais runtimes e Office intactos. [Publicação e limites](referencias/atlas-envio-identidade-producao-2026-10-28.md).

**28/10/2026 — Atlas: nova memória tipada/evidenciada no classificador events, RPC service-only de aprendizado, leitores pessoais/escritório/demandas e UI Memória. Knowledge canônico remove UNION de resumos que contornava revogação. Duas migrações aditivas locais e13 arquivos de produto no manifesto.** [Entrega, fontes e limites](referencias/atlas-aprendizado-contato-local-2026-10-28.md)

**27/10/2026, 16h12 — Atlas: conversa/equipe PUBLICADOS PARA VALIDAÇÃO.** Fatos persistidos, avisos curtos/contexto recolhido, fila pessoal e supervisão, resposta posterior e retorno de aprovação do grupo. Base atlas-dialogue-20261027-02/candidate herda traffic-save02 e perfil produtivo;1.752 fontes, main9982524c/ee022d49. Só migração20261027170137 aplicada UMA VEZ; team/events reiniciados, cinco serviços ativos.188 Python remotos, build,13 fixtures de publicação, SQL/HTTP/hashes passaram. Fila/contexto/conversa autenticados abriram; mapa incorporado ficou vazio na inspeção, seus arquivos íntegros. Sem IA/mensagem de teste; ciclo humano, mapa no navegador de Josias e aceite pendentes. [Publicação e limites](referencias/atlas-conversa-equipe-producao-2026-10-27.md).

**20/10/2026,13h11 — Atlas: novo contexto de tarefa PUBLICADO.** private.atlas_task_record(uuid), team_context/worker_snapshot/manager_finish e três módulos Python novos na candidata atlas-task-record-20261020-01. Migração20261020151558 aplicada uma vez; etapa observada persistida no resultado existente, sem tabela/motor paralelo. Backend da equipe atualizado;frontend calendário/escritório e outros workers preservados. [Publicação e limites](referencias/atlas-registros-tarefa-producao-2026-10-20.md).

**20/10/2026 — Atlas: fontes da tarefa, delta LOCAL.** Nova migração `20261020151558` cria `private.atlas_task_record`, amplia contexto/worker e confere versão no finish. `manager.py` usa etapa observada e poda por orçamento completo; `server.py` reutiliza recorte/revalida tarefa; `time_rules.py` cita etapa/registros no lembrete. Sem nova tabela ou motor de tarefas. [Escopo e limites](referencias/atlas-registros-tarefa-local-2026-10-20.md).

**20/10/2026 — Atlas: identidade do autor em produção.** `manager.py` identifica a mensagem pelo ator autenticado, usa contatos permitidos também no esquema e trata nome ausente. Nenhum contrato SQL ou frontend mudou. [Release e hash](referencias/atlas-identidade-conversa-producao-2026-10-20.md).

**19/10/2026, 23h31 — Atlas: reparo do ciclo operacional PUBLICADO PARA VALIDAÇÃO.** Josias autorizou o conjunto; quatro overlays sobre a base vigente, migração nova aplicada uma vez e somente worker da equipe reiniciado. 1.727 fontes, seis HTTP/hashes, quatro serviços e cwd conferidos; tarefas, histórico e configuração preservados durante a publicação. Build/33 Python/56 Node remotos, 15 testes de recuperação e revisões passaram. Mapa e conversa pessoal vistos na sessão real; nenhuma mensagem/IA de teste. Primeiro ciclo humano e aceite pendentes. [Publicação e limites](referencias/atlas-ciclo-operacional-producao-2026-10-19.md).

**19/10/2026 — Atlas: ciclo operacional VALIDADO LOCALMENTE, NÃO PUBLICADO.** Resposta preservada/retomável, contato explícito da conta sem reassinar tarefa, repetição de pergunta suprimida, mudança de atribuição volta à conta e consulta não bloqueia acompanhamento. 91 SQL/RLS, 110 Python, 56 Node dirigidos, cinco verificações de navegador e check passaram. Migração nova só na fixture; publicação, uso real e aceite pendentes. [Correções, evidência e limites](referencias/atlas-ciclo-operacional-local-2026-10-19.md).

**18/10/2026, 14h37 — Atlas: conversa com robô e atividade no cenário PUBLICADAS PARA VALIDAÇÃO.** Josias autorizou “pode”. Painel claro/avatar, detalhes recolhidos, especialistas por consulta real e clique na origem exata; atualização continua durante envio e para ao concluir/falhar. 51 Node locais/remotos, check/builds, 32 verificações locais (dez repetidas), revisão e 12 fixtures locais/remotas passaram. Seis HTTP/hashes, 1.726 fontes e quatro serviços ativos; sessão real mostrou mapa e novo chat. Main dbe714f9/828bc4c4, mapa 1ed69416/59ec53c3; nova base/perfil atlas-office-live-chat-20261018-01/candidate herda Calendário 14h05. Sem SQL/Edge/restart/IA/mensagem/tarefa de teste; consulta humana real/aceite pendentes. [Publicação e evidência](referencias/atlas-conversa-atividade-escritorio-producao-2026-10-18.md)

**18/10/2026 — Atlas: ponte local de consultas no escritório.** Novo atlasOfficeMissions deriva atividade de jobs/steps; AtlasPage envia catálogo sanitizado via AtlasOffice, snapshot/personagens/robô consomem esse catálogo. Poll de quatro segundos atualiza base durante envio; open_mission valida origem/UUID/catálogo e recusa troca ocupada. Backend/SQL/RLS/modelo intocados. [Entrega local e limites](referencias/atlas-conversa-atividade-escritorio-local-2026-10-18.md)

**18/10/2026 — Atlas: recuperação no runAtlasMission.** atlasManager.js substitui somente a exceção de fonte ausente por tool result source_required/sent=false, passo e continue. Worker é o único consumidor produtivo direto. atlasManagerSourceOrder.test.mjs cobre delegação/leitura antes de contato, lote, isolamento e budgets. Emissor/RPC/reader não alterados. Publicado na candidata source-order, guarda 1.720. [Correção e evidência](referencias/atlas-ordem-fontes-producao-2026-10-18.md).

**18/10/2026, 12h49 — Atlas: conversa interativa no escritório PUBLICADA PARA VALIDAÇÃO.** Josias autorizou o conjunto. Painel privado no mapa, confirmação/busca de cliente, progresso/retomada e acesso às conversas reais da equipe; controlador existente preservado. Correção incremental de sessão aplicada uma vez, sem SELECT amplo em auth.sessions nem relaxamento dos escopos. 55 SQL locais, 47 Node locais/remotos, 28 verificações de navegador, npm check e builds com perfil produtivo/ambiente limpo; duas revisões e 10 testes de recuperação passaram. Seis HTTP/hashes, permissões e quatro serviços conferidos; tarefas, jobs, conversas/mensagens, saídas e política iguais durante publicação. Sessão real abriu conversa e reconheceu Impacto; confirmação não clicada, sem IA/chamado de validação. Mapa ficou vazio na aba de inspeção, observação anterior ainda sem causa; não declarar conferência visual produtiva completa. Main fc221910/92ba26f1; mapa d8cebced/e5ae8acc; base e perfil agora atlas-office-conversation-20261018-01/candidate, guarda 1.719. Unidades mantêm caminhos anteriores; só planeje-atlas e Edge reiniciados. Não repetir publicador/migração. Primeiro retorno humano real e aceite pendentes. [Publicação e evidência](referencias/atlas-conversa-escritorio-producao-2026-10-18.md).

**16/10/2026, 23h30 — Chamados do robô dentro do escritório PUBLICADOS.** Pedido de Josias: saber quem o Atlas chamou, mensagem, retorno e revisão. Nova aba/entrada Chamados; Aguardando Josias abre assuntos concretos, Aguardando equipe abre conversas reais. Cartões com destinatário, cliente, mensagem/última resposta e revisão; botão abre o assunto exato no robô e sai do modo ampliado. Sugestões abrem demanda/perfil; histórico dos vinte encerrados mais recentes. Contadores de agentes podem se sobrepor e não duplicam assuntos na lista. 14 testes novos/expediente, 30 regressões, build, prévia fictícia computador/celular, consultas PostgREST e navegador autenticado real passaram. Produção: cinco sugestões, zero conversa/mensagem interna; nenhum chamado real criado para teste. Assets `f054f258`/`48915503`, escritório `b0d38839`/`fa6fc7d5`; conserva anteriores. Base `atlas-office-calls-20261017-01/candidate`, guarda de 1.668 fontes. Sem SQL/restart/IA/escrita em tarefa ou mensagem; observação, teto de um milhão e aprovação preservados. Baseline já tinha quatro chamadas/198.224 tokens, inalterados nesta revisão. Aceite e uso de conversa real pela equipe pendentes. [Referência](referencias/atlas-chamados-escritorio-2026-10-16.md) · [Release](evidencias/releases/atlas-chamados-escritorio-2026-10-16.json).

**16/10/2026, 21h59 — Atlas: 1 MILHÃO de tokens/dia e configurações PUBLICADOS.** Josias autorizou o teto e pediu uma tela editável. Salvo pela sessão normal e confirmado após recarregar, sem zerar os 156.710 tokens do dia ou fazer nova chamada de teste. `#/assistant/atlas/configuracoes`, atalho Configurar no escritório e na central, acesso exclusivo do dono; permite aumentar o teto depois. Observação continua ativa, 24 clientes selecionados, chamados automáticos desligados e tarefas sob aprovação. Oito verificações adicionais de limite/RLS, build e navegador computador/tela estreita, persistência e atalho passaram; quatro serviços ativos. SQL novo `20261017005227` aplicado UMA VEZ; não reaplicar. Assets `dddf4065`/`48915503`, escritório `b4d876e6`/`17b78889`; preserva os anteriores. Base atual `atlas-events-settings-20261016-01/candidate`; backend permanece em `atlas-events-production-20261016-01`, sem restart nesta revisão. Aceite de uso e sete vínculos de grupos pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

# Mapa técnico de implementação

**16/10/2026, 21h48 — Atlas por acontecimentos PUBLICADO na VPS real, EM OBSERVAÇÃO.** Entrada produtiva com delegação curta do dono, fila/fontes/transcrições, 100 anteriores, índice de tarefas e rascunhos privados na central/perfil. Somente 17 grupos explicitamente vinculados (24 clientes selecionados; sete sem vínculo); 37 grupos de lojas excluídos antes de IA. Leitor automático antigo substituído, inclusive quando a leitura nova é pausada; robô/áudio/acompanhamento determinístico preservados. 56 verificações Python, 68 API/Auth/RLS/fila, 15 do motor, 38 Node, 15 runtime e navegador computador/tela estreita passaram. Impacto: três chamadas reais, duas recusadas pelo limite do piloto e uma aceita como recorte limitado de cinco pontos para revisão/possível agrupamento; cinco rascunhos, zero tarefa oficial/conversa interna/envio. 121.605 tokens novos + 35.105 anteriores; margens de validação 80/120/160 mil restauradas para **60 mil/dia**, zero reservado. Escolha do teto da operação foi perguntada e aguarda Josias; não presumir um milhão. Assets `7c508ca6`/`d86dd2fb`, base `atlas-events-production-20261016-01/candidate`, webroot `/var/www/planeje`; incorpora sessão/perfil concorrente e corrige espera dos módulos antes do redirecionamento. SQL `20261017000743` e `20261017002459` aplicados UMA VEZ CADA somente na produção/cópia descartável; não reaplicar, não aplicar o consolidado no CS. Perguntas automáticas à equipe continuam desligadas; qualidade semântica, orçamento, responsáveis/vínculos e aceite pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

**16/10/2026, 21h25 — Sessão/perfil: aviso prematuro ao atualizar CORRIGIDO E PUBLICADO.** Prazo global liberava a tela ainda sem perfil; login/renovação e callback assíncrono também causavam janela falsa. Estado único, consultas fora do callback, cancelamento/versões e erro só após falha concluída; repetir sem reload e Mini CRM do cliente conserva rota/filtros. 20 testes de relógio, 14 com SDK/GoTrue/PostgREST reais isolados, 12 de navegador fictício computador/390×844, seis scripts/build Mac e HTTP/serviços passaram. Navegador produtivo autenticado/aceite pendentes. Promoção inicial recusada por concorrência; refeita sobre Atlas acontecimentos sem perder suas fontes/flags. Assets `31f3e8e3`/`d86dd2fb`, conserva `55847b9c`/`d86dd2fb`; guarda de 1.653 fontes, três de produto + um teste promovidos. Base `auth-profile-load-20261016-01/candidate`; CS compatibilizado sem rebuild, diferenças antigas do App preservadas. Sem SQL/restart, credencial/perfil real/lead/IA/envio alterados por esta entrega. [Referência](referencias/auth-perfil-carregamento-2026-10-16.md) · [Release](evidencias/releases/auth-perfil-carregamento-2026-10-16.json).

**16/10/2026, 21h04 — Mini CRM: campo de observação VISÍVEL com histórico no ícone, PUBLICADO.** Josias pediu o campo também na ficha. Última nota, Nova e Salvar aparecem no formulário; ícone abre popup só com histórico. Grade continua compacta; fila/autor/data/rascunho preservados. Onze verificações de navegador fictício computador/390×844, cinco regressões/build Mac e HTTP/bytes passaram; serviços conferidos. Assets `8d239b4a`/`5b3645bc`, conserva `d5cf727f`/`11912e85`; guarda de 1.643 fontes, uma promovida. Base `mini-crm-notes-field-20261016-01/candidate`; fonte CS sincronizada sem rebuild. Sem SQL/restart, IA, lead real ou envio; migração `20261016231229` não reaplicada. Uso autenticado produtivo/aceite pendentes. [Referência](referencias/mini-crm-observacoes-campo-2026-10-16.md) · [Release](evidencias/releases/mini-crm-observacoes-campo-2026-10-16.json).

**16/10/2026 — Atlas por acontecimentos, namespace novo no CS.** `scripts/atlas-events` (contexto, worker/API e seis suítes), `atlasEvents.js`, `AtlasEventPanel` e integração na central existente. Tabelas `atlas_event_config/groups/jobs/findings/signals`, outbox sem IA no webhook, fontes sob sessão normal do dono fictício, writers de worker restritos a serviço. Publicação marcada por `published_at`; antes/depois do modelo e no despacho, reconfere fontes e política. Entrada recusa produção. [Mapa/runtime](referencias/atlas-gatilhos-piloto-2026-10-16.md).

**16/10/2026, 20h46 — Mini CRM: observações recolhidas em ÍCONE, PUBLICADO.** Pedido de Josias: texto/editor escondidos; clique abre popup com histórico já visível, última nota e Nova/Salvar. Ficha, Grade, Kanban e Follow-up usam o mesmo componente; rascunho/fila/registros preservados. Dez verificações de navegador fictício (computador/390×844, salvar, Escape, foco/Enter e reabertura), cinco regressões/build Mac e HTTP/bytes passaram; serviços conferidos. Assets `d5cf727f`/`11912e85`, conserva `3d7f4fb2`/`4f764e24`; guarda de 1.643 fontes, só duas promovidas. Base `mini-crm-notes-popup-20261016-01/candidate`; CS fonte sincronizada sem rebuild. Sem SQL/restart, IA, lead real ou envio; migração `20261016231229` não reaplicada. Uso autenticado produtivo/aceite pendentes. [Referência](referencias/mini-crm-observacoes-popup-2026-10-16.md) · [Release](evidencias/releases/mini-crm-observacoes-popup-2026-10-16.json).

**16/10/2026, 20h27 — Mini CRM: histórico de observações PUBLICADO.** Nova/escrever/Salvar cria nota com autor/data; ícone no campo abre histórico, última permanece no lead. Ficha, Grade, Kanban e Follow-up compartilham registros; digitação não cria entradas. Rascunho na mesma página, cancelar, falha/repetição e paginação preservados. Texto anterior conservado sem inventar data/autor; gravações antigas também são capturadas. 56 API/Auth/RLS isoladas, 13 auditorias no CS/produção, cinco regressões/build Mac e navegador fictício computador/390×844 passaram. HTTP/serviços/recusa anônima conferidos; uso autenticado real/aceite pendentes. SQL novo `20261016231229` aplicado UMA VEZ no CS e produção; não reaplicar. Assets `3d7f4fb2`/`4f764e24`, conserva `e72fc152`/`b251e8bf` e Atlas. Base `mini-crm-notes-20261016-01/candidate`; próximos guardas em `source-keys-next.json`. Sem restart, IA, lead real alterado ou envio pelo agente. [Referência](referencias/mini-crm-observacoes-historico-2026-10-16.md) · [Release](evidencias/releases/mini-crm-observacoes-historico-2026-10-16.json).

**16/10/2026, 19h56 — Ficha: origem, UTMs e mídia na aba Anúncio, PUBLICADO.** Contato conserva edição/marcações e Atendimento; Anúncio reúne criativo, origem/canal, conta registrada, campanha/conjunto/anúncio, identificadores, UTMs e jornada da Meta. Cópia, notas de procedência, estados vazios e rascunhos preservados. Cinco scripts, build Mac e navegador fictício computador/390×844 passaram; HTTP/bytes e serviços conferidos, sem teste autenticado de produção. Assets `e72fc152`/`b251e8bf`, conserva `cbb6ac1b`/`939a0f53` e Atlas; guarda de 1.638 fontes, três promovidas. Nova base `lead-ad-tab-20261016-01/candidate`. Sem SQL/restart, IA, lead real, mensagem ou conversão pelo agente. Primeiro uso/aceite pendentes. [Referência](referencias/lead-aba-anuncio-2026-10-16.md) · [Release](evidencias/releases/lead-aba-anuncio-2026-10-16.json).

**16/10/2026, 18h47 — Mini CRM: edição na ficha do lead PUBLICADA.** A ficha da Grade/Kanban/Follow-up edita etapa, consultora, agendamento/horário, comparecimento, datas, próxima ação, observações e campos configurados; mesmos patches/fila da Grade. Salvamento automático, repetir e fechar aguardam gravação; venda só segue após salvar, falha/cancelamento restauram a etapa. Seis scripts/build Mac e navegador fictício computador/390×844 passaram. HTTP/serviços conferidos; validação produtiva autenticada pendente porque a sessão não carregou o perfil. Assets `cbb6ac1b`/`939a0f53`, conserva `9c001447`/`74446f1a` e Atlas; guarda de 1.638 fontes, só três promovidas. Nova base `mini-crm-ficha-edit-20261016-01/candidate`. Sem SQL/restart, lead real, IA, mensagem ou conversão pelo agente. Primeiro uso/aceite pendentes. [Referência](referencias/mini-crm-ficha-edicao-2026-10-16.md) · [Release](evidencias/releases/mini-crm-ficha-edicao-2026-10-16.json).

**16/10/2026, 13h14 — Editar nome na ficha do lead PUBLICADO.** Botão visível na ficha principal do Mini CRM/Rastreamento/calendário; Salvar, Cancelar, Enter e Escape. Nome personalizado persistente e prioridade na lista/busca; gravação concorrente preserva campos e não pausa a automação. Seis verificações de concorrência, 18 API/Auth/RLS, seis scripts/build Mac, cinco remotos e navegador com fictícios passaram. Beatriz real apenas aberta/cancelada. Assets `fa402a2e`/`a59c888c`, conserva `e2684428`/`78ec83aa` e Atlas. Sem SQL/restart, renomeação real ou envio pelo agente. Três estilos locais alheios não promovidos; fonte CS incorporada sem rebuild. Candidata base `lead-name-20261016-01/candidate`; primeiro uso/aceite pendentes. [Referência](referencias/lead-nome-2026-10-16.md) · [Release](evidencias/releases/lead-nome-2026-10-16.json).

**16/10/2026, 12h57 — Rolagem da Automação do Mini CRM CORRIGIDA E PUBLICADA.** Josias identificou que o formulário transbordava no layout fixo. Área própria com altura flexível e rolagem vertical; navegação/rascunhos preservados. Build no Mac, gesto até o último bloco/volta ao Salvar no computador e tela estreita, produção autenticada e HTTP passaram. Assets `e2684428`/`78ec83aa`, conserva `c682c5dd`/`cd788441` e Atlas. Só CSS, sem SQL/restart ou regra alterada pelo agente. Na reabertura foi observada regra da Casa D Noivas já ligada; preservada. Fonte CS sincronizada sem rebuild. Candidata base atual `mini-crm-automation-scroll-20261016-01/candidate`; primeiro uso real/aceite pendentes. [Referência](referencias/mini-crm-automacao-scroll-2026-10-16.md) · [Release](evidencias/releases/mini-crm-automacao-scroll-2026-10-16.json).

**16/10/2026, 12h50 — Mini CRM: status por mensagem e agendamento com horário PUBLICADOS.** Aba Automação por cliente/canal, entrada → atendimento, palavras/remetente, confirmação de data/hora e prévia. Marcação manual pausa; retomada no painel. Webhooks aguardam motor, patches/versionamento preservam edições; Realtime e consulta visível atualizam cartões. Hora separada em grade/ficha/Follow-up/calendário. 48 verificações puras, 12 casos dos handlers, 58 API/Auth/RLS, nove scripts/build no Mac, sete remotos e navegador passaram. Assets `c682c5dd`/`cd788441`, incorpora Meta Link/copiar configuração/vendedores; anteriores/Atlas conservados. SQL novo `20261016152632` aplicado uma vez no CS e produção; não reaplicar. Apenas Edge Functions reiniciado. Regras reais desligadas; sem mensagem, IA nova ou conversão comercial automática. Fonte CS incorporada sem rebuild; Assessoria não publicada. Ativação e primeira mensagem real/aceite pendentes. [Referência](referencias/mini-crm-automacao-2026-10-16.md) · [Release](evidencias/releases/mini-crm-automacao-2026-10-16.json).

**16/10/2026 — Cadastro de vendedores do Mini CRM CORRIGIDO E PUBLICADO.** Enter adiciona à lista sem salvar um formulário vazio; Salvar configuração também inclui o nome ainda digitado. Orientação Adicionar/Enter → Salvar visível. Falha reproduzida, componente real com cinco cenários de navegador, cinco regressões, build no Mac e quatro scripts remotos passaram. Assets `a4b77eda`/`8ff25961`, incorpora Meta Link e copiar configuração; anteriores/Atlas conservados. Sem migração, restart ou vendedor real criado pelo agente. Candidata base atual `mini-crm-sellers-20261016-01/candidate`; CS/Assessoria não publicada, aceite pendente. [Referência](referencias/mini-crm-vendedores-2026-10-16.md) · [Release](evidencias/releases/mini-crm-vendedores-2026-10-16.json).

**16/10/2026, 12h03 — Super Admin copia configuração do Mini CRM; PUBLICADO.** Escolher origem, status/cores e/ou colunas/ordem, prévia e confirmação. Itens exclusivos, chaves equivalentes, tipos de campos e dados dos leads do destino preservados; vendedores, cadência e permissões não são copiados. Prévia revalidada e concorrência protegida. Cinco scripts, builds no Mac, quatro scripts remotos e prévia fictícia passaram; aplicação real pelo usuário/aceite pendentes. Assets `7ff25f94`/`8ff25961`, inclui Meta Link e todas as entregas produtivas; anteriores e Atlas conservados. Sete arquivos das duas entregas incorporados à candidata CS, sem rebuild; CS/Assessoria não publicada. Sem migração, restart ou cópia real pelo agente. [Referência](referencias/mini-crm-copiar-config-2026-10-16.md) · [Release](evidencias/releases/mini-crm-copiar-config-2026-10-16.json).

**16/10/2026, 11h50 — Mini CRM: Meta Link e origens UTM PUBLICADOS.** Linktree aparece como Meta Link na grade, Kanban e ficha; outras fontes mostram utm_source. UTMs originais e atribuição preservadas, links ficam em Outras origens, sem CAPI/clique inventado. 17 cenários, cinco regressões, build no Mac, quatro scripts remotos, prévia e contato real passaram. Assets `dfb9d42a`/`8ff25961`, conserva `f19ca1d1`/`8a46408f`; escritório/Atlas preservados. Sem migração ou restart; aceite de uso pendente. [Referência](referencias/mini-crm-origem-2026-10-16.md) · [Release](evidencias/releases/mini-crm-origem-2026-10-16.json).

**16/10/2026 — Atlas: colunas recolhíveis e logos dos clientes PUBLICADAS.** Setas independentes recolhem/reabrem menu da equipe e acompanhamento; mapa e controles aproveitam a área, seleção/rascunhos conservados em atualizações e Ampliar/Esc. Celular mantém abertura/fechamento do acompanhamento e recolhe a navegação. Clientes mostram a primeira logo cadastrada acima do personagem, com iniciais se ausente/indisponível; nome ao selecionar e clique preservados. Leitura autenticada amplia somente metadados `logo_urls`, mesmos clientes/RLS. 27 cenários Node, builds, prévia fictícia computador/celular e produção autenticada passaram. Assets `bdacac55`/`8a46408f`, mapa `f94ade29`/`17b78889`; anteriores preservados. Sem SQL, restart, IA, escrita operacional ou envio. Aceite de Josias pendente. [Referência](referencias/atlas-colunas-logos-2026-10-16.md) · [Release](evidencias/releases/atlas-colunas-logos-2026-10-16.json).

**16/10/2026 — Casa dos clientes com carteiras e personagens andando PUBLICADA.** Casa no mapa, acesso pelo cenário/menu/Clientes; filtros JB Apex, Ápice Noivas e A confirmar, busca, tarefas/responsáveis/prazos e atalhos à ficha, demandas/histórico, arquivos/memória, reuniões e projetos. Conferência final autenticada: 24 clientes, 14 JB Apex, nove Ápice e um a confirmar; sem classificar por inferência. Um avatar por cliente circula na sala correspondente ou na recepção compartilhada, com iniciais/nome selecionado; clique abre o acompanhamento. Pausar/retomar só animação; movimento reduzido respeitado. Agentes continuam sete; sem tokens para animação. 24 cenários Node, 92 regressões, builds, leituras/permissões e navegador computador/celular passaram. Assets `3a5bc020`/`8a46408f`, mapa `a6e80258`/`8fa600e9`; conserva base `fab2cc84`/`e685eeed` e anteriores. Sem SQL, restart, mudança do gerente/limites, escrita operacional ou envio. Classificação do cliente restante e aceite de Josias pendentes. [Referência](referencias/atlas-casa-clientes-2026-10-16.md) · [Release](evidencias/releases/atlas-casa-clientes-2026-10-16.json).

**16/10/2026 — Atlas: iluminação por horário e descanso PUBLICADOS.** Ciclo visual de amanhecer/dia/entardecer/noite no fuso de São Paulo; descanso fora de seg–sex 08h–17h, inclusive fins de semana. Apenas análise real em andamento acorda o agente relacionado; ao terminar volta a descansar. Perguntas/aprovações/erros mantêm contadores e acesso nos painéis; balões de cobrança saem do mapa durante o descanso. Sem tokens adicionais para a animação. Oito cenários de relógio/simulação (também em fusos Tóquio/Los Angeles), 92 regressões, builds e navegador computador/celular passaram; sete agentes em descanso conferidos autenticados. Assets `883defd9`/`8a46408f`, escritório `d6177d45`/`5acebe14`; conserva anteriores. Sem SQL, restart, mudança de regras/limites da IA ou escrita operacional/envio. Aceite visual de Josias pendente. [Referência](referencias/atlas-dia-noite-descanso-2026-10-16.md) · [Release](evidencias/releases/atlas-dia-noite-descanso-2026-10-16.json).

**15/10/2026 — Link de conexão do WhatsApp liberado à equipe com Rastreamento; PUBLICADO.** Pedido explícito de Josias: todos que abrem a página podem gerar/consultar/revogar, incluindo colaboradores. Interface/serviço/SQL usam papel ativo, conta/sessão atual, permissão efetiva do módulo e RLS existente do canal. Sem elevar papéis ou alterar linhas de permissões. 48 verificações Node, 145 API/Auth/RLS isoladas, build e navegador passaram; gestor validado no banco. SQL novo `20261015173734` aplicado uma vez no teste e produção; não reaplicar. Assets `9aefb86f`/`841037d3`, conserva `03465f2e`/`841037d3`. Apenas Edge Functions reiniciado; Atlas preservado, grupos sem alteração. Aceite de uso pendente. [Referência](referencias/whatsapp-conexao-acesso-2026-10-15.md) · [Release](evidencias/releases/whatsapp-conexao-acesso-2026-10-15.json).

**15/10/2026, 12h53 — Atlas ocupa a área completa; Ampliar e cabeçalho compacto PUBLICADOS.** Corrigida a altura fixa que deixava faixa vazia inferior; uma barra reúne navegação/controles. Ampliar usa o viewport; Reduzir/Esc volta sem perder rascunho. Cartão persistente “Sua agência, num só lugar” retirado do mapa após nova captura de Josias. Builds e navegador notebook/celular, geometria, expansão/Esc, rascunho e conversa passaram; aceite de uso pendente. `index.03465f2e.js` / `index.841037d3.css`, `?v=03465f2e#/assistant/atlas`; conserva `7e61c47a`/`d0485537` e escritório anterior. Somente apresentação, sem SQL/restart, mudança de IA/áudio, tarefa ou envio externo. [Referência](referencias/atlas-layout-ampliado-2026-10-15.md) · [Release](evidencias/releases/atlas-layout-ampliado-2026-10-15.json).

**15/10/2026, 10h11 — Atlas: ditado, estados dos agentes e roxo PUBLICADOS.** Microfone nas respostas por cliente e nos comandos/conversa: gravar → parar/transcrever → conferir → enviar/guardar; cancelamento e repetição sem envio automático. Contadores/filtros de sete estados usam as filas reais, sem inferir presença humana. 62 verificações Node, 29 SQL e 15 API/Auth/RLS isoladas, gerente/regressões, provedor com fala fictícia, builds e navegador computador/celular passaram. Produção autenticada e recusas 401/403 conferidas; teste com o microfone de Josias/aceite pendentes. `index.7e61c47a.js` / `index.d0485537.css`, `?v=7e61c47a#/assistant/atlas`; conserva `006aca37`/`6b5b8461`. SQL `20261015124424` aplicado UMA VEZ; não reaplicar. Sem restart, tarefa/resposta real/envio externo pelo agente; escritório segue ativo e monitor legado pausado. Testes temporários removidos. [Referência](referencias/atlas-audio-estados-2026-10-15.md) · [Release](evidencias/releases/atlas-audio-estados-2026-10-15.json).

**15/10/2026, 09h15 — Atlas escritório e gerente PUBLICADOS.** Pedido de Josias atendido em `#/assistant/atlas`, com identidade Planeje, equipe real, diretório de clientes, tarefas/histórico, perguntas e memória por cliente. Seg–sex 08h–17h, São Paulo; leitura a cada 10 min, IA por mudança/pedido, limites iniciais 12 análises/60 mil tokens/dia. Criação de tarefa exige aprovação humana. 30 verificações Node, 50 regressões Atlas, 47 SQL e 27 API/Auth/RLS isoladas, smoke fictício do modelo, build candidato e navegador autenticado computador/celular passaram. Consulta real: 7 pessoas/24 clientes; 24 orientações abertas, nenhuma proposta/tarefa criada. Reinício preservou estado e não consumiu IA adicional. `index.006aca37.js` / `index.6b5b8461.css`, `?v=006aca37#/assistant/atlas`; incorpora WhatsApp `95e6d883`/`c1a42de6`, conservados. SQL `20261015044353` e `20261015122902` aplicados UMA VEZ cada; serviço próprio `planeje-atlas-office.service` ativo, monitor legado continua pausado. Banco/contêiner temporários removidos. Sem envio WhatsApp/CAPI/e-mail ou escrita operacional em tarefas; aceite de uso pendente. [Referência](referencias/atlas-escritorio-integracao-2026-10-15.md) · [Release](evidencias/releases/atlas-escritorio-integracao-2026-10-15.json).

**15/10/2026 — Link para conectar WhatsApp por QR/código PUBLICADO.** Botão por instância em Rastreamento → Integrações para gerar/copiar/abrir/revogar; página externa sem login, com QR ou número internacional. Link de 24 horas, hash no banco, encerrado após conectar; credencial Uazapi no servidor. 35 verificações Node, 105 API/Auth/RLS isoladas, build, auditoria de permissões e navegador passaram; botão/consulta e URL inválida conferidos na produção, sem parear aparelho real. SQL `20261015045127` aplicado uma vez no teste e na produção; não reaplicar. Assets `95e6d883`/`c1a42de6`, conserva `47519cec`/`2731d631`. Somente esta entrega promovida; apenas Edge Functions reiniciado. Atlas pausado, Assessoria e escritório não publicados e devem incorporar esta revisão. Aceite de uso pendente. [Referência](referencias/whatsapp-conexao-link-2026-10-15.md) · [Release](evidencias/releases/whatsapp-conexao-link-2026-10-15.json).

**15/10/2026 — Atlas escritório preparado.** `AtlasOffice.jsx` autentica e conecta iframe `/atlas-office/index.html` com validação de origem/janela; `atlas-office` lê fontes com RLS e RPC humana. `atlasOffice.js` pagina o inventário; `atlasOfficeManager.js` decide perguntas/propostas; `atlas-office-worker.mjs` trabalha somente no contexto delimitado sem ferramenta de escrita operacional. Migração nova `20261015044353`; aplicada apenas ao banco descartável de teste, nunca à produção. Renderer Habblaud MIT: 85/86 arquivos TS preservados, `world/assets.ts` adaptado ao BASE_URL. Nenhum servidor/hooks Habblaud adotado. [Referência](referencias/atlas-escritorio-integracao-2026-10-15.md) · [Preparação](evidencias/releases/atlas-escritorio-integracao-2026-10-15.json).

**15/10/2026 — Classificação estratégica dos nós.** `ConsultingFlowStage.jsx` compartilha seletor/etiqueta e `FLOW_FUNNEL_STAGES`; `data.funnel_stage` opcional em conjunto/anúncio segue no grafo existente, histórico e contexto IA. Guard invoker separado `cs_visual_flow_stage_guard` na migração `20261015044248`, somente banco isolado. [Referência](referencias/apice-cs-funil-etapas-2026-10-15.md).

**15/10/2026 — Funil visual da Assessoria em teste.** `ConsultingVisualFlow` usa React Flow já instalado, `consultingVisualFlow.js` serializa grafo livre em `sales_funnel.visual_flow`, `consultingFlowCatalog.js` restringe leitura de catálogo à cadeia cliente/conta/campanha/conjunto/anúncio. `ConsultingFlowHistory` e leitor Atlas usam o mesmo grafo; Tarefas continua execução. Guard/trava e três RPCs invoker na migração `20261015040338`, apenas no banco isolado. [Referência](referencias/apice-cs-fluxo-visual-2026-10-15.md).

**15/10/2026 — Prévia Atlas escritório isolada em `scripts/atlas-office-preview/`.** Canvas de Habblaud 0.11.0, commit `4ccce2537472fe5a8d432f06974494d2e778ff15`, licença MIT preservada; 86 arquivos TS upstream sem alteração. Adapter em memória entrega snapshot/evento ao renderer; UI e fixture próprias. Vite 4.5.14 existente gera `.local/atlas-office-preview/dist`; servidor estático loopback 4330. Sem API proxy, servidor original, hooks, mods, terminais ou leitura de sessões. [Referência](referencias/atlas-escritorio-previa-2026-10-15.md) · [Release](evidencias/releases/atlas-escritorio-previa-2026-10-15.json).

**14/10/2026, 15h53 — Ficha de Rastreamento em duas colunas e aba Anúncio PUBLICADAS.** Josias aprovou a prévia visual (“Gostei”). Marcar, origem e cinco UTMs à esquerda; conversa à direita; criativo em aba própria. Celular em sequência com rolagem. Três scripts Node locais/na candidata, build da prévia/completo e navegador passaram; ficha real do contato indicado, UTMs, conversa, abas e tela estreita conferidas. `index.47519cec.js` / `index.2731d631.css`, recarregar `?v=47519cec#/rastreamento?aba=leads`; assets anteriores conservados. Somente dois arquivos de frontend e assets promovidos, sem restart, banco, envios ou configuração do Atlas alterados. CS/Assessoria segue não publicada e deve incorporar esta revisão. Aceite de uso pendente. [Referência](referencias/rastreamento-ficha-layout-2026-10-14.md) · [Release](evidencias/releases/rastreamento-ficha-layout-2026-10-14.json).

**14/10/2026, 12h53 — UTMs na ficha e rastreamento pela mensagem PUBLICADOS.** A ficha separa as cinco UTMs dos nomes de anúncio. Mensagem completa e exclusiva do mesmo cliente/canal identifica o link sem código; UTMs vêm da configuração, sem inventar clique individual. Contato indicado ajustado pela primeira mensagem recebida; Linktree corrigido para uso Site, com texto e código desligado preservados. Sete scripts Node, dez casos isolados dos handlers, build, notebook/celular e navegador autenticado passaram. `index.0298c2a9.js` / `index.94bf622f.css`, recarregar `?v=0298c2a9#/rastreamento?aba=leads`; assets anteriores conservados. Dois handlers e módulo compartilhado publicados; somente Edge Functions reiniciado. Sem migração, WhatsApp/CAPI/e-mail ou tarefas alteradas; Atlas pausado. CS/Assessoria segue não publicado e deve incorporar esta revisão. Aceite pendente. [Referência](referencias/rastreamento-utms-2026-10-14.md) · [Release](evidencias/releases/rastreamento-utms-2026-10-14.json).

**14/10/2026, 12h17 — Rastreamento: número do WhatsApp corrigido em produção.** O sufixo de dispositivo (`:15`, por exemplo) deixa de entrar no telefone do seletor. Três destinos já salvos foram corrigidos somente após comparação exata com o JID atual da instância; mesmos links, mensagens, UTMs e históricos preservados. Dois scripts Node, build, três redirecionamentos HTTP e Editar/Novo link no navegador passaram. `index.ab564283.js` / `index.cb906053.css`, recarregar `?v=ab564283#/rastreamento?aba=links`; assets anteriores conservados. Sem migração, restart de backend, envio WhatsApp/CAPI/e-mail ou tarefas alteradas; Atlas pausado. CS/Assessoria segue não publicado e precisa incorporar a correção no próximo candidato. Aceite de uso pendente. [Referência](referencias/rastreamento-telefone-2026-10-14.md) · [Release](evidencias/releases/rastreamento-telefone-2026-10-14.json).

**14/10/2026 — CS da Ápice: candidato validado na VPS; NÃO PUBLICADO.** Acesso à VPS 109 recuperado, fontes reconciliadas e versão pronta nas telas existentes: etiquetas por operação, plano de consultoria/funil, tarefas reais e Documentos com versões/anexos privados. 51 testes Node, 61 verificações SQL locais, 62 no esquema completo com permissões, 27 testes de API/Storage/Atlas e build do candidato passaram; navegador notebook/celular já conferido. Candidato `index.e602149d.js` / `index.448e1a9f.css`. Banco e contêineres temporários removidos. Produção permanece `9e0f843e`/`cb906053`; SQL `20261014043345` NÃO aplicado, Atlas continua pausado. Publicação e aceite de uso pendentes. [Referência](referencias/apice-cs-projetos-documentos-2026-10-14.md) · [Release candidata](evidencias/releases/apice-cs-candidato-2026-10-14.json).

**13/10/2026, 23:40 — Equipe somente por convites de Josias; segurança e compatibilidade concluídas.** Escopo confirmado: apenas funcionários da agência; provisionamento administrativo das lojas/clientes preservado. Cadastro público fechado, convite individual por e-mail com sete dias e uso único; contas pendentes/removidas, sessões revogadas e autoelevação recusadas. Atlas voltou às oito fontes por delegação assinada de até 240 s, limitada ao proprietário ativo; monitor continua pausado. MCP exige aprovação/conta atual e sessão vinculada à identidade; reiniciado, pode exigir reconectar o ChatGPT. Testes Node/SQL com rollback, notebook/celular, build, HTTP e leituras reais passaram. `index.9e0f843e.js` / `index.cb906053.css`, `?v=9e0f843e#/settings?tab=equipe`; conserva `44e11d16`/`66ba606f`. SQL `20261013140451`, `20261013150647`, `20261013152143` e `20261014023511` aplicados uma vez, não reaplicar. Sem envio WhatsApp/CAPI/e-mail, tarefa alterada ou conta real de teste persistida. Aceite de uso e auditoria histórica/globais pendentes. [Referência](referencias/convites-seguranca-2026-10-13.md) · [Release](evidencias/releases/convites-seguranca-2026-10-13.json).

**13/10/2026, 09:52 — Aviso de grupo sem resposta não interrompe a tarefa.** Publicado: o balão fica oculto durante a edição em drawer/formulário e volta ao fechar; o X adia somente o aviso. Intervalos e Minha caixa preservados. Regressão reproduzida e corrigida em notebook/celular, teste de espera e build passaram; assets/estilo servido conferidos. `index.44e11d16.js` / `index.cb906053.css`, recarregar `?v=44e11d16#/tasks`; conserva `66ba606f`/`e981fa67`. Sem SQL, restart de backend, escrita em tarefas, WhatsApp ou CAPI. Aceite pendente. Componentes: `AtendimentoEsperaPopup.jsx` e novo `AtendimentoEsperaPopup.css`; camada 40 e ocultação por `body:has` de modal aberto. [Referência](referencias/conversas-aviso-tarefa-2026-10-13.md) · [Release](evidencias/releases/conversas-aviso-tarefa-2026-10-13.json).

**09/10/2026, 08:23 — Atlas: voz, conversa e carteira corrigidas em produção.** Revisão das conversas reais; tom próximo; perguntas operacionais consultam as fontes. Carteira atual = `etapa=closed` em chat/voz/fontes/monitor; 23 clientes fechados, 16 grupos elegíveis; antigos e grupos sem vínculo fora da análise automática. Voz espera reprodução, tolera desconexão breve, trata corte por limite e não encerra ao trocar de aba. 57 testes/build passaram, missão real concluída e saudação de voz completa; conversa longa/aceite pendentes. `index.66ba606f.js` / `index.e981fa67.css`, `?v=66ba606f#/assistant/atlas`; conserva `399e022d`. Worker ativo em `atlas-human-20261009-01/candidate`. Sem SQL, WhatsApp/CAPI ou escrita operacional. [Referência](referencias/atlas-voz-carteira-2026-10-09.md) · [Release](evidencias/releases/atlas-voz-carteira-2026-10-09.json).

**09/10/2026, 08:09 — Rolagem e altura do Atlas corrigidas em produção.** A página preserva a altura natural dentro do contêiner rolável; mapa/chat se adaptam à altura, cartões ficam compactos em telas baixas e Memória tem rolagem própria no desktop. Notebook, celular e lista real de memórias conferidos; build passou. `index.399e022d.js` / `index.e981fa67.css`, recarregar `?v=399e022d#/assistant/atlas`; conserva `b84cf63f` e `0d4261e1`. Somente CSS e fixture; sem SQL, restart de backend, alteração de memória ou envio WhatsApp. Aceite pendente. [Diagnóstico e memória atual](referencias/atlas-rolagem-memoria-2026-10-09.md) · [Release](evidencias/releases/atlas-rolagem-2026-10-09.json).

**09/10/2026, 07:55 — Ondas fluidas e transcrição de grupos PUBLICADAS.** Pedido explícito de Josias; SSH recuperado. `index.b84cf63f.js` / `index.80dfcb02.css`, recarregar `?v=b84cf63f#/assistant/atlas`; assets anteriores preservados. SQL `20261009043258` aplicado uma vez. Worker ativo no candidato `atlas-fluid-audio-20261009-01`, transcrição ligada (janela inicial de 24 h); oito áudios reais concluídos e consultados com origem pelo Atlas, outro usuário sem acesso. 48 testes e build no candidato passaram. Sem WhatsApp/CAPI ou escrita operacional. Aceite visual e teste da nova animação em ligação real pendentes. Esta atualização substitui os avisos anteriores de publicação/SSH pendentes. [Referência](referencias/atlas-ondas-audios-producao-2026-10-09.md) · [Release](evidencias/releases/atlas-ondas-audios-producao-2026-10-09.json).

**09/10 — Nova tentativa visual local:** Josias considerou os anéis anteriores artificiais. A animação foi refeita com superfícies de luz sobrepostas, curvas suaves e resposta de áudio amortecida, atrás do globo. Prévia conferida, build e sete testes pertinentes passaram. Aceite visual pendente; publicação continua pendente de SSH. [Detalhes](referencias/atlas-ondas-audios-2026-10-09.md).

**09/10/2026 — Alteração LOCAL, ainda não publicada.** `atlasWaveform.js` + medidores input/output → `AtlasOrbit`; `atlasAgentActivity` agrega missões. `atlasGroupAudio.js` + `scripts/atlas-audio-worker.mjs` integrados ao worker existente. SQL novo `20261009043258_atlas_group_audio_transcripts.sql`: transcrições privadas, fila com lease, RLS, RPCs invoker só service_role e FK com cascade na mensagem original. `atlasManagerContext` anexa origem/trecho e permite paginação de áudio longo. `AtlasGroupTranscripts` mostra texto em Atendimento. Não usar bundle local como substituto da fonte remota; reconciliar a alteração pequena em `AtendimentoThread.jsx` antes de publicar. [Referência](referencias/atlas-ondas-audios-2026-10-09.md) · [Release local](evidencias/releases/atlas-ondas-audios-local-2026-10-09.json).

**09/10/2026 — Atlas: fila, memória e acompanhamento.** `atlas-chat` responde/enfileira; `scripts/atlas-worker.mjs` executa duas missões simultâneas, lease, consultas RLS e conclusão+inbox transacional. `_shared/atlasManager.js`, `atlasManagerContext.js`, `atlasMonitor.js`, `atlasSeed.js`; `AtlasInbox`/`useAtlasInbox` integrados em Minha caixa/lateral. SQL `20261009030813` e `20261009032640`; novos `atlas_jobs`, `atlas_inbox`, `atlas_worker_state` e RPCs privados. Worker systemd `planeje-atlas.service`, candidato da release `/root/planeje-atlas-releases/atlas-manager-20261009-01`. Operação lida como proprietário autenticado, segredos só no servidor. Limites: conversa 35 s; missão 150 s/16 chamadas/24 ferramentas; fila independente da edge. [Referência](referencias/atlas-gerente-2026-10-09.md) · [Release](evidencias/releases/atlas-gerente-producao-2026-10-09.json).

**08/10/2026 — Atlas publicado.** `AtlasPage`, `components/atlas/*`, `atlasApi.js`, entrada privada `AtlasEntry`; rota/layout integrados seletivamente. Edges `atlas-chat` e `atlas-voice`, compartilhados `_shared/atlas{Core,Context,SkillCatalog,VoiceConfig}.js`; tabelas privadas `atlas_*`, SQL `20261009004301`. `atlas-chat` tem ação `progress`, consultada durante o pedido por request_id, sempre com gate e RLS. Voz WebRTC com VAD, ferramenta `consult_atlas`, saudação inicial e áudio de resposta; `atlasAudioMeter.js` lê amplitude dos dois fluxos sem gravar áudio. Limite do chat 45 s, abaixo do worker produtivo de 60 s. [Mapa e limites](referencias/atlas-2026-10-08.md).

## Cérebro IA — primeira versão — 08/10/2026

- Mapa do que foi reaproveitado: `docs/continuidade-planeje/referencias/cerebro-ia-2026-10-08.md`.
- Regra: `src/lib/cerebroCore.js`. Leitura e gravação: `src/lib/cerebroApi.js`. Tela: `src/components/pages/CerebroPage.jsx` em `#/assistant/cerebro`.
- SQL aplicado uma vez: `supabase/migrations/20261008220000_cerebro_ia.sql`. Bundle vigente `index.a72afcd0.js`. A consulta ordena por `tarefas.created_at`.
- Teste: `node scripts/cerebro.test.mjs`.
- Sem bundle, sem cron, sem chamada de modelo, sem CAPI, nenhuma mensagem WhatsApp enviada.

## Reação WhatsApp não conta Aguardando — 08/10/2026

- uazapi manda `message.type=reaction` / `messageType=ReactionMessage`, `message.reaction` = id da fala, `content.key.ID`.
- UI: `extractReactionEventFromInboxRow` some a bolha e cola o emoji na mensagem alvo (`index.991ce0fb.js`).
- Webhook: reação não soma não lida, não troca preview, zera `awaiting_response_since`.
- Teste: `node scripts/atendimentoReaction.test.mjs`.

## Confirmação do cliente no grupo — 08/10/2026

- Regra: `supabase/functions/_shared/atendimentoClientAck.js` (`isClientAcknowledgment`). Teste: `node scripts/atendimentoClientAck.test.mjs`.
- `atendimento-group-analyze`: contato Pede resposta + ack → `needs_agency_response=false`, zera `awaiting_response_since`; se estava em Aguardando, vai para Em atendimento (com responsável) ou Resolvidos.
- `uazapi-inbox-webhook`: no grupo, ack não reabre Resolvidos.
- Sem SQL. Funções em `/opt/supabase-planeje/volumes/functions/` + restart `supabase-edge-functions`. Bundle intocado.

## Cliente publica — 08/10/2026

- Cadastro: `clientes.postagem_do_cliente` em `ClientForm.jsx` (checkbox **O cliente publica**). Grava via `clienteSave.js`.
- Canal: status `client_posts` em `task_channel_publications` (`clientPostsFields`, `DONE_PUBLICATION_STATUSES`). Botão em `TaskPublicationsPanel.jsx`.
- Conclusão: `contentSocialArchiveBlockers(..., { clientPosts })` e SQL `content_ready_for_social_archive` (flag do cliente OU published com URL / `client_posts`, sem pendente). RPC `move_task_to_social_media` e os guards de conclusão usam essa função.
- Teste: `node scripts/taskChannelPublications.test.mjs`.
- SQL: `supabase/migrations/20261008180000_postagem_do_cliente.sql` uma vez.
- Bundle `index.51fe723a.js` / `index.992098f3.css`, recarregar `?v=51fe723a`. Conserva `index.66b697ef.js`.

## Atendimento nas Páginas Permitidas do login — 06/10/2026

- UI: Super Admin → Equipe e acesso → Usuários de cliente → Gerenciar Login → Permissões → Páginas Permitidas. Checkbox Atendimento (ícone Headphones + rótulo) em `ClientUserManager.jsx`, mesma lista de Dashboard / Status / ApexIA / PGM / CRM.
- Chave: `atendimento` em `profiles.allowed_pages` (`src/lib/clientAllowedPages.js`). Nulo = páginas clássicas; Atendimento só com a chave, salvo a Ápice (`hasAtendimentoPagePermission` em `atendimentoLojaAcesso.js`).
- Gate menu/rota: `clientHasPageAccess` + `canSeeAtendimentoPreview` (SidebarCliente, BottomNavCliente, ProtectedClientPageRoute). Sem tick, a loja não vê Atendimento.
- Envio: `uazapi-send-message` lê `allowed_pages`; loja só envia se a página estiver permitida e o destino for contato do mesmo `cliente_id` do perfil no servidor. Equipe interna intacta.
- Cartão Atendimento da loja saiu de Gerenciar módulos. A chave `atendimento_loja` em `CLIENT_STORE_MODULES` fica só para IA/RPC da Ápice (não liga Responder sozinho).
- SQL: `supabase/migrations/20261006210000_atendimento_pagina_permitida.sql` uma vez (UPDATE de arrays da Ápice: 0 linhas).
- Testes: `scripts/clientAllowedPages.test.mjs`, `atendimentoPreviewGate.test.mjs`, `atendimentoPreviewSendAuth.test.mjs`, `atendimentoLojaAcesso.test.mjs`, `moduleManagementConfig.test.mjs`, `atendimentoLojaInbox.test.mjs`.
- Bundle `index.5fe0b226.js` / `index.6aa9877b.css`, recarregar `?v=5fe0b226`. Conserva `index.c1b52e96.js`. Funções `_shared/atendimentoLojaAcesso.ts` e `uazapi-send-message` republicadas.

## Módulo Atendimento da loja — 06/10/2026 (substituído no mesmo dia)

- Interruptor em Gerenciar módulos (`atendimento_loja` / `client_module_permissions`) foi o caminho anterior. O pedido do usuário passou a ser Páginas Permitidas. SQL `20261006140000` permanece no banco; a UI do cartão saiu. Bundle antigo `index.8d92335a.js`. Conserva `index.6af8bb7e.js`.

<!-- agencia-financeiro-20261003:start -->
## Financeiro da agência — 03/10/2026

- Tela: `src/components/pages/AgenciaFinanceiroPage.jsx` (`#/financeiro`). Lateral e busca: `Sidebar.jsx`, `CommandPalette.jsx`.
- Regras: `src/lib/agenciaFinanceiro.js`. Teste: `node scripts/agenciaFinanceiro.test.mjs`.
- Ficha: `ClientForm.jsx` + `clienteSave.js` (`dia_cobranca`).
- SQL: `supabase/migrations/20261003120000_agencia_financeiro.sql` (`agencia_fin_categorias`, `agencia_fin_lancamentos`, `clientes.dia_cobranca`). RLS só admin/superadmin.
<!-- agencia-financeiro-20261003:end -->

<!-- mcp-dossie-paginas-20261002:start -->
## MCP 2.4.0 — dossiê do cliente e páginas — 02/10/2026

- Serviço: `planeje-mcp` (PM2), versão 2.4.0, endpoint `https://mcp.planeje.jbapex.com.br/mcp`.
- Código: `planeje-mcp/src/clienteDossie.ts`, `hubCatalog.ts`, `hubTools.ts` (`ver_cliente`, `listar_projetos`, leitores de `ler_aba`).
- Teste: `npx tsx planeje-mcp/scripts/test-hub-catalog.mjs` (53 abas). Sem SQL. Sem bundle.
<!-- mcp-dossie-paginas-20261002:end -->

<!-- indicadores-colaborador-20261001:start -->
## Indicadores do mês por colaborador — 01/10/2026

- Regra pura: `src/lib/collaboratorIndicators.js` (`computeCollaboratorIndicators`, `effectiveDeadline`, `firstStageDelivery`, `stageRounds`). Teste: `scripts/collaboratorIndicators.test.mjs`.
- Leitura: `src/lib/collaboratorIndicatorsData.js`, que pagina de 1.000 em 1.000.
- Tela: `src/components/pages/PerformanceReport.jsx` (`#/reports`). Configurar: `src/components/reports/CollaboratorIndicatorsSettings.jsx`. `TaskDelayReport` segue no fim da página.
- Tarefa de vídeo/reels: `src/components/tasks/details/TaskRecordingControl.jsx` dentro de `TaskDetailsTab.jsx`.
- SQL `20261001170000_indicadores_colaborador.sql`: `tarefas.recording_scheduled_on`, `task_deadline_changes` com o gatilho `zz_tarefas_log_deadline_change`, `task_rework_events`, `client_result_goals`, `collaborator_indicator_profiles`, `indicator_month_snapshots`, `planeje_private.take_indicator_snapshot`, RPC `capture_indicator_snapshot` (só admin) e cron `planeje-indicadores-cobertura-dia1` / `planeje-indicadores-fechamento`.
- Bundle `index.a8165bf3.js` / `index.a5c65a82.css`, recarregar `?v=a8165bf3`. Publicado no mesmo bundle do Relatório Google (canal) às 12:31; esse deploy não deixou `index.4b9989fc.js` nem backup do `index.html`.

<!-- indicadores-colaborador-20261001:end -->

<!-- atendimento-loja-ia-designer-20260929:start -->
## Designer do agente em página inteira (Ápice) — 29/09/2026

- UI: `IaAgentesTab.jsx` + `AtendimentoLoja.css` (`.atl-designer`): overlay de tela cheia, stepper 1–6, cards, empty dashed, Voltar/Avançar.
- Etapas: Perfil, Comportamento, Conhecimento, Habilidades (transfer + follow-up), Fluxo (perguntas como etapas), Conversa e ativação (auto_responder + teste).
- Bundle: `index.ce127164.js` / `index.72287d15.css`, recarregar `?v=ce127164`. Conserva `index.205666ce.js`.
- Sem SQL, sem republicar funções, sem CAPI, sem WhatsApp enviado.

<!-- atendimento-loja-ia-designer-20260929:end -->

<!-- atendimento-loja-ia-followup-20260929:start -->
## Editor do agente em abas e follow-up (Ápice) — 29/09/2026

- UI: `IaAgentesTab.jsx` — abas Perfil / Fluxo / Follow-up / Conhecimento.
- Prompt: `atendimentoIaPrompt.js` (uma pergunta; nome do WhatsApp; sem nicho inventado; sem ligação; `textoEnviadoParaHistorico`).
- Follow-up: `atendimentoIaFollowup.js` + colunas `ia_followup_*`; disparo em `atendimento-planejamento-scheduler`.
- Testes: `scripts/atendimentoIaPrompt.test.mjs`, `atendimentoIaFollowup.test.mjs`, `atendimentoIaAuto.test.mjs`, `atendimentoLojaInbox.test.mjs`.
<!-- atendimento-loja-ia-followup-20260929:end -->

<!-- atendimento-loja-lista-conversas-20260929:start -->
## Lista Conversas da Ápice — 29/09/2026

- UI: `ClienteAtendimentoPage.jsx` lê `cliente_whatsapp_contact` + inbox/sent; poll 10 s.
- Webhook: `jidParaContatoLoja` / `ensureLojaAtendConversa` em `atendimentoLojaInbox.js` + `lojaIaAutoReply.ts` — contato 1:1 e ficha **antes** da IA, inclusive `fromMe`.
- Teste: `scripts/atendimentoLojaInbox.test.mjs`.
<!-- atendimento-loja-lista-conversas-20260929:end -->

<!-- atendimento-loja-ia-auto-20260929:start -->
## Interruptor Responder sozinho (Ápice) — 29/09/2026

- UI: `IaAgentesTab.jsx` — coluna Responder sozinho grava `cliente_atend_ia_agentes.auto_responder` (só admin da loja).
- Decisão: `supabase/functions/_shared/atendimentoIaAuto.js` (`decidirAutoResposta`); teste `scripts/atendimentoIaAuto.test.mjs`.
- Webhook: `uazapi-inbox-webhook/lojaIaAutoReply.ts` — saída imediata se não for Ápice; se ligado, `atendimento-ia` + `uazapi-send-message`.
- SQL: `20260929140000_cliente_atend_ia_auto_log.sql` uma vez (log `acao = responder`; coluna do interruptor já existia).
<!-- atendimento-loja-ia-auto-20260929:end -->

<!-- mini-crm-filtro-origem-20260924:start -->
## Filtro de origem no Mini CRM — 24/09/2026

- UI: `MiniCrmPage.jsx` — select Origem (Todos / Meta Ads / Outras / Não rastreados se liberado); `scopedRows` esconde `originBucket === 'off'` para papel `cliente` sem flag.
- Flag: `clientes.mini_crm_show_untracked`; toggle só em `ClientUserManager.jsx` (aba Mini CRM, papel `superadmin`).
- SQL: `supabase/migrations/20260924151500_mini_crm_show_untracked.sql` uma vez; trigger bloqueia escrita sem superadmin.
<!-- mini-crm-filtro-origem-20260924:end -->

<!-- fotos-clientes-20260924:start -->
## Fotos dos clientes — 24/09/2026

- Helper: `src/lib/publicStorageUrl.js` (`rewritePublicStorageUrl`).
- UI: `src/components/ui/avatar.jsx`, sidebar do cliente, lista, ficha, SelectClient, ApexIA, Redes.
- Miniaturas de anúncio: `rewriteStoredThumbUrl` chama o mesmo helper antes do `v=q2`.
- SQL: `supabase/migrations/20260924150000_rewrite_cloud_logo_urls.sql` uma vez.
- Testes: `scripts/publicStorageUrl.test.mjs`, `scripts/adThumbnail.test.mjs`.
<!-- fotos-clientes-20260924:end -->

<!-- rastreamento-analysis-labels-20260923:start -->
## Etiquetas de análise — 23/09/2026

- Helpers: `src/lib/rastreamentoAnalysisLabels.js`, persistência `src/lib/persistAnalysisLabels.js` (`tracking_data.planeje_labels`).
- UI: `LeadAnalysisLabels.jsx` na coluna Etiqueta de `ContatosPage.jsx`, na ficha (`RastreamentoLeadFicha.jsx`) e na tabela do Relatório (`CrmRelatorioMeta.jsx`). Cartões, filtro e colunas Não responde / Desqualificado no Relatório. A ficha junta Qualificado/Comprou/valor (`LeadComercialInline`) e etiqueta na faixa Marcar; o quadro ocupa quase a tela.
- CAPI: `withoutAnalysisLabels` em `rastreamentoConversionRules.js` e `applyRastreamentoConversionRules.js`; webhook `uazapi-inbox-webhook/applyRastreamentoConversion.ts` ignora Não responde / Desqualificado.
- Testes: `scripts/rastreamentoAnalysisLabels.test.mjs`. Sem SQL.
<!-- rastreamento-analysis-labels-20260923:end -->

<!-- relatorio-social-paginas-20260923:start -->
## Relatório de redes — 23/09/2026

- Slides: `buildSocialSlides` em `src/lib/trafficSocialReport.js` parte as publicações de 3 em 3 (`SOCIAL_POSTS_PER_PAGE`).
- Instagram: `instagramNewFollows` lê `follows_and_unfollows`; `websiteClicks` é o Link na bio.
- Facebook: `get-page-audience` em `meta-ads-api` pede `page_follows_city` e `page_follows_country`.
- Tela: `TrafficPerformanceReport.jsx` e o CSS `.is-social-posts`.
<!-- relatorio-social-paginas-20260923:end -->

<!-- capi-leadsubmitted-resend-20260923:start -->
## Reenvio da conversa iniciada — 23/09/2026

- UI: botão na ficha (`RastreamentoLeadFicha.jsx`) e Reenviar em `RastreamentoEventosMeta.jsx` para `LeadSubmitted` com `ctwa_clid`.
- Regra: `leadSubmittedSendState` / `canRetryEvento` em `rastreamentoLeadFicha.js` e `rastreamentoEventosMeta.js`. Envio por `sendMetaConversionForComercialChange`.
- Webhook: `applyRastreamentoConversion.ts` só considera LeadSubmitted já enviado quando houve **sucesso**.
- Função: `meta-ads-api` `send-ctwa-conversion` — `LeadSubmitted` não duplica se já houve sucesso; `eventTime` da primeira mensagem (máx. 7 dias).
- Testes: `scripts/rastreamentoLeadFicha.test.mjs`, `rastreamentoEventosMeta.test.mjs`, `rastreamentoHub.test.mjs`. Sem SQL.
<!-- capi-leadsubmitted-resend-20260923:end -->

<!-- traffic-report-pdf-tela-20260923:start -->
## PDF no tamanho do slide — 23/09/2026

- PDF: `src/lib/trafficPerformanceReportPdf.js`. A página segue `getBoundingClientRect` do `.tr-slide`.
- Personalização: `src/lib/trafficReportEditor.js`, gravada em `localStorage`. Sem SQL.
- Teste: `scripts/trafficPerformanceReport.test.mjs`.
<!-- traffic-report-pdf-tela-20260923:end -->

<!-- mcp-hub-abas-20260923:start -->
## MCP 2.2.0 — Relatório e Google dados — 23/09/2026

- Serviço: `planeje-mcp` (PM2), versão 2.2.0, endpoint `https://mcp.planeje.jbapex.com.br/mcp`.
- Código: `planeje-mcp/src/hubCatalog.ts`, `hubTools.ts` (`loadRelatorio`, `loadFillHistory`, `loadGoogleData`, `sanitizeDispatch`).
- Teste: `planeje-mcp/scripts/test-hub-catalog.mjs`. Sem SQL.
<!-- mcp-hub-abas-20260923:end -->

<!-- google-data-boards-20260923:start -->
## Abas Analytics e Tag Manager — 23/09/2026

- UI: abas em `GoogleAdsInsights.jsx`; painéis `GoogleAnalyticsBoard.jsx` e `GoogleTagBoard.jsx`.
- Leitura: `google-data-api` (`get-analytics-overview`, `get-tagmanager-overview`).
- Mapa: `src/lib/googleDataInsightsView.js`.
- Teste: `scripts/googleDataAgency.test.mjs`. Sem SQL novo.
<!-- google-data-boards-20260923:end -->

<!-- traffic-performance-report-20260923:start -->
## Relatório de performance — 23/09/2026

- UI: `TrafficPerformanceReport.jsx` em `#/paid-traffic/relatorio`.
- Regra: `buildPerformanceReport` em `src/lib/trafficPerformanceReport.js`. Meta por `get-campaign-insights` e `get-ad-insights`. Foto por `get-ad-by-id`: `largeCreativeThumbnailUrl` pede 1080×1920 no criativo e `persistAdThumbnail` grava o arquivo. Texto da `traffic_weekly_reviews`. Vendas de `crm_vendas`. Sem SQL novo.
- Teste: `scripts/trafficPerformanceReport.test.mjs`.
<!-- traffic-performance-report-20260923:end -->

<!-- traffic-sheet-column-order-20260923:start -->
## Ordem das colunas — 23/09/2026

- UI: o título em `TrafficCampaignMetrics.jsx` arrasta ou usa seta esquerda/direita.
- Regra: `reorderSheetMetrics` em `src/lib/trafficSheetLayout.js`. Grava com `save_traffic_sheet_metrics`, que já conserva a ordem do array. Sem SQL novo.
- Teste: `scripts/trafficSheetLayout.test.mjs`.
<!-- traffic-sheet-column-order-20260923:end -->

<!-- traffic-routine-fill-dates-20260923:start -->
## Datas do preenchimento — 23/09/2026

- UI: bloco “Quando foi preenchido” em `TrafficWeeklyRoutine.jsx`. O cartão da lista acrescenta “alterada” ao prazo.
- Regra: `reviewFillView` e `displayStamp` em `src/lib/trafficWeeklyReview.js`. Lê `traffic_weekly_history` (início e fim). Sem SQL novo.
- Teste: `scripts/trafficWeeklyReview.test.mjs`.
<!-- traffic-routine-fill-dates-20260923:end -->

<!-- traffic-routine-autosave-20260923:start -->
## Autosave da Rotina — 23/09/2026

- UI: `TrafficWeeklyRoutine.jsx` (`ReviewDialog`), status no rodapé.
- Regra: `reviewAutosavePlan` / `reviewAutosaveLabel` em `src/lib/trafficWeeklyReview.js`.
- Grava `save_traffic_weekly_review` com `p_finalize` falso. Sem SQL novo.
- Teste: `scripts/trafficWeeklyReview.test.mjs`.
<!-- traffic-routine-autosave-20260923:end -->

<!-- google-data-20260921:start -->
## Google dados — 21/09/2026

- UI: `GoogleDataAgencySettings.jsx` (`#/settings/google-dados`), `ClientGoogleDataLinksManager.jsx`, `GoogleDataOverview.jsx`, `RastreamentoGoogleData.jsx`.
- Libs: `googleDataAgency.js`, `googleDataInsightsView.js`.
- Função: `google-data-api`.
- SQL: `20260921180000_cliente_google_data_links.sql`. Não reaplicar.
- Teste: `scripts/googleDataAgency.test.mjs`.
<!-- google-data-20260921:end -->

<!-- traffic-google-ads-keyword-explorer-20260921:start -->
## Palavras tendências Explorer — 21/09/2026

- UI: `GoogleAdsInsights.jsx` (aviso Explorer + tabela 30 dias).
- Lib: `googleAdsKeywordTrends.js` (`plannerAccessCopy`, `sortAccountKeywordStats`).
- Função: `google-ads-api` (`generate-keyword-ideas` código `PLANNER_EXPLORER`; `get-keywords` com `includeMetrics`).
- Teste: `scripts/googleAdsKeywordTrends.test.mjs`. Sem SQL.
<!-- traffic-google-ads-keyword-explorer-20260921:end -->

<!-- traffic-google-ads-keyword-trends-20260921:start -->
## Palavras tendências — 21/09/2026

- UI: `GoogleAdsInsights.jsx` (bloco Palavras tendências), `GoogleAdsInsights.css`.
- Lib: `googleAdsKeywordTrends.js`.
- Função: `google-ads-api` (`generate-keyword-ideas`, Brasil `geoTargetConstants/2076`, português `languageConstants/1014`).
- Teste: `scripts/googleAdsKeywordTrends.test.mjs`. Sem SQL.
<!-- traffic-google-ads-keyword-trends-20260921:end -->

<!-- traffic-google-ads-dashboard-20260921:start -->
## Barrinha Google no Dashboard — 21/09/2026

- UI: `TrafegoCarteiraDashboard.jsx` (`AccountSpend` / `GoogleSpendBar` / `.trafego-spend-stack`).
- Lib: `googleAdsDashboard.js` (`googleDashboardBar`, `loadGoogleDashboardForClient`), `trafegoDashboard.js` (`hasGoogle`), `trafegoTabCache.js` (`dashboard:v6`).
- Logos: `/logos/meta ads.webp`, `/logos/google ads.png`.
- Teste: `scripts/googleAdsDashboard.test.mjs`. Sem SQL. Função `google-ads-api` `get-campaigns` já existente.
<!-- traffic-google-ads-dashboard-20260921:end -->

<!-- mcp-hub-abas-20260921:start -->
## MCP hub de abas — 21/09/2026

- Serviço: `planeje-mcp` (PM2), versão 2.1.0, endpoint `https://mcp.planeje.jbapex.com.br/mcp`.
- Código: `planeje-mcp/src/hubCatalog.ts`, `hubTools.ts`, `access.ts`; registro em `tools.ts`.
- Teste: `planeje-mcp/scripts/test-hub-catalog.mjs`. Sem SQL.
<!-- mcp-hub-abas-20260921:end -->

<!-- social-keep-last-snapshot-20260921:start -->
## Cache da última verificação social — 21/09/2026

- Lib: `socialSnapshotCache.js` (não apaga no TTL; `planOverviewRefresh` não busca se `liveMeta` é falso).
- UI: `ClientOverview.jsx`, `ClientSocialProfile.jsx`, `InstagramInsightsView.jsx`, `PageInsightsView.jsx`, `SocialMedia.jsx`.
- Teste: `scripts/socialSnapshotCache.test.mjs`. Sem SQL.
<!-- social-keep-last-snapshot-20260921:end -->

<!-- social-overview-meta-check-20260921:start -->
## Conferência Meta na Visão Geral — 21/09/2026

- UI: `SocialMedia.jsx` (status `checking`/`connected`/`disconnected`; timeout não descarta sucesso).
- Lib: `metaConnectionStatus.js` (`limited` para Graph `#4`), `clienteSocialAccounts.js` (`chunkIds`).
- UI: `ClientOverview.jsx` (faixa de conferência; lista por `clientIdsKey`).
- Teste: `scripts/metaConnectionStatus.test.mjs`. Sem SQL.
<!-- social-overview-meta-check-20260921:end -->

<!-- meta-pixel-por-conta-20260921:start -->
## Pixel da conta de anúncio — 21/09/2026

- UI: `RastreamentoMetaManual.jsx` (Pixel/Página após marcar conta).
- Lib: `rastreamentoMetaManual.js` (`assetsForSelectedAccounts`, `pixelSelectPlaceholder`).
- Função: `meta-ads-api/clienteMetaManual.ts` (`discoverAccountDestinations`: `adspixels`, `promote_pages` / `assigned_pages`).
- Teste: `scripts/rastreamentoMetaManual.test.mjs`. Sem SQL.
<!-- meta-pixel-por-conta-20260921:end -->

<!-- meta-token-reuse-20260921:start -->
## Reaproveitar token Meta da mesma BM — 21/09/2026

- UI: `RastreamentoMetaManual.jsx` (bloco **Usar este token**), `RastreamentoHub.css` (`.meta-manual-reuse`).
- Lib: `rastreamentoMetaManual.js` (`groupMetaTokenSources`, `reuseMetaCredentialPatch`), `metaCtwaClientToken.js`.
- Função: `meta-ads-api/clienteMetaManual.ts` (`list-cliente-meta-token-sources`, `reuse-cliente-meta-token`). Copia `META_CTWA_CLIENT_*` no servidor; não devolve o token; não copia Pixel/Página/contas.
- Teste: `scripts/rastreamentoMetaManual.test.mjs`. Sem SQL.
<!-- meta-token-reuse-20260921:end -->

<!-- traffic-kpi-orcamentos-20260921:start -->
## Orçamentos e Lead qualificado na Rotina — 21/09/2026

- Lib: `trafficSheetLayout.js` (presets `orcamentos` / `lead_qualificado`), `trafficWeeklyReview.js`, `trafficSheetGrid.js`.
- SQL: `20260921140000_traffic_sheet_quotes_qualified.sql`. Não reaplicar.
- Teste: `scripts/trafficSheetLayout.test.mjs` (material de construção).
<!-- traffic-kpi-orcamentos-20260921:end -->

<!-- traffic-kpi-por-cliente-20260921:start -->
## KPI por cliente na Rotina — 21/09/2026

- UI: `TrafficWeeklyRoutine.jsx` (presets + colunas), `TrafficCampaignMetrics.jsx`, `TrafficWeeklyRoutine.css`.
- Lib: `trafficSheetLayout.js` (`RESULT_KPI_PRESETS`, `sheetMetricOptions`, `inferSheetMetrics`), `trafficWeeklyReview.js` (campos `simulacoes`/`cpf_bom`/`compras`), `trafficSheetGrid.js` (colar TSV).
- SQL: `20260921120000_traffic_sheet_extra_kpis.sql` (`traffic_routine_campaign_metrics`, `save_traffic_sheet_metrics`). Não reaplicar.
- Testes: `scripts/trafficSheetLayout.test.mjs`, `scripts/trafficSheetGrid.test.mjs`, `scripts/trafficWeeklyReview.test.mjs`, `scripts/test-trafego-rotina.mjs`.
<!-- traffic-kpi-por-cliente-20260921:end -->

<!-- ig-schedule-hold-20260921:start -->
## Instagram agenda no Planeje — 21/09/2026

- UI: `ContentPublisher.jsx` (Agendar IG grava, não chama Meta), `TaskPublicationsPanel.jsx`.
- Lib: `scheduleSocialComposer.js` (tarefa em `todo`; publicação `scheduled`), `publishChannelToMeta.js` (`holdInstagramPublication`).
- SQL: `20260921090000_social_publish_queue.sql` (`meta_dispatch`). Não reaplicar.
- Função: `supabase/functions/social-publish-scheduler/index.ts` (cron a cada minuto).
- Testes: `scripts/scheduleSocialComposer.test.mjs`, `scripts/metaInstagramSchedule.test.mjs`.
<!-- ig-schedule-hold-20260921:end -->

<!-- redes-reel-preview-phone-20260921:start -->
## Pré-visualização do Reels no celular — 21/09/2026

- UI: `ContentPublisher.jsx` / `ContentPublisher.css` (celular 9:16, pastilha da capa, overlays do Reels).
- Lib: `composerVideoPreview.js` (`composerCoverChip`, `composerPhonePoster`).
- Sem SQL. Teste: `scripts/composerVideoPreview.test.mjs`.
<!-- redes-reel-preview-phone-20260921:end -->

<!-- redes-reel-preview-capa-20260921:start -->
## Preview do Reels e capa — 21/09/2026

- UI: `ContentPublisher.jsx` / `ContentPublisher.css` (play no celular, still 9:16, slider de frame).
- Lib: `composerVideoPreview.js`.
- Sem SQL. Teste: `scripts/composerVideoPreview.test.mjs`.
<!-- redes-reel-preview-capa-20260921:end -->

<!-- redes-ficha-foto-20260920:start -->
## Foto da ficha no calendário — 20/09/2026

- UI: `SocialClientBoard.jsx` (`ClientPhoto` com `onError` e `referrerPolicy=no-referrer`).
- Lib: `clienteSocialAccounts.js` (`clientBoardPhotoUrls`).
- Sem SQL. Teste: `scripts/clienteSocialAccounts.test.mjs`.
<!-- redes-ficha-foto-20260920:end -->

<!-- redes-semana-colunas-20260920:start -->
## Semanal em colunas — 20/09/2026

- UI: `SocialPlanner.jsx` (colunas + cartão de semana), `SocialWorkspace.css`.
- Lib: `socialPlannerItems.js` (`targetDayInWeek`).
- Sem SQL. Teste: `scripts/socialPlannerItems.test.mjs`.
<!-- redes-semana-colunas-20260920:end -->

<!-- redes-calendario-editorial-20260920:start -->
## Calendário por cliente em Redes Sociais — 20/09/2026

- UI: `SocialMedia.jsx`, `SocialClientBoard.jsx`, `SocialPlanner.jsx`, `SocialPostHover.jsx`, `SocialWorkspace.css`.
- Lib: `socialPlannerItems.js` (`plannerStatusMeta`, `movePlannerItemToDay`, busca e contagens).
- Sem SQL. Teste: `scripts/socialPlannerItems.test.mjs`.
<!-- redes-calendario-editorial-20260920:end -->

<!-- meta-ig-sem-agenda-20260920:start -->
## Instagram publica na hora — 20/09/2026

- UI: `TaskPublicationsPanel.jsx`, `ContentPublisher.jsx`.
- Lib: `metaInstagramSchedule.js`, `publishChannelToMeta.js`, `metaResumableUpload.js`.
- Edge: `meta-ads-api` (`publish-instagram-content`, `start-ig-resumable-upload`) sem `scheduled_publish_time`.
- Sem SQL. Teste: `scripts/metaInstagramSchedule.test.mjs`.
<!-- meta-ig-sem-agenda-20260920:end -->

<!-- meta-agendar-anexo-20260920:start -->
## Agendar na Meta usa o anexo da tarefa — 20/09/2026

- UI: `TaskPublicationsPanel.jsx` (`handlePublish` / `handleSave` passam o anexo).
- Lib: `taskChannelPublications.js` (`hydratePublicationMedia`); `publishChannelToMeta.js`.
- Sem SQL. Teste: `scripts/taskChannelPublications.test.mjs`.
<!-- meta-agendar-anexo-20260920:end -->

<!-- meta-resumable-upload-20260920:start -->
## Vídeo grande na Meta — envio direto — 20/09/2026

- UI: `ContentPublisher.jsx/.css` (progresso; Drive até 1 GB no Reels); `GoogleDrivePickerDialog.jsx` (teto 1 GB no Reels, 40 MB no carrossel).
- Lib: `metaPublishMedia.js` (`shouldUseMetaResumable`, `attachDriveMediaForMeta`); `metaResumableUpload.js`; `publishChannelToMeta.js` (fallback quando a cópia de 40 MB recusa).
- Edge: `google-drive-api` (`file-info`, `read-range`); `meta-ads-api` (`largeMediaUpload.ts`: start/chunk/status/publish IG; start/transfer/finish FB).
- Sem SQL. Testes: `scripts/metaPublishMedia.test.mjs`, `scripts/metaResumableUpload.test.mjs`.
<!-- meta-resumable-upload-20260920:end -->

<!-- redes-sociais-composer-20260920:start -->
## Composer Meta só com conta ligada — 20/09/2026

- UI: `SocialPlanner.jsx` (clientes via `clientsWithMetaAccounts`); `ContentPublisher.jsx/.css` (Postar em com perfil IG/FB).
- Lib: `clienteSocialAccounts.js` (`clientsWithMetaAccounts`).
- Sem SQL. Teste: `scripts/clienteSocialAccounts.test.mjs`.
<!-- redes-sociais-composer-20260920:end -->

<!-- task-publicacoes-thumb-20260920:start -->
## Miniatura na aba Publicações — 20/09/2026

- UI: `TaskPublicationsPanel.jsx` (`MediaPickList` + cartão do canal); `DriveFileThumb.jsx` compartilhado com o seletor.
- Lib: `googleDriveMedia.js` (`driveFileFromAttachment`).
- Sem SQL. Teste: `scripts/googleDriveMedia.test.mjs`.
<!-- task-publicacoes-thumb-20260920:end -->

<!-- drive-picker-maior-voltar-20260920:start -->
## Drive maior e Voltar — 20/09/2026

- UI: `GoogleDrivePickerDialog.jsx` (`max-w-4xl`, botão Voltar que chama `goToBreadcrumb`).
- Sem SQL.
<!-- drive-picker-maior-voltar-20260920:end -->

<!-- drive-picker-thumbs-20260920:start -->
## Miniatura do material no Drive — 20/09/2026

- UI: `GoogleDrivePickerDialog.jsx` (`DriveFileThumb`).
- Lib: `googleDriveMedia.js` (`driveListThumbSrc`).
- Sem SQL. Teste: `scripts/googleDriveMedia.test.mjs`.
<!-- drive-picker-thumbs-20260920:end -->

<!-- drive-pasta-favorita-20260920:start -->
## Pasta favorita do Drive — 20/09/2026

- UI: `GoogleDrivePickerDialog.jsx` (estrela / chip da pasta fixa).
- Lib: `googleDriveMedia.js` (`isPinnableDriveFolderId`, `normalizeDriveFavorite`); `googleDriveClient.js` (`fetchGoogleDriveFavorite`, `setGoogleDriveFavorite`).
- SQL: `20260920020000_cliente_google_drive_favorite.sql` (colunas + RPC) e `20260920030000_fix_cliente_google_drive_favorite_regex.sql` (regex POSIX + UPDATE na conexão existente). Não reaplicar.
- Teste: `scripts/googleDriveMedia.test.mjs`.
<!-- drive-pasta-favorita-20260920:end -->

<!-- task-anexos-lista-20260919:start -->
## Anexos em lista — 19/09/2026

- UI: `TaskAttachmentsTab.jsx` (lista por canal: miniatura `kind=thumb`, nome, Drive/tamanho; player só ao pedir).
- Sem SQL. Testes: `scripts/taskChannelPublications.test.mjs`, `scripts/googleDriveMedia.test.mjs`.
<!-- task-anexos-lista-20260919:end -->

<!-- task-icones-calendario-ajuda-20260919:start -->
## Ícones, calendário e ajuda no ? — 19/09/2026

- UI: `TaskChannelBadges.jsx` (SVG oficial); `TaskPublicationsPanel.jsx` (`Calendar` + `type="time"`); `TaskFieldHelp.jsx` nos detalhes da tarefa.
- Sem SQL. Teste: `scripts/taskChannelPublications.test.mjs`.
<!-- task-icones-calendario-ajuda-20260919:end -->

<!-- task-publicacoes-por-canal-20260920:start -->
## Publicações por canal (arquivo + hora + exclusão) — 19/09/2026

- UI: `TaskPublicationsPanel.jsx` (card por canal: arquivo, calendário+hora, excluir); `TaskAttachmentsTab.jsx` (grupos por canal previsto).
- Lib: `taskChannelPublications.js` (`scheduled_at`, `mediaForChannel`, `combineScheduledDateTime`, `metaScheduleAt` com hora).
- SQL: `20260920010000_publication_schedule_at_and_delete.sql` (coluna `scheduled_at`, DELETE autenticado, FK `ON DELETE SET NULL`). Não reaplicar.
- Teste: `scripts/taskChannelPublications.test.mjs`.
<!-- task-publicacoes-por-canal-20260920:end -->

<!-- task-legenda-visivel-20260919:start -->
## Legenda do post na tarefa — 19/09/2026

- UI: `TaskBriefingForm.jsx` (campo visível **Legenda do post**); `TaskPublicationsPanel.jsx` preenche com `taskPostCaption`.
- Lib: `briefingObrigatorio.js` (`taskPostCaption`: `copy_final` / `legenda` / `plan_material.legenda`).
- Teste: `scripts/test-briefing-obrigatorio.mjs` (6b).
<!-- task-legenda-visivel-20260919:end -->

<!-- task-publicacoes-simples-20260919:start -->
## Publicações da tarefa (Drive-first) — 19/09/2026

- UI: `TaskPublicationsPanel.jsx` (canal IG/FB, data, lista de Anexos/Drive, legenda, Agendar na Meta).
- Libs: `taskChannelPublications.js` (destino/data/mídia), `publishChannelToMeta.js` (`resolvePublicationPublicAsset` + `stage-for-meta`), `googleDriveMedia.js` (`publicationNeedsDriveStaging`).
- Testes: `scripts/taskChannelPublications.test.mjs`, `scripts/googleDriveMedia.test.mjs`.
- Sem SQL. Cópia temporária da Meta continua `20260919220000` (não reaplicar).
<!-- task-publicacoes-simples-20260919:end -->

<!-- google-drive-media-20260919:start -->
## Google Drive no anexo — 19/09/2026

- Lib: `src/lib/googleDriveMedia.js`, `googleDriveClient.js` (`uploadGoogleDriveResumable`).
- UI: `GoogleDrivePickerDialog.jsx` (Enviar para o Drive com progresso).
- API: `google-drive-api` — `upload-session`, PUT `action=upload-put`, stream, `sync-file` (só vínculo).
- Coluna `task_attachments.source_url`. Bucket `task-drive` existe; anexo/envio do Drive não grava mídia nele. SQL `20260919210000` (não reaplicar).
- Testes: `scripts/googleDriveMedia.test.mjs`.
<!-- google-drive-media-20260919:end -->

<!-- ad-thumbnails-20260919:start -->
## Miniatura de anúncio — 19/09/2026

- Lib: `src/lib/adThumbnail.js` (`enlargePreviewUrl`, cache `v=q2`). Persistência: `supabase/functions/_shared/persistAdThumbnail.ts` (substitui arquivo < 8 KB). `get-ad-by-id` prefere `image_url` e, em vídeo, `bestVideoPreviewUrl`.
- Tabela `meta_ad_thumbnails`; bucket público `ad-thumbnails` (limite 2 MB). UI: ficha em coluna com altura `min(92vh, 52rem)`; criativo 9:16 dentro do card de atendimento (`#e8eef4`); balões da equipe `#c4b5fd`; conversa com `overflow: auto`.
- Testes: `scripts/adThumbnail.test.mjs`, `rastreamentoLeadFicha.test.mjs`. SQL `20260919190000` e `20260919194500` (não reaplicar).
<!-- ad-thumbnails-20260919:end -->

<!-- google-drive-agency-20260919:start -->
## Google Drive da agência — 19/09/2026

- UI: `#/settings/google-drive` (`GoogleDriveAgencySettings.jsx`), card em Configurações → Integrações, atalho na paleta.
- Libs: `googleDriveAgency.js`, `googleDriveClient.js` (`oauth-config`).
- API: `google-drive-api` — `oauth-config` (superadmin, sem `cliente_id`), `get-auth-url`/`status` exigem Client ID **e** Secret.
- Segredos em `app_secrets` via tela (mesmo padrão da Meta). Sem SQL nova.
<!-- google-drive-agency-20260919:end -->

<!-- redes-sociais-meta-20260919:start -->
## Redes Sociais + Meta — 19/09/2026

- UI: `SocialMedia.jsx` (aba Perfil e feed), `ClientSocialProfile.jsx/.css`, `ContentPublisher.jsx/.css` (composer 2 colunas + prévia), `ClientSocialAccountsManager.jsx` no `ClientForm`, botões Meta em `TaskPublicationsPanel.jsx`.
- Libs: `clienteSocialAccounts.js`, `socialFeedReview.js`, `publishChannelToMeta.js`, `metaPublishMedia.js`, `taskChannelPublications.js` (`meta_post_id`).
- API: `meta-ads-api` — `get-page-profile`, `get-page-insights` (métricas atuais + token da página), `get-page-posts`, `get-page-post-insights`, `get-instagram-profile`, `get-instagram-media` (REELS), `publish-page-post` (`published=false`), `publish-instagram-content` (IMAGE/REELS/CAROUSEL na hora + cover_url/thumb_offset); `google-drive-api` `stage-for-meta`.
- UI extra: `PageInsightsView.jsx`, `PaidTrafficPanel.jsx`, Visão Geral por canal em `ClientOverview.jsx`; aba Planner em `SocialPlanner.jsx` + `socialPlannerItems.js`.
- Tabela: `cliente_social_accounts`; coluna `task_channel_publications.meta_post_id`; Storage `task-drive/meta-publish-temp/`.
- Teste: `scripts/socialFeedReview.test.mjs`, `scripts/metaPublishMedia.test.mjs`, `scripts/socialPlannerItems.test.mjs`.
<!-- redes-sociais-meta-20260919:end -->

<!-- traffic-production-20260918:start -->
## Tráfego publicado na produção — 18/09/2026

Josias autorizou: “subir para o ambiente real, essas mudanças em tráfego”. Rotina semanal, tabela por campanha/conjunto, colagem, navegação por teclado, histórico e revisão/otimização independentes estão na produção [Rotina semanal](https://planeje.jbapex.com.br/?traffic=964c2d76#/paid-traffic/rotina).

Bundle desta entrega: `assets/index.964c2d76.js`; CSS `assets/index.1677bef5.css`. Dados, pessoas, senhas, configurações e integrações reais foram preservados. Nenhum registro ou responsável do teste foi importado. Recorrências chegam desativadas e são configuradas explicitamente por cliente; abrir a grade não cria tarefa, salvar é a criação explícita.

**Fase 7 permanece parcial.** Esta publicação supera as pendências anteriores de promoção deste recorte de tráfego; os registros de 17–18/09 sobre “somente staging” descrevem o estado anterior. Aceite geral de uso, restante da fase 7 e fase 6 permanecem pendentes. Outros trabalhos de Rastreamento/CAPI conservam suas próprias evidências e pendências.

Ver [promoção do tráfego](referencias/fase-7-promocao-trafego-2026-09-18.md) e [release de produção](evidencias/releases/trafego-producao-2026-09-18.json).

Componentes: `TrafficWeeklyRoutine.jsx/.css`, `TrafficCampaignMetrics.jsx`, `TrafficSheetNameCell.jsx`, `TaskTrafficWeeklyShortcut.jsx`, `CentralTrafegoHoje.jsx`, `CentralTrafegoHojeBoard.jsx`, `GoogleAdsInsights.jsx`. Bibliotecas: `trafficWeeklyReview.js`, `trafficSheetGrid.js`, `trafficSheetLayout.js`, `trafficSheetColumnWidth.js`, `trafficSheetCatalog.js`, `trafficSheetCatalogClient.js`, `googleAdsLinkedAccounts.js`, `trafegoRotina.js`, navegação em `paidTrafficRoutes.js`. Catálogo leve: `meta-ads-api` (`list-campaign-catalog`) e `google-ads-api` (`list-campaign-catalog`) só para conta vinculada; chave `google:{customerId}` não colide com dígitos da Meta. Tabelas: `traffic_weekly_settings/reviews/history/generation_issues`. Coluna `traffic_weekly_settings.sheet_metrics`. Larguras da grade: `localStorage` `planeje.trafficSheet.columnWidths`. O quadro do Hoje lê `traffic_weekly_board` e as tarefas reais. `buildUpcomingWeeklyCards` em `trafegoRotina.js` monta a prévia a partir de `clients` (`next_due_on` / `next_optimization_due_on`) sem criar Tarefa. `useCentralTrafegoHoje` guarda `weeklyClients` no cache `planeje-central-hoje:v2:`. A última análise da Meta no Hoje fica em memória + `planeje-hoje-meta:v4:` (`useTrafegoHojeMeta`, `trafegoHojeCache.js`); `v3` é lido uma vez como incompleto. Busca incompleta não apaga o que já veio; `clientCount` impede reusar fila pela metade. `PaidTraffic.jsx` mantém o Hoje montado na aba (`TabsContent forceMount`, `.hoje-keep-alive`) para o quadro travar na altura da área de trabalho (`overflow: hidden` + colunas em grade); cartões extras rolam em `.hoje-board-col-list`. Cartão da Meta no quadro usa `gestorDo` de `trafegoProximaAcao.js` e oferece Painel + Criar demanda (`CentralTrafegoHojeBoard`); a lista já tinha os dois atalhos. A fila está em `trafegoFazerAgora.js` (`isHardTrafficAction`, `gestorAccountChip`). Contas sem Meta ativa entram em `useTrafegoHojeMeta`. O quadro lê `waitingRowsFromBuckets` em `trafegoRotina.js`. Chip do Dashboard em `trafegoDashboard.js` usa `metaAvailability` (`limited` ≠ `unavailable`). `shouldKeepPreviousMeta` em `trafegoHojeCache.js` conserva gasto no limite da API mesmo com lista de campanha sem insight. `loadClienteMetaResumo` e o Painel passam `previous` ao gravar `meta_resumo`. Cache da aba Dashboard: `dashboard:v4`. Snapshot limitado vazio é stale em 60s (`isMetaSnapshotStale`). Ligar análise/otimização automáticas: `automaticRoutineDrafts` em `trafficWeeklyReview.js` e diálogo em `TrafficWeeklyRoutine.jsx`; lista da Rotina em cartão (`routineCadenceLook`, `.tw-client-card`); tela da semana com quadro (`.tw-panel`, `.tw-sheet`, `.tw-box`); seletor da conta e Colunas desta conta com fundo branco (`.tw-sheet-tools`). RPC `save_traffic_routine_settings` por cliente escolhido. Pill da Situação aponta ao Painel via `trafegoPainelHref.js`. Painel (`useTrafegoFila` + `TrafegoDashboard.jsx`) inclui conta desligada, cria demanda e rotula a janela do número (hoje / 7d / mês). Check-up honesto em `CentralTrafegoCheckup.jsx`. Topo em `PaidTraffic.jsx`: Dashboard visível ao gestor; Solicitações/Insights só admin; aba Google Ads só contas `cliente_google_ads_accounts` ativas; lista de Solicitações é `PaidCampaignList`. Assistente não carrega `paid_campaigns` como fila. Entregas A–D: [central-clareza-entregas-2026-09-19.md](referencias/central-clareza-entregas-2026-09-19.md). RPCs incluem `start_traffic_week_record`, `save_traffic_weekly_review`, `save_traffic_routine_settings`, `save_traffic_sheet_metrics`, `traffic_weekly_board` e leitura do histórico.

Cinco migrações da promoção da rotina (17–18/09) mais `20260918180000_traffic_sheet_metrics.sql` aplicadas uma vez; nomes/hashes estão nos releases. Não reaplicar. Há um job SQL horário às :10; com zero configurações habilitadas não gera cobranças. Sem novo transporte externo.
<!-- traffic-production-20260918:end -->

Caminhos abaixo são relativos à **fonte completa** `/opt/planeje-staging/source`, na VPS `2.25.216.103`. Use o [inventário com SHA-256](evidencias/inventario-staging-2026-09-16.json) para comparar a fotografia de 16/09 com mudanças posteriores. A documentação registra contexto; o código/banco corrente confirma a regra.

## Estrutura

Frontend React/JSX com Vite, componentes em `src/components`, regras compartilhadas em `src/lib`, hooks em `src/hooks` e estilos próprios/Tailwind. Supabase isolado fornece Auth, Postgres/PostgREST, Storage, Realtime e Edge Functions. Há também código de MCP, atendimento, tráfego, CRM e extensão WhatsApp anteriores ao programa atual.

## Onde editar cada comportamento

| Área | Arquivos principais |
| --- | --- |
| Rotas/navegação | `src/App.jsx`, `src/components/layout/MainLayout.jsx`, `Sidebar.jsx`, `CommandPalette.jsx` |
| Cabeçalhos/canvas | `src/components/layout/WorkspacePageHeader.jsx`, `WorkspaceHeaderTools.jsx`, `src/styles/planeje-brand.css` |
| Entrada de Projetos | `src/components/pages/Projects.jsx`, `src/components/projects/ProjectsSimpleHome.jsx`, `ProjectsMonthlyKanban.jsx`, `ProjectsMonthlyKanban.css` |
| Período/marcos de projeto | `src/lib/projectPeriod.js`, `projectPlanningWorkflow.js`, `projectsMonthlyOverview.js`, `projectPlanOverview.js`, `src/hooks/useProjectPlanningSettings.js`, `src/components/projects/ProjectPlanningSettingsDialog.jsx`, `ProjectPlanningTimeline.jsx`, `ProjectDeadlineLabel.jsx` |
| Formulário/detalhe de projeto | `src/components/forms/ProjectForm.jsx`, `src/components/pages/ProjectDetail.jsx` |
| Documento/materiais | `src/components/projects/ProjectPlanningWorkspace.jsx`, `PlanRichTextEditor.jsx`, `CampaignMaterialsCalendar.jsx`, `src/lib/projectPlanning.js`, `campaignPlanMateriais.js`, `campaignPlannerPrompts.js`, `richText.js` |
| Vínculo/acompanhamento | `src/lib/projectPlanTasks.js`, `src/components/projects/ProjectTaskTracking.jsx` |
| Escopo do cliente | `src/components/pages/ClientHubPage.jsx`, `src/components/clients/ClientMonthlyScope.jsx`, `MonthlyScopeSummary.jsx`, `src/hooks/useClientMonthlyScope.js`, `src/lib/clientMonthlyScopes.js` |
| Cobertura | `src/components/pages/CoberturaMensalPage.jsx`, `src/lib/coberturaMensal.js`, RPC `resumo_cobertura_operacional_mensal` |
| Tarefas/visões | `src/components/pages/Tasks.jsx`, `src/components/tasks/ListView.jsx`, `KanbanView.jsx`, `CalendarView.jsx`, `TimelineView.jsx`, `Tasks.css` |
| Detalhe de tarefa | `src/components/tasks/TaskDetail.jsx`, `details/TaskDetailsTab.jsx`, `TaskOperationalSummary.jsx`, `TaskBriefingForm.jsx` |
| Prazos/ordenação | `src/lib/taskUrgency.js`, `taskDeliveryAccountability.js`; `taskWorkOrder.test.mjs` é um teste, não uma biblioteca separada |
| Entrega/atraso | `src/components/tasks/details/TaskDeliveryAccountability.jsx`, `src/components/reports/TaskDelayReport.jsx` |
| Publicações/anexos | `src/components/tasks/details/TaskPublicationsPanel.jsx`, `TaskAttachmentsTab.jsx`, `src/lib/taskChannelPublications.js`, `src/components/tasks/TaskChannelBadges.jsx` |
| Funções/fluxos | `src/components/tasks/automations/TaskAutomations.jsx`, `OperationalFunctionsPanel.jsx`, `WorkflowTemplatesPanel.jsx`, `AutomationForm.jsx`, `AutomationPreview.jsx`, `src/lib/workflow.js`, `operationalWorkflow.js`, `operationalFunctionsApi.js` |
| Capacidade/exceções | `src/components/tasks/TeamCapacityView.jsx`, `details/TaskDemandControl.jsx`, `TaskWorkflowPanel.jsx` |
| Onboarding | `src/components/pages/Onboarding.jsx`, `src/lib/clientOnboarding.js`, `src/components/onboarding/OnboardingLegacy.jsx` |
| Senha/equipe | `src/components/pages/Settings.jsx`, `src/lib/changeOwnPassword.js`, `teamProfileEditor.js` |
| Sessão/cache/rede | `src/contexts/SupabaseAuthContext.jsx`, `src/hooks/useDataCache.js`, `src/lib/customSupabaseClient.js`, `supabaseFunctions.js` |
| Settings / Meta da agência | `src/components/pages/MetaAgencySettings.jsx`, `src/lib/metaAgencyToken.js`, `supabase/functions/meta-ads-api` (`inspect-agency-token`, `list-campaign-catalog`) |
| Tráfego / Google Ads | `src/components/traffic/GoogleAdsInsights.jsx`, `GoogleAdsWriteDialog.jsx`, `GoogleAnalyticsBoard.jsx`, `GoogleBusinessBoard.jsx`, `GoogleTagBoard.jsx`, `src/lib/googleAdsWrite.js`, `src/lib/googleAdsLinkedAccounts.js`, `src/lib/googleAdsInsightsView.js`, `src/lib/googleDataInsightsView.js`, `supabase/functions/google-ads-api` (`get-campaigns`, `get-campaign-detail`, `update-google-ads`), `supabase/functions/google-data-api`; picker só contas ativas; escrita de um item com confirmação, sem o Painel |
| Settings / Google Drive da agência | `src/components/pages/GoogleDriveAgencySettings.jsx`, `src/lib/googleDriveAgency.js`, `src/lib/googleDriveClient.js`, `src/lib/googleDriveMedia.js`, `supabase/functions/google-drive-api` (`oauth-config`, `get-auth-url`, list/upload/`sync-file`) |
| Rastreamento | `src/components/pages/ContatosRastreamentoPage.jsx`, `ContatosPage.jsx` (`embeddedInHub`), `RastreamentoHub.css` (`.rastreamento-leads-shell`, `.rt-wa-status`, `.rt-funnel-board`, `.rt-daily__chart`), `src/components/crm/RastreamentoUi.jsx`, `RastreamentoVisaoGeral.jsx`, `RastreamentoOverviewDashboard.jsx`, `ClienteWhatsAppChannelStatus.jsx` (`compact`), `ContatosMessagePeriodPicker.jsx`, `src/lib/contatosMessagePeriod.js`, `src/lib/rastreamentoPeriod.js`, `src/lib/hubResultsSummary.js`, `src/lib/hubOverviewDashboard.js`, `src/lib/crmRelatorioMetaSpend.js`, `src/lib/crmRelatorioMetaTracking.js`, `src/lib/rastreamentoHub.js`, `rastreamentoConversionRules.js`, `rastreamentoCapiStatus.js`, `rastreamentoMetaManual.js`, `rastreamentoWhatsappInstancia.js`, `rastreamentoEventosMeta.js`, `src/components/crm/RastreamentoMetaManual.jsx`, `RastreamentoWhatsappInstancias.jsx`, `RastreamentoEventosMeta.jsx`, `RastreamentoIntegracoes.jsx`, `CrmRelatorioMeta.jsx`, `supabase/functions/funil-metrics-api` (`hub-results-summary`), `supabase/functions/meta-ads-api` (`validate-cliente-meta-token`, `list-cliente-meta-token-sources`, `reuse-cliente-meta-token`, `discover-cliente-meta-assets`, `activate-cliente-meta-connection`, `test-cliente-meta-connection`, `get-campaign-insights`, `send-ctwa-conversion`), `supabase/functions/uazapi-inbox-webhook` (`applyRastreamentoConversion.ts`) |

## Fontes do banco

| Fonte | Uso |
| --- | --- |
| `clientes`, `profiles` | Cadastro de cliente e pessoa; `clientes.meta_rastreamento` guarda BM/contas/Pixel da conexão manual (token em `app_secrets`). |
| `projetos` | Cliente, responsável, status, competência inicial/final (`mes_referencia`, `mes_fim`), adesão (`workflow_managed`) e quatro marcos. |
| `campaign_plans` | Documento/contexto e materiais do planejamento; manter formatos legados e controle de versão. |
| `client_monthly_scopes`, `client_monthly_scope_history` | Escopo por cliente/competência e auditoria. |
| `tarefas` | Execução única: vínculo ao material/projeto, tipo/status, responsáveis, função/fluxo/etapa, `due_date`, `post_date`, `production_delivered_at`, anexo de entrega, `stage_started_at`, `stage_due_at`, histórico de execução. |
| `task_statuses`, `task_automations`, `workflow_rules` | Status e regras anteriores, preservados e integrados. |
| `task_operational_functions` | Integrantes, ativação e destinos operacionais. ACL de gestores fica protegida no schema privado. |
| `task_workflow_templates` | Sequência de conteúdo, função e `sla_days` por etapa. |
| `task_function_capacities` | Limite de carga por função/semana. |
| `task_channel_publications` | Ocorrências e histórico por canal. Não trocar várias datas por uma única data global da tarefa. |
| `task_attachments` | Material principal/canal e comprovação de entrega vinculada à própria tarefa. |
| `task_delay_justifications` | Motivo, detalhe, prazo/tipo de atraso, autor e contexto da etapa. |
| `task_deadline_status`, `task_delay_report` | Views para leitura de prazos/justificativas com regras de acesso existentes. |
| `project_planning_settings`, `project_planning_history` | Política do automático/marcos e histórico de transições/alterações. |
| `client_onboarding_templates`, `client_onboardings`, `client_onboarding_stages` | Modelos, execução/snapshot e etapas ordenadas vinculadas à tarefa atual. |
| `client_checklists.items` | Checklist legado em JSON; **não existe tabela separada `client_checklist_items` nesta implantação**. |

## Operações de banco importantes

- `create_task_from_plan_material` e `link_task_to_plan_material`: criação/associação estável de tarefa de material.
- `start_client_monthly_project`: criação/reutilização do plano elegível. `project_covers_month` reconhece todo o intervalo.
- `resumo_cobertura_operacional_mensal`: comparação por material/tipo/competência; redefinida ao longo das entregas para entrega comprovada e períodos maiores.
- `calculate_task_stage_deadline`: cálculo puro público, com permissão de uso adequada; trigger permanece invoker e schema privado continua inacessível ao aplicativo.
- `can_manage_task_operational_functions`: consulta autorização gerencial protegida; não substituir por teste de role na interface.
- Onboarding público: a tela abre em `OnboardingLegacy.jsx` (`client_checklists`). O item vira tarefa em `tarefas` (`type` onboarding) e guarda `task_id` no JSON. **Por etapas** segue em `Onboarding.jsx` com `can_use_client_onboarding`, `save_client_onboarding_template`, `start_client_onboarding`, `open_client_onboarding_stage`, `update_client_onboarding_stage`, `complete_client_onboarding_stage`, `calculate_client_onboarding_due_date`. A etapa nasce sem tarefa; concluir não abre a próxima. MCP 2.6.0 lê e grava a lista em colunas e ainda chama as funções das etapas.
- Onboarding privado: ativação, avanço ao atualizar tarefa, sincronização dos campos e gate de conclusão operacional. RPCs de escrita são protegidas; novas tabelas têm leitura de equipe por RLS e não recebem DML direto do aplicativo.
- `calculate_client_onboarding_due_date` normaliza data para dias úteis no fuso São Paulo, inclusive ao redor da meia-noite UTC. Não substituir pelo helper antigo sem verificar essas bordas.

### Regras transacionais versus motor legado

As etapas de onboarding e seus próximos trabalhos avançam em transação, com locks/idempotência. O vínculo de material possui restrição única e criação idempotente. **Isso não significa que todas as ações do motor legado de automações ou solicitações são atômicas.** Preserve diagnósticos de falhas parciais e confira o ponto de entrada antes de ampliar a automação.

## Migrações do programa

O inventário JSON lista arquivos, hashes e objetos declarados. A sequência principal é:

| Bloco | Arquivos em `supabase/migrations` |
| --- | --- |
| Fase 1 | `20260911172136_task_operational_functions_and_execution_trace.sql` |
| Canais/gates | `20260914143331_task_channel_publications.sql`, `20260914144111_guard_task_published_with_channel_occurrences.sql`, `20260914145555_fix_task_channel_publication_trigger.sql`, `20260914180000_task_attachments_per_channel.sql` |
| Escopo/capacidade | `20260914170000_client_monthly_scopes.sql`, `20260914190000_task_demand_control_and_capacity.sql`, `20260914200000_autonomous_task_demand_control.sql` |
| Material/contexto | `20260914193700_stable_project_material_tasks.sql`, `20260914195815_persist_project_planning_context.sql`, `20260914200716_prefill_planned_material_briefing.sql` |
| Fluxo de conteúdo | `20260914210000_configurable_content_workflows.sql`, `20260914220000_workflow_entry_and_art_production.sql` |
| IA de texto | `20260915130000_fix_encrypted_secret_reader.sql` — também depende do isolamento/proxy; não exportar segredos. |
| Nome/fluxo/entrada | `20260915172000_standardize_planned_task_titles.sql`, `20260915180000_select_planned_material_workflow.sql`, `20260915183251_planned_material_entry_stage.sql` |
| Cobertura por material | `20260915194150_operational_material_coverage.sql` |
| Entrega/SLA/justificativa | `20260916033000_task_delivery_proof_and_delay_accountability.sql`, `20260916033100_delivery_aware_operational_coverage.sql`, `20260916033200_stage_delay_justification_gate.sql`, `20260916190000_task_stage_deadline_permissions.sql`, `20260918120000_allow_task_attachment_removal.sql` |
| Marcos e autorização de projeto | `20260916160000_project_planning_workflow.sql`, `20260916160100_project_planning_permissions.sql`, `20260916170000_project_planning_start_month.sql` |
| Períodos de vários meses | `20260916180000_project_periods.sql`, `20260916180100_project_period_monthly_coverage.sql` |
| Onboarding | `20260916210000_controlled_client_onboarding.sql`, `20260916210100_onboarding_local_business_dates.sql` |
| Rastreamento gatilhos | `20260918140000_rastreamento_conversion_rules.sql` — aplicada na produção em 18/09; não reaplicar. |
| Rastreamento gatilho checkout | `20260919014500_rastreamento_conversion_initiate_checkout.sql` — CHECK de `event_name` passa a aceitar `InitiateCheckout`; aplicada na produção em 19/09; não reaplicar. |
| Google Ads conversões | `20260921130000_google_ads_conversion_upload.sql` — `conversions_enabled` + ações em `cliente_google_ads_accounts` e `google_conversion_event_log`; aplicada na produção em 21/09; não reaplicar. |

Migrações foram aplicadas ao clone durante as entregas, algumas manualmente. **Arquivo no disco não prova aplicação, e ausência no registro do CLI não prova falta da mudança.** Compare catálogo, definição vigente e evidências antes de executar. Não aplicar toda a pasta novamente por precaução. Scripts anteriores também incluem SQL de outros programas/módulos.

Para `CREATE OR REPLACE` de rotinas existentes, confira o proprietário. A cobertura mensal e onboarding usam `supabase_admin` nas entregas registradas; `postgres` não consegue sempre substituir rotina do proprietário nem assumir essa role por `SET ROLE`. Veja o guia de operação.
