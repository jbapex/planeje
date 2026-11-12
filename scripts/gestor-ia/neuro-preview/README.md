# Prévia local Neuro / Gestor IA e atribuição

Execute na raiz deste checkout, com as dependências existentes e PostgreSQL local no `PATH`:

```sh
./planeje-mcp/node_modules/.bin/tsx --test --test-concurrency=1 scripts/gestor-ia/routine-mcp.e2e.test.mjs scripts/gestor-ia/attribution-mcp.e2e.test.mjs
./planeje-mcp/node_modules/.bin/tsx scripts/gestor-ia/neuro-preview/server.mjs 4395
```

Use `4396` se `4395` estiver ocupada. Não é necessário encerrar as prévias existentes em `4392` ou `4394`. A prévia de atribuição abre em `http://127.0.0.1:4395/gestor-ia/rotina?semana=2026-11-09`. O processo imprime também a URL do editor, os PIDs e o diretório temporário do banco. A interface usa um build estático em `/tmp`; não depende de HMR ou da otimização dinâmica de dependências. A inicialização confere por HTTP a página, os arquivos JavaScript/CSS e a API local antes de anunciar a URL.

O ensaio registra as ferramentas reais de `registerPlanejeTools`, usa o protocolo MCP em memória, o SDK Supabase instalado e PostgreSQL descartável. O loader `verify-attribution-database.py --schema` reutiliza o bootstrap da rotina e aplica as migrations canônicas atuais, incluindo a atribuição. A interface é o `GestorIaWorkspace` atual; os leitores reais consultam o mesmo banco. O adaptador PostgREST local aceita apenas tabelas e RPCs da demonstração, incluindo a sobrecarga de quatro argumentos do leitor de leads. O quadro de entrada usa um modelo SQL sintético; o histórico de semanas usa a função canônica.

O cenário prova: IA salva rascunho e mantém a tarefa pendente; a sessão humana autentica e valida pelo `save_traffic_weekly_review`; a IA fica bloqueada depois da validação; a edição humana reabre a semana e a tarefa; o MCP volta a salvar rascunho. O estado final para revisão é `rascunho_ia`. Também confere coorte, telefones mascarados, agendamento pelo CRM, confirmação na conversa e leads sem vínculo Meta.

Nas portas `4395` e `4396`, a fixture reproduz apenas os agregados conhecidos da semana `2026-11-09`, medidos em `12/11`. Primeiro confirma o snapshot inicial: 70 entradas, quinze pares de nomes, catorze vínculos inequívocos nas nove linhas da revisão e um par fora dela; vinte agendados, sendo catorze novos e seis antigos. Depois acrescenta oito entradas e dois agendamentos inteiramente sintéticos: um novo e um antigo. A prévia fica no snapshot atualizado de **78 entradas e 22 agendados, sendo quinze novos e sete antigos**. Os quinze pares de nomes e catorze vínculos na revisão permanecem iguais; quatro agendados têm vínculo por nome e dezoito permanecem sem vínculo.

Nenhuma entrada tem o par de IDs campanha/conjunto; os catorze vínculos aparecem pelo nome. Contatos, nomes de campanhas e conjuntos, anúncios, telefones, mensagens e gastos são inventados. O aviso da interface informa que nenhum dado real foi carregado. A análise salva documenta o snapshot inicial, enquanto a consulta de leads mostra o snapshot atualizado.

O E2E adicional confere os dois modos, a igualdade entre os leitores UI e MCP, máscara antes da rede, modo inválido, conjunto inexistente e ausência de escrita nas consultas. Prova os snapshots inicial `70/20` e atualizado `78/22`. Ensaios separados acrescentam uma combinação ambígua entre contas e uma origem pausada antiga com gasto semanal zero. Esses ensaios são descartados; não alteram os agregados da prévia principal. Os dois cenários exercitam o mesmo ciclo de rascunho IA e validação humana.

O cenário anterior permanece disponível explicitamente em `4393` ou `4394` e no teste `routine-mcp.e2e.test.mjs`. Ambos os cenários recebem o schema atual. Somente a fixture usa a data `2026-11-16`. Sessão e chaves são valores artificiais exclusivos da prévia. Nenhum arquivo de ambiente, DSN ou transporte produtivo é lido. A interface bloqueia rede externa por `fetch` e CSP; PostgreSQL escuta apenas num socket privado em `/tmp`.

O banco permanece disponível enquanto o processo está vivo. `Ctrl+C` encerra a prévia e apaga somente o cluster e o build temporários criados por ela. Reiniciar executa o cenário novamente e oferece outro rascunho. Inspeção visual e aceite humano são etapas separadas deste teste automatizado.

Para diagnosticar a interface preservando um banco de atribuição já aberto, `node scripts/gestor-ia/neuro-preview/static-server.mjs /tmp/planeje-neuro-IDENTIFICADOR 4396` anexa somente um socket privado criado por este ensaio. Encerrar esse processo auxiliar apaga seu build e preserva o banco pertencente ao processo original. O servidor não encerra processos de outras prévias se uma porta já estiver em uso.

Os testes do compositor Meta usam a fixture de código versionada `../fixtures/meta-ads-api-runtime-baseline.ts.txt` (SHA-256 `29f9a787d3255e2b858eaa0b718c1e11b8c011e7a0cd00d75b128520ee687e38`), sem credenciais ou dados. A operação real exige captura privada e conferência do runtime vigente; a fixture não é um pacote para promover.
