# Atlas: registros da tarefa — publicado para validação

Publicado em **20/10/2026, 13h11 de São Paulo** (16h11 UTC), na VPS72.60.14.109, após Josias responder “atutorizo” ao pedido específico: quatro testes de IA com dados fictícios e, passando, publicar a correção, aplicar a migração e reiniciar o serviço do robô. A verificação técnica terminou; o primeiro ciclo humano posterior e o aceite continuam pendentes.

[Abrir o escritório](https://planeje.jbapex.com.br/#/assistant/atlas) · [Preparação e diagnóstico](atlas-registros-tarefa-local-2026-10-20.md) · [Evidência sem conteúdo de clientes](../evidencias/releases/atlas-registros-tarefa-producao-2026-10-20.json).

## O que foi publicado

A conversa e o worker recebem os registros oficiais da tarefa vinculada: descrição/briefing, status e atribuição, datas separadas, histórico, comentários com autor/data, justificativas e referências de anexos/publicações. O helper é SECURITY INVOKER e preserva o limite da conversa, cliente e tarefa, sem ampliar RLS. O prompt identifica fontes como dados não confiáveis e informa recortes.

Uma etapa oficial ainda não observada pode oferecer o único responsável ativo para acompanhamento. O servidor impede encaminhar a outra pessoa diante de autoidentificação afirmativa explícita, como “sou eu mesmo”, mesmo se a IA devolver um ID divergente. Essa guarda é estreita; não comprova interpretação perfeita de toda frase natural. Ao contatar o único responsável oficial, o repasse inclui até dois trechos recentes de comentários, com autor/data e aviso para conferir a íntegra na tarefa. Não depende só de um resumo genérico da IA.

O contato aguarda o expediente do destinatário. A próxima revisão do Atlas pode ser renovada se vencer na espera; a previsão histórica da pessoa não é inventada nem convertida em prazo oficial. Mudança de fontes antes da gravação/despacho bloqueia resultado desatualizado. Se as fontes mudarem na fila, o fluxo existente ainda pede confirmação em vez de reanalisar automaticamente.

Nenhum responsável, status ou prazo oficial de tarefa foi alterado. O histórico anterior não foi reescrito nem reprocessado em massa. Anexos/publicações são metadados: não houve abertura de vídeo, áudio ou link nem verificação externa de conteúdo/qualidade.

## Candidata e ativação

Release/candidata: `/root/planeje-releases/atlas-task-record-20261020-01/candidate`, herdada de `social-compact-20261020-01/candidate`. Foram sobrepostos somente três módulos Python (`manager.py`, `server.py`, `time_rules.py`) e a migração nova `20261020151558_atlas_task_record_context.sql`. A migração foi aplicada **uma vez**; não reaplicar nem repetir o publicador. Migrações anteriores não foram repetidas.

Perfil produtivo foi herdado somente dentro da VPS, modo0600. Framework, modelo, provedor, autenticação e limites preservados. Somente `planeje-atlas-team` foi reiniciado/repontado; cwd efetivo e unidade conferidos. Os outros três serviços mantiveram suas unidades.

Não houve build ou troca de interface. Main `40625506`/`bc73e6cf`, escritório `1ed69416`/`59ec53c3` e seus bytes continuam os do calendário/escritório existentes. As1.728 fontes da composição foram conferidas na candidata e no espelho. Assets antigos preservados.

## Verificação e ensaio real

- Implementação: 54 testes do gerente/manual, 15 de horário, nove de contexto e109SQL/RLS em PostgreSQL descartável. Os54/15 também passaram contra a candidata na VPS.
- Publicador: 13 testes de autorização, unidade e recuperação passaram localmente e na VPS. Três testes PostgreSQL adicionais confirmaram contrato de definição/atributos/grants/owner, detecção de alteração só de atributo e recomposição exata. Revisão independente final sem achados abertos.
- As quatro chamadas reais autorizadas usaram `gpt-4o-mini-2024-07-18`, credencial existente e somente dados fictícios:14.103tokens. Três passaram inicialmente. A primeira reconheceu o autor no texto, mas trouxe ID de outra pessoa; o repasse de alteração também ficou genérico. Esses resultados originais foram preservados, sem mascarar a falha.
- O ajuste posterior ficou somente no validador: autoidentificação explícita impede o contato errado, e o repasse oficial inclui trechos da tarefa. AST de todo o restante do módulo, prompt, esquema e construção das fixtures permaneceram iguais. As quatro saídas reais gravadas passaram no replay pela validação corrigida, vinculado por SHA ao relatório original e ao novo módulo. **Replay não é chamada nova de IA**; não houve quinta chamada. Essa evidência certifica a defesa do servidor nesses casos, não uma nova escolha correta do modelo.
- Depois da ativação: quatro serviços ativos, cwd correto do robô, seisHTTP200 com bytes/hashes correspondentes,1.728fontes, contrato SQL/atributos/grants e índice conferidos. A requisição sem autenticação ao socket foi recusada com401/403. Na janela da publicação, contagens e hashes de tarefas/threads/mensagens, política/eventos e saídas WhatsApp permaneceram iguais.
- Leitura produtiva somente de metadados confirmou etapa de alteração, dois comentários, uma justificativa,13eventos de status e uma referência de anexo; responsável ativo corresponde ao cadastro atual. Nenhum conteúdo de comentário foi copiado para a evidência. Jornal do novo worker na amostra: uma entrada, zero marcadores de exceção.

A primeira qualificação remota parou por importação relativa da fixture de horário fora da pasta original. O suporte da fixture foi ligado à candidata; depois os testes passaram, antes de qualquer ativação. Um guard local de preparação também encontrou baseline disponível apenas na VPS; a verificação integral desse arquivo permaneceu no publicador remoto. Nenhuma dessas etapas publicou ou alterou o banco.

## Recuperação e próximo uso

O publicador reutiliza promoção/recuperação anteriores fixadas por hash, com autorização e quatro fontes exatas. Se falhar depois do SQL, a recuperação restaura apenas as três funções consumidoras anteriores sob guarda exata de definição/atributos/grants/owner e corpo; mantém o helper aditivo e não reaplica a migração. Só então restaura o worker antigo. Concorrência ou metadados incompletos podem exigir intervenção manual, com serviço parado para evitar sobrescrever trabalho externo. Depois de interrupção, inspecionar marcadores, schema, fontes, unidade e processo; nunca repetir por tentativa.

Artefatos privados em `.local/atlas-task-record-release-20261020-01/`; cópia operacional em `/root/planeje-releases/atlas-task-record-20261020-01/`. Revisão privada: `/Users/josiasbonfimdefaria/.codex/reviews/atlas-task-record-publication-2026-10-20.md`. Publicador selado por SHA `3a66f44d2421163606e811e55237a69c89994d5666f6b66f62912f446a265864`.

Continuar a conversa existente no robô: uma nova mensagem já usa a versão corrigida. Não é preciso criar outra tarefa. Não foi enviada mensagem de teste em nome do dono ou da equipe. Interface/áudio/hardware não foram repetidos neste delta de backend. Conferir o próximo retorno humano e o acompanhamento do responsável continua sendo validação operacional, separada da publicação.
