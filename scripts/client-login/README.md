# Verificação do provisionamento de login

`node scripts/clientLogin.test.mjs` valida a apresentação de erros; `node scripts/client-login/compile.mjs <diretório privado>/handler.mjs` compila o handler real substituindo apenas a inicialização Deno e o transporte do SDK.

`test-api.mjs` exige a rede independente `planeje-cs-isolated`, GoTrue/PostgREST reais e as credenciais privadas de teste em `/opt/planeje-cs-integration`. Não executa contra URLs externas. Cria contas/contatos fictícios, cobre login, sessão revogada, isolamento do Mini CRM, conflitos sem alteração de senha, administração da loja e falhas de persistência/limpeza. A loja fictícia usa o identificador fixo exigido pelo esquema legado; o teste exige que ele esteja livre.

A guarda de último administrador impede remover a última conta da loja até no teardown administrativo. O executor do ambiente isolado deve limpar essa loja em transação, conferindo banco `cs_integration`, nome fictício e todos os membros com e-mails `fixture-client-*` antes de suspender somente essa guarda durante a exclusão. A transação deve restaurá-la e conferir zero contas/lojas fictícias restantes. Nunca executar essa limpeza na produção. Não registrar credenciais nos relatórios.
