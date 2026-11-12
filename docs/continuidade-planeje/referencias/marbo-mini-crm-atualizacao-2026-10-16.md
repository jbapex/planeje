# Marbô Noivas — atualização do Mini CRM em 16/10/2026

Atualização de dados aplicada às 16h09, São Paulo, após Josias fornecer a versão nova da planilha já importada anteriormente. O pedido foi manter o padrão do Planeje e atualizar os leads existentes, incluindo os novos. Josias confirmou expressamente que a data do agendamento deve preencher Data da venda apenas em vendas realizadas.

## Resultado

243 linhas da aba CRM correspondem a 223 contatos, após consolidar 20 repetições por telefone. Foram atualizados 183 contatos e incluídos 40; o total produtivo passou de 234 para 274. Os 51 contatos anteriores fora da planilha foram preservados. A segunda conciliação, já contra os dados gravados, resultou em zero atualizações e zero inclusões pendentes.

Os números brasileiros foram comparados com DDD e variação do nono dígito; os internacionais permaneceram completos. Em duas correspondências com cadastros preexistentes nas duas grafias, o número completo exato selecionou o registro a atualizar. Nenhum contato antigo foi unido ou excluído. Linhas marcadas REPETIDO não substituíram o preenchimento comercial; nomes humanos prevaleceram sobre identificadores LID. As repetições tinham etapas compatíveis; observações distintas de um mesmo contato foram conservadas juntas.

## Conversão para o padrão atual

Não foram recriados os três status removidos da configuração da loja.

| Informação na planilha | Resultado no Planeje |
| --- | --- |
| Lead Qualificado | Em Atendimento e Qualificado = Sim |
| Agendado | Agendado e Qualificado = Sim |
| Em Negociação | Em Negociação e Qualificado = Sim |
| Não Respondeu | Follow Up e Não respondeu = Sim |
| Não Compareceu | Follow Up e Compareceu = Não |
| Lead Desqualificado | Lead Desqualificado e Qualificado = Não |
| Venda Perdida | Venda Perdida, conservando as evidências de qualificação existentes ou o agendamento registrado |
| Venda Realizada | Venda Realizada, Qualificado = Sim e valor comercial da planilha |

Agendamento registrado ou comparecimento confirmado também informa qualificação, exceto quando a própria planilha desqualifica explicitamente o contato. Comparecimento Pendente limpa apenas a marca de comparecimento; não conclui atendimento. Campos vazios da planilha não apagam dados existentes. Retornos, histórico dos retornos e prazos de acompanhamento foram preservados, sem criar tentativas novas.

As 18 vendas realizadas receberam Data da venda igual à data do agendamento. A rotina conserva uma data de venda já preenchida; não atribui data de venda aos outros leads. A planilha não forneceu horário de agendamento, portanto nenhum horário foi inventado. Nomes fornecidos pela planilha foram guardados na cópia de apresentação usada pelo Mini CRM, protegida de substituição pelo nome recebido do WhatsApp.

Dos 223 contatos conciliados, 128 ficaram qualificados e 47 com a marca Não respondeu. Distribuição das etapas: 47 Em Atendimento, 51 Follow Up, nove Agendado, três Em Negociação, 18 Venda Realizada, 47 Venda Perdida e 48 Lead Desqualificado.

## Proteções e verificação

Foi salva cópia privada anterior local e na release de produção antes da gravação. A simulação usou tabelas temporárias. A transação produtiva verificou o cliente exato, a configuração, os valores anteriores e a quantidade de linhas de cada alteração; uma edição concorrente relevante interromperia toda a aplicação. Todos os contatos anteriores, vínculos de canal, atribuição/UTMs e campos não previstos foram preservados. Contagens e hashes das conversas recebidas/enviadas foram iguais dentro da transação. Esquema, gatilhos, consultoras, cores, colunas e cadência permaneceram iguais.

Leitura posterior verificou os 223 contatos e os campos importados. Nova conciliação confirmou idempotência. Navegador autenticado no próprio login Marbô Noivas confirmou a grade com 274 contatos, o filtro com 18 vendas e amostras de datas de agendamento/venda iguais; o filtro foi restaurado para Todos os status. Imagem do resumo foi salva sem nomes ou telefones.

Sem mudança de código do produto, build, migração, credenciais, papéis, serviços ou reinício. Não foram chamadas rotinas de envio WhatsApp, IA ou CAPI. Não foi criada mensagem nem conversa. O aceite de uso pelo usuário/equipe continua pendente.

Operação e dados privados: `.local/marbo-refresh-20261016` e `/root/planeje-releases/marbo-crm-refresh-20261016-01` na VPS de produção. Não copiar registros individuais ou backups para a documentação.

[Registro agregado](../evidencias/releases/marbo-mini-crm-atualizacao-2026-10-16.json).
