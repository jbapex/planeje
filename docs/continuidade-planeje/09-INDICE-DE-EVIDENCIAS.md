**12/11/2026, 00h43 — Rotina semanal PUBLICADA no Gestor IA.** Release `gestor-rotina-20261112-01/candidate`, nove fontes frontend e três MCP sobre o menu vigente; 2.149 fontes. Planilha oficial por cliente/semana, seleção e consulta de leads/agendamentos, com Meta salva. Dez guardas, 60 testes Node, 75 MCP, catálogo com 54 abas, build e 42 verificações HTTPS passaram. Sessão autenticada confirmou entrada, planilha e retorno sem editar dados reais. Perfil, flags, Atlas, Edge, workers e assets anteriores preservados; somente MCP reiniciado, sem SQL/coleta/envio/IA real. Automação por IA/MCP e aceite humano continuam pendentes. [Publicação, evidência e limites](referencias/gestor-ia-rotina-semanal-producao-2026-11-12.md).

**11/11/2026, 23h43 — Menu por categorias e indicadores refinados PUBLICADOS na VPS.** Release `menu-categorias-20261111-01/candidate`, seis sobreposições sobre o CRM cabeçalho e2.144 fontes. Três atalhos e cinco categorias; Gestor IA, CS IA e CRM IA continuam no rodapé como o Squad. Perfil e flags herdados; seis testes do publicador, dois Node na candidata, build, revisão independente e39HTTPS passaram. Sessão autenticada confirmou menu e subpáginas; serviços, runtime e assets anteriores preservados, sem SQL ou reinício. Celular real e aceite de uso pendentes. [Publicação, evidências e limites](referencias/menu-categorias-producao-2026-11-11.md).

**11/11/2026, 08h36 — Perfis, Leads e conversa integrada do CRM IA publicados.** Release `crm-ia-20261111-04`, 41 sobreposições e 2.084 fontes; duas migrations novas aplicadas uma vez, treze no total. Check/286 testes locais e 140 da candidata passaram; revisão independente sem achados pendentes e interface autenticada conferida. HTML, 22 assets e oito bundles/OPTIONS verificados; perfil e Atlas/MCP/sincronizador preservados, sem ativação em massa ou envio/modelo/OAuth real. A meta segue em notificações e demais controles da matriz. [Operação e limites](referencias/crm-ia-perfis-leads-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 07h12 — Concierge, rascunhos e agenda semanal do CRM IA publicados.** Release `crm-ia-20261111-03`, 36 sobreposições e 2.063 fontes; três migrations novas aplicadas uma vez, oito bundles e todos os 22 assets HTTPS conferidos. Check/205 testes locais e 125 da candidata passaram; revisão independente e agenda autenticada conferidas, sem mensagem/modelo/OAuth real. Perfil, Atlas/MCP/sincronizador preservados; nenhuma ativação em massa. A meta continua em perfis, leads e demais controles da matriz. [Operação e limites](referencias/crm-ia-concierge-rascunhos-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 05h33 — Voz, transcrição e Google Agenda do CRM IA publicados.** Release `crm-ia-20261111-02`, 54 sobreposições e 2.046 fontes; quatro migrações inéditas aplicadas uma vez, oito bundles Edge e 22 assets HTTPS conferidos. Check/163 testes locais e 109 testes da candidata passaram; sessão autenticada verificada sem salvar agente, consentir Google ou enviar mensagem. Perfil e serviços Atlas/MCP/sincronizador preservados. Autonomia continua desligada; a meta segue nos controles da matriz de paridade, com homologação real dependente das escolhas do usuário. [Release e limites](referencias/crm-ia-voz-agenda-2026-11-11.md), [paridade observável](referencias/crm-ia-scaleos-paridade-2026-11-11.md).

**11/11/2026, 03h06 — Núcleo CRM IA publicado no Squad.** Dez áreas, agentes tipados, agenda interna, conversas/mídia, fila reservável e especialista no Atlas. Migrações novas aplicadas uma vez; seis bundles Edge e frontend conferidos, sem ativação em massa ou teste real de mensagens/modelo. Voz e Google Agenda seguem em implementação; não inferir equivalência integral ou aceite. [Release e limites](referencias/crm-ia-producao-2026-11-11.md).

**06/11/2026, 12h35 — Conversas por conta e Mini CRM PUBLICADOS no Planeje.** Todos os canais como padrão, filtros/identificação por conta e resumo lateral. Quatro fontes,1.799 conciliados, main9e73612f/CSS80eb966f. Testes locais/naVPS, build produtivo, HTTP/hashes e serviços conferidos; Impacto ativa sem erro. Sem migração/restart/envio. Visual, sessão no navegador e aceite humano pendentes. [Operação, evidência e limites](referencias/rastreamento-conversa-canais-producao-2026-11-06.md).

**05/11/2026, 18h23 — Impacto confirmada na nova conexão por chave.** Durante o diagnóstico da captura, a configuração foi atualizada na interface para `planeje-status-export-connect` e ativada. Organização esperada conferida; teste18h22 e sincronização18h23 sem erro,10.708 registros já iguais/5.063 telefones associados. O agente realizou apenas leituras; nenhuma chave ou configuração alterada por ele. A falha anterior era chave nova enviada à URL fixa antiga. [Evidência](evidencias/releases/crm-self-service-impacto-2026-11-05.json).

**05/11/2026, 18h14 — CRM .87: conexão ao Planeje por loja PUBLICADA.** Administrador gera/revoga chave em Integrações > Planeje. Tela, API e migração nova instaladas; build completo, permissões, HTTP/hashes e preservação da Impacto verificados. Nenhuma outra loja ativada. Base CRM: release planeje-self-service-20261105-01/candidate, main8015b389; Planeje .109 preservado. Primeiro uso de outra loja, visual e aceite humano pendentes. [Operação e evidências](referencias/crm-self-service-producao-2026-11-05.md).

**05/11/2026,17h18 — CRM Ápice PUBLICADO E ATIVO para Impacto Noivas.** Bloco em Rastreamento > Integrações, API na87 e worker/timer na109; migração nova aplicada uma vez. Primeira carga:10.708 registros/5.063 telefones;131 conflitos/vazios preservados. Ciclo automático confirmou zero regravações.100checks, revisão, build e verificações reais passaram; visual/aceite humano pendentes. [Operação, evidência e limites](referencias/crm-status-interface-producao-2026-11-05.md).

**05/11/2026 — Impacto Noivas: Pixel Planeje JÁ PUBLICADO; origem Google fixa constatada.** Tag All Pages e retenção de sete dias presentes no site. Tag e defaults do link forçam google/cpc, permitindo rotular visitas sem evidência como Google. Dez cadastros assim não comprovam dez cliques pagos; nenhum reclassificado. Correção ainda não aplicada, sem publicação/alteração produtiva nesta conferência. [Diagnóstico e limites](referencias/impacto-pixel-site-diagnostico-2026-11-05.md).

**29/10/2026 — MCP: pesquisa geral local.** [Contrato, comandos e limites](referencias/mcp-pesquisa-geral-local-2026-10-29.md); logs/baseline/hashes privados em `.local/mcp-general-20261029`, revisão privada fora do repositório. Sem publicação ou leitura de clientes reais nesta etapa.

**29/10/2026 — Impacto Noivas: recuperação Google AUDITADA, zero elegíveis.**133.210 eventos retidos e128cliques conferidos. Dois contatos Google existentes sem GCLID; única menção nos logs é URL de outro varejista, e clique com GCLID não tem mensagem/código vinculado. Relatório privado na VPS; sem alteração de contato/histórico ou novo deploy, baseb8d86d0b preservada. [Evidência e limites](referencias/impacto-recuperacao-google-auditoria-2026-10-29.md).

**29/10/2026,01h17 — Rastreamento: origem consistente PUBLICADA E VERIFICADA.** Linktree/Source alinhados em lista/ficha/filtros/relatórios/CSV; primeira origem, Google/Meta reais e Mini CRM Meta Link preservados. Overlay de cinco fontes+regressão sobre Atlas01h01/perfil,1.791 fontes, mainb8d86d0b/CSS80eb966f.11 scripts na candidata,24 recuperações locais/remotas, build/revisões, cincoHTTP/hashes e UI autenticada passaram. Sem SQL/restart/regravação/envios; aceite humano pendente. [Operação e limites](referencias/rastreamento-origem-consistente-producao-2026-10-29.md).

**29/10/2026 — Rastreamento: origem consistente LOCAL, NÃO PUBLICADA.** Linktree legado com vínculo Planeje deixa de ser contado como Meta e usa Source; primeira origem, Google/CTWA reais e Mini CRM Meta Link preservados. Lista/ficha/filtros/CSV/relatórios/calendário alinhados;12 scripts, lint/build, CUA e revisão passaram. Sem escrita produtiva; publicação específica/aceite pendentes. [Diagnóstico, evidência e limites](referencias/rastreamento-origem-consistente-local-2026-10-29.md).

**29/10/2026,01h01 — Atlas: chat ampliado por padrão PUBLICADO E VERIFICADO.** Reduzir preservado, sem abertura automática; padrão renovado ao trocar usuário. Um JSX sobre filtro00h35/perfil,1.790 fontes, maincd869874/CSS80eb966f. Três larguras/build,24 recuperações locais/remotas, cincoHTTP/hashes e UI real ampliar/reduzir passaram. Sem SQL/restart/envio; cinco serviços/Edge preservados. Aceite pendente. [Operação e limites](referencias/atlas-expandido-padrao-producao-2026-10-29.md).

**29/10/2026,00h35 — Atlas: filtro por responsável PUBLICADO E VERIFICADO.** Robô → Equipe → Responsável; superadmin seleciona pessoa/Todos e confere contagem. Destinatário atual por ID, abas pessoais/isolamento preservados. Base Rastreamento00h31/perfil,1.790 fontes, main1edf29de/CSS80eb966f. Testes/build,24 recuperações locais/remotas, seisHTTP/hashes e UI real com Poliana passaram. Sem SQL/restart/envio; cinco serviços/Edge preservados. Aceite pendente. [Operação e limites](referencias/atlas-filtro-responsavel-producao-2026-10-29.md).

**29/10/2026 — Atlas: filtro por responsável IMPLEMENTADO LOCALMENTE.** Superadmin, aba Equipe do robô: Todos os responsáveis/pessoa e contagem; destinatário atual por ID, abas pessoais preservadas e filtro zerado na troca de usuário. Sem backend/SQL/permissão nova. Publicação e aceite pendentes. [Contrato e verificação](referencias/atlas-filtro-responsavel-local-2026-10-29.md).

**29/10/2026,00h14 — Atlas: atividade no chat PUBLICADA E VERIFICADA.** Etapas/fontes/especialistas, recibos internos, bloqueios e resposta progressiva após gravação. Base Leads23h57/perfil,1.790 fontes, main318dea93/CSS65c717d0. Migração20261028233500 UMA VEZ; só Team reiniciado, cinco serviços ativos. 467SQL/184Python/41Node, UI, build, revisão e publicador28+9 passaram; seisHTTP/ACL e histórico autenticado conferidos. Trilha nova não retroage; sem IA/mensagem real de teste, aceite humano pendente. [Operação, evidências e limites](referencias/atlas-atividade-producao-2026-10-29.md).

**28/10/2026,23h02 — Atlas: mais espaço no chat PUBLICADO E VERIFICADO.** Ampliar/Reduzir e detalhes recolhíveis;1.786 fontes, perfil herdado de21h54. Build/helpers,24 testes locais/remotos, seisHTTP/hashes e UI autenticada passaram; cinco serviços/Edge preservados. Sem SQL/restart/mensagem real; aceite pendente. [Operação e limites](referencias/atlas-chat-mais-espaco-producao-2026-10-28.md).

**28/10/2026 — Visão geral: prévia LOCAL atualizada com funil/gráfico em destaque.** Captura desktop mostra os dois gráficos;390px mostra etapas e diário. Um JSX apenas reordenado, AST/lint/testes/build e CUA passaram. Sem SQL, dados reais ou publicação. [Prévia, evidência e limites](referencias/rastreamento-visao-geral-origens-local-2026-10-28.md).

**28/10/2026 — Visão geral por origem: evidência LOCAL.** Sete fontes/hashes, oito scripts, lint/build, revisão independente com P2USD corrigido e CUA1440/1024/390/320. Fixtures sintéticas, sem banco/Ads produtivos ou publicação. [Entrega, prévias e limites](referencias/rastreamento-visao-geral-origens-local-2026-10-28.md).

**28/10/2026,21h54 — Atlas: campo compacto PUBLICADO E VERIFICADO.** Cinco fontes visuais sobre Relatórios21h29/perfil;1.785 fontes, mainfbbe0f56/CSS254550cf. Build/helpers,24 testes do publicador, seisHTTP/hashes e UI autenticada passaram; cinco serviços/Edge ativos. Sem SQL/restart ou mensagem/áudio real. Espera por orçamento existente preservada; aceite humano pendente. [Publicação e limites](referencias/atlas-composer-compacto-producao-2026-10-28.md).

**28/10/2026,21h29 — Relatórios compactos: evidência PRODUTIVA.** Dois JSX,1.785 fontes, nove scripts/build,24 fixtures locais/remotas, seisHTTP/hashes e UI real Site/Google. Capturas privadas; cinco serviços/runtime/units preservados, sem SQL/restart/edição comercial/reenvio. [Publicação e limites](referencias/rastreamento-relatorios-compactos-producao-2026-10-28.md).

**28/10/2026 — Atlas gerente integrado: produção verificada.** [Relatório](referencias/atlas-gerente-integrado-producao-2026-10-28.md) · [Evidência sanitizada](evidencias/atlas-gerente-integrado-producao-2026-10-28.json). Migrações únicas, reparo incremental, testes/HTTP/serviços, privacidade/orçamento e limites de ciclo humano/mapa registrados.

**28/10/2026 — Relatórios compactos: evidência LOCAL.** Dois JSX só de estilo, três scripts, lint/build e navegador isolado1440/1024/390/320; cartões/filtros/foco conferidos. Sem VPS, dado real ou publicação. [Escopo, prévias e limites](referencias/rastreamento-relatorios-compactos-local-2026-10-28.md).

**28/10/2026,18h47 — Site/source: evidência PRODUTIVA.** [Operação e limites](referencias/rastreamento-site-source-producao-2026-10-28.md) · [JSON/hashes](evidencias/releases/rastreamento-site-source-producao-2026-10-28.json). Sete overlays,1.779 fontes, nove scripts/build,24 fixtures locais/remotas, seisHTTP/hashes e UI real. Captura privada; cinco serviços/runtime/units preservados, sem SQL/restart/reclassificação/reenvio. Aceite pendente.

**28/10/2026 — Site/source: evidência LOCAL.** [Contrato e comandos](referencias/rastreamento-site-source-local-2026-10-28.md) · [JSON/hashes](evidencias/rastreamento-site-source-local-2026-10-28.json) · [Prévia fictícia](evidencias/rastreamento-site-source-local-2026-10-28.png). Quatro testes Site/oito regressões, lint/build e CUA390/320. Um P2 independente corrigido com RED→GREEN pelo executor; relatório privado. Sem produção, SQL ou eventos reais.

**28/10/2026,18h16 — Atlas gerente integral: evidência de AUDITORIA, somente leitura.** [Achados/fontes/aceitação](referencias/atlas-gerente-integral-auditoria-2026-10-28.md) · [Agregados sanitizados da VPS](evidencias/atlas-gerente-integral-auditoria-2026-10-28.json). Três frentes,83 testes existentes e seis reproduções isoladas; frontend/runtime conferidos. Sem mutação produtiva, IA ou mensagem real. Proposta não implementada nem aceita como ciclo funcional.

**28/10/2026,18h12 — Relatórios Google: evidência PRODUTIVA.** [Operação/limites](referencias/rastreamento-relatorios-google-producao-2026-10-28.md) · [JSON/hashes](evidencias/releases/rastreamento-relatorios-google-producao-2026-10-28.json). Sete overlays,1.778 fontes, seis scripts/build,24 fixtures locais/remotas, seisHTTP/hashes e UI autenticada. Captura privada; cinco serviços/runtime/units preservados, sem SQL/restart/reenvio. Aceite pendente.

**28/10/2026 — Relatórios Google: evidência LOCAL.** [Contrato/comandos/limites](referencias/rastreamento-relatorios-google-local-2026-10-28.md) · [Manifesto sanitizado](evidencias/rastreamento-relatorios-google-local-2026-10-28.json) · [Prévia fictícia](evidencias/rastreamento-relatorios-google-local-2026-10-28.png). Seis scripts, lint/build, revisão privada sem P1/P2 e CUA em desktop/390/320. Sem produção, permissões novas ou conversões reais.

**28/10/2026, 17h01 — Atlas: necessidade/contexto PUBLICADOS.** [Operação](referencias/atlas-excecoes-contexto-producao-2026-10-28.md) · [JSON/hashes](evidencias/releases/atlas-excecoes-contexto-producao-2026-10-28.json). Onze arquivos, migração única,1.774 fontes,172 Python da candidata,33 testes do publicador locais/remotos, seisHTTP/hashes e UI autenticada. Revisão privada encerrada; cinco serviços ativos, orçamento e dados preservados. Sem chamada paga, upload ou mensagem de validação; aceite pendente.

**28/10/2026 — Atlas: evidência LOCAL de necessidade/contexto.** [Referência](referencias/atlas-excecoes-contexto-local-2026-10-28.md) e [manifesto sanitizado/hashes](evidencias/releases/atlas-excecoes-contexto-local-2026-10-28.json). 172 Python, 329 SQL/RLS descartável, 9 resultados Node, UI isolada e check; revisões privadas fora do repositório. Sem migração produtiva, IA real ou mensagens à equipe; publicação/aceite separados.

**28/10/2026, após13h — Atlas: auditoria de necessidade e conversa, SOMENTE LEITURA.** Excesso de mensagens e carga concentrada na conta; prazo futuro não impede cobrança pelo relógio de revisão. Reprodução confirmou perda de contexto pelo filtro de exclusão; resposta de agendamento manteve dependência antiga. Análise dos grupos está em fila por teto; avisos determinísticos continuam. Próxima proposta: acompanhamento por exceção, datas oficiais, continuidade e fila consolidada. Nada foi alterado na VPS. [Auditoria e critérios](referencias/atlas-auditoria-necessidade-2026-10-28.md).

**28/10/2026, 12h14 — Atlas: novo registro produtivo com13hashes reais/composição, autorização, duas migrações uma vez, cinco serviços ativos, SQL/HTTP, revisão e reparo à frente. Evidência local permanece histórica; ciclo humano pendente.** [Publicação, operação e limites](referencias/atlas-aprendizado-contato-producao-2026-10-28.md)

**28/10/2026 — Histórico de origens.** [Local](referencias/rastreamento-historico-origens-local-2026-10-28.md), [hashes/testes](evidencias/rastreamento-historico-origens-local-2026-10-28.json), [produção](referencias/rastreamento-historico-origens-producao-2026-10-28.md) e [release](evidencias/releases/rastreamento-historico-origens-2026-10-28.json). Migração única e primeira origem principal; sem backfill ou envio real de teste.

**28/10/2026, 09h03 — Hoje: conversas de tráfego e prioridades PUBLICADAS.** Contador compacto, Dialog e Urgente/Atrasado/Vence hoje em Lista/Quadro. Base traffic-conversations-20261028-01/candidate herda Atlas08h11/perfil; 1.757 fontes, main f207f736/57335d29. Só migração20261028110040 aplicada uma vez e eventos reiniciado; cinco serviços ativos. 114 Python,16 Node,build,20 fixtures de publicação, revisão, SQL/ACL e seis HTTP/hashes passaram. UI autenticada confirmou popup e análise pendente; ciclo real de Rafael e aceite pendentes. [Publicação e limites](referencias/trafego-conversas-prioridades-producao-2026-10-28.md).

**28/10/2026 — Atlas: novo registro local de aprendizado observado/contato, com13 hashes de produto,286 SQL/RLS,266 Python,29 Node e relatórios privados das revisões. Estado explicitamente local/não publicado.** [Entrega, fontes e limites](referencias/atlas-aprendizado-contato-local-2026-10-28.md)

**28/10/2026 — Hoje: evidência local de conversas e prioridades.** PostgreSQL descartável, 12 cenários de navegador, regressões de prioridades/Atlas e check; relatório sensível privado fora do repositório. Sem publicação nem aceite humano. [Escopo, comandos e limites](referencias/trafego-conversas-prioridades-local-2026-10-28.md). [Manifesto sanitizado](evidencias/releases/trafego-conversas-prioridades-local-2026-10-28.json).

**28/10/2026, 08h11 — Atlas: envio/identidade PUBLICADOS.** [Operação e limites](referencias/atlas-envio-identidade-producao-2026-10-28.md) · [Registro sanitizado](evidencias/releases/atlas-envio-identidade-producao-2026-10-28.json).200 Python remotos,19fixtures, oitoHTTP, SQL/ACL/índice, runtime e UI autenticada conferidos. Primeira consulta humana/IA real e aceite pendentes.

**28/10/2026 — Atlas: envio/identidade verificados LOCALMENTE.** [Diagnóstico e comandos](referencias/atlas-envio-identidade-local-2026-10-28.md) · [JSON/hashes](evidencias/releases/atlas-envio-identidade-local-2026-10-28.json). 200 Python,244 SQL por etapas,28 grupos de navegador, check e revisão independente; migração/publicação produtivas não realizadas.

**27/10/2026, 16h12 — Atlas: conversa/equipe PUBLICADOS PARA VALIDAÇÃO.** Fatos persistidos, avisos curtos/contexto recolhido, fila pessoal e supervisão, resposta posterior e retorno de aprovação do grupo. Base atlas-dialogue-20261027-02/candidate herda traffic-save02 e perfil produtivo;1.752 fontes, main9982524c/ee022d49. Só migração20261027170137 aplicada UMA VEZ; team/events reiniciados, cinco serviços ativos.188 Python remotos, build,13 fixtures de publicação, SQL/HTTP/hashes passaram. Fila/contexto/conversa autenticados abriram; mapa incorporado ficou vazio na inspeção, seus arquivos íntegros. Sem IA/mensagem de teste; ciclo humano, mapa no navegador de Josias e aceite pendentes. [Publicação e limites](referencias/atlas-conversa-equipe-producao-2026-10-27.md).

**27/10/2026, 16h08 — Rotina semanal: salvamento e atualização dos atrasados PUBLICADOS.** Botão/fila, primeira gravação, conflito, descarte e atualização do Hoje corrigidos; reabertura sincronizada com Tarefas. Migração20261027184719 aplicada uma vez, preservando dono/ACL/histórico. Base traffic-save-20261027-02/candidate,1.750 fontes, main2bd8f173/bc73e6cf.15 cenários da candidata, build/testes, cincoHTTP e quatro serviços passaram; sessão real carregou a rotina. Sem escrita de teste em clientes ou restart; aceite de uso pendente. [Publicação e limites](referencias/trafego-salvamento-rotina-producao-2026-10-27.md).

**27/10/2026, 15h26 — Google Data Manager e leitor Chatvolt PUBLICADOS.** Data Manager v1 e diagnóstico/reenvio individual; Cloud/OAuth real ainda pendentes, nenhum evento de teste. Histórico recupera eventos sem telefone por conversa conhecida do mesmo cliente, mídia inbound sem legenda, erros/horário de recebimento visíveis e Atualizar. Ordem exata sem timestamp original continua limitada. Base google-data-manager-20261027-02/candidate,1741fontes, main d69b7d6b/bc73e6cf, só Edge reiniciado; quatro Atlas, cincoHTTP e cinco sondagens conferidos. Sem SQL/backfill/edição de cliente. [Publicação e limites](referencias/google-data-manager-chatvolt-producao-2026-10-27.md).

**27/10/2026 — Atlas: implementação LOCAL de conversa/equipe.** [Entrega e comandos](referencias/atlas-conversa-equipe-local-2026-10-27.md) · [JSON/hashes](evidencias/releases/atlas-conversa-equipe-local-2026-10-27.json). 188 Python,181 SQL descartável,18 verificações de navegador e check; revisão encerrada. Nenhuma migração/restart/publicação produtiva ou chamada paga de IA nesta QA; não equivale a aceite humano.

**27/10/2026 — Atlas: especificação de continuidade e plano de reparo.** [Desenho e exemplos](../superpowers/specs/2026-10-27-atlas-conversa-equipe-design.md) · [Plano de execução](../superpowers/plans/2026-10-27-atlas-conversa-equipe.md). Documentos de intenção/aceitação; não são evidência de implementação, teste do modelo ou publicação. Diagnóstico continua vinculado à auditoria somente leitura de 13h24.

**27/10/2026, 13h28 — Rastreamento invisível PUBLICADO.** [JSON/hashes](evidencias/releases/rastreamento-identificador-invisivel-producao-2026-10-27.json) · [Escopo/limites](referencias/rastreamento-identificador-invisivel-producao-2026-10-27.md).1.737 fontes,38 cenários de handlers,23 testes de recuperação/ativação, cinco HTTP, Edge saudável e quatro serviços conferidos. Uma configuração de link editada; demais links/regras preservados, sem migração ou mensagem real de teste. Validação humana pendente.

**27/10/2026, 13h24 — Atlas: auditoria de comportamento/visibilidade.** [Achados e próximos reparos](referencias/atlas-auditoria-equipe-2026-10-27.md). Contagens agregadas, funções/políticas produtivas e hashes; dois diagnósticos puros locais. Nenhum conteúdo bruto de cliente copiado para o relatório. Sem alteração produtiva, IA ou mensagem de teste; não equivale a correção/aceite.

**27/10/2026 — Rastreamento invisível, SOMENTE LOCAL.** [Contrato e comandos](referencias/rastreamento-identificador-invisivel-local-2026-10-27.md) · [Desenho aprovado](../superpowers/specs/2026-10-27-invisible-click-attribution-design.md). Teste RED→GREEN, 38 cenários dos handlers, cinco regressões e check com build temporário; dois achados da revisão corrigidos e retestados. Sem publicação ou transporte real.

**27/10/2026, 00h11 — Atlas: aviso recolhível PUBLICADO.** [JSON/hashes](evidencias/releases/atlas-aviso-recolhivel-producao-2026-10-27.json) · [Publicação e limites](referencias/atlas-aviso-recolhivel-producao-2026-10-27.md). Cinco cenários novos e cinco de retry, lint/build local, build VPS, revisão, onze testes de recuperação locais/remotos, guarda 1.735, cinco HTTP e quatro serviços passaram. Sem SQL/restart/IA/mensagem de teste; aceite humano pendente.

**26/10/2026 — Atlas: aviso recolhível LOCAL.** [JSON/hashes](evidencias/releases/atlas-aviso-recolhivel-local-2026-10-26.json) · [Escopo/limites](referencias/atlas-aviso-recolhivel-local-2026-10-26.md). Cinco verificações novas e cinco de retry isoladas, lint sem erros/build temporário; zero produção/IA/mensagem real. Publicação/aceite pendentes.

**26/10/2026,12h10 — Webhook nas automações PUBLICADO.** Fontes por número, ecos da empresa no executor existente e probe sem número fora do seletor. Maison vinculada ao número real em chegada/agendamento pela UI; canal anterior e outros clientes preservados.52 planner/25 handlers/9 SQL-RLS/18 recuperação, builds, revisão, guarda1735, HTTP/runtime/serviços e UI passaram. Migração nova aplicada UMA VEZ na05; hotfix sem SQL. Sem WhatsApp/CAPI/IA de teste ou replay; próximo evento real/aceite pendentes. [Escopo e evidência](referencias/mini-crm-fontes-webhook-2026-10-26.md).

**23/10/2026,14h11 — Atlas: acompanhamento atualizado PUBLICADO.** [JSON da publicação](evidencias/releases/atlas-acompanhamento-atualizado-producao-2026-10-23.json) · [Escopo e limites](referencias/atlas-acompanhamento-atualizado-producao-2026-10-23.md). Guarda1.731, cinco overlays, migração única,96 Python locais/remotos,140 SQL locais,14 testes de publicação locais/remotos, seis HTTP/quatro serviços e68 observações atuais. Sem IA ou mensagem de teste; aceite humano pendente.

**23/10/2026 — Atlas: acompanhamento atualizado, SOMENTE LOCAL.** [JSON/hashes](evidencias/releases/atlas-acompanhamento-atualizado-local-2026-10-23.json) e [escopo/limites](referencias/atlas-acompanhamento-atualizado-local-2026-10-23.md). 96 testes Python/140 verificações PostgreSQL/RLS; revisão independente com seis P2 resolvidos e nenhum P1/P2 aberto. Sem IA, mensagens reais, migração ou publicação produtiva.

**20/10/2026,13h11 — Atlas: fontes da tarefa PUBLICADAS.** [JSON da publicação](evidencias/releases/atlas-registros-tarefa-producao-2026-10-20.json). Registra quatro overlays, migração única, serviços/hash/cwd, preservação dos dados e leitura só de metadados. Quatro IA fictícias:3/4originais e4/4replay vinculado por SHA; zero chamadas extras ou mensagens de teste. Primeiro ciclo humano/aceite pendentes. [Publicação e limites](referencias/atlas-registros-tarefa-producao-2026-10-20.md).

**20/10/2026 — Atlas: registros da tarefa SOMENTE LOCAL.** Evidência de 54 testes de conversa/manual, 15 de horário, nove de contexto e109SQL/RLS; quatro chamadas reais fictícias/14.103tokens; sem envio ou escrita produtiva. [JSON e hashes](evidencias/releases/atlas-registros-tarefa-local-2026-10-20.json). Revisão técnica encerrada sem achados; semântica real, publicação e aceite pendentes. [Escopo e limites](referencias/atlas-registros-tarefa-local-2026-10-20.md).

**20/10/2026 — Atlas: identidade PUBLICADA às01h41.** [Referência](referencias/atlas-identidade-conversa-producao-2026-10-20.md) · [JSON](evidencias/releases/atlas-identidade-conversa-producao-2026-10-20.json). Guarda1.727, seis HTTP, quatro serviços, 43 testes remotos e dados/configurações preservados na publicação; sem IA de teste.

**20/10/2026 — Atlas: identidade da conversa, SOMENTE LOCAL.** [Correção e limites](referencias/atlas-identidade-conversa-local-2026-10-20.md) · [Evidência](evidencias/releases/atlas-identidade-conversa-local-2026-10-20.json). Testes usam somente fixtures; sem mensagem/IA real ou publicação.

**19/10/2026, 23h31 — Atlas: reparo do ciclo operacional PUBLICADO PARA VALIDAÇÃO.** Josias autorizou o conjunto; quatro overlays sobre a base vigente, migração nova aplicada uma vez e somente worker da equipe reiniciado. 1.727 fontes, seis HTTP/hashes, quatro serviços e cwd conferidos; tarefas, histórico e configuração preservados durante a publicação. Build/33 Python/56 Node remotos, 15 testes de recuperação e revisões passaram. Mapa e conversa pessoal vistos na sessão real; nenhuma mensagem/IA de teste. Primeiro ciclo humano e aceite pendentes. [Publicação e limites](referencias/atlas-ciclo-operacional-producao-2026-10-19.md).

**19/10/2026 — Atlas: ciclo operacional VALIDADO LOCALMENTE, NÃO PUBLICADO.** Resposta preservada/retomável, contato explícito da conta sem reassinar tarefa, repetição de pergunta suprimida, mudança de atribuição volta à conta e consulta não bloqueia acompanhamento. 91 SQL/RLS, 110 Python, 56 Node dirigidos, cinco verificações de navegador e check passaram. Migração nova só na fixture; publicação, uso real e aceite pendentes. [Correções, evidência e limites](referencias/atlas-ciclo-operacional-local-2026-10-19.md).

**18/10/2026 — Atlas: conversa/atividade publicadas às14h37.** [Publicação e evidência](referencias/atlas-conversa-atividade-escritorio-producao-2026-10-18.md) · [JSON](evidencias/releases/atlas-conversa-atividade-escritorio-producao-2026-10-18.json) · [captura real](evidencias/atlas-conversa-atividade-escritorio-producao-2026-10-18.jpg). 51 Node locais/remotos, 32 UI/dez repetidos, check/builds, revisão, 12 fixtures locais/remotas, seis HTTP e quatro serviços. Aceite pendente.

**18/10/2026 — Atlas: conversa e atividade no escritório, somente local.** [Entrega local e limites](referencias/atlas-conversa-atividade-escritorio-local-2026-10-18.md) · [JSON e hashes](evidencias/releases/atlas-conversa-atividade-escritorio-local-2026-10-18.json). 51 Node, 32 browser, check/builds, capturas fictícias e revisão privada; publicação/aceite pendentes.

**18/10/2026 — Atlas: ordem das fontes, produção às 13h30.** [Correção e evidência](referencias/atlas-ordem-fontes-producao-2026-10-18.md); [release JSON](evidencias/releases/atlas-ordem-fontes-producao-2026-10-18.json). Registra causa real, 42 Node locais/remotos, oito fixtures, probe RLS sem IA/envio, seis HTTP, unidades/cwd e estado igual. Primeiro ciclo humano pós-correção/aceite pendentes.

**18/10/2026, 12h49 — Atlas: conversa interativa no escritório PUBLICADA PARA VALIDAÇÃO.** Josias autorizou o conjunto. Painel privado no mapa, confirmação/busca de cliente, progresso/retomada e acesso às conversas reais da equipe; controlador existente preservado. Correção incremental de sessão aplicada uma vez, sem SELECT amplo em auth.sessions nem relaxamento dos escopos. 55 SQL locais, 47 Node locais/remotos, 28 verificações de navegador, npm check e builds com perfil produtivo/ambiente limpo; duas revisões e 10 testes de recuperação passaram. Seis HTTP/hashes, permissões e quatro serviços conferidos; tarefas, jobs, conversas/mensagens, saídas e política iguais durante publicação. Sessão real abriu conversa e reconheceu Impacto; confirmação não clicada, sem IA/chamado de validação. Mapa ficou vazio na aba de inspeção, observação anterior ainda sem causa; não declarar conferência visual produtiva completa. Main fc221910/92ba26f1; mapa d8cebced/e5ae8acc; base e perfil agora atlas-office-conversation-20261018-01/candidate, guarda 1.719. Unidades mantêm caminhos anteriores; só planeje-atlas e Edge reiniciados. Não repetir publicador/migração. Primeiro retorno humano real e aceite pendentes. [Publicação e evidência](referencias/atlas-conversa-escritorio-producao-2026-10-18.md).

**18/10/2026 — Atlas: conversa interativa no escritório, local somente.** [Entrega e diagnóstico](referencias/atlas-conversa-escritorio-local-2026-10-18.md) · [Evidência e hashes](evidencias/releases/atlas-conversa-escritorio-local-2026-10-18.json). Não publicado; correção incremental de sessão e fluxo com mapa/cliente aguardam autorização para VPS.

**17/10/2026, 22h05 — Atlas: auditoria operacional de somente leitura.** [Auditoria](referencias/atlas-auditoria-operacional-2026-10-17.md). Agregados sem conteúdo de clientes; SQL READ ONLY, seis hashes de runtime conferidos, 85 testes puros e reprodução sintética. Nenhuma alteração produtiva ou aceite do ciclo da equipe atribuído a esta etapa.

**17/10/2026 — Toolkit: evidência da adoção local.** [Setup](../setup.md) · [Evidência](evidencias/releases/toolkit-setup-local-2026-10-17.json). Inclui baseline/final, escopos, revisão, limites e decisões residuais; logs privados, backup e grafo ficam ignorados em .local/graphify-out. Nenhuma evidência de publicação é atribuída a esta entrega.

**16/10/2026, 23h30 — Chamados do robô dentro do escritório PUBLICADOS.** Pedido de Josias: saber quem o Atlas chamou, mensagem, retorno e revisão. Nova aba/entrada Chamados; Aguardando Josias abre assuntos concretos, Aguardando equipe abre conversas reais. Cartões com destinatário, cliente, mensagem/última resposta e revisão; botão abre o assunto exato no robô e sai do modo ampliado. Sugestões abrem demanda/perfil; histórico dos vinte encerrados mais recentes. Contadores de agentes podem se sobrepor e não duplicam assuntos na lista. 14 testes novos/expediente, 30 regressões, build, prévia fictícia computador/celular, consultas PostgREST e navegador autenticado real passaram. Produção: cinco sugestões, zero conversa/mensagem interna; nenhum chamado real criado para teste. Assets `f054f258`/`48915503`, escritório `b0d38839`/`fa6fc7d5`; conserva anteriores. Base `atlas-office-calls-20261017-01/candidate`, guarda de 1.668 fontes. Sem SQL/restart/IA/escrita em tarefa ou mensagem; observação, teto de um milhão e aprovação preservados. Baseline já tinha quatro chamadas/198.224 tokens, inalterados nesta revisão. Aceite e uso de conversa real pela equipe pendentes. [Referência](referencias/atlas-chamados-escritorio-2026-10-16.md) · [Release](evidencias/releases/atlas-chamados-escritorio-2026-10-16.json).

**16/10/2026, 21h59 — Atlas: 1 MILHÃO de tokens/dia e configurações PUBLICADOS.** Josias autorizou o teto e pediu uma tela editável. Salvo pela sessão normal e confirmado após recarregar, sem zerar os 156.710 tokens do dia ou fazer nova chamada de teste. `#/assistant/atlas/configuracoes`, atalho Configurar no escritório e na central, acesso exclusivo do dono; permite aumentar o teto depois. Observação continua ativa, 24 clientes selecionados, chamados automáticos desligados e tarefas sob aprovação. Oito verificações adicionais de limite/RLS, build e navegador computador/tela estreita, persistência e atalho passaram; quatro serviços ativos. SQL novo `20261017005227` aplicado UMA VEZ; não reaplicar. Assets `dddf4065`/`48915503`, escritório `b4d876e6`/`17b78889`; preserva os anteriores. Base atual `atlas-events-settings-20261016-01/candidate`; backend permanece em `atlas-events-production-20261016-01`, sem restart nesta revisão. Aceite de uso e sete vínculos de grupos pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

# Índice de evidências e histórico

**16/10/2026, 21h48 — Atlas por acontecimentos PUBLICADO na VPS real, EM OBSERVAÇÃO.** Entrada produtiva com delegação curta do dono, fila/fontes/transcrições, 100 anteriores, índice de tarefas e rascunhos privados na central/perfil. Somente 17 grupos explicitamente vinculados (24 clientes selecionados; sete sem vínculo); 37 grupos de lojas excluídos antes de IA. Leitor automático antigo substituído, inclusive quando a leitura nova é pausada; robô/áudio/acompanhamento determinístico preservados. 56 verificações Python, 68 API/Auth/RLS/fila, 15 do motor, 38 Node, 15 runtime e navegador computador/tela estreita passaram. Impacto: três chamadas reais, duas recusadas pelo limite do piloto e uma aceita como recorte limitado de cinco pontos para revisão/possível agrupamento; cinco rascunhos, zero tarefa oficial/conversa interna/envio. 121.605 tokens novos + 35.105 anteriores; margens de validação 80/120/160 mil restauradas para **60 mil/dia**, zero reservado. Escolha do teto da operação foi perguntada e aguarda Josias; não presumir um milhão. Assets `7c508ca6`/`d86dd2fb`, base `atlas-events-production-20261016-01/candidate`, webroot `/var/www/planeje`; incorpora sessão/perfil concorrente e corrige espera dos módulos antes do redirecionamento. SQL `20261017000743` e `20261017002459` aplicados UMA VEZ CADA somente na produção/cópia descartável; não reaplicar, não aplicar o consolidado no CS. Perguntas automáticas à equipe continuam desligadas; qualidade semântica, orçamento, responsáveis/vínculos e aceite pendentes. [Referência](referencias/atlas-gatilhos-producao-2026-10-16.md) · [Release](evidencias/releases/atlas-gatilhos-producao-2026-10-16.json).

**16/10/2026 — Atlas por acontecimentos, piloto privado.** [Referência](referencias/atlas-gatilhos-piloto-2026-10-16.md), [release sanitizada](evidencias/releases/atlas-gatilhos-piloto-2026-10-16.json), [computador](evidencias/atlas-gatilhos-piloto-desktop-2026-10-16.png), [celular](evidencias/atlas-gatilhos-piloto-mobile-2026-10-16.png). Runtime, consultas, fontes/IDs fictícios e logs detalhados permanecem privados na release CS. Não confundir com ativação dos grupos reais.

## Cérebro IA — primeira versão — 08/10/2026

Release: [cerebro-ia-v1-2026-10-08.json](evidencias/releases/cerebro-ia-v1-2026-10-08.json). SQL `20261008220000` aplicado uma vez. Bundle vigente `index.a72afcd0.js` / `index.b0db6ea9.css`. Piloto desligado.

## Atendimento nas Páginas Permitidas do login — 06/10/2026

Release: [atendimento-pagina-permitida-2026-10-06.json](evidencias/releases/atendimento-pagina-permitida-2026-10-06.json). Bundle `assets/index.5fe0b226.js`. SQL `20261006210000_atendimento_pagina_permitida.sql` uma vez. Conserva `index.c1b52e96.js`. Funções republicadas. Checkbox confirmado em Ana Júlia (desmarcado, sem Salvar).

## Módulo Atendimento da loja — 06/10/2026

Release: [atendimento-loja-modulo-2026-10-06.json](evidencias/releases/atendimento-loja-modulo-2026-10-06.json). Bundle `assets/index.8d92335a.js`. SQL `20261006140000_atendimento_loja_modulo.sql` uma vez. Conserva `index.6af8bb7e.js`. Funções republicadas.

## Módulos Área do Cliente e PGM no celular — 05/10/2026

Release: [mobile-modulos-area-pgm-2026-10-05.json](evidencias/releases/mobile-modulos-area-pgm-2026-10-05.json). Bundle `assets/index.181b75c3.js`. Sem SQL. Conserva `index.a969a001.js`.

## Desconto e comprovante na folha — 05/10/2026

Release: [folha-desconto-comprovante-2026-10-05.json](evidencias/releases/folha-desconto-comprovante-2026-10-05.json). Bundle `assets/index.41e9da15.js`. SQL `20261005030000` uma vez. Conserva `index.c26ebe6a.js`.

## Valor mensal do cliente por usuário — 05/10/2026

Release: [valor-cliente-por-usuario-2026-10-05.json](evidencias/releases/valor-cliente-por-usuario-2026-10-05.json). Bundle `assets/index.c26ebe6a.js`. SQL `20261005020000` uma vez. Conserva `index.112b6333.js`.

## Módulos Financeiro e Mini CRM — 05/10/2026

Release: [modulos-financeiro-mini-crm-2026-10-05.json](evidencias/releases/modulos-financeiro-mini-crm-2026-10-05.json). Bundle `assets/index.e74e03f4.js`. Sem SQL. Conserva `index.6a4a4d4f.js`.

<!-- agencia-financeiro-20261003:start -->
## Financeiro da agência — 03/10/2026

Release: [agencia-financeiro-ux-abas-2026-10-03.json](evidencias/releases/agencia-financeiro-ux-abas-2026-10-03.json). Bundle `assets/index.b3706be8.js` (operar aba por aba). Sem SQL. Conserva `index.a78abad5.js`. Anterior: [agencia-financeiro-polimento-2026-10-03.json](evidencias/releases/agencia-financeiro-polimento-2026-10-03.json).
<!-- agencia-financeiro-20261003:end -->

<!-- indicadores-colaborador-20261001:start -->
## Indicadores do mês por colaborador — 01/10/2026

Release: [indicadores-colaborador-2026-10-01.json](evidencias/releases/indicadores-colaborador-2026-10-01.json). Bundle `assets/index.a8165bf3.js`. SQL `20261001170000_indicadores_colaborador.sql` uma vez. Publicado no mesmo bundle do Relatório Google (canal) às 12:31; esse deploy não deixou `index.4b9989fc.js` nem backup do `index.html`.
<!-- indicadores-colaborador-20261001:end -->

<!-- atendimento-loja-ia-designer-20260929:start -->
## Designer do agente em página inteira — 29/09/2026

Release: [atendimento-loja-ia-designer-2026-09-29.json](evidencias/releases/atendimento-loja-ia-designer-2026-09-29.json). Bundle `assets/index.ce127164.js`. Sem SQL. Conserva `index.205666ce.js`.
<!-- atendimento-loja-ia-designer-20260929:end -->

<!-- atendimento-loja-ia-followup-20260929:start -->
## Editor do agente em abas e follow-up — 29/09/2026

Release: [atendimento-loja-ia-followup-2026-09-29.json](evidencias/releases/atendimento-loja-ia-followup-2026-09-29.json). Bundle `assets/index.205666ce.js`. SQL `20260929160000_cliente_atend_ia_followup.sql`. Funções `_shared` + `atendimento-planejamento-scheduler` republicadas.
<!-- atendimento-loja-ia-followup-20260929:end -->

<!-- atendimento-loja-lista-conversas-20260929:start -->
## Lista Conversas da Ápice — 29/09/2026

Release: [atendimento-loja-lista-conversas-2026-09-29.json](evidencias/releases/atendimento-loja-lista-conversas-2026-09-29.json). Bundle `assets/index.2dc8e96c.js`. Função `uazapi-inbox-webhook` republicada. INSERT pontual de 1 contato e 1 ficha da Ápice; sem migração nova.
<!-- atendimento-loja-lista-conversas-20260929:end -->

<!-- fotos-clientes-20260924:start -->
## Fotos dos clientes — 24/09/2026

Release: [fotos-clientes-2026-09-24.json](evidencias/releases/fotos-clientes-2026-09-24.json). Bundle `assets/index.7e1a0311.js`. SQL `20260924150000_rewrite_cloud_logo_urls.sql`.
<!-- fotos-clientes-20260924:end -->

<!-- mini-crm-loja-20260923:start -->
## Mini CRM da loja — 23/09/2026

Release: [mini-crm-loja-2026-09-23.json](evidencias/releases/mini-crm-loja-2026-09-23.json). Bundle `assets/index.1ca3884f.js`. SQL `20260923193000_contact_mini_crm.sql`. 300 leads da planilha do JR CAR; 100 com clique CTWA do CQC, sem envio à Meta.
<!-- mini-crm-loja-20260923:end -->

<!-- rastreamento-ficha-marcar-20260923:start -->
## Ficha marca Qualificado e Comprou — 23/09/2026

Release: [rastreamento-ficha-marcar-2026-09-23.json](evidencias/releases/rastreamento-ficha-marcar-2026-09-23.json). Bundle `assets/index.5b9c5c12.js`. Sem SQL.
<!-- rastreamento-ficha-marcar-20260923:end -->

<!-- rastreamento-analysis-relatorio-20260923:start -->
## Relatório conta etiquetas de análise — 23/09/2026

Release: [rastreamento-analysis-relatorio-2026-09-23.json](evidencias/releases/rastreamento-analysis-relatorio-2026-09-23.json). Bundle `assets/index.465fa3eb.js`. Sem SQL.
<!-- rastreamento-analysis-relatorio-20260923:end -->

<!-- rastreamento-analysis-labels-20260923:start -->
## Etiquetas de análise — 23/09/2026

Release: [rastreamento-analysis-labels-2026-09-23.json](evidencias/releases/rastreamento-analysis-labels-2026-09-23.json). Bundle `assets/index.6203f964.js`. Função `uazapi-inbox-webhook`. Sem SQL.
<!-- rastreamento-analysis-labels-20260923:end -->

<!-- relatorio-social-paginas-20260923:start -->
## Relatório de redes — 23/09/2026

Release: [relatorio-social-paginas-2026-09-23.json](evidencias/releases/relatorio-social-paginas-2026-09-23.json). Bundle `assets/index.edf7d179.js`. Função `meta-ads-api`. Sem SQL.
<!-- relatorio-social-paginas-20260923:end -->

<!-- capi-leadsubmitted-resend-20260923:start -->
## Reenvio da conversa iniciada — 23/09/2026

Release: [capi-leadsubmitted-resend-2026-09-23.json](evidencias/releases/capi-leadsubmitted-resend-2026-09-23.json). Bundle `assets/index.defd8ced.js`. Funções `meta-ads-api` e `uazapi-inbox-webhook`. Sem SQL.
<!-- capi-leadsubmitted-resend-20260923:end -->

<!-- google-ads-aba-gestor-20260923:start -->
## Gestor vê a aba Google Ads — 23/09/2026

Release: [google-ads-aba-gestor-2026-09-23.json](evidencias/releases/google-ads-aba-gestor-2026-09-23.json). Bundle `assets/index.d3a94aa2.js`. Sem SQL.
<!-- google-ads-aba-gestor-20260923:end -->

<!-- google-ads-edicao-20260923:start -->
## Edição no Google Ads — 23/09/2026

Release: [google-ads-edicao-2026-09-23.json](evidencias/releases/google-ads-edicao-2026-09-23.json). Bundle `assets/index.c9d44363.js`. Funções `google-ads-api` e `google-data-api`. Sem SQL.
<!-- google-ads-edicao-20260923:end -->

<!-- traffic-report-pdf-tela-20260923:start -->
## PDF do Relatório no tamanho da tela — 23/09/2026

Release: [traffic-performance-report-2026-09-23.json](evidencias/releases/traffic-performance-report-2026-09-23.json). Bundle `assets/index.23a9cae5.js`. Sem SQL.
<!-- traffic-report-pdf-tela-20260923:end -->

<!-- mcp-hub-abas-20260923:start -->
## MCP lê Relatório e dados novos — 23/09/2026

Release: [mcp-hub-abas-2026-09-23.json](evidencias/releases/mcp-hub-abas-2026-09-23.json). Serviço `planeje-mcp` 2.2.0. Sem SQL. Sem bundle.
<!-- mcp-hub-abas-20260923:end -->

<!-- google-data-boards-20260923:start -->
## Abas Analytics e Tag Manager — 23/09/2026

Release: [google-data-boards-2026-09-23.json](evidencias/releases/google-data-boards-2026-09-23.json). Bundle `assets/index.9ebb280b.js`. Função `google-data-api`. Sem SQL.
<!-- google-data-boards-20260923:end -->

<!-- traffic-sheet-column-order-20260923:start -->
## Ordem das colunas — 23/09/2026

Release: [traffic-sheet-column-order-2026-09-23.json](evidencias/releases/traffic-sheet-column-order-2026-09-23.json). Bundle `assets/index.a76ca83d.js`. Sem SQL.
<!-- traffic-sheet-column-order-20260923:end -->

<!-- traffic-routine-fill-dates-20260923:start -->
## Datas do preenchimento — 23/09/2026

Release: [traffic-routine-fill-dates-2026-09-23.json](evidencias/releases/traffic-routine-fill-dates-2026-09-23.json). Bundle `assets/index.8738f47c.js`. Sem SQL.
<!-- traffic-routine-fill-dates-20260923:end -->

<!-- traffic-routine-autosave-20260923:start -->
## Autosave da Rotina — 23/09/2026

Release: [traffic-routine-autosave-2026-09-23.json](evidencias/releases/traffic-routine-autosave-2026-09-23.json). Bundle `assets/index.42a06f99.js`. Sem SQL.
<!-- traffic-routine-autosave-20260923:end -->

<!-- google-data-20260921:start -->
## Google dados — 21/09/2026

Release: [google-data-2026-09-21.json](evidencias/releases/google-data-2026-09-21.json). Bundle `assets/index.bc4e0a9c.js`. Função `google-data-api`. SQL `20260921180000` não reaplicar.
<!-- google-data-20260921:end -->

<!-- traffic-google-ads-keyword-explorer-20260921:start -->
## Palavras tendências Explorer — 21/09/2026

Release: [traffic-google-ads-keyword-explorer-2026-09-21.json](evidencias/releases/traffic-google-ads-keyword-explorer-2026-09-21.json). Bundle `assets/index.451a8a34.js`. Função `google-ads-api`. Sem SQL.
<!-- traffic-google-ads-keyword-explorer-20260921:end -->

<!-- traffic-google-ads-keyword-trends-20260921:start -->
## Palavras tendências no Google Ads — 21/09/2026

Release: [traffic-google-ads-keyword-trends-2026-09-21.json](evidencias/releases/traffic-google-ads-keyword-trends-2026-09-21.json). Bundle `assets/index.2f3c6b83.js`. Função `google-ads-api`. Sem SQL.
<!-- traffic-google-ads-keyword-trends-20260921:end -->

<!-- traffic-google-ads-dashboard-20260921:start -->
## Barrinha Google no Dashboard — 21/09/2026

Release: [traffic-google-ads-dashboard-2026-09-21.json](evidencias/releases/traffic-google-ads-dashboard-2026-09-21.json). Bundle `assets/index.4d613e45.js`. Sem SQL.
<!-- traffic-google-ads-dashboard-20260921:end -->

<!-- mcp-hub-abas-20260921:start -->
## MCP lê tráfego, redes e rastreamento — 21/09/2026

Release: [mcp-hub-abas-2026-09-21.json](evidencias/releases/mcp-hub-abas-2026-09-21.json). Serviço `planeje-mcp` 2.1.0. Sem SQL. Sem bundle.
<!-- mcp-hub-abas-20260921:end -->

<!-- social-keep-last-snapshot-20260921:start -->
## Redes Sociais guarda a última verificação — 21/09/2026

Release: [social-keep-last-snapshot-2026-09-21.json](evidencias/releases/social-keep-last-snapshot-2026-09-21.json). Bundle `assets/index.f2cf4646.js`. Sem SQL.
<!-- social-keep-last-snapshot-20260921:end -->

<!-- traffic-google-ads-chart-hover-20260921:start -->
## Hover do gasto por dia no Google Ads — 21/09/2026

Release: [traffic-google-ads-chart-hover-2026-09-21.json](evidencias/releases/traffic-google-ads-chart-hover-2026-09-21.json). Bundle `assets/index.494e89a4.js`. Sem SQL.
<!-- traffic-google-ads-chart-hover-20260921:end -->

<!-- social-overview-meta-check-20260921:start -->
## Visão Geral Meta “não conectada” — 21/09/2026

Release: [social-overview-meta-check-2026-09-21.json](evidencias/releases/social-overview-meta-check-2026-09-21.json). Bundle `assets/index.3d19cdb6.js`. Sem SQL.
<!-- social-overview-meta-check-20260921:end -->

<!-- traffic-google-ads-daily-20260921:start -->
## Gasto por dia e abertura Google Ads — 21/09/2026

Release: [traffic-google-ads-daily-2026-09-21.json](evidencias/releases/traffic-google-ads-daily-2026-09-21.json). Bundle `assets/index.ecdce05b.js`. Função `google-ads-api`. Sem SQL.
<!-- traffic-google-ads-daily-20260921:end -->

<!-- traffic-google-ads-balance-20260921:start -->
## Saldo e extras Google Ads — 21/09/2026

Release: [traffic-google-ads-balance-2026-09-21.json](evidencias/releases/traffic-google-ads-balance-2026-09-21.json). Bundle `assets/index.e523a446.js`. Função `google-ads-api`. Sem SQL.
<!-- traffic-google-ads-balance-20260921:end -->

<!-- traffic-google-ads-catalog-20260921:start -->
## Google Ads no Tráfego Pago — 21/09/2026

Release: [traffic-google-ads-catalog-2026-09-21.json](evidencias/releases/traffic-google-ads-catalog-2026-09-21.json). Bundle `assets/index.41eea459.js`. Função `google-ads-api`. Sem SQL.
<!-- traffic-google-ads-catalog-20260921:end -->

<!-- meta-pixel-por-conta-20260921:start -->
## Pixel da conta de anúncio — 21/09/2026

Release: [meta-pixel-por-conta-2026-09-21.json](evidencias/releases/meta-pixel-por-conta-2026-09-21.json). Bundle `assets/index.96caeee8.js`. Função `meta-ads-api`. Sem SQL.
<!-- meta-pixel-por-conta-20260921:end -->

<!-- meta-token-reuse-20260921:start -->
## Reaproveitar token Meta da mesma BM — 21/09/2026

Release: [meta-token-reuse-2026-09-21.json](evidencias/releases/meta-token-reuse-2026-09-21.json). Bundle `assets/index.f81756bb.js`. Função `meta-ads-api`. Sem SQL.
<!-- meta-token-reuse-20260921:end -->

<!-- traffic-kpi-orcamentos-20260921:start -->
## Orçamentos e Lead qualificado na Rotina — 21/09/2026

Release: [traffic-kpi-orcamentos-2026-09-21.json](evidencias/releases/traffic-kpi-orcamentos-2026-09-21.json). Bundle `assets/index.7d4da7e5.js`. SQL `20260921140000`.
<!-- traffic-kpi-orcamentos-20260921:end -->

<!-- traffic-kpi-por-cliente-20260921:start -->
## KPI por cliente na Rotina — 21/09/2026

Release: [traffic-kpi-por-cliente-2026-09-21.json](evidencias/releases/traffic-kpi-por-cliente-2026-09-21.json). Bundle `assets/index.8ab180f1.js`. SQL `20260921120000`.
<!-- traffic-kpi-por-cliente-20260921:end -->

<!-- ig-schedule-hold-20260921:start -->
## Instagram agenda no Planeje — 21/09/2026

Release: [ig-schedule-hold-2026-09-21.json](evidencias/releases/ig-schedule-hold-2026-09-21.json). Bundle `assets/index.9fe04c0b.js`. SQL `20260921090000`. Função `social-publish-scheduler`.
<!-- ig-schedule-hold-20260921:end -->

<!-- meta-reels-processing-failed-20260921:start -->
## Erro do Reels grande na Meta — 21/09/2026

Release: [meta-reels-processing-failed-2026-09-21.json](evidencias/releases/meta-reels-processing-failed-2026-09-21.json). Bundle `assets/index.9d4f2ef5.js`. Função `meta-ads-api/largeMediaUpload.ts`. Sem SQL.
<!-- meta-reels-processing-failed-20260921:end -->

<!-- redes-reel-preview-phone-20260921:start -->
## Pré-visualização do Reels no celular — 21/09/2026

Release: [redes-reel-preview-phone-2026-09-21.json](evidencias/releases/redes-reel-preview-phone-2026-09-21.json). Bundle `assets/index.ea3cbe31.js`. Sem SQL.
<!-- redes-reel-preview-phone-20260921:end -->

<!-- redes-reel-preview-capa-20260921:start -->
## Preview do Reels e capa — 21/09/2026

Release: [redes-reel-preview-capa-2026-09-21.json](evidencias/releases/redes-reel-preview-capa-2026-09-21.json). Bundle `assets/index.b3fea785.js`. Sem SQL.
<!-- redes-reel-preview-capa-20260921:end -->

<!-- task-publicacoes-thumb-20260920:start -->
## Miniatura na aba Publicações — 20/09/2026

Release: [task-publicacoes-thumb-2026-09-20.json](evidencias/releases/task-publicacoes-thumb-2026-09-20.json). Bundle `assets/index.f7f94a93.js`. Sem SQL.
<!-- task-publicacoes-thumb-20260920:end -->

<!-- drive-picker-maior-voltar-20260920:start -->
## Drive maior e Voltar — 20/09/2026

Release: [drive-picker-maior-voltar-2026-09-20.json](evidencias/releases/drive-picker-maior-voltar-2026-09-20.json). Bundle `assets/index.b0b68248.js`. Sem SQL.
<!-- drive-picker-maior-voltar-20260920:end -->

<!-- drive-picker-thumbs-20260920:start -->
## Miniatura do material no Drive — 20/09/2026

Release: [drive-picker-thumbs-2026-09-20.json](evidencias/releases/drive-picker-thumbs-2026-09-20.json). Bundle `assets/index.223f78bd.js`. Sem SQL.
<!-- drive-picker-thumbs-20260920:end -->

<!-- drive-pasta-favorita-20260920:start -->
## Pasta favorita do Drive — 20/09/2026

Release: [drive-pasta-favorita-2026-09-20.json](evidencias/releases/drive-pasta-favorita-2026-09-20.json). Bundle `assets/index.0bdd3313.js`. SQL `20260920020000` e `20260920030000` (não reaplicar).
<!-- drive-pasta-favorita-20260920:end -->

<!-- task-anexos-lista-20260919:start -->
## Anexos em lista — 19/09/2026

Release: [task-anexos-lista-2026-09-19.json](evidencias/releases/task-anexos-lista-2026-09-19.json). Bundle `assets/index.34254bf2.js`. Sem SQL.
<!-- task-anexos-lista-20260919:end -->

<!-- task-icones-calendario-ajuda-20260919:start -->
## Ícones, calendário e ajuda no ? — 19/09/2026

Release: [task-icones-calendario-ajuda-2026-09-19.json](evidencias/releases/task-icones-calendario-ajuda-2026-09-19.json). Bundle `assets/index.712de2ef.js`. Sem SQL.
<!-- task-icones-calendario-ajuda-20260919:end -->

<!-- task-publicacoes-por-canal-20260920:start -->
## Publicações por canal — 19/09/2026

Release: [task-publicacoes-por-canal-2026-09-19.json](evidencias/releases/task-publicacoes-por-canal-2026-09-19.json). SQL `20260920010000` (não reaplicar).
<!-- task-publicacoes-por-canal-20260920:end -->

<!-- task-legenda-visivel-20260919:start -->
## Legenda do post visível — 19/09/2026

Release: [task-legenda-visivel-2026-09-19.json](evidencias/releases/task-legenda-visivel-2026-09-19.json). Bundle `assets/index.a0abd9df.js`. Sem SQL.
<!-- task-legenda-visivel-20260919:end -->

<!-- task-publicacoes-simples-20260919:start -->
## Publicações da tarefa a partir do Drive — 19/09/2026

Release: [task-publicacoes-simples-2026-09-19.json](evidencias/releases/task-publicacoes-simples-2026-09-19.json). Bundle `assets/index.f1518423.js`. Sem SQL.
<!-- task-publicacoes-simples-20260919:end -->

<!-- google-drive-media-20260919:start -->
## Google Drive no anexo da tarefa — 19/09/2026

Release: [google-drive-upload-2026-09-19.json](evidencias/releases/google-drive-upload-2026-09-19.json). Bundle `assets/index.ffd2db59.js`. SQL `20260919210000` (não reaplicar).
<!-- google-drive-media-20260919:end -->

<!-- traffic-production-20260918:start -->
## Tráfego publicado na produção — 18/09/2026

Josias autorizou: “subir para o ambiente real, essas mudanças em tráfego”. Rotina semanal, tabela por campanha/conjunto, colagem, navegação por teclado, histórico e revisão/otimização independentes estão na produção [Rotina semanal](https://planeje.jbapex.com.br/?traffic=964c2d76#/paid-traffic/rotina).

Bundle desta entrega: `assets/index.964c2d76.js`; CSS `assets/index.1677bef5.css`. Dados, pessoas, senhas, configurações e integrações reais foram preservados. Nenhum registro ou responsável do teste foi importado. Recorrências chegam desativadas e são configuradas explicitamente por cliente; abrir a grade não cria tarefa, salvar é a criação explícita.

**Fase 7 permanece parcial.** Esta publicação supera as pendências anteriores de promoção deste recorte de tráfego; os registros de 17–18/09 sobre “somente staging” descrevem o estado anterior. Aceite geral de uso, restante da fase 7 e fase 6 permanecem pendentes. Outros trabalhos de Rastreamento/CAPI conservam suas próprias evidências e pendências.

Ver [promoção do tráfego](referencias/fase-7-promocao-trafego-2026-09-18.md) e [release de produção](evidencias/releases/trafego-producao-2026-09-18.json).
<!-- traffic-production-20260918:end -->

O pacote inclui referências selecionadas para não depender de caminhos do Mac anterior. **`referencias/` é histórico de entregas, não lista vigente de próximos passos.** Alguns arquivos descrevem propostas superadas: use 01–07 para interpretar o presente.

## Referências incluídas

| Arquivo em `referencias/` | Papel |
| --- | --- |
| `planeje-programa-mestre.md` | Roteiro atual de sete fases e histórico principal. |
| `fase-1-entrega.md` | Entrega operacional, Equipe e configuração do fluxo. |
| `fase-2-publicacoes-por-canal.md` | Regras/evidências multicanal e fluidez. |
| `fase-3-detalhe-operacional.md` | Primeiro desenho do detalhe, posteriormente refinado. |
| `fase-4-escopo-fila-capacidade-sla.md` | Base e complemento inicial de planejamento; partes de UX foram simplificadas depois. |
| `entrega-planejamento-fase4-2026-09-14.md` | Histórico de complementos, Cobertura, menu, cabeçalhos, materiais e formulário. |
| `projetos-refinamento-mensal-2026-09-16.md` | Entrada mensal inicial; períodos/Agora/automático posteriores estão nos manifests e na consolidação. |
| `plano-prazos-etapas-publicacoes-2026-09-16.md` | Proposta inicial de relógios; foi implementada com marco de entrega na revisão final, diferente do primeiro texto. |
| `fase-5-onboarding-controlado-2026-09-16.md` | Escopo/uso/regras/validação da última fase. |
| `dominio-app-planeje-online.md` | TLS, serviços, Auth, Storage e limitações do domínio de teste. |
| `diagnostico-e-plano-planeje.md` | Diagnóstico inicial, com métricas e achados daquele momento. |
| `mapa-preservacao-planeje.md` | Inventário do que preservar durante a evolução. |
| `parecer-projetos-planejamento-2026-09-14.md` | Parecer inicial e histórico do complemento de Projetos. |
| `plano-fases-preliminar-para-validacao.md` | Roteiro anterior de cinco fases, superado pela numeração atual de sete. |
| `anexo-preservacao-planeje.md` | Evidências e critérios de preservação de módulos existentes. |
| `backup-inicial-LEIA-ME.md` | Registro protegido do backup inicial, sem seus arquivos de dados. |
| `track-apice-impacto-workspace-2026-09-18.md` | Spec operacional do TRACK no workspace Impacto (sem tokens); origem da outra VPS. |

Os originais continuam em `outputs/` e nas pastas de entrega. O anexo técnico completo e documentos de requisitos/preservação mais antigos também permanecem no workspace; não foram tratados como estado atual por conterem numeração/achados anteriores.

## Evidências incluídas

- `evidencias/inventario-staging-2026-09-16.json`: leitura de branch/HEAD/working tree, bundle, hashes de arquivos principais, inventário de migrações/objetos/scripts, serviços, contagens e configuração não sensível do planejamento.
- `referencias/track-apice-impacto-workspace-2026-09-18.md`: spec operacional do workspace TRACK Impacto (sem tokens). Origem: `extensao-whatsapp-planeje/outra vps`.
- `evidencias/releases/`: manifests JSON das entregas, com caminhos de backup, build, validação e comportamento. São evidências históricas de versões anteriores; o último servido no frontend de produção é `index.f7f94a93.js` (miniatura na aba Publicações, `task-publicacoes-thumb-2026-09-20.json`). Bundle anterior do Drive maior/Voltar: `index.b0b68248.js`. Bundle anterior da foto no seletor do Drive: `index.223f78bd.js`. Bundle anterior do Planner: `index.3bd4b589.js`. Bundle anterior da pasta favorita do Drive: `index.0bdd3313.js` (`drive-pasta-favorita-2026-09-20.json`). Bundle anterior da lista de Anexos: `index.34254bf2.js`. Bundle anterior dos ícones/calendário/ajuda: `index.712de2ef.js`. Bundle anterior do quadro do Hoje: `index.b1e11264.js` (`traffic-hoje-quadro-keepalive-20260919.json`). Bundle anterior do cache ao sair/voltar: `index.b7ab94e1.js`. Bundle anterior das Publicações da tarefa: `index.f1518423.js`. Bundle anterior desta ficha: `index.5dd741dc.js`. Bundle anterior da origem em grade: `index.0ded9090.js` (`release-ad-thumbnails-ficha-campos-20260919.json`). Bundle anterior da ficha mais larga: `index.51ef88bd.js` (`release-ad-thumbnails-ficha-layout-20260919.json`). Bundle anterior do Google Drive no anexo: `index.eda4161d.js`. Bundle anterior do formato da ficha: `index.ea0ca13e.js` (`release-ad-thumbnails-ficha-formato-20260919.json`). Bundle anterior da primeira cópia 64 px: `index.01100089.js` (`release-ad-thumbnails-20260919.json`). Bundle anterior do Google Drive da agência: `index.f7047aae.js` (`google-drive-agency-2026-09-19.json`). Bundle anterior do fundo branco nos botões da conta da Rotina: `index.57659354.js` (`traffic-rotina-conta-botoes-20260919.json`). Bundle anterior do fundo sólido nos botões do cockpit: `index.60fb110a.js` (`release-botoes-solidos-20260919.json`). Bundle anterior do contorno dos quadros na semana da Rotina: `index.8f76e87e.js` (`traffic-rotina-contorno-quadros-20260919.json`). Bundle anterior do layout Integrações/Configurações: `index.a489e760.js` (`release-hub-layout-20260919.json`). Bundle anterior da lista da Rotina em cartão: `index.f4e89716.js` (`traffic-rotina-lista-visual-20260919.json`). Bundle anterior Conversas reais/Qualificados no Relatórios: `index.a75f2f80.js` (`release-relatorio-tracking-20260919.json`). Bundle anterior do gasto Meta no Relatórios: `index.4f234e87.js` (`release-relatorio-gasto-20260919.json`). Bundle anterior Ver próximas no Hoje: `index.79d83705.js` (`traffic-hoje-proximas-20260919.json`). Bundle anterior de ligar análise/otimização: `index.61369f1c.js` (`traffic-rotina-auto-tarefas-20260919.json`). Bundle anterior da ficha com foto: `index.77da9df1.js` (`release-lead-ficha-foto-20260919.json`). Bundle anterior da auditoria da conversa: `index.f9479f2e.js`. Bundle anterior do cache da Meta: `index.ecaa1a1d.js`. Bundle anterior da ficha compacta: `index.4cc8a660.js`. Bundle anterior do Dashboard do gestor: `index.ad7dbbd4.js`. Bundle anterior A–D: `index.f9006497.js`. Bundle anterior da fila única: `index.f6dd4f0b.js`. Bundle anterior da fila do gestor: `index.572d9739.js`. Bundle anterior do selo CAPI: `index.9d252c75.js`. Bundle anterior da contagem por primeira mensagem: `index.329d016e.js`. Bundle anterior do período compartilhado: `index.19946466.js`. Bundle anterior dos dois quadros de Eventos: `index.35f59804.js`. Bundle anterior da ficha do lead: `index.34b41f11.js`. Bundle anterior do funil pelos gatilhos ativos: `index.30680cdb.js`. Bundle anterior do gatilho Checkout: `index.fa2cee47.js`. Bundle anterior do checkout Insights: `index.ff5cf430.js`. Bundle anterior do hover: `index.517016d1.js`. Bundle anterior do scroll: `index.e72ed002.js`. Bundle anterior do contraste: `index.faf58537.js`. Bundle anterior do funil claro: `index.655411fd.js`. Bundle anterior do funil escuro: `index.1ca48a7d.js`. Bundle anterior do cockpit: `index.67fbc4d1.js`. Bundle anterior de Resultados: `index.d48101d3.js`. Bundle anterior de Leads/período: `index.476fc260.js`. Bundle anterior do cabeçalho de Tráfego: `index.adc2ff4e.js`. Bundle anterior do canvas de Rastreamento: `index.46cdee3a.js`. Bundle anterior: `index.bcf356f8.js`. Entrega anterior só do visual: `index.7881df77.js`. Quadro do Hoje anterior: `index.205702fd.js`. Inspeção Envio Meta: `index.bf5faa49.js`. Quadro anterior: `index.5da3ca81.js`. Colunas redimensionáveis: `index.6556489e.js`. Planilha única: `index.5c46e3eb.js`. Eventos Meta TRACK: `index.c3605860.js`. Instâncias Uazapi: `index.8034413d.js`. Catálogo da rotina: `index.0717a9c3.js`. Integrações Meta manual: `index.d902a2b4.js`. Hub TRACK: `index.98622c9e.js`. Recorte de tráfego: `index.964c2d76.js` conservado. Gatilhos anteriores: `release-gatilhos-capi-impacto-20260918.json`. Hub anterior: `release-hub-track-spec-20260918.json`. Correção de anexo: `index.c040f6a3.js` conservado.
- `evidencias/fases-resumo.json`: estado resumido das sete fases para importação por outra ferramenta. O Markdown detalha decisões e limitações.
- `evidencias/preparacao-promocao-2026-09-16.json`: registra a preparação documental da promoção seletiva e a leitura de migrações; não representa aplicação ou teste na produção. O procedimento está no [documento 10](10-PROMOCAO-SELETIVA-PARA-PRODUCAO.md).

Nenhum `.env`, token, senha, dump, conteúdo de mensagem ou Storage foi incluído. Hashes identificam arquivos, não comprovam todos os requisitos nem substituem a execução dos testes.

## Atualizar a continuidade

Cada nova entrega deve registrar: pedido/autorização, fase/escopo, comportamento final, arquivos/migrações, ambiente/bundle, testes realmente executados, dados fictícios/limpeza, backup/retorno, limitações e pendências/aceite. Se uma regra mudar, atualize o resumo atual e registre o que substituiu; não deixe dois “próximos passos” incompatíveis.

O arquivo combinado `PLANEJE-CONTEXTO-COMPLETO.md` e o ZIP são derivados desta pasta. Regenerá-los depois de atualizar os documentos, para não distribuir cópias antigas como estado atual.

## Atualização de promoção — 16/09/2026

`evidencias/promocao-candidato-2026-09-16.json` registra autorização, configuração escolhida, pacote e ensaio; não representa implantação real. Valores privados de settings/dumps/roles permanecem nas VPS. Atualização documental salva localmente; sincronização pendente de sincronização.

## Produção implantada — 16/09/2026

- `evidencias/releases/producao-fases1-5-2026-09-16.json`: transação, backup atualizado, horários, contagens antes/depois, instalação e preservação do ambiente.
- `evidencias/verificacao-producao-2026-09-16.json`: HTTP/JS/Auth, serviços, configuração, ACL e PASS de comparação original em 109 tabelas.

Jornada autenticada de uso em produção ainda será acompanhada; não presumir aceite geral.
