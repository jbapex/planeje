# Atlas: ditado, estados dos agentes e controles roxos — 15/10/2026

## Pedido e resultado

Josias pediu microfone nos campos em que escreve respostas e comandos, indicadores dos agentes e troca dos botões laranja por roxo. Publicado em 15/10, 10h11 (São Paulo), na produção 109, `#/assistant/atlas`.

O ditado está nas perguntas de cada cliente e no compositor de conversa/comandos. Clicar em **Gravar áudio**, permitir o microfone no navegador, falar e clicar em **Parar e transcrever** preenche o rascunho. O envio/guardar depende do botão habitual. Cancelar interrompe captura e descarta a gravação local sem apagar texto anterior; cancelar durante o processamento impede preencher o campo, mas uma transcrição já recebida pelo servidor pode terminar. Trocar de tela encerra o microfone. Limite de captura: 2 minutos; arquivo até 6 MiB; até 40 tentativas diárias por proprietário, contando falhas conservadoramente. Não há captura contínua nem transcrição antes de parar. Falha permite tentar novamente a mesma gravação.

Transcrição usa `gpt-4o-mini-transcribe`, português, pela chave já existente no servidor. Somente áudio/modelo/idioma/formato são enviados ao provedor. Áudio bruto fica somente na memória do navegador e no processamento da requisição; não é persistido no Planeje. O texto temporário privado permite consultar uma resposta após falha de rede e evita repetição de cobrança para o mesmo pedido. Na próxima reserva, textos com mais de 24 h são apagados e registros com mais de sete dias removidos; essa limpeza é oportunista, não um prazo de remoção automática. Só ao confirmar o formulário o texto entra na conversa ou na memória do cliente.

## Estados e economia

Sete categorias exclusivas por agente: Trabalhando, Aguardando você, Aguardando aprovação, Na fila, Disponíveis, Pausados e Atenção. Clique filtra a equipe e as tarefas. Os estados relacionam a pessoa às tarefas abertas e aos clientes/propostas sob acompanhamento. **Trabalhando** exige análise vigente e heartbeat recente; análise vencida ou serviço desatualizado não aparece trabalhando. Perguntas e aprovações podem continuar pendentes fora do expediente. Os personagens representam filas acompanhadas pelo Atlas, não presença humana nem sete execuções independentes de modelo. Agente sem tarefa aberta associada não herda pergunta de outro cliente.

Contadores e filtros são calculados a partir dos dados consultados, sem nova chamada de IA. Gerente preservado: seg–sex, 08h–17h São Paulo, leitura a cada 10 min, no máximo 12 análises/60 mil tokens/dia. Monitor legado continua pausado. Tarefas seguem exigindo aprovação humana explícita e o executor original.

## Código e acesso

- `src/lib/atlasDictationRecorder.js`: captura, limite, liberação do microfone, cancelamento e repetição.
- `src/lib/atlasDictationClient.js`: multipart autenticado, consulta do mesmo pedido e abort.
- `src/components/atlas/AtlasDictationButton.jsx/.css`, `AtlasPage.jsx`: ditado no compositor, exclusão mútua com voz contínua.
- `AtlasOffice.jsx`, `scripts/atlas-office-live/main.ts/office.css`: bridge com origem/janela estritas, ditado nas perguntas, contadores/filtros e roxo. Cronômetro atualiza somente o texto do botão, preservando o alvo do clique.
- `src/lib/atlasOfficePresentation.js`: estado único compartilhado por contadores, pessoas e personagens.
- `supabase/functions/atlas-dictation/index.ts`, `_shared/atlasDictation.js`: sessão humana atual do proprietário, body limitado, MIME/assinatura, reserva atômica e provedor no servidor.
- SQL **20261015124424 aplicado UMA VEZ em produção**. Tabela privada `atlas_dictations`, SELECT limitado à sessão humana atual do proprietário; sem INSERT/UPDATE/DELETE para usuários. RPC de reserva somente service role, invoker, trava transacional. Delegação de leitura do worker não grava/transcreve. Não reaplicar SQL.

## Validação

- 62 verificações Node: captura, permissão negada/tardia, cancelamento, liberação, parada automática, repetição de ID, formatos/limites, pedido ao provedor, estados/contagens e análise vencida.
- 29 verificações no esquema completo isolado: RLS, proprietário/outro admin/delegação/sessão revogada, proibição de escrita humana, concorrência/idempotência, cota atômica, expiração e nenhuma tarefa/memória criada.
- 15 verificações HTTP/PostgREST/Auth/RLS isoladas. O teste inicial sem filtro encontrou a proteção de UPDATE/DELETE sem WHERE; foi corrigido para verificar as permissões usando ID específico.
- 30 verificações do gerente e regressões backend/voz/memória passaram; build completo no candidato da fonte de produção e build do escritório passaram.
- Navegador com dados fictícios, stream sintético e MediaRecorder real: computador/celular, parar preenche campo, texto anterior preservado, cancelar, rascunho não envia sozinho e confirmação explícita guarda no cliente; proposta segue sem tarefa criada. Comando de conversa também recebe ditado.
- Provedor real reconheceu fala sintética, sem dados de clientes. Endpoint publicado compila e recusa anônimo (401) e delegação de servidor (403 `DICTATION_HUMAN`). Nenhuma gravação real do usuário feita pelo agente.
- Produção autenticada: sete agentes, 24 clientes, botões e roxo conferidos; leitura/status 200, serviço saudável, 24 perguntas/zero propostas no instante conferido. Sem tarefa, resposta de cliente ou envio externo realizado pelo agente.
- Banco de teste, contêiner REST temporário, esquema privado e áudio sintético remoto removidos. Prévia fictícia encerrada após conferência.

## Publicação e recuperação

Release `/root/planeje-releases/atlas-audio-status-20261015-01`; fonte completa em `/root/planeje`, frontend `/var/www/planeje`. Candidato originado da fonte vigente de produção, sem incorporar Assessoria local não publicada. Assets `index.7e61c47a.js` / `index.d0485537.css`; escritório `index-9e584b53.js` / `index-e65c060e.css`. Conservados assets `006aca37`/`6b5b8461` e backup completo do diretório anterior do escritório. Somente arquivos desta entrega promovidos com guardas de hash; nenhum reinício de serviço. Função nova carregada sob o main com autenticação vigente, sem enfraquecer guardas. Migrações anteriores não reaplicadas.

URL: `https://planeje.jbapex.com.br/?v=7e61c47a#/assistant/atlas`.

Para recuperar a apresentação anterior, usar `before/index.html`, `before/served-atlas-office` e fontes de `before` dessa release; não apagar dados nem reaplicar migrações. Arquivos da entrega preservados para diagnóstico. Capturas de produção somente em `.local/atlas-audio-status` (não versionar dados de clientes).

**Pendente:** aceite de Josias e teste com seu microfone/permissão no dispositivo que utiliza. A validação técnica não representa esse aceite. A Assessoria e suas migrações de teste continuam fora de produção.

Documentação primária consultada: [transcrição OpenAI](https://developers.openai.com/api/docs/guides/speech-to-text), [API de transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) e [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
