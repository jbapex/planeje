# CRM Ápice: publicado e ativo para Impacto Noivas

## Resultado e autorização

Josias respondeu “pode” ao pedido explícito de publicar o bloco e ativar Impacto nas VPS87/109, incluindo a configuração nova no banco. Publicação frontend às17h17 e primeira sincronização às17h18 de05/11/2026, fuso São Paulo. Aceite humano de uso continua separado.

Rastreamento > selecionar Impacto Noivas > Integrações > CRM Ápice. Conexão já testada e ativada; a tela oferece Pausar sincronização, Sincronizar agora e última execução. Em Leads, os status aparecem como CRM-Apice na coluna Etiqueta. Pode ser necessário recarregar a página para receber o bundle novo.

A primeira carga leu8.685 registros do CRM e11.920 registros do Planeje. Atualizou10.708 registros:5.063 contatos e5.645 leads, correspondendo a5.063 telefones distintos. Preservou282 registros de131 telefones com status conflitante/vazio;930 registros sem correspondência também ficaram sem alteração.124 registros de origem tinham telefone inválido. Essas categorias são contagens de registros, exceto quando indicado telefone.

O ciclo automático seguinte,17h19, confirmou10.708 inalterados e zero regravações. Nova leitura independente também produziu zero alterações pendentes. Apenas Impacto está configurada e habilitada. Cada consulta fica elegível cerca de um minuto após a anterior; processamento e fila somam tempo.

## Instalação

- Origem87: `/root/supabase/docker/volumes/functions/planeje-status-export/`, index.ts/handler.mjs e config.json privado0600, diretório0700. Organização fixa previamente conferida. API pública exige JWT anon existente e chave própria; chaves administrativas permanecem na origem.
- Destino109: migração `20261105190000_crm_apice_sync_control.sql` aplicada **uma vez**, SHA256 `96937699aa17ef0c9b8fcd440e5703a138fde61ca9c11a4c12edfe81d5827365`. Duas tabelas privadas e RPC de controle; não reaplicar. A instalação não possui supabase_migrations.schema_migrations; recibo específico no diretório da release registra aplicação e hash.
- Worker `/opt/planeje-crm-status-sync`, configuração root0600 em `/etc/planeje-crm-status-sync/gateway.json`, diretório0700. Serviço oneshot e timer `planeje-crm-status-sync` instalado/ativo/habilitado. Configuração da loja e segredo ficam na tabela privada; arquivo global contém somente JWT anon do gateway.
- Frontend: `/root/planeje-releases/crm-status-interface-20261105-01/candidate`, base `google-hidden-default-20261105-01`. Overlay de dois JSX,1.797 fontes conciliadas, perfil produtivo herdado no servidor. Main `index.f2a5053c.js`, CSS `index.80eb966f.css`. Assets antigos preservados; HTML promovido atomicamente.

Primeiro teste da origem revelou NotFound ao ler config.json fora do grafo do bundle. Correção: import JSON com atributo with, conferido no Edge1.71.2. Primeiro comando de configuração revelou que postgres não é superuser nesta instalação; o worker root passou a usar supabase_admin local para definir log_error_verbosity somente na sessão. Não foram alterados grants, logging global ou autenticação. Ambos corrigidos e revisados antes de ativar a sincronização.

## Verificação

6 testes Node,19Python,53 verificações PostgreSQL descartável e22React.24 testes do publicador locais e24 na VPS. Cinco regressões de Rastreamento/Mini CRM e build produtivo passaram na candidata. Revisões independentes sem achados materiais abertos; relatórios privados em `/tmp/planeje-crm-ui-review-2026-11-05.md`, `/tmp/planeje-crm-status-bootstrap-review-2026-11-05.md` e `/tmp/planeje-crm-status-database-role-review-2026-11-05.md`.

API real:401 para chave ausente/incorreta,200 para chave válida, escopo e completude conferidos. RPC anônima recusada401/código42501; RLS ativa, nenhum acesso direto anon/authenticated às tabelas privadas, resposta de controle sem segredo. Ator ativo de Josias usado na chamada administrativa da mesma RPC. Configuração testada antes da ativação; simulação fresca e cópia privada dos campos anteriores mantida somente no destino.

Leitura pós-carga confirmou5.063 contatos e5.645 leads com status externo alterado. Timer executou novamente sem comando manual e sem regravações. Os cinco serviços Atlas permaneceram ativos, unidades/runtime destino preservados. MCP permaneceu online no PM2, iniciado em30/10. Edge da origem não reiniciado. Cinco URLs HTTP e hashes da versão nova, assets anteriores e escritório conferidos.

## Limites e recuperação

Navegador local foi recusado pelas configurações do Codex; não houve contorno. Layout, teclado e experiência visual real ainda não foram inspecionados. Testes de componente/build não substituem esse aceite. Não foi criada uma mudança fictícia de status no CRM real; primeira carga e ciclo automático usam os dados existentes.

Conflitos e status vazios não são resolvidos por inferência. Apagar status no CRM conserva o último espelhado. A ligação é CRM → Planeje; não altera Kanban interno, qualificação, compra, campanhas, mensagens ou tarefas. Outras lojas exigem API/chave próprias e ativação específica. JSON importado é snapshot do módulo: rotação futura precisa recarga e teste, com bundles/caches privados.

Pausar na interface interrompe novos lotes; parar o timer interrompe a rotina geral. Preservar os status recebidos. Não executar o CLI antigo --apply como rotina paralela. Não restaurar status automaticamente: cópia privada de11.920 linhas com IDs/campos externos está em `before-impacto-status.json`,0600, na release de destino, e qualquer restauração deve comparar mudanças posteriores. Não remover o esquema privado compartilhado nem reaplicar SQL. Rollback frontend exige conferir hashes/concorrência e manter os assets existentes.

[Evidência sem segredos](../evidencias/releases/crm-status-interface-producao-2026-11-05.json) · [Contrato local anterior](crm-status-interface-local-2026-11-05.md) · [Operação](../../../scripts/crm-status-sync/README.md).
