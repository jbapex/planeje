# Gestor IA — entrega local de consulta

Entrega inicial em 06/11/2026 e revisão visual em 07/11/2026. Implementação local, com publicação e aceite humano pendentes.

## Comportamento

A entrada Gestor IA no rodapé da lateral abre `/gestor-ia/metricas`; no celular aparece em Ver mais. A rota irmã tem layout, navegação, estado e CSS próprios. Sair do modo volta à Caixa do Planeje. Links, recarga e histórico seguem a rota; cliente, conta e janela ficam nos parâmetros. A comparação visual com as quatro telas do ScaleOS orientou a barra de filtros, a tabela da carteira, o quadro de decisões, o seletor de relatórios e os cabeçalhos compactos. A indicação do modo de consulta fica ao lado do título. A identidade continua Planeje.

- Métricas: detalhe Meta somente para administração, mantendo a restrição da tela atual; demais perfis veem resumo autorizado já salvo, com sua janela original. A conta exibe seis indicadores, minigráficos derivados da série diária e dois gráficos com métricas selecionáveis, valores por dia, tabela acessível e comparação com a janela anterior de igual duração. Campanhas, conjuntos e anúncios têm busca, filtros, ordenação, colunas, paginação e detalhes. O seletor de nível mostra a contagem de itens retornados. As colunas iniciais destacam a métrica do cliente e seu custo. Falhas não viram zeros; leituras parciais são identificadas. Nenhum resumo é persistido.
- Carteira: tabela de clientes autorizados com busca por cliente ou conta, filtros de pendências e vínculo, e valores identificados pela janela do resumo salvo. A lista tem períodos de 7, 14 e 30 dias para exibir resumos salvos cuja janela cabe no recorte, grupos de atenção ou gestor, menu por cliente, colunas selecionáveis e reordenáveis, paginação e página de contas em `/gestor-ia/carteira/contas`. O cliente abre em página própria em `/gestor-ia/clientes/:clientId`, com abas Métricas, Contas e BM, Metas, Decisões, Relatório e Memória. A volta à Carteira preserva busca, filtros e colunas na URL. Métricas e Contas e BM compartilham a leitura da conta e do período durante a alternância entre as duas abas. A página exibe vínculos e metas cadastrados, e usa o resumo salvo e as tarefas existentes para os sinais do cliente. A política `canViewField`, inclusive exceções individuais, controla projeção e apresentação. Mudança das permissões invalida o estado anterior.
- Decisões: quadro filtrável por cliente, texto e origem, com ordenação e detalhe lateral, com sinais da regra determinística do Planeje e tarefas oficiais nas colunas A fazer, Em andamento e Concluídas, conforme o status existente. Fonte indisponível não representa ausência de problemas. Não existe novo motor de execução, aprovação ou conclusão.
- Relatórios: tabela de análises semanais por cliente e período. A linha abre a análise registrada. O seletor alterna entre análises e evolução semanal. O Relatório do cliente exibe cartões por semana, filtros de estado e painel lateral de leitura. Não confundir esses valores com conversões Meta ou a evolução semanal com uma série diária. A fonte não identifica de forma confiável autoria humana/IA.

## Conferência da Carteira no ScaleOS

A inspeção de 07/11/2026 percorreu a Carteira, a página de Contas e as seis abas de um cliente na sessão do usuário. Foram verificados os seletores, menus e a abertura dos painéis de metas, vínculos, decisão e agenda. A inspeção registrou o comportamento visível e a composição, incluindo título de 22 px, cabeçalhos da carteira de 13 px e linhas de 14 px. Execução de IA, edição, envio, compartilhamento e troca de vínculos estão fora do recorte de consulta.

| Tela | Comportamento observado | Equivalente na prévia |
| --- | --- | --- |
| Carteira | Período, busca, filtros de atenção/metas/conta/acesso, agrupamento por BM, colunas, menu da linha e paginação. | Período dos resumos salvos, filtros pelos dados existentes, agrupamento por gestor e menu com cliente, metas e contas. A ordem e a visibilidade das colunas ficam na URL. |
| Contas de anúncio | Página própria, busca, filtros de vínculo/entrega e grupos por BM. | Página própria dos vínculos autorizados, busca por nome, ID ou cliente e agrupamento por plataforma ou cliente. |
| Métricas | Leitura expansível, conta e período, comparação, indicadores, dois gráficos, pendências e tabela de anúncios. | Leitura do resumo salvo, filtros e comparação da conta selecionada, indicadores e detalhe das pendências. A meta de custo usa o campo correspondente e a mesma moeda. |
| Contas e BM | Vínculos e estrutura conta → campanha → conjunto na janela de Métricas. | Contas cadastradas e árvore de entrega da mesma leitura Meta, com expansão por campanha. |
| Metas | Cartão de custo, resultado e verba, com progresso e formulário de configuração. | Cartão das metas cadastradas, resultado do resumo e uso do limite no recorte salvo quando a moeda permite comparar. |
| Decisões | Busca, responsável, tipo, ordem e quatro estágios. A decisão abre em painel lateral com a fonte do sinal. | Busca, origem, ordem, sinais e etapas das tarefas existentes, com painel lateral que explica a origem e mostra o resumo usado. |
| Relatório | Arquivo por período, filtros de entrega e abertura do artefato, com agenda em painel separado. | Arquivo de análises semanais por período e estado real do registro, com painel lateral de leitura. |
| Memória | Notas, janela de compartilhamento e integração do resultado de CRM. | Contexto autorizado do cadastro, janela do resumo e resultado registrado na rotina de tráfego. |

Os dados atuais do Gestor IA no Planeje cobrem vínculos de clientes autorizados e uma conta Meta por leitura. BM, saldo, contas livres, consolidação de várias contas, agenda de IA, relatórios publicados, compartilhamento e resultado do CRM têm fontes e fluxos próprios que ainda não estão integrados a esta prévia.

## Isolamento e integração

Novos arquivos ficam em `src/components/gestor-ia`. Alterações antigas de produto limitadas a App, Sidebar e BottomNav: uma rota protegida e entradas adicionais. MainLayout, páginas antigas, serviços, banco, autenticação, provedor/modelo, automações e regras não foram alterados.

O adaptador aceita equipe ativa com `paid_traffic`, usa a sessão existente e revalida cliente pela RPC estável `central_trafego_can_access_client`. Detalhe Meta confirma vínculo ativo da conta antes das duas ações Edge permitidas, `get-campaigns` e `get-campaign-insights`. Os ramos consultam a Graph e não persistem resumos. Totais e série diária são consultas separadas e o subtotal de campanhas nunca é comparado ao total da conta. Consultas de tabelas são somente SELECT e paginadas. Análises conservam filtros de cliente/período e RLS. Respostas antigas são descartadas ao mudar identidade, permissões, cliente ou janela.

Não há criar, editar, aprovar, dispensar, concluir, enviar, conectar, sincronizar com escrita ou gerar IA. A área não monta componentes antigos com autosave. Dados reais são a fonte de execução normal; a prévia de QA usa somente dados fictícios.

## Verificação

Node20.20.2, dependências instaladas e lockfiles preservados:

```sh
node --test scripts/gestor-ia/data.test.mjs scripts/gestor-ia/metrics.test.mjs
node scripts/gestor-ia/component.test.mjs
npm run test:local
node node_modules/eslint/bin/eslint.js src/components/gestor-ia src/App.jsx src/components/layout/Sidebar.jsx src/components/layout/BottomNav.jsx
npm run build:check
```

Passaram 17 testes Node do adaptador e do modelo, 51 verificações React, lint dos componentes e build temporário. A revisão independente encontrou uma comparação entre escopos diferentes e falha na série com datas aceitas mas ainda não normalizadas. Ambos têm regressão e foram corrigidos. A suíte local, executada na versão anterior ao ajuste visual, passou 83 testes Node, dois scripts de Tráfego e 107 testes MCP.

A prévia isolada usa `scripts/gestor-ia/preview/vite.config.mjs`, porta 4392, envDir vazio e adaptadores fictícios. O fetch bloqueado mantém o QA isolado. O navegador conferiu as seis abas, o arquivo de análises, os menus e painéis laterais, as colunas da carteira, a troca de conta, a janela compartilhada e a hierarquia da entrega. A verificação de interface usa dados fictícios. O teste React usa React 18.2 e react-test-renderer do runtime QA existente em `/tmp/planeje-crm-ui-qa`.

## Limites e próximo aceite

Não foram consultadas integrações produtivas pela nova tela, executadas migrações, gerada IA paga ou feita publicação/push. Validar a sessão efetiva, o contrato e as permissões realmente implantadas antes de publicar. O endpoint Meta legado usa cliente administrativo e não demonstra revalidação interna de ACL nos ramos de leitura usados pelo Gestor IA; a checagem no frontend não certifica proteção contra chamadas diretas. A função ficou intacta nesta entrega e esse limite herdado exige avaliação própria antes da publicação.

A integração pode limitar a estrutura de anúncios e a série diária. A tela informa o subtotal de campanhas quando os totais de conta estão indisponíveis, sinaliza a série parcial e identifica moeda ausente. Métricas Google detalhadas, novas sugestões persistidas, orientações editáveis, aprovações, envios e automações ficam para evolução autorizada.

O repositório original tinha extenso trabalho local posterior a HEAD. O desenvolvimento usou cópia do working tree atual, sem credenciais e sem Git destrutivo. Integração conferida por SHA-256 dos arquivos anteriores e comparação somente dos arquivos desta entrega. Nenhum commit automático foi feito no repositório sujo.
