# Funil em fluxo visual livre — 15/10/2026

**Disponível no TESTE integrado da porta 4320. NÃO publicado em produção. Conferência visual interativa e aceite pendentes.**

## Pedido aprovado

Após rejeitar a edição em cartões fixos, Josias descreveu uma área de nós onde pudesse desenhar o caminho, ver conexões e selecionar anúncios/conjuntos do cliente. “Beleza” autorizou construir essa revisão em teste. Não é autorização de publicação nem aceite da interface final.

## Comportamento entregue

- Na aba Funil, blocos livres de Campanha, Conjunto, Anúncio, Destino, Agendamento, Venda, Trabalho da equipe e Anotação. Adicionar por clique ou arrastar; mover e ligar pelos pontos. Permite ramificações e retornos. Nenhuma obrigação de quatro etapas.
- Clique no bloco abre edição lateral: nome, orientação, vínculo de catálogo, destino/indicador quando aplicável e trabalhos existentes. Clique na seta permite nomear ou retirar o caminho. Alternativa por seleção de destino para ligar sem arrastar.
- Ampliar, zoom/enquadramento, desfazer/refazer; modelo de agendamento opcional. Remover bloco/caminho altera somente o desenho. Substituição pelo modelo pede confirmação e mantém os trabalhos.
- Catálogo escopado por cliente e conta ativa, depois campanha → conjunto → anúncio, com limpeza dos descendentes ao mudar seleção. Botão explícito de vincular; miniatura, nome, situação consultada e data da referência. Respostas antigas de consultas são ignoradas após trocar cliente/bloco. Cache restrito ao leitor e à cadeia de pais.
- Vínculos são referências consultadas, não métricas ao vivo; desenhar setas não cria/edita campanhas e não comprova conversões. No teste, catálogo e criativos são inteiramente fictícios e locais. Chamadas externas continuam bloqueadas, inclusive quando o cliente não possui fixture.
- Trabalhos ligados ao bloco usam as ações e as tarefas existentes do plano. Novo trabalho entra no plano, responsável/prazo e execução usam os mesmos diálogos/RPCs. Progresso vem de tarefas e dependências de material/rastreamento. Retirar um trabalho sem tarefa no editor de detalhes também limpa a referência no desenho. Abrir o diálogo de tarefa reduz o modo ampliado para não cobri-lo; erros de salvamento aparecem no próprio fluxo.
- Mesmo `cs_save_plan`, rascunho, conflito de revisão e histórico de versões. Novo grafo em `sales_funnel.visual_flow`; campos antigos preservados. Cópia explícita do planejamento antigo disponível quando ainda não há desenho. Projetos tradicionais e Rotina mantidos.
- Leitor da IA inclui blocos, caminhos e tarefas relacionadas, com revisão, origem e indicadores de cobertura. Não ativa Atlas, modelo ou worker; desenho não cria outro motor de execução.

## Persistência e permissões

Migração nova `20261015040338_consulting_visual_flow.sql`, aplicada SOMENTE ao banco isolado `cs_integration`. Não reaplicar no teste nem promover para produção sem o procedimento futuro de candidato/publicação.

O guard valida projeto/cliente, versão, tipos, posição, ids, limite de 100 blocos/200 caminhos, arestas, referências às ações do mesmo plano e conta Meta ativa do mesmo cliente. Campos do vínculo têm lista permitida; credenciais não são aceitas. Funções privadas invoker sem EXECUTE para anon/authenticated, tabelas com RLS preservada.

A validação encontrou um defeito anterior: `FOR UPDATE` no projeto exigia permissão de alteração reservada ao proprietário e impedia o colaborador de salvar o plano/criar o trabalho. As três RPCs mantêm SECURITY INVOKER, verificações e RLS, mas serializam por trava transacional da assessoria. O gatilho de mudança de status usa a mesma trava antes de validar o ciclo. Não foi concedido UPDATE amplo de projetos. Acesso de equipe aprovada existente permanece; o usuário de teste chamado “denied” é colaborador da agência com restrição em Tráfego, não uma conta externa para CS. Uma conta temporária de cliente externo foi usada para verificar a recusa e removida.

Catálogo fictício adicionado somente a Aurora e Horizonte, preservando outras chaves de `entregaveis`; contas de exemplo vinculadas somente a eles. Aurora recebeu uma versão nova do desenho com campanha → conjunto → anúncio → WhatsApp → agendamento, ligando os dois trabalhos anteriores. Objetivo, ações e tarefas anteriores preservados. Snapshots de Casa D Noivas/Marbô não foram alterados.

## Evidências e limites

- 46 testes Node, incluindo regressões de execução, operação, quadro e leitor Atlas; 25 verificações de renderização estática.
- 50 verificações API: owner/colaborador, criação da mesma tarefa e demanda de tráfego, concorrência sem duplicação, salvamento de posição/retorno/vínculo, rejeições de grafos inválidos e conta de outro cliente, preservação de tarefas/ações ao remover bloco, versões, conflito e persistência após novo login. Projeto, três tarefas e conta externa temporários removidos; Aurora comparado antes/depois dos testes sem mudança.
- 17 verificações de leitura real na API isolada: contas/campanhas/conjuntos/anúncios fictícios, recusa de conta de outro cliente, miniatura local, grafo de cinco blocos/quatro caminhos no leitor IA e dois estados reais de trabalho (`waiting_client`/`in_progress`), zero chamadas externas.
- 20 verificações de catálogo de permissões/funções/gatilhos/RLS. Sem advisors cloud para este banco self-hosted; revisão manual e testes de API não são uma auditoria universal.
- Build completo e bytes de índice, JS, CSS e dois SVG conferidos por HTTP. `/functions/v1/meta-ads-api` continua respondendo 403 no teste. Assets anteriores conservados; sem restart de serviços.
- **Não foi feita conferência visual interativa.** O bloqueio anterior do controle do navegador por política de URL não foi contornado. SSR/build/API/HTTP não comprovam legibilidade, arraste ou gestos no navegador. Conferir computador/celular, conexões, edição, ampliação, retorno da tarefa e navegação antes de considerar aceite. Integração de catálogo Meta real preparada com ações de leitura existentes, mas não exercitada contra a Meta nesta rodada.

## Endereço e retomada

URL: `http://127.0.0.1:4320/?v=67d67abc#/projects/11111111-1111-4111-8111-111111110201/planner?plan=funnel`

Assets: `index-67d67abc.js` / `index-9bd06f7c.css`. Fonte reconciliada seletivamente em `/tmp/planeje-cs-integrated-20261014/candidate` e `/opt/planeje-cs-integration/candidate`; 19 arquivos conferidos por hash. Backup seletivo e índice anterior em `/opt/planeje-cs-integration/releases/fluxo-visual-20261015-01`. Definições SQL e plano de Aurora anteriores guardados em arquivos privados do ambiente isolado. Valores de credenciais não registrados.

Produção 109 intocada; último estado documentado `47519cec`/`2731d631`. Atlas segue pausado. Próximo passo: avaliação da nova experiência em teste e ajuste das dificuldades demonstradas; depois, candidato reconciliado completo, validação Meta autorizada e autorização própria para publicação.
