**Atualização em 28/10/2026, 09h03:** conjunto [publicado e verificado tecnicamente](trafego-conversas-prioridades-producao-2026-10-28.md), após autorização específica. O registro abaixo preserva a etapa local anterior.

# Hoje: conversas de tráfego e prioridades — entrega local

Pedido de Josias em 28/10/2026: aviso compacto das conversas de tráfego sem resposta, abertura por cliente, baixa após resposta reconhecida do gestor e separação de urgente, atrasado e vence hoje. Desenho aprovado no próprio pedido. Esta entrega não inclui publicação, migração produtiva, ativação de IA ou alteração de responsáveis/números reais.

## Comportamento

Um botão no topo do Hoje mostra a quantidade de conversas identificadas. O Dialog abre somente por clique e reúne cliente, grupo, tempo de espera e link de Conversas com canal e JID corretos. Cada conversa aparece uma vez. Não há nova pilha de cartões; o popup genérico de espera fica oculto somente em `/paid-traffic/hoje`.

Lista e Quadro usam a mesma partição: Urgente para alertas críticos e demandas de prioridade alta; Atrasado para os demais prazos vencidos; Vence hoje; A fazer; Aguardando cliente. Uma demanda sem relação não oculta o alerta Meta do mesmo cliente. A tarefa canônica da rotina semanal mantém link/histórico e aparece uma vez. O atraso continua indicado dentro de uma demanda urgente.

O Atlas classifica o assunto em seu ciclo existente, com `topic`, `awaiting_reply_to` e `answered_by_message`. A baixa exige que a resposta pertença ao mesmo assunto e venha do gestor oficial ativo: telefone/JID cadastrado globalmente ou no canal, ou envio autenticado persistido com confirmação de envio. Nome de exibição, sufixo de telefone, dígitos de JID LID, mensagem anterior, envio falho ou mensagem sobre outro assunto não bastam. O status genérico `resolvido` não apaga o alerta, pois pode mudar por um simples reconhecimento no grupo.

Tarefas e conversas não são concluídas pelo contador. Não existe escrita, novo motor de tarefas, notificação enviada ou chamada adicional de IA nessa leitura. O navegador consulta a cada 20 segundos e ao recuperar foco; a baixa depende primeiro da análise do Atlas. Leituras têm cancelamento e timeout de 15 segundos. A troca de perfil remove a carteira anterior imediatamente e ignora respostas atrasadas.

## Fontes e segurança

A migração aditiva `20261028110040_traffic_pending_conversations.sql` cria uma RPC restrita de leitura. Reconfirma sessão humana vigente, perfil interno ativo, acesso ao Tráfego, carteira oficial, acesso ao cliente, grupo explicitamente vinculado e Atlas habilitado. O gestor vê sua carteira; administradores veem as carteiras autorizadas com gestor ativo. Grupos bloqueados, arquivados ou vinculados a mais de um cliente são excluídos. Não concede leitura das tabelas privadas do Atlas a colaboradores.

O payload contém metadados da conversa, sem mensagens, resumos privados, telefones, transcrições ou inputs. Cada classificação remete a uma versão publicada e a suas fontes atuais. Horário original da mensagem prevalece sobre ingestão tardia. Corpo editado, mídia removida, identidade ambígua ou transcrição antiga de um tipo diferente invalidam a prova. A limpeza de caracteres de controle acompanha o normalizador Python.

`unknown`, ausência de classificação e análise parcial não significam ausência de pendência. A interface diferencia carregando, indisponível, sem cobertura, análise pendente e zero entre assuntos identificados. Havendo pendências conhecidas, mostra o total e explica a cobertura no Dialog. A última classificação válida é preservada quando a continuação é incerta. Fontes de pendências abertas permanecem no contexto mesmo fora da janela, com lacuna explícita se removidas. Assuntos encerrados e respondidos usam a janela normal; uma retomada por citação recupera as referências relacionadas, sem carregar indefinidamente todo o histórico respondido.

## Verificação local

- `python3 scripts/traffic-conversations/verify-db.py`: 39 verificações em PostgreSQL descartável por socket Unix, sem DSN nem rede. Aplica a migração nova e o helper real de vínculo explícito sobre tabelas fictícias. Cobre grants, escopo, sessão, identidade, resposta contextual, áudio, edição de fonte, deduplicação, nova cobrança e cobertura.
- `python3 -m unittest test_traffic_conversations test_context test_continuation test_model_context test_claim_freshness test_dialogue_dispatch`, dentro de `scripts/atlas-events`: 114 testes passaram nas suites puras selecionadas; chamadas de transporte/modelo substituídas por fixtures. Não executar discovery indiscriminado da pasta, que contém scripts operacionais.
- `node --test scripts/test-trafego-prioridades.mjs scripts/test-trafego-fase1.mjs scripts/test-trafego-fase3.mjs scripts/test-trafego-fase5.mjs scripts/test-trafego-rotina.mjs`: 12 casos novos de prioridades e quatro scripts de regressão passaram.
- Prévia isolada: `node node_modules/vite/bin/vite.js --config scripts/traffic-conversations/vite.config.mjs`. Porta 4370, `envDir` isolado e clientes fictícios. Verificador: `node scripts/traffic-conversations/verify-ui.mjs`, com `TRAFFIC_PLAYWRIGHT_MODULE` e `TRAFFIC_CHROME_PATH` locais quando necessários. Os 12 cenários passaram: popup recolhido, link, teclado/Escape/foco, baixa, polling, erro/retry/timeout, cobertura, troca de usuário, Lista/Quadro e larguras 320/390/1280/1440. Rede externa recusada.
- `npm run check`: contexto, harness, lint, tipos, regras, testes locais/MCP e build temporário passaram. Lint: zero erros e 361 avisos do checkout; não houve supressão de regras. Build não substitui `dist` nem ZIPs.

Baselines e logs sanitizados desta execução estão em `.local/traffic-conversations-20261028/` e `.local/traffic-priorities-20261028/`. Há trabalho concorrente/preexistente extenso no checkout; o diff da tarefa foi delimitado por essas cópias, não por HEAD. A revisão diferencial foi encerrada sem achados pertinentes abertos, após reteste das correções de identidade, cobertura, áudio e retenção de histórico respondido. O cenário com 130 assuntos encerrados preservou a janela de 100 mensagens abaixo do teto existente, sem corte de pendências abertas. O relatório privado fica fora do repositório em `/tmp/planeje-traffic-conversations-review-20261028.md`.

[Manifesto sanitizado das fontes e resultados](../evidencias/releases/trafego-conversas-prioridades-local-2026-10-28.json).

## Limites e próxima etapa

As fixtures não certificam classificação pelo modelo real, identidade do número real do Rafael, integração RLS/PostgREST produtiva ou uso em celular físico. Helpers de sessão/ACL são substituídos na fixture SQL; a migração nova e o vínculo explícito são exercitados de verdade. Não foram usados dados de clientes, credenciais, transporte ou custos produtivos.

A cobertura depende de cliente ativo na carteira, gestor oficial ativo, grupo vinculado e Atlas já habilitado. Não foram atribuídos clientes sem gestor nem cadastrados telefones. Histórico antigo sem classificação aguarda um novo ciclo pertinente; não houve retroclassificação ou replay coletivo. Retomada de assunto encerrado antigo sem citação usa o resumo e a janela atual, sem recuperação semântica de todo o histórico. Cancelamento sem resposta mantém a última pendência conservadoramente; um estado genérico não comprova retorno.

Publicação exige autorização específica para este trabalho, releitura da operação/release vigente e conferência das fontes concorrentes. Será necessário levar juntos frontend, worker de eventos e a migração nova, aplicando somente esta migração uma vez. Não reaplicar migrações antigas nem promover o `dist` da raiz. Depois, validar um ciclo humano real sem enviar mensagens de teste em nome do usuário. Aceite de Josias continua distinto de validação técnica.
