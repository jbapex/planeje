# Gestor IA publicado no Planeje

Publicado em 08/11/2026, às 02h35 em America/Sao_Paulo, por solicitação de Josias. A entrada **Gestor IA** fica no rodapé da lateral e abre o ambiente com Métricas, Carteira, Decisões, Relatórios e Conectores. [Abrir Gestor IA](https://planeje.jbapex.com.br/#/gestor-ia/metricas).

O Gestor usa clientes, contas, resumos e tarefas do Planeje. Contas e BM exibe dados de cobrança quando a Meta informa e o perfil autoriza. Links de cadastro, conta, metas, tarefa e relatório abrem os editores existentes. O quadro de Decisões mostra regras do Planeje e tarefas autorizadas. A abertura de um rascunho deixa a gravação para o botão Salvar.

A nova função `gestor-ia-meta` valida sessão ativa, papel administrativo, módulo, acesso ao cliente, permissão de leitura e vínculo ativo antes de acessar a Meta. As respostas não trazem URLs de paginação nem credenciais. A carteira mantém a ACL da Central de Tráfego e respeita o escopo por responsável do módulo Tarefas. A árvore Meta pede até 50 campanhas e 25 itens em cada nível interno por retorno. Ela pode apresentar um subconjunto em contas maiores.

**Análise com IA em validação.** A interface foi compilada com a análise generativa desligada e a função da OpenAI ficou fora da publicação. O [piloto anterior](gestor-ia-scaleos-checkup-2026-11-07.md#decisões-com-ia) terminou sem sugestão validável. O quadro continua operacional para sinais de regra e tarefas.

## Verificação

Passaram 50 testes do Gestor, 89 verificações React, 24 testes do publicador, lint sem erros e 27 testes na candidata de produção. Na sessão autenticada, a candidata retornou indicadores reais, evolução, campanhas e árvore de Contas e BM. Conferimos o atalho de Relatório e abrimos e cancelamos um rascunho com o cliente selecionado. Depois da promoção, confirmamos a entrada pelo menu, Decisões e Conectores. As operações de edição e os relatórios gerados foram exercitados com fixtures. Aceite humano pendente.

## Base e recuperação

A candidata atual é `/root/planeje-releases/gestor-ia-20261108-02/candidate`. Ela herdou o perfil da release `rastreamento-conversa-canais-20261106-01` dentro da VPS e conciliou 1.826 fontes. O build gerou 15 artefatos. A entrada usa `index.f8099cd5.js` e `index.a54e9381.css`. O SHA-256 do HTML é `cd34a3fb35968bdd2218b0734d642cbe3840d90ab850dd7a11f84282eeb53270`.

Os quatro checks HTTP e de integridade cobriram o HTML, o JS, o CSS e a página do Atlas. Os artefatos anteriores e os processos de produção foram preservados. A publicação não aplicou migração, não chamou a OpenAI e não gravou registros de clientes. A página temporária da candidata foi retirada.

O recibo `published.json`, o manifesto de fontes e a cópia anterior do HTML ficam na pasta privada da release. Em uma recuperação, conferir os hashes vigentes e reverter somente os arquivos desta publicação para preservar alterações concorrentes.
