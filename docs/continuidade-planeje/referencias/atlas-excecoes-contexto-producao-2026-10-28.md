# Atlas: necessidade e contexto no chat — produção de 28/10/2026

**PUBLICADO E VERIFICADO às 17h01 de São Paulo; aceite de uso pendente.** Josias autorizou com “autorizar”, respondendo ao pedido de publicar a entrega com migração nova e atualização do robô. Este registro supera o estado somente local para os onze arquivos de produto publicados. [Entrega local](atlas-excecoes-contexto-local-2026-10-28.md) · [evidência sanitizada](../evidencias/releases/atlas-excecoes-contexto-producao-2026-10-28.json).

## Comportamento e acesso

O acompanhamento usa os prazos relevantes da tarefa e retornos humanos combinados antes de cobrar. Atualização normal permanece silenciosa; atraso, impedimento ou pedido novo sem resposta continuam acionáveis. O mesmo acompanhamento sem retorno recebe no máximo uma cobrança por dia útil. Decisões do dono, pausas e revisões humanas explícitas são conservadas.

No chat operacional, **Indicar tarefa existente** permite buscar a tarefa do mesmo cliente. Quando há vários pedidos, a pessoa escolhe qual deles pertence à tarefa antes de confirmar. O vínculo reaproveita o acompanhamento oficial e não transfere os outros pedidos nem altera campos de Tarefas. **Imagem** aceita até duas fotos PNG/JPEG/WebP de 5 MB cada, em Storage privado; o worker fornece os pixels ao mesmo modelo configurado. Imagem sozinha não autoriza tarefas ou prova postagem externa.

“Me contextualize” permanece uma pergunta informativa. Relato de agendamento pode corrigir a espera antiga pelo cliente; linguagem curta e natural continua identificada como Atlas. O formulário de atendimento do WhatsApp fica separado e recolhido. Não houve replay nem reescrita de mensagens antigas: as mudanças afetam novas mensagens e próximas revisões.

No escritório: robô → **Detalhes e histórico → Acompanhamento da equipe**. A conversa pessoal do escritório e o chat operacional são superfícies distintas; as fotos deste incremento entram no segundo. Em uma conversa sem tarefa, usar **Indicar tarefa existente**; para enviar captura, usar **Imagem** no input.

## Composição e migração

Release `/root/planeje-releases/atlas-context-20261028-01/candidate`, herdada da publicação de Rastreamento `rastreamento-utm-source-20261028-01/candidate`. As sete fontes existentes do delta coincidiam com a captura física revisada. Foram promovidos onze arquivos de produto, quatro novos, totalizando **1.774 fontes**. Não houve cópia integral do workspace, do pacote local ou dos fixtures.

Main `index.99cb5a52.js`, CSS `index.2f45bf86.css`; HTML SHA-256 `4dd21e197950afc0bee3066c063bde3b24b1651c5b6e601c3b23b90f7938afb3`. Perfil `.env.production.local` herdado apenas na VPS; ambiente, autenticação, modelo, orçamento e regras preservados.

Migração `20261028170215_atlas_chat_context_attention.sql` aplicada **uma única vez**, em transação, às 20h01m11 UTC. Coluna, bucket privado, seis políticas de Storage, dez corpos de função, ACL/owner dos sete substituídos e índice oficial foram conferidos. As anteriores não foram reaplicadas. Os triggers de recarga de schema do PostgREST estavam ativos.

Somente `planeje-atlas-team` mudou para a nova candidata. Os outros quatro serviços mantêm a candidata de aprendizado anterior, com seus units/drop-ins intactos. Edge foi brevemente reiniciado para a admissão; seus arquivos permaneceram iguais. Todos os cinco serviços ficaram ativos; tarefas, pessoas, contagem de mensagens/saídas e configurações ficaram iguais durante a troca.

## Verificação e limites

Passaram 172 testes Python na candidata, helpers de imagens/diálogo, build produtivo, 33 testes do publicador locais e remotos, seis HTTP/hashes, contrato SQL/ACL/RLS e checks dos serviços. A entrega local já tinha 329 verificações SQL/RLS descartáveis, 9 resultados Node, 25 grupos de navegador e `npm run check`. Revisão independente de publicação encerrou três problemas nas guardas de reinício antes de ativar: fingerprint de estado dinâmico, janela de drop-ins e recuperação sob configuração concorrente. Somente metadados da release foram normalizados/resselados após os guards anteriores passarem; fontes, perfil, SQL, QA e artefatos ficaram iguais. Não houve falha de ativação ou reparo produtivo nesta release.

Navegador autenticado confirmou conversa/lista operacional, **Imagem**, seletor do pedido e busca com 115 tarefas do cliente conferido. Não houve escolha confirmada, upload, mensagem ou chamada paga de validação. A tela informou espera pelo limite diário para novas análises; o teto atual foi conservado. O histórico continua consultável. O iframe do mapa permanece vazio no inspetor, limitação já observada; esta conferência não certifica sua renderização visual.

As rotas sem autenticação recusaram chat/equipe/eventos com 401/403/403. O journal desde a ativação não mostrou marcadores de erro de inicialização nos cinco serviços. Relatório privado de publicação: `/Users/josiasbonfimdefaria/.codex/security-reviews/atlas-context-publication-20261028.md`.

Falta validar em uso humano, com orçamento disponível: pergunta contextual → tarefa indicada → resposta curta baseada nos registros e foto real. Não inferir qualidade semântica universal, verificação de redes sociais ou aceite de Josias a partir do build. Não repetir o publicador ou a migração; falha posterior a COMMIT pede reparo incremental, sem apagar bucket/histórico.
