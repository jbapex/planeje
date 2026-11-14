# Sincronização das fontes produtivas — 14/11/2026

Josias autorizou a sincronização em 14/11/2026 às 08h10 BRT. A reconstrução partiu de `e86c6bd` e usou somente leitura das candidatas, payloads, escopos e manifests das cinco releases produtivas, ignorando `gestor-coortes-20261114-01` como fonte.

## Conteúdo recuperado

Na ordem produtiva: paridade do funil do CRM IA; entrada por contas; entrada em lista; acesso do cliente ao CRM IA; e coortes do Gestor IA. A primeira candidata também recuperou as fontes produtivas herdadas que ainda não existiam no GitHub, inclusive Atlas/Squad, agenda, conhecimento e concierge do CRM IA. Entraram as migrations manifestadas, entre elas `20261112235345_crm_ia_agenda_default_timezone.sql`, `20261113200806_crm_ia_client_access.sql` e `20261114025442_gestor_ia_cohort_read.sql`.

## Conferência

O manifesto ativo de `gestor-coortes-20261114-02` contém 2.295 caminhos. A comparação byte a byte confirmou 2.286 arquivos (SHA-256 idêntico). As nove divergências são ausências deliberadas em `supabase/.temp/`: `cli-latest`, `gotrue-version`, `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`, `rest-version`, `storage-migration` e `storage-version`. São estado local do Supabase; parte contém vínculo/endereço de infraestrutura. Foram excluídos para não versionar metadados sensíveis. Nenhum `.env` foi copiado.

## Validação local

Treze dos 14 arquivos de teste Node selecionados passaram. `scripts/gestor-ia/routine-data.test.mjs` não iniciou porque `esbuild` não estava instalado. `npm ci --offline` não pôde completar porque `zustand@4.5.7` não existia no cache local; por isso o build Vite e os testes MCP dependentes não foram repetidos neste clone. Nenhuma tentativa com rede ou banco foi feita.

## Pendências e limite operacional

O `.git` original do clone estava somente para leitura nesta sessão. A branch e os commits foram produzidos em metadados Git temporários e exportados em bundle para importação/conferência; o ref do clone original precisa ser criado a partir desse bundle antes do push. Não houve deploy, push, alteração de `main`, banco, serviço ou diretório produtivo. Depois da importação, repetir `npm ci`, build, testes locais e MCP em ambiente com dependências disponíveis, mantendo rede e banco fora da validação até autorização específica.
