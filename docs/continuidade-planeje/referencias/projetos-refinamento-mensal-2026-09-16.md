> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Projetos: entrada mensal simplificada

Implementação no ambiente de teste, em 16/09/2026.

**Registro histórico da entrada mensal inicial.** Depois desta entrega foram acrescentados pendências visuais automáticas com mês inicial, quatro marcos no mês anterior, projetos de vários meses e visões Agora/Meus planos. O estado consolidado está em [Continuidade do Planeje](../README.md); não interpretar a lista de etapas/fluxos abaixo como limite da versão atual.

## O que a pessoa encontra ao entrar

- Mês de referência, com anterior, próximo e retorno ao mês atual.
- Quantos clientes ainda não têm planejamento escrito.
- Quantos projetos existem no mês e quantos têm plano iniciado.
- Materiais concluídos em relação a todos os materiais definidos no plano.
- Projetos por etapa: Planejamento, Aprovação, Execução, Concluído e Pausado.
- Lista compacta dos projetos do período, com ações para ler o plano ou abrir materiais e tarefas.

O indicador de clientes sem plano abre as pendências, com a ação de criar para cada cliente. Essa lista fica disponível quando solicitada, para que os projetos existentes continuem visíveis na entrada. A pesquisa também encontra clientes que ainda não têm projeto no período.

## Regras dos dados

- O mês vem de `mes_referencia`, e não do nome do projeto ou da data de criação.
- Um projeto vazio não é um planejamento. Somente cadastrar materiais também não registra a estratégia do mês. Documentos e informações de planejamento existentes são considerados.
- Clientes sem plano são contados uma vez, mesmo se possuem mais de um projeto no mesmo mês.
- As etapas são os status registrados nos projetos; o painel não altera esses status automaticamente.
- O progresso usa o vínculo entre a tarefa e o material. Tarefas avulsas não aumentam o progresso. Materiais ainda sem tarefa permanecem no total, e uma tarefa duplicada não duplica a conclusão do material.
- A conclusão respeita os status finais configurados em Tarefas.
- Materiais legados no formato anterior também entram no total.
- A visão começa nos clientes da etapa Fechado, com opção de ver todos os clientes.

## Fluxo de acesso

- Ver plano abre o documento em popup, com acesso à edição.
- Montar plano abre a edição do documento de um projeto já criado.
- Criar plano recebe o cliente e o mês selecionados. O formulário sugere um nome e começa em Planejamento; após criar, abre a escrita do documento.
- Abrir projeto mantém o acesso aos materiais e às tarefas.
- O mês escolhido fica guardado durante a navegação.
- A análise detalhada continua disponível como acesso secundário.

## Validação

Build de produção aprovado. Testes de regras mensais e de resumo do plano aprovados, incluindo múltiplos projetos por cliente, planos vazios, materiais sem estratégia, vínculos explícitos, duplicidade de tarefas e status finais personalizados. Navegação por mês, criação com período preenchido e abertura direta do documento conferidas no navegador.

Sem migração SQL nesta alteração. Publicação exclusiva no ambiente de teste.
