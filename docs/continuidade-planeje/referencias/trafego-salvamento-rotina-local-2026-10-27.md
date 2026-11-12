**Atualização 27/10/2026,16h08:** correção publicada e migração aplicada uma vez, após autorização específica. Este documento registra a etapa local; [estado produtivo e limites](trafego-salvamento-rotina-producao-2026-10-27.md).

# Salvamento da Rotina semanal — 27/10/2026

Estado: correção validada localmente; produção, aplicação da migração e aceite humano pendentes.
Josias relatou Salvar preso em “Salvando” e conclusões permanecendo em atrasados,
confirmando que o ponto de entrada é a Rotina semanal.

## Causas reproduzidas e correção

- O botão ativava `busy` antes da fila, mas validação e rascunho já salvo saíam
  antes do `finally`. A fila agora libera o botão em todos os caminhos, com
  confirmação de “Salvo” quando não há mudanças.
- O watchdog apenas mudava a aparência; a promessa pendente prendia as próximas
  gravações. Agora a operação tem limite de 20 segundos, cancelamento e rejeição
  da espera. Timeout é falha de confirmação, nunca prova de que o servidor não
  gravou. A revisão do banco continua protegendo a tentativa seguinte.
- A primeira gravação trocava a chave React da ficha e remontava os campos com
  dados antigos. A identidade agora usa cliente, semana e tipo, preservando texto
  e revisão durante a atribuição do ID.
- Conflito de versão relia a revisão e sobrescrevia o conteúdo de outra pessoa.
  O conflito agora mantém o texto local e mostra o erro, sem escrita automática
  sobre a versão concorrente. Abrir registro existente pelo fluxo de criação
  também não autoriza sobrescrever um registro já editado.
- A conclusão não invalidava o cache do Hoje, que permanece montado entre abas.
  Salvar invalida apenas as demandas do usuário e avisa o hook, sem refazer a
  consulta de anúncios. Atualização recebida durante outra leitura fica pendente
  para uma leitura posterior; fechar a ficha atualiza a lista da Rotina.
- A RPC existente ignora Concluir quando a ficha já está concluída. Se houver
  texto novo, a interface primeiro grava o rascunho e depois conclui. Se a segunda
  etapa falhar, o rascunho confirmado e a reabertura continuam visíveis.
- Descartar explicitamente não dispara salvamento na desmontagem. Campos do
  próximo passo também ficam bloqueados durante a gravação manual.
- O SQL reabria a ficha sem reabrir sua tarefa oficial. A nova migração
  `20261027184719_traffic_weekly_reopen_task.sql` reabre a tarefa no status inicial
  não terminal, com histórico, dentro da mesma transação. Falta desse status
  cancela toda a alteração. Não há atualização coletiva de registros antigos.

## Escopo e preservação

Interface: `TrafficWeeklyRoutine.jsx`, `trafficWeeklyReview.js`,
`useCentralTrafegoHoje.js` e `trafegoHojeCache.js`. Consumidores conferidos:
entrada da Rotina, atalho da tarefa e quadro Hoje. O contrato da RPC, controle de
revisão, autorização, escopo por cliente, validação de métricas e ordem de locks
(tarefa antes da ficha) permanecem. A migração é aditiva e não reaplica releases.

O checkout tinha muitas alterações anteriores, incluindo o retorno à assessoria
na Rotina; foram preservadas. Nenhum pacote, flag, autenticação ou provedor mudou.

## Verificação reproduzível

1. `node --test scripts/trafficWeeklyReview.test.mjs scripts/trafficWeekSheet.test.mjs scripts/trafficSheetGrid.test.mjs scripts/trafficSheetLayout.test.mjs scripts/trafficSheetCatalog.test.mjs scripts/trafficSheetMetaSpend.test.mjs`: 50 testes.
2. `node scripts/trafegoHojeCache.test.mjs` e `node scripts/test-trafego-rotina.mjs`:
   cache separado por usuário, preservação dos anúncios e rotina fixa.
3. `python3 scripts/traffic-save-preview/verify-db.py`: cria PostgreSQL por socket
   Unix, sem TCP e sem aceitar DSN; aplica a função real e o guard real somente
   na fixture. Confere rascunho, negativa de permissão, revisão concorrente,
   conclusão, repetição, reabertura, histórico e rollback para ambos os tipos.
   O teste falhou antes na tarefa ainda concluída após reabrir a ficha.
4. Iniciar `node node_modules/vite/bin/vite.js --config scripts/traffic-save-preview/vite.config.mjs`;
   depois `node scripts/traffic-save-preview/verify.mjs`, com
   `TRAFFIC_PLAYWRIGHT_MODULE` e `TRAFFIC_CHROME_PATH` apontando para instalações
   locais quando necessário. Porta 4368; cliente Supabase e autenticação
   substituídos por fixture, rede externa bloqueada, nenhum segredo carregado.
   Oito cenários iniciais falharam antes da correção; regressões incluem
   descarte, falha parcial, conclusão com leitura em andamento e teclado/celular.
5. `npm run check`: passou no Node 20.20.2, incluindo lint, tipos, testes locais e build temporário. Avisos existentes de lint/build permanecem; não publica nem migra produção.

Resultado: 15 cenários de navegador, 50 testes de regras/planilha, cache/rotina fixa e PostgreSQL descartável passaram. [Evidência e hashes](../evidencias/trafego-salvamento-rotina-local-2026-10-27.json).

Evidência transitória: `.local/traffic-save-baseline/` contém os arquivos de
entrada preservados e logs de reprodução/verificação. O lint dirigido mantém
avisos anteriores de tamanho e dependência de `loadAudit`, sem erros.

## Limites e publicação

Os testes de interface exercitam componentes reais com API fictícia. O PostgreSQL
exercita a função/guard reais com fronteiras fictícias de ACL e catálogo de
campanhas; não certifica RLS, sessão, extensões ou integrações produtivas completas.
A revisão diferencial local não é auditoria integral do produto.

Não houve consulta ou gravação em clientes reais, envio de mensagens, uso de IA,
push ou publicação. Conexão interrompida após commit pode exigir reabrir a ficha
para conciliar a revisão; não se resolve esse caso sobrescrevendo a versão atual.
Fechamento forçado do navegador continua dependendo da entrega do keepalive.

Publicação exige autorização específica, conferência da operação/release vigente,
fontes concorrentes e perfil produtivo. Aplicar somente a migração nova, uma vez,
e publicar o frontend correspondente. Divergências históricas não são corrigidas
em lote; a nova transação repara a tarefa quando a ficha é efetivamente editada.
