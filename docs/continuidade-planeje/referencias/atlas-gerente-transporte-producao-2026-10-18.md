# Atlas — pergunta interna e validação da VPS, 18/10/2026

Correção publicada às **10h03 de São Paulo**, no escopo da publicação para
validação autorizada por Josias. [Evidência](../evidencias/releases/atlas-gerente-transporte-2026-10-18.json).

Josias confirmou que o mapa aparece normalmente. A observação de iframe vazio
na aba de inspeção não comprova defeito no mapa; sua causa não foi estabelecida.
Conversa e memória já haviam carregado com a sessão do dono. O ciclo real de
consulta → equipe → retorno ao dono ainda não foi certificado.

## Correção e limite da evidência

O emissor isolado de pergunta faz uma chamada sem ferramentas. O worker enviava
`tools: []` junto de `tool_choice: auto`; agora omite ambos nessa chamada e
preserva as ferramentas/seleção automática nas consultas que as utilizam.
Endpoint, modelo configurado, autenticação, sinal de cancelamento e consumo
registrado permanecem iguais. Rejeição HTTP ganha código `PROVIDER_HTTP_<status>`
e mensagem segura; o corpo privado do provedor não é lido nem copiado.
A [referência oficial](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
documenta esses parâmetros como opcionais e o padrão sem ferramentas como `none`.

A missão das 09h27 continuou preservada e não foi repetida. Seu log antigo só
registrou `WORKER_FAILURE`; a correção de contrato não prova retrospectivamente
que esse foi o motivo da interrupção. Erros de rede ou JSON ainda podem aparecer
com o tratamento genérico existente. Nenhuma análise paga ou pergunta à equipe
foi disparada artificialmente para validar esta correção.

## Publicação e verificações

- Nova base: `/root/planeje-releases/atlas-manager-provider-20261018-01/candidate`,
  guarda de **1.714 fontes**. Dois overlays: worker e teste de transporte.
- Somente `planeje-atlas` mudou de candidata e reiniciou. As três outras unidades,
  runtime Edge, frontend/main/escritório e banco foram preservados. Sem migração
  ou build produtivo; não reaplicar `20261018014504`.
- Configuração de execução continua no mesmo EnvironmentFile do serviço.
  A candidata corretiva não contém perfil de build frontend: numa futura release
  com build, herdar `.env.production.local` da candidata
  `atlas-manager-operational-20261018-01`, além das fontes/guardas corretivas.
- Três falhas de regressão vistas antes da correção; quatro testes de transporte
  e 29 regressões passaram localmente e em Node 20 da candidata remota.
  O teste executa a função real em VM com `fetch` fictício, sem iniciar o loop/DB.
- `npm run check` local passou. Revisão independente do código e do publicador
  concluída; cinco fixtures de publicação/recuperação passaram. A revisão corrigiu
  rollback indevido quando a saída falhava depois do marcador de sucesso.
- Seis HTTP/hashes, quatro serviços ativos, unidade/ambiente herdados e todas as
  fontes/candidata conferidos. Zero indicadores de erro pesquisados no worker
  desde esta publicação; isso não certifica uma chamada real à IA.
- Fotografia operacional permaneceu igual durante a publicação: jobs, tarefas,
  conversas/mensagens, saídas, política e teto. Sem tarefa/mensagem/chamada de IA
  de teste, alteração de permissões, configuração ou aceite operacional inferido.

Backups, preparação, marcador e guarda ficam no diretório da nova release.
Não repetir o publicador. As regras de expediente/dias úteis continuam vigentes;
o próximo passo é acompanhar uma consulta real e o retorno humano na origem.
