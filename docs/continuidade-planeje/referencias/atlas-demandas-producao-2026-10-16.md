# Atlas: central de demandas e acompanhamento — produção, 16/10/2026

Publicado após o pedido explícito de Josias: **“vamos para a vps agora”**. [Minha caixa / Atlas](https://planeje.jbapex.com.br/?v=3413bd21#/caixa). Aceite de uso permanece pendente.

## Entrega

Central real de entrada, análise sob pedido, preparação manual, aprovação e acompanhamento na Minha caixa. Perfil do cliente com **Demandas** e **Arquivos e memória**: documentos, pastas/assuntos, versões, anexos/links, reuniões e memórias privadas do dono. Mesma tarefa e mesmo histórico entre as entradas; nenhuma carteira fictícia foi importada.

Revisão compacta, título `[Nome do cliente] Ação`, sugestão de responsável por cadastro/função/fila e prazo revisável por dias úteis (1 apuração / 3 produção, editáveis) incorporados. A criação, o vínculo com repasse e a transferência continuam sujeitos à confirmação humana. Acompanhar uma tarefa já existente apenas registra um vínculo privado, sem duplicá-la, alterá-la ou gerar comentário.

A equipe informa recebimento, andamento, impedimento, pedido de decisão ou entrega nos mesmos Comentários da tarefa. O dono responde ao pedido exato; entrega informada não conclui a execução. Comentário livre de responsável aparece com autor/data/conteúdo e não é interpretação automática da IA; comentário do dono não é retorno da equipe. Ajuda recolhida. Etapa, prazo e responsáveis continuam vindo de Tarefas.

Os avisos anteriores do escritório foram preservados numa seção recolhida **Avisos e decisões do escritório**. O acompanhamento novo integra-se ao serviço `planeje-atlas-office.service`, sem reativar o monitor legado.

## Rotina automática

Segunda a sexta, **08h–17h, São Paulo**, a cada dez minutos. A leitura determinística consulta apenas tarefas vinculadas ao dono configurado, situação, responsáveis, atualizações e comentários canônicos. Sinaliza em inbox privado: decisões explícitas, entrega para revisão, falta de responsável/delegação ao dono e prazo registrado vencido. O aviso de prazo não afirma ausência de execução. Impedimento continua com a equipe até pedir decisão ou vencer o prazo.

Um aviso por tarefa; várias demandas não o duplicam. Abrir/arquivar é respeitado enquanto a origem não muda; nova evidência pode reabrir o mesmo aviso. Fonte resolvida fecha o aviso. Leitura incompleta falha sem interpretar o resultado como fila vazia. Erro/data da conferência aparecem na central. Não escreve tarefa, não responde pela equipe e não envia WhatsApp, e-mail ou CAPI. Esta conferência não chama IA; análises do escritório existentes e análise humana sob pedido mantêm seus próprios limites.

A publicação ocorreu fora do horário comercial: serviços ativos/heartbeat confirmado, sem erro; **primeira conferência comercial real ainda não observada**. O caminho completo foi exercitado com horário controlado e dados fictícios na cópia isolada. Não confundir esse teste com resposta de funcionário real.

## Primeiro acompanhamento real

- Tarefa existente `[Impacto Noivas] Criar novas campanhas para novembro`, `09ecf513-c981-4bd0-a809-d1c4d5c6cb82`.
- Rafael restof da Silva, 20/10, A Fazer, Plano de novembro de 2026: preservados, inclusive briefing e demais campos, por comparação integral antes/depois.
- Vínculo criado pelo navegador autenticado de Josias, demanda `5e25052e-039e-48f5-af52-8b8bfaec2a50`, em **16/10, 00:01:58**. Um evento privado; **zero comentários** e nenhuma resposta simulada.
- Central mostra **Aguardando confirmação da equipe**. Ficha do cliente consulta o mesmo registro e mostra as três orientações já confirmadas em 15/10.

## Implantação

Candidata seletiva da fonte produtiva, reconciliada com `9aefb86f` / `841037d3`; 829 fontes conferidas antes da preparação. Não foi usado o bundle CS. Somente 24 arquivos sobrepostos, incluindo a migração consolidada e scripts; projetos/funil de Assessoria, imagens/publicação do escritório e demais módulos preservados.

**Build produtivo exige `VITE_ATLAS_DEMANDS_ENABLED=true` e `VITE_ATLAS_DEMAND_PILOT=false`**. Preservar esses valores nos próximos candidatos. Assets publicados: **`index.3413bd21.js` / `index.8a46408f.css`**; assets antigos preservados. Fonte base do próximo candidato deve partir da produção atual e incorporar as revisões locais desejadas seletivamente.

Migração nova **`20261016024216_atlas_demands_production.sql`**, gerada pelo CLI e aplicada **uma vez** em produção. Consolida somente documentos/histórico e as quatro evoluções Atlas do piloto, sem criar campos de projeto/funil da Assessoria. **Não reaplicar na produção nem aplicar esse consolidado no CS que já tem as estruturas.** As migrações originais do piloto não foram aplicadas individualmente em produção. Futuras migrações da Assessoria precisam reconciliar os documentos já publicados, em vez de recriá-los.

Novas tabelas têm RLS; APIs públicas invoker; mutações protegidas por dono humano/funcionário atribuído, papel e sessão ativa, revisão, vínculo e estado real. Delegação de servidor não aprova nem responde como humano. Chave de IA permanece na configuração privada já existente, nunca na interface. Análise sob pedido usa o bridge `planeje-atlas-demands.service`, socket Unix sem nova porta pública, origem e sessão verificadas. Só a rota de análise foi adicionada ao Nginx; ditado produtivo existente preservado. Nginx recarregado e serviço do escritório reiniciado na candidata; contêineres produtivos não reiniciados.

## Validação

- **96 verificações Node**: 36 estado/gerente do acompanhamento, 30 escritório, 11 gerente anterior e 19 backend; cinco verificações Python do resultado estruturado.
- **127 verificações API/RLS/sessão/documentos**: 15 títulos, 29 prazos, 48 ciclo da equipe e 35 segurança/documentos. Mais **oito verificações de integração** do scanner real com REST: gera aviso privado, respeita arquivo, reabre só com mudança, resolve após resposta exata, preserva tarefa e não consulta fora do horário.
- Banco com o esquema completo da produção, sem dados reais, em contêiner/rede internos independentes; JWTs e senhas próprios, sessões sintéticas realmente persistidas. Login por senha não foi coberto nessa cópia. Dono autenticado real conferido no navegador após a publicação; não foi assumida uma sessão real do Rafael.
- Build completo: **41,20 s**; sem identificadores do teste ou snapshots CS no JS servido. Uma chamada real de modelo com contexto fictício: **843 tokens**, saída estruturada válida, nenhuma escrita operacional. Modelo `gpt-4o-mini-2024-07-18`, `store:false`, sem troca de modelo nesta publicação.
- Produção: duas URLs da análise recusam sessão ausente (403), origem externa recusada, ditado anterior continua recusando anônimo (401), serviços ativos, configurações/limites/monitor antigo preservados, documentos e tarefa reais intactos.
- Navegador: central → cliente/demandas → arquivos/memórias → tarefa/Comentários → central. Três memórias reais já existentes conferidas; zero erro de console. Tela estreita sem excesso horizontal; override solicitado 390×844, dimensão CSS reportada 481×1042, página 481 px e painel 393,6/392 px; override restaurado.
- Contêineres `planeje-atlas-release-rest`/`planeje-atlas-release-db`, rede temporária, dados e assinaturas removidos. CS persistente da VPS 103 preservado.

## Continuidade e reversão

Release privada `/root/planeje-releases/atlas-demands-production-20261015-01`, com índice/fontes, Nginx, unidade anterior, esquema e backup restrito dos dados afetados em `before/`. Manifestos `backend-published.json` e `promoted.json` guardam aplicação/hash; não rerodar `publish.py` para corrigir apenas interface.

Reversão visual restaura `before/index.html` e preserva os novos dados. Para reverter serviço/proxy, restaurar unidade do escritório e Nginx anteriores e parar o novo bridge. **Não apagar automaticamente tabelas, tarefas, vínculos, comentários ou documentos** numa reversão. Preservar a demanda real já registrada.

Pendentes: primeiro ciclo comercial observado, aceite do Rafael e de Josias no fluxo real, microfone físico. A central nova ainda não inclui a leitura de WhatsApp ou bytes de anexos na análise; o escritório existente conserva suas fontes. Não criar mensagens/cobranças externas nem tarefas automaticamente por inferência.

[Release e evidência](../evidencias/releases/atlas-demandas-producao-2026-10-16.json). Referências de implementação: [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

![Central produtiva com a Impacto](../evidencias/atlas-demandas-producao-2026-10-16.png)
