# CRM IA — comparação por tela e correção de Conversas

## Estado em 12/11/2026

Correção de navegação publicada às **01h02 BRT**, na release `crm-ia-conversas-lista-20261112-01/candidate`. A sessão autenticada confirmou duas conversas do mesmo contato em canais distintos, antes e depois de abrir o chat. As linhas agora mostram o canal; retornar e reabrir preservou o rascunho, e a fila permaneceu no canal escolhido. O rascunho sintético foi apagado, sem envio.

As dez áreas principais foram abertas e comparadas com o ScaleOS. A inspeção desta rodada foi parcial dentro de cada área: abrir uma tela ou formulário não certifica todas as suas gravações. A homologação integral, a configuração operacional dos agentes e o aceite de Josias continuam pendentes. A [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md) permanece aberta.

## Resultado por tela

| Área | Conferido na sessão | Diferença ou trabalho restante |
| --- | --- | --- |
| Painel | Carrega; mudar de 30 para 7 dias atualiza datas, totais e destinos com conta/período. O seletor de datas tem identificação acessível. | Falta a visão Parceiros, primeira resposta/entregas e detalhe de atendimento por pessoa. Gerações/tokens não equivalem a respostas entregues. |
| Funil | Configuração e editor de etapa abrem; nome, cor, ícone e tipo estão presentes. Cancelar retorna ao configurador. Cadastro vazio é bloqueado. | A configuração usa modal, enquanto a referência usa aba. Escritas e movimentos não foram executados em produção nesta rodada. |
| Leads | Busca encontrou o registro do contato de teste; filtros, ordenação, tamanho e colunas estão disponíveis. Desligar/religar a coluna ID funcionou. | A sessão iniciou com 12 colunas; a referência mostrava sete. A seleção do CSV local foi bloqueada pela extensão, sem mudar sua permissão. Parser/revisão/importação têm testes com fixtures, mas a revisão do arquivo não foi concluída pelo navegador. |
| Conversas | Busca por contato, cabeçalho, histórico, rascunho, retorno e fila conferidos. A correção mantém a lista e identifica o canal. | O contato de teste sem vínculo comercial continua informado como tal. Não inferir oportunidade, remetente humano ou IA sem prova. Envio/resposta/follow-up real continuam pendentes. |
| Agentes IA | Três editores e rascunhos privados existentes abrem. Cadência e regras do Concierge estão disponíveis. | No funil inspecionado do JB APEX não havia agentes publicados. Ainda falta montar e homologar o fluxo operacional. A base usa texto único, sem as cinco seções/cobertura da referência; catálogo não oferece pastas/fontes/importação. O Concierge não tem controle independente para desligar FAQ e manter agenda. |
| Agenda | Lista e semana alternam; intervalo semanal correto. Novo compromisso consulta horários e retorna ausência de disponibilidade para o atendente escolhido. | A grade não oferece criação pelo horário como a referência; disponibilidade não tem acesso direto pela Agenda. O link usa “Conectar” mesmo quando a conexão está ativa. Nenhum evento criado nesta rodada. |
| Disparos | Ambos informam indisponibilidade para a conexão QR Code. | Isso é paridade da indisponibilidade, sem certificação de envio em massa. |
| Rastreabilidade | O atalho abre o Rastreamento na conta correta; Voltar retorna ao CRM. | Configuração, Conversões e Links permanecem fora da casca CRM, enquanto a referência os reúne dentro dela. Reutilizar os controles canônicos ao integrar. |
| Modelos | Biblioteca vazia coerente; editor de funil abre, adiciona etapa e cancela sem salvar. | Editor atual oferece nome/cor/remoção; faltam ícone, reordenação e prévia do Kanban observados na referência. |
| Configurações | Grupos e seções navegam. Google conectado, calendário autorizado listado. Modo de teste ativo; autonomia, captura e distribuição desligadas. Entrada WhatsApp oferece canal/destino/tags. | Faltam roletas por número/formulário e entradas Meta/Sites e Portais. “Incluir leads existentes sem responsável” distribui registros; não equivale ao controle de visibilidade dos leads sem dono do ScaleOS. Não alterar ACL por inferência. |

Diferenças de contagem entre contas não indicam defeito por si. A comparação é de dados oferecidos, mecânica e contratos, preservando os registros de cada produto. Nenhum dado de cliente, telefone autorizado, grant ou conteúdo de ambiente foi copiado para este documento.

## Correção publicada

`CrmIaConversations.jsx` usava `channel_id` tanto para selecionar o chat quanto para filtrar a lista. Selecionar uma linha reduzia o recorte ao seu canal e apagava `offset`; Voltar removia apenas o contato, deixando o canal como filtro implícito.

O par `contact_id`/`channel_id` identifica o detalhe. `list_channel_id` identifica o filtro explícito, conservando o payload existente do servidor. Links antigos com canal e sem contato continuam filtrando; ao abrir uma linha, esse filtro é preservado. Links de Painel/ficha com contato e canal continuam abrindo o mesmo histórico. Abrir/voltar mantém busca, período, responsável e página. A fila continua recebendo uma cópia do par selecionado. Nomes de canal aparecem no texto e na identificação acessível; texto longo usa reticências sem alargar a lista.

Não houve mudança no backend, autorização, entrega, schema ou regras de autoria. O componente de conversa embutido continua usando o mesmo contrato.

## Verificações e publicação

- Cinco cenários reproduziram as falhas antes da correção. Depois passaram 61 testes React de contratos/controles, mais 30 regressões de shell, preview, conversa embutida e modelo. Rede externa bloqueada nas suítes de interface.
- `npm run check` terminou com saída zero, incluindo lint, tipos, regras, testes locais e build temporário. Permanecem avisos não impeditivos de qualidade/tamanho e build; esta entrega não reorganiza arquivos alheios para eliminá-los.
- Revisão independente dos três diffs, links legados, filtro A/detalhe B, fila, paginação, falhas e revogação terminou sem achados acionáveis. Guardas do publicador e cenários descartáveis de promoção/rollback também passaram.
- Prévia isolada confirmou duas linhas com seleção aberta, fila/Esc e retorno com rascunho. No iframe de **390 CSS px**, a largura de rolagem também era 390; voltar/reabrir conservou o rascunho e o segundo canal mostrou somente sua mensagem sintética.
- A candidata herdou `gestor-rotina-20261112-01`, com **2.149 fontes**, perfil e flags produtivos. Somente `CrmIaConversations.jsx`, `CrmIa.css` e `ui-contract.test.mjs` foram sobrepostos. Das 20 dependências locais examinadas, 19 coincidiam; a única diferença era o ícone local do acesso Atlas no sidebar. A candidata preservou o sidebar vivo.
- Na VPS, seis guardas do publicador, 13 testes Node puros e build passaram, com 28 artefatos. O runtime QA React temporário não existe na VPS; os testes React foram locais, com as dependências e a exceção descritas acima.
- Promoção e verificação terminaram com saída zero. **42 verificações HTTPS** confirmaram hashes da raiz, Atlas e assets novos/anteriores. Perfil, runtime, unidades e inícios dos serviços foram preservados. **Sem SQL ou reinício.**
- Chrome autenticado na versão publicada: duas linhas com canais identificados, uma conversa aberta, retorno e rascunho preservados, fila do canal correto, um h1, largura/rolagem **1440/1440 px**, sem alertas; compositor vazio ao final.

HTML SHA-256: `c20fb0de1fe03114831114dc08ec8f6f20cc818104814a4fb5039c6112109bd1`. Entrada publicada `index.63577490.js`; CSS global herdado `index.2df522b9.css`. A próxima publicação deve herdar esta release ou uma sucessora conferida. Não repetir preparo/promoção; não reaplicar as migrações anteriores do CRM.

Recibos privados em `.local/crm-ia-homologacao-telas-20261112-01/` e `/root/planeje-releases/crm-ia-conversas-lista-20261112-01/`. `audit.json`, `verification-local.json`, `ui-production.json`, as revisões e os recibos de `publicacao/` distinguem inspeção, validação e publicação. As capturas de prévia usam dados sintéticos; a captura produtiva fica privada. Não houve envio, geração de modelo, evento Google, importação ou alteração de configuração nesta rodada.

## Continuação do objetivo

Completar as diferenças registradas, construir os agentes sobre as bases e funis canônicos e homologar somente com os destinos já autorizados. A captura independente de agente e a distribuição por origem precisam de validação e publicação próprias; a correção de interface não as inclui. Reusar o executor, a fila e os registros existentes. A implementação privada do ScaleOS, seu modelo e sua engenharia interna não podem ser certificados pela inspeção visual; a equivalência deve ser demonstrada pelos comportamentos observáveis e testes do Planeje.
