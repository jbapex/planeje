# Atlas: conversa e consultas visíveis no escritório — entrega local

Data: 18/10/2026. **Implementado e validado localmente; não publicado nem aceito por Josias.**

## Problema observado e resultado

Josias considerou o painel privado confuso e perguntou por que o chat dizia que agentes trabalhavam sem isso aparecer no cenário. As consultas do chat (`atlas_jobs` e seus passos) não alimentavam os personagens do escritório: os contadores existentes representavam acompanhamentos por funcionário. Na captura humana das 13h44, o retorno já estava registrado às 13h40; isso também não comprova trabalho ainda em execução nem tarefa concluída. A captura relata uma informação recebida sobre dados futuros, não uma entrega verificada.

O painel no escritório agora usa o avatar existente do robô, fundo claro, mensagens contínuas e controles avançados recolhidos em “Detalhes e histórico”. Contexto/confirmação de cliente, áudio, ditado, rascunho, retomada e histórico reutilizam o controlador existente. O painel de inteligência fora do escritório conserva sua apresentação anterior.

A faixa “Atlas e especialistas de IA” e os personagens adicionais usam somente consultas realmente em execução e os passos registrados. Especialistas aparecem como “Operação · IA”, por exemplo; os acompanhamentos de pessoas têm título separado. Um pai aguardando um especialista é mostrado em espera, usando a última delegação do filho, inclusive quando o mesmo especialista é consultado de novo por outro pai. Fila, espera pela equipe, conclusão, falha e cancelamento não inventam trabalho ativo.

O Atlas no cenário continua sendo o sprite pixelado animado existente. Ele visita a posição do especialista ativo; clicar nele ou no especialista abre a conversa e consulta exatas. Visitas a pessoas continuam exigindo thread real. Troca para outra conversa durante envio/áudio é recusada sem falso sucesso ou perda do texto. O rascunho e o mapa continuam montados enquanto o dono conversa.

## Contratos e limites

- Adaptador puro `src/lib/atlasOfficeMissions.js`; consumidores `AtlasPage`, `AtlasOffice`, snapshot, visitas e mapa. Nenhuma nova dependência, tabela, autenticação, modelo ou motor de tarefas.
- Ponte same-origin envia IDs, horários e frases fixas de catálogo. Texto do pedido, título, resultado, resumo livre e conteúdo privado da conversa não atravessam o mapa. A abertura valida UUID e encontra a conversa no catálogo conhecido pelo pai.
- Atualização pela leitura existente de bootstrap a cada quatro segundos. O timer mantém base/jobs atualizados durante outro envio, preservando histórico/rascunho nesse período. Não é streaming nem presença humana.
- Heartbeat recente do worker principal é obrigatório; ausente ou antigo (90 segundos) retira a indicação de trabalho. É evidência de vida recente do processo, não certificação de progresso contínuo de cada consulta.
- Consulta manual real pode aparecer fora do expediente; pessoas continuam descansando. Nenhuma mudança nas regras de horário, datas, autonomia ou custos.
- “Retorno recebido” e “Consulta finalizada” não significam tarefa entregue ou publicação comprovada.

## Verificação

**51 testes Node selecionados**, 32 verificações de navegador (17 conversa, cinco mapa, dez atividade integrada), `npm run check` e build isolado do mapa passaram. Rede do QA restrita às prévias fictícias locais. Sem IA real, conversa humana simulada na produção, nova tarefa ou acesso produtivo nesta entrega.

```sh
node --test scripts/atlasOfficeMissions.test.mjs scripts/atlasOfficeRobot.test.mjs scripts/atlasOfficeHours.test.mjs scripts/atlasOfficeActivity.test.mjs scripts/atlasConversationClients.test.mjs scripts/atlasConsultationPresentation.test.mjs scripts/atlasManagerSourceOrder.test.mjs
npm run check
```

Os verificadores `scripts/atlas-manager-integration/verify-office-chat.mjs`, `verify-map-chat.mjs` e `verify-live-chat.mjs` usam Chrome/Playwright já instalados. A integração final reproduz envio A pendente/clique na consulta B, continuação na mesma conversa, clique físico no robô pixelado, payload sem texto privado, término/falha, rascunho e celular. Artefatos completos em `.local/atlas-office-live-conversation-20261018-01/`; baseline anterior exato em `before/`, pois HEAD não representa a versão funcional atual. Manifesto de 15 fontes/testes selado e reconferido.

Revisão independente privada em `/Users/josiasbonfimdefaria/.codex/reviews/atlas-office-live-chat-2026-10-18.md`: zero achados abertos, quatro resolvidos (renderização inicial, destino do robô, troca durante envio e associação de delegação antiga). A última integração do coordenador passou após o fechamento da revisão.

**Observação fora do delta:** o revisor executou separadamente `scripts/atlasAudio.test.mjs:59`, “reader includes transcript provenance and can read all pages without mixing group scope”, e encontrou `conversation.records.messages` indefinido na fixture em memória. Reader/áudio não foram alterados nesta tarefa. O vínculo explícito de grupo ausente na fixture é a hipótese observada; não há comparação funcional anterior que permita atribuir regressão a esta entrega. Sem afrouxar filtros nem alterar o teste para ocultar a falha. O conjunto dirigido acima e `check` passaram; não declarar toda a suíte do repositório verde.

## Prévia e publicação

[Captura da conversa e atividade no computador](../evidencias/atlas-conversa-atividade-escritorio-desktop-2026-10-18.png) · [celular](../evidencias/atlas-conversa-atividade-escritorio-mobile-2026-10-18.png) · [evidência, hashes e verificações](../evidencias/releases/atlas-conversa-atividade-escritorio-local-2026-10-18.json).

Prévia fictícia local em `http://127.0.0.1:4342/?office=1`, processo observado durante QA; a disponibilidade não é promessa de serviço persistente. Não aponta para clientes reais. Build do mapa somente em `.local/.../public/atlas-office`: JS `1ed69416`, CSS `59ec53c3`.

Publicação exige autorização específica para este conjunto conforme AGENTS. Antes de publicar, reler operação/release e conferir concorrência na VPS. A continuidade local registra publicação concorrente do Calendário às 14h05: frontend/perfil `social-calendar-polish-20261018-02/candidate`, guarda 1.722, main `f9d86e8c`/`ba95b7b8`; o worker principal continua na candidata `atlas-manager-source-order-20261018-01/candidate`. Essa informação veio das notas compartilhadas, sem nova sondagem produtiva nesta tarefa. Compor somente o delta frontend/mapa sobre a fonte produtiva vigente, herdar perfil/flags e atualizar a versão do iframe. Não promover a raiz suja, dist antigo ou fixtures; não reaplicar SQL, repontar workers ou reverter o Calendário. Aceite visual real e consulta/retorno humano no novo visual permanecem pendentes.
