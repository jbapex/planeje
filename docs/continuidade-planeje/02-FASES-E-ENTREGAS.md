**12/11/2026 — Neuro / Rotina do Gestor IA em PRÉVIA LOCAL, sem promoção.** Branch feat/gestor-ia recupera a release gestor-rotina-20261112-01 e acrescenta rascunho IA, validação humana no editor oficial, cinco ferramentas MCP, grupos e privacidade antes da rede. Check, 18 testes dirigidos, 76 verificações React, 19 MCP, dez grupos SQL e E2E passaram; revisão sem P1/P2 pendentes. Candidata estática em 127.0.0.1:4394, com dados sintéticos. Produção depende da aprovação explícita de Josias depois do preview nesta conversa. [Contrato, arquivos, evidência e limites](referencias/gestor-ia-neuro-mcp-2026-11-12.md).

**11/11/2026, 23h43 — Menu por categorias e indicadores refinados PUBLICADOS na VPS.** Release `menu-categorias-20261111-01/candidate`, seis sobreposições sobre o CRM cabeçalho e2.144 fontes. Três atalhos e cinco categorias; Gestor IA, CS IA e CRM IA continuam no rodapé como o Squad. Perfil e flags herdados; seis testes do publicador, dois Node na candidata, build, revisão independente e39HTTPS passaram. Sessão autenticada confirmou menu e subpáginas; serviços, runtime e assets anteriores preservados, sem SQL ou reinício. Celular real e aceite de uso pendentes. [Publicação, evidências e limites](referencias/menu-categorias-producao-2026-11-11.md).

**11/11/2026, 08h36 — Perfis, Leads e conversa integrada do CRM IA publicados.** Release `crm-ia-20261111-04`, 41 sobreposições e 2.084 fontes; duas migrations novas aplicadas uma vez, treze no total. Check/286 testes locais e 140 da candidata passaram; revisão independente sem achados pendentes e interface autenticada conferida. HTML, 22 assets e oito bundles/OPTIONS verificados; perfil e Atlas/MCP/sincronizador preservados, sem ativação em massa ou envio/modelo/OAuth real. A meta segue em notificações e demais controles da matriz. [Operação e limites](referencias/crm-ia-perfis-leads-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 07h12 — Concierge, rascunhos e agenda semanal do CRM IA publicados.** Release `crm-ia-20261111-03`, 36 sobreposições e 2.063 fontes; três migrations novas aplicadas uma vez, oito bundles e todos os 22 assets HTTPS conferidos. Check/205 testes locais e 125 da candidata passaram; revisão independente e agenda autenticada conferidas, sem mensagem/modelo/OAuth real. Perfil, Atlas/MCP/sincronizador preservados; nenhuma ativação em massa. A meta continua em perfis, leads e demais controles da matriz. [Operação e limites](referencias/crm-ia-concierge-rascunhos-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 05h33 — Voz, transcrição e Google Agenda do CRM IA publicados.** Release `crm-ia-20261111-02`, 54 sobreposições e 2.046 fontes; quatro migrações inéditas aplicadas uma vez, oito bundles Edge e 22 assets HTTPS conferidos. Check/163 testes locais e 109 testes da candidata passaram; sessão autenticada verificada sem salvar agente, consentir Google ou enviar mensagem. Perfil e serviços Atlas/MCP/sincronizador preservados. Autonomia continua desligada; a meta segue nos controles da matriz de paridade, com homologação real dependente das escolhas do usuário. [Release e limites](referencias/crm-ia-voz-agenda-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 03h06 — Núcleo CRM IA publicado no Squad.** Dez áreas, agentes tipados, agenda interna, conversas/mídia, fila reservável e especialista no Atlas. Migrações novas aplicadas uma vez; seis bundles Edge e frontend conferidos, sem ativação em massa ou teste real de mensagens/modelo. Voz e Google Agenda seguem em implementação; não inferir equivalência integral ou aceite. [Release e limites](referencias/crm-ia-producao-2026-11-11.md).

**06/11/2026, 12h35 — Conversas por conta e Mini CRM PUBLICADOS no Planeje.** Todos os canais como padrão, filtros/identificação por conta e resumo lateral. Quatro fontes,1.799 conciliados, main9e73612f/CSS80eb966f. Testes locais/naVPS, build produtivo, HTTP/hashes e serviços conferidos; Impacto ativa sem erro. Sem migração/restart/envio. Visual, sessão no navegador e aceite humano pendentes. [Operação, evidência e limites](referencias/rastreamento-conversa-canais-producao-2026-11-06.md).

**05/11/2026, 18h23 — Impacto confirmada na nova conexão por chave.** Durante o diagnóstico da captura, a configuração foi atualizada na interface para `planeje-status-export-connect` e ativada. Organização esperada conferida; teste18h22 e sincronização18h23 sem erro,10.708 registros já iguais/5.063 telefones associados. O agente realizou apenas leituras; nenhuma chave ou configuração alterada por ele. A falha anterior era chave nova enviada à URL fixa antiga. [Evidência](evidencias/releases/crm-self-service-impacto-2026-11-05.json).

**05/11/2026, 18h14 — CRM .87: conexão ao Planeje por loja PUBLICADA.** Administrador gera/revoga chave em Integrações > Planeje. Tela, API e migração nova instaladas; build completo, permissões, HTTP/hashes e preservação da Impacto verificados. Nenhuma outra loja ativada. Base CRM: release planeje-self-service-20261105-01/candidate, main8015b389; Planeje .109 preservado. Primeiro uso de outra loja, visual e aceite humano pendentes. [Operação e evidências](referencias/crm-self-service-producao-2026-11-05.md).

**05/11/2026,17h18 — CRM Ápice PUBLICADO E ATIVO para Impacto Noivas.** Bloco em Rastreamento > Integrações, API na87 e worker/timer na109; migração nova aplicada uma vez. Primeira carga:10.708 registros/5.063 telefones;131 conflitos/vazios preservados. Ciclo automático confirmou zero regravações.100checks, revisão, build e verificações reais passaram; visual/aceite humano pendentes. [Operação, evidência e limites](referencias/crm-status-interface-producao-2026-11-05.md).

**05/11/2026 — Conexão CRM Ápice: interface e controle locais concluídos.** Um bloco em Rastreamento, RPC privada e worker existente; sem dependência nova do produto. Entrega preparada para migração/API/worker/frontend, ainda sem instalação. [Contrato, testes e limites](referencias/crm-status-interface-local-2026-11-05.md).

**02/11/2026 — Integração de status da Impacto Noivas: candidata local concluída.** API restrita, reconciliação serial, testes, revisão de isolamento/concorrência/logs e simulação real de leitura. Não instalada; publicação e aceite separados. [Entrega, simulação e limites](referencias/impacto-crm-status-local-2026-11-02.md).

**28/10/2026, 12h14 — Atlas: aprendizado observado e contato natural publicados. Reusa análises/memórias existentes; tipo, fonte/data, correção/revogação e consulta natural à conta. Autorização atual cumprida; aceite de uso real pendente.** [Publicação, operação e limites](referencias/atlas-aprendizado-contato-producao-2026-10-28.md)

**28/10/2026, 12h05 — Histórico de origens PUBLICADO E VERIFICADO.** Base vigente contact-attribution-history-events-20261028-01/candidate herda histórico11h35/perfil;1.766 fontes, main7bc19ced/ca294902. Primeira origem principal, novas entradas imutáveis e ficha de Leads/Eventos conferidas; entrada natural Google com campanha/data observada, legado preservado. Migração20261028130000 aplicada só uma vez na primeira etapa, somente Edge reiniciado nela; complemento sem SQL/restart. Cinco serviços ativos e HTTP/hashes passaram. Sem backfill ou conversão de teste; aceite humano pendente. [Operação e limites](referencias/rastreamento-historico-origens-producao-2026-10-28.md).

**28/10/2026, 08h11 — Atlas: envio e identidade PUBLICADOS PARA VALIDAÇÃO.** Enter/Shift+Enter, mensagem imediata e consulta indicada pelo dono com retorno à origem. Base atlas-send-owner-20261028-02/candidate herda Google07h33/perfil;1.754 fontes, main da5e64ea/0828c836. Só migração20261027193803 aplicada uma vez, team/events reiniciados; cinco serviços ativos.200 Python remotos,19 fixtures de publicação, oito HTTP/hashes e SQL/ACL/índice passaram. Sessão real confirmou campo/atalho/Shift+Enter sem envio; modelo/equipe real, mapa incorporado e aceite pendentes. [Publicação e limites](referencias/atlas-envio-identidade-producao-2026-10-28.md).

**28/10/2026 — Atlas: entrega local de aprendizado observado e contato natural concluída. Reusa memória/análise existentes, sem motor ou chamada extra; UI e leitores preservam proveniência. Publicação e ciclo humano real pendentes.** [Entrega, fontes e limites](referencias/atlas-aprendizado-contato-local-2026-10-28.md)

**27/10/2026, 16h12 — Atlas: conversa/equipe PUBLICADOS PARA VALIDAÇÃO.** Fatos persistidos, avisos curtos/contexto recolhido, fila pessoal e supervisão, resposta posterior e retorno de aprovação do grupo. Base atlas-dialogue-20261027-02/candidate herda traffic-save02 e perfil produtivo;1.752 fontes, main9982524c/ee022d49. Só migração20261027170137 aplicada UMA VEZ; team/events reiniciados, cinco serviços ativos.188 Python remotos, build,13 fixtures de publicação, SQL/HTTP/hashes passaram. Fila/contexto/conversa autenticados abriram; mapa incorporado ficou vazio na inspeção, seus arquivos íntegros. Sem IA/mensagem de teste; ciclo humano, mapa no navegador de Josias e aceite pendentes. [Publicação e limites](referencias/atlas-conversa-equipe-producao-2026-10-27.md).

**19/10/2026, 23h31 — Atlas: reparo do ciclo operacional PUBLICADO PARA VALIDAÇÃO.** Josias autorizou o conjunto; quatro overlays sobre a base vigente, migração nova aplicada uma vez e somente worker da equipe reiniciado. 1.727 fontes, seis HTTP/hashes, quatro serviços e cwd conferidos; tarefas, histórico e configuração preservados durante a publicação. Build/33 Python/56 Node remotos, 15 testes de recuperação e revisões passaram. Mapa e conversa pessoal vistos na sessão real; nenhuma mensagem/IA de teste. Primeiro ciclo humano e aceite pendentes. [Publicação e limites](referencias/atlas-ciclo-operacional-producao-2026-10-19.md).

**19/10/2026 — Atlas: ciclo operacional VALIDADO LOCALMENTE, NÃO PUBLICADO.** Resposta preservada/retomável, contato explícito da conta sem reassinar tarefa, repetição de pergunta suprimida, mudança de atribuição volta à conta e consulta não bloqueia acompanhamento. 91 SQL/RLS, 110 Python, 56 Node dirigidos, cinco verificações de navegador e check passaram. Migração nova só na fixture; publicação, uso real e aceite pendentes. [Correções, evidência e limites](referencias/atlas-ciclo-operacional-local-2026-10-19.md).

**18/10/2026, 14h37 — Atlas: conversa com robô e atividade no cenário PUBLICADAS PARA VALIDAÇÃO.** Josias autorizou “pode”. Painel claro/avatar, detalhes recolhidos, especialistas por consulta real e clique na origem exata; atualização continua durante envio e para ao concluir/falhar. 51 Node locais/remotos, check/builds, 32 verificações locais (dez repetidas), revisão e 12 fixtures locais/remotas passaram. Seis HTTP/hashes, 1.726 fontes e quatro serviços ativos; sessão real mostrou mapa e novo chat. Main dbe714f9/828bc4c4, mapa 1ed69416/59ec53c3; nova base/perfil atlas-office-live-chat-20261018-01/candidate herda Calendário 14h05. Sem SQL/Edge/restart/IA/mensagem/tarefa de teste; consulta humana real/aceite pendentes. [Publicação e evidência](referencias/atlas-conversa-atividade-escritorio-producao-2026-10-18.md)

**18/10/2026 — Atlas: conversa com avatar e consultas no cenário, VALIDADO LOCALMENTE; NÃO PUBLICADO.** Painel claro com controles recolhidos; personagens IA e robô pixelado refletem passos reais, espera, fim e falha. Clique abre a consulta exata; atualização continua durante outro envio. 51 Node, 32 verificações de navegador, check, builds e revisão sem achados abertos. Sem produção, IA ou mensagem real. Publicação/aceite pendentes; preservar a base concorrente do Calendário das 14h05 e o worker source-order. [Entrega local e limites](referencias/atlas-conversa-atividade-escritorio-local-2026-10-18.md)

**18/10/2026, 13h30 — Consulta interna do Atlas: correção publicada, aceite pendente.** Recupera tentativa prematura de contato exigindo leitura; alteração de cinco linhas no manager, teste novo e publicação restrita ao worker principal. Mapa reconhecido na captura do usuário. 42 Node, oito fixtures, check e leitura RLS real conferidos; sem IA/mensagem/tarefa de validação. [Correção e evidência](referencias/atlas-ordem-fontes-producao-2026-10-18.md).

**18/10/2026, 12h49 — Atlas: conversa interativa no escritório PUBLICADA PARA VALIDAÇÃO.** Josias autorizou o conjunto. Painel privado no mapa, confirmação/busca de cliente, progresso/retomada e acesso às conversas reais da equipe; controlador existente preservado. Correção incremental de sessão aplicada uma vez, sem SELECT amplo em auth.sessions nem relaxamento dos escopos. 55 SQL locais, 47 Node locais/remotos, 28 verificações de navegador, npm check e builds com perfil produtivo/ambiente limpo; duas revisões e 10 testes de recuperação passaram. Seis HTTP/hashes, permissões e quatro serviços conferidos; tarefas, jobs, conversas/mensagens, saídas e política iguais durante publicação. Sessão real abriu conversa e reconheceu Impacto; confirmação não clicada, sem IA/chamado de validação. Mapa ficou vazio na aba de inspeção, observação anterior ainda sem causa; não declarar conferência visual produtiva completa. Main fc221910/92ba26f1; mapa d8cebced/e5ae8acc; base e perfil agora atlas-office-conversation-20261018-01/candidate, guarda 1.719. Unidades mantêm caminhos anteriores; só planeje-atlas e Edge reiniciados. Não repetir publicador/migração. Primeiro retorno humano real e aceite pendentes. [Publicação e evidência](referencias/atlas-conversa-escritorio-producao-2026-10-18.md).

**17/10/2026 — Toolkit: ENTREGA LOCAL, SEM PUBLICAÇÃO.** Adoção aprovada executada com catálogo completo, instruções/documentação, skills e ferramentas compatíveis, quality gate reproduzível e correção dos 18 diagnósticos MCP com regressões. Preservados stack, autenticação, dados, trabalho anterior e comandos operacionais. [Setup](../setup.md) · [Evidência](evidencias/releases/toolkit-setup-local-2026-10-17.json).

**16/10/2026, 23h30 — Chamados do robô dentro do escritório PUBLICADOS.** Pedido de Josias: saber quem o Atlas chamou, mensagem, retorno e revisão. Nova aba/entrada Chamados; Aguardando Josias abre assuntos concretos, Aguardando equipe abre conversas reais. Cartões com destinatário, cliente, mensagem/última resposta e revisão; botão abre o assunto exato no robô e sai do modo ampliado. Sugestões abrem demanda/perfil; histórico dos vinte encerrados mais recentes. Contadores de agentes podem se sobrepor e não duplicam assuntos na lista. 14 testes novos/expediente, 30 regressões, build, prévia fictícia computador/celular, consultas PostgREST e navegador autenticado real passaram. Produção: cinco sugestões, zero conversa/mensagem interna; nenhum chamado real criado para teste. Assets `f054f258`/`48915503`, escritório `b0d38839`/`fa6fc7d5`; conserva anteriores. Base `atlas-office-calls-20261017-01/candidate`, guarda de 1.668 fontes. Sem SQL/restart/IA/escrita em tarefa ou mensagem; observação, teto de um milhão e aprovação preservados. Baseline já tinha quatro chamadas/198.224 tokens, inalterados nesta revisão. Aceite e uso de conversa real pela equipe pendentes. [Referência](referencias/atlas-chamados-escritorio-2026-10-16.md) · [Release](evidencias/releases/atlas-chamados-escritorio-2026-10-16.json).

**16/10/2026, 21h59 — Atlas: 1 MILHÃO de tokens/dia e configurações PUBLICADOS.** Josias autorizou o teto e pediu uma tela editável. Salvo pela sessão normal e confirmado após recarregar, sem zerar os 156.710 tokens do dia ou fazer nova chamada de teste. `#/assistant/atlas/configuracoes`, atalho Configurar no escritório e na central, acesso exclusivo do dono; permite aumentar o teto depois. Observação continua ativa, 24 clientes selecionados, chamados automáticos desligados e tarefas sob aprovação. Oito verificações adicionais de limite/RLS, build e navegador computador/tela estreita, persistência e atalho passaram; quatro serviços ativos. SQL novo `20261017005227` aplicado UMA VEZ; não reaplicar. Assets `dddf4065`/`48915503`, escritório `b4d876e6`/`17b78889`; preserva os anteriores. Base atual `atlas-events-settings-20261016-01/candidate`; backend permanece em `atlas-events-production-20261016-01`, sem restart nesta revisão. Aceite de uso e sete vínculos de grupos pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

# As sete fases e suas entregas

**16/10/2026, 21h48 — Atlas por acontecimentos PUBLICADO na VPS real, EM OBSERVAÇÃO.** Entrada produtiva com delegação curta do dono, fila/fontes/transcrições, 100 anteriores, índice de tarefas e rascunhos privados na central/perfil. Somente 17 grupos explicitamente vinculados (24 clientes selecionados; sete sem vínculo); 37 grupos de lojas excluídos antes de IA. Leitor automático antigo substituído, inclusive quando a leitura nova é pausada; robô/áudio/acompanhamento determinístico preservados. 56 verificações Python, 68 API/Auth/RLS/fila, 15 do motor, 38 Node, 15 runtime e navegador computador/tela estreita passaram. Impacto: três chamadas reais, duas recusadas pelo limite do piloto e uma aceita como recorte limitado de cinco pontos para revisão/possível agrupamento; cinco rascunhos, zero tarefa oficial/conversa interna/envio. 121.605 tokens novos + 35.105 anteriores; margens de validação 80/120/160 mil restauradas para **60 mil/dia**, zero reservado. Escolha do teto da operação foi perguntada e aguarda Josias; não presumir um milhão. Assets `7c508ca6`/`d86dd2fb`, base `atlas-events-production-20261016-01/candidate`, webroot `/var/www/planeje`; incorpora sessão/perfil concorrente e corrige espera dos módulos antes do redirecionamento. SQL `20261017000743` e `20261017002459` aplicados UMA VEZ CADA somente na produção/cópia descartável; não reaplicar, não aplicar o consolidado no CS. Perguntas automáticas à equipe continuam desligadas; qualidade semântica, orçamento, responsáveis/vínculos e aceite pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

**16/10/2026, 20h53 — Atlas por acontecimentos: PILOTO PRIVADO IMPLEMENTADO; PRODUÇÃO NÃO ATIVADA.** Lote novo + 100 anteriores configuráveis, referência citada antiga, tarefas/comentários/memória do cliente, vínculo explícito em canal da agência, outbox/fila/lease/versões e fontes atuais conferidas antes/depois da IA. Pergunta interna ligada à conta cadastrada e ao robô; campos oficiais continuam sob aprovação. Minha caixa/perfil mostram fontes, tarefa, fase e consumo. 162 verificações, build Vite e navegador computador/390×844 passaram; uma análise real do modelo em dados fictícios e passagem controlada conta → executor → revisão do dono. CS termina em `observe`, um cliente fictício, teto restaurado de 60 mil; houve três chamadas ao modelo, 71.035 registrados/estimados (não faturamento). Nova rotina produtiva, proposta estruturada na central antiga, amostra real e orçamento/unificação seguem pendentes. Assets privados `dda2567f`/`09aaaa39`, serviço novo `planeje-atlas-events-pilot.service`. SQL `20261016225723`, `20261016231835`, `20261016232925`, `20261016234141` aplicados UMA VEZ CADA somente no CS; não reaplicar nem promover o bundle CS. Sem tarefa/campo oficial de produção alterado ou envio real. [Referência](referencias/atlas-gatilhos-piloto-2026-10-16.md) · [Evidência](evidencias/releases/atlas-gatilhos-piloto-2026-10-16.json).

**16/10/2026 — Atlas por gatilhos e contexto: PLANO DESENHADO, NÃO IMPLEMENTADO.** Josias pediu incluir mensagens/áudios com histórico e a ligação pedido → cliente → tarefa → responsável interno. Proposta: lote novo + até 100 mensagens anteriores por grupo, busca de referências antigas, registros do cliente/tarefa e continuidade versionada; janela expansível com cobertura visível. Gatilhos de mensagem, transcrição, tarefa, prazo/revisão e demanda aberta; 90 s/uma hora são parâmetros propostos e editáveis. Pergunta operacional vai à conta cadastrada (Poliana como exemplo); criação, transferência e decisões de escopo/verba mantêm aprovação do dono. Quatro etapas: cobertura/contexto → eventos/pedidos → conta/equipe → revisões/evidências/consumo. Novos limites e ativação permanecem por definir/validar. Somente documentação, sem runtime, SQL, IA, tarefa, mensagem ou permissão alterados. [Plano](referencias/atlas-gatilhos-contexto-plano-2026-10-16.md).

**15/10/2026 — Link de conexão do WhatsApp liberado à equipe com Rastreamento; PUBLICADO.** Pedido explícito de Josias: todos que abrem a página podem gerar/consultar/revogar, incluindo colaboradores. Interface/serviço/SQL usam papel ativo, conta/sessão atual, permissão efetiva do módulo e RLS existente do canal. Sem elevar papéis ou alterar linhas de permissões. 48 verificações Node, 145 API/Auth/RLS isoladas, build e navegador passaram; gestor validado no banco. SQL novo `20261015173734` aplicado uma vez no teste e produção; não reaplicar. Assets `9aefb86f`/`841037d3`, conserva `03465f2e`/`841037d3`. Apenas Edge Functions reiniciado; Atlas preservado, grupos sem alteração. Aceite de uso pendente. [Referência](referencias/whatsapp-conexao-acesso-2026-10-15.md) · [Release](evidencias/releases/whatsapp-conexao-acesso-2026-10-15.json).

**15/10/2026 — Link para conectar WhatsApp por QR/código PUBLICADO.** Botão por instância em Rastreamento → Integrações para gerar/copiar/abrir/revogar; página externa sem login, com QR ou número internacional. Link de 24 horas, hash no banco, encerrado após conectar; credencial Uazapi no servidor. 35 verificações Node, 105 API/Auth/RLS isoladas, build, auditoria de permissões e navegador passaram; botão/consulta e URL inválida conferidos na produção, sem parear aparelho real. SQL `20261015045127` aplicado uma vez no teste e na produção; não reaplicar. Assets `95e6d883`/`c1a42de6`, conserva `47519cec`/`2731d631`. Somente esta entrega promovida; apenas Edge Functions reiniciado. Atlas pausado, Assessoria e escritório não publicados e devem incorporar esta revisão. Aceite de uso pendente. [Referência](referencias/whatsapp-conexao-link-2026-10-15.md) · [Release](evidencias/releases/whatsapp-conexao-link-2026-10-15.json).

**15/10/2026 — Topo/Meio/Fundo no fluxo da Assessoria, somente TESTE.** Campo opcional em conjunto/anúncio, etiqueta no mapa, legenda, histórico e leitura da IA; classificação explícita sem herança automática. Desenhos/rascunhos/tarefas existentes preservados. 49 testes Node, 37 SSR, 22 API, cinco permissões e build/HTTP passaram. SQL `20261015044248` aplicado só no banco isolado; não reaplicar. Assets `index-c533f33b.js` / `index-741f9158.css`. Conferência visual/aceite e publicação pendentes; produção intocada, Atlas pausado. [Referência](referencias/apice-cs-funil-etapas-2026-10-15.md) · [Release](evidencias/releases/apice-cs-funil-etapas-2026-10-15.json).

**15/10/2026 — Funil em nós livres no TESTE integrado; NÃO PUBLICADO.** Josias aprovou desenhar blocos e setas com campanha/conjunto/anúncio do cliente. Arraste, ramificações/retornos, edição lateral, vínculo de catálogo, tarefas existentes e histórico estruturado para a IA; exemplo fictício salvo em Aurora. 46 testes Node, 25 verificações SSR, 50 API, 17 catálogo/leitura IA, 20 permissões e build/HTTP passaram. SQL `20261015040338` aplicado somente no teste; corrigido bloqueio do colaborador sem ampliar propriedade dos projetos. Assets `index-67d67abc.js` / `index-9bd06f7c.css`. Catálogo Meta no teste é fictício, chamadas externas bloqueadas. Conferência visual interativa/aceite e publicação pendentes; produção intocada, Atlas pausado. [Referência](referencias/apice-cs-fluxo-visual-2026-10-15.md) · [Release](evidencias/releases/apice-cs-fluxo-visual-2026-10-15.json).

**15/10/2026 — Prova local do escritório Atlas, sem nova fase do programa.** Concretizada a direção aprovada para avaliação visual, usando renderer Habblaud e cenário inteiramente fictício. Não conclui fases 6–7 nem substitui as entregas de Assessoria. Build e navegação passaram; integração operacional e publicação pendentes. [Referência](referencias/atlas-escritorio-previa-2026-10-15.md) · [Release](evidencias/releases/atlas-escritorio-previa-2026-10-15.json).

**15/10/2026 — Ampliação desejada do Atlas, ainda sem entrega.** Escritório/cidade visual, acompanhamento individual e ações em Tarefas por regras são escopo novo proposto, não conclusão de fase nem execução já existente. As sete fases do programa e as entregas anteriores permanecem nos estados registrados. [Escopo e candidatos](referencias/atlas-cidade-agentes-2026-10-15.md).

**15/10/2026 — Funil com edição direta no TESTE integrado; NÃO PUBLICADO.** Nova correção após Josias rejeitar a tela: cartões legíveis, campos na própria etapa, criar/remover caminhos e vincular trabalhos do plano. Desenho opcional; endereço mantém a vista. Mesmo salvamento/versionamento e tarefas; Aurora preservado. 22 testes Node, 12 verificações de renderização estática, 24 verificações API e build passaram; HTTP conferido. Conferência visual interativa e aceite pendentes. Assets `index-2b601486.js` / `index-06c66d15.css`; produção sem alteração, Atlas pausado. [Referência](referencias/apice-cs-funil-direto-2026-10-15.md) · [Release](evidencias/releases/apice-cs-funil-direto-2026-10-15.json).

**15/10/2026 — Pesquisa transversal de componentes; sete fases preservadas.** A pesquisa de 60 repositórios atende à nova prioridade de operação e entrega. A sequência de pilotos apresentada é proposta e não representa nova fase, conclusão das fases 6–7, substituição da Assessoria em teste ou autorização de implantação. [Pesquisa e matriz de 60 projetos](referencias/ecossistema-github-agencia-2026-10-15.md).

**15/10/2026 — Plano de assessoria simplificado no TESTE integrado; NÃO PUBLICADO.** Objetivo, caminho resumido e etapas com progresso na entrada. Mesmas tarefas/responsáveis/prazos; ao salvar/fechar tarefa retorna ao plano. Funil/detalhes/documentos preservados, Rotina recolhida. Leitura estruturada da IA compartilha as regras da tela; nenhuma ativação do Atlas. 33 testes Node, script de regressão, 31 verificações API, sete de leitura IA e build/HTTP passaram. Exemplos existentes preservados; conferência visual e aceite pendentes. Assets de teste `index-572c9bbc.js` / `index-44375533.css`. Produção sem alteração. [Referência](referencias/apice-cs-simples-2026-10-15.md) · [Release](evidencias/releases/apice-cs-simples-2026-10-15.json).

**14/10/2026, 15h53 — Ficha de Rastreamento em duas colunas e aba Anúncio PUBLICADAS.** Josias aprovou a prévia visual (“Gostei”). Marcar, origem e cinco UTMs à esquerda; conversa à direita; criativo em aba própria. Celular em sequência com rolagem. Três scripts Node locais/na candidata, build da prévia/completo e navegador passaram; ficha real do contato indicado, UTMs, conversa, abas e tela estreita conferidas. `index.47519cec.js` / `index.2731d631.css`, recarregar `?v=47519cec#/rastreamento?aba=leads`; assets anteriores conservados. Somente dois arquivos de frontend e assets promovidos, sem restart, banco, envios ou configuração do Atlas alterados. CS/Assessoria segue não publicada e deve incorporar esta revisão. Aceite de uso pendente. [Referência](referencias/rastreamento-ficha-layout-2026-10-14.md) · [Release](evidencias/releases/rastreamento-ficha-layout-2026-10-14.json).

**14/10/2026, 12h53 — UTMs na ficha e rastreamento pela mensagem PUBLICADOS.** A ficha separa as cinco UTMs dos nomes de anúncio. Mensagem completa e exclusiva do mesmo cliente/canal identifica o link sem código; UTMs vêm da configuração, sem inventar clique individual. Contato indicado ajustado pela primeira mensagem recebida; Linktree corrigido para uso Site, com texto e código desligado preservados. Sete scripts Node, dez casos isolados dos handlers, build, notebook/celular e navegador autenticado passaram. `index.0298c2a9.js` / `index.94bf622f.css`, recarregar `?v=0298c2a9#/rastreamento?aba=leads`; assets anteriores conservados. Dois handlers e módulo compartilhado publicados; somente Edge Functions reiniciado. Sem migração, WhatsApp/CAPI/e-mail ou tarefas alteradas; Atlas pausado. CS/Assessoria segue não publicado e deve incorporar esta revisão. Aceite pendente. [Referência](referencias/rastreamento-utms-2026-10-14.md) · [Release](evidencias/releases/rastreamento-utms-2026-10-14.json).

**14/10/2026, 12h17 — Rastreamento: número do WhatsApp corrigido em produção.** O sufixo de dispositivo (`:15`, por exemplo) deixa de entrar no telefone do seletor. Três destinos já salvos foram corrigidos somente após comparação exata com o JID atual da instância; mesmos links, mensagens, UTMs e históricos preservados. Dois scripts Node, build, três redirecionamentos HTTP e Editar/Novo link no navegador passaram. `index.ab564283.js` / `index.cb906053.css`, recarregar `?v=ab564283#/rastreamento?aba=links`; assets anteriores conservados. Sem migração, restart de backend, envio WhatsApp/CAPI/e-mail ou tarefas alteradas; Atlas pausado. CS/Assessoria segue não publicado e precisa incorporar a correção no próximo candidato. Aceite de uso pendente. [Referência](referencias/rastreamento-telefone-2026-10-14.md) · [Release](evidencias/releases/rastreamento-telefone-2026-10-14.json).

**13/10/2026, 23:40 — Equipe somente por convites de Josias; segurança e compatibilidade concluídas.** Escopo confirmado: apenas funcionários da agência; provisionamento administrativo das lojas/clientes preservado. Cadastro público fechado, convite individual por e-mail com sete dias e uso único; contas pendentes/removidas, sessões revogadas e autoelevação recusadas. Atlas voltou às oito fontes por delegação assinada de até 240 s, limitada ao proprietário ativo; monitor continua pausado. MCP exige aprovação/conta atual e sessão vinculada à identidade; reiniciado, pode exigir reconectar o ChatGPT. Testes Node/SQL com rollback, notebook/celular, build, HTTP e leituras reais passaram. `index.9e0f843e.js` / `index.cb906053.css`, `?v=9e0f843e#/settings?tab=equipe`; conserva `44e11d16`/`66ba606f`. SQL `20261013140451`, `20261013150647`, `20261013152143` e `20261014023511` aplicados uma vez, não reaplicar. Sem envio WhatsApp/CAPI/e-mail, tarefa alterada ou conta real de teste persistida. Aceite de uso e auditoria histórica/globais pendentes. [Referência](referencias/convites-seguranca-2026-10-13.md) · [Release](evidencias/releases/convites-seguranca-2026-10-13.json).

**13/10/2026, 09:52 — Aviso de grupo sem resposta não interrompe a tarefa.** Publicado: o balão fica oculto durante a edição em drawer/formulário e volta ao fechar; o X adia somente o aviso. Intervalos e Minha caixa preservados. Regressão reproduzida e corrigida em notebook/celular, teste de espera e build passaram; assets/estilo servido conferidos. `index.44e11d16.js` / `index.cb906053.css`, recarregar `?v=44e11d16#/tasks`; conserva `66ba606f`/`e981fa67`. Sem SQL, restart de backend, escrita em tarefas, WhatsApp ou CAPI. Aceite pendente. Correção pontual de interface; não altera a conclusão ou o aceite das fases do programa. [Referência](referencias/conversas-aviso-tarefa-2026-10-13.md) · [Release](evidencias/releases/conversas-aviso-tarefa-2026-10-13.json).

<!-- traffic-production-20260918:start -->
## Tráfego publicado na produção — 18/09/2026

Josias autorizou: “subir para o ambiente real, essas mudanças em tráfego”. Rotina semanal, tabela por campanha/conjunto, colagem, navegação por teclado, histórico e revisão/otimização independentes estão na produção [Rotina semanal](https://planeje.jbapex.com.br/?traffic=964c2d76#/paid-traffic/rotina).

Bundle desta entrega: `assets/index.964c2d76.js`; CSS `assets/index.1677bef5.css`. Dados, pessoas, senhas, configurações e integrações reais foram preservados. Nenhum registro ou responsável do teste foi importado. Recorrências chegam desativadas e são configuradas explicitamente por cliente; abrir a grade não cria tarefa, salvar é a criação explícita.

**Fase 7 permanece parcial.** Esta publicação supera as pendências anteriores de promoção deste recorte de tráfego; os registros de 17–18/09 sobre “somente staging” descrevem o estado anterior. Aceite geral de uso, restante da fase 7 e fase 6 permanecem pendentes. Outros trabalhos de Rastreamento/CAPI conservam suas próprias evidências e pendências.

Ver [promoção do tráfego](referencias/fase-7-promocao-trafego-2026-09-18.md) e [release de produção](evidencias/releases/trafego-producao-2026-09-18.json).
<!-- traffic-production-20260918:end -->

Roteiro vigente: programa mestre de sete fases. Este registro consolida as entregas até 16/09/2026. Os detalhes técnicos e evidências estão nos documentos 04 e 09. Números de testes abaixo pertencem às respectivas entregas; não devem ser somados como uma única suíte atual.

## Preparação e diagnóstico — 09 a 11/09

- Leitura do código, banco e módulos existentes: tarefas, projetos, atendimento, clientes, automações, tráfego, CRM e relatórios.
- Comparação com a rotina da agência, requisitos e plano de implantação; identificação do que preservar e do que estava incompleto.
- Diagnóstico de acesso, integrações, rotinas, métricas, backups e riscos do legado. Esse diagnóstico não equivale à correção de todos os achados.
- Recuperação por snapshot confirmada pelo usuário; escolhida uma VPS separada para desenvolvimento.
- Preparado clone isolado em `2.25.216.103`, com Supabase próprio, Storage, frontend e bloqueios de saída/integrações. Túnel no Mac em `localhost:18080`.
- Definida a sequência: todas as fases e validação geral no teste antes de produção.

## Fase 1 — Base do fluxo operacional

**Entregue e testada em 11/09; configuração organizada no clone em 14/09.**

- Funções operacionais com integrantes configuráveis, sem conceder permissões de acesso por pertencer à função.
- Automação pode acrescentar ou substituir os responsáveis pelo destino de uma função.
- Devolução ao produtor a partir do histórico real de saída da etapa de produção; falta de histórico/destino inválido gera pendência visível.
- Conferência das regras que coincidem numa passagem e de conflitos de responsabilidade.
- Proteção do salvamento durante validação de status, preservação de cliente/projeto no retorno, correções de reconexão/cache e paginação em Social.
- Configurações → Equipe passou a editar situação do cadastro e permissão; desativar alguém não redistribui seu histórico automaticamente.
- As regras anteriores foram preservadas. Na organização de 14/09, regras antigas foram pausadas e o ciclo por funções foi configurado no clone; Publicado mantém o encaminhamento da mesma tarefa para Social.

O ciclo validado foi produção → revisão interna → validação interna → contato/aprovação do cliente → alteração para produtor → novas aprovações → agendamento/publicação. Pessoas são ocupantes configuráveis, não regras fixas do sistema.

Evidência da primeira entrega: 55 verificações de aplicação, 19 SQL e 15 com motor/API do clone, além de interface. O mecanismo legado de automações não foi convertido inteiro em uma única transação de banco. Execuções por outros pontos de entrada continuam exigindo revisão dirigida.

## Fase 2 — Publicações por canal

**Entregue e testada em 14/09; fluidez refinada e aceita no histórico.**

- Uma tarefa principal de produção, com publicações independentes por canal/destino.
- Cada publicação possui responsável, data prevista, estado, material/versão e comprovação.
- Publicado exige data real e evidência; pendência em outro canal continua aberta.
- Reagendamento/cancelamento preservam histórico. Cancelados não contam no denominador do progresso.
- Bloqueio de publicação final da tarefa enquanto houver canais pendentes.
- Calendário e Redes Sociais acompanham ocorrências por canal, em filas A publicar, Agendados e Concluídos.
- Seleção múltipla rápida de canais, troca de status dentro da tarefa, logos/progresso em Lista e Kanban.
- Anexos separados entre material principal e versões de cada canal.
- Campo simples Plataforma ocultado para conteúdo; valores legados preservados.
- Correção de atualização/cache que podia fechar a tarefa durante edição de canal.

Validação multicanal: Instagram e YouTube publicados com comprovação; Facebook reagendado e cancelado. A fase controla o trabalho e sua evidência; **não declara publicação externa automática nas plataformas**.

## Fase 3 — Detalhe operacional da tarefa

**Entregue e validada tecnicamente em 14/09, depois refinada em 15–16/09.**

- Áreas Tarefa, Publicações, Anexos, Comentários e Histórico.
- Contadores de canais/anexos e navegação responsiva.
- Resumo com etapa, prazo e responsáveis; acesso à publicação em um clique.
- Digitação e seleção em calendário para datas previstas/publicadas.
- Preservados salvamento, status, automações, tarefas antigas e anexos.
- Em 18/09, correção de uso: o link da aba Anexos voltou a poder ser removido depois da entrega da produção; o horário da primeira entrega continua preservado.

O primeiro desenho do resumo ocupava mais espaço. Os ajustes posteriores compactaram e reduziram repetições; não restaurar o layout inicial só para corresponder a uma captura antiga.

## Fase 4 — Escopo, planejamento, fila, capacidade e SLA

**Entregue no teste a partir de 14/09, com complementos até 16/09. Validação técnica registrada; aceite geral de uso ainda separado.**

### Escopo e capacidade

- Escopo mensal por cliente com quantidades de entregáveis, canais, serviço/produto, responsáveis, tráfego/verba/metas e exceções, com histórico.
- Ficha do cliente é o local de manutenção do contratado. Projetos e Cobertura consultam o mesmo período.
- Fila da equipe por função, carga semanal, atrasos, tarefas sem função e limite configurável. Sem capacidade cadastrada, não presumir sobrecarga.
- Paginação completa e abertura de tarefas gerais/Social no módulo correto.
- Controle de demanda recolhível: origem, urgência, SLA, promessa, replanejamento e rodadas de revisão.
- Replanejamento com tarefa deslocada exige motivo; terceira revisão gera alerta.
- Inferência de função somente quando há um único destino possível; ambiguidade permanece visível.

### Fluxos de conteúdo e visão de trabalho

- Modelos configuráveis para Arte/Carrossel e Vídeo/Reels, usando etapas e funções do mecanismo de Tarefas.
- Funções resolvem pessoas elegíveis; substituições futuras acompanham a configuração.
- Retorno para alteração usa a última produção real, preservando novo ciclo de revisão.
- Tarefas antigas não receberam fluxo presumido. Adesão explícita mantém compatibilidade.
- Entrada A Fazer; só pular briefing/roteiro quando o usuário confirma que já estão prontos.
- Visão pessoal por funções/atribuições e opção Visão da agência, com preferência por usuário.
- Barra das visões de Tarefas com a linguagem escura do menu; contêineres de Funções/Fluxos/Conferir passagem reorganizados.

### Documento, materiais e atalhos para Tarefas

- Projeto abre um resumo do documento; Visualizar plano mostra leitura formatada e Criar/Editar plano abre editor em popup.
- Editor visual, colagem com listas/tabelas/formatação, salvamento manual/automático, rascunho local e proteção contra sobrescrita concorrente.
- Materiais editáveis diretamente em O que será produzido; campos vazios/opcionais ficam recolhidos.
- Atalhos na linha para datas, canais e primeira etapa necessária.
- Ler plano com IA é opcional: prévia editável, texto completo, separação de conteúdo, canais/datas explícitas e retirada individual de sugestões.
- Abrir material não cria tarefa. **Enviar para A Fazer** cria/vincula uma única tarefa real.
- Identificação `[Cliente] Tipo Número - Nome`, numeração por tipo, compatibilidade com materiais antigos.
- Vínculo estável `project_id + plan_material_id`, idempotência e proteção contra duplicidade concorrente.
- Reaproveitar plano gera IDs novos e não duplica tarefas, datas ou responsáveis de execução.
- Remover material do plano preserva sua tarefa e histórico; tarefas históricas ficam diferenciadas das do plano atual.
- Depois do vínculo, tarefa é a fonte da execução; edição do plano não reescreve indiscriminadamente o trabalho já registrado.

### Cobertura e saúde da conta

- Comparação por tipo: contratado, planejado, sem tarefa, em execução, entregue e publicações.
- Um material multicanal conta uma unidade de produção; cada canal tem ocorrência de publicação. Novo formato/edição exige outro material.
- Saúde da conta distingue produção organizada, parcialmente planejada, improviso, plano vazio e ausência de produção.
- Ser tarefa de um projeto não basta: o vínculo a um material real do plano determina origem planejada.
- Topo voltado às decisões diárias: clientes para planejar, materiais sem tarefa, tarefas atrasadas e publicações pendentes.
- Busca/filtros e atalhos para plano, popup de tarefas e escopo do cliente.

### Prazos, entrega comprovada e justificativas

- Produção, etapa atual e publicação passaram a ter compromissos separados.
- Marco de produção entregue ao entrar na revisão final de material ou etapa posterior, com anexo/link da própria tarefa. A regra efetiva substituiu a proposta inicial de esperar até Aguardando cliente.
- O prazo histórico de produção fica neutro após entrega; SLA da etapa passa a orientar o trabalho restante.
- SLAs editáveis em Automações → Fluxos. Entrada na etapa inicia seu relógio; espera do cliente não cobra o mesmo SLA interno.
- Postagem próxima/vencida também gera urgência, inclusive antes da entrega e em tarefa sem data de produção.
- Entrega de produção atrasada e avanço de etapa atrasada exigem justificativa conforme os gates de banco; motivo e texto ficam no relatório/histórico.
- Conteúdo não pode usar o novo Concluído operacional para contornar a publicação evidenciada.
- Ordenação considera atraso real, prazo atual/próximo, hora de etapa e urgência. Cobertura foi ajustada para material já entregue.
- SQL de `post_date`, marcos e cobertura já faz parte destas entregas; não consta como migração ainda por fazer.

### Projetos do mês e períodos maiores

- Entrada compacta com clientes sem plano, projetos e conclusão dos materiais; Lista/Kanban e navegação de período.
- Etapas A fazer → Planejamento → Reunião / Aprovação → Execução → Concluídos; Pausados preservado.
- Clientes elegíveis sem projeto aparecem como cards de pendência, sem gravar projetos ao renderizar.
- Automático pode ser desligado e possui mês inicial persistido: outubro/2026 na medição desta documentação. Períodos anteriores mostram projetos salvos, sem gerar pendência retroativa.
- Iniciar plano cria ou reaproveita o projeto do cliente/período e abre o documento.
- Quatro marcos configuráveis no mês anterior: início, plano pronto, aprovação e primeira semana pronta. Projetos antigos aderem individualmente às novas regras.
- Aprovação de projeto gerenciado requer estratégia e materiais; conclusão respeita tarefas vinculadas concluídas.
- Projetos podem abranger mês inicial e final. O projeto é um só; materiais/progresso ficam organizados pelo mês de uso.
- Data de produzir pode estar no mês anterior. Postagem da tarefa vinculada prevalece no mês de uso; sem data, usa-se competência explícita do material.
- Visões Agora e Meus planos mostram preparação já necessária e trabalho do responsável, sem obrigar navegar somente pelo mês de publicação.
- Colunas com a mesma regra de largura de Tarefas (`20rem`, sem encolher), rolagem horizontal no quadro e altura aproveitando a área até o rodapé.

### Visual e ajustes de homologação

- Menu interno com base escura da Saúde do planejamento; seleção da marca e identidade da área do cliente preservadas.
- Cabeçalho compacto reutilizável nas páginas normais, canvas comum e ações concentradas. Conversas e CRM preservam suas estruturas próprias.
- Retirada de cabeçalho global redundante no desktop; online, tema e saída no perfil lateral; `⌘K` preservado.
- Formulário de tarefa: cliente/campanha, tipo/urgência, status/entrega/postagem próximos do topo, conteúdo principal sem blocos obrigatórios repetidos.
- Briefing principal convertido para Orientações para execução. Roteiro/legenda/gravação em Conteúdo separado opcional; CTA/referências não são campos principais separados. Dados antigos permanecem guardados.
- Domínio HTTPS `app.planeje.online` habilitado no staging, sem trocar produção.
- Ajustes de autenticação para a base própria, bloqueio de WebSocket externo sem derrubar a página, troca de senha própria em Configurações e reescrita de URLs de imagens para o Storage isolado. Fotos externas expiradas de contatos são uma pendência diferente.
- IA de texto habilitada com exceção controlada para `openai-chat`/`openrouter-chat`; outras integrações não foram liberadas por isso.

## Fase 5 — Onboarding controlado

**Autorizada por “vamos para fase 5”, entregue e validada tecnicamente em 16/09. Revisão de uso pendente.**

- Modelos editáveis de etapas, ordem, instruções, dependência equipe/cliente, responsável e prazo em dias úteis.
- Snapshot do modelo ao iniciar: mudanças futuras no modelo não alteram clientes em andamento.
- Uma execução ativa por cliente e uma etapa atual por execução.
- Somente a etapa atual cria uma tarefa operacional; próximas etapas não possuem prazo correndo.
- Edição na etapa e na tarefa usam o mesmo conteúdo/responsável/prazo.
- Conclusão pela tarefa ou onboarding avança de forma transacional, sem duplicar o próximo trabalho em repetições/concorrência.
- Última etapa conclui o onboarding; reabertura não cria outro caminho paralelo.
- Gestor configura/inicia; responsável ou gestor ajusta/conclui. Novas tabelas usam RLS e RPCs protegidas.
- Página com Com a equipe, Aguardando cliente, Concluídos e filtro Comigo agora.
- Tarefa de onboarding mostra somente campos pertinentes: sem campanha, postagem ou cobrança de comprovante de produção.
- 31 checklists e 57 itens anteriores preservados, sem migração automática.
- Modelo inicial sugerido: objetivos/escopo (2 dias), informações/acessos (3), organizar operação (2), confirmar início (2). Feriados não incluídos.

Validação: 14 testes Node, SQL autenticado com rollback, duas verificações concorrentes, jornada de interface até conclusão pela tarefa e regressão do fluxo de conteúdo da fase 4. Registros fictícios removidos ao entregar; não remover registros de uso posteriores.

## Fase 6 — Painéis, alertas e gestão

**Planejada; iniciar somente conforme o pedido seguinte do usuário.**

Escopo do mestre: Minha fila, cockpit operacional, painel executivo e alertas de atraso, revisão repetida, aprovação e publicação. Reaproveitar fila pessoal, capacidade, cobertura, marcos/SLA, cards Agora e onboarding atuais; não recriar esses controles como outro motor.

Os critérios recomendados para delimitar a próxima rodada estão no documento 07. São propostas de continuidade, não entregas nem regras novas já aprovadas.

## Fase 7 — Tráfego, resultado comercial e financeiro

**Planejada no programa atual.**

Escopo: rotina de tráfego auditável, pedido estruturado de impulsionamento, campanhas associadas a leads/vendas/receita, diagnóstico de gargalo e financeiro conforme permissões.

A fonte já contém Central de Tráfego, Meta/Google, CRM, PGM e módulos comerciais. Há roteiros/testes próprios com outros números de fase; não usar esses nomes para declarar a fase 7 concluída. A revisão deve conferir ID/período/fonte da atribuição, alçadas, deduplicação, falhas e vendas reais antes de habilitar ações externas.

### Elevação do Rastreamento — 18/09/2026 (início, não conclusão da fase 7)

Pedido: o Planeje deve fazer o mesmo ciclo do TRACK-APICE (RastrackDash), com o hub Rastreamento no mesmo nível de abas/funções, sem copiar o núcleo PalmUP.

Primeira fatia no código:

- Hub `/rastreamento` com Visão geral, Leads, Relatórios, Eventos Meta, Funil e Integrações.
- `?aba=contatos` continua abrindo Leads; a entrada sem `aba` abre Visão geral.
- Eventos Meta lêem `meta_conversion_event_log` e permitem reenviar a tentativa já existente.
- Integrações reúnem a configuração CAPI por canal (WABA, dataset, envio).
- Funil visual do Planeje permanece.

Segunda fatia (Impacto Noivas, 18/09):

- Tabela `rastreamento_conversion_rules` e card de gatilhos em Integrações.
- Marcar etiqueta nova no CRM dispara `Lead` / `QualifiedLead` / `Purchase` pelo caminho CTWA já existente.
- Payload CAPI alinhado ao TRACK: `page_id` preferido, `ph[]` (SHA-256 do telefone) e `custom_data.ad_id`.
- Três gatilhos e três etiquetas de catálogo semeados só no Impacto. Inventário: 4870 contatos, 5175 leads, 2 canais CAPI, 17 eventos históricos falhos — nenhum reenviado.

Ainda não: sucesso CAPI comprovado. Hub publicado em `index.ad437e4b.js`.

Terceira fatia (login da agência + webhook, 18/09):

- Integrações no login admin: token Meta, gatilhos e canais uazapi já existentes, com cópia da URL do webhook. Sem nova conexão WhatsApp.
- Cliente do hub com busca e persistência no navegador. Funil fora das abas principais (`?aba=funil` continua).
- Webhook `uazapi-inbox-webhook` dispara gatilho de etiqueta nova do WhatsApp e de frase na mensagem via `send-ctwa-conversion`.
- Bundle servido `index.6c7bc32d.js`. SQL desta fatia: nenhuma. Eventos históricos não reenviados.

## Atualização de promoção — 16/09/2026

Promoção seletiva 1–5 autorizada e tecnicamente ensaiada em 16/09. Aplicação real concluída, com três perfis ativados por autorização explícita. Não declarar fases 6–7 concluídas nem aceite geral. Ver documento 10.
