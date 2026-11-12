# Atlas gerente operacional — VPS, 18/10/2026

Josias autorizou publicar para validar. Publicação concluída às **02h27 de
São Paulo**, na VPS `72.60.14.109` (`srv1102699`). O aceite do fluxo com a equipe
real permanece pendente.

[Implementação local](atlas-gerente-operacional-local-2026-10-18.md) ·
[Evidência da release](../evidencias/releases/atlas-gerente-operacional-2026-10-18.json).

## Versão e escopo

- Release: `/root/planeje-releases/atlas-manager-operational-20261018-01/candidate`.
- Base anterior conferida: `atlas-scan-repair-20261017-02`, 1.700 fontes sem
  alterações concorrentes. Nova guarda: 1.713 fontes; 34 overlays.
- Main: `index.05899293.js` / `index.a8313023.css`. Escritório e seus assets
  anteriores preservados integralmente, inclusive os bytes do HTML.
- `planeje-atlas`, `planeje-atlas-team` e `planeje-atlas-events` usam a candidata.
  `supabase-edge-functions` reiniciou após atualização de três arquivos Atlas.
  `planeje-atlas-office` conserva sua base anterior.
- Perfil/flags produtivos, credenciais, modelos, vendor/cache, configuração
  da equipe, seleção dos clientes, expediente e teto de tokens preservados.

O leitor local também continha trabalho de assessoria ainda não publicado.
Essa parte não entrou: quatro imports de assessoria foram excluídos apenas da
candidata e `results/plans` preservam exatamente os ramos produtivos anteriores.
Vínculo explícito dos grupos, fonte de publicação e emissor operacional isolado
foram mantidos. A composição recebeu revisão independente; o workspace raiz
continua com seu trabalho local intacto. A candidata, e não HEAD ou o arquivo
local completo, é a fonte da versão publicada.

## Migração e recuperação

Aplicada **uma única vez**:
`20261018014504_atlas_manager_operational_loop.sql`, SHA-256
`d251bf5dbd4af7a110fabd4077ac3eda95cae82e7d14e19b8053cda3bb8d9fd5`.
Não reaplicar. Nenhuma migração histórica foi executada novamente.
RPCs, coluna da sessão/continuação e status `waiting_team` confirmados no banco;
funções de máquina continuam inacessíveis ao usuário autenticado comum.

Publicador guarda fontes, unidades, runtime e HTML; aplica assets imutáveis
antes de trocar o HTML, conserva históricos e mantém o esquema aditivo numa
recuperação. Revisão corrigiu proteção de stop parcial, preservação de versão
concorrente e tentativa de restart mesmo após falha de restauração. Três
simulações isoladas passaram. O primeiro preflight recusou um marcador de
frontend incorreto antes de parar serviços ou aplicar SQL; o marcador foi
corrigido e os testes de recuperação repetidos. Não houve rollback produtivo.

## Evidência e estado real

- Build executado na VPS com dependências/perfil produtivos existentes.
  29 testes Node passaram na candidata remota; imports do runtime resolveram.
- 82 testes de contexto/continuação e 43 de decisão/horário passaram na
  candidata; 48 checks SQL em PostgreSQL local descartável passaram.
  As sete verificações de interface isolada da entrega local permanecem válidas.
- Seis HTTP públicos com status e SHA-256 conferidos; quatro serviços ativos.
  Sem indicadores novos de falha nos três workers após a publicação.
- Hash/conteúdo e quantidade de tarefas, threads, mensagens internas e saídas
  de WhatsApp permaneceram iguais durante a publicação. Política e configuração
  operacional preservadas. Nenhuma tarefa ou mensagem de teste foi criada,
  e nenhuma chamada de IA foi disparada para validar.
- Sessão real de Josias abriu a conversa pessoal e os novos controles de
  memória. Nenhuma permissão de memória foi alterada; compartilhamento de
  memória de cliente continua exigindo autorização explícita.
- A nova aba do Chrome mostrou iframe vazio na abertura do escritório, enquanto
  os arquivos exatos do escritório responderam 200 e conservaram os hashes.
  Não atribuir causa sem evidência. A conferência nativa encontrou o Mac bloqueado;
  desbloqueio solicitado para concluir a inspeção visual. Conversa pessoal
  carregou normalmente. Esta pendência não foi escondida como validação visual
  completa nem motivou alteração especulativa no código do mapa.

### Retomada após desbloqueio, 18/10/2026 pela manhã

Josias informou o desbloqueio. A sessão da aba de validação exibiu expiração;
**Verificar novamente** recuperou a conversa sem novo login ou alteração de
credenciais. O escritório permaneceu vazio dentro do iframe. A abertura direta
do mesmo HTML executou a interface e exibiu a orientação esperada para abrir
pelo Atlas autenticado. HTML principal e do escritório responderam 200 sem
cabeçalhos de bloqueio de frames. Isso não estabelece a causa do iframe vazio.
A inspeção nativa depois deixou de responder, e a conexão com a aba se perdeu.
Josias confirmou depois que o mapa aparece normalmente. A pendência visual
foi encerrada por confirmação do usuário; isso não certifica o ciclo operacional
com a equipe nem estabelece a causa da observação na aba de inspeção.

Nova leitura da VPS confirmou seis HTTP/hashes, quatro serviços ativos, contrato
SQL e guarda de fontes. Porém surgiu **uma missão real interrompida** após a
publicação, às 09h27 de São Paulo: tentativa 1, três chamadas registradas, leituras
de overview/memories concluídas, `mission_stopped / WORKER_FAILURE`. O erro
persistido é genérico e não identifica a causa. A ausência dos seis indicadores
genéricos pesquisados pelo verificador não significa ausência de falhas de
missão. Esse ciclo não foi iniciado pela validação do agente, não foi repetido
nem teve mensagem/tarefa de teste enviada. Não declarar o fluxo operacional
validado. Sem nova publicação, migração, restart ou mudança de modelo/política.

## Primeiro uso

No Atlas, abrir **Conversa** e consultar um cliente real. Quando os registros
não bastarem, o chamado interno deve aparecer ligado à consulta e seu retorno
deve voltar para a mesma conversa. Uma ordem explícita deve passar pela conta,
usar/criar a tarefa oficial e acompanhar o executor. Não considerar essa etapa
validada antes de uma resposta humana e conferência da entrega.

Domingo é fora do expediente. Contatos automáticos aguardam o próximo período
útil, respeitando o horário individual; o dono pode consultar fora desse horário.
Cadastros ausentes apontados na auditoria continuam pendentes de confirmação.
Verificação atual de publicação externa/qualidade também não foi certificada.

Às 10h03, uma [correção do transporte de pergunta interna](atlas-gerente-transporte-producao-2026-10-18.md)
foi publicada. Para a próxima release, herdar essa candidata/guarda de 1.714
fontes. Para build frontend, o perfil produtivo `.env.production.local` continua
nesta candidata operacional original; não promover `dist` antigo da raiz.
Backups ficam em `before/`, e os marcadores impedem repetição cega.
