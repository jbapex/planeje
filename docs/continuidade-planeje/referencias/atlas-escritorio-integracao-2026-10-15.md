# Atlas escritório — integração operacional publicada

Status: **PUBLICADO em 15/10/2026, 09h15, São Paulo**, em `https://planeje.jbapex.com.br/?v=006aca37#/assistant/atlas`. Aceite de uso de Josias ainda pendente.

## Publicação e conferência final

- Nova base produtiva incorporada: links de conexão do WhatsApp `95e6d883`/`c1a42de6`, publicados por outra entrega durante os testes. O primeiro guard detectou a mudança e interrompeu antes de qualquer migração/alteração. Fonte reconciliada reproduziu exatamente essa versão, e o candidato com Atlas foi reconstruído sobre ela.
- Assets vigentes: `index.006aca37.js` / `index.6b5b8461.css`. Anteriores preservados. Frontend promovido com troca atômica do index, sem restart do app/serviços existentes.
- SQL `20261015044353` aplicado **uma vez** à produção; não reaplicar. Configuração do novo escritório ativa. Novo `planeje-atlas-office.service` habilitado e ativo, com ambiente privado existente. `planeje-atlas.service` anterior preservado; `monitor_enabled=false` continua valendo para o monitor legado.
- 30 verificações Node do escritório, 50 regressões Atlas, **47 SQL** e **27 API/Auth/RLS** isoladas passaram. A API pode recusar sessão revogada já no pre-request guard (403), além de RLS; a expectativa do teste foi corrigida sem enfraquecer o acesso. Smoke de IA com cliente inteiramente fictício passou: `gpt-4o-mini-2024-07-18`, 586 tokens, devolveu pergunta válida sem proposta quando faltou informação.
- Às 09h31, SQL adicional `20261015122902` aplicado uma vez: o ID da tarefa aprovada fica como referência histórica, permitindo a exclusão normal em Tarefas sem apagar a auditoria ou recriar a tarefa num replay. Verificações SQL/API adicionais confirmaram esse fluxo no banco isolado; nenhuma tarefa real foi excluída.
- Endpoint real: snapshot/status autenticados retornam 200; sem autenticação, 401. Inventário completo de sete pessoas e 24 clientes; tarefas passaram de 1454/65 abertas para 1455/66 abertas durante a operação normal. Nenhum vínculo de tarefa criada pelo Atlas existe; implantação não inseriu tarefas operacionais.
- Primeira conferência: 24 perguntas privadas, nenhuma proposta, quatro análises e 17.537 tokens registrados. Os clientes aguardam a orientação de Josias. Limites são do novo gerente, não da conversa/voz.
- Após reinício, estado/perguntas e orçamento persistiram. A nova conferência fez **zero chamadas ao modelo** e não duplicou perguntas. Sem erro registrado; heartbeat/última conferência confirmados.
- Navegador autenticado de Josias: escritório REAL, sete pessoas/cinco salas agrupadas por registros, 24 clientes, histórico completo com paginação, acesso à conversa e retorno ao escritório. Tela estreita conferida sem rolagem lateral do iframe (415/415 px CSS efetivos); viewport de teste restaurado. Console sem erros. Não foi respondida pergunta nem aprovada tarefa real pelo agente.
- Sete verificações HTTP públicas de HTML/assets/marca passaram. Capturas autenticadas ficam apenas em `.local/atlas-office-live/`, fora da documentação/versionamento; capturas fictícias anteriores permanecem como evidência pública da implementação.
- Banco descartável `atlas_office_test_20261015`, contêiner temporário de API e dump de esquema privado temporário removidos. Candidata/backup seletivo preservados para operação/reversão. Nenhum envio WhatsApp/CAPI/e-mail.

Para usar: abrir **Clientes**, escolher um cliente e responder sua orientação. O texto é guardado naquele cliente antes de planejar. Qualquer tarefa proposta precisa ser revisada e confirmada por Josias.

## Regras confirmadas

- Segunda a sexta, 08h–17h, `America/Sao_Paulo`, confirmado expressamente por Josias.
- Atlas acompanha os registros disponíveis e pergunta a Josias quando faltar objetivo, escopo ou direção necessária. A resposta fica vinculada ao cliente correto.
- Tarefa nova exige revisão e aprovação de Josias. O modelo não recebe ferramenta de escrita em tarefas.
- Clientes possuem diretório, contexto, memória, perguntas e propostas no escritório.
- Nenhum envio externo à equipe ou aos clientes está autorizado. As perguntas/propostas aparecem dentro do app e na Minha caixa privada.

## Implementação

`AtlasPage.jsx` abre o escritório por padrão, preservando conversa e voz. `AtlasOffice.jsx` usa a sessão existente e entrega somente o snapshot autorizado ao iframe estático. As mensagens entre pai/filho verificam origem e janela; o renderer escapa texto real. O iframe não recebe tokens ou chaves. Fontes completas são consultadas por paginação, com erro explícito se uma fonte falhar.

`atlas-office` mantém o gate do proprietário ativo e confere a sessão atual. As fontes operacionais usam o cliente Supabase autenticado com RLS. A credencial administrativa fica no servidor e escreve somente o estado privado do escritório depois do gate. As RPCs humanas exigem sessão pessoal vigente e recusam delegação de servidor; a última revisão também restringe UPDATE direto delegado nas políticas.

O modelo apenas devolve análise, pergunta e até duas propostas. A confirmação humana usa a mesma tabela `tarefas`, o status inicial configurado e o executor de automações existente. Bloqueio de linha/idempotência evita duplicação da mesma aprovação; dados mudados invalidam a proposta. Recusa não cria tarefa. Não há motor paralelo de execução ou conclusão.

`atlas-office-worker.mjs` é um processo separado do monitor legado. Conferência inicial a cada 10 minutos no expediente. Pedidos manuais explícitos podem ser atendidos fora dele. Sem direção: pergunta determinística, sem chamada ao modelo. Hash de conteúdo evita análise repetida; atualizar apenas a data de sincronização do tráfego não conta como mudança. O contexto é limitado e declara sua cobertura. Modelo configurado no servidor reaproveitado, com fallback `gpt-4o-mini`; não houve migração de modelo nem promessa de menor preço absoluto.

Limites iniciais, ajustáveis: 12 análises/dia, 60 mil tokens/dia, saída de até 900 tokens por análise, intervalo de duas horas por cliente salvo pedido manual. Reserva persistida limita tentativas/falhas e cobra conservadoramente quando o provedor não informa uso. Esses limites pertencem ao gerente novo; conversa/voz existentes têm seu próprio consumo. Não equivalem a uma garantia de analisar toda mudança imediatamente.

As salas agrupam funções e tarefas realmente cadastradas. Personagens representam agentes de acompanhamento, não presença nem produtividade humana. O inventário de tarefas inclui o histórico; o modelo recebe recortes pertinentes do cliente, não todas as mensagens/documentos/áudios. Tráfego é snapshot datado salvo no Planeje, sem alegar consulta direta às plataformas.

## Fontes e licença

- `supabase/functions/_shared/atlasOffice.js` e `atlasOfficeManager.js`.
- `supabase/functions/atlas-office/index.ts`.
- `supabase/migrations/20261015044353_atlas_office_manager.sql`.
- `scripts/atlas-office-worker.mjs`, `atlasOffice.test.mjs`, `atlasOfficeDatabase.test.mjs`, `atlasOfficeModelSmoke.mjs`.
- `src/components/atlas/AtlasOffice.jsx`, CSS e `src/lib/atlasOfficePresentation.js`.
- `scripts/atlas-office-live`, build em `public/atlas-office`.

Renderer/art/assets de [Habblaud](https://github.com/marmottajr/habblaud), MIT, commit `4ccce2537472fe5a8d432f06974494d2e778ff15`, versão 0.11.0. Nenhum servidor/hooks de programação adotado. Dos 86 TS copiados, 85 permanecem intactos; `world/assets.ts` recebeu suporte ao BASE_URL para servir em `/atlas-office/`. Marca da recepção e cópias dos assets oficiais do Planeje registradas em `scripts/atlas-office-preview/UPSTREAM.json`.

## Histórico da preparação e seus limites (superado pela conferência final acima)

- 30 verificações Node do escritório; 50 regressões do Atlas: backend19, gerente11, voz17, carteira3. Syntax check TypeScript da nova Edge passou.
- Build estático: 74 módulos, `index-dc2817b2.js` / `index-99906142.css`.
- Build local completo: 4041 módulos. **Não promover esse build:** contém mudanças locais de outras entregas. A publicação deve usar fonte produtiva e patch seletivo.
- A cópia remota antes do patch reproduziu exatamente os assets produtivos `47519cec` / `2731d631`.
- Banco descartável `atlas_office_test_20261015`, com esquema produtivo e fixtures sem dados reais: 43 verificações passaram na revisão anterior, incluindo outra conta, sessão revogada, aprovação simultânea, memória por cliente, reserva/token cap e monitor legado preservado. Os dois novos casos de UPDATE delegado e a revisão de duplicidade de tarefa ativa ainda precisam ser executados: expectativa de 45 verificações, **não declarar aprovados antecipadamente**.
- Navegador com componentes reais e backend fictício: resposta no cliente, memória preservada, proposta sem tarefa anterior à confirmação, revisão de campos, confirmação criando uma tarefa fictícia, texto escapado, foco/seleção do formulário mantidos durante refresh, conversa/voz acessíveis, notebook1440×950 e celular390×844. Viewport de teste restaurado.
- API/RLS pelo endpoint final, chamada real ao modelo com entrada fictícia, build da candidata com patch e leitura produtiva final permanecem pendentes.

Evidência: [JSON](../evidencias/atlas-escritorio-integracao-2026-10-15.json), [notebook](../evidencias/atlas-escritorio-integracao-notebook-2026-10-15.jpg), [aprovação](../evidencias/atlas-escritorio-integracao-aprovacao-2026-10-15.jpg), [celular](../evidencias/atlas-escritorio-integracao-celular-2026-10-15.jpg), [release preparada](../evidencias/releases/atlas-escritorio-integracao-2026-10-15.json).

## Histórico de retomada e plano de publicação (concluído)

Produção continua em `index.47519cec.js` / `index.2731d631.css`, fontes/serviços/index sem alteração desta entrega. Não houve tarefa real criada, resposta real salva, WhatsApp/CAPI/e-mail enviado ou ativação do monitor legado. A migração nova foi aplicada somente ao banco descartável, não ao banco operacional nem à homologação persistente.

Preparação remota: `/root/planeje-releases/atlas-office-20261015-01/candidate`, cópia completa preservando alterações produtivas; `before/` e `baseline.json` guardam os três arquivos existentes afetados e o index anterior. Banco isolado e esquema privado permanecem para concluir os testes. Guardar esses arquivos como privados; não copiar dump, credenciais ou `.env` para a documentação.

SSH: a VPS aceita a chave cadastrada, mas o macOS retorna `User interaction is not allowed` ao consultar o chaveiro. Josias foi orientado a executar no próprio Terminal `ssh-add --apple-use-keychain ~/.ssh/id_ed25519_planeje`, digitando a senha somente ali. Nenhuma senha deve ser enviada à conversa.

Após liberar: conferir novamente baseline/index e reconciliar outras publicações; enviar pacote seletivo, atualizar as funções/políticas apenas no banco descartável com guarda de nome, rodar 45 verificações e API; executar smoke com entrada fictícia e ambiente privado existente; build completo na candidata. Só então aplicar migração uma vez, publicar endpoint/arquivos/novo serviço próprio e ativar a configuração do escritório. O monitor legado permanece `monitor_enabled=false`.

A reversão deve pausar o serviço/configuração novos e restaurar somente frontend/fontes afetadas. Preservar memória, propostas e tarefas humanas já criadas; não restaurar banco operacional. Conferir HTTP, acesso proprietário, sessão revogada, inventário e heartbeat após publicar. Aceite de uso de Josias continua pendente.
