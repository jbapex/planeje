# Atlas: acompanhamento e retorno da equipe — piloto privado, 15/10/2026

Josias confirmou o próximo desenvolvimento após o primeiro repasse real da Impacto: acompanhar recebimento, andamento, impedimentos, decisões e entrega. Implementação funcional no **piloto CS persistente**, `http://127.0.0.1:4320/#/caixa`. **Não publicada para a equipe real nem integrada ao worker produtivo.** A tarefa produtiva `09ecf513-c981-4bd0-a809-d1c4d5c6cb82` continua sendo o repasse que Josias aprovou anteriormente; nesta evolução só foi consultada.

## Fluxo implementado

O dono inicia **Acompanhar tarefa**, escolhendo uma tarefa aberta já existente. A ação é idempotente, cria somente o vínculo privado de acompanhamento e preserva título, responsáveis, prazo, projeto e etapa. Também é possível iniciar na aba **Comentários** da própria tarefa. Repasses já vinculados entram no acompanhamento sem nova criação.

A equipe atualiza pela Minha caixa ou pelos Comentários da mesma tarefa: **Confirmar recebimento**, **Atualizar andamento**, **Informar impedimento**, **Pedir decisão do dono** e **Informar entrega para revisão**. Cada atualização é um único comentário canônico, com metadados de tipo e referência; não há conversa de execução paralela. Comentários livres antigos permanecem visíveis como “Retorno nos Comentários”, sem inferir confirmação, produção ou decisão pelo texto.

O gestor vê contadores e filtros, o último estado informado, prazo vencido quando aplicável e o próximo passo. Impedimento fica com a equipe até que ela registre o desbloqueio ou peça uma decisão. Pedido explícito de decisão e entrega para revisão entram em **Dependem de você**. Resposta do dono fica ligada ao pedido exato e aparece nos mesmos Comentários para a equipe. Uma resposta a pedido antigo, substituído ou de ex-responsável é recusada. O dono pode usar o ditado existente, conferir e registrar o texto; não há envio automático de áudio.

Um relato de entrega pede revisão e **não conclui a tarefa**. A etapa de execução continua vindo de Tarefas. Troca de responsável elimina o acesso do anterior aos novos dados de acompanhamento e não atribui a ele o andamento da equipe atual. Quando há vários responsáveis, pedidos de um não são apagados pelo avanço de outro.

## Integração e proteção

- `src/lib/atlasTaskFollowup.js`: estado determinístico, sem chamada ao modelo; considera metadados explícitos, etapa e comentários autorizados.
- `AtlasTaskFollowup.jsx`: componente compartilhado entre Minha caixa e Comentários; resposta do gestor, tipos de atualização e rascunho preservado no refresh.
- `AtlasDemandCentral.jsx` / CSS / `atlasDemands.js`: acompanhamento de tarefa existente, contadores/filtros, vínculo, leitura e retorno.
- `TaskCommentsTab.jsx`: integração condicionada ao mesmo flag privado `VITE_ATLAS_DEMAND_PILOT`; demais fluxos de comentários preservados.
- Migração CLI **`20261016005611_atlas_task_followup.sql`**, aplicada uma vez somente em `cs_integration`. Não reaplicar nem levar isoladamente à produção: depende da base do piloto.
- `atlas_task_updates`: RLS e leitura restrita; escrita direta autenticada recusada. Funções públicas são invoker; mutações privadas conferem sessão humana ativa, conta/papel, dono ou responsável atual, vínculo e estado da tarefa. Delegação de servidor não pode gravar ou usar essas ações interativas.
- Confirmações concorrentes e repetições são idempotentes. Resposta antiga não resolve pedido novo. Metadados usam o comentário canônico; remoção desse comentário não deixa pedido fantasma.

Não foram transportadas credenciais produtivas. A chave de IA e o bridge existentes não mudaram. Este acompanhamento não chamou modelo, não criou tarefa operacional produtiva, não mudou atribuição/prazo/etapa reais e não enviou WhatsApp/e-mail/CAPI. Serviços não reiniciados; apenas recarga de esquema do PostgREST pelo SQL.

## Caso real e exemplo editável

A tarefa real da Impacto foi consultada em **15/10/2026, 22:04:45, São Paulo**: Rafael, 20/10, A Fazer, zero comentários naquele instante. Uma cópia datada está na seção recolhida **Caso real · consulta de referência**, usando a tabela de snapshots privada do dono já existente. Não é acompanhamento ao vivo; o texto informa que mudanças posteriores não entram no piloto. Nenhuma resposta do Rafael foi simulada. Os dois snapshots anteriores e os clientes fictícios existentes foram preservados.

Exemplo editável claramente fictício: **[Ateliê Aurora · FICTÍCIO] Preparar campanhas de novembro · acompanhamento**. Tarefa `8aa82bea-7703-4093-b25d-f8be28266be4`, demanda `91791ac5-0411-4b7e-b118-0add6a05e8f6`. O navegador percorreu gestor → equipe → gestor, com recebimento, pedido de decisão, resposta, retomada e entrega. Ficou em **Entrega para revisão**, com etapa A fazer, prazo 20/10 e cinco comentários estruturados, para Josias experimentar. Contas utilizadas são sintéticas, pertencentes ao teste; isso não representa comunicação da equipe real.

## Validação

**19 testes Node** passaram: ausência de inferência de presença, pedido/resposta exata, comentário comum, atualização posterior, troca de responsável, múltiplos responsáveis, impedimento, entrega versus conclusão, prazo vencido e remoção de comentário canônico.

**48 verificações API/Auth/RLS** passaram: dono/equipe/anônimo, tarefa não atribuída ou não acompanhada, acesso privado, replay, identificador reutilizado, resposta de outro ator/tarefa, concorrência com um vencedor, pedido obsoleto, troca de responsável e encerramento. Tarefas e comentários anteriores permaneceram iguais; fixtures descartáveis removidas. A nova fixture persistente foi criada separadamente após a suíte.

Build final completo passou em 53,27 s. Navegador confirmou a atualização pela aba Comentários do funcionário e a mesma resposta no gestor. Acompanhar novamente manteve cinco demandas, sem duplicar. Rascunho sobreviveu a Atualizar e foi limpo sem envio. Celular 390 × 844 sem excesso lateral: painel da equipe 356,4/354 px, gestor 300/298 px (largura/scrollWidth), página 390 px. Viewport e conta de gestor restaurados. Troca de conta no piloto exigiu recarregar após a saída; não foi alterada a autenticação global. Ditado existente presente; microfone físico não foi testado nesta entrega.

## Limites e continuidade

A central atualiza as fontes enquanto está aberta (15 s) e por Atualizar. Esta entrega **não ativa cobranças ou alertas em segundo plano com a tela fechada**, nem conecta essas classificações ao worker do escritório produtivo. O contador global da Minha caixa mantém seu mecanismo anterior; os contadores novos estão na central Atlas. Integração com WhatsApp, promoção produtiva da central e incorporação somente de leitura ao gerente em horário comercial continuam pendentes. Criação de novas tarefas continua exigindo aprovação humana.

Release remota `/opt/planeje-cs-integration/releases/atlas-acompanhamento-20261015-01`, com baseline, fontes/index anteriores e revisão visual intermediária preservados. Assets finais **`index-21a611e8.js` / `index-bafb151d.css`**; anteriores conservados, socket privado preservado. Reversão visual restaura `before/index.html`; não apagar tabela, vínculos ou comentários em uma reversão automática. Aceite de uso pendente.
