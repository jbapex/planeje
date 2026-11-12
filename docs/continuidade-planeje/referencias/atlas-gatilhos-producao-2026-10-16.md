# Atlas por acontecimentos — publicação na VPS real

Josias autorizou: **“vamos para a vps real”**. O primeiro motor está publicado em **72.60.14.109**, em **observação**, nas telas existentes de Minha caixa e Demandas do cliente. A primeira leitura real da Impacto está disponível para revisão. Não declarar esta entrega como o plano inteiro de gerenciamento autônomo concluído.

## Estado efetivo

- 24 clientes selecionados; **17 grupos de trabalho com vínculo explícito**, representando 17 clientes. Sete cadastros ainda não têm grupo disponível com vínculo inequívoco.
- Outros 13 grupos do canal da agência aparecem somente como cobertura sem vínculo. Na primeira conferência foram encontrados 37 grupos dos canais das próprias lojas que o fallback do piloto associava pelo canal. Esse fallback foi retirado da produção **antes de qualquer chamada ao modelo**; não houve job nem envio desses grupos ao provedor. As mensagens originais não foram alteradas.
- Coleta por metadados a cada 15 s; mensagens novas agrupadas inicialmente em 90 s, espera máxima de cinco minutos; reconciliação/revisão horária. Automação seg–sex, 08h–17h, São Paulo. Conferência manual autorizada pode rodar fora do expediente. Relógio fictício é recusado na entrada produtiva.
- Texto, transcrições disponíveis, respostas citadas antigas, tarefas do mesmo cliente, comentários pertinentes, memórias e continuidade do robô. Janela inicial de 100 anteriores editável. Não lê bytes de reuniões/anexos nem faz expansão semântica completa por assunto/período.
- Perguntas automáticas à equipe **desligadas** (`observe`). O modo assistido está disponível nas regras, com confirmação do dono para a seleção. Destinatário vem do cadastro, sem fixar Poliana; o dono não deve ser chamado como executor por esse mecanismo. Contas ainda cadastradas em nome do dono precisam da definição do responsável interno.
- Criação, vínculo, transferência e prazo oficial continuam nos formulários/RPCs de aprovação já existentes. Escopo/verba não são decididos pelo modelo. Nenhum WhatsApp, e-mail, CAPI ou comentário operacional foi enviado por esta publicação.

## Integração produtiva e acesso

Entrada separada `scripts/atlas-events/production.py`, no host `srv1102699`, com delegação Atlas assinada por até 240 s e renovação durante a leitura. Revalida proprietário ativo, Atlas habilitado e RLS; não usa senha nem login fictício. Sessão humana continua obrigatória para regras e aprovações. A entrada `server.py` conserva seu guard de piloto privado e não foi usada como serviço produtivo.

`planeje-atlas-events.service` ativo, socket `/run/planeje-atlas-events/events.sock`, grupo www-data e 0660. Rotas exatas `/sb-fn/atlas-events` e `/functions/v1/atlas-events`, origem/autorização verificadas. Credenciais somente no servidor; chave de IA atual do Atlas, modelo preservado `gpt-4o-mini-2024-07-18`.

O escritório continua com heartbeat e acompanhamento determinístico das tarefas, mas seu leitor automático de IA é substituído quando a configuração de eventos existe. **Pausar a leitura nova não religa automaticamente o leitor antigo.** O guard SQL também impede reserva antiga enquanto eventos estão ligados. Missões/voz/conversa manuais, transcrição e relógios do robô existentes foram preservados; monitor legado permanece pausado. Isso não significa que todos os leitores manuais ou todos os ledgers do produto já foram unificados.

Consumo de análise de grupos e escritório é compartilhado: reaproveita os 35.105 tokens do escritório no dia e não soma um novo teto independente. Conversa, ditado, transcrição e missões têm seus próprios registros. Não há o bloqueio de 12 chamadas nesse motor. Fila, fonte e cobertura permanecem quando não há orçamento.

Índice de tarefas mantém todos os IDs/títulos/estados do recorte; detalhes de tarefas abertas ou citadas e seus comentários entram no modelo. O snapshot completo é preservado para conferência de fontes antes/depois da chamada. Contexto informa explicitamente o que foi omitido. Primeira análise manual sem lote novo focaliza a mensagem mais recente sem chamá-la de “nova”. Essa orientação ainda não comprova agrupamento semântico satisfatório de todos os assuntos.

## Caso real, consumo e limites observados

Impacto: **100 mensagens**, zero novas nesse pedido manual, período de 26/08 a 16/10; índice de 110 tarefas, detalhes de quatro abertas, três memórias. Os 80 comentários históricos foram preservados no snapshot e não incluídos nessa chamada porque pertenciam ao histórico das concluídas. Uma mensagem de áudio antiga não tinha transcrição disponível: a cobertura aparece parcial, sem inventar que foi ouvida.

O modelo levantou cinco questões sobre leads, cancelamentos, relatório e agenda. Há temas relacionados que **precisam de revisão e possível agrupamento**. Foram guardados cinco rascunhos privados, com fontes, título `[Impacto Noivas]` e ligação para a central. Não são cinco ordens de execução aprovadas. Nenhuma tarefa oficial mudou e nenhuma conversa interna foi aberta.

As duas primeiras chamadas foram recusadas pelo guard do piloto que rejeitava qualquer resultado com exatamente cinco assuntos. Esse guard foi corrigido: cinco itens válidos ficam marcados como recorte limitado e todos os assuntos acionáveis são encaminhados somente ao dono para revisão, nunca para cobrança automática. A terceira foi aceita nessa condição. IDs/fontes continuam validados; não se relaxaram os limites de propriedade ou aprovação.

| Validação real | Entrada | Saída | Total |
| --- | ---: | ---: | ---: |
| Primeira, recusada pelo limite de assuntos | 39.970 | 396 | 40.366 |
| Segunda, mesma recusa | 40.046 | 668 | 40.714 |
| Terceira, recorte limitado para revisão | 40.046 | 479 | 40.525 |
| Total desta publicação | 120.062 | 1.543 | **121.605** |

79.872 tokens de entrada foram informados pelo provedor como cache. Isso não os torna zero no contador de tokens. Não foi calculado faturamento em moeda. Para as validações houve margens temporárias totais de 80/120/160 mil, restauradas no `finally` para 60 mil/dia. Depois, Josias autorizou explicitamente **“1 milhão podemos ter uma tela para configurar e almentar”**. O valor efetivo agora é **1.000.000/dia**, salvo pela tela normal do dono e confirmado após recarregar. Consumo combinado preservado: **156.710** (121.605 novos + 35.105 anteriores), zero reservado e três chamadas. Nenhuma nova chamada de teste após essa autorização.

## Validação e publicação

- 56 verificações Python de contexto/índice/foco/roteamento; 68 de API/Auth/RLS/fila/orçamento; 15 do motor completo com provedor simulado; 30 do escritório e oito de expediente. Testes direcionados repetidos após as correções.
- 15 verificações no runtime real, incluindo proprietário por delegação, recusa anônima/origem externa, RLS nas cinco tabelas, ausência de escritores públicos privilegiados, quatro serviços ativos, hash de todas as tarefas e quantidade de mensagens enviadas preservados.
- Build completo no Mac, navegador com sessão normal de Josias, regras/retomada, 100 fontes/cobertura parcial, link ao rascunho e recarregamento do perfil. Tela estreita: largura CSS medida 433 px, documento 433 px e painel 376,46 px; viewport restaurado. Uso físico da equipe e aceite de Josias permanecem pendentes.
- Houve uma concorrência com a publicação de sessão/perfil: promoção recusada pelo guarda, refeita preservando os três arquivos de produto e um teste daquela entrega. No teste real, módulos ainda vazios redirecionavam a rota para Tarefas; `ModuleSettingsContext` agora espera a consulta do perfil atual antes de concluir a autorização. Não ampliou permissões.

Assets da primeira publicação **`index.7c508ca6.js` / `index.d86dd2fb.css`**, conserva `34706a74`, `31f3e8e3`, `55847b9c`, `8d239b4a` e anteriores. Webroot **`/var/www/planeje`**. Fonte base inicial e backend:

`/root/planeje-releases/atlas-events-production-20261016-01/candidate`

Guarda inicial de 1.643 fontes; atualização da sessão incorporada. Manifest e `source-keys-next.json` na release são a referência para a próxima promoção. Módulo de arraste, ausente na cópia intermediária da base, foi recuperado da release produtiva de arraste com hash idêntico ao arquivo vigente; não veio de fonte privada.

SQL abaixo aplicado **UMA VEZ CADA na produção** e na cópia descartável de validação; não reaplicar:

1. `20261017000743_atlas_event_production.sql` — instalação produtiva consolidada, RLS/fila/ledger/projeção e integração.
2. `20261017002459_atlas_event_explicit_groups.sql` — somente vínculos explícitos para grupos de conta.

Os quatro arquivos originais `20261016225723`, `20261016231835`, `20261016232925`, `20261016234141` continuam aplicados somente no CS privado. **Não aplicá-los novamente nem executar o consolidado sobre o CS existente. Não promover o bundle CS/Assessoria.**

Dependência do contador: tiktoken 0.14.0, sete wheels com versões/hashes na release, sem instalação/upgrade do Python do sistema. Código usa uma reserva com margem para schema/saída; uso real do provedor substitui a reserva. [Documentação oficial de contagem](https://developers.openai.com/api/docs/guides/token-counting).

## Operação e retomada

Para suspender, usar Pausar leitura ou desabilitar a configuração; pode parar somente `planeje-atlas-events.service`. Coleta/modelo novos param, histórico permanece. Rotinas determinísticas da equipe continuam independentes. Não remover tabelas nem tentar reaplicar SQL como rollback.

Rollback do frontend: índice anterior preservado em `before/`; restaurar também o estado de fontes somente com guarda contra mudanças posteriores. Para voltar ao modelo antigo, além de parar/desabilitar eventos é necessário restaurar o WorkingDirectory/binário anterior do serviço de escritório; o novo binário não religa o leitor legado sozinho. Não parar o worker de áudio/missões ou o robô da equipe.

Próximo trabalho: conferir/agrupar os pontos reais; definir responsável operacional onde só consta o dono; completar sete vínculos; evolução de atualização de conversas ativas, anexos/reuniões e expansão por assunto/período. Observação ativa não equivale a autorização geral de cobrar a equipe.

[Evidência sanitizada](../evidencias/releases/atlas-gatilhos-producao-2026-10-16.json) · [Computador](../evidencias/atlas-gatilhos-producao-desktop-2026-10-16.png) · [Tela estreita](../evidencias/atlas-gatilhos-producao-mobile-2026-10-16.png).

## Configurações próprias e orçamento aprovado — 16/10, 21h55

Tela própria `#/assistant/atlas/configuracoes`, reservada ao dono pela mesma RPC/RLS; atalho Configurar no escritório e Configurar Atlas na central. Permite editar orçamento, janela, agrupamento, revisão, clientes e modo. Perguntas à equipe conservam confirmação explícita; aumentar orçamento não libera tarefas ou mensagens. O salvamento foi conferido na sessão normal de Josias, com persistência após recarregar e consumo anterior preservado.

Intervalo configurável entre mil e dez milhões para permitir aumentos futuros; valor escolhido e salvo agora **um milhão**. SQL novo `20261017005227_atlas_event_budget_settings.sql` amplia somente a restrição de intervalo e foi aplicado UMA VEZ na produção, após oito verificações em transação revertida. Não altera propriedade, RLS ou ledger; não reaplicar.

O escritório consulta o consumo compartilhado e deixou de apresentar o antigo teto de 12 análises/60 mil. A tela própria carrega configuração e cadastro, sem textos dos grupos. Frontend **`index.dddf4065.js` / `index.48915503.css`**; escritório `index-b4d876e6.js` / `index-17b78889.css`. Assets anteriores preservados. Base atual para futuras publicações: `/root/planeje-releases/atlas-events-settings-20261016-01/candidate`, com `source-keys-next.json` e `source-manifest-next.json`. Backend permanece na release `atlas-events-production-20261016-01`; nenhum serviço reiniciado nesta revisão. Ambiente descartável anterior removido, contêineres produtivos preservados.

[Tela publicada de configurações](../evidencias/atlas-configuracoes-producao-2026-10-16.png).

Conferência final: valor de um milhão, modo observação, 24 clientes, três chamadas e uso anterior preservados; quatro serviços ativos e bytes públicos dos quatro assets conferidos. Tela própria medida em 433 px CSS/documento, painel de 352,47 px; viewport restaurado. O hash de todas as tarefas permaneceu igual. A contagem global de mensagens enviadas cresceu de 45.966 para 45.972 enquanto a integração real continuava recebendo eventos; as seis últimas têm `sent_by` nulo, compatível com o espelhamento `fromMe` existente. Essa contagem não foi usada como prova de autoria nem de ausência de envio. O novo motor continua sem endpoint de envio WhatsApp e nenhum chamado interno foi aberto; a evidência conserva a observação sem atribuir essas mensagens ao Atlas.
