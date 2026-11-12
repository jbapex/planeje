# Prévia local Neuro / Gestor IA

Execute na raiz deste checkout, com as dependências existentes e PostgreSQL local no `PATH`:

```sh
./planeje-mcp/node_modules/.bin/tsx --test scripts/gestor-ia/routine-mcp.e2e.test.mjs
./planeje-mcp/node_modules/.bin/tsx scripts/gestor-ia/neuro-preview/server.mjs 4393
```

Use `4394` se `4393` estiver ocupada. A prévia abre em `http://127.0.0.1:4393/gestor-ia/rotina?semana=2026-11-09`. O processo imprime também a URL do editor, os PIDs e o diretório temporário do banco. A interface usa um build estático em `/tmp`; não depende de HMR ou da otimização dinâmica de dependências. A inicialização confere por HTTP a página, os arquivos JavaScript/CSS e a API local antes de anunciar a URL.

O ensaio registra as ferramentas reais de `registerPlanejeTools`, usa o protocolo MCP em memória, o SDK Supabase instalado e PostgreSQL descartável. O loader `verify-routine-database.py --schema` fornece ACL, normalização, salvamento e migration canônicos. A interface é o `GestorIaWorkspace` atual; os leitores reais consultam o mesmo banco. O adaptador PostgREST local aceita apenas tabelas e RPCs da demonstração. O quadro de entrada usa um modelo SQL sintético; o histórico de semanas usa a função canônica.

O cenário prova: IA salva rascunho e mantém a tarefa pendente; a sessão humana autentica e valida pelo `save_traffic_weekly_review`; a IA fica bloqueada depois da validação; a edição humana reabre a semana e a tarefa; o MCP volta a salvar rascunho. O estado final para revisão é `rascunho_ia`. Também confere coorte, telefones mascarados, agendamento pelo CRM, confirmação na conversa e leads sem vínculo Meta.

São dados sintéticos do cliente de demonstração Impacto Noivas, semana `2026-11-09`. Somente a fixture usa a data `2026-11-16`. Sessão e chaves são valores artificiais exclusivos da prévia. Nenhum arquivo de ambiente, DSN ou transporte produtivo é lido. A interface bloqueia rede externa por `fetch` e CSP; PostgreSQL escuta apenas num socket privado em `/tmp`.

O banco permanece disponível enquanto o processo está vivo. `Ctrl+C` encerra a prévia e apaga somente o cluster e o build temporários criados por ela. Reiniciar executa o cenário novamente e oferece outro rascunho. Inspeção visual e aceite humano são etapas separadas deste teste automatizado.

Para diagnosticar a interface preservando um banco de prévia já aberto, `node scripts/gestor-ia/neuro-preview/static-server.mjs /tmp/planeje-neuro-IDENTIFICADOR 4394` anexa somente um socket privado criado por este ensaio. Encerrar esse processo auxiliar apaga seu build e preserva o banco pertencente ao processo original.
