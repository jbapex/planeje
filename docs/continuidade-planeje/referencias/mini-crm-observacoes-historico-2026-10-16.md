# Histórico das observações do Mini CRM

Publicado em 16/10/2026 às 20h27 (São Paulo), após Josias pedir escrever/salvar uma observação, abrir o histórico por um ícone no campo e manter a última observação visível.

O mesmo editor aparece na ficha do lead, no painel de dados do Kanban e no Follow-up. Na Grade, a última nota e o ícone abrem o editor. **Nova → escrever → Salvar observação** cria um registro; também é possível substituir o texto atual e salvar como nova entrada. O botão de histórico abre a lista ali mesmo, com data em São Paulo e nome da conta autenticada que gravou. A última observação continua em `mini_crm.observacao`, para listas/busca e consumidores existentes. Outros campos conservam o salvamento automático.

Digitar não cria entradas. Rascunho, falha e repetição são explícitos; trocar abas e fechar/reabrir na mesma página conserva o texto não enviado. Cancelar observação restaura a última salva. Ctrl/Cmd+Enter salva e Enter permite quebra de linha. O rascunho fica na memória da página, não oferece recuperação após recarregar/navegar para outra página. O histórico carrega por páginas de 20 com Carregar mais e evita IDs repetidos entre páginas.

## Dados e acesso

Tabela `mini_crm_observation_history`, índice por cliente/contato/data, índices das referências e RLS com as mesmas condições atuais de cliente, módulo, contato e sessão. Usuários têm somente leitura direta; inserir, reescrever ou apagar entradas diretamente é recusado. Trigger privada captura mudanças da observação usando autor e horário do servidor, incluindo os editores antigos e alterações do sistema. A função pública `mini_crm_save_observation` usa SECURITY INVOKER, bloqueia o contato e reutiliza o patch existente; uma UUID por intenção permite repetir uma tentativa sem duplicar ou sobrescrever uma nota posterior. A fila no navegador é compartilhada com os patches dos demais campos.

A observação anterior à entrega é mostrada como **Observação anterior / Data não registrada / Autor não registrado**. Na primeira substituição, o texto anterior é preservado atomicamente no histórico. Não se atribui o horário de uma importação à redação da nota; não houve preenchimento em massa ou alteração dos contatos reais na instalação. O autor é uma fotografia do nome do perfil autenticado; mesmo se a conta for removida, a identificação textual permanece. Ao usar um login compartilhado, esse login é o autor registrado. Gravações sem usuário autenticado são identificadas como atualização do sistema. Limite de 10 mil caracteres para novas notas; os textos anteriores são preservados. Uma limpeza pelo editor antigo também fica registrada.

Não há mudança comercial nem de automação por salvar uma nota. Os status, datas, vendedores, qualificação, valor, atribuição e textos anteriores são preservados. Sem envio de mensagem, IA ou conversão real pelo agente.

## Validação e release

56 verificações de API/Auth/RLS na rede CS isolada passaram: autor/data, cliente próprio pendente, outro cliente, módulo desabilitado, anônimo, sessão revogada, equipe autorizada, adulteração, repetição, texto idêntico em nova intenção, retry antigo após nova nota, duas notas e outro campo concorrentes, editores anteriores, limpeza, limite, paginação e preservação do nome após remover a conta fictícia. Fixtures foram removidas. Treze verificações de RLS/ACL/search_path/índices passaram no CS e produção. Documentação/changelog Supabase consultados; grants explícitos, schema privado fora da API e proprietário Postgres conferidos. O auditor SQL foi usado para o self-hosted, sem executar advisors contra um projeto cloud diferente.

Cinco scripts de regressão e build Vite completo no Mac passaram. Navegador com componente real/adaptador fictício: campo/legado, salvar duas notas, não gravar ao digitar/trocar aba/fechar, reabrir rascunho/cancelar, falha/repetição, Grade após reload, Follow-up e tela CSS 390×844 com texto multilinha/Ctrl+Enter passaram. Viewport restaurado. Produção: HTTP e bytes novos/anteriores, recusa anônima ao histórico e serviços ativos conferidos; sem teste com gravação real ou navegador autenticado produtivo.

Migração `20261016231229_mini_crm_observation_history.sql` aplicada **uma vez no CS e uma vez em produção; não reaplicar**. Observações reais iguais antes/depois da instalação, zero entradas de histórico na instalação. Assets `index.3d7f4fb2.js` / `index.4f764e24.css`, conserva `index.e72fc152.js` / `index.b251e8bf.css`. Cinco fontes de produto (inclui SQL) e um script de API promovidos, com guarda dos 1.638 arquivos anteriores; lista seguinte contém os novos caminhos em `source-keys-next.json`. Fonte produtiva completa preservada, CS/Assessoria não publicados. Sem restart ou ambiente alterado. Nova base frontend `/root/planeje-releases/mini-crm-notes-20261016-01/candidate`; webroot `/var/www/planeje`; backend Atlas permanece na candidata anterior. Primeiro uso/aceite de Josias pendentes.

![Demonstração no computador](../evidencias/mini-crm-observacoes-demonstracao-2026-10-16.png)

![Demonstração no celular](../evidencias/mini-crm-observacoes-celular-2026-10-16.png)
