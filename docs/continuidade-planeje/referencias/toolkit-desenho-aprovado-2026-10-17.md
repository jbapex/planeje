> Desenho aprovado em17/10/2026, preservado como decisão datada. A configuração da máquina mudou durante a execução. Estado final em [setup](../../setup.md).

# Planeje — desenho de adoção do Vibe Coding Toolkit

Data: 17/10/2026. Estado: **desenho aprovado pelo usuário; implementação em andamento**.

## Objetivo e fonte

Preparar esta raiz existente para desenvolvimento assistido por IA, com instruções encontráveis, ferramentas compatíveis, comandos reproduzíveis, evidências e recuperação. A classificação proposta é **configuração de desenvolvimento de escopo delimitado**: o desenho conserva a arquitetura do produto e divide a adoção em entregas verificáveis. Uma necessidade de reestruturar a aplicação passa a uma proposta arquitetural separada.

Fonte fixa: [Vibe Coding Toolkit, revisão de66fe371a49f5a4d3b521759e5c401f390b6424](https://github.com/soumatheusgomes/vibe-coding-toolkit/tree/de66fe371a49f5a4d3b521759e5c401f390b6424). A cópia está fora do projeto. Guias e templates virão exclusivamente dessa revisão; cada componente externo terá sua própria origem e revisão verificadas antes da instalação.

O [prompt solicitado](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/prompts/12-existing-project-setup.md) exige aprovação do desenho antes da implementação. Superpowers não está disponível nesta sessão; o protocolo de entendimento e desenho foi seguido explicitamente. Isso não comprova a instalação da skill.

## Fatos observados

- Raiz confirmada pelo terminal; branch existente `codex/atlas`, HEAD `17411db3eba49cdf4322d564301384dabe11cd18`.
- Estado inicial: 67 arquivos modificados, 33 adicionados e 533 não rastreados. O trabalho existente deve sobreviver integralmente; HEAD não representa todas as entregas locais.
- Node 20.20.2, npm 10.8.2, Codex CLI 0.153.4; cliente principal é o aplicativo Codex. Nenhuma troca de modelo principal, provedor ou autenticação proposta.
- Frontend React 18.3.1, Vite 4.5.14, JSX, Tailwind 3 e 28 componentes locais em `src/components/ui`. Existem Radix e padrões de shadcn, mas não `components.json`; a procedência/configuração deve ser investigada antes de usar geradores.
- Supabase JS 2.30.0 no frontend, Edge Functions Deno, PostgreSQL e workers Python. `planeje-mcp` é Node/TypeScript, versão de produto 2.8.1, com lockfile próprio; não existe workspace npm declarado.
- ESLint 8.57.1 está instalado, sem configuração utilizável. TypeScript 5.9.3 existe em `node_modules`, mas não é dependência de desenvolvimento direta declarada no pacote do MCP.
- Os nove caminhos de entrada do manifesto ainda não existem, exceto `AGENTS.md`. A documentação canônica de operação já está em `docs/continuidade-planeje/` e deve ser reaproveitada, não substituída por novos relatos concorrentes.
- `AGENTS.md` tem 145.497 bytes, com histórico extenso antes das instruções duráveis. O limite padrão documentado do Codex é 32 KiB; esta sessão recebeu instruções explícitas também, portanto não foi presumido que o cliente tenha perdido uma instrução específica.
- A documentação de continuidade mistura medições históricas e estados locais, de teste e de produção. A própria documentação exige conferir o estado atual e avisa que a pasta local pode divergir das fontes remotas.
- A inicialização normal do frontend tem fallback de destino produtivo. Navegador de teste deverá usar fixture existente ou configuração descartável com saída de rede bloqueada; abrir a aplicação normal sem isso não será uma validação segura.
- Não há CI em `.github`, nem configuração local `.codex`, `.claude` ou `.agents`. O inventário de configuração global foi limitado aos nomes das seções, sem valores de credenciais.
- Disponíveis na sessão: colaboração nativa, CUA, skills de Supabase/PostgreSQL, documentos, PDF, apresentações, planilhas, imagem e criação de skills. Context7, Superpowers, Ponytail e Caveman não aparecem como skills carregadas. RTK, Graphify, uv, gh e agent-browser não estão no PATH; isso não prova ausência de outras instalações fora do PATH.

## Linha de base executada

Todos os comandos abaixo usaram arquivos locais e ferramentas já existentes. Nenhum serviço produtivo foi consultado para a linha de base.

| Verificação | Resultado inicial | Observação |
| --- | --- | --- |
| `node --test scripts/atlasBackend.test.mjs scripts/atlasVoice.test.mjs scripts/auth-session/authSessionLoader.test.mjs` | 56 passaram, zero falhas | Modelo, áudio e relógio simulados; sem IA real |
| `npm run test:central-trafego` | passou | Dados fictícios locais |
| `npm run test:trafego-saude` | passou | Dados fictícios locais |
| `node_modules/.bin/vite build --outDir <pasta-temporaria>/dist` | passou, 15,35 s de comando | Variante isolada; não executa os empacotadores de ZIP nem substitui o `dist` da raiz |
| `node_modules/.bin/tsc --project planeje-mcp/tsconfig.json --noEmit` | falhou: 18 diagnósticos preexistentes | `clienteDossie.ts`, `hubTools.ts`, `tools.ts`; projeções e valores possivelmente ausentes |
| `node_modules/.bin/eslint --print-config src/App.jsx` | falhou: configuração não encontrada | Não há lint canônico operacional |
| `npm audit --json`, raiz | 41 entradas afetadas: 1 crítica, 29 altas, 10 moderadas, 1 baixa | Inclui dependências de desenvolvimento e transitivas; não demonstra exploração |
| `npm audit --json`, MCP | 11 entradas afetadas: 1 crítica, 5 altas, 3 moderadas, 2 baixas | Não somar com a raiz como se fossem falhas independentes |

O audit sugere mudanças de major em parte da árvore, incluindo Vite/jsPDF. Não foi executado `audit fix`, instalação forçada, downgrade ou atualização de dependência. Pela marcação `dev` dos lockfiles, 20 entradas da raiz incluem runtime e 21 são apenas desenvolvimento; no MCP, 10 incluem runtime e uma é apenas desenvolvimento. Essa classificação da árvore não demonstra alcance ou exploração das falhas. Os alertas críticos incluem jsPDF na raiz e proxy-addr transitivo no MCP, a investigar pelos consumidores e fontes oficiais. Logs e resultados brutos ficaram em pasta temporária privada; o próximo estágio deverá conservar resumos sem segredos nas evidências da adoção.

Não executados nesta etapa: suíte completa dos 159 arquivos `*.test.mjs`, testes de banco, APIs, navegador, fluxos de CI, Context7 e Graphify. Alguns testes existentes têm efeitos em bancos/ambientes específicos; uma varredura indiscriminada não está proposta.

## Alternativas consideradas

1. **Adoção completa no escopo do projeto — recomendada.** Reconciliar contexto, instalar skills locais adequadas, integrar um MCP Context7 por projeto e construir gates sobre as ferramentas existentes. Cada dependência global ou intervenção de conta fica explicitamente pendente. Maior benefício com alterações locais recuperáveis e verificáveis.
2. **Somente documentação e equivalentes já carregados.** Menor mudança, mas deixa discovery de skills e integrações úteis por fazer; não satisfaz a intenção de integração completa dos itens aplicáveis sem uma justificativa adicional.
3. **Preparar a máquina e instalar plugins globais junto.** Pode atender RTK/Graphify/plugins, mas amplia o alcance para outros projetos. Depende de autorização específica dos comandos e seus efeitos; não faz parte da recomendação atual.

## Desenho recomendado e cobertura do catálogo

Estados abaixo são decisões propostas. **Integrar não significa instalado ou validado.** Riscos: B = baixo, M = médio, A = alto. Todas as ações são locais, salvo consultas públicas de documentação/registro ou uma futura intervenção explicitamente descrita. Mudanças globais permanecem fora da implementação aprovada por este desenho.

| Componente | Necessidade e estado atual | Ação / escopo / dependência | Risco | Critério de validação |
| --- | --- | --- | --- | --- |
| 01 Superpowers | Processo útil; skill não carregada | Seguir protocolo; verificar distribuição oficial e viabilidade local. Plugin global/trust exige intervenção própria | B | Origem/revisão, descoberta e caso descartável; não alegar ativação só por seguir o protocolo |
| 02 Subagentes | Colaboração nativa disponível | Reusar para isolamento e revisão; um escritor por arquivo, configuração/locks/Git com coordenador | M | Tarefa delimitada e retorno verificado; revisão somente leitura |
| 03 RTK | Saída extensa; binário fora do PATH | Pré-requisito de máquina pendente; registrar método oficial e efeito, sem instalar hook como parte deste desenho | B | Executável/versão, retorno preservado, saída completa acessível, execução única |
| 04 Ponytail full | Redução de complexidade já nas instruções | Reusar disciplina equivalente; não declarar plugin instalado. Distribuição oficial depende suporte/escopo | B | Mudança mínima completa preservando requisitos, segurança e acessibilidade |
| 05 Caveman | Português conciso já adotado | Reusar estilo equivalente; preservar redação normal no código/documentos | B | Clareza e números/limites preservados; sem proxy ou mudança de modelo |
| 06 ESLint/Biome | ESLint instalado sem configuração | Integrar ESLint compatível e módulos genéricos do toolkit; medir regras antes de definir severidade. Segundo linter apenas com lacuna demonstrada | M | Lint reproduzível, autoavaliação dos módulos, contagem por regra e severidades justificadas |
| 07 Graphify | Grafo útil; CLI não disponível | Preparar exclusões locais; extração depende instalação oficial do CLI, a tratar separadamente | M | `--code-only --no-cluster`, cobertura/consulta reais; nenhuma semântica via API não autorizada |
| 08 Obsidian | Sem destino externo solicitado | Inaplicável; reusar documentação versionada | B | Nenhum vault, MCP ou exportação sem necessidade/destino |
| 09 Memória em camadas | Continuidade já extensa e repetida | Índice curto com fontes canônicas, verificação e invalidação; handoff temporário separado | M | Recuperar instrução e fonte em contexto limpo; distinguir subagente novo de cliente reiniciado |
| 10 Hooks | Sem lacuna que os exija | Inaplicável nesta adoção inicial; preservar os existentes | B | Ausência de hooks Git/bloqueadores e interceptadores duplicados |
| 11 agent-browser | CUA já disponível | Reusar CUA para QA local; CLI adicional só diante de lacuna comprovada | M | Fixture local, foco/teclado, desktop e celular; nenhuma sessão pessoal/produtiva |
| 12 Context7 | Não configurado/carregado | Integrar um endpoint remoto oficial em `.codex/config.toml`; depende trust/descoberta e eventualmente autenticação | M | Resolver biblioteca e consultar um conceito da versão instalada; não basta registro no arquivo |
| 13 Artefatos e extras | Skills nativas já disponíveis | Reusar equivalentes; escolhas detalhadas abaixo | B | Discovery separado de execução; licenças antes de vendorizar |
| 14 Chrome DevTools MCP | Console/rede/performance precisam de avaliação | Reusar capacidades reais do CUA; instalar MCP local só se houver lacuna concreta | M | Evidência específica de console/rede/trace em perfil isolado, quando aplicável |
| 15 Codex | App/CLI/autenticação já existentes | Reusar cliente; instruções compartilhadas e configuração local sem permissões/modelos pessoais | M | Sintaxe, precedência e carregamento observável; nenhum ajuste global |
| 16 Vercel skills | React/web presente; skills ausentes | Instalar conjunto compatível local em `.agents/skills`, com fonte/licença/revisão/lockfile | M | Frontmatter, discovery e fluxo representativo; itens exclusivos de Next/React novo não aplicados |
| 17 next-dev-loop | Vite, sem Next/Turbopack | Inaplicável; reusar Vite e navegador | B | Não migrar framework para satisfazer skill |
| 17 next-bundle-optimizer | Sem analisador Next | Inaplicável; medições Vite podem orientar tarefa futura | B | Não inventar evidência de analisador incompatível |
| 18 PostgreSQL | Supabase/PostgreSQL; skills disponíveis | Reusar skills; leitura estática e testes descartáveis conforme necessidade | A | Isolamento de cliente/RLS/SQL conferido; nenhuma migração ou consulta produtiva |
| 19 gh-fix-ci | Sem gh no PATH, CI/PR selecionado ausentes | Pendente de ferramenta, necessidade e acesso; reusar GitHub somente no escopo autorizado | M | Leitura real de Actions quando houver caso; instalação não equivale a correção de CI |
| 20 Segurança / differential-review | Limites de dados/autenticação relevantes | Integrar referência versionada ao prompt13; verificar instalação local da skill e licença | A | Revisão de intervalo/diff exato e chamadores; relatório privado com cenário/evidência, sem uploads |
| 21 shadcn | UI local customizada, configuração ausente | Investigar procedência; skill local somente se aplicável sem regeneração/inicialização | M | Preservar tokens, aliases, componentes e acessibilidade; CLI só com configuração compatível |
| 22 Sentry MCP | Serviço/conta não selecionados | Inaplicável por ausência de adoção confirmada; reconsiderar se houver conta/projeto escolhido | M | OAuth/escopo e consulta somente leitura quando autorizados; não instalar SDK por checklist |

### Todas as skills do catálogo Vercel

| Skill | Decisão proposta |
| --- | --- |
| `vercel-react-best-practices` | Instalar localmente; filtrar recomendações por React 18/Vite |
| `vercel-composition-patterns` | Instalar; usar em decisões concretas de APIs/composição, sem redesenho antecipado |
| `web-design-guidelines` | Instalar; validar interface, acessibilidade, foco, estados e responsividade |
| `writing-guidelines` | Instalar se a origem atual ainda a fornecer; adaptar ao português e convenções existentes |
| `vercel-react-view-transitions` | Inaplicável à adoção atual: React 18 e ausência de pedido de transições |
| `vercel-optimize` | Inaplicável: sem projeto/métricas Vercel selecionados |
| `deploy-to-vercel` | Inaplicável: hospedagem existente VPS e nenhuma publicação solicitada |
| `vercel-cli-with-tokens` | Inaplicável: operação/autenticação Vercel não selecionada |
| `vercel-react-native-skills` | Inaplicável: produto web, sem React Native/Expo |
| `find-skills` | Instalar localmente se discovery equivalente não cobrir a lacuna; evitar duplicação |

O inventário upstream será conferido antes da instalação; nomes/contagens não serão tratados como contratos permanentes. Skills pertinentes adicionadas ao catálogo serão avaliadas, com a decisão registrada.

### Artefatos, plugins e outros extras

| Item | Decisão proposta e limite |
| --- | --- |
| `docx`, `pdf`, `pptx`, `xlsx`, `document-skills` | Reusar skills do cliente; não copiar distribuição Anthropic com licença específica/restritiva |
| `skill-creator` | Reusar; criar skill somente para necessidade recorrente real |
| `mcp-builder` | Avaliar para trabalho recorrente no MCP existente; não é pré-requisito para configurar o harness |
| `webapp-testing` | Reusar CUA e testes locais; dependência de navegador adicional exige lacuna real |
| `frontend-design`, `canvas-design`, `algorithmic-art`, `theme-factory` | Sem instalação agora; capacidades existentes atendem parcialmente, sem equivalência integral presumida |
| `web-artifacts-builder` | Inaplicável à aplicação existente; pipeline próprio já presente |
| `doc-coauthoring`, `brand-guidelines` | Reusar convenções/documentação; reconsiderar com fluxo recorrente específico |
| `internal-comms`, `slack-gif-creator` | Inaplicáveis ao setup; comunicação externa não solicitada |
| `claude-api` | Inaplicável à configuração do cliente; não habilitar provedor/conta/cobrança |
| `aia-harness` | Inaplicável agora por sobreposição; não instalar segundo harness |
| Plugins oficiais de review/commit/hooks de outro cliente | Inaplicáveis sem suporte/necessidade demonstrados no cliente atual |
| Templates Next/Drizzle/Pino | Inaplicáveis como arquitetura de retrofit; preservar Supabase, Vite e mecanismos atuais |
| Templates genéricos ESLint + autoavaliação | Integrar com caminhos reais e sem impor fronteiras que o produto não possui |
| Prompt13 de segurança | Registrar fonte fixa, invocação e destino privado em qualidade |
| Prompt14 e fixture de avaliação | Executar casos selecionados fora da aplicação; fixture vulnerável nunca entra no produto |
| Outros prompts01–09 | Reusar conforme tarefa: diagnóstico, lint gradual, revisão, delegação, memória e refatoração delimitada |
| Prompt10 de preparação da máquina | Fora do escopo recomendado; apresentar comandos/efeitos quando necessário |
| Prompt11 de projeto novo | Inaplicável; nenhum scaffold sobre a raiz |
| Handoff | Reusar continuidade existente para estado durável; nota desta adoção separada e temporária |

## Documentos e arquivos que poderão mudar

O mapa do manifesto terá nove entradas claras. `README.md` apresentará produto e comandos; `PRODUCT.md` resumirá produto observado e apontará para fases/escopo canônicos; `AGENTS.md` conterá apenas acordos, comandos e mapa. O conteúdo histórico atual será preservado integralmente em referência identificada antes de qualquer redução. `CLAUDE.md` conterá `@AGENTS.md` e apenas eventual detalhe do cliente, sem duplicar regras.

`docs/architecture.md`, `docs/design.md`, `docs/onboarding.md` e `docs/quality.md` serão entradas curtas apontando para mapa técnico, operação e validação canônicos quando esses forem equivalentes. Não serão copiadas para esses arquivos as milhares de linhas do histórico. `docs/setup.md` será o registro da revisão do toolkit, matriz final, versões, estados de instalação/descoberta/execução, evidências e manutenção. As entradas de continuidade responsáveis serão atualizadas ao concluir a adoção, sem afirmar publicação ou aceite do produto.

Outros alvos possíveis: `.codex/config.toml`, `.agents/skills/`, lockfile de skills, configuração ESLint e módulos de regras, scripts de verificação e `package.json`/lockfiles. Backups das configurações existentes serão recuperáveis e privados, sem versionar segredos. Nenhum arquivo preexistente será removido sem função confirmada e conteúdo útil preservado.

## Sequência de implementação proposta após aprovação

1. **Fundação e contexto.** Conferir novamente Git e hashes, registrar backup e reconciliar os nove destinos. Aceitação: instruções curtas, histórico preservado, links válidos e comandos reais; nenhuma regra importante perdida.
2. **Ferramentas.** Verificar fontes atuais, licenças e compatibilidade; instalar skills locais pertinentes, configurar Context7 no escopo suportado e reusar capacidades existentes. Aceitação: origem/versão e estados comprovados; intervenção externa descrita quando impedir execução. RTK/Graphify/plugins globais seguem pendentes sem bloquear esta etapa local.
3. **Qualidade.** Configurar lint e regras genéricas proporcionais; medir fronteiras/tamanho/console antes de severidades. Avaliar lint assíncrono tipado apenas no MCP, medindo tempo/memória. Investigar os 18 erros preexistentes e corrigir problemas delimitados de projeção/nulidade com evidência de regressão. Uma correção que exigir contrato novo, migração ou mudança de arquitetura vira decisão específica. Não usar casts/supressões genéricas, relaxamento de testes ou elevação de teto para fabricar aprovação.
4. **Dependências e organização.** Separar alertas de runtime/desenvolvimento e examinar atualizações compatíveis em grupos pequenos. Conferir changelog, engines, pares e consumidores antes de mudar lockfile. Majors incompatíveis, substituição de biblioteca e correções de domínio amplas terão proposta própria. Sem autoformatação ou refatoração em massa por tamanho.
5. **Validação integrada e entrega.** Consolidar comandos explícitos de lint/tipos/testes/regras/build; preservar distinção entre auditoria e gate funcional. Executar fixture local no navegador e casos descartáveis de descoberta/retomada/revisão. Repetir partes seguras para verificar idempotência. Revisar diff da adoção e chamadores afetados independentemente, corrigir achados e registrar antes/depois, limitações e próxima ação.

Se for necessário um plano arquitetural, ele será escrito e aprovado separadamente; o aceite deste desenho não aprova um plano ainda inexistente.

## Limites e recuperação

- Nenhuma publicação, push, mensagem, automação, compra, nova cobrança, migração, restart ou alteração de produção. Autorizações históricas de releases não serão reaproveitadas para este setup.
- Preservar React/Vite, Supabase, npm, lockfiles existentes, serviços, dados, permissões e customizações; nenhum Next, Drizzle ou novo provedor para cumprir checklist.
- Nenhuma exigência de branch/worktree, hook Git ou bloqueio de commit/push. Nenhum aumento de permissões nem mudança de autenticação/modelo principal.
- Testes de UI usarão fixture/destino descartável; nenhuma sessão pessoal ou produção para comprovar integração.
- Alterações existentes serão comparadas ao estado capturado imediatamente antes da adoção. Recuperação restaura somente arquivos próprios a partir dos backups, mediante conferência de concorrência; nunca `reset --hard`, `clean` ou restauração geral.
- Restart do cliente, OAuth e trust podem exigir ação humana. Configurado, descoberto e validado são estados separados; pendência não será marcada como sucesso.

## Evidência e revisão do desenho

O catálogo completo foi lido por subagente somente leitura, com `gpt-6.1-sol`, esforço médio, escolhido para sintetizar guias e limites entre clientes. O coordenador executou e conferiu a linha de base e os alvos de integração. Não foi executada revisão de segurança completa do produto.

O mesmo revisor conferiu este desenho contra o prompt e a matriz, somente leitura: nenhuma omissão material encontrada. Modelo/esforço acima foram confirmados nos parâmetros observáveis do despacho. A revisão do desenho não substitui a revisão independente do diff de implementação. A conferência final confirmou os hashes originais das configurações e as mesmas contagens do working tree inicial.

Fontes adicionais: [catálogo](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/tools/README.md), [manifesto](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/templates/project-docs/manifest.json), [descoberta de instruções do Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Próxima ação: aprovar ou ajustar a alternativa1 e os limites deste desenho. A aprovação permitirá executar as entregas locais acima; não autorizará instalações globais nem as ações reservadas a decisões específicas.
