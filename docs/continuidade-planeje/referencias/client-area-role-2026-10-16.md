# Acesso antigo de cliente — 16/10/2026

Ajuste aplicado na produção às 11h33, São Paulo, após Josias informar que o login de cliente abria a equipe interna. Não houve nova alteração de código ou esquema.

A conta usada no teste havia sido criada antes da publicação da correção de provisionamento e ainda estava como colaborador ativo, sem vínculo com cliente. O marcador administrativo confiável confirmava criação por cadastro de cliente; o horário de entrada correspondia ao teste informado. Havia outro login posterior da mesma loja já corretamente classificado como cliente. O cadastro corrigido anteriormente de outro cliente também continuava correto e não havia sido usado no teste. Não se inferiu uma conta interna apenas pelo nome; identidade/data exatas, marcador exclusivo do servidor, contexto confirmado pelo usuário e vínculo de cliente único foram conferidos antes da alteração.

Uma transação com guardas de identidade, horário original, papel/estado, marcador, e-mail confirmado, ausência de membro de loja e cliente exato alterou somente papel para cliente e vínculo da conta antiga. Senha, nome, estado ativo e páginas foram preservados; nenhum outro login foi alterado ou excluído. Backup anterior e operação guardados exclusivamente na release privada.

Leitura pós-operação confirmou seis condições: conta exata, papel cliente, vínculo correto, estado ativo, exclusão dos papéis internos e recusa da ferramenta interna de links WhatsApp. A fonte produtiva vigente já escolhe MainLayoutCliente quando papel=cliente e há vínculo; rota interna cai em /cliente/support. O login específico é /login-cliente; Mini CRM do cliente usa /cliente/mini-crm.

Conferência autenticada em Configurações → Equipe mostrou oito pessoas, quatro colaboradores e ausência do cadastro do cliente. Screenshot real apenas em `.local/client-area-role-20261016/equipe-sem-login-cliente.png`. Nenhuma senha foi solicitada ou lida, nem sessão simulada para testar como cliente real. Usuário orientado a recarregar ou sair/entrar para renovar o perfil carregado. Aceite dessa entrada pendente.

Assets f19ca1d1/8a46408f, banco/esquema, serviços, Atlas e tarefas preservados. Sem restart, migração, envio externo ou alteração operacional adicional. A correção publicada antes continua protegendo novos cadastros; não automatizar conversão de funcionários existentes por metadado editável ou sem contexto confirmado. [Verificações](../evidencias/client-area-role-2026-10-16.json) · [Registro](../evidencias/releases/client-area-role-2026-10-16.json).
