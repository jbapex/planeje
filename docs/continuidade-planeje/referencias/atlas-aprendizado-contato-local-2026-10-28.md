# Atlas: aprendizado e contato natural — entrega local de 28/10/2026

> Atualização às 12h14: esta entrega foi publicada e verificada na VPS por autorização específica posterior. O texto abaixo preserva a evidência local anterior. Consulte o [registro produtivo](atlas-aprendizado-contato-producao-2026-10-28.md); não reaplique as migrações.

## Estado e autorização

Implementado e verificado **localmente; NÃO PUBLICADO**. Josias pediu aprendizado sobre a agência, grupos e tarefas e confirmou: “Sim, aprender automaticamente assim”, para fatos/padrões com fonte/data, mantendo mudanças de regras sob sua decisão. A falha do contato natural foi reproduzida. Nenhuma autorização anterior de publicação foi extrapolada para estas duas migrações novas.

[Desenho](../../superpowers/specs/2026-10-28-atlas-aprendizado-contato-design.md) · [Plano](../../superpowers/plans/2026-10-28-atlas-aprendizado-contato.md) · [Evidência e hashes](../evidencias/releases/atlas-aprendizado-contato-local-2026-10-28.json).

## Comportamento entregue

- `atlas_memories` ganha tipo fato relatado/padrão/regra e evidência atribuída por fonte, autor, data e versão. A análise de eventos existente propõe até três observações duráveis de mensagens/comentários elegíveis. Fato mantém trecho literal; padrão exige pelo menos duas fontes distintas e permanece inferência. Não há treinamento de pesos, embeddings, novo provedor nem chamada de modelo adicional só para aprender.
- Fonte, cliente, autoria, data, trecho e versão são revalidados antes da gravação. Status, prazo, executor e entrega atuais continuam em Tarefas. Mensagem/comentário não vira autorização de contrato/verba. Comentário sem autor disponível no catálogo atual não é fonte de aprendizado nesta versão.
- Dedupe por fontes sobrevive a retry, correção e revogação. Uma memória revogada/substituída não ressuscita pelo mesmo evento. O conhecimento reutilizável usa apenas memórias canônicas ativas; o antigo UNION de resumos históricos foi removido. Backfill vincula somente cópias exatas inequívocas e preserva a audiência existente, inclusive opt-out.
- Novos aprendizados ficam privados e vinculados ao cliente. Compartilhar continua uma decisão explícita do dono. A equipe recebe conteúdo operacional autorizado e metadados seguros, sem quote/apartes privados da conversa do dono. Corrigir pela UI ou pelo chat preserva o tipo observado em vez de promovê-lo silenciosamente a regra. A aba Memória mostra tipo, origem/autor/data e os controles existentes.
- Uma instrução natural em infinitivo pode consultar primeiro a conta e incluir pedido para ela conferir com um colega. O colega não recebe uma segunda chamada automática. Tarefa ausente é informada; não há recriação/religação por título, exclusão ou alteração de responsabilidade oficial. Consulta continua dependente de ator autenticado, política, sessão, origem e revisão vigentes.
- Negação, citação, condição e ambiguidade não autorizam contato. Complemento negativo após a diretiva exige esclarecimento por precaução, mesmo quando poderia ser uma pergunta factual. A resposta que pede esclarecimento sobre tarefa ausente fica acionável para o dono na conversa original, sem escalá-lo a outra conversa consigo mesmo.
- Aprender no próprio evento não o torna artificialmente obsoleto nem trava o despacho à conta. Uma observação isolada não agenda outra análise. O espaço máximo de saída da análise passa de 2.000 para 3.200 tokens, com reserva correspondente; teto diário, modelo, provedor e número de chamadas permanecem configurados como antes.

## Verificação e revisão

286 verificações SQL/RLS no PostgreSQL descartável por socket Unix, sem DSN; 266 testes Python dirigidos e 29 testes Node passaram. SSR verifica rótulo, atribuição, separação de cliente e controles da memória. Lint dirigido sem problemas; lint completo terminou com zero erros e 361 avisos anteriores. Build temporário passou, sem tocar dist/ZIPs operacionais.

Revisões independentes de contato e aprendizado encerraram seus achados: veto/citação, quote privado, pendência invisível, invalidação pelo próprio aprendizado, leitor legado e autor fora do catálogo. Relatórios privados e hashes estão no registro de evidência. Nenhum teste usou IA paga, mensagens à equipe, dados reais ou banco produtivo. A leitura produtiva anterior foi apenas diagnóstico do vínculo ausente, sem corrigir dados.

Comandos dirigidos: `python3 scripts/atlas-manager-integration/verify.py`; módulos Python listados no registro privado `.local/atlas-learning-routing-20261028/python-verification.json`; `node --test scripts/atlasLearning.test.mjs scripts/atlasMemoryRender.test.mjs scripts/atlasPortfolio.test.mjs scripts/atlasManager.test.mjs`; lint e `npm run build:check`. Não usar discovery amplo das pastas Atlas, que contêm testes antigos de API.

## Publicação futura e limites

Exige autorização específica desta entrega. Antes, reler operação/release vigente, verificar concorrência/fontes e perfil produtivo. Aplicar somente `20261028115736_atlas_observed_learning.sql` e depois `20261028115827_atlas_natural_owner_contact.sql`, uma vez cada. As migrações aplicadas `20261027170137`/`20261027193803` permanecem intactas. Há 13 arquivos de produto no manifesto; publicar consumidores frontend/Edge e runtimes Atlas afetados conforme seus imports, sem repontar serviços concorrentes por suposição.

Sem replay coletivo de mensagens antigas, aprendizado retroativo em massa, reconstrução por títulos, ativação de clientes ou mudanças em limites/credenciais. Falta observar um ciclo humano real: análise com observação elegível, memória visível, consulta à conta, retorno à origem e correção/revogação efetiva na próxima análise. Não foi feita inspeção visual nova de navegador; SSR não certifica layout em todos os dispositivos. Observações só cobrem fontes incluídas nas análises existentes; não representam leitura universal nem regras confirmadas.
