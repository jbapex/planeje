# Atlas por acontecimentos — primeiro piloto integrado

Implementação iniciada após Josias confirmar o [plano de gatilhos e contexto](atlas-gatilhos-contexto-plano-2026-10-16.md). **Disponível somente no CS privado, em observação e com um cliente fictício selecionado. Não publicado nem ligado aos grupos reais da agência.** O plano completo continua em evolução; este piloto comprova o leitor, a fila, o vínculo e a passagem para o robô existente.

## O que está funcionando no piloto

- Vínculo explícito grupo → cliente representado, inclusive quando o canal pertence ao cadastro da agência. Vínculo ambíguo/ausente, bloqueio, arquivamento e cliente fora da carteira interrompem a análise daquele grupo. Operação vem da etiqueta, sem inferir pelo nome.
- Lote de mensagens novas e versões modificadas, até 100 anteriores configuráveis e recuperação de resposta citada mais antiga. Lotes ainda pendentes mantêm suas fontes mesmo quando elas saem da janela; lacunas e áudios pendentes ficam registrados.
- Leitura de tarefas, descrições, responsáveis, prazos, comentários e memórias ativas do mesmo cliente. O contexto também carrega a continuidade do acompanhamento interno quando existente. Não lê bytes de anexos nem conteúdo de reuniões/documentos neste primeiro leitor.
- Outbox apenas de metadados em mensagens recebidas/enviadas, transcrição, tarefas e comentários. Sem IA dentro do webhook. Conferência leve a cada 15 s; agrupamento inicial de 90 s, espera máxima de cinco minutos e reconciliação horária. Sinais sem mudança no conteúdo não viram uma análise nova.
- Fila durável com identificação por conteúdo, reserva/lease, repetição limitada, publicação idempotente e versões do pedido. Não existe o limite antigo de 12 chamadas nesse motor. Teto de tokens continua separado e a fila não desaparece quando ele é atingido.
- Modelo identifica intenção, fontes e tarefa candidata. Campos de ID têm enumeração dinâmica e validação posterior. Cancelamento, tarefa concluída, falta de tarefa/conta e contexto parcial exigem revisão do dono. Um lote que atinge o limite de cinco assuntos fica pendente para divisão/conferência, em vez de ser dado como inventário completo.
- Fontes, cliente, tarefa, comentários e memória são conferidos novamente antes e depois do modelo e antes de chamar a pessoa. Fonte alterada/indisponível ou política revogada impede o compartilhamento automático. Resultado já publicado não é republicado a cada varredura.
- Modo assistido tem autorização explícita do dono para a seleção configurada. Abre pergunta operacional no robô para a conta atual e única do cadastro; não usa Poliana como destinatária fixa. Texto compartilhado é montado com a mensagem de origem e a tarefa, sem copiar memória privada do dono. O robô conserva confirmação dos combinados, executor permitido e revisão humana da entrega.
- Minha caixa e Demandas no perfil do cliente exibem o mesmo pedido, fontes, operação, tarefa candidata, fase do acompanhamento, contagem/janela/período do contexto, fila e consumo. Registros sem ação ficam recolhidos. Falha de leitura não é tratada como fila vazia.

## Caso comprovado

Aurora eventos · FICTÍCIO, na Ápice Noivas, tem grupo explicitamente vinculado em um canal fictício da agência. Foram preparados 105 textos anteriores, um áudio com transcrição fictícia concluída e um texto com link da tarefa. A fala solicita troca da logo e confirmação da V2. O áudio cita a primeira mensagem, fora da janela de 100.

Uma chamada real do modelo relacionou o assunto à tarefa correta e pediu confirmação da versão. O contexto dessa reavaliação manual contém 100 mensagens anteriores e a referência antiga adicional: **101 mensagens, zero novas naquele pedido manual e uma expansão**. As primeiras tentativas tinham duas mensagens novas; erros de ID foram recusados antes de qualquer chamada à equipe.

O resultado foi ligado à conta fictícia por API e pelo próprio despachante do motor. O fluxo controlado passou por conta → executor → combinado confirmado → entrega informada → revisão do dono → encerramento do acompanhamento. As respostas/transições do teste foram sintéticas e confirmadas por sessões Auth normais; não houve nova IA para simular as respostas da equipe. Todos os campos oficiais da tarefa foram comparados antes/depois e preservados. Encerrar acompanhamento não conclui a tarefa automaticamente nem comprova qualidade do arquivo.

Outro cenário descartável inseriu cinco mensagens e um áudio: um único lote, bloqueado enquanto a transcrição estava pendente. A transcrição concluída substituiu o lote mantendo as seis fontes, as 100 anteriores e a referência antiga. Fora do expediente não chamou modelo nem pessoa. Fontes/lotes descartáveis foram retirados após a prova; o caso principal e seu histórico permanecem para inspeção.

## Validação

162 verificações específicas passaram ao longo da entrega, com repetição direcionada após as correções:

| Conjunto | Verificações |
| --- | ---: |
| Contexto, versões, papel do autor, escopo, expediente e limites | 45 Python |
| API/Auth/RLS, aprovação, vínculo, entrega e sessão revogada | 70 |
| Fila, 13ª reserva, orçamento, lease expirado e política atual | 15 SQL, com rollback |
| Recebimento, lote, versões preservadas e transcrição tardia | 11 |
| Fontes atuais versus snapshots desatualizados | 7, somente leitura |
| Despachante, relógio privado, destinatário e repetição | 8 |
| HTTP, origem, anonimato, colaborador e modo final | 6 |

Build completo da aplicação por Vite no Mac passou; o empacotamento das extensões não foi refeito, pois os scripts desse pré-passo não fazem parte da base CS capturada. Arquivos públicos/arquivos das extensões existentes foram preservados. Navegador autenticado: computador e 390×844, sem rolagem horizontal no novo painel (documento 390 px, painel 332 px), tarefa candidata, perfil do cliente e persistência da configuração 100 → 80 → recarregar → 100. Produção não foi usada como ambiente de teste.

A conferência do bundle confirmou URL privada, ausência da chave de serviço e ausência da chave de IA. HTTP recusa anônimo, origem externa e colaborador. Um 502 transitório apareceu quando a suíte consultou o socket imediatamente após iniciar o serviço; a nova conferência após prontidão passou.

## Consumo observado, sem confundir com cobrança

Foram **três chamadas ao modelo**: duas rejeitadas pelo validador de IDs e uma análise aceita. A aceita consumiu 16.636 tokens (16.368 de entrada e 268 de saída). A segunda tentativa rejeitada informou 14.183. A primeira perdeu a contabilização exata na versão inicial do tratamento de erro; foi mantida uma estimativa conservadora de 40.216, sem alegar que esse foi o valor faturado. O tratamento foi corrigido para conservar o uso retornado mesmo quando a validação falha e registrar zero quando a chamada ao provedor nem começou.

O contador do teste tem 71.035 registrados/estimados, zero reservado. O teto privado foi temporariamente elevado para 250 mil para concluir o diagnóstico e **voltou a 60 mil**. Por isso o contador pode estar acima do teto restaurado: nova reserva será adiada, não há autorização para continuar acima dele. A coleta continua. Não foi definido novo orçamento da agência, preço em reais ou teto produtivo. Os limites e a rotina antiga de produção não foram modificados por esta entrega.

## Runtime e fontes

- VPS de teste 2.25.216.103, host guard `srv1968820`, stack isolado `cs_integration`.
- Release `/opt/planeje-cs-integration/releases/atlas-events-20261016-01`.
- `planeje-atlas-events-pilot.service` ativo; entrada rejeita produção e qualquer outro host. Usa sessão Auth normal do dono fictício, não impersonação. Este mecanismo de acesso é exclusivo do piloto e **não deve ser copiado para produção**.
- Socket `dist/.runtime/events.sock`, grupo do Nginx, modo 0660; rota exata `/functions/v1/atlas-events`. Host/Origin locais e sessão atual obrigatórios. Nginx privado recarregado; somente o novo serviço foi reiniciado durante os reparos.
- Acesso local por túnel já aberto: `http://127.0.0.1:4320/#/caixa`. A aba de demonstração está autenticada na conta fictícia. Se o túnel cair, confirmar o IP atual do contêiner `planeje-cs-web` antes de refazê-lo; não expor esse stack publicamente.
- Assets privados `index.dda2567f.js` / `index.09aaaa39.css`. Flag `VITE_ATLAS_EVENTS_PILOT=true`, além das flags existentes do piloto. URL de Supabase/Functions precisa apontar explicitamente para `http://127.0.0.1:4320`; a primeira compilação sem essa URL foi corrigida antes do aceite visual.
- Guarda de 984 fontes antes da instalação; oito arquivos de frontend deste recorte foram promovidos. Namespace novo `scripts/atlas-events` e quatro migrações também conservados na candidata CS. Mudança concorrente em `MiniCrmPage.jsx` pertence à entrega do Mini CRM e foi preservada; não foi incorporada ao bundle privado anterior pela força de um rebuild alheio.
- **Não promover o bundle CS para produção:** contém trabalhos de Assessoria não publicados e uma base diferente. A produção foi consultada somente por HTTP; durante a entrega recebeu mudanças independentes do Mini CRM, observadas por último em `d5cf727f` / `11912e85`. A próxima candidata produtiva deve partir da base produtiva mais recente, nunca deste CS.

SQL abaixo aplicado **UMA VEZ CADA, SOMENTE NO CS**. Manifests de aplicação com hashes estão na release. Não reaplicar nem executar na produção:

1. `20261016225723_atlas_event_context_pipeline.sql`
2. `20261016231835_atlas_event_context_guards.sql`
3. `20261016232925_atlas_event_queue_recovery.sql`
4. `20261016234141_atlas_event_source_freshness.sql`

Cinco tabelas novas: config, grupos, jobs, findings e sinais. RLS de leitura exclusiva do dono atual e sessão viva; funções de worker somente `service_role`, públicas invoker; escritores privilegiados apenas no schema privado, com escopo estreito. Nenhuma credencial aparece nas evidências públicas.

## Próximas etapas necessárias

1. Conferir a demonstração e preparar o vínculo estruturado finding → demanda revisável. Hoje o pedido aparece na central/perfil e liga a tarefa/robô; **não cria automaticamente a proposta na fila antiga de demandas**. O formulário/revisão/aprovação existente continua separado.
2. Validar um cliente real em observação, inicialmente Impacto Noivas, com fonte autorizada e sem cobrança automática; testar pedidos independentes, confirmações curtas, cancelamento posterior, tarefas ambíguas, mídia e contextos longos. Uma amostra fictícia não prova qualidade em toda a agência.
3. Acrescentar busca por assunto/período e documentos/reuniões pertinentes. Neste primeiro leitor a expansão automática é por referência citada. Lotes grandes permanecem pendentes; divisão orientada por assunto ainda precisa ser implementada.
4. Completar o tratamento de informação nova quando já existe conversa ativa: hoje reutiliza o vínculo e guarda a versão para revisão; não redireciona silenciosamente o destinatário nem substitui a conversa por uma ordem nova. Respostas na conversa não entram automaticamente nos Comentários da tarefa sem o acompanhamento/repasse autorizado correspondente.
5. Unificar leitor, ledger e estado com escritório/missões/central na implementação produtiva; completar política de retenção/purga dos snapshots e manutenção incremental do histórico de versões. Não ativar dois gerentes lendo/cobrando o mesmo assunto nem somar tetos independentes sem orçamento. Adaptar o acesso à delegação atual de produção; não usar a conta fictícia/host privado.
6. Definir orçamento/alertas e política visível de ativação por cliente. Preservar aprovação de tarefa nova, transferência, prazo oficial, verba e escopo. Relógios de revisão e fim do expediente continuam os existentes do robô; um gatilho produtivo unificado de vencimento ainda precisa ser validado com eles.
7. Só ampliar à equipe/clientes reais após o caso controlado. Este piloto terminou em `observe`, seleção de um cliente fictício, 100 anteriores, 90 s e revisão de 60 min.

Para interromper o piloto, desabilitar sua configuração ou parar somente `planeje-atlas-events-pilot.service`; preservar tabelas/fontes e histórico. Índice, fontes anteriores e Nginx privado têm cópia na release. Não parar os outros serviços nem reverter migrações compartilhadas.

[Evidência sanitizada](../evidencias/releases/atlas-gatilhos-piloto-2026-10-16.json) · [Tela do cliente](../evidencias/atlas-gatilhos-piloto-desktop-2026-10-16.png) · [Celular](../evidencias/atlas-gatilhos-piloto-mobile-2026-10-16.png).
