# CRM IA — perfis, leads e Kanban

## Base e objetivo

Continuação do pedido integral, sobre a release `crm-ia-20261111-03`, publicada às 07h12 BRT. Onze migrations já aplicadas: não editar ou reaplicar. Preservar a stack, o provedor/modelo/autenticação, os registros comerciais, as permissões e a execução oficial em Tarefas. O contrato desta onda completa perfis observados, ficha/colunas/filtros/importação e totais/movimentação do Kanban. [Matriz](../../continuidade-planeje/referencias/crm-ia-scaleos-paridade-2026-11-11.md).

## Perfis publicados

`funil.crm_ia.profiles` é uma lista ordenada no agente de Qualificação: `{id,nome,cor,descricao,pistas:[],actions:{owner_id:null,tags:[]}}`. UUID permanece ao editar/reordenar. Descrição orienta reconhecer/tratar; pistas são exemplos semânticos, não busca literal. Nome/cor e textos têm validação/limites compatíveis com o payload atual. As ações aceitam apenas responsável autorizado e etiquetas nativas, nunca etapa, agente, status ou encerramento. Rascunho pode estar incompleto; validação completa ocorre na publicação. Não criar classificação fora do runtime existente.

`workspace.lead_profiles` retorna somente `{agent_id,pipeline_id,id,nome,cor,agent_updated_at,historical?}` das definições publicadas e snapshots históricos autorizados necessários para consulta. Sem instruções/pistas à equipe que não gerencia agentes. Filtrar/mostrar perfil removido conserva o snapshot; não permite nova atribuição de uma definição removida.

O SELECT legado de agentes também precisa respeitar essa fronteira. Uma policy restritiva para todas as operações distingue a presença da chave `crm_ia`, inclusive valor null/vazio: configurações CRM exigem gestão CRM atual; linhas antigas conservam suas políticas. USING e WITH CHECK protegem a linha antiga/nova contra remoção/injeção do marcador. O Atendimento recebe uma RPC com cinco campos e funil sem `crm_ia`, após acesso aprovado e associação legada ou gestão CRM. Colaborador CRM sem associação não recebe o funil legado. O editor antigo seleciona somente linhas sem a chave para não descartar a configuração CRM ao normalizar.

O modelo pode devolver `profile_id` opcional dentro de `action` em `answer|qualify`. SQL resolve apenas no agente publicado do run e revalida as fontes. O prompt não sugere escolher perfil sem evidência. Testar/sugerir mostram proposta sem efeito. Identificar perfil não qualifica nem move etapa. Ações de responsável/tags só rodam em mudança efetiva, mantendo permissões e comparação de versão; repetir resposta não desfaz uma decisão humana posterior.

`leads.crm_ia_profile` guarda identidade e snapshot `{agent_id,id,nome,cor,agent_updated_at}` ou null. Atribuição manual passa por `save_lead` com `profile:{agent_id,id,agent_updated_at}`; null limpa; omissão preserva. Proteger a coluna de escrita direta por papel autenticado, sem confiar em GUC configurável pelo cliente. Um helper privado aplica atribuição, união de etiquetas e responsável na mesma transação. Transferências obedecem à permissão atual de gestão/assumir para si; concorrência ou revogação aborta tudo. Fonte/run/resultados e autorização de voz continuam coerentes após alterar a versão do lead.

Histórico de perfil fica em auditoria privada append-only, exposta pela ficha depois da ACL de lead/cliente. Não usar `crm_funnel_events` para falsa movimentação nem `crm_lead_interacoes`, cujos registros satisfazem gates de avanço. Remover definição não apaga atribuição nem histórico. Modelos copiados regeneram IDs de perfil, removem responsáveis externos e mantêm autonomia/voz desligadas.

## Leituras e filtros

A mesma RPC `leads` aceita `tag` (uma etiqueta exata), `profile_agent_id` e `profile_id`, mantendo todos os filtros atuais. Exige o par de perfil quando informado. Retorna `rows`, `total`, `summary:{value,ai,waiting}` e `stage_totals:[{stage_id,count,value}]`, sobre o mesmo CTE autorizado antes de LIMIT/OFFSET. Conversas privadas ou módulos/canais negados não entram em contadores de atendimento; fonte indisponível usa null/cobertura explícita, sem zero inventado. Cada linha pode trazer `attendance` e `awaiting_since` somente quando autorizados.

Etapa null tem total próprio; o Kanban mostra esses leads em Sem etapa. Totais não mudam ao trocar página. Paginação continua explícita e distingue registros carregados do total; não omite oportunidades de outras páginas. Mostrar todos os campos observados: lead, situação, etapa, funil, origem, entrada, email, tags, perfil, valor, responsável e ID.

## Interface e importação

Colunas opcionais/restaurar padrão são preferência visual por pessoa+cliente neste navegador, usando o padrão localStorage protegido já existente; armazenar somente nomes de colunas permitidos, sem dados de leads. Não alterar `crm_ia_config.revision`. Identificação do lead permanece fixa. Ficha divide Resumo/Campos/Jornada e usa o mesmo painel de conversa do CRM no canal escolhido/autorizado, sem novo compositor ou transporte. Sem conversa autorizada, mostrar o vínculo/abertura existente.

O painel compartilhado exige que o canal ainda esteja na lista autorizada da sessão, com leitura permitida. Link direto para canal desconhecido não dispara consultas nem monta compositor; revogação oculta o histórico já carregado. O servidor continua a autoridade para contato, canal, ACL e envio.

CSV mantém cinco MB, mil linhas, recibo/hash, atomicidade e nenhuma distribuição/IA/envio. Acrescentar mapeamento por linha de etapa, responsável, perfil e campos personalizados. Resolver UUID ou nome inequívoco somente no cliente/funil autorizado. Erro identifica a linha, conserva o arquivo/mapeamento e não importa parcialmente. Defaults atuais continuam disponíveis.

Arrasto e botão de mover usam `move_lead` com versão, origem/destino e motivo quando exigido. Nenhum avanço otimista antes do servidor; conflito conserva o registro para revisão. Caminho por teclado permanece disponível. Reordenar etapas usa `reorder_stages`, versão do funil e setas; ícone usa `crm_ia_icon` já existente e renderização por allowlist, sem HTML arbitrário.

Arquivamento em lote é reversível e usa `bulk_archive {items:[{id,expected_updated_at}]}`, com até cem leads da seleção atual, mesma ACL e transação. `bulk_assign` recebe também `items` versionados junto de `ids/owner_id`; novas gravações de seleção não sobrescrevem versão concorrente. Conferir todos os callers e tratar cliente antigo sem prova de versão de forma segura.

## Engenharia e verificação

Novas migrations reservadas `20261111101501_crm_ia_lead_profiles.sql` e, se separar a leitura facilitar revisão, `20261111101502_crm_ia_lead_reads.sql`. Autor de backend detém ambas, parser/prompt/runtime e testes próprios. Autor de Leads detém Leads/Import/presentation/helpers/testes próprios. Autor do editor detém Agents/helpers/testes próprios. Coordenador detém CSS, Primitives, export/reuso da conversa, API comum, fixtures, docs/config/Git/publicação. Um escritor por arquivo; combinar mudanças em testes compartilhados antes.

Testes sintéticos offline: rascunho não executa; perfil estrangeiro/removido rejeitado; escrita direta negada; pausa/CAS/revogação/replay; histórico sem inflar gates; tags text[]; responsável permitido; modelo copiado seguro; totais invariantes entre páginas e filtros; CSV por linha sem efeitos colaterais; movimentação por arrasto/teclado respeita os mesmos gates. PostgreSQL descartável por socket Unix, sem DSN externo. Revisor somente leitura após fronteira estável. Publicação só após check/testes/revisão e herda fontes/perfil da release 03; sem envio/modelo/OAuth real até as escolhas do usuário.
