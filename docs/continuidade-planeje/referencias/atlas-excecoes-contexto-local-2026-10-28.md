# Atlas: acompanhamento por necessidade, tarefa e imagem no chat

Estado em 28/10/2026: **implementado e verificado localmente; não publicado**. Josias autorizou aplicar as melhorias da auditoria e acrescentar seleção de tarefa existente e fotos no chat operacional do robô. Esta autorização não inclui a publicação atual. [Desenho](../../superpowers/specs/2026-10-28-atlas-excecoes-chat-design.md), [plano](../../superpowers/plans/2026-10-28-atlas-excecoes-chat.md) e [manifesto de verificação](../evidencias/releases/atlas-excecoes-contexto-local-2026-10-28.json).

## Comportamento entregue

- Uma tarefa dentro dos prazos relevantes continua acompanhada em silêncio. Produção, etapa, entrega, postagem e horário registrado de agendamento entram na decisão. Atraso efetivo, impedimento conhecido, novo pedido sem resposta ou retorno humano combinado permitem uma pergunta. O mesmo acompanhamento sem resposta tem no máximo uma cobrança por dia útil. Os horários da equipe e os retornos explicitamente combinados continuam válidos.
- Perguntas como “me contextualize” recebem explicação e conservam a decisão anterior, sem executar ações. Um relato novo de agendamento substitui a antiga espera pelo cliente. Respostas pedem somente o que falta, em linguagem curta e natural; Atlas continua identificado como IA.
- Um pedido de grupo sem tarefa permanece com a conta responsável. Em **Indicar tarefa existente**, a pessoa busca uma tarefa do mesmo cliente e confirma a referência. Havendo vários pedidos na conversa, escolhe qual deles pertence à tarefa. O vínculo reaproveita o acompanhamento canônico; os demais pedidos continuam separados. Não cria, reabre, exclui nem altera responsável, prazo ou status oficial da tarefa.
- Escolher uma referência não responde uma decisão do dono, não exporta seu histórico privado e não antecipa uma revisão humana combinada. O registro de confirmação informa quando há decisão ou revisão anterior pendente.
- **Imagem** aceita até duas fotos PNG, JPEG ou WebP de 5 MB cada, com prévia removível. Texto ou envio apenas da imagem usam o mesmo outbox imediato, Enter/Shift+Enter e retry com o mesmo identificador. Arquivo e mensagem permanecem acessíveis somente pela conversa autorizada. O worker passa os pixels ao modelo visual já usado pelo Atlas; imagem sozinha não autoriza criação ou encaminhamento de tarefa e não prova publicação externa.
- O formulário de atendimento do WhatsApp fica recolhido e identificado como separado da tarefa. O chat informa espera por orçamento quando esse é o bloqueio real.

O incremento alcança o chat operacional `AtlasTeamAssistant` das capturas. A conversa pessoal `AtlasEntry`, o pipeline existente de grupos/transcrição, os limites de tokens e os modelos/provedores não foram substituídos.

## Implementação e fronteiras

Nova migração **local e não aplicada**: `20261028170215_atlas_chat_context_attention.sql`. Adiciona vínculo explícito por fonte, imagens privadas, projeções de contexto/fila e continuidade informativa. Mantém sessão, ator, cliente, fontes atuais, revisão, idempotência, pendências e validação posterior ao modelo. As migrações anteriores permanecem intactas.

O bucket `atlas-chat-images` é privado. Políticas restritivas delimitam conversa, remetente, request e arquivo; uploads não sobrescrevem objetos. Enqueue compara metadados com o objeto e o worker valida tamanho e assinatura dos bytes. Imagens são baixadas apenas pelo caminho interno autorizado, sem abrir URL arbitrária. O mesmo `gpt-4o-mini-2024-07-18`, autenticação e `store:false` foram preservados. Não houve chamada paga de visão nesta QA.

O checkout compartilhado contém alterações anteriores e concorrentes; HEAD não representa o estado inicial desta entrega. A captura física inicial de dez fontes/consumidores, depois ampliada para `package.json` e documentos, está em `.local/atlas-excecoes-chat-20261028/before`. Testes antigos modificados e dois arquivos de preview não têm cópia física inicial; a revisão deles é limitada ao código e aos resultados observados. Arquivos novos são identificados no manifesto. Nenhum reset, limpeza, commit ou push foi feito.

## Verificação reproduzível

- **172 testes Python**: `test_attention`, `test_dialogue`, `test_progress`, `test_rules`, `test_queue`, `test_manager`, `test_owner_contact` e `test_chat_images`. Executar cada suíte em processo separado: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts/atlas-team-pilot python3 -m unittest discover -s scripts/atlas-team-pilot -p test_attention.py`, substituindo somente o nome. Não executar `test_api.py`, que depende do transporte da VPS, nem discovery indiscriminado.
- **329 verificações SQL/RLS**: `python3 scripts/atlas-manager-integration/verify.py`. PostgreSQL novo e descartável por socket Unix; sem DSN produtivo, rede de cliente ou provedor. Inclui isolamento, sessão/revisão, replay, grupo remapeado, pedidos separados, privacidade do dono, relógio humano, fila e arquivos.
- **9 resultados Node**: `node --test scripts/atlasChatImages.test.mjs scripts/atlasTeamImages.test.mjs scripts/atlasTeamDialogue.test.mjs`. Valida bytes, limites, identidade, metadados, retry imutável e liberação do envio após timeout do Storage. Os dois primeiros foram adicionados ao conjunto seguro `test:local`, junto ao helper de diálogo existente.
- Navegador isolado: `verify-context-ui.mjs` cobre sete grupos de cenários; `verify-instant-send.mjs` cobre dez; `verify-dialogue-ui.mjs` verifica fila, contexto e atendimento separado. Ficam em `scripts/atlas-team-pilot/`. Usam a prévia Vite existente, `ATLAS_UI_PORT=4361`, Playwright/Chrome locais e abortam toda rede externa. Não usar o dev principal com credenciais reais para essa QA.
- `npm run check`: lint, regras, tipos, contexto, testes locais e build temporário. Os logs finais e capturas estão em `.local/atlas-excecoes-chat-20261028`; contagens e hashes no manifesto. Avisos anteriores de lint/build não foram ocultados nem usados para ampliar o escopo.

Três revisões independentes somente leitura encerraram o recorte sem achados pertinentes abertos, depois de corrigir os problemas encontrados. Relatórios privados fora do repositório: `/Users/josiasbonfimdefaria/.codex/security-reviews/planeje-atlas-context-20261028-c6eecbd6/`. O diretório contém segurança, atenção e interface. Não é auditoria integral ou certificação de produção; SQL e UI são fixtures, e o comportamento do modelo foi exercitado por respostas controladas.

## Publicação e aceite pendentes

Nenhuma migração, arquivo de produção, serviço, mensagem à equipe ou tarefa real foi alterado nesta implementação. A última entrada canônica de frontend lida é a publicação de Rastreamento das 15h01, `rastreamento-default-last-20261028-01/candidate`; isso não comprova o estado vivo atual da VPS.

Antes de publicar, obter autorização específica, reler a operação/release vigente, conferir concorrência e compor somente este delta com as fontes e flags produtivas, inclusive o perfil exigido. Aplicar apenas a nova migração uma vez; distribuir o novo helper Python com seus consumidores e o frontend correspondente. Não promover `dist` da raiz, reaplicar SQL anterior ou repetir respostas antigas. Em falha, preferir reparo incremental; não apagar histórico ou bucket para desfazer uma versão.

Depois da publicação, validar um ciclo humano elegível: pedido sem tarefa → escolha da tarefa correta → leitura de comentário/status/datas → resposta curta sem nova cobrança indevida. Validar também uma imagem pelo modelo real e acesso de dois participantes autorizados. Publicação, verificação técnica e aceite de Josias continuam estados distintos; não há garantia de acerto universal ou verificação automática de redes sociais.
