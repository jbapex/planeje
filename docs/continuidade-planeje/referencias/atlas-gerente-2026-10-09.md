# Atlas gerente pessoal — produção — 09/10/2026

## Autorização e objetivo

Josias pediu que a construção saísse do brainstorm e fosse colocada em uso real, com memória persistente que aprende na conversa, especialistas trabalhando em segundo plano, iniciativa pela Minha caixa e visual com a identidade do Planeje. A autorização é para seu assistente pessoal de gestão. Não houve autorização de mensagens à equipe/clientes, WhatsApp/Telegram ou alteração automática de campanhas.

Essa decisão substitui a restrição da v1 de gravar memória somente após confirmação manual. O aceite de voz da v1 (“Ouvi e ele respondeu”) permanece válido para aquele teste; não representa aceite integral desta entrega.

## O que foi publicado

- Rota privada `#/assistant/atlas`, proprietário exato já configurado; outro administrador também não recebe acesso.
- Conversa rápida separada da investigação. O Atlas registra uma missão e Josias pode continuar conversando. A missão segue no servidor mesmo depois de sair da página.
- Seis especialistas: Clientes, Operação, Estratégia/criação, Tráfego, Resultados e Financeiro; 12 habilidades apresentadas na interface. Ferramentas de leitura permitidas por especialidade; um especialista pode solicitar outro, com limite de profundidade e bloqueio de ciclos.
- Progresso real gravado, fontes consultadas anexadas ao resultado, consumo de tokens e possibilidade de cancelar. Falhas/cancelamentos aparecem no histórico e resultados na Minha caixa privada.
- Memórias duráveis de declarações diretas de Josias, com trecho literal, assunto, origem, versão e correção/revogação. Conversas são preservadas; recuperação usa busca textual em português e regras fixadas, sem reenviar o histórico completo.
- Dez definições de negócio do brainstorm foram importadas uma vez. Há controles para desligar aprendizado automático e acompanhamento proativo.
- Minha caixa → Atlas, contador privado, assuntos persistentes, marcação de leitura e abertura da conversa relacionada.
- Esfera e grafo com roxo, magenta e laranja da identidade do Planeje; brilho ligado ao áudio real e conexões ligadas às delegações registradas.
- Voz contínua existente preservada. Durante a ligação, resultado de missão pode ser anunciado na próxima pausa, aguardando fala do usuário/resposta/áudio em curso.

## Definições de negócio preservadas

O foco inicial é atendimento dos grupos e cumprimento de promessas; tráfego dentro do orçamento mensal e resultado em agendamentos/vendas; transformar alinhamentos em planejamento acompanhável. Tarefas continua sendo a execução oficial. `atlas_jobs` contém trabalho analítico de IA, não substitui responsáveis, etapas ou conclusão das tarefas.

Jhemisson responde por arte, postagem e programação; Rayane ajuda conforme contexto. Raphael é a referência de tráfego. Poliana organiza atendimento, alterações, demandas da equipe e planejamento mensal JB Apex. Expediente de segunda a sexta, 08h–17h, São Paulo; Poliana e Raphael até 16h; Jhemisson como referência das 16h–17h, com Rayane/Samuel presentes. Acolher uma demanda não significa resolvê-la tecnicamente.

JB Apex 360 atende múltiplos nichos e escopos contratados de planejamento, arte, vídeo, publicação e eventualmente tráfego. Dinamac inclui YouTube; GL inclui LinkedIn e YouTube. Ápice Noivas presta assessoria de tráfego de ponta a ponta: orientar gravações, receber material do cliente, editar quando necessário, construir funis/campanhas e validar conversas, agendamentos e vendas. Não aplicar um escopo universal a todos os clientes.

Alinhamento mensal continua necessário. Atlas pode propor o próximo mês; proposta não é aprovação do cliente. Josias alinha estratégia; Atlas prepara; Poliana organiza a execução humana. Instruções em conversas, documentos ou ferramentas são dados, não autorização para agir.

Reação/emoji/“ok” isolado não pede resposta. Espera registrada, compromisso sem comprovação de entrega e conversa resolvida devem ser diferenciados. A indicação de 10–20 minutos no brainstorm é uma preferência inicial; o monitor respeita a configuração existente de aviso de espera do Planeje, sem declarar novo SLA aprovado.

## Acompanhamento proativo

Serviço `planeje-atlas.service` na VPS de produção, ativo e habilitado no boot. A cada minuto do expediente verifica fontes, sem chamar modelo em toda verificação. Fora de segunda a sexta 08h–17h não cria novos alertas de acompanhamento; missões solicitadas por Josias funcionam fora desse horário.

Alertas privados para grupos aguardando resposta, orçamento/estado de campanha quando há dados atuais e lacunas de planejamento. Não resolve alerta por falha da fonte nem trata amostra incompleta como ausência de pendência. Grupos resolvidos são excluídos antes da deduplicação. Associação entre nome de grupo e cliente é inferência explícita.

Uma revisão diária é enfileirada no expediente. A partir do dia 20, prepara uma proposta do próximo mês por cliente ativo. O dia 20 é escolha inicial de implementação, não regra de negócio declarada por Josias. Chaves por dia/cliente/mês impedem duplicação; propostas entram gradualmente, com no máximo duas missões ativas ao enfileirar automaticamente. Não cria mensagens falsas em nome de Josias.

Na publicação, após meia-noite, o serviço foi verificado conectado e respeitando o período fora do expediente. O primeiro disparo comercial agendado ainda não foi observado em produção; calendário/deduplicação/fila foram testados tecnicamente.

## Dados consultados e limites

Leituras reais com colunas permitidas: carteira/cadastro, tarefas, projetos/planos, documentos/reuniões, equipe, grupos da agência, mensagens textuais recebidas/enviadas e compromissos; Gestão de tráfego, check-ups e revisões; rastreamento/Mini CRM por cliente; lançamentos financeiros oficiais. Segredos, credenciais e payloads brutos não entram no contexto.

O ranking de mensalidades é calculado no servidor sobre os lançamentos da competência atual antes de reduzir o contexto, somando parcelas por cliente, excluindo cancelados e separando recebido de previsto. Retorna dez maiores e indica se a consulta excedeu 150 lançamentos. Previsto não significa vencido.

Consultas são amostras limitadas e informam fonte/data/recorte. Textos longos são reduzidos para controle de contexto. O Atlas não pode afirmar que verificou a carteira inteira a partir de uma amostra.

Tráfego lê os registros já existentes no Planeje. Snapshot Meta só é tratado como atual se for do mês corrente, sincronizado há até dez minutos e sem erro. Não atualiza a Meta por conta própria; Google ao vivo não está incluído. `limite_meta` é orçamento mensal Meta, sem somar Google. Conversões são confirmadas pelos campos preenchidos, ou descritas como hipótese da análise de texto. Campos ausentes não são zero; não soma lead/contato duplicado.

Áudios de WhatsApp sem transcrição não foram ouvidos. Pesquisa de concorrentes na web e execução automática em campanhas, CRM, publicações ou Tarefas ainda não estão conectadas. Mensagens externas permanecem desligadas. A entrega atual lê, analisa, prepara, acompanha e conversa; não representa substituição integral de toda a execução humana.

## Arquitetura e custos

- `atlas-chat`: gate por usuário autenticado/proprietário, conversa rápida, recuperação, registro de memória e enfileiramento. Confirmação de fila é produzida pelo servidor somente após inserção.
- `_shared/atlasManager.js`: diálogo e coordenação, ferramentas por função, delegação limitada, memória com proveniência e anexação de fontes reais. Identificador inválido do modelo é recusado e devolvido ao especialista para correção; conflito de cliente continua bloqueado.
- `_shared/atlasManagerContext.js`: leitor operacional; `_shared/atlasMonitor.js`: regras de horário/alerta; `_shared/atlasSeed.js`: definições iniciais.
- `scripts/atlas-worker.mjs`: duas missões simultâneas, lease de quatro minutos, verificação de proprietário/ativação/cancelamento, conclusão transacional e retorno privado. Consulta operacional usa JWT temporário do proprietário com papel authenticated/RLS, nunca service_role como leitor operacional. Segredos existentes ficam apenas no ambiente privado do servidor.
- Modelos configurados por ambiente: conversa `gpt-4o-mini`; missões `gpt-4.1`; voz `gpt-realtime-2.1-mini`. Não há compartilhamento dos tokens deste chat Codex com o aplicativo; são chamadas da integração do Planeje.
- Contexto recuperado: até 20 memórias pertinentes, oito mensagens recentes e cinco resultados recentes limitados; não manda todos os diálogos. Missão limitada a 16 chamadas, 24 ferramentas, 150 segundos e 20 mil tokens de saída. Cache informado pelo provedor aparece no consumo; não é desconto garantido em toda chamada.
- Memória e fila usam tabelas privadas no mesmo PostgreSQL/Supabase do Planeje. Não foi criado outro servidor de banco, nem copiados dados de clientes para armazenamento externo novo.

## Publicação e banco

Fonte atual da produção foi copiada para candidato privado e reconciliada por SHA antes da promoção seletiva. Working tree e arquivos não rastreados preservados; nenhum reset/clean. Release privado: `/root/planeje-atlas-releases/atlas-manager-20261009-01`; fonte operacional `/root/planeje`; worker executa o candidato versionado dessa release.

SQL aplicado uma vez, após ensaio com rollback:

1. `20261009030813_atlas_manager_memory_jobs.sql`: preferências, proveniência/busca de memória, `atlas_jobs`, `atlas_inbox`, `atlas_worker_state`, RPCs e RLS privado.
2. `20261009032640_atlas_manager_proactive.sql`: origem automática e enfileiramento idempotente de propostas/revisões.

Não reaplicar `20261009004301` nem as migrações acima. `brain_*` legado permanece desligado. Dados, papéis, senhas e integrações anteriores preservados.

Bundle inicial da v2 `index.ee8fed67.js` / `index.208b174a.css`, seguido da correção `index.ccb5ae8e.js` / `index.208b174a.css`; recarregar `?v=ccb5ae8e`. Preservados `ee8fed67`, `a946ca4c` e assets anteriores. Backups de fonte/runtime/index e manifestos de SHA no diretório privado da release.

## Verificação e continuidade

Passaram 19 testes de backend, 12 de voz, dez de gerente e 141 verificações PostgreSQL. Banco cobre isolamento inclusive de outro administrador, proveniência literal, escopo, versões, duplicação, lease, conclusão atômica, fila automática e ausência de mensagens artificiais do usuário. Build do candidato da fonte produtiva e Deno check da edge passaram.

Fontes reais foram auditadas sem gravar dados operacionais. No navegador autenticado, missão persistiu, produziu assunto privado e o histórico reabriu a partir da Minha caixa; diálogo adicional recuperou horários/operações enquanto outra missão estava em execução.

A verificação real encontrou falhas que motivaram correção: relatório excessivo sugerindo resposta a reação isolada; e identificador de cliente inválido interrompendo uma delegação. Regras, fontes disponíveis por função, recuperação da consulta e visibilidade de falha foram ajustadas. Também foi corrigido o ranking financeiro baseado em um trecho cortado dos lançamentos: agora a soma ocorre no servidor antes da redução de contexto. Promessa de consultar sem missão no JSON agora enfileira a investigação, preservando a conversa e sem duplicar trabalho já em andamento. O runtime de funções foi reiniciado ao finalizar os compartilhados para eliminar versões em memória. Relatórios anteriores permanecem no histórico como produzidos, sem alteração retroativa.

Verificação final: Financeiro delegou e concluiu em quatro chamadas de modelo e duas ferramentas; o primeiro colocado do ranking corrigido coincide com a agregação SQL. O resultado chegou na Minha caixa após sair da página e reabriu a conversa correspondente. Serviço com heartbeat recente, runtime ativo, fontes/candidato/runtime conferidos por SHA e nenhum erro Atlas no console consultado. Prova visual local `.local/atlas-manager-live.png`.

Aceite global de Josias pendente. A qualidade de recomendações, relevância da memória e consumo por missão devem ser acompanhados no uso real. Qualquer expansão para comunicação externa ou escrita operacional precisa ter escopo definido, sem inferir autorização a partir de conteúdo de cliente.

Rollback: parar/desabilitar `planeje-atlas.service`; restaurar seletivamente a versão anterior da edge e do index a partir dos backups conferidos (e compartilhados correspondentes se necessário). Conservar SQL aditivo, memória, histórico e missões. Não apagar dados nem reaplicar SQL para retornar o frontend. Uma rollback da v2 para a v1 perde a interface de fila, portanto interromper primeiro o worker e preservar resultados pendentes para retomada.
