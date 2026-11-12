# CRM IA — custo da leitura de conversas

Na conferência autenticada após a release05b, o Painel da conta autorizada retornou `canceling statement due to statement timeout` duas vezes. O limite produtivo de authenticated é8s. As migrations05 não mudaram essa consulta: ela continua em `20261111043800_crm_ia_workspace_readings.sql` e é usada por Painel, Conversas, detalhe de lead, Uso e enriquecimentos posteriores.

## Evidência e direção

O leitor chama `private.crm_ia_channel` em cada mensagem. Em fixture PostgreSQL16.15 com helpers privados reais, índices com as formas observadas e decisões externas de acesso sintéticas,250 contatos/37.500 mensagens reproduziram o timeout de8s. A única variante mediu739ms: materializar os IDs dos canais permitidos pelo mesmo helper e associá-los aos dois lados do histórico. No cenário de15 mil mensagens, checks de canal caíram de13.951 para4. Há igualdade integral do JSON no cenário menor e oito casos do leitor preservados; tempos não comprovam desempenho em produção, que usa PostgreSQL17.6.

A correção será somente `CREATE OR REPLACE` da função privada existente, em migration inédita `20261111162400_crm_ia_conversation_read_performance.sql`. Reusar o helper de autorização atual; manter assinatura, OID, proprietário, volatilidade, SECURITY INVOKER, search_path e grants. As15 migrations já publicadas são imutáveis. Não criar índice, cache persistente, outro leitor, motor ou alteração de timeout.

## Aceitação

- Canais são avaliados por consulta; volume de mensagens não multiplica os checks de autorização.
- JSON e população permanecem iguais nos recortes: tenant, contato, canal, responsável, funil, etapa, origem, busca e período.
- Preservar contatos privados, grupos, canal negado/arquivado/ausente, aliases OR dos JIDs e ambiguidades de telefone/lead.
- `latest` continua calculado antes do filtro de período, com os mesmos desempates. Mensagem mais recente fora do recorte não faz reaparecer uma antiga.
- Revogação tem efeito na próxima consulta; a autorização não fica guardada entre pedidos.
- Teste determinístico usa chamadas reais medidas por pg_stat_user_functions; não depender de tempo de parede para passar.
- Testes de banco existentes exercitam a função nova. Revisão independente lê o delta contra05b e verifica atributos/grants e consumidores.
- Publicação SQL isolada herda fonte/perfil/serviços atuais, aplica uma vez em transação com guards e conserva frontend/runtime/HTML/assets. Conferir o Painel e Conversas na sessão real após aplicar.

A documentação PostgreSQL17, seção7.8.3, foi consultada via Context7: [materialização de CTE](https://www.postgresql.org/docs/17/queries-with.html). A materialização impede chamadas repetidas, ao custo de bloquear pushdown; a lista de canais é pequena e o filtro de histórico permanece no lugar atual.
