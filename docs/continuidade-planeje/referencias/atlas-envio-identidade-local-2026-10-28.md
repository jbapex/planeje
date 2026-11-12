# Atlas: envio imediato e consulta indicada pelo dono

Estado da QA anterior à autorização: **implementado, testado e revisado localmente; ainda não publicado naquela etapa**. Pedidos de Josias: enviar com Enter e ver a mensagem sem esperar a IA; reconhecer o próprio dono e consultar a pessoa explicitamente indicada. A autorização da release de conversa/equipe de 27/10 não autorizava este novo reparo ou sua migração.

**Atualização posterior: Josias autorizou “pode” e o conjunto foi [publicado em28/10, 08h11](atlas-envio-identidade-producao-2026-10-28.md)**, com nova migração aplicada uma vez e verificação técnica concluída. O restante preserva a evidência da etapa local; primeiro ciclo humano e aceite continuam pendentes.

## Diagnóstico e alteração

O endpoint já devolvia um recibo antes da análise. A interface, porém, esperava o POST e a recarga completa de lista/contexto antes de mostrar o texto e liberar o envio. O campo não tratava Enter. Agora a mensagem aparece imediatamente com estado de envio; confirmação do servidor e resposta do Atlas continuam etapas distintas. Enter envia; Shift+Enter quebra linha; composição IME e tecla mantida não enviam acidentalmente.

O texto local só desaparece quando a mensagem persistida correspondente é encontrada. Falha ou confirmação ausente preservam o texto e oferecem retentativa com o mesmo ID; um rascunho novo permanece intacto. O recibo tem limite de 15 segundos. Recarga em segundo plano não prende a confirmação nem substitui o contexto de outro assunto. Troca de usuário cancela/descarta a fila local anterior e ignora confirmação tardia. O campo aceita preparar outro texto enquanto a IA responde; continua existindo uma análise ativa por assunto. Não foi criada uma fila ilimitada de mensagens.

O segundo defeito vinha de um acompanhamento sem tarefa vinculada: a continuidade forçava `owner_needed`, e o writer escalava ao dono mesmo quando ele próprio era o autor autenticado. Nome escrito no chat não comprova identidade. O reparo usa ator/sessão persistidos e reconhece a orientação do dono, mantendo explícita a ausência do registro.

Uma diretiva atual, imperativa e inequívoca, como “confirme com a Poliana”, permite uma consulta filha isolada para essa pessoa interna ativa. O vínculo oficial da conta e da tarefa permanece igual. O colega recebe somente uma pergunta operacional mínima sobre o assunto, sem mensagem bruta, histórico ou resumo privado do dono. O retorno é atribuído e datado no assunto de origem; relato de exclusão não exclui nem conclui tarefa oficial. Expediente individual e dias úteis continuam vigentes; consulta agendada não é apresentada como enviada.

Nomes ambíguos, negação, condição ou instruções contraditórias não ampliam contatos. O parser deliberadamente aceita diretivas explícitas reconhecidas; não cobre toda formulação livre. Sessão, política, fonte, destinatário exato, lease, revisão e origem são reconferidos antes da escrita. Nenhuma credencial, modelo, provedor, limite ou configuração produtiva foi alterado.

## Verificação local

- Navegador isolado em 1280/390: dez grupos novos de envio, oito de diálogo, cinco de retry e cinco do aviso breve. Inclui confirmação lenta, recarga lenta, perda do recibo após gravação, limite real de 15 segundos, retentativa, navegação, troca de usuário antes de confirmação tardia, IME e texto acima de 4.000 caracteres. Zero rede externa e zero erros de navegador.
- Helper Node: paginação de 113 assuntos, falha parcial e atenção pessoal preservadas.
- 200 testes Python em oito arquivos selecionados, sem discovery amplo: diálogo25, fila5, manager58, progress25, regras19, eventos/contexto54, model_context9 e diálogo/dispatch5. Transportes/modelos são fictícios.
- 244 verificações nomeadas em PostgreSQL descartável por socket: 140 históricas nas etapas correspondentes; 41 atuais de diálogo/fila/eventos e 63 de roteamento no esquema final. Inclui sessão/política/fonte revogada, pessoa ambígua/inativa, replay, consulta fechada e expediente. Nenhum DSN produtivo é aceito pelo runner.
- `npm run check` passou em 27/10: contexto, harness, lint rápido/tipado, tipos, regras, testes locais e build temporário. Lint: 361 avisos/zero erros; tipado: 11 avisos/zero erros. Não houve supressão de regras nem promoção do `dist` da raiz.
- Revisão independente da interface encerrada sem achados abertos após corrigir limite de texto e acrescentar testes reais de timeout/identidade.
- Revisão sensível do backend identificou dois P2 de continuidade, corrigidos com regressões RED/GREEN: impedimento de verba/escopo retorna ao pai sem outra escalada; consulta revogada deixa de bloquear reconcile, criação manual e vínculo de tarefa existente. Os filtros excluem somente o subtipo de consulta com prova, como o índice; nenhuma permissão de filho revogado é relaxada. **Revalidação independente encerrada sem achados abertos no recorte:** executou novamente 244 SQL e 102 Python dirigidos, confirmou os hashes e encerrou o cluster. Publicação ainda depende da autorização específica.

Fixtures, baselines físicos, logs e capturas: `.local/atlas-instant-send-20261027/` e `.local/atlas-owner-contact-20261027/`. A revisão sensível privada fica fora do repositório. Dados de teste são fictícios. O grafo local não cobria o delta com linhas atuais; consumidores foram conferidos diretamente no código. Context7 foi consultado somente com questões públicas de React18 e helpers de RLS do Supabase.

[Manifesto e resumo verificável](../evidencias/releases/atlas-envio-identidade-local-2026-10-28.json). Foram conferidos 17 hashes finais de produto/fixture/teste e o hash da migração aplicada anterior. A prévia Vite própria4358 foi encerrada depois dos testes; não prometer servidor de demonstração em segundo plano. Os 361 avisos do lint continuam registrados, não equivalem a zero avisos.

## Operação futura e limites

Frontend: `AtlasTeamAssistant.jsx`/`.css`. Backend: `manager.py`, `server.py`, `time_rules.py`. Migração nova **20261027193803_atlas_owner_contact_reply.sql**, aplicada apenas na fixture até aqui. Não editar ou reaplicar a migração já publicada **20261027170137**, cujo SHA permanece `e7693827c1d020ed4ccc59c252c8f33e1b6293eb7df588769528e8d5c4ad89c5`.

SHA da migração nova verificada: `f3adf0b2c48a948873cec1fabb5c9a1f8227368b4f04f1ac1f8e65ee5a9c1327`. A consulta revogada é preservada como histórico, sem acesso ou envio; não houve limpeza privilegiada para contornar a prova. Na fixture de criação manual, o watcher automático fica isolado para exercitar o RPC próprio; os testes de reconcile rodam separadamente. A tentativa inicial de executar todos os testes históricos no esquema final encontrou um contrato antigo que esperava acesso já revogado pela release anterior; por isso, não se declara que as 140 verificações históricas validem o RLS final. Uma tentativa inicial de discovery amplo foi barrada pelos guards de host antes de qualquer transporte; não repetir esse método.

Após obter autorização específica, conferir fontes/release concorrentes e herdar candidata e perfil produtivos vigentes, inclusive `.env.production.local`; a publicação de Eventos Google de **28/10, 07h33**, base `google-events-ui-20261028-01/candidate`, já sucede o Atlas16h12 e o Google16h33. Sua entrada canônica chegou durante esta QA e foi preservada; ela não foi publicada por este reparo. Conferir novamente no momento da publicação; não promover bundle de teste ou assumir a base antiga. Atualizar só os serviços afetados. Não repetir respostas antigas em massa nem chamar equipe/IA real como teste sem autorização pertinente.

Nenhuma publicação, migração produtiva, reinício ou mensagem à equipe foi realizado por este reparo. Comportamento de IA real, primeiro ciclo humano e aceite permanecem pendentes. Campanhas ao vivo, bytes de anexos e publicação externa não são verificados por esta entrega.

Após uma futura publicação autorizada, validar na conversa existente: escrever uma orientação e enviar com Enter, observar a própria mensagem imediatamente, preparar outro rascunho enquanto o Atlas analisa e conferir o reconhecimento do dono. Para testar o contato, enviar uma nova diretiva explícita, como “Confirme com a Poliana.”, e acompanhar a consulta/retorno reais no expediente pertinente. Mensagens antigas não serão reprocessadas automaticamente; não criar contatos reais apenas para fabricar evidência de teste.
