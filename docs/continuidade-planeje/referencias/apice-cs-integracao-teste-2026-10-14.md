# Assessoria — teste integrado e persistente

14/10/2026 (horário de São Paulo). **Disponível apenas no ambiente de teste; não publicado em produção.**

## Escopo autorizado e entregue

Josias escolheu clientes fictícios editáveis e consulta aos dados reais sem alterá-los. A implementação usa o aplicativo completo, autenticação, banco, permissões, arquivos privados e tarefas reais do ambiente de teste. A prévia visual anterior na porta 4318 continua separada e não foi reiniciada.

- Assessoria pode criar uma demanda de Tráfego usando `create_traffic_demand`; o plano e a operação apontam para **a mesma tarefa**, com o mesmo responsável, prazo e status. O novo `cs_action_traffic_task` é invoker, valida acesso/cliente/plano, serializa por projeto e evita duplicação. Campanhas específicas continuam em seu fluxo existente e podem ter a tarefa vinculada. Concluir tarefa não comprova publicação, recebimento ou validação CAPI.
- A visão geral da Assessoria consulta os registros originais de `traffic_weekly_reviews`, pelo cliente e mês de início da semana, sem gerar rotinas ao consultar. Exibe análise, atualização, estado e links para revisão/tarefas. Atualiza ao retornar à janela ou pelo botão Atualizar. Ausência de dados não vira zero.
- A revisão abre com cliente, semana, tipo e id; `assessoria` conserva a origem. O retorno só aparece após consultar um projeto de assessoria acessível do mesmo cliente. O contrato pode continuar no mesmo projeto; não foi criado outro motor mensal ou encerramento automático.
- Histórico usa documentos/versões/anexos privados existentes. CRM mantém a distinção entre movimento do mês e contatos originados no mês.
- A consulta real é uma **fotografia datada**, não sincronização contínua: Casa D Noivas e Marbô Noivas. Guarda somente projetos, tarefas da janela, análises e títulos de documentos. Nenhuma conversa, arquivo real, senha, token ou telefone foi importado. Limites visíveis: últimos 60 dias, até 100 tarefas, 20 revisões e 20 documentos. Os dois clientes reais não existem nas tabelas operacionais editáveis do teste.
- `cs_integration_snapshots` só existe no teste, com RLS e SELECT para a conta proprietária de teste; INSERT/UPDATE/DELETE negados inclusive para essa conta, sem acesso anônimo ou da equipe. O componente é condicionado ao build isolado.

## Ambiente e acesso

- VPS de testes 103: `/opt/planeje-cs-integration`, banco `cs_integration`, rede Docker **interna** `planeje-cs-isolated`, contêineres `planeje-cs-*`, volumes novos. A homologação existente, com seus 43 cadastros, não foi alterada.
- Aplicativo completo: `http://127.0.0.1:4320/#/projects?model=consulting`, por túnel SSH privado no Mac. Reabrir conexão com `scripts/cs-integration/open-test.command`. O script resolve o IP privado do contêiner e não publica um serviço na internet.
- Credenciais fictícias estão somente no arquivo privado `~/.config/planeje/cs-integration/acesso-teste.txt`; não copiá-las para documentação. Arquivo do servidor e segredos são privados. Não usar credenciais de produção.
- Fonte base obtida por leitura do código corrente de produção, incorporando Rastreamento `47519cec`/`2731d631`; sobreposição seletiva dos arquivos CS e integração. Alterações locais independentes de Contatos foram excluídas. Os três componentes tradicionais de projetos são idênticos aos publicados.
- Esquema corrente restaurado **sem dados de clientes/usuários** em banco novo. Somente metadados de versão de Auth/Storage/Realtime importados; credenciais independentes, nenhum `.env` produtivo. Aplicadas apenas aqui: `20261014043345`, `20261014212451`, `20261015020824`. Não reaplicar em produção por inferência.
- Serviços externos/Edge Functions/SMTP bloqueados, rede sem saída, CSP e guarda do navegador limitados à origem de teste. Trigger HTTP de notificação de tarefas desativado apenas nesta base; cron não executa. Não há worker Atlas neste ambiente. Produção e Atlas permanecem inalterados.

## Exemplos para percorrer

Ateliê Aurora e Studio Horizonte são fictícios e identificados como tal. Há dois planos de assessoria de seis meses, um projeto tradicional, uma campanha de planejamento fictícia, tarefa de rastreamento em Tráfego, solicitação de material da equipe, revisão semanal, documento com versões/anexo e três contatos fictícios no CRM. A venda do exemplo vem de um contato do mês anterior, para evitar confundir aquisição com fechamento.

1. Abrir Ateliê Aurora, observar ações e acompanhamento; abrir a tarefa de rastreamento e alterar prazo/status.
2. Voltar ao plano; conferir a mesma tarefa. Abrir a análise da semana, editar e retornar pelo link da assessoria.
3. Abrir Histórico, salvar uma revisão/anexo e consultar versões.
4. No acompanhamento, consultar CRM: dois agendamentos em outubro e uma venda originada em setembro; não somar as duas leituras como vendas distintas.
5. Na lista de Assessoria, expandir a consulta real. É leitura de uma captura, sem botões de edição nem vínculo ao cadastro fictício.

## Verificações e limites

- 30 testes Node (quadro, plano, exclusão, rotas/período e integração) passaram.
- 60 verificações pela API real do ambiente passaram: autenticação/sessão, permissões, tarefa única concorrente, mudanças de prazo/status, revisão com conflito, isolamento entre clientes, documentos/versões/Storage, exclusão preservando tarefa, bloqueio de escrita na fotografia real, novo login e bloqueio externo.
- Mais cinco verificações do CRM/projetos passaram: datas de agendamento, venda de coorte anterior, ausência de dupla contagem e preservação de projetos tradicionais.
- Persistência conferida após reiniciar o banco isolado, preservando contagens de clientes/projetos/tarefas/revisões/documentos e fotografias reais.
- Atualização de tarefa recebida por conexão autenticada em tempo real após restaurar os metadados de versão do Realtime. A conexão e os dois slots de replicação pertencem somente ao banco isolado.
- Build completo e HTTP do aplicativo/guarda passaram. Bundle grande é aviso já existente; não foi otimizado nesta entrega.
- Conferência visual interativa deste candidato ainda pendente: controle do navegador foi recusado anteriormente por política de URL; não houve contorno por outra ferramenta nem alegação de teste visual. Aceite de uso de Josias não foi inferido.
- Integrações externas são deliberadamente indisponíveis no teste. Esta entrega comprova fluxos internos testados, não ausência absoluta de interrupções, automação integral de CS nem execução de campanhas reais.

Produção segue `index.47519cec.js` / `index.2731d631.css`, conferidos por HTTP. Nenhuma publicação, migração produtiva, mensagem WhatsApp/e-mail ou evento CAPI enviado. Publicação futura exige revisão do candidato e autorização específica.
