# Tráfego: campanhas, revisão e otimização — refinamento de 17/09

Entregue **somente no staging** em continuidade ao primeiro recorte semanal, após Josias apresentar a foto do controle do parceiro e pedir para continuar. Fase 7 parcial; fase 6 planejada; aceite de uso e promoção pendentes. A foto é referência de produto, não autorização para acessar documento externo ou reproduzir todos os campos.

## Fluxo adotado

| Rotina | Recorte | Registro | Execução |
| --- | --- | --- | --- |
| Revisão semanal | Segunda a domingo da semana anterior | Conta/campanha, gasto, conversões com definição, análise e próxima ação; resumo comercial anterior disponível | Tarefa real no dia útil configurado |
| Otimização | Semana atual | O que foi conferido/ajustado ou por que não precisou alterar; campanhas opcionais e próxima ação | Outra tarefa real, com dia configurável independente |

Responsável padrão vem da conta de tráfego existente. Cada rotina pode ser desligada; migração inicia otimização desativada. Criar tarefa depende da cadência ativa/corte, não da leitura de tela nem de cada campanha. Desativar preserva tarefas/histórico; retomar não cobra intervalo desligado. Cliente encerrado conserva histórico.

Configurar/Atualizar pode gerar ciclos vencidos; cron existente continua somente SQL, na hora minuto 10. Alterar dia não reprograma tarefa existente nem repete semana já registrada; quadro mostra próxima data válida para cada cadência. Recorrência respeita São Paulo e segunda–sexta; feriados não são incluídos.

## Contexto e números

Cliente usa cadastro atual e link para ficha. Contas vinculadas aparecem por plataforma/nome; dados seguros de identificação são lidos dos vínculos Meta/Google existentes. Conta pode ser informada manualmente com plataforma/nome/ID, sem criar integração. Campanha usa nome, ID externo opcional e ID estável da linha. `paid_campaigns`/Projeto não foram usados como falsa chave de anúncio remoto.

Por campanha: gasto no período, conversões (com evento explicitado), custo/conversão calculado. Ligações, orçamento diário observado, CPC informado e ID de campanha ficam opcionais. Orçamento diário não é gasto semanal. Não calcular taxa de conversão sem denominador; não misturar conversões Ads com contatos/objetivos CRM. Conversões fracionárias são aceitas. Ausente continua ausente; zero representa conferência. Soma de gasto usa linhas não duplicadas e não é adicionada novamente a um resumo comercial.

Resumo comercial da primeira rodada continua com contatos únicos e resultados da mesma semana. Resultados comerciais não podem superar contatos; esta regra não é aplicada a conversões Ads. Registro escolhe modo; mudar e salvar outro modo troca o recorte exibido, preservando snapshots anteriores no audit.

Comparação por cliente exibe últimas seis revisões por campanha, com colunas semanais; histórico completo paginado continua disponível. Chave usa plataforma/conta/ID externo ou ID da linha manual e definição da conversão. Reutilizar identificação da semana anterior limpa números; nomes/IDs/números finalizados são snapshots, preservados após renomear cadastro/conta. Otimizações têm histórico separado. Finalizados permanecem de leitura com autor/data; próximas ações mostram andamento da tarefa real atual.

## Proteções e limites

Configuração só por gestor; edição/finalização só por responsável real ou gestor. Tabelas novas continuam sem DML autenticado direto; RPCs/normalizador validam conta do mesmo cliente, números finitos e campanha duplicada. Uma tarefa de rotina não pode ser concluída genericamente antes do registro nem apropriada por leitor. Conflito de versão e finalização idempotente mantidos. Finalizar revisão não encerra otimização, nem tarefa da próxima ação.

Otimizar não exige alterar campanha artificialmente. Registrar uma conferência sem mudanças é válido com análise e decisão de acompanhamento. Identificação das campanhas é opcional nessa rotina; não são solicitados números semanais novamente.

Saldo de conta e métricas específicas de leilão da foto não foram implementados; devem ter recorte/denominador próprios se aprovados. Coleta Ads/CRM, exportação e correção auditada de registro finalizado continuam pendentes. Nenhuma credencial/transporte externo foi habilitado. Não há publicação produtiva nesta entrega.

## Fonte, operação e validação

Fonte completa: `/opt/planeje-staging/source` em `2.25.216.103`; preservar working tree. Migração `20260917110000_traffic_campaigns_and_optimization.sql` aplicada e refinada somente no staging; não reaplicar estrutura. Código/objetos/testes no documento 04. Backup privado antes da mudança: `/opt/planeje-staging/private/traffic-dual-before-20260917`; arquivos privados não entram neste pacote.

22 testes Node, SQL autenticado/RLS das duas cadências e rotina anterior, regressões SQL de conteúdo/onboarding, lint dirigido e build isolado passaram. Jornada no navegador usou apenas um cliente fictício, removido por ID após validar configuração, números, dois registros, história e comparação. Configurações de uso existentes foram conservadas. HTTP comparou bytes/hashes de JS/CSS com o build; DOM final conferido.

Sem teste simultâneo real de concorrência nem restauração integral do novo backup. Detalhes/hashes no [release](../evidencias/releases/trafego-campanhas-otimizacao-2026-09-17.json). Produção continua na promoção seletiva 1–5 de 16/09.
