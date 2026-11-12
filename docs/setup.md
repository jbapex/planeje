# Setup e manutenção do harness

Data: 17/10/2026. Adoção local aprovada após brainstorming. Toolkit fixado em
`de66fe371a49f5a4d3b521759e5c401f390b6424` ([fonte](https://github.com/soumatheusgomes/vibe-coding-toolkit/tree/de66fe371a49f5a4d3b521759e5c401f390b6424)).
Guias/templates vieram dessa mesma cópia; componentes externos têm versões
próprias fixadas em [.agents/skills.lock.json](../.agents/skills.lock.json).
A configuração da máquina foi atualizada externamente durante este trabalho;
este setup reutilizou as integrações que se tornaram disponíveis.

## Estrutura e fontes canônicas

Os nove destinos do manifesto foram atendidos: README, PRODUCT, AGENTS, CLAUDE,
arquitetura, design, onboarding, qualidade e este setup. Os documentos novos
são entradas curtas; operação, decisões, fases e evidências continuam em
`docs/continuidade-planeje`. O AGENTS original de 145.497 bytes está preservado
na [referência histórica](continuidade-planeje/referencias/AGENTS-historico-antes-toolkit-2026-10-17.md).
A entrada atual reduz contexto automático e carrega detalhes por assunto.
CLAUDE importa AGENTS; carregamento no Claude não foi observado.

O [desenho aprovado](continuidade-planeje/referencias/toolkit-desenho-aprovado-2026-10-17.md)
preserva alternativas, inventário inicial, riscos e plano. Suas marcações de
ferramentas ausentes são históricas; os resultados abaixo são posteriores.

## Matriz completa de cobertura

Necessidade e ações são as do desenho; a última coluna distingue o resultado
observado. Configurado, presente em disco, carregado e executado são estados
diferentes. B/M/A indicam risco baixo/médio/alto, não severidade de achado.

| Componente | Necessidade / estado inicial | Ação, escopo e dependência | Risco | Critério | Estado e evidência |
| --- | --- | --- | --- | --- | --- |
| 01 Superpowers | Processo útil; skill não carregada | Seguir protocolo; verificar distribuição oficial e viabilidade local. Plugin global/trust exige intervenção própria | B | Origem/revisão, descoberta e caso descartável; não alegar ativação só por seguir o protocolo | Reutilizado: plugin 7.0.0 instalado/habilitado no cliente durante execução; verificação final lida/aplicada. Brainstorming ocorreu antes da disponibilidade. |
| 02 Subagentes | Colaboração nativa disponível | Reusar para isolamento e revisão; um escritor por arquivo, configuração/locks/Git com coordenador | M | Tarefa delimitada e retorno verificado; revisão somente leitura | Validado: inventário, implementação MCP, revisão independente e fixture em contextos separados; nenhuma configuração global de modelo alterada. |
| 03 RTK | Saída extensa; binário fora do PATH | Pré-requisito de máquina pendente; registrar método oficial e efeito, sem instalar hook como parte deste desenho | B | Executável/versão, retorno preservado, saída completa acessível, execução única | Reutilizado: binário 1.0.1 e hook global Codex conferidos; dry-run e posterior reescrita real de leitura observados. Sem segundo wrapper. |
| 04 Ponytail full | Redução de complexidade já nas instruções | Reusar disciplina equivalente; não declarar plugin instalado. Distribuição oficial depende suporte/escopo | B | Mudança mínima completa preservando requisitos, segurança e acessibilidade | Reutilizado: plugin 5.3.2 habilitado; cópia local recém-instalada foi movida para backup para evitar duplicação. |
| 05 Caveman | Português conciso já adotado | Reusar estilo equivalente; preservar redação normal no código/documentos | B | Clareza e números/limites preservados; sem proxy ou mudança de modelo | Reutilizado: skill do cliente, corpo conferido e metadata observada em contexto novo; português/clareza preservados. |
| 06 ESLint/Biome | ESLint instalado sem configuração | Integrar ESLint compatível e módulos genéricos do toolkit; medir regras antes de definir severidade. Segundo linter apenas com lacuna demonstrada | M | Lint reproduzível, autoavaliação dos módulos, contagem por regra e severidades justificadas | Integrado: configuração explícita ESLint 8, regras e autoavaliação; avisos/severidades medidos. Biome não necessário. |
| 07 Graphify | Grafo útil; CLI não disponível | Preparar exclusões locais; extração depende instalação oficial do CLI, a tratar separadamente | M | `--code-only --no-cluster`, cobertura/consulta reais; nenhuma semântica via API não autorizada | Validado: CLI 0.9.92 em venv local com Python existente 3.12.14; grafo e consultas sem rede/LLM. Skill do cliente reutilizada. |
| 08 Obsidian | Sem destino externo solicitado | Inaplicável; reusar documentação versionada | B | Nenhum vault, MCP ou exportação sem necessidade/destino | Inaplicável: nenhuma necessidade/destino externo; documentação versionada reutilizada. |
| 09 Memória em camadas | Continuidade já extensa e repetida | Índice curto com fontes canônicas, verificação e invalidação; handoff temporário separado | M | Recuperar instrução e fonte em contexto limpo; distinguir subagente novo de cliente reiniciado | Validado em subagente novo: encontrou comando, fontes e limite React 18. Não equivale a cliente reiniciado. |
| 10 Hooks | Sem lacuna que os exija | Inaplicável nesta adoção inicial; preservar os existentes | B | Ausência de hooks Git/bloqueadores e interceptadores duplicados | Nenhum novo hook instalado. Integração RTK global existente reutilizada; sem hooks Git. |
| 11 agent-browser | CUA já disponível | Reusar CUA para QA local; CLI adicional só diante de lacuna comprovada | M | Fixture local, foco/teclado, desktop e celular; nenhuma sessão pessoal/produtiva | Equivalente validado: Playwright/Chrome existentes, perfil novo, rede externa bloqueada, fixture 1280/390, fontes e falha. CLI adicional não necessário. |
| 12 Context7 | Não configurado/carregado | Integrar um endpoint remoto oficial em `.codex/config.toml`; depende trust/descoberta e eventualmente autenticação | M | Resolver biblioteca e consultar um conceito da versão instalada; não basta registro no arquivo | Validado: conexão global recém-disponível, tools carregadas, resolve e query nativos para ESLint 8.57.1; SDK independente consultou React 18. Cópia local retirada. |
| 13 Artefatos e extras | Skills nativas já disponíveis | Reusar equivalentes; escolhas detalhadas abaixo | B | Discovery separado de execução; licenças antes de vendorizar | Reutilizados os plugins nativos; decisões por item abaixo. Nenhum pacote Anthropic duplicado. |
| 14 Chrome DevTools MCP | Console/rede/performance precisam de avaliação | Reusar capacidades reais do CUA; instalar MCP local só se houver lacuna concreta | M | Evidência específica de console/rede/trace em perfil isolado, quando aplicável | Não necessário nesta adoção: navegador existente cobriu console/rede/fluxo; performance detalhada não foi pedida nem medida. |
| 15 Codex | App/CLI/autenticação já existentes | Reusar cliente; instruções compartilhadas e configuração local sem permissões/modelos pessoais | M | Sintaxe, precedência e carregamento observável; nenhum ajuste global | Reutilizado: CLI 0.163.0/app e autenticação; AGENTS curto e seis skills de projeto disponíveis nesta conversa, sem alterar permissões/provedor/modelo principal. |
| 16 Vercel skills | React/web presente; skills ausentes | Instalar conjunto compatível local em `.agents/skills`, com fonte/licença/revisão/lockfile | M | Frontmatter, discovery e fluxo representativo; itens exclusivos de Next/React novo não aplicados | Instaladas/íntegras quatro skills web e find-skills, revisões fixadas; catálogo atual sem adições. As seis skills locais constam no catálogo recebido neste novo turno; execução depende da tarefa. Reinício completo do cliente não observado. |
| 17 next-dev-loop | Vite, sem Next/Turbopack | Inaplicável; reusar Vite e navegador | B | Não migrar framework para satisfazer skill | Inaplicável: Vite 4, sem Next/Turbopack; nenhuma migração. |
| 17 next-bundle-optimizer | Sem analisador Next | Inaplicável; medições Vite podem orientar tarefa futura | B | Não inventar evidência de analisador incompatível | Inaplicável: nenhum analisador Next; sem afirmação de otimização de bundle. |
| 18 PostgreSQL | Supabase/PostgreSQL; skills disponíveis | Reusar skills; leitura estática e testes descartáveis conforme necessidade | A | Isolamento de cliente/RLS/SQL conferido; nenhuma migração ou consulta produtiva | Reutilizadas skills Supabase/PostgreSQL e revisão de queries; testes SDK fictícios. SQL/RLS/banco reais não executados. |
| 19 gh-fix-ci | Sem gh no PATH, CI/PR selecionado ausentes | Pendente de ferramenta, necessidade e acesso; reusar GitHub somente no escopo autorizado | M | Leitura real de Actions quando houver caso; instalação não equivale a correção de CI | Inaplicável ao caso atual: não há pipeline/PR de CI selecionado; gh fora do PATH inicial. Reavaliar quando houver caso autorizado. |
| 20 Segurança / differential-review | Limites de dados/autenticação relevantes | Integrar referência versionada ao prompt13; verificar instalação local da skill e licença | A | Revisão de intervalo/diff exato e chamadores; relatório privado com cenário/evidência, sem uploads | Integrada skill local e referência Prompt 13; revisão independente MCP sem achados materiais. Relatório privado; não é auditoria integral. |
| 21 shadcn | UI local customizada, configuração ausente | Investigar procedência; skill local somente se aplicável sem regeneração/inicialização | M | Preservar tokens, aliases, componentes e acessibilidade; CLI só com configuração compatível | Gerador inaplicável sem configuração/procedência confirmadas. Componentes Radix locais e customizações preservados; usar guidelines web. |
| 22 Sentry MCP | Serviço/conta não selecionados | Inaplicável por ausência de adoção confirmada; reconsiderar se houver conta/projeto escolhido | M | OAuth/escopo e consulta somente leitura quando autorizados; não instalar SDK por checklist | Inaplicável: serviço/organização/projeto não escolhidos; não criado SDK ou conta. |

## Skills e extras sem instalação redundante

| Item | Decisão final |
| --- | --- |
| vercel-react-best-practices, vercel-composition-patterns, web-design-guidelines, writing-guidelines | Quatro skills locais da revisão 063bee94, MIT; adaptação React 18/Vite; sem recomendações React 19/Next automáticas |
| find-skills | Local, revisão 13e4063a, MIT; uso somente quando houver lacuna real |
| differential-review | Local, revisão 5c99c03f, CC-BY-SA4.0; fonte/licença preservadas, relatório fora do repositório |
| Ponytail, Caveman, Graphify, Superpowers | Reutilizados do cliente; cópias locais recém-criadas foram preservadas em backup e retiradas para evitar duplicidade |
| vercel-react-view-transitions | Inaplicável: React 18 e nenhuma transição pedida |
| vercel-optimize, deploy-to-vercel, vercel-cli-with-tokens | Inaplicáveis: destino VPS, sem projeto/métricas/operação Vercel |
| vercel-react-native-skills | Inaplicável: aplicação web |
| docx/pdf/pptx/xlsx/document-skills, skill-creator | Reutilizar plugins/skills nativos; sem cópia de distribuições de licença específica |
| mcp-builder | Sem necessidade nova: MCP existente; contratos/testes próprios preservados |
| webapp-testing | Equivalente de navegador validado com biblioteca já disponível; sem novo pacote browser |
| frontend-design/canvas-design/algorithmic-art/theme-factory | Sem necessidade recorrente de instalação; capacidades existentes atendem parcialmente, sem equivalência integral alegada |
| web-artifacts-builder | Inaplicável: pipeline React próprio, sem Claude Artifacts |
| doc-coauthoring/brand-guidelines | Reutilizadas convenções e identidade existentes |
| internal-comms/slack-gif-creator/claude-api | Inaplicáveis: nenhum envio ou novo provedor solicitado |
| aia-harness/plugins de commit/review/hooks de outro cliente | Inaplicáveis por sobreposição ou ausência de necessidade/suporte no cliente atual |
| templates Next/Drizzle/Pino/Vitest | Não introduzidos: stack e testes existentes preservados |
| templates genéricos ESLint/Prompt 13/avaliação14 | Adaptados/referenciados e avaliados em escopos locais; fixture vulnerável fora da aplicação |
| prompts01–09 | Disponíveis na revisão de origem para tarefas pertinentes; nenhuma refatoração massiva ou nova política comercial |
| prompts10/11 | Máquina foi tratada externamente; projeto novo é inaplicável |
| handoff | Estado temporário desta execução em .local; contexto durável segue a continuidade canônica |

## Ferramentas e autenticação

Context7 já estava globalmente configurado quando ficou carregado na sessão;
a configuração local duplicada foi movida para backup. O [exemplo opcional](../.codex/config.toml.example)
só deve ser ativado se não houver conexão equivalente. Foram verificadas
`resolve-library-id` e `query-docs` de verdade, com consultas públicas a React 18
e ESLint 8.57.1, sem código/dados privados. Nenhum OAuth, token ou configuração
pessoal foi copiado para o projeto.

RTK 1.0.1: hook global Codex e binário conferidos; dry-run mostrou reescrita única.
Depois, uma leitura normal com `tail` foi observada no processo como `rtk read`
com `--tail-lines`, comprovando interceptação real nesta superfície. Comandos
normais seguem a instrução RTK vigente; não foi instalado outro hook/wrapper.

Graphify 0.9.92 usa venv ignorado em `.local/tooling/graphify/venv`, criado com
Python 3.12.14 já existente. `pip check`, corpus, consulta e projeto passaram sob
sandbox macOS com rede negada e escrita limitada ao destino. A extração inicial
teve 9.694 nós/36.565 arestas. Após os últimos testes/fontes, o refresh final
tem 9.718 nós/36.615 arestas e 1.266 fontes com nós, zero tokens. A consulta
fresca encontrou o teste MCP e suas importações. Arquivos sem símbolos e 65
não classificados limitam cobertura; SQL, docs, assets, dados e segredos ficam
excluídos. Mudanças de código posteriores invalidam o grafo.

```sh
GRAPHIFY_NO_AUTO_REFRESH=1 .local/tooling/graphify/venv/bin/graphify extract . --code-only --no-cluster
GRAPHIFY_NO_AUTO_REFRESH=1 .local/tooling/graphify/venv/bin/graphify explain createAuthSessionLoader
```

Esses comandos de manutenção são determinísticos, mas não incluem a política
macOS de sandbox da avaliação. Confira flags da versão antes de mudar escopo;
não habilitar semântica/backend de API por presumir o login do cliente.
Recriação em outra máquina precisa Python>=3.10 e venv local com graphifyy0.9.92;
não há dependência global obrigatória criada por este setup.

## Delegação, avaliação e revisão

Subagentes receberam arquivos e recursos disjuntos, objetivo, aceitação e
limites; modelos/esforços explícitos `gpt-6.1-sol` médio (inventário/avaliação)
e alto (MCP/revisão). Modelo principal, cliente, provedor e autenticação foram
preservados. Nenhum default comercial fixo foi escrito na configuração.

Um contexto novo de subagente encontrou comando check, fontes de produto e
limite React 18. No corpus descartável do toolkit, baseline real 5/7 passou e
2 falhas de autorização foram corrigidas; avaliação final 7/7, instruções/notas
e avaliador preservados. Isso é smoke comportamental, não cliente reiniciado
nem taxa de confiabilidade. Casos de handoff falso, pausa/retomada e conflito
de recursos não foram executados como benchmarks separados.

Check final: saída 0, 93 testes locais, quatro testes do harness, três grupos de
regras, tipos sem erros e build isolado. A primeira integração detectou um
carregador CommonJS incompatível no teste novo após atualizar tsx; a importação
do export ESM corrigiu a falha, preservando seus 18 casos.

Revisão independente MCP: zero achados materiais, 18 testes e tsc 0 conferidos;
sem validação de OAuth/HTTP/RLS produtivos nem baseline Git dos três arquivos
não rastreados. A revisão do harness e o conjunto final têm sua evidência na
[release local](continuidade-planeje/evidencias/releases/toolkit-setup-local-2026-10-17.json).

## Revalidação após a preparação da máquina

Em 17/10/2026, a repetição do Prompt 12 obteve novamente o toolkit fora do
projeto: a revisão continua `de66fe371a49f5a4d3b521759e5c401f390b6424`.
Os HEADs públicos das três origens das skills coincidem com o lock; nenhuma
instalação ou atualização adicional foi necessária. Revisão documental
independente do catálogo não encontrou lacunas materiais de cobertura.

- `npm run check` passou com Node 24.22.0/npm 12.2.0: 93 testes locais,
  quatro testes do harness, tipos, três grupos de regras e build temporário.
  A linha de base anterior com Node 20 permanece registrada; nenhum arquivo
  de versão ou contrato de runtime do projeto foi alterado.
- As seis skills locais foram descobertas no catálogo desta conversa. Isso
  comprova disponibilidade neste turno, sem alegar execução das seis ou
  reinício completo do cliente. Codex CLI observado: 0.163.0.
- Context7 resolveu ESLint e consultou os códigos de saída da versão 8.57.1,
  apenas com conteúdo público. Avisos continuam visíveis: 358 no lint rápido
  e 12 no tipado; os 11 avisos de tamanho deste último se sobrepõem.
- O grafo existente mantém 9.718 nós/36.615 arestas. Os hashes dos 1.273
  arquivos do manifesto coincidem com as fontes; `explain check.mjs`
  confirmou o script e suas importações. Nenhuma extração/API foi acionada.
- A fixture local passou em 1280 e 390 pixels, incluindo fontes e falha,
  com perfil descartável, zero erros de execução e zero solicitações externas.
  O servidor criado foi encerrado. A primeira checagem de prontidão recebeu
  404 porque o cliente HTTP não enviava `Accept`; enviar `text/html`
  corrigiu o teste, sem mudar código do produto.
- As auditorias repetidas confirmaram 15 alertas na raiz (1 crítico, 7 altos,
  7 moderados) e zero no MCP. Os riscos e próximos trabalhos da seção
  de pendências e de [qualidade](quality.md) permanecem aplicáveis.

[Evidência da revalidação](continuidade-planeje/evidencias/releases/toolkit-revalidation-local-2026-10-17.json).
Logs e backups desta rodada ficam em `.local/toolkit-setup/2026-10-17/revalidation/`.
A revisão independente desta rodada foi documental; não houve nova auditoria
integral do produto, produção ou SQL/RLS reais.

## Manutenção e recuperação

- Execute `npm run check`; veja [qualidade](quality.md) para cobertura, avisos e auditorias residuais.
- Para repetir adoção, obtenha nova revisão do toolkit fora do projeto, leia prompt 12 e compare a matriz antes de instalar. Preserve customizações e não misture templates de revisões.
- Atualize skills por origem/revisão explícitas, confira licença/frontmatter e diff, depois regenere conscientemente os hashes do lock. `verify:context` deve falhar se o conteúdo divergir; não regenerar hashes só para ocultar modificação desconhecida.
- O verificador é somente leitura; duas execuções finais passaram e conservaram os hashes de 121 arquivos de configuração, documentos e skills. Build temporário removido e ausência de conexão MCP local duplicada também foram conferidos. Não reinstalar tudo para provar idempotência.
- Backups anteriores às alterações ficam em `.local/toolkit-setup/2026-10-17/backup`, ignorados; não incluem `.env`. Há snapshots adicionais antes das atualizações compatíveis de pacotes. Recuperar somente arquivos da entrega, após conferir alterações concorrentes; sem reset/clean geral.
- Documentos responsáveis são atualizados com mudanças de comandos, contratos e limites. Memória: este índice/AGENTS e detalhes canônicos, conferidos nesta adoção; invalidar fatos quando checkout, stack, política, integração ou ambiente mudar. Handoff temporário não vira regra permanente.

## Pendências e gatilhos

Avisos legados e 15 entradas do audit da raiz seguem visíveis; próxima etapa é
reproduzir falhas de no-undef/hooks e propor as migrações de dependências
separadamente. SDK MCP foi atualizado dentro de 1.x e audit retornou 0. Uma futura
atualização incompatível exige decisão própria, testes de consumidores e
recuperação; não é bloqueio escondido nem sucesso de segurança absoluta.

Discovery de todas as seis skills em cliente reiniciado, outro sistema
operacional, lint Deno nativo, bancos reais e aceites de uso do produto não
foram validados. Integrações CI/Sentry/shadcn serão reavaliadas quando existirem
caso, serviço e configuração concretos. Nenhuma automação de manutenção foi criada.
