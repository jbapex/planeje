# CRM IA — telefone e follow-up no cabeçalho

## Estado

Implementado e verificado localmente em 11/11/2026; publicação e conferência autenticada pendentes. Incremento SQL sobre `crm-ia-acesso-leitura-20261111-01`, sem build, alteração de frontend ou reinício. As 18 migrations CRM anteriores são imutáveis e não serão reaplicadas.

## Problema e mudança

O cabeçalho compacto usa `phone` e `followup_due_at`, mas a leitura da lista removia esses campos. A ficha comercial fornecia telefone apenas para contatos com lead vinculado; o estado individual do histórico também não continha os dois valores. Assim, uma conversa autorizada podia mostrar telefone ausente ou ocultar o selo de follow-up apesar dos dados existentes.

A migration `20261111220814_crm_ia_conversation_header.sql` substitui somente o corpo atual de `public.crm_ia_workspace(text,uuid,jsonb)`. A chamada canônica continua autorizando toda a requisição antes da leitura adicional. A página de conversas e o estado das mensagens recebem telefone e prazo de follow-up do cliente/contato exatos. Telefone é o valor cadastrado, bruto e anulável; não é inferido de `@lid`, nome ou outro lead. Follow-up preserva a semântica atual, global por contato.

Não existe novo alias, grant, tabela, índice ou cache. Autoria, fotos, ordem, paginação, total, demais ações e helpers permanecem iguais. OID, owner, assinatura, atributos e ACL completa, inclusive grant option, devem ser preservados. A função privada otimizada na migration 18 permanece intacta.

## Verificação

`node --test --test-concurrency=1 scripts/crm-ia/conversation-header.database.test.mjs` passou oito testes em cerca de 14 segundos, sem falhas ou skips, após RED real por campos ausentes. ESLint do teste passou. A fixture carrega as 18 migrations anteriores em PostgreSQL descartável por socket Unix privado e bloqueia rede externa. Uma primeira tentativa GREEN falhou na inicialização do cluster durante carga local elevada; seu log foi separado, sem subtestes executados. A repetição ocorreu após observar essa condição e passou.

Casos: contato vinculado e sem lead, telefone ausente/`@lid`, estado fora do período da lista, cliente/canal/contato alheios, privado, autorização anterior ao enriquecimento, autor humano comprovado, IA, legado desconhecido e automação. Dez envelopes anteriores são comparados integralmente após remover apenas os dois campos novos. Metadados, alias e helpers são comparados antes/depois. Logs reais ficam na evidência privada; não houve consulta ou mutação produtiva nesse teste.

## Operação e limites

Release prevista `crm-ia-cabecalho-20261111-01`, com pacote explícito e perfil/frontend/runtime herdados da base atual conferida. Aplicar somente a migration 19 em transação guardada, mantendo os locks compartilhados durante preparar, aplicar, promover e verificar. Uma interrupção após COMMIT exige reconciliação do journal e estado real, nunca reaplicação automática.

A inspeção visual produtiva aguarda a reconexão do Chrome solicitada ao titular. Publicação técnica não representa aceite humano. Sem mensagem, modelo, áudio ou evento Google real; a meta integral continua na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md).
