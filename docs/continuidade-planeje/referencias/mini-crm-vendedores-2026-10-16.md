# Vendedores do Mini CRM — 16/10/2026

Josias relatou não conseguir cadastrar vendedores. Reprodução com o componente real e dados fictícios confirmou: Enter em Novo vendedor submetia o formulário sem incluir o nome digitado. O salvamento bem-sucedido remontava o formulário, apagando o rascunho e mantendo a lista vazia.

Corrigido e publicado: Enter inclui o nome na lista sem submeter a configuração; Adicionar permanece disponível, com nome acessível e bloqueio de campo vazio/salvamento em andamento. Salvar configuração também inclui o vendedor que ainda esteja digitado, sem duplicá-lo por caixa. O painel orienta Adicionar/Enter → Salvar configuração. Nome já existente não cria duplicação; dados e renomeações já existentes seguem o fluxo anterior. Nenhum nome real foi cadastrado pelo agente.

Componente real no navegador fictício: falha reproduzida antes; depois, Enter, botão Adicionar, nome ainda digitado ao Salvar, persistência após recarregar e repetição com caixa diferente passaram. Três vendedores fictícios mantidos exclusivamente no armazenamento local da prévia. Cinco scripts de regressão e build completo no Mac passaram; quatro scripts na candidata remota passaram. Conferência visual em produção da orientação/controles, sem inserir vendedor real, consta na evidência.

Produção: `index.a4b77eda.js` / `index.8ff25961.css`; conserva `7ff25f94` e anteriores. Uma alteração de frontend em MiniCrmConfig.jsx. Incorpora Meta Link/UTMs, copiar configuração do Super Admin, correção do login e todas as entregas produtivas do Atlas. Escritório preservado, serviços saudáveis, Atlas ativo; índice e assets novos/anteriores conferidos por bytes HTTP. Sem SQL, reinício, alteração direta em dados, CAPI ou mensagens.

Candidata produtiva atual: `/root/planeje-releases/mini-crm-sellers-20261016-01/candidate`; cópia local exata em `.local/mini-crm-sellers-20261016/candidate`. Fonte também incorporada seletivamente à candidata CS, sem rebuild ou banco. CS/Assessoria permanece não publicada. Capturas e prévia privadas em `.local/mini-crm-sellers-20261016`. Aceite de uso com vendedores reais pendente.
