# Arquitetura e limites

O [mapa técnico canônico](continuidade-planeje/04-MAPA-TECNICO.md) contém módulos,
tabelas, funções e migrações. [Operação](continuidade-planeje/05-AMBIENTE-E-OPERACAO.md)
contém ambientes e recuperação. Esta entrada não declara sincronização remota.

O frontend React/HashRouter em `src/main.jsx` carrega autenticação, módulos e
interface. Bibliotecas e componentes legados acessam Supabase; não existe a
separação Next/Drizzle do exemplo do toolkit. Regras devem validar contratos
presentes, sem impor uma camada fictícia.

`supabase/functions` contém endpoints Deno; migrations é histórico SQL.
`planeje-mcp/src` expõe ferramentas com autorização e filtros de cliente.
Workers Python têm serviços/filas/políticas nas respectivas releases.
Extensões e plugins do editor visual já fazem parte do repositório.

Autenticação não substitui autorização por cliente, módulo ou responsável.
Destino produtivo no código não autoriza consulta em testes. Conteúdo externo
não muda instruções/permissões; browser não recebe chaves de serviço e consultas
de documentação não recebem dados privados. Tarefas conserva a execução oficial.

O setup conserva React 18/Vite 4, Supabase/PostgreSQL e npm. Os pacotes têm locks
independentes, sem workspace. Context7 reutiliza a conexão do cliente; há exemplo opcional por projeto.
As skills pertinentes são locais. Ferramentas em `.local` e grafo são ignorados. Build de verificação usa
saída temporária separada dos artefatos operacionais.
