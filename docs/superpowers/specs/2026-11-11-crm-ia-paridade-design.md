# CRM IA — continuação da paridade observável

## Base e intenção

O pedido integral de Josias continua ativo após as releases 01 e 02. A base vigente é `crm-ia-20261111-02/candidate`, publicada às 05h33 BRT, com 2.046 fontes. As oito migrações dessas releases já foram aplicadas: não editar nem reaplicar. A referência e a apresentação já foram escolhidas pelo usuário; esta continuação executa os controles que ainda faltam na [matriz](../../continuidade-planeje/referencias/crm-ia-scaleos-paridade-2026-11-11.md), sem nova aprovação de decisões rotineiras.

Primeira onda: ações de agenda do Concierge, áudio espelhado e tons, rascunho/publicação de agentes e visão semanal da agenda. Depois seguem os demais controles da matriz. Reusar stack, registros, disponibilidade, outbox, scheduler, permissões e componentes existentes. Não criar tarefas ou outro motor de execução.

## Concierge e compromissos existentes

O modelo propõe `appointment_propose`, com `operation:confirm|reschedule|cancel`, `appointment_id` presente no contexto autorizado e novos horários somente em remarcação. SQL confere cliente, lead, contato, canal, owner, ator, agente/configuração, versão e disponibilidade. Guarda uma proposta de cinco minutos em `crm_ia_runtime.pending_appointment_action`; a pergunta de confirmação é produzida pelo servidor e enviada na outbox atual.

Após uma resposta explícita do contato, o modelo pode pedir `appointment_apply` com o ID da proposta. O servidor determina a operação e prova que a afirmação ocorreu depois da pergunta efetivamente enviada, no mesmo canal/JID. Não confiar em `confirmed:true` do modelo. Mensagem antiga, negativa, ambígua, pergunta ainda não enviada, intervenção humana, mudança da fonte ou expiração não alteram a agenda. Mais de um compromisso elegível exige escolha inequívoca.

Contexto inclui somente ID/versão, título, início/fim, fuso, estado e disponibilidade necessários do cliente + contato + lead. Teste e sugestão permanecem sem efeitos. Confirmação de presença mantém o compromisso; remarcação conserva seu ID, `request_id`, criador original e owner; cancelamento usa CAS e mantém histórico. O run novo guarda recibo de alteração antes/depois e ator atual, sem reescrever a identidade da criação.

Não rotular alteração como `book`: o gate da release 02 é intencionalmente estrito para criação. A continuação acrescenta ramos próprios para alterações já autorizadas. Resposta principal continua separando versão da conversa e versão do compromisso. Presença/remarcação exigem recibo atual de Calendar quando conectado; cancelamento exige recibo de exclusão atual e `cancelled:true`. Pendência não consome lease, e falha/incerteza usa repasse honesto uma vez. Leases iniciadas não são reescritas. Lembretes da versão anterior são cancelados e os da nova versão são idempotentes.

Configuração Concierge acrescenta opt-ins independentes, todos falsos por padrão: `appointment_confirm`, `appointment_reschedule`, `appointment_cancel` e `no_show_recovery`. Não concedem autonomia geral: continuam exigidos agente ativo/autorizado, módulo, allowlist e ausência de pausa humana.

## Não comparecimento

Ausência é marcada explicitamente pela equipe através de `mark_appointment_no_show`, com ID/versão, depois do término e com permissão atual. Não inferir ausência do silêncio. Usar o estado `no_show` existente e registrar a alteração no histórico canônico.

A recuperação é uma tentativa opt-in após atraso configurado, com vencimento, usando os campos e a reserva do follow-up existente. O propósito `no_show` carrega compromisso/versão e canal, com chave determinística por compromisso/versão/tentativa. O convite não confirma horário nem é reminder de uma reserva futura. Nova mensagem, pausa humana, alteração, revogação ou expiração o invalidam. Remarcar preserva a identidade e registra antes/depois da ausência. Nenhum envio real será usado em QA.

## Áudio espelhado e tons

`audio.mode` é opcional: `never|always|mirror`. Configurações anteriores sem esse campo mantêm sua forma e comportamento: `enabled:false` significa nunca; `enabled:true` sem modo significa sempre. Compreensão de entrada continua independente. A UI oferece os três comportamentos observados e os tons Profissional, Acolhedor, Direto e Entusiasmado; o valor deve chegar ao prompt e ser aceito no servidor.

Espelhar só gera voz quando a mensagem recebida que originou o run é áudio. Runtime acrescenta `source_inbox_id`, `source_message_id` e `source_message_type` ao snapshot a partir da consulta real, no canal/JID exatos. A validação SQL confere essa origem antes de autorizar custo; não aceitar decisão do modelo ou campo enviado pelo navegador. Falta de prova usa texto. Follow-up usa a origem recebida registrada no seu snapshot, sem escolher mensagem de outro canal.

Preservar autorização por versão, geração única, limite de 4 MB, divulgação de voz sintética e falha sem cobrança repetida. Configuração antiga e seus testes continuam compatíveis; a ausência de `mode` não deve invalidar prova de voz já registrada. Modelos copiados e novos agentes continuam inativos e sem autorização de custo.

## Rascunhos e publicação de agentes

Runtime continua lendo o agente publicado existente. Rascunho privado é identificado por cliente, agente ou chave estável de criação, e editor; não altera esse registro nem a prova de voz. Guarda payload limitado, revisão e versão publicada de origem. Pode estar incompleto durante a edição, mas nunca executa.

RPCs do workspace: `agent_draft`, `save_agent_draft`, `publish_agent_draft` e `discard_agent_draft`. Todas conferem permissão, cliente e editor no servidor. Autosave é serializado, com comparação de revisão e sem atualizar o workspace a cada tecla. Publicar compara também a versão atual do agente e chama o salvamento validado existente; só então registra autorização explícita de áudio/autonomia. Conflito preserva o rascunho e pede revisão. Descartar deixa a versão publicada intacta.

A UI mostra estado de rascunho/salvamento/erro, retoma o próprio rascunho e oferece publicar/descartar separados. Fechar ou trocar de conta não envia conteúdo ao cliente errado; respostas tardias não modificam a nova tela. Publicação depende de campos válidos e ação explícita. Testar usa a versão publicada e informa isso.

## Agenda semanal

Alternar Lista/Semana sobre a mesma RPC por intervalo e responsável, conservando editores, busy, reservas e estados Calendar. A consulta usa a data civil no fuso da disponibilidade, incluindo compromissos próximos à meia-noite; total/paginação seguem todo o recorte autorizado. Grade semanal 7h–20h tem navegação, dias identificados, acessibilidade por teclado e rolagem contida em tela estreita. Compromissos fora da faixa continuam acessíveis e sinalizados.

Marcar ausência, cancelar e reagendar usam o mesmo registro e versão. A UI distingue `scheduled`, `confirmed`, `cancelled` e `no_show`; não anuncia sincronização Google antes do recibo. Nenhuma operação da grade cria tarefa paralela.

## Verificação e publicação

Fixtures, modelos/transporte falsos e PostgreSQL descartável com rede negada. Cobrir afirmação histórica/antecipada, fontes trocadas, humano/tenant/canal, identidade preservada, concorrência, recibo de cancelamento, recuperação única, modo espelhado, proof legado, rascunho incompleto/CAS e fuso da grade. Um escritor por arquivo; revisão sensível somente leitura. Promover somente arquivos revistos sobre a release 02 e herdar o perfil real. Publicação e aceite continuam distintos; homologação real depende das escolhas já solicitadas ao usuário.
