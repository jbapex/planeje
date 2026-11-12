# CRM IA — custo das verificações de acesso

## Estado e aceitação

Publicado em 11/11/2026 às 17h48 BRT, na release `crm-ia-acesso-leitura-20261111-01/candidate`, sobre a interface das 16h53. Cinco sobreposições, três fontes novas e 2.141 fontes no total. Somente a migration 18 foi aplicada uma vez; as 17 anteriores permanecem intactas. Atributos/grants, frontend, perfil, runtime e serviços foram preservados. Publicação técnica e aceite de Josias são estados distintos.

## Diagnóstico

A conferência autenticada do novo chat carregou o Painel e a lista, mas a busca por telefone excedeu o limite de oito segundos. Duas leituras controladas, somente leitura, no JB APEX mediram 4.795 ms sem busca e 4.444 ms com busca. A primeira repetiu `private.planeje_live_session` e `private.crm_ia_role` 2.933 vezes. O tempo próprio da montagem das conversas foi cerca de 81 ms; as verificações repetidas de sessão e acesso dominaram o custo.

A investigação usou internamente uma sessão já existente do próprio titular. Não registrou claims, tokens, identificadores de sessão, conteúdo de mensagens ou credenciais. Evidência detalhada fica nas pastas privadas de operação, fora dos documentos de produto.

## Mudança e limites

A migration `20261111203128_crm_ia_conversation_access_performance.sql` contém um único `CREATE OR REPLACE` de `private.crm_ia_conversation_rows(uuid)`. Um escopo materializado por consulta calcula ator, acesso à conta, papel e restrição por responsável. Os predicados de contato e lead reproduzem os helpers canônicos sobre esse escopo. As verificações de canais, seleção da última mensagem e resolução de vínculos ambíguos permanecem iguais. Não existe cache entre requisições; revogação passa a valer na próxima leitura, inclusive com plano preparado no mesmo backend.

Os helpers canônicos permanecem intactos. As cópias dos predicados devem acompanhar futuras mudanças nesses helpers; o teste compara os predicados com as funções reais e com o leitor anterior. A mudança não altera o timeout, índices, tabelas, dados de clientes, permissões, transporte ou frontend. As 17 migrations aplicadas são imutáveis e não podem ser reaplicadas.

## Verificação local

`node --test --test-concurrency=1 scripts/crm-ia/conversation-access-performance.database.test.mjs` passou seis testes, sem falhas ou skips, em PostgreSQL descartável com socket Unix privado e rede externa bloqueada. O teste carrega as 17 migrations anteriores, os helpers reais de sessão/acesso e uma cópia exata do leitor 16 como oráculo. Compara metadados, assinatura, OID, owner, ACL, seis papéis, contatos privados e sem responsável, grupos, NULLs, canais negados/arquivados/alheios, ambiguidade, 14 envelopes dos consumidores e revogações no mesmo backend.

Na fixture com 551 contatos, mais de 31 mil mensagens e 1.093 pares visíveis, a prova RED contou 3.880 chamadas de sessão/papel; GREEN contou 16. As chamadas escalares de contato e lead passaram de 551/552 para zero; quatro verificações de canal foram preservadas. ESLint do novo teste passou. Essa medição de trabalho não substitui a conferência de latência e interface em produção.

## Operação prevista

Release privada `crm-ia-acesso-leitura-20261111-01`, com sobreposições explícitas e base produtiva conferida. Herdar integralmente frontend, assets, perfil/flags, runtime e serviços; não compilar ou reiniciar. O publicador deve verificar seu helper antes da importação, rejeitar destinos/ancestrais simbólicos, manter os dois locks compartilhados durante preparar/aplicar/promover/verificar e conferir o estado completo da função antes e depois de uma única transação SQL.

Interrupção após COMMIT exige reconciliar o estado e o journal; nunca reaplicar a migration por inferência. Homologação real de envio, modelo, áudio e evento Google permanece pendente e restrita às escolhas já autorizadas pelo titular. A meta integral segue na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md).

## Publicação e conferência

O publicador `7785a03e`, escopo `cd178dc5` e pacote `73b346ae` foram revisados nos hashes completos privados. A revisão SQL acrescentou 81 combinações em 12 contextos, todas equivalentes; o publicador passou 19 contraprovas independentes e oito guardas transacionais em banco descartável. A execução `complete` terminou com saída zero, mantendo os dois locks durante preparação, aplicação, promoção e verificação. Corpo `838037e142d7859321ce73e25094eee1` substituído por `1fcb0fc350559ee0315e30aa88f851d7`, sem alterar OID, owner, ACL, assinatura ou atributos. Não repetir `complete` ou a migration.

HTML `0b9ba1ba2491c640635a8671c263f40618837bfaf263bb59dc073c44245419c9` e os 26 artefatos herdados foram preservados; 27 verificações HTTPS passaram. A prova controlada posterior, com o limite de oito segundos mantido, mediu 518,596 ms sem busca e 618,421 ms por telefone, com 18 verificações de sessão em cada leitura. Esses números são duas observações da instalação, não garantia de latência sob toda carga.

Na sessão real, a busca pelo telefone de teste retornou duas conversas sem timeout. Uma conversa carregada mostrou nome/foto e atribuição conservadora das mensagens legadas. A conclusão da inspeção de histórico/foco/fila ficou pendente porque o Chrome passou a retornar controle desconectado; houve tentativas documentadas de recuperação na mesma sessão e pedido de reconexão ao titular. O contrato também omitia telefone/follow-up no cabeçalho; seu reparo é um incremento separado, ainda não aplicado neste registro. Nenhum envio, modelo ou evento externo foi executado.

Este documento foi atualizado localmente após a publicação; a versão de preparação preservada na candidata continua identificada pelo manifesto. Metadados e diagnósticos privados ficam em `.local/crm-ia-acesso-leitura-20261111-01` e na pasta operacional correspondente da VPS.
