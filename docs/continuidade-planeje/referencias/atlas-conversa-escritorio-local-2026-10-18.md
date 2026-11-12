**Estado subsequente:** o conjunto foi autorizado e [publicado às 12h49](atlas-conversa-escritorio-producao-2026-10-18.md). O texto abaixo preserva a etapa local anterior; não usar sua pendência de autorização como estado atual.

# Atlas: conversa interativa dentro do escritório

Estado em 18/10/2026: **implementado e validado localmente; não publicado**.
A versão produtiva continua sendo a [correção de transporte das 10h03](atlas-gerente-transporte-producao-2026-10-18.md).
[Evidência estruturada](../evidencias/releases/atlas-conversa-escritorio-local-2026-10-18.json).

## Pedido de Josias e comportamento

Conversar com o Atlas dentro do escritório, identificar o cliente e receber
opções que conduzam a uma ação real. O botão Conversa no cabeçalho e o robô
flutuante do dono abrem o mesmo controlador privado sobre o mapa. Não há
novo motor de tarefas nem histórico paralelo. O mapa permanece montado.

O catálogo autorizado de clientes é pesquisado no navegador antes da IA.
Nome reconhecido pede confirmação; nomes compartilhados mostram opções.
Escolher outro abre busca, e Visão geral mantém consulta ampla por escolha
explícita. Nome desconhecido indicado como cliente pede seleção. O pedido
original fica guardado durante a escolha; confirmação escrita também funciona.
Não há correspondência garantida para apelidos ou erros de digitação: a busca
permite localizar outro nome cadastrado. Nenhuma escolha fabrica um cliente.

Trocar o cliente inicia outra conversa; continuar com o cliente confirmado
mantém o contexto. Fechar o painel conserva texto/histórico/posição do mapa
e cancela ditado/voz. Conversas recentes preservam um pedido ainda não enviado.
Reenviar após erro de rede conserva request_id, mensagem e cliente já escolhidos,
inclusive se o dono escolheu outro cliente diferente do citado no texto.

Missões mostram estado real e acesso ao andamento. Perguntas internas oferecem
o thread exato do robô; acompanhamento da equipe abre a lista existente. A caixa
de equipe e o painel privado não ficam sobrepostos. Colaboradores continuam
usando apenas as conversas autorizadas da equipe. Retomar pedido preenche o
texto original associado ao origin_run_id; não executa automaticamente. Registros
antigos sem essa origem não recebem uma retomada inventada.

## Falha da consulta da Impacto

O diagnóstico somente leitura encontrou a missão real das 11h47 interrompida
após consultas iniciais. O cliente estava no catálogo e os vínculos/política da
consulta estavam presentes. O worker preservou somente WORKER_FAILURE, então
não existe stack histórica suficiente para atribuir cada erro retrospectivo.

Foi confirmado um defeito alcançável: atlas_manager_consult é SECURITY INVOKER
e lia auth.sessions diretamente. O service_role produtivo não tem SELECT nessa
tabela. A leitura direta foi recusada com SQLSTATE 42501 em transação somente
leitura; a mesma chamada foi reproduzida no PostgreSQL descartável. A fixture
anterior concedia acesso artificial às tabelas de autenticação e escondia isso.

A nova migração 20261018150153_atlas_manager_source_session_acl.sql substitui
apenas essa consulta por um helper privado booleano SECURITY DEFINER,
search_path vazio e EXECUTE exclusivo para service_role. A função pública
continua INVOKER. Sessão do dono, lease, política, cliente, destinatário e
idempotência continuam conferidos. Nenhum SELECT amplo em auth.sessions foi
concedido. Migração aplicada somente no cluster fictício, nunca na produção.

## Verificação e limites

- 55 verificações PostgreSQL/RLS em cluster novo por socket Unix, sem DSN externo.
- 47 testes Node dirigidos de cliente, apresentação, voz, expediente e robô.
- 16 verificações de fluxo interativo, 7 regressões do gerente e 5 com AtlasOffice
  e iframe reais compilados. Rede externa bloqueada em todos os navegadores.
- Computador 1440×1000 e celular 390×844; mapa ampliado, foco/Enter/Escape,
  cliente ambíguo/desconhecido, preservação de rascunho, retorno da equipe,
  autorização privada, retomada e repetição sem duplicar pedido.
- Trilha de microfone fictícia verifica parada ao fechar. Não certifica microfone
  físico nem transcrição ou resposta de um provedor real.
- Build do mapa isolado em .local; npm run check e build temporário do produto.
  Dist/ZIPs operacionais da raiz não foram promovidos.

Revisão independente com differential-review identificou e levou à correção de:
confirmação ausente da ponte iframe, perda do pedido ao abrir histórico,
reconfirmação indevida no retry para outro cliente, foco da busca e contador
global em missão local. Relatório privado fora do repositório. Nenhuma IA real,
pergunta à equipe, tarefa ou escrita produtiva foi usada como teste.

## Conferir a prévia e publicar depois

A prévia usa dados fictícios. O modo com mapa completo exige primeiro o build
isolado; não iniciar o dev principal, pois ele pode apontar à produção.

```sh
npx vite build --config scripts/atlas-office-live/vite.config.mjs --outDir "$PWD/.local/atlas-office-conversation/public/atlas-office"
ATLAS_PREVIEW_OFFICE=1 npx vite --config scripts/atlas-manager-integration/preview/vite.config.mjs --port 4342
```

Abrir http://127.0.0.1:4342/?office=1 e usar Conversa. O modo com escritório
simplificado fica em 4341 sem ATLAS_PREVIEW_OFFICE. Os scripts de verificação
estão em scripts/atlas-manager-integration/verify-office-chat.mjs,
verify-map-chat.mjs e verify-ui.mjs, com Playwright e Chrome locais configurados.

Publicação deste conjunto requer autorização específica do trabalho atual.
Herdar fontes/guarda da candidata atlas-manager-provider-20261018-01 e perfil
frontend .env.production.local da candidata atlas-manager-operational-20261018-01.
Conferir concorrência e composição produtiva; não promover o trabalho local
alheio de assessoria. Só a migração incremental nova deve ser aplicada uma vez;
não reaplicar 20261018014504 nem migrações anteriores. Conservar modelo,
autenticação, limites, autonomia e horários atuais. O manifesto local identifica
os arquivos de produto alterados. Publicação, primeiro retorno humano real e
aceite operacional continuam sendo etapas distintas e pendentes.
