# Assessoria em quadro por etapa

14/10/2026 — LOCAL, NÃO PUBLICADO. Josias rejeitou a lista da captura das 18h59 e escolheu explicitamente **“Colunas por etapa, como um quadro de trabalho”**. A escolha autoriza o formato; não representa aceite visual da implementação nem publicação.

## Alteração

- A aba Assessoria passa a um quadro com A fazer, Planejamento, Aprovação e Execução. Concluídos e Pausados têm filtros próprios com contagem. As etapas são as existentes em `projetos.status`; nenhuma etapa operacional paralela foi criada. Etapas antigas desconhecidas aparecem em Outras etapas, sem ocultar projetos.
- Cabeçalho compacto, sem o slogan anterior. Colunas com fundo neutro, cartões brancos com borda/sombra visível, laranja/rosa/roxo da paleta existente. Foto/iniciais e nome do cliente recebem destaque; nome do projeto, tipo da assessoria e período ficam em segundo nível.
- Cartão mostra próximo passo salvo, próxima revisão, ações concluídas e pendências: estratégia, ações a definir, ações sem tarefa, tarefa sem prazo/responsável, material aguardado e integração a conferir. Cálculo reaproveita `consultingGaps` e `consultingProgress`; só considera tarefas do mesmo projeto e respeita status terminal personalizado. Dependência do material continua pendente mesmo se a tarefa foi concluída sem material pronto.
- **Mover para…** usa o mesmo `handleUpdateProjectStatus` já existente. Administrador/superadmin ou proprietário do projeto pode mover; servidor continua aplicando as validações do plano. Falhas mantêm a etapa anterior e são avisadas; ações ficam desabilitadas durante a solicitação. Não há arraste nesta revisão. Concluir não é inferido por porcentagem, prazo do contrato ou calendário.
- **Excluir** permanece visível para administradores, separado do link de abertura e com a confirmação já implementada. A exclusão não mudou nesta revisão e nenhum projeto real foi apagado.
- Busca por cliente/projeto ignora acentos; filtro por etiqueta mantém Ápice Noivas/JB Apex. Contagem dos filtros considera busca/operação em todos os estados. O período inteiro do contrato permanece no mesmo projeto.
- Quadro com rolagem horizontal limitada ao próprio contêiner, foco por teclado e indicação no celular; filtros e cabeçalho se ajustam à largura. Concluídos/pausados dispõem seus cartões em grade. Estados vazio/carregamento e identificação acessível dos controles incluídos.

## Arquivos

`ConsultingProjectsHome.jsx`, novo estilo isolado `ConsultingProjectsBoard.css`, novo seletor de apresentação `src/lib/consultingBoard.js` e duas props adicionadas em `Projects.jsx`. Nenhuma alteração ao editor, mapa, API simulada, banco, autenticação ou exclusão.

`ProjectsSimpleHome.jsx`, `ProjectsMonthlyKanban.jsx`, `ProjectsOperationalPanel.jsx`, `consulting.css` e `scripts/cs-preview/api-fixture.js` mantêm exatamente os hashes anteriores à revisão. Os dados fictícios não foram reiniciados por alteração da fixture nem por recarga solicitada pelo agente.

## Validação e limites

- 13 testes/subtestes Node em cinco arquivos passaram: sete novos casos de quadro e seis casos existentes de assessoria/métricas/exclusão. Cobrem separação do tradicional, período contínuo, busca/etiqueta, acesso a concluídos/pausados, etapas desconhecidas, tarefas de outro projeto, status terminal personalizado e dependência do cliente. Sem mutação dos dados de entrada.
- Build completo do frontend e build da prévia passaram. Os avisos de tamanho de bundle continuam. Builds isolados em `/tmp/planeje-cs-board-20261014`, sem publicação.
- Servidor da prévia, componente e CSS atualizados responderam HTTP 200. Houve erro transitório de importação enquanto o novo CSS ainda estava sendo escrito; após a criação ambos os módulos e os builds passaram.
- Conferência visual/renderizada e interação no navegador **não realizadas nesta revisão**: política do navegador havia bloqueado abertura automática; nenhuma superfície alternativa foi usada. A captura do usuário comprova o desenho rejeitado, não o novo quadro. Testes de regras e compilação não substituem aceite visual.
- Não se repetiu SQL: não houve mudança de banco. Os 110 testes locais de exclusão são evidência da revisão anterior, não nova execução. As duas migrações CS continuam pendentes de validação no candidato completo e aplicação autorizada.

Prévia: `http://127.0.0.1:4318/projects?model=consulting`. Recarregar reinicia dados fictícios; a alteração usa atualização local do Vite. Antes de publicar, reconciliar produção `47519cec` / `2731d631`, validar candidato completo/API, conferir a interface e obter autorização. Atlas segue pausado. Registro específico: `../evidencias/releases/apice-cs-quadro-2026-10-14.json`.
