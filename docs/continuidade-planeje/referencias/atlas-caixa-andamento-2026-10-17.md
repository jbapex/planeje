# Caixa do Atlas: responsável e próximo passo — 17/10/2026

Publicado na VPS 72.60.14.109 às 18h27 e complementado às 18h32, São Paulo. Josias voltou a perguntar o que fazer com os pedidos da Impacto na caixa. A lista anterior exibia todos como sugestões para revisão do dono, mesmo com autonomia ativa e Poliana já definida como conta.

## Comportamento

Pedidos dos grupos são agrupados por cliente e mostram com quem estão, a conta cadastrada, próximo passo, revisão registrada e se existe mensagem interna ou tarefa vinculada. Filtros Todos, Precisa de você, Atlas e equipe e Encerrados. Há uma análise manual por cliente, que reavalia seus pedidos em conjunto; abrir a página ou um cartão não dispara IA. Analisar clientes conserva a ação global anterior com nome de alcance mais claro.

Sem conversa registrada não se declara pessoa chamada, tarefa criada ou entrega concluída. Um responsável é reconhecido pela definição explícita ativa ou pelo cadastro inequívoco; não é inferido pelo tema. Conversas reais abrem o assunto exato no robô. Conta sem vínculo, contexto desatualizado, leitura pausada e cliente fora da seleção têm rótulos específicos. Só pergunta efetivamente encaminhada ao dono entra como resposta sua. Revisão de entrega atribuída à conta permanece com a conta; encerramento do robô não prova conclusão oficial.

Os registros automáticos sem tarefa deixam de se repetir na tabela de repasses manuais. A seleção usa o ID exato da demanda, cliente e proprietário atuais; não apaga, arquiva nem altera estado no banco. Proposta explícita `owner_manual`, tarefa vinculada e arquivo preservam sua linha. Links antigos ao detalhe e opção manual continuam disponíveis. A tabela foi nomeada Demandas manuais e tarefas vinculadas. O badge antigo foi identificado como avisos, mantendo o número; ele não representa os cinco pedidos nem cinco aprovações.

O escritório usa a mesma interpretação: pendências automáticas sem conversa ficam em Fila do Atlas, com acesso ao andamento na ficha; não entram em Aguardando Josias. Perguntas reais continuam no filtro do dono. Conta, equipe e revisão continuam em suas conversas e não são criadas pelo visual.

## Leituras e proteção

O acesso da caixa continua começando pelo gate `atlas_demand_access`. Foram acrescentadas somente leituras sob RLS existente: política, IDs da conta, `responsavel` do cliente, nome/papel/estado de pessoas ativas e metadados do último envio Atlas no assunto. O escritório lê os mesmos vínculos mínimos do dono. Sem SQL, nova permissão ou troca de autenticação. Nenhuma memória ou mensagem privada do dono foi compartilhada com equipe.

## Validação

61 testes Node: 20 verificações novas de classificação, conta, fonte desatualizada, ausência de mensagem, isolamento por proprietário/cliente e duplicação manual; 41 regressões de atividade, calendário, prazos e robô. Builds principal e escritório passaram. Prévia: agrupamento, filtros, pedido manual fictício, conversa registrada, celular 390×844 e central completa com duas projeções automáticas e uma proposta manual — só a proposta manual permaneceu na tabela.

A conferência produtiva da primeira publicação revelou a repetição dos cinco registros na tabela antiga. A segunda publicação foi derivada da primeira e removeu somente essa repetição visual. Nenhum publicador já executado foi repetido. Prévia integrada corrigida e verificada antes da segunda promoção.

Produção autenticada final: cinco pedidos da Impacto, zero perguntas do dono nesses pedidos, zero conversas abertas e conta Poliana Geffer. Os cinco aparecem no acompanhamento, sem repetição na tabela manual. No escritório: Em aberto 5, Fila do Atlas 5, Aguardando Josias 0, equipe 0 e um assunto encerrado. Seis HTTP/bytes 200 e quatro serviços ativos. Configuração/autonomia e contagens de conversas/mensagens preservadas nas duas promoções; uso exibido continua quatro chamadas/163.119 tokens, sem análise real disparada pelo agente.

## Bases

Final: `/root/planeje-releases/atlas-inbox-progress-20261017-02/candidate`, guarda de 1.699 fontes. Main `index.464b9c0f.js` / `index.8d3cb20f.css`. Escritório herdado da primeira promoção: `index-c15dc511.js` / `index-e5ae8acc.css`; iframe `caixa-andamento-20261017-01`. Primeira candidata: `atlas-inbox-progress-20261017-01`; base anterior `atlas-owner-hours-20261017-01`. Backend continua em `atlas-manager-flow-20261017-01/candidate`. Assets e HTMLs anteriores conservados. ZIPs incidentais do build restaurados antes de empacotar.

## Limites e continuidade

Esta é uma correção de leitura/apresentação e acesso à análise existente. Os cinco assuntos continuam derivados da análise anterior limitada; não houve reanálise real, chamado à Poliana ou tarefa criada nesta entrega. A atuação automática segue o expediente; o dono pode solicitar análise manual a qualquer hora. Qualidade do primeiro ciclo real, vínculos anteriores de grupos e aceite de uso permanecem pendentes.

Dois outros registros reais foram conservados na tabela: vídeo da Jaralcon em acompanhamento e campanha de novembro da Impacto com tarefa indisponível. Esse vínculo não foi investigado, alterado ou recriado nesta entrega. Não confundir a atenção dessa tarefa com os cinco pedidos dos grupos.

[Caixa produtiva](../evidencias/atlas-caixa-andamento-producao-2026-10-17.png) · [Escritório produtivo](../evidencias/atlas-caixa-andamento-escritorio-producao-2026-10-17.png) · [Celular](../evidencias/atlas-caixa-andamento-mobile-2026-10-17.png) · [Central integrada](../evidencias/atlas-caixa-andamento-central-previa-2026-10-17.png) · [Release](../evidencias/releases/atlas-caixa-andamento-2026-10-17.json).
