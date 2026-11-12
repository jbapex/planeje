# CRM IA — referência ScaleOS, 11/11/2026

## Pedido e método

Josias autorizou nesta conversa analisar o CRM IA do ScaleOS, reproduzir seu comportamento e visual no Squad do Planeje e publicar na VPS depois da validação. “Planilha/planilhas” foi interpretado como Planeje, pelo checkout e pelas entregas Gestor IA, CS IA e Conversar citadas no pedido.

Inspeção autenticada no Chrome em `app.usescaleos.com/apps/crm-ia`, pelo navegador do usuário. Foram abertas as dez áreas principais, suas seções e os editores descritos abaixo. Formulários foram inspecionados e cancelados. Uma mensagem sintética foi digitada para abrir as opções de agendamento e apagada depois de cancelar; nenhuma mensagem foi enviada ou agendada. Não foram ativados formulários, alterados agentes, movidos leads nem excluídos registros.

Este levantamento distingue controles observados de execução comprovada. Não prova código privado, schema, provedor/LLM, concorrência, entrega WhatsApp, retentativas ou custos internos do ScaleOS. Não guarda telefones, conversas, nomes de leads ou credenciais.

## Navegação e visual

Lateral clara, marca no topo, navegação geral compacta, contexto CRM IA, dez itens e Squad no rodapé. Conteúdo branco com cartões de borda muito suave, divisões discretas, cantos arredondados, cinzas neutros e azul nos estados ligados/gráficos. A tipografia observada é Inter; h1 22px/peso500/cor rgb(13,13,13); item lateral 13,5px, cor rgb(86,96,94), raio10px. Capturas de Painel, Conversas e Agentes foram examinadas no navegador. Não reaproveitar marca/logotipo de terceiros.

Rotas: Painel `/apps/crm-ia`; demais `/funil`, `/leads`, `/conversas`, `/agentes`, `/agenda`, `/disparos`, `/rastreabilidade`, `/modelos`, `/configuracoes`. Conhecimento, Produtos e Concierge usam `?aba=` em Agentes.

## Inventário de controles observados

| Tela/seção | Dados e ações |
| --- | --- |
| Painel — Agência | Períodos 7dias/30dias/mês e datas, atualização, Analisar com IA. Cartões leads recebidos, qualificados, conversas abertas separadas IA/humano, próximas reuniões. Fila esperando pessoa abre conversa/fila humana. Série por dia, etapas com contagem/perda, origens e atalho de configuração. Atendimento IA mede primeira resposta e %até5min em30dias. Atendimento humano e agentes têm botões de detalhe. |
| Painel — Parceiros | Saúde travado/atenção/saudável/sem dados; leads novos, conversas abertas, fila humana, compromissos, WhatsApp fora. Filtros de saúde e botão de detalhe/configuração. Nesta conta o parceiro estava sem CRM provisionado; a tela informa ausência de dados, não zeros medidos. |
| Funil — Kanban | Busca nome/telefone/email; atendente; data de entrada; seleção do funil; contagem/valor total. Colunas com nome/cor/contagem/valor, menu da etapa, criar lead por coluna, abrir ficha e mover por botão ou arrasto. |
| Funil — Configuração | Lista dos funis, padrão, criação, renomear/excluir. Visão das etapas; adicionar, editar nome/cor hexadecimal/ícone, reordenar por arrasto/setas e excluir. Editor foi aberto e cancelado. |
| Leads | Busca, funil, etapa, responsável; filtros origem/tags/entrada. Ordenar recentes/antigos/nome/valor. Paginação, tamanho da página, colunas opcionais e restaurar padrão. Selecionar página/linha, atribuir responsável, excluir, limpar seleção; exclusão não foi executada. |
| Colunas de Leads | Lead, situação, etapa, funil, origem, entrada, email, tags, perfil, valor, responsável e ID. Contadores da seleção/base, valor, quantidade com IA e esperando pessoa. |
| Novo lead | Nome e telefone obrigatórios, seletor de país, email, valor e responsável. Criar/cancelar/fechar. |
| Importar leads | Etapas Arquivo/Colunas/Revisão; CSV até5MB; escolher arquivo ou exemplo. Campos nome, telefone, email, valor, origem, tags, etapa, responsável, observações e personalizados. Não foi enviado arquivo. |
| Ficha | Voltar, pegar para si, mover etapa, agendar, editar/excluir. Resumo/Campos/Jornada. Nome, telefone, email, origem/data, valor, responsável, perfil, funil, etapa, variáveis, etiquetas, notas e próximo compromisso. Jornada mostra criação e movimentos; atribuição depende da captura. Coluna de etapas e conversa ao lado. |
| Editar lead | Nome, telefone, email, valor, origem, responsável, funil, etapa, observações, salvar/cancelar. |
| Conversas | Busca, Todas/IA/Humana, responsável, filtros Tudo/Aguardando humano/IA ativa/Follow-up/Resolvidas/Internas. Atualizar e popover de notificações com eventos Novo lead datados; Marcar todas como lidas pertence a esse feed, sem prova de leitura individual da conversa ou permissão OS. Internas estava vazio e não explicou sua semântica. Lista agrupada por data com trecho, espera, tentativa e follow-up. |
| Conversa aberta | Ficha, funil, etapa, responsável, pegar para si, devolver à IA/assumir humano, resolver. Histórico recebido/enviado/IA, áudio/transcrição, avaliação de resposta IA. Campo, anexar mídia, gravar áudio, enviar, programar. Atalhos hoje15h/amanhã9h/amanhã15h/próxima semana/data e hora. **Preset agenda diretamente ao clicar**, sem confirmação final. Em 11/11, Próxima semana enfileirou para 18/11 às09h. Um texto sintético de inspeção foi agendado e imediatamente cancelado; a fila confirmou Nenhuma mensagem agendada. A afirmação anterior sobre confirmação separada estava incorreta. |
| Sinalização de resposta IA | Abre categoria e observação, com Cancelar/Sinalizar. Categorias: Fugiu do assunto; Faltou informação; Tom inadequado; Longa demais; Informação incorreta; Usou a ferramenta errada; Outro motivo. Sinalização existente aparece como badge na mensagem. A inspeção adicional foi cancelada sem gravar. |
| Agentes | Funil em foco; Qualificação/Follow-up/Agendamentos com ligar/desligar, conversas ativas/leads hoje/conversão, tom, configuração resumida e etapas. Editor com completude, alterações automáticas de rascunho e publicação/descarte separados. |
| Identidade dos três agentes | Nome, tom Profissional/Acolhedor/Direto/Entusiasmado, idiomas PT/EN/ES e áudio Espelhar/Sempre/Nunca. |
| Qualificação — Perfis | Perfis distintos com nome, cor, descrição de reconhecimento/tratamento, palavras-chave sem busca literal, ordem, remoção e ações de responsável/tags ao identificar. Perguntas ficam em Variáveis. Nenhum perfil publicado nesta conta. |
| Qualificação — Variáveis | Lista ordenada do que descobrir e pergunta opcional; adicionar/remover/subir/descer. Nesta configuração havia16itens e adicionar estava indisponível. Não inferir teto universal. |
| Qualificação — Gatilhos | Frases que repassam para pessoa; adicionar/remover. |
| Qualificação — Desinteresse | Lista de ações; sem ação, encerra a conversa. |
| Qualificação — Etapas | Uma etapa atribuída; etapa do agente de agendamento aparece indisponível. |
| Qualificação — Horário | Sem janelas responde sempre; janelas limitam atuação e há mensagem fora do período. |
| Qualificação — Ao qualificar | Próximo agente/humano/encerrar; agente de destino, qualificar antes de agendar ou passagem direta a pedido; avanço opcional no funil. |
| Qualificação — Notificação | Resumo WhatsApp após concluir. Ao ligar no rascunho, mostra responsável pelo lead/atendente específico/outro número; atendente usa o cadastro, outro número aceita DDD e DDI 55 opcional. Indica incluir nome, telefone, origem e resumo da conversa. O rascunho foi descartado com confirmação; voltou a desligado e Publicar/Descartar desabilitados, sem publicação ou envio. |
| Follow-up — Cadência | Intervalo em horas/dias por tentativa, reordenar configuração por lista e adicionar/remover; indicação de contagem a partir do último silêncio. Exemplo observado1h,1dia,3dias. |
| Follow-up — Demais seções | Identidade, etapas, horário; ao esgotar tentativas, próximo agente/humano/encerrar e avanço opcional. |
| Agendamentos — Configuração | Agenda do responsável ou fixa; duração/intervalo/folgas antes e depois/antecedência mínima/janela futura/máximo diário; tom de escassez e notificar titular. Alerta explícito sem disponibilidade cadastrada. |
| Agendamentos — Lembretes | Ativar e configurar avisos em horas/dias antes. Exemplo1dia+2horas. |
| Agendamentos — Detalhes | Assunto, instruções e local não informar/presencial/online/telefone. Também gatilhos, etapas, ao agendar e desinteresse. |
| Base de conhecimento | Bases nomeadas, nova/renomear/excluir, seleção dos funis e Concierge; uma base por funil. Cobertura das cinco seções e tamanho no prompt12.000caracteres. Empresa/contatos, horários, FAQ, políticas, contexto extra; salvar explícito. |
| Produtos e serviços | Pastas/fontes/importar/adicionar; filtros pasta/fonte/status/busca. Nome, descrição, preço e link; mídia só após salvar. Nenhum item nesta conta. |
| Concierge | Disponibilidade, responder FAQ somente pela base, confirmar/remarcar/cancelar agenda, recuperar não comparecimento; repasse humano, frases e mensagem até300caracteres; sempre/fora do horário, espera depois de humano (10min observado), instruções extras até500; salvar. |
| Agenda | Hoje, anterior/próximo, visualização, responsáveis, novo compromisso, Google Agenda, insights. Grade semanal7h–20h. Disponibilidade por atendente, janelas semanais, exceções por data/dia inteiro e fusoAmerica/Sao_Paulo. Novo compromisso: atendente, lead, data, horário disponível, título e notas. |
| Disparos | “Em breve” para númeroQR; depende API oficial e modelosMeta. Não foi encontrado disparo operacional para esta conexão. |
| Rastreabilidade — Configuração | Liga/desliga captura preservando histórico; eventoMeta e valor padrão por etapa, com valor do lead prioritário. |
| Rastreabilidade — Conversões | Log por tentativa, busca lead/telefone, datas e resultado; venda manual sem conversa. Nenhuma conversão foi reenviada. |
| Rastreabilidade — Links | Nome, WhatsApp destino, mensagem inicial, origem/mídia/campanha/conjunto/anúncio/criativo/utm_campaign, criar/lista e contatos que iniciaram. Marcador técnico oculto da conversa. |
| Inspetor de Vendas | “Em breve”, sem IA ligada nesta versão. |
| Modelos | Funis/Base/Agentes, nome/nicho; criar/revisar/aplicar por parceiro. Funil tem etapas/cor/ícone/ordem/prévia. Base tem nome de destino e seções opcionais até12.000caracteres. Agente escolhe tipo e origem (existente/outro modelo/zero); copia persona/perguntas/gatilhos/horários/cadência/regras. Não copia IDs de etapas/agentes, destinosWhatsApp, responsável ou agenda fixa de outra conta. |
| Configuração inicial | Chat monta funil/agente/produtos com aprovação por etapa. Checklist de prontidão, WhatsApp e reiniciar configuração. Não foi iniciado reinício. |
| Atendimento e IA | Pausar ao humano responder, nome do atendente na mensagem e reiniciar funil/triagem. |
| Atendentes | Equipe, ativação e agenda pessoal; agenda padrão da equipe; gerenciar equipe em ajustes oficiais. |
| Respostas rápidas | Mensagens inseridas por `/atalho`. |
| Distribuição | Fontes elegíveisWhatsApp/Meta/site/manual; tags na entrada. Dono explicitamente escolhido não muda; CSV não passa pela distribuição. Roletas por número/formulário, estratégia menos carregado/rodízio, pessoas/peso1–5/limite; fallbackgeral e opção de leads sem dono. |
| Entrada — WhatsApp | Captura global; IA atende todo contato novo ou somente frase de anúncio. Número aponta funil/etapa, conexão e tags. Conexão/reconexão em Conectores. |
| Entrada — Meta | Buscar/filtros/tabela por página, atualizar formulários, capturar por formulário, destino/IA/campos e tags. Novo formulário desligado até configurar. Ativação não foi executada. |
| Entrada — Sites e Portais | Origem com URL própria, funil e mapeamento, captura e teste. Integrações citadasPluga/Zapier/Make/n8n. Não foi criada origem. |
| Campos personalizados | Pastas, busca, ordem, desativados; contador0/50 observado. Nome, pasta, Texto/Texto longo/Número/Data/Seleção. Tipo e chave imutáveis após criação. |
| Modo de teste | Responder só a telefones autorizados; adicionar números e ativar. Não foi ligado. |
| Uso de créditos | Usado/disponível/franquia mensal; cada resposta consome. Não expõe LLM/provedor nem custo por token. |

## Engenharia observada e inferências

Fluxo visível: entrada identificada por origem/número → lead no funil/etapa → distribuição → agente da etapa → resposta ou repasse → cadência no silêncio → agendamento/encerramento. Captura, distribuição, autonomia, ativação do agente, disponibilidade e humano têm controles separados. Interface e conversa são duas entradas para o mesmo lead.

É inferência que há um dispatcher/worker e armazenamento persistente por trás dos envios. A UI sozinha não prova a implementação, exactly-once, deduplicação nem a política de retry. Na cópia, esses contratos precisam de testes próprios, não de afirmação de equivalência interna.

## Mapeamento para o Planeje

- `leads`, `crm_pipelines`, `crm_stages`, `crm_funnel_events`, `crm_lead_interacoes`: funil e comercial canônicos.
- `cliente_whatsapp_contact/inbox/sent`, `cliente_whatsapp_config`: contatos e mensagens, preservando cliente+canal+JID.
- `cliente_atend_conversas`, agentes, bases, respostas, membros: estado humano/IA existente. Não trocar isso por tarefas ou CRM paralelo.
- Mini CRM conserva status/cadência manual e espelho comercial. Status externo Ápice permanece separado.
- Agendas e fila novos completam os contratos ausentes; o scheduler existente continua como executor de transporte. Tarefas e responsáveis internos continuam nos registros oficiais de Tarefas.
- Squad usa o shell compartilhado; estilo do CRM recebe a paleta clara observada sem substituir marca do Planeje ou alterar os demais ambientes.

Lacunas locais confirmadas: follow-up sem reserva anterior ao envio; canal perdido no agendamento IA; contexto da IA consultaJID sem canal; prompt legado específico de uma empresa. Essas condições precisam ser resolvidas antes da publicação de autonomia adicional.

## Estado e próximos passos

Levantamento concluído. O núcleo foi publicado na release `crm-ia-20261111-01`, às 03h06 BRT; a continuação de voz, transcrição e Google Agenda foi publicada às 05h33 BRT na release `crm-ia-20261111-02`. O [registro de produção](crm-ia-producao-2026-11-11.md) distingue entrega, testes e limites. Uma futura promoção deve conferir a release viva e herdar suas fontes e perfil; o levantamento não autoriza reaplicar as quatro migrações já publicadas.

## Complemento de perfis em 11/11/2026

A inspeção abriu **Adicionar perfil** no editor de Qualificação para observar os campos e **Ações ao identificar**. O item vazio foi removido antes de fechar; Publicar mudanças e Descartar permaneciam desabilitados. Nenhum perfil, agente ou automação da referência foi publicado. Os campos observados acrescentam reconhecimento semântico e ações configuradas à aceitação de perfis; uma busca literal por palavra-chave não reproduz esse comportamento.
