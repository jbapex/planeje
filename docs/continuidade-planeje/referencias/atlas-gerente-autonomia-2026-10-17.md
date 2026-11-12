# Atlas: esclarecer, organizar e acompanhar — produção, 17/10/2026

Publicado às 01h37 e ativado às 01h38 de São Paulo na VPS 72.60.14.109. Esta entrega substitui a exigência anterior de revisão do dono para toda nova tarefa **somente no novo fluxo operacional gerenciado**. Fluxos manuais antigos continuam compatíveis.

Josias pediu parar de validar e encaminhar cada pedido. A decisão é: Atlas identifica o pedido; conversa com quem cuida da conta; esclarece ação e executor; vincula trabalho existente ou cria tarefa operacional do serviço contratado; acompanha o executor; encaminha entrega à conta para conferência. O dono fornece conhecimento ausente e decide escopo, verba ou direção. A expressão “dono do cliente” significa responsável interno da conta, sem contato automático com o cliente externo.

## O que está ativo

- Configurações → **Do pedido à execução**: esclarecimentos/acompanhamento ligados, criação depois do alinhamento ligada. Salvar também habilita `assist` para os 24 clientes selecionados. Pausar conserva histórico e bloqueia novas ações/revisões gerenciadas.
- Conta interna separada do responsável comercial. Reaproveita UUID/nome inequívoco ativo do cadastro; se aponta o dono ou está ambíguo, pergunta ao dono uma vez por cliente. Não presume Poliana para Impacto.
- Robô aceita selecionar a conta ou responder um nome inequívoco. Essa definição é salva por cliente, com memória versionada. Alterar a definição preserva responsáveis oficiais das tarefas e a conversa privada original.
- Intake pode começar sem tarefa. Pedidos relacionados compartilham uma conversa; atualização relevante reaproveita o assunto. Reanálise igual não repete a pergunta. Pedidos independentes não são marcados todos como atendidos por uma tarefa genérica.
- Índice completo de tarefas do cliente antes de criar, inclusive para carteiras com mais de cem tarefas. Vínculo existente não transfere tarefa nem muda prazo oficial. Não cria uma substituta só porque outra está atrasada.
- Título `[Nome do cliente] Ação`. Prazo pelas regras editáveis: um dia útil para apuração, três para produção; previsão explícita é tratada separadamente e normalizada em dia útil. Sem exigir outra aprovação só para preencher uma data.
- Respostas operacionais do dono geram um resumo reutilizável para aquele cliente. O texto privado original não é entregue à equipe. Verba de um trabalho não autoriza outra verba.
- Depois da resposta da conta, criação e registro do andamento não exigem o botão legado “Registrar combinado”. Relato de entrega exige link/registro para conferência e não conclui oficialmente a tarefa. Conferência rotineira vai à conta; escopo/verba vai ao dono em conversa separada.
- Chamados do escritório mostram destinatário real, mensagem, resposta, fase e próxima revisão; botão abre a conversa exata do robô. Cartão de demanda vinculada também abre o robô.
- Chamados automáticos seg–sex, 08h–17h, São Paulo/expediente cadastrado. Trabalhos alinhados fora do expediente aguardam e revalidam sessão, fontes, cliente, equipe e tarefas antes de criar. Revisões determinísticas não chamam IA só pelo relógio.

## Linguagem solicitada

Josias autorizou ler suas próprias mensagens de grupos do número informado. O registro legado do WhatsApp usa o número sem o nono dígito, com identificador LID e nome de remetente coincidentes. Inventário: 705 mensagens, sendo 594 textos e 111 áudios, em 43 conversas, de 28/08 a 16/10. Foram lidos cerca de cem exemplos textuais; não houve transcrição nova para este trabalho. O conector Write Like Me não trouxe resultados relevantes; a fonte efetiva foi a leitura SQL das mensagens autorais salvas, sem expandir a leitura operacional do gerente para grupos das lojas.

Nenhuma amostra autoral foi salva em arquivo, índice, cache ou evidência. Guardam-se apenas hábitos gerais no código: português simples, curto, próximo, pedido concreto, primeiro nome quando útil, poucas perguntas, reconhecer o que já foi dito, sem saudações repetidas ou burocracia. Repostas do modelo, chamados iniciais e lembretes receberam esse tom. Atlas conserva a própria identificação; não assina como Josias nem inventa ser humano, intimidade, ações ou compromissos. Não replica erros, credenciais ou fatos das mensagens usadas como referência.

## Primeiro caso real

A ativação pela sessão humana normal de Josias criou **uma pergunta privada real**:

> Preciso de você num ponto da Impacto Noivas: quem cuida dessa conta por aqui? Me fala o nome ou escolhe abaixo. Vou guardar e seguir com essa pessoa no expediente.

Conversa `7177d52a-7aa6-4303-b06c-7d3601a1008b`, cliente `9196d07f-f0a8-4eb2-9f9a-3dade28d4a69`; cinco achados existentes agrupados. Nenhuma pessoa foi escolhida pelo agente. Zero chamado à equipe, zero tarefa criada e hash integral de tarefas preservado. Próxima revisão: segunda-feira, **19/10, 08h**. A escolha da conta e o primeiro uso pela equipe dependem da resposta real de Josias. Não criar respostas/tarefas fictícias na produção para provar o fluxo.

## Validação

- 24 testes de decisões/contexto/responsável, 14 de expediente, 47 de contexto de grupos e sete de atividade no escritório: **92 verificações locais**.
- **78 verificações novas** de API/Auth/RLS/fila e ponte completa com provedor simulado; **68 regressões anteriores** no esquema completo descartável. Conta/executor não leem conversa privada do dono; sessão revogada, troca de conta, pausa, mudança de fonte e duplicidade impedem escrita obsoleta. Funções públicas novas permanecem invoker; escrita de máquina só service_role, com verificações internas.
- Quatro chamadas ao modelo real com cenário inteiramente fictício: 9.671 tokens no total. Duas primeiras exigiam pergunta redundante; instrução foi corrigida e as duas últimas produziram `ready`, executor certo, apuração interna, sem vincular vídeo alheio e sem inventar promessa. Nenhuma chamada de estilo transmitiu as amostras autorais; somente regras derivadas e dados sintéticos. Última validação: 2.806 tokens. Não confundir esse teste isolado com consumo do leitor produtivo.
- Build principal e escritório completos; candidato recomposto a partir das 1.668 fontes produtivas anteriores, sem promover Assessoria/CS ou extensões ZIP geradas incidentalmente. Agora 1.680 fontes guardadas.
- Prévia com fluxo conta→executor em computador e tela estreita. Produção autenticada: salvar autonomia, persistência, pergunta real, seletor de seis pessoas ativas, Chamados→conversa exata, texto/áudio disponíveis e janela em tela estreita conferidos. Duas APIs anônimas recusadas com 403; quatro serviços ativos.

## Publicação e continuidade

- Fonte/base atual: `/root/planeje-releases/atlas-manager-flow-20261017-01/candidate`; webroot `/var/www/planeje`.
- Main `index.258d07d9.js` / `index.543d5afd.css`; escritório `index-5fe8931e.js` / `index-fa6fc7d5.css`. Anteriores preservados. URL: `https://planeje.jbapex.com.br/?v=258d07d9#/assistant/atlas`.
- SQL `20261017034308_atlas_manager_intake.sql` aplicado **uma vez**, registro externo com hash em `migration-applied.json`; não reaplicar. Não existe ledger `supabase_migrations.schema_migrations` nesta instalação; nenhum ledger global foi inventado nesta entrega.
- Somente `planeje-atlas-events.service` e `planeje-atlas-team.service` reiniciados com a nova candidata; time recebe `ATLAS_TEAM_MANAGER=true`. Vendor/cache de eventos mantidos. Office/Atlas/Edge Functions/Nginx sem reinício. Monitor legado permanece pausado.
- Estado final `enabled=true`, `create_after_clarification=true`, `mode=assist`, teto de 1.000.000 preservado, 24 clientes, 17 grupos explicitamente vinculados. **Sete clientes ainda sem vínculo**. Os 37 grupos de lojas continuam fora da automação de demandas da agência.
- Mantém limites próprios de conversa/ditado/transcrição; o limite legado de respostas IA por pessoa continua sendo 20/dia. O teto de um milhão cobre grupos+escritório, não é uma promessa de conversas ilimitadas. Não foi alterada a indicação antiga do consumo após a virada de data; a interface pode mostrar o último dia registrado até a primeira nova reserva.
- Pendentes: resposta da conta de Impacto, primeiro ciclo real em horário comercial, precisão semântica em novos pedidos, sete vínculos de grupos e aceite de linguagem/uso. A revisão de entrega do robô não substitui a atualização da etapa oficial da tarefa.
- Recuperação: pausar autonomia pela sessão do dono primeiro; os HTMLs e unidades anteriores estão em `before/`. Restaurar esses arquivos se necessário, preservando esquema/histórico aditivos. Não remover tarefas ou reaplicar migração para voltar o visual.

[Evidência da API](../evidencias/atlas-gerente-autonomia-api-2026-10-17.json) · [Modelo fictício](../evidencias/atlas-gerente-autonomia-modelo-2026-10-17.json) · [Release](../evidencias/releases/atlas-gerente-autonomia-2026-10-17.json) · [Chamado real no escritório](../evidencias/atlas-gerente-chamado-escritorio-2026-10-17.png) · [Conversa real](../evidencias/atlas-gerente-autonomia-producao-2026-10-17.png) · [Tela estreita](../evidencias/atlas-gerente-autonomia-producao-mobile-2026-10-17.png).
