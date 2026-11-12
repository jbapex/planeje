# Exclusão de projetos de assessoria

14/10/2026 — LOCAL, NÃO PUBLICADO. Pedido explícito de Josias: “Tem que dar para excluir”. Substitui a decisão anterior de oferecer apenas Pausado para assessoria. Não identifica nem autoriza excluir um projeto real durante o desenvolvimento.

## Comportamento

- Administrador/superadmin vê **Excluir** no cartão da aba Assessoria e no cabeçalho do projeto. O botão da lista fica separado do link de abertura, inclusive para teclado/celular.
- A confirmação nomeia o projeto e avisa: projeto, plano e versões serão excluídos permanentemente. Tarefas ficam em Tarefas sem vínculo ao projeto; documentos, reuniões e arquivos permanecem no cliente.
- Cancelar não envia solicitação. Durante a exclusão, botões e fechamento ficam bloqueados para evitar repetição. Falha mantém a confirmação aberta com mensagem. Só um retorno com o identificador correto confirma sucesso. Depois disso caches e rascunho específico são descartados, e a lista é atualizada.
- O fluxo tradicional de exclusão foi preservado. Seus três componentes principais continuam com os hashes da revisão visual anterior.

## Banco e acesso

Migração nova `20261014212451_consulting_project_delete.sql`, criada pela CLI, depende da candidata `20261014043345`. Nenhuma aplicada em produção.

`public.cs_delete_project` é SECURITY INVOKER e confere a visibilidade atual; delega à função privada com SECURITY DEFINER, search_path vazio, verificações de papel ativo e sessão real vinculada ao usuário. A elevação existe só para remover o conjunto confirmado sem abrir DELETE direto no histórico. Anônimo, colaborador, cliente, pendente, banido e sessão expirada/revogada não ganham o direito. Tokens de delegação sem sessão de usuário não bastam. Nome divergente exige nova confirmação. A rotina não atende projetos tradicionais.

A operação bloqueia o projeto, desvincula as tarefas, retira o vínculo atual dos documentos (com versão preservada pelos gatilhos), remove versões/plano e então o projeto. Falhas revertem tudo. O gatilho de vínculo documental usa bloqueio da referência para impedir um documento novo de ficar associado a um projeto excluído concorrentemente. Não são abertas permissões genéricas de apagar versões ou arquivos.

## Evidências e limites

- 110 verificações PostgreSQL 16 descartável: autenticação/perfis, aprovação, versões, documentos, exclusão com dados, rascunho vazio, nome alterado, falha tardia com rollback completo, duas exclusões concorrentes e documento inserido durante a exclusão. Dados sintéticos; cluster removido.
- Seis testes Node em quatro arquivos: contrato da solicitação/retorno, erros, isolamento do tradicional, simulação de exclusão com tarefa/documento preservados, regras e métricas de assessoria.
- Builds completo e da prévia passaram; prévia e API simulada atualizada responderam HTTP 200. A atualização da API pediu recarga automática pelo Vite e pode reiniciar os exemplos fictícios. Nenhum projeto real foi removido.
- Não houve nova conferência pelo navegador nesta revisão; o bloqueio anterior de URL não foi contornado. Validar aparência, Cancelar/Confirmar e uso em notebook/celular permanece pendente. Não apresentar a captura anterior como evidência desta versão.
- CLI instalada v2.75.0 não possui `db advisors`. Permissões foram verificadas pelos testes de catálogo/sessão. Ainda falta candidato no esquema completo com API e análise de segurança antes de publicação.
- Produção vigente `47519cec`/`2731d631` precisa ser reconciliada no candidato. Não publicar o antigo candidato CS. Atlas segue pausado.

Referência técnica consultada: [funções de banco do Supabase](https://supabase.com/docs/guides/database/functions). Evidência com hashes: [release local](../evidencias/releases/apice-cs-exclusao-2026-10-14.json).
