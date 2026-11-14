# CRM IA — período entre Painel e Conversas

Estado: correção local validada, revisão e candidata frontend em fechamento. Base produtiva `crm-ia-leitura-20261111-01/candidate`, publicada às14h01 BRT, com16 migrations aplicadas imutáveis. [Plano e contrato](../../superpowers/plans/2026-11-11-crm-ia-periodo-conversas.md).

O atalho do Painel já incluía o período na URL, mas a lista de Conversas omitia `since`/`until` ao consultar o servidor. Isso usava sete dias mesmo ao abrir um Painel de30 dias. O ajuste repassa datas e filtros já aceitos pelo leitor atual: funil, etapa, origem e ordenação, além dos filtros anteriores. Buscar, selecionar e paginar preservam o recorte; editar uma data retorna à primeira página. Sem datas explícitas, a lista mostra os sete dias do padrão em America/Sao_Paulo. Detalhes recolhíveis apresentam as datas sem duplicar o cabeçalho.

Três testes novos falharam primeiro por datas ausentes. Depois passaram58/58 testes dirigidos de interface, controles, conversa na ficha e prévia, sem falhas, cancelamentos ou skips; lint dos dois arquivos passou. A prévia real foi conferida em320,390 e1280×800 com os detalhes abertos, datas corretas, título único e sem transbordamento horizontal. Testes e navegador usam dados fictícios, sem transporte externo. Essa correção não altera banco, runtime, permissões ou a consulta individual do estado.

A consulta individual já usa `messages.state` quando a conversa não aparece no recorte padrão da lista; o enriquecimento do atendente em conversas históricas continua a conferir. Homologação com WhatsApp/modelo e evento externo Google ainda pendente, restrita ao único destinatário autorizado. Não ativar envio automático em massa nem inferir paridade integral pelo incremento.

Publicação prevista em `crm-ia-periodo-20261111-01`, somente frontend e fontes explícitas sobre a base vigente. Perfil produtivo herdado na VPS; sem migration, reinício ou uso do `dist` da raiz local. Recibos, hashes e capturas permanecem no registro privado da tarefa.
