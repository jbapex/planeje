# CRM IA — período entre Painel e Conversas

Estado: publicada às14h26 BRT em `crm-ia-periodo-20261111-01/candidate` sobre `crm-ia-leitura-20261111-01/candidate`. As16 migrations aplicadas permanecem imutáveis; nenhuma SQL ou serviço alterado neste incremento. [Plano e contrato](../../superpowers/plans/2026-11-11-crm-ia-periodo-conversas.md).

O atalho do Painel já incluía o período na URL, mas a lista de Conversas omitia `since`/`until` ao consultar o servidor. Isso usava sete dias mesmo ao abrir um Painel de30 dias. O ajuste repassa datas e filtros já aceitos pelo leitor atual: funil, etapa, origem e ordenação, além dos filtros anteriores. Buscar, selecionar e paginar preservam o recorte; editar uma data retorna à primeira página. Sem datas explícitas, a lista mostra os sete dias do padrão em America/Sao_Paulo. Detalhes recolhíveis apresentam as datas sem duplicar o cabeçalho.

Três testes novos falharam primeiro por datas ausentes. Depois passaram58/58 testes dirigidos de interface, controles, conversa na ficha e prévia, sem falhas, cancelamentos ou skips; lint dos dois arquivos passou. A prévia real foi conferida em320,390 e1280×800 com os detalhes abertos, datas corretas, título único e sem transbordamento horizontal. Testes e navegador usam dados fictícios, sem transporte externo. Essa correção não altera banco, runtime, permissões ou a consulta individual do estado.

A consulta individual já usa `messages.state` quando a conversa não aparece no recorte padrão da lista; o enriquecimento do atendente em conversas históricas continua a conferir. Homologação com WhatsApp/modelo e evento externo Google ainda pendente, restrita ao único destinatário autorizado. Não ativar envio automático em massa nem inferir paridade integral pelo incremento.

## Publicação e conferência

Publicação em `2026-11-11T17:26:33.133719Z`: dez sobreposições explícitas e2.116 fontes. A revisão de interface passou5/5 casos independentes, incluindo recusa/revogação de acesso, e ambas as revisões encerraram sem achados nos hashes finais. A candidata passou nove testes Node20.19.1 e build produtivo em38,78s; perfil herdado e fontes fora do recorte preservadas. O check completo anterior não foi apresentado como nova execução depois deste delta;58 testes de interface afetados e lint passaram localmente.

HTML `e3b288ca83111286daf7b63a8ac1e2546dfa701d03498035ae0855f0bc4d1b89`, entrada `index.89bdb330.js`, CSS global `index.ac7c11f0.css`, CRM `CrmIaWorkspace.3729a8db.js` / `d7943553.css`. O verificador confirmou25 artefatos HTTPS com hashes, fontes, serviços, runtime e assets anteriores. Não houve migration, reinício, envio/modelo ou uso do `dist` da raiz local. Escopo SHA256 `116e8329eb92b075847e976feb8659455968de3641015ccd8d668cd00a404e80`; publicador `854436f09302ec29c371b4ac2310449752bf34ed09fdd7dd864f1586d8429649`. Não repetir a promoção.

Na sessão autenticada, o atalho do Painel abriu Conversas com as mesmas datas e total. A segunda página manteve o período e carregou; o retorno ao Painel também passou. A lateral expandida mediu248px, com título único, seletor habilitado e sem transbordamento. Recibos e capturas permanecem privados em `.local/crm-ia-periodo-20261111-01/`, incluindo `crm-compacto-producao-final.png`. Isso confirma o percurso observado nessa conta, sem substituir homologação real de envio/follow-up ou aceite humano da matriz completa.
