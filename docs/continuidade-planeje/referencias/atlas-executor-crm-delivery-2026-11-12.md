# Executor Atlas: mensagem CRM e leitura de agenda

Data: 12/11/2026. Estado: capacidade local validada em fixtures, com catálogo e dispatcher conectados pelo coordenador. Nenhuma publicação, migração remota, mensagem real ou conexão OAuth foi executada nesta fatia.

## Comportamento

`send_message` prepara uma revisão de texto WhatsApp, contato e canal exatos. A preparação consulta o estado autorizado e não altera a fila nem a conversa. A revisão informa o destinatário, telefone/JID, canal, texto, pausa da IA e enfileiramento separado da confirmação de entrega.

Na aprovação, o banco exige o titular Atlas autenticado, sessão viva, conta ativa, módulos e ACL nativos do CRM/Atendimento. Reconsulta bloqueio, canal, contato e controles da conversa depois das esperas por locks. Mudança de versão resulta em `conflict`; revogação ou bloqueio nega a decisão sem manter gravações.

O helper chama exclusivamente `crm_ia_workspace('schedule_message', ...)`, com `request_id` igual ao ID persistido do item. A mensagem é `manual/pending` em `crm_ia_outbox`; a rotina nativa pausa a IA. Enfileiramento e recibo Atlas pertencem à mesma transação. Repetir a decisão devolve o recibo persistido e não cria outro envio.

O recibo contém `queued: true`, `sent: false`, `delivery_state: 'queued'`, `status: 'pending'`, `outbox_id`, `request_id`, contato, canal, destinatário e `delivery_snapshot`. Esse último congela os fatos após a pausa legítima da IA, para a revalidação posterior. O recibo confirma somente a fila. Entrega, falha, cancelamento ou incerteza devem ser relidos por `message_queue`. O dispatcher existente (`atendimento-planejamento-scheduler/index.ts`, usando `dispatchCrmIaQueue`) conserva leases, transporte e reconciliação; não foi criado outro motor ou transporte.

Bloqueio utiliza `atendimento_bloqueios` e `atendimento_conversas.bloqueada`. A busca no código não encontrou um consentimento/opt-out CRM separado; esta entrega não inventa um cadastro paralelo. Também respeita os telefones permitidos pelo modo de teste nativo. A revisão independente encontrou que o recheck nativo antigo não consultava esses bloqueios e podia derivar outro JID depois do enqueue. A migração nova corrige esse caso exclusivamente para mensagens Atlas: bloqueio, destino/canal/controle alterados ou perda atual de acesso do remetente cancelam a linha antes do callback de transporte. `crm_ia_delivery_start` repete a mesma verificação, inclusive se o bloqueio surgiu após a primeira conferência do worker.

## Contratos para integração

Arquivo novo: `supabase/functions/_shared/atlasExecutorCrmDelivery.js`.

- `EXECUTOR_CRM_DELIVERY_CATALOG`: ação de escrita `send_message`; leituras `send_context`, `message_queue`, `slots`, `calendar_status`, `calendars`, `calendar_busy`.
- `prepareExecutorCrmDelivery(caller, { clientId, action, input, signal })`: aceita somente `action: 'send_message'` e `input: { contact_id, channel_id, body }`. Texto de 1 a 4.000 caracteres, sem anexos, transporte, escopo alternativo ou `request_id` fornecido pelo modelo.
- Retorna a proposta padrão Atlas, com payload imutável `{ contact_id, channel_id, body, expected: snapshot }`, prévia e link interno `/crm-ia/conversas?cliente=...&contact_id=...&channel_id=...`.
- `readExecutorCrmDelivery(caller, { clientId, view, input, signal })`: envelope padrão com disponibilidade, cobertura, paginação e links. Falha de leitura não equivale a lista vazia; mensagens internas de erro/segredos não são devolvidas.

Migração nova, gerada com `supabase migration new atlas_executor_crm_delivery` no CLI instalado 2.121.0: `20261112043549_atlas_executor_crm_delivery.sql`.

- `public.atlas_executor_crm_delivery_context(p_client uuid, p_contact uuid, p_channel uuid) RETURNS jsonb`: leitura sem provisionamento ou gravação, concedida apenas a `authenticated`, com guarda Atlas e ACL nativa. Retorna destinatário seguro, canal, controles e snapshot de versão. Credenciais não saem do SQL; o canal expõe somente um fingerprint para invalidação.
- `private.atlas_executor_crm_delivery(p_item public.atlas_execution_items) RETURNS jsonb`: helper interno, sem concessão direta para `PUBLIC`, `anon`, `authenticated` ou `service_role`. Confere o item persistido, payload fechado, versões e autorização, então enfileira pela rotina nativa.
- `private.atlas_executor_crm_delivery_snapshot(uuid,uuid,uuid)`: fatos de versão compartilhados pela aprovação e recheck; sem concessão direta aos papéis da aplicação.
- `private.atlas_executor_crm_delivery_guard(uuid)`: guarda do transporte para outbox cujo `request_id` referencia o item `crm/send_message`. Confere vínculo ao recibo concluído, corpo/destino/canal, bloqueio, snapshot após enqueue e `crm_ia_delivery_actor_check(id,'outbox')`. A identidade vem do criador nativo persistido; não altera JWT/claims. É concedida somente ao `service_role`, além do dono SQL, para conservar a chamada direta já permitida ao recheck base `SECURITY INVOKER`.
- `public.crm_ia_delivery_recheck_base(uuid,uuid)` é substituída com `CREATE OR REPLACE`, inserindo a guarda antes do restante do corpo nativo. OID, dono, ACL/grants, linguagem, atributos, argumentos/defaults, segurança e `search_path` permanecem idênticos. Claim, start e wrappers de voz/calendário/notificação mantêm OIDs, atributos e corpos originais; não há rename da cadeia nem alteração de migrações históricas. Mensagens nativas sem item Atlas continuam pelo contrato anterior.

Conexões realizadas pelo coordenador nos arquivos compartilhados, observadas nesta validação:

1. Catálogo novo concatenado e leituras/preparação roteadas para as funções acima, usando o SDK do chamador autenticado.
2. `send_message` na allowlist CRM de `private.atlas_executor_action`.
3. Em `private.atlas_executor_dispatch`, antes do ramo CRM genérico, `app='crm' AND action='send_message'` chama `private.atlas_executor_crm_delivery(p_item)`.

Na release, aplicar a migração nova uma vez, depois da migração base do executor. As migrações CRM publicadas são dependências e não devem ser reaplicadas.

Esta fatia não altera o adaptador, catálogo, serviço, dispatcher ou migração base existentes; o coordenador mantém esses arquivos. A fixture inicial usava um bridge SQL para isolar o ramo pendente. Ele foi removido após a integração: a execução final usa a allowlist e o dispatcher reais da migração base atual.

## Agenda e slots

`slots` exige `owner_id` e `date` (`YYYY-MM-DD`), com `lead_id`/`appointment_id` opcionais. Primeiro consulta o endpoint nativo `crm-ia-calendar`, ação `busy`, no intervalo de um dia antes até dois dias depois da data. A janela retornada precisa conter toda a solicitada; identidades de cliente/responsável/compromisso/lead, quando presentes, devem coincidir. Só então consulta `crm_ia_workspace('slots')`. Depois relê o cache por `crm_ia_calendar_workspace('busy')`, sem outra atualização do provedor, e compara janela, revisão, instante de conferência e ocupação. Troca de cache durante a consulta retorna fonte indisponível, sem interpretar os slots como livres ou ausentes. Ocupação externa obrigatória e desatualizada também impede oferecer horários. O cálculo de disponibilidade, conflitos, fuso e vínculo permanece no serviço SQL nativo; a gravação do compromisso conserva sua revalidação própria.

`calendar_status` e `calendars` pertencem ao usuário autenticado e recusam `owner_id` alternativo. `calendars` aceita `pageToken`; `next_page_token` marca cobertura incompleta. `calendar_busy` aceita somente responsável/período e contexto de lead/compromisso autorizados. Não há ações de conectar, finalizar OAuth, escolher agenda ou desconectar no catálogo desta extensão. A atualização do cache de ocupação usa o endpoint nativo existente; os testes substituem esse transporte, sem Google real.

## Concorrência e limites

A aprovação toma um lock `SHARE` curto em `atendimento_bloqueios`, antes do lock advisory nativo por cliente e dos locks de contato/canal/configuração/conversa. O bloqueio nativo insere seu marcador antes de editar a inbox. Essa ordem evita intercalar o marcador entre a conferência e o enfileiramento e evita inverter os locks com a função de bloqueio. Enquanto a aprovação termina, novos bloqueios podem aguardar essa transação. Não há espera por provedor dentro dessa seção.

Os snapshots incluem destino, nome/telefone, versão do contato, fingerprint do canal, revisão da configuração e versões/controles das conversas oficiais. Não habilitam autonomia. A pausa é aquela da função nativa de mensagem manual; nenhum status/responsável/motor de tarefa paralelo foi criado.

## Verificação local

Comando direcionado:

```sh
node --test scripts/atlas-executor/crm-delivery.test.mjs scripts/atlas-executor/crm-delivery.database.test.mjs
```

RED observado antes da implementação: quatro testes SDK falhavam por catálogo/API ausentes; testes SQL alcançavam as funções reais e falhavam pela nova RPC/helper ausentes. Foi observado também RED específico para `calendar_busy` desatualizado, seguido da correção que o torna indisponível. No fechamento da revisão, novos REDs reais mostraram `allowed:true` no recheck após bloqueio e `available:true` para ocupação de janeiro solicitada para dezembro. Ambos foram corrigidos e ficaram verdes.

Validação final: 19 testes Node, sem falhas, cancelamentos ou skips (seis SDK; doze cenários SQL e o teste agregador), e ESLint dos quatro arquivos JS/mjs alterados. Cobertura: revisão sem mutação, fila pendente versus envio, replay após resposta perdida, bloqueio, contato/conversa/canal alterados, modo de teste, recusa, escopo, sessão/JWT/módulos, rollback integral se o recibo falhar, duas aprovações simultâneas com contenção comprovada, revogação da sessão durante espera no lock CRM, payload adulterado, privilégios privados, fila relida e disponibilidade nativa após ocupação de um horário. Também inclui claim/recheck/start nativos após bloqueio/JID/token/configuração/ACL alterados, linha cancelada sem envio, permanência do contexto `service_role` sem usuário forjado, sobrevivência da pausa IA legítima, transporte nativo consumido uma vez, mensagem legada preservada, comparação completa dos atributos/OIDs/grants e corpos dos wrappers, janela/identidades Google e cache trocado durante slots.

PostgreSQL16 descartável criado por `initdb`, porta 55537 em socket Unix privado, `listen_addresses=''`, diretório temporário próprio removido no encerramento. O harness carrega as 19 migrações CRM publicadas atuais, o contrato Atlas e os novos serviços; não usa DSN, `.env`, dumps ou dados de clientes. Estruturas básicas e helpers periféricos de Atendimento são fixtures sintéticas. O SDK Supabase instalado usa exclusivamente `fetch` fictício em `fixture.invalid`; a validação SQL não utiliza provedor/modelo/envio reais. Isso comprova a integração local com a fila e os serviços SQL, não entrega WhatsApp, disponibilidade produtiva, OAuth ou aplicação remota da migração.
