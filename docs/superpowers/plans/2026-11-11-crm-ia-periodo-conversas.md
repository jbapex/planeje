# CRM IA — período de Conversas

Execução nativa pelo coordenador com `superpowers:executing-plans`, sobre a release `crm-ia-leitura-20261111-01`. Correção autorizada dentro do pedido integral; publicação condicionada à validação e à base produtiva vigente.

## Contrato e escopo

O Painel já publica `since`/`until` nos atalhos. A lista de Conversas deve repassar esses valores ao leitor existente, preservar os filtros suportados por esse leitor ao buscar/selecionar/paginar e permitir conferir/editar o período sem adicionar uma barra permanente ao cabeçalho compacto. Sem datas na URL, manter o padrão de sete dias em America/Sao_Paulo. O banco continua validando datas e aplicando o período depois da última mensagem.

Reusar `dateRange`, `CrmIaField`, detalhes de filtros e URLSearchParams. Não alterar banco, agentes, dados, permissões ou transporte. A consulta do estado individual é separada da lista e já tem fallback por `messages.state`; seu enriquecimento de atendente para conversas históricas continua pendente. Nenhum novo mecanismo de estado nesta correção.

Arquivos: `CrmIaConversations.jsx`, teste existente `ui-contract.test.mjs`, evidência e continuidade. Alterar a fixture somente se seu contrato não reproduzir os filtros usados; ler os consumidores antes. A ficha de Leads também monta a conversa individual e deve continuar funcionando.

## Aceitação e execução

- [x] Acrescentar teste de entrada pelo período do Painel e observar RED; cobrir datas/filtros, seleção, paginação e alteração de período com reset de offset.
- [x] Repassar filtros no payload da lista e apresentar período em detalhes recolhíveis. Ausência de acesso não consulta a lista.
- [ ] Fechar revisão e build da candidata; testes dirigidos58/58 e lint passaram. Prévia320/390/1280×800, detalhes abertos e ausência de transbordamento conferidos.
- [ ] Publicar somente o frontend sobre a candidata vigente com perfil e fontes preservados; sem migration ou reinício. Conferir Painel→Conversas na sessão real e registrar evidência/limites.

Verificações: `node --test --test-concurrency=1 scripts/crm-ia/ui-contract.test.mjs scripts/crm-ia/ui-conversation-controls.test.mjs scripts/crm-ia/ui-embedded-conversation.test.mjs scripts/crm-ia/preview-contract.test.mjs`; lint dos arquivos afetados; `npm run verify:context`; build produtivo na candidata. Testes usam renderer/fixture sem transporte real.
