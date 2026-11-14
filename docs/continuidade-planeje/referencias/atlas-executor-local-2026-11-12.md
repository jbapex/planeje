# Conversar executor — implementação local de12/11/2026

Josias autorizou analisar o Patrício do ScaleOS, implementar um orquestrador funcional e publicar na VPS depois da validação. O objetivo continua ativo. Esta implementação **ainda não foi publicada**; teste local, produção e aceite humano são estados distintos.

Fontes: [desenho](../../superpowers/specs/2026-11-12-conversar-executor-design.md), [plano](../../superpowers/plans/2026-11-12-conversar-executor.md), [auditoria anterior](scaleos-conversar-2026-11-10.md). Na sessão nova do ScaleOS `7330ff67-f7b9-4cb4-ba6b-81f832de3e3b`, houve consulta CRM comprovada e formulário fictício de seis etapas respondido sem salvar agente. Brain mostrou ensino pelo próprio chat. Capacidades declaradas pelo Patrício não comprovam execução de todas elas.

## Estado local

O Conversar usa runtime específico no `atlas-chat`, preservando provedor/modelo/autenticação e teto compartilhado existentes. Escritório e workers mantêm seus contratos. O modelo usa catálogo fechado, sem ferramenta de aprovação, SQL, RPC ou URL arbitrária. Selecionar especialista chama seu runtime e ferramentas do próprio app. Atividade registra eventos reais, sem simular delegação por temporizador.

Perguntas/propostas são persistidas por dono/conversa/run/cliente. Aprovação recebe ID e revisão; escrita local e recibo são atômicos, com sessão/escopo/versão nativa revalidados. Replays, concorrência e resposta perdida não duplicam gravações. Recusa não altera o módulo. Retomada usa objetivo e recibo do servidor; falha posterior do modelo preserva resultado confirmado.

| Área | Contrato local | Limite aberto |
| --- | --- | --- |
| CRM IA | Leituras de painel, funis, agentes, conhecimento, produtos, configurações, leads/ficha/histórico, conversa privada exata, agenda, modelos e uso. Propostas de funil/etapa/ordem, agente/base/produto/config, lead/movimento, compromisso, atendimento e mensagem pela fila nativa. Slots e calendário consultam serviços oficiais. | Bloqueio, destino/canal e acesso alterados após a aprovação interrompem a entrega na conferência nativa. Provisionamento e OAuth permanecem na tela oficial. |
| CS IA | Leituras de radar/carteira/fontes, saúde, grupos/canais, equipe/tempos e controles. Propostas de saúde, regras, acompanhamento/vínculo, consentimentos e tarefas/equipe. Os cinco serviços nativos de grupo/leitura/consentimentos também passaram em SQL real, além dos testes de assinaturas. | Nenhuma autonomia, worker, WhatsApp ou modelo real ativado como QA. |
| Gestor IA | Leituras de carteira, contas, métricas salvas, campanhas, metas, agenda, decisões, relatórios/portal e rotina. Propostas de meta/ajuste, agenda, modelo, decisão e métricas do portal. Meta permite status/verba e criação pausada de tráfego para website/Facebook Feed, com ledger por etapa e reconciliação GET-only. | Outros objetivos/formatos Meta, upload, PDFs/avisos e comandos fora do catálogo permanecem na superfície oficial. Não afirmar paridade integral com capacidades não observadas. |
| Memória Atlas | Ensino/correção/retirada revisáveis; versões/origem no serviço nativo, sem compartilhamento ou cópia implícitos para o CRM. | Conferência produtiva e apresentação final pendentes. |
| Interface | Menu Planeje, avatar Atlas no atalho/cabeçalho, logos CRM/CS/Gestor, formulário por etapas, resposta livre, antes/depois, efeitos e recibos com links HashRouter. | Polimento final e navegador produtivo pendentes. |

## Evidência e limites

- Testes dirigidos em `scripts/atlas-executor/`: runtime/catálogo/adaptadores, endpoint integrado, hooks e componentes montados. Modelo/transporte usam fixtures; não comprovam provedor real.
- PostgreSQL16 descartável, sockets privados sem TCP: serviços CRM oficiais, decisões/replays/corridas/revogação, Squad e orçamento compartilhado verificados. Dublês/limites são declarados por teste.
- `npm run check` passou antes dos últimos ajustes de especialista/Memória/apresentação; repetir checks afetados na candidata final.
- Navegador integrado1280/1600/390/320px passou em seis etapas, Voltar, teclado, erro, recusa, texto, aprovação perdida, recibo/recarga e movimento reduzido. Evidência sintética privada em `.local/atlas-executor-qa/`; API/auth substituídas somente na prévia.
- Mutação Meta legada protegida e testada. Nova criação usa v25.0; tabela oficial consultada registra término v24 em10/11/2026. Leituras legadas fora da fatia preservadas. Atualização, criação e reconciliação estão ligadas ao endpoint; teste Edge+SQL+Graph fictício confirmou POST único e recibos.
- Catálogo atual:92 operações, sendo56 leituras e36 propostas executáveis. Contagem não prova homologação de transporte produtivo; cada limite de contrato continua explícito.
- Revisões identificaram e corrigiram visibilidade de valores após revogação, revalidação entre chamadas Meta e prazo/medição do orçamento. Os controles pós-fila CRM também passaram nas reproduções nativas independentes. Relatórios privados fora do repositório, em `.codex/security-reviews/atlas-executor-20261112-01/`.
- Nenhuma migration/publicação produtiva desta fatia. Nenhuma mensagem/campanha/alteração de cliente/consentimento Google ou autonomia realizada como QA.

## Continuação

Integrar fila CRM, Meta/ledger e Memória; conferir incerteza sem repetição. Conciliar cada página afetada, testes nativos e revisão sensível do diff exato. Preparar candidata sobre fontes/perfil/flags remotos vigentes; aplicar só migrations inéditas e publicar escopo autorizado. Conferir HTTPS/hashes/serviços/sessão/ciclo funcional. Registrar integrações sem homologação; não inferir aceite.
