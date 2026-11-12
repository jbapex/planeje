> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Planeje — plano por fases para validação

Atualizado em 11/09/2026. **Primeira entrega da fase 1 autorizada e implementada somente na VPS de teste**, após backup. Inclui funções configuráveis, retorno ao produtor registrado, conferência de regras e correções de salvamento, relacionamentos, Realtime e paginação social. As 1.234 tarefas originais, oito automações e duas regras de pré-requisitos foram preservadas. A configuração real das novas funções e a promoção para produção continuam para revisão. [Entrega e evidências da fase 1](fase-1-entrega.md).

## O objetivo confirmado

Controlar a agência da entrada do cliente até a entrega e o resultado, com fluxo ligado a funções da empresa. Pessoas podem ser substituídas sem reconstruir o processo. Um mesmo material precisa ter controle individual das publicações em vários canais.

A interface deve ser simples e funcional: mostrar a ação necessária, responsável, prazo e situação; explicações complementares ficam no ícone **?**. Alertas que impedem uma ação devem explicar o problema diretamente, perto do campo. Não esconder pendências importantes dentro da ajuda.

Este documento propõe a ordem e o conteúdo das fases. As alternativas de negócio ainda abertas estão identificadas; não são decisões tomadas em nome da agência.

A base de cada fase é o [mapa do funcionamento atual e do que preservar](mapa-preservacao-planeje.md). O sistema já tem planejamento de campanha, calendário de materiais, checklists de onboarding, automações em uso, publicador Meta, painel unificado Meta/Google e pontes entre atendimento, produção e tráfego. O plano deve ampliar esses caminhos existentes. Recursos implementados podem ter disponibilidade diferente conforme as permissões de cada usuário.

## Modelo proposto para confirmar

### A mesma tarefa troca de responsável conforme a etapa

**Lógica esclarecida por Josias:** quem cria a tarefa escolhe o responsável inicial. Depois, roteiro tem seu responsável, criação tem outro, revisão tem outro e publicação tem outro. A automação de tarefas já existente faz essas mudanças conforme a etapa.

O código e a configuração atual confirmam essa base: existem oito automações ativas, e o mecanismo já permite adicionar/remover responsáveis e devolver a tarefa a quem estava numa etapa anterior. A mesma tarefa mantém seu histórico ao passar de pessoa para pessoa.

Na configuração atual, sete regras respondem à mudança de status e uma ao vencimento; não há regra ativa de atribuição na criação. Algumas passagens descritas para roteiro/design/produção ainda não possuem encaminhamento específico. Na revisão, uma regra mantém o produtor e acrescenta dois destinatários: **esse conjunto será preservado até Josias confirmar eventual mudança**. A regra de notificação por vencimento exige correção no executor para funcionar como configurada; isso não significa ausência dos outros mecanismos de notificação do sistema.

**A correção do plano é reaproveitar esse mecanismo, sem acrescentar um responsável permanente pelo fluxo.** Para deixar o processo independente dos nomes, a proposta técnica é permitir que o destinatário da automação seja uma função com pessoa configurada. A função pode ter vários integrantes e uma pessoa pode exercer várias funções; a escolha entre vários elegíveis será definida quando esse caso existir.

Ao substituir alguém, será possível revisar a configuração da função e transferir suas pendências conforme uma decisão explícita, preservando as pessoas que executaram as etapas anteriores. “Adicionar participante” e “trocar responsável” precisam continuar sendo ações distintas. A devolução atual busca os responsáveis do **histórico mais recente em A Fazer (`todo`)**; não significa necessariamente a pessoa da etapa imediatamente anterior. Preservar esse contrato nas regras antigas durante a migração; o fluxo configurado deverá atender ao retorno ao produtor confirmado em 11/09, inclusive quando ele diferir do último `todo`. Tratar histórico ausente ou pessoa indisponível de forma explícita. Não presumir rodízio, distribuição por carga ou transferência silenciosa.

Função operacional e papel de acesso são conceitos distintos: ser responsável por tráfego, por exemplo, não deve automaticamente dar acesso ao preço do contrato da agência nem transformar alguém em administrador. Os papéis e as permissões existentes serão mantidos durante a migração; qualquer mudança de acesso será apresentada numa matriz curta para validação antes de ser aplicada.

### Esclarecimento confirmado em 11/09/2026

O objetivo é **o sistema ser configurável conforme a equipe mudar**, sem impor uma organização fixa à agência. Escolha de pessoas já existe nas automações; a evolução deve permitir configurar funções, ocupantes e encaminhamentos de forma simples, reaproveitando esse mecanismo.

Exemplo atual informado por Josias: **equipe produz → Poli revisa → Josias valida → Jheimisson conduz a aprovação do cliente → Jheimisson publica**. Se o cliente pedir alteração, **volta a quem produziu e repete revisão → validação interna → aprovação do cliente**. Os nomes representam ocupantes atuais, nunca constantes do código. A operação de manter participantes ou substituir responsáveis continua explícita na configuração; o esclarecimento não altera silenciosamente as regras copiadas.

O teste confirmou que a automação atual de devolução usa o último `todo`. Quando roteiro e produção tiverem executores diferentes, esse dado pode não identificar o produtor. Para cumprir o comportamento confirmado, a evolução deve registrar quem executou a produção e usar essa referência no fluxo configurado, preservando as regras antigas na migração e sinalizando históricos insuficientes.

A entrega concreta proposta está em [primeira fase: configuração do fluxo](/Users/josiasbonfimdefaria/Documents/Codex/2026-09-09/con/outputs/planeje-teste/primeira-fase-configuracao-do-fluxo.md). A verificação do clone está em [validação do fluxo atual](/Users/josiasbonfimdefaria/Documents/Codex/2026-09-09/con/outputs/planeje-teste/validacao-fluxo-2026-09-11.md).

### Um material, várias publicações

**Confirmado por Josias:** uma tarefa principal reúne briefing, produção, arquivo e revisão. Dentro dela, cada publicação tem destino, responsável, data, situação e comprovação próprios.

| Material: vídeo de uma campanha | Data ilustrativa | Situação ilustrativa |
|---|---|---|
| Instagram · conta do cliente · Reels | 10/09 | Publicado, com link |
| Facebook · página do cliente · vídeo | 11/09 | Agendado |
| YouTube · canal do cliente · Shorts | 12/09 | A publicar |

A produção aparece como pronta e a distribuição como **1 de 3 publicações concluídas**. Uma publicação não encerra silenciosamente os outros destinos.

Pontos propostos para essa fase:

- Selecionar vários destinos numa única ação, sem copiar toda a tarefa.
- Compartilhar o arquivo aprovado; permitir texto, formato e arquivo específico quando houver adaptação para um destino.
- Relacionar a publicação à versão aprovada, preservando o histórico quando o material muda.
- Reagendar mantém a mesma publicação; republicar em outra ocasião cria uma nova ocorrência.
- Visualizar o conjunto dentro da tarefa e cada ocorrência no calendário e na fila de quem publica.
- Mostrar produção e distribuição separadamente. O que cada ocorrência consome do escopo contratado depende da regra comercial confirmada por vocês.

O pedido atual confirma a necessidade de **controlar** publicações. Já existe um publicador Meta para Facebook e imagem no Instagram, com agendamento no caminho de Facebook; ele será reaproveitado e vinculado ao controle de produção. Existência de código não comprova autorização de conta ou sucesso de publicação externa. Ampliar formatos, plataformas ou ações de API é uma possibilidade separada, a confirmar e dimensionar; não está autorizada por este plano.

## Fases propostas

A primeira entrega da fase 1 abaixo está em homologação no clone; ela cobre o escopo detalhado do documento “primeira fase: configuração do fluxo”. A unificação dos demais pontos de entrada, revisão ampla de permissões e transferência coletiva de pendências continuam a planejar e validar. As fases representam entregas para validação, não uma promessa de prazo. Cada fase deve começar com suas regras fechadas e terminar com uma demonstração dos casos abaixo.

| Fase | O que vamos preparar ou codar | Como verificar que ficou útil |
|---|---|---|
| **0 · Backup e recuperação** | Completar inventário e restauração isolada do banco, autenticação, Storage, fonte/build, configurações e serviços separados, incluindo `/root/planeje-briefing`. Bloquear saída de rede para serviços reais antes de iniciar processos; suspender crons, webhooks, lembretes e envios. Criar uma base de comparação dos fluxos e preparar retorno de versão compatível com dados novos. | Recuperar em ambiente separado e conferir login, dados, permissões, anexos e regras. Demonstrar que reinício não envia mensagens nem duplica notificações. Reproduzir os cenários atuais sem mudar os destinatários; registrar integridade, tempo de recuperação e limitações. |
| **1 · Funções e base confiável** | Evoluir as automações existentes para encaminhar etapas por função, mantendo escolha inicial e operações de adicionar/remover. Preservar regras antigas e permitir configurar revisão, validação e retorno ao produtor conforme o fluxo confirmado. Separar funções de papéis/permissões. Preservar IDs, valores internos de status, referências e históricos; mudar rótulos sem romper gatilhos. Unificar o contrato de criação/transição nos pontos de entrada e nos consumidores externos. Proteger regras quando seu criador sair. | A mesma tarefa percorre os cenários atuais com os mesmos resultados. Substituição de integrante não reescreve histórico nem libera acesso. Tarefas, Atendimento, MCP e demais entradas aplicam a mesma regra; notificações não duplicam em repetição, falha ou reinício. |
| **2 · Tarefas, produção e vários canais** | Manter tarefa simples com cadastro curto. Para conteúdo, completar briefing e etapas por função; registrar revisão/versão; criar publicações vinculadas por destino, com datas, responsáveis e evidências independentes. Reaproveitar publicador Meta, tarefa, fila e calendário. Preservar o arquivamento atual para Social durante a transição, mantendo IDs e formato original. Aplicar bloqueios gradualmente após validar o ponto correto. | Produzir um material, programar três destinos, publicar um e continuar vendo os outros dois pendentes. Uma reprovação afeta apenas material/versão correspondente. Arquivamento conserva anexos e histórico; falha externa não marca publicação como concluída. Tarefa interna simples continua rápida. |
| **3 · Operação dos clientes e planejamento** | Separar fechamento comercial de ativação operacional. Evoluir os checklists de onboarding existentes, conservando itens, notas e conclusões. Versionar escopo por cliente/mês dentro do planejamento atual. Criar vínculo estável material↔tarefa e solicitação↔tarefa, sem duplicar registros; preservar autosave, rascunhos, formatos legados e calendário. Conectar cobertura, fila semanal e consequências das urgências. | Ver o que cada cliente deve receber, o que foi planejado/entregue e os impedimentos. Converter novamente não duplica; renomear não rompe vínculo; alternar plano/calendário não perde dados. Urgência registra compromisso alterado e motivo. |
| **4 · Tráfego e resultado** | Reaproveitar Central de Tráfego, delegação da tarefa para campanha, painel unificado Meta/Google, portal, PGM e CRM. Conectar demanda, prazo e criativo aprovado; adequar rotinas sem duplicação; aplicar alçadas confirmadas. Conciliar leads, agendamentos, vendas e receita. Expansões de APIs, formatos e ações externas dependem de aprovação específica. | A função de tráfego recebe uma demanda pronta; a gestão vê rotinas pendentes e resultados com fonte/período identificáveis. Repetir geração não duplica rotina/campanha; ação fora da alçada pede decisão; filtros atuais do painel continuam coerentes. |
| **5 · Financeiro e direção** | Cobranças, recebimentos, risco financeiro e solicitações de suspensão/liberação segundo regras aprovadas. Separar vencimento de cobrança de renovação contratual. Reunir exceções e decisões pendentes na visão da direção. | A operação vê o impedimento financeiro permitido ao seu perfil; o financeiro registra pagamento; a decisão reservada à direção não é executada por outro perfil. A direção acompanha o que exige sua decisão sem reconstruir conversas. |

As visões de **minha fila**, **operação** e **direção** evoluem junto de cada fase. Não é preciso esperar a fase final para enxergar melhorias, nem criar uma tela nova para cada regra. Configurações ficam fora do uso cotidiano.

## O que muda na especificação original

1. **Funções substituem dependência de nomes nas regras.** Reaproveitar a automação atual de troca de responsáveis. Pessoas permanecem nas atribuições e no histórico; não criar um dono fixo adicional para a tarefa. Quem ocupa cada função é configurável, sem confundir função com papel de acesso. Preservar o comportamento das regras antigas durante a migração; aplicar o fluxo confirmado somente por configuração revisada, com retorno ao produtor identificado no histórico.
2. **Produção e publicação têm estados próprios.** O único status `publicado` na tarefa não representa vários canais. Tarefas internas, produção e publicações não precisam da mesma sequência de etapas.
3. **Material e distribuição têm contagens distintas.** Evitar que publicar o mesmo vídeo três vezes pareça, automaticamente, produzir três vídeos. A cobrança do escopo precisa seguir o contrato de cada cliente.
4. **Bloqueio de briefing precisa de uma regra única.** O documento alterna entre impedir atribuição, início de edição e conclusão. Esse comportamento será confirmado antes da fase 2, com transição gradual para os registros existentes.
5. **Acesso precisa acompanhar responsabilidade.** Separar orçamento de mídia dos valores comerciais da agência e validar permissões antes de liberar execução por função.
6. **Prazos e números antigos não serão migrados como verdades atuais.** A limpeza partirá da consulta atual, com lista de casos ambíguos para revisão; não ativar perfis nem converter status apenas pelo nome.
7. **Preservação inclui consumidores fora da tela principal.** Mudanças devem considerar criações e atualizações por materiais, solicitações, checklist de projeto, Social, Atendimento, MCP, extensão e serviços separados. O resumo diário de `/root/planeje-briefing`, por exemplo, usa status e responsáveis das tarefas; alterar somente o frontend pode romper esse consumidor.

O arquivo original permanece preservado. Este plano funciona como proposta de revisão; a especificação consolidada deve incorporar as escolhas confirmadas antes do desenvolvimento correspondente.

## Confirmações por momento

**Já confirmado:** tarefa principal com publicações vinculadas; criador escolhe o responsável inicial e a tarefa troca de responsável conforme a etapa, aproveitando a automação existente; backup autorizado e realizado. Snapshot e recuperação confirmados por Josias; cópia isolada restaurada na VPS de teste em 10/09/2026.

**Antes de fechar a fase 0:** concluir a comparação funcional dos fluxos na cópia isolada já preparada; fechar retenção, destino permanente, quem recupera e quanto tempo/perda de dados a empresa tolera. O pacote principal está no Mac e na VPS; o complemento de briefing está no Mac, e o serviço foi incluído no arquivo privado da cópia de teste. A recuperação do snapshot foi confirmada por Josias, e o banco da nova cópia foi restaurado e conferido. Voltar um banco antigo depois de novas entradas pode perder trabalho; retorno de versão não será tratado como restauração automática de dados.

**Antes das fases 1–2:** o fluxo e o ciclo de alteração foram confirmados em 11/09. Conferir a configuração concreta de funções, destinatários e operações de adicionar/remover antes de aplicá-la; resolver escolha entre vários integrantes ou retorno sem histórico `todo`/pessoa disponível, quando aplicável; contas/canais usados; expansão da publicação já existente; aprovação de adaptações e cancelamento de publicação pendente. Não perguntar novamente pelo fluxo que já estiver claro na configuração atual.

**Antes das fases 3–5:** contagem contratual de material/adaptações/distribuição; dias úteis e marcos do onboarding; regras de urgência e revisão; base e acúmulo dos +20%; regras financeiras. Essas perguntas serão tratadas na fase pertinente, sem exigir todas as respostas agora.

## Como desenvolver sem tornar o sistema pesado

- Mostrar campos de acordo com o tipo de trabalho e a ação atual; detalhes adicionais no **?** ou em área opcional.
- Reaproveitar cadastro de cliente, tarefas, projetos, checklists, anexos, calendário, cobertura, publicador Meta, painel Meta/Google, Central de Tráfego e resultados existentes.
- Começar com um cliente e um fluxo completo em ambiente isolado. Bloquear saída para contas, clientes e campanhas reais; simular envios/publicações. Testes externos adicionais dependem de autorização e destinos de teste definidos.
- Antes de liberar uma fase, demonstrar o caminho normal e as exceções relevantes: reprovação, bloqueio, substituição e atraso.
- Conferir permissões e prevenção de duplicações em todos os pontos de escrita: tela de Tarefas, materiais, solicitações, checklist, Social, Atendimento, MCP, extensão e serviços. Consumidores de status e responsáveis, inclusive o serviço Node separado de briefing/notificações, entram na comparação.
- Usar migrações aditivas e compatíveis primeiro; manter IDs e valores internos legados durante o piloto. Não reaplicar regras retroativamente nem alterar histórico para refletir os novos titulares das funções.
- Iniciar o piloto com liberação controlada. O retorno deve desligar a funcionalidade nova ou voltar uma versão compatível, preservando tarefas, comentários, anexos e outras entradas produzidas depois da implantação. Ensaiar esse retorno antes de expandir; não restaurar banco antigo para desfazer código.
- Testar notificações com eventos repetidos, falha e reinício: enviar uma vez ao destino correto, conservar preferências e não disparar mensagens antigas ao subir serviços. Validar a usabilidade com as pessoas que exercem as funções.
- Apresentar a entrega concreta e seu impacto para a liberação correspondente. Não confundir concordância com este plano com autorização para alterar a produção agora.

**Situação atual em 11/09/2026:** backup e recuperação confirmados; cópia na VPS **2.25.216.103**. O teste de uma tarefa de arte percorreu os encaminhamentos atuais até `social_media/completed`, preservando seu ID e histórico. As 1.234 tarefas originais da cópia permaneceram com o mesmo conteúdo. A configuração atual difere do exemplo desejado e contém um destinatário sem perfil; há correções de interface e verificação de carregamento/reconexão a concluir. Saídas externas continuam bloqueadas. Nenhuma funcionalidade nova ou regra de negócio foi alterada. [Registro do teste e limitações](/Users/josiasbonfimdefaria/Documents/Codex/2026-09-09/con/outputs/planeje-teste/validacao-fluxo-2026-09-11.md).
