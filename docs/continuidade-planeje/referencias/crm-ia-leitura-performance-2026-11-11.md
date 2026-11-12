# CRM IA — custo da leitura do histórico

Estado: correção publicada às 14h01 BRT em `crm-ia-leitura-20261111-01/candidate`, com Painel e Conversas carregando na sessão autenticada. O frontend e runtime foram herdados integralmente da release `crm-ia-20261111-05b`, publicada às 13h09 BRT. A conferência desta leitura não encerra a matriz funcional nem representa aceite humano. [Desenho](../../superpowers/specs/2026-11-11-crm-ia-leitura-performance-design.md) e [execução](../../superpowers/plans/2026-11-11-crm-ia-leitura-performance.md).

## Causa e correção

A consulta real de30 dias do Painel excedeu duas vezes o limite de8s do usuário autenticado. A função compartilhada continua na migration043800 e não foi redefinida pelas duas migrations da05. Os helpers privados de canal e seus gates eram chamados em cada mensagem. Metadados produtivos confirmaram PostgreSQL17.6 e índices por conta/JID/data já existentes; não foram executados EXPLAIN ANALYZE, impersonação de sessão ou teste de transporte em produção.

A nova migration `20261111162400_crm_ia_conversation_read_performance.sql` substitui somente `private.crm_ia_conversation_rows(uuid)`. Os canais são materializados por consulta usando o próprio `private.crm_ia_channel`; dois JOINs reutilizam essa lista. Contatos, privacidade, grupo, tenant, vínculo comercial, ambiguidades, OR dos JIDs e desempates de latest continuam iguais. O período permanece depois de latest, preservando o caso em que a mensagem mais recente está fora do intervalo. Não há cache entre pedidos nem novo índice, timeout ou concessão de acesso.

Esse leitor atende Painel, Conversas, detalhe do lead, Uso e os enriquecimentos de perfis/Leads. As 15 migrations aplicadas até05b ficam intactas; a nova foi aplicada uma vez e é a 16ª. A semântica de materialização foi conferida na [documentação oficial PostgreSQL17, seção7.8.3](https://www.postgresql.org/docs/17/queries-with.html), por Context7.

## Evidência local

O benchmark usa PostgreSQL16.15 descartável, sockets Unix privados, helpers privados reais da041704 e decisões externas de acesso controladas. No cenário de100 contatos/15 mil mensagens, a leitura passou de5.633ms para293ms. Com250 contatos/37.500 mensagens, a original excedeu8s; a variante levou739ms. Esses tempos não são certificação da produção17.6.

O teste permanente carrega explicitamente as15 migrations publicadas antes da nova. Os97 envelopes completos de admin/colaborador, filtros e consumidores ficaram iguais. Há casos de canal negado/arquivado/ausente/estrangeiro/null, contato privado, grupo, aliases, telefone e lead ambíguos, empate, timestamp de provedor e última mensagem fora do período. Revogação entre consultas tem efeito imediato. OID, proprietário, assinatura, atributos e grants permaneceram iguais, sem execução direta para authenticated/anon.

O RED observado pelo autor e pelo coordenador fez3.045 verificações reais de canal após acrescentar3 mil mensagens históricas; o GREEN fez5. O teste usa estatísticas de função em backends distintos, sem depender de tempo de parede. Passaram7/7 casos focados e398/398 testes CRM integrados, sem falhas, cancelamentos ou skips. Oito loaders passaram a exercitar a migration candidata, e lint dos nove testes afetados passou. O check completo da05b permanece válido para o frontend inalterado; não foi apresentado como nova execução depois da mudança SQL.

## Preparação e limites operacionais

A candidata SQL `crm-ia-leitura-20261111-01` herda fonte, perfil, HTML/assets e runtime completos da05b. O publicador verifica a função e todos os seus atributos antes e depois da substituição em uma transação; alterações concorrentes recusam a aplicação. O corpo anterior impede reaplicar a migration. Guards e recuperação foram exercitados em fixtures privadas, além do helper de promoção herdado. Revisões e contraprovas ficam privadas e vinculadas aos hashes exatos.

As revisões independentes de SQL/testes e publicador encerraram sem achados pendentes nos hashes finais. A primeira revisão do publicador reproduziu uma saída prematura da transação por SQL adicional; a validação passou a aceitar somente a definição exata da função prevista. Oito contraprovas PostgreSQL cobrem metadados concorrentes, grants, fronteira transacional, hash de saída, expansão de segurança, preservação do OID e recusa de reaplicação. O revisor SQL conferiu 124 envelopes e seis conjuntos de linhas, incluindo revogação no mesmo backend com plano preparado. Evidências privadas preservam também as versões rejeitadas.

## Publicação e conferência real

Publicação em `2026-11-11T17:01:22.071806Z`: 14 sobreposições, 2.114 fontes e somente a migration162400. SHA256 da migration `7acfdb512e9d066cdea874bcf437109ceb2e7f36f84d426fd3b8ff8d9ab423ca`; manifesto de escopo `20a68f61cba44a3b2e0bc4b2228472c2f8ec9286b328d6e10adc99da981b961b`. O corpo instalado foi conferido, com OID515873 e proprietário, assinatura, atributos e grants preservados. Não reaplicar a migration nem repetir o publicador.

O verificador confirmou todas as fontes, 24 artefatos HTTPS, serviços, runtime e perfil. HTML `fe3bfb6abffbb4dadde1e7a6c113c7d20a402a5c3d7a92ed422dc531beb1d4bc`, entrada `index.2872dde3.js`, CSS `index.ac7c11f0.css` e os bundles CRM continuam idênticos à05b. Não houve build, reinício, alteração de agente, ativação de rotina, envio de mensagem ou chamada de modelo.

Na sessão real, Tentar novamente carregou o Painel; o atalho abriu Conversas e a volta ao Painel também carregou. A lateral mediu 248 px expandida e 64 px recolhida, com cabeçalho único, seletor habilitado e sem transbordamento horizontal. A captura final e os recibos estão no registro privado `.local/crm-ia-leitura-20261111-01/`. A captura anterior com timeout foi preservada.

Essa navegação revelou uma pendência independente: `CrmIaConversations.jsx` não propaga `since`/`until` do atalho ao payload da lista, que recai no padrão de sete dias do servidor. A consulta de estado individual também usa a lista sem período explícito. A ligação dos filtros e o acesso ao estado de conversas históricas devem ser corrigidos sem mover o filtro temporal para antes de latest. Envios, respostas, follow-up e evento externo Google ainda não foram homologados com destino real; o modo de teste continua restrito ao destinatário autorizado, com autonomia geral desligada.

Às14h26, a propagação do período e dos filtros foi corrigida em publicação somente frontend. A sessão real confirmou datas e total iguais no atalho, segunda página com período preservado e retorno ao Painel. O estado individual já tinha fallback por messages.state, independente da data; o enriquecimento de atendente histórico permanece em conferência. [Entrega e limites](crm-ia-periodo-conversas-2026-11-11.md).
