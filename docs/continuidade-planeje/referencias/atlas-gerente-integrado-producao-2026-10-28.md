# Atlas gerente integrado — 28/10/2026

## Estado e autorização

**PUBLICADO E VERIFICADO às20h42 de São Paulo (23:42 UTC). Aceite humano do ciclo completo ainda pendente.** A revisão posterior confirmou cinco serviços ativos e nenhum reinício automático dos três consumidores atualizados.

Josias autorizou nesta tarefa: “Vamos corrigir já e se passar nos ambientes de teste pode publicar na VS”. A autorização cobre o reparo, as três migrações novas e a publicação após os testes. Não amplia orçamento, modelos/provedor, destinatários externos, vínculos de grupos ou replay de respostas antigas.

## Comportamento implementado

- A conversa operacional reutiliza o executor central e seus especialistas para investigar perguntas sobre grupos, planejamento, campanhas e registros da tarefa. A consulta da equipe fica restrita ao cliente/assunto autorizado; não recebe memória privada do dono nem fontes financeiras.
- O Atlas precisa ler fontes pertinentes antes de concluir a investigação. Ausência de vínculo, fonte parcial, transcrição incompleta ou métrica indisponível permanecem explícitas; indisponibilidade não vira resultado zero.
- Novas respostas elegíveis da equipe retomam o mesmo objetivo analítico, com autor, data e recibo, sem recriar tarefa ou repetir a pergunta automaticamente. O acompanhamento segue o executor e a etapa oficiais; a conversa privada do dono continua privada.
- Tarefa organizada, informação recebida e entrega conferida são estados diferentes. O reparo não conclui Tarefas por relato, não altera responsáveis oficiais e preserva retornos futuros válidos.
- Planejamento considera escopo estruturado do mês, documento principal e projetos que abrangem o mês, com cobertura e aprovação próprias. A carteira acima do recorte não é apresentada como totalmente conferida.
- Mensagens novas, edição do corpo e mudança/correção de transcrição invalidam a análise antiga antes de gravar o achado. Áudio definitivamente indisponível é uma lacuna; assuntos independentes legíveis continuam elegíveis.
- Cada chamada da investigação central/operacional reserva o orçamento compartilhado existente. Ao atingir o teto, conserva a mensagem/objetivo e adia a tentativa por 15 minutos, sem nova mensagem ou consumo de tentativa humana. Não altera o limite configurado.
- Imagens continuam no modelo e detalhe já configurados. A estimativa separa os tokens de visão do tamanho base64; uso real ou estimativa conservadora em falha é contabilizado uma vez.

## Verificação local e candidata

`npm run check` passou. A validação isolada reuniu 447 verificações PostgreSQL, 329 testes Python, 64 testes Node e 25 cenários de chat em 1280/390px. Provedores e fontes dos testes são fictícios; não houve chamada real de IA, contato à equipe ou WhatsApp de teste.

Revisões independentes do ciclo, privacidade, ACL/RLS, atualidade, orçamento e publicador não deixaram P1/P2 aberto. O publicador final passou 51 testes de guardas/recuperação; o reparo incremental passou 14 testes locais e remotos. A candidata preserva o perfil produtivo somente na VPS e usa o Context limpo do overlay; os recursos locais de consultoria ainda não publicados ficam fora desta entrega.

A primeira preparação parou na guarda do comando central: o runtime usa script relativo ao WorkingDirectory. O comando exato foi preservado e o teste passou. A segunda parou no teste real da ponte por symlink; a resolução canônica do arquivo foi corrigida com regressão vermelha/verde. As duas preparações sem ativação foram preservadas na VPS; nenhuma migração foi aplicada nessas tentativas.

## Operação publicada

Base: `rastreamento-site-source-20261028-01/candidate`, 1.779 fontes, publicada às18h47. Destino: `/root/planeje-releases/atlas-manager-integrated-20261028-01/candidate`. Overlay de 15 arquivos; QA separado, com 27 arquivos.

Aplicadas somente uma vez e em uma transação:

- `20261028213301_atlas_manager_continuation.sql`
- `20261028213302_atlas_operational_investigation.sql`
- `20261028213929_atlas_model_shared_budget.sql`

Consumidores afetados: Central, Team, Events e runtime Edge. Office e Demands conservam seus diretórios, units, flags e drop-ins. A admissão aguarda análises, áudios e ditados ativos. Falha antes de SQL admite recuperação seletiva; após commit exige reparo incremental, sem reaplicar migrações ou reiniciar consumidor incompatível.

## Ativação e conferência

O SQL foi confirmado às20h32. Uma guarda posterior classificou incorretamente como exclusivos do worker dois helpers antigos que já concediam EXECUTE autenticado (`private.atlas_consult_current` e `private.atlas_task_record`); as ACLs e os donos tinham sido preservados exatamente. A recuperação reverteu fontes/HTML sem conflito e parou os três workers afetados e o Edge, mantendo o SQL novo. O reparo aprovado corrigiu somente a classificação da guarda e concluiu a ativação às20h42, sem reaplicar SQL ou mudar essas permissões. Os serviços afetados ficaram temporariamente indisponíveis nessa janela.

Central/Team/Events e Edge foram retomados; Office/Demands mantiveram candidata/configuração anterior. Confirmados cinco HTTP/hashes, 1.785 fontes, bundle `index.38010c1d.js`, CSS `index.5689d236.css`, contratos/ACL/RLS/triggers e rejeição sem autenticação nos sockets. Tarefas, pessoas, mensagens, envios WhatsApp e configurações ficaram iguais durante a publicação. `failed.json` registra a tentativa inicial; `published.json` e `verification.json` posteriores certificam o reparo concluído. Não executar novamente o publicador, o reparo ou as migrações.

No Chrome autenticado a conversa do robô abriu, sem envio, IA ou upload. O mapa ficou vazio na aba de inspeção; os artefatos do escritório e seus hashes foram preservados, mas a renderização do mapa não foi certificada.

Evidência sanitizada: [JSON](../evidencias/atlas-gerente-integrado-producao-2026-10-28.json). Metadados operacionais e recuperação permanecem privados na release da VPS.

## Limites e validação humana

- A auditoria anterior encontrou sete clientes selecionados sem grupo canônico. Este reparo não adivinha nem modifica esses vínculos. Rio Sul tinha essa lacuna; precisa de associação explícita para consultar o grupo correspondente.
- A conversa operacional expõe campanhas Meta registradas e vínculos Google, mas a leitura completa de métricas Google e CRM por esse caminho ainda é uma etapa própria. Sem métricas atuais, não declara desempenho comercial nem saúde positiva.
- Não verifica automaticamente o conteúdo de vídeos/arquivos externos, a qualidade de uma entrega ou o resultado comercial de uma publicação só pela existência de um link.
- O aprendizado com fonte/data e revogação existente é preservado. Esta publicação não demonstra, sozinha, melhora de resultado do cliente nem economia de trabalho humano.
- O replay de respostas antigas não foi ampliado. A retomada automática vale para novas respostas elegíveis; pedidos históricos podem exigir retomada explícita no contexto atual.
- Testes técnicos e publicação não são aceite. Falta observar um ciclo humano real: consulta pertinente → resposta da conta → continuação com executor atual → conferência de entrega.

Referências: [auditoria](atlas-gerente-integral-auditoria-2026-10-28.md), [desenho](../../superpowers/specs/2026-10-28-atlas-gerente-integrado-design.md), [plano](../../superpowers/plans/2026-10-28-atlas-gerente-integrado.md).
