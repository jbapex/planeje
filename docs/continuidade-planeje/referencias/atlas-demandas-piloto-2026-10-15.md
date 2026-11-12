# Atlas: central de demandas no teste persistente — 15/10/2026

## Resultado e fronteira

Pedido: Josias precisa experimentar o fluxo funcionando, após a proposta de planilha na Minha caixa e arquivos no cliente. Implementação disponível somente no ambiente CS independente da VPS 2.25.216.103, em `http://127.0.0.1:4320/#/caixa`. A aplicação usa autenticação, banco e Tarefas reais **do teste**, com clientes e contas fictícios. Não é a prévia HTML com estado em memória. Não foi publicada em produção nem importou a carteira operacional para escrita.

Fluxo: registrar contexto por texto/ditado → análise sob pedido → pergunta estratégica ou proposta → revisão humana com responsável, prazo, projeto e briefing → tarefa normal/Minha caixa da equipe → comentário da equipe → acompanhamento pelo dono. A aprovação pode criar, vincular ou transferir uma tarefa. Fase, prazo e responsáveis continuam vindo de Tarefas. O repasse manual é identificado como preparação do dono, sem atribuir sua autoria à IA.

A tela aceita agrupamento por cliente, filtros de entrada/decisão/equipe/arquivadas, histórico, vínculos de tarefa/projeto e acesso ao perfil. Demandas no perfil consultam os mesmos registros da Minha caixa; a equipe vê apenas seus repasses e o recorte daquele cliente. Arquivos e memória reutiliza documentos existentes, versões, anexos/links e reuniões; acrescenta pasta/assunto pesquisável. Memórias privadas são exclusivas do dono; um comentário da equipe não vira direção confirmada.

## Exemplos persistidos

- Ateliê Aurora · FICTÍCIO / etiqueta Ápice Noivas: proposta gerada pela IA, revisada/aprovada no navegador; tarefa atribuída ao colaborador fictício e resposta registrada por ele no navegador. Tarefa `d62bdf6e-7b81-4d0f-a57e-a197b5f3434d`.
- Mesmo cliente: pedido de campanha adicional fora do escopo, analisado pela IA; pergunta estratégica deixada aberta ao dono. Nenhuma tarefa de execução criada para esta decisão.
- Studio Horizonte · FICTÍCIO / etiqueta JB Apex: repasse preparado manualmente, aprovado, em andamento, com resposta de impedimento; memória confirmada do cenário. Tarefa `5ace6d71-0347-4428-9fb2-96572e5a518a`.
- Documento fictício “Alinhamento do atendimento”, pasta `Atendimento / Outubro`, salvo no navegador com versão 2. Demais exemplos da Assessoria preservados.

A classificação por operação usa a etiqueta explícita; ausência de etiqueta não vira JB Apex por exclusão.

## Chave de IA: exceção autorizada

A chave antiga de texto do teste respondeu `401 invalid_api_key`. A regra de operação vigente dizia “Não transportar credenciais de produção para testar”. Josias recebeu essa restrição e respondeu expressamente: **“Autorizo a chave atual do Atlas no piloto privado”**. Exceção limitada à chave de IA para análise e ditado deste piloto.

Somente `OPENAI_API_KEY` foi lida da configuração atual do Atlas, transportada via SSH e guardada no teste em `/opt/planeje-cs-integration/atlas-provider-key`, modo 0600. Nenhum valor foi impresso, incluído em fonte, evidência, pacote, build ou navegador. Não foram transportadas credenciais Supabase/WhatsApp/e-mail/CAPI. O bridge lê essa configuração privada e não consulta produção durante o atendimento.

Modelo de análise: `gpt-4o-mini-2024-07-18`, saída JSON estruturada, sem ferramentas, `store:false`; ditado `gpt-4o-mini-transcribe`, português. Somente acionamento humano, sem monitor ou agendamento. Limites próprios iniciais do piloto: 20 tentativas de análise e 40 ditados/dia; tentativas falhas e reservas de fixtures também contam, sem reiniciar consumo para testes. Não alteram os limites do escritório produtivo.

## Implementação e proteção de dados

Migração `20261015174034_atlas_demand_workflow.sql` aplicada **somente uma vez ao banco CS**; correções posteriores de funções aplicadas seletivamente. Não reaplicar a migração inteira nem transportá-la à produção por inferência.

Demandas e eventos privados com RLS; cliente autenticado somente lê as tabelas. Escritas passam por RPC que valida dono humano ativo, sessão vigente, revisão e confirmação explícita. Escrita de resultado de IA é exclusiva de service role no bridge. Aprovação revalida o contexto e os vínculos no banco, serializa confirmações concorrentes e não duplica tarefa/comentário no replay. Transferência preserva título, briefing, prazo, projeto e fase; registra troca no histórico. Tarefa removida não é recriada por replay. Várias demandas podem vincular a mesma tarefa.

Equipe consulta somente tarefa atribuída, briefing compartilhado e comentários; não recebe o registro privado de intake, memória ou análise do dono. Respostas idempotentes entram nos comentários da tarefa, sem concluir a execução. A pendência utiliza o mecanismo existente de Minha caixa.

Contexto da IA inclui demanda, cadastro/etiquetas/escopo, responsáveis cadastrados, tarefas abertas, projetos, memórias ativas, texto dos documentos com leitura IA autorizada e metadados das reuniões. Recorte limitado e cobertura declarada: 50 tarefas, 20 memórias, 10 documentos e contexto máximo aproximado de 30 mil caracteres; bytes de anexos, links externos e WhatsApp não são lidos. Não declarar acompanhamento completo dos grupos neste piloto.

Uma pergunta estratégica descarta os campos de execução inutilizados que o modelo retornar. Isso corrigiu a recusa observada quando o modelo associava uma pergunta a um vínculo inválido; propostas executáveis continuam rejeitando vínculos fora do contexto autorizado. Nenhuma ação é preparada implicitamente pela pergunta.

Bridge `scripts/atlas-demand-pilot/server.py`, serviço próprio `planeje-atlas-demand-pilot.service`; socket Unix em `dist/.runtime/atlas.sock`. Sem nova porta pública. Nginx permite somente as duas rotas de análise/ditado deste piloto; demais funções e transportes externos continuam bloqueados. Áudio em memória durante a chamada, texto/cache privado por até um dia, limpeza oportunista; não há arquivo de gravação persistido pelo bridge. A gravação de fala fictícia usada na verificação é fixture separada.

Frontend novo condicionado a `VITE_ATLAS_DEMAND_PILOT=true`. Candidato reconciliado a partir da fonte CS atual, conservando Assessoria/funil e demais trabalhos existentes. Promoção seletiva ao teste, hash do index e das fontes verificado, assets antigos e socket preservados.

## Validação

- 52 verificações de API/Auth/RLS passaram, incluindo uma análise real com dados fictícios e replay sem nova chamada. Confirmaram aprovação humana/concurrente, tarefa única, Minha caixa existente, resposta idempotente, fase real, troca de responsável sem alterar execução, dados/contexto obsoletos, cliente/projeto incorretos, sessão revogada, privacidade e transportes bloqueados.
- Seis verificações complementares passaram: origem manual explícita, repasse/resposta persistidos, proposta real de IA, transcrição de fala sintética pelo provedor, replay igual e recusa do ditado para colaborador.
- Cinco testes Python de validação do modelo passaram: pergunta sem execução, vínculo não autorizado rejeitado, opcionais vazios normalizados, ausência de responsável escalada e data inválida recusada.
- 16 regressões Node de plano/execução/operação passaram. Builds completos da candidata passaram; nova revisão final registrada na release.
- Navegador autenticado: gestor registrou/analisou/aprovou; colaborador respondeu; a mesma resposta foi vista na aba Comentários de Tarefas. Documento, pasta e versão salvos no cliente; memória confirmada consultada.
- Revisão final: `index-96b0fdb2.js` / `index-779de8cd.css`. Colaborador no perfil vê somente o cliente atual e fase com o nome configurado. Celular: formulário cabe no contêiner e tabela rola internamente; viewport restaurado.
- Reinício do bridge preservou as três demandas, nove eventos e 18 reservas, com fingerprint idêntico; o cache do ditado permaneceu consultável sem nova chamada de IA. Não houve reinício do banco. Chave ausente dos JS servidos e endpoint sem sessão recusado.
- Pergunta estratégica real foi novamente analisada após o ajuste e salva sem execução. Teste do microfone físico de Josias e aceite de usabilidade permanecem pendentes.

As fixtures de resultado de IA utilizadas nos testes de segurança não contam como chamadas reais de modelo. O arquivo `api-checks.json` distingue a única chamada real daquela suíte. Falhas anteriores de chave e de vínculo da pergunta não foram ocultadas nem tiveram o consumo zerado.

## Acesso, reversão e próximos limites

Reabrir túnel: `scripts/cs-integration/open-test.command`. Acesso por conta normal do teste; credenciais existentes em `~/.config/planeje/cs-integration/acesso-teste.txt`, não em documentação pública. Não inserir senha produtiva. Estado fica no banco/volume independente da VPS.

Release remota: `/opt/planeje-cs-integration/releases/atlas-demandas-20261015-01`, com baseline, backup, manifest de promoção e evidências. Reversão de interface: restaurar index anterior preservado em `before/index.html`, sem remover assets ou registros. Parar o bridge impede somente novas análises/ditados do piloto. Não reverter banco apagando demandas/tarefas já avaliadas pelo usuário.

Pendências antes de produção: aceite de uso com Josias, regra de distribuição direta/via Poliana, ajuste do teto e escolha do modelo conforme resultado, reconciliação com produção atual, migrações/políticas e revisão completa do candidato produtivo. Leitura real dos grupos e transcrições deve aproveitar vínculos explícitos e autorização existente, ainda não conectados nesta central. Envio externo e criação automática de tarefas não foram liberados.

## Revisão posterior: título dos novos repasses

Josias pediu o padrão `[Nome do cliente] Ação da tarefa` e perguntou como responsável e datas são escolhidos. A IA já recebe funções/carteira cadastradas e pode sugerir responsável; não há distribuição determinística por tema/capacidade. Prazo sem registro fica vazio; não há cálculo de agenda ou duração por função. Responsável e data continuam sujeitos à revisão humana. Nenhuma nova regra de atribuição ou prazo foi inventada.

O novo título é preparado na revisão e normalizado na criação pelo banco, usando o nome do cadastro autorizado, sem prefixo duplicado e limitado a 180 caracteres completos. Repasse manual segue a mesma regra. Vínculo/transferência/replay preservam o título e as datas da tarefa existente; não houve renomeação em lote. Duplicidade considera o formato novo e o título legado sem prefixo do mesmo cliente.

Migração `20261015234747_atlas_demand_client_task_title.sql`, somente no CS independente; não reaplicar. Helper privado sem concessão a papéis de API; mesma função de aprovação, validação de dono/sessão/revisão e privilégios. 15 verificações API e quatro de apresentação passaram, sem chamada ao modelo; build e conferência visual registrados na release de títulos. Registro e aceite do piloto original permanecem válidos; produção não recebeu esta revisão.

Revisão servida: `index-69af5138.js` / `index-779de8cd.css`. Conferido no navegador: ao sair do campo após digitar apenas a ação, o título voltou ao padrão com o cliente; prévia mostra o nome completo. Fixture visual removida sem tarefa, orientações e repasses já salvos pelo usuário preservados. O túnel local foi reaberto após interrupção; link 4320 disponível novamente.
