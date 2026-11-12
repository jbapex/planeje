# Atlas: auditoria operacional de somente leitura — 17/10/2026

Auditoria autorizada por Josias nesta conversa, realizada por SSH na VPS de
produção entre 22h00 e 22h05 de São Paulo. Escopo: configurações, vínculos,
responsáveis, tarefas, filas, transcrições e serviços existentes. Todas as
consultas SQL usaram transação `READ ONLY`, com encerramento sem commit.
Não houve chamada à IA, envio, criação de tarefa, aplicação de migração,
reinício de serviço ou publicação. Este documento guarda somente agregados
e conclusões técnicas, sem nomes, IDs ou conteúdo de clientes.

## Conclusão

O leitor e as políticas do gerente estão ativos, mas ainda não há evidência
de um ciclo operacional real com a equipe. A existência do escritório e de
pedidos classificados não comprova acompanhamento de execução. O caminho
mais curto é completar e validar o fluxo atual, preservando Tarefas como
fonte oficial, antes de acrescentar agentes ou outro motor.

## Fatos observados

| Área | Resultado da leitura | Consequência |
| --- | --- | --- |
| Política | Leitura, `assist`, equipe e criação após esclarecimento ligadas | Não é uma pausa global das funções do gerente |
| Carteira selecionada | 24 clientes; 17 com grupo explícito; 13 com responsável interno resolvido; apenas 9 com ambos | Faltam 7 vínculos de grupo e 11 definições de conta; não preencher por inferência |
| Tarefas dos clientes selecionados | 56 abertas em 14 clientes; 39 com prazo vencido; 2 sem prazo; 1 sem responsável; 5 com pelo menos um responsável inativo | O estado oficial precisa orientar os próximos acompanhamentos; os conjuntos se sobrepõem |
| Acompanhamento do gerente | Nenhuma das 56 tarefas tem conversa ativa do Atlas; nenhuma resposta de integrante da equipe registrada | O ciclo conta → executor → revisão ainda não foi comprovado |
| Tarefas sem cliente | 59 no total, sendo 2 abertas; as 2 também não têm vínculo recuperável pelo projeto | Leitura por `client_id` não alcança essas tarefas; não deduzir cliente pelo título |
| Áudios recentes | 106 áudios nos grupos vinculados desde a habilitação, todos com transcrição concluída | A transcrição recente está funcionando na amostra delimitada |
| Áudios históricos | 18 referências sem transcrição, de julho a setembro, em 8 grupos; todas anteriores à habilitação | A cobertura os trata como pendência atual, embora não entrem na janela de transcrição |
| Memória | 35 memórias ativas vinculadas aos 24 clientes | O conhecimento anterior continua salvo; disponibilidade no banco não prova seu uso em cada etapa |
| Limite | 83.337 de 1.000.000 tokens registrados no dia; reserva zero; 3 tentativas | A auditoria não consumiu análise nem alterou a contagem |

No recorte havia 26 lotes `queued`, cobrindo 17 clientes. São versões de
análise, não 26 tarefas nem 26 chamados. Havia também lotes antigos bloqueados
ou com erro; o erro global atual estava vazio. Contagens podem mudar pelo
worker, que continuou ativo durante a leitura.

Era sábado. O próximo horário calculado para contato automático era
segunda-feira, 19/10, às 08h. Não há horários individuais cadastrados; vale o
padrão 08h–17h. Isso explica o adiamento dos contatos, mas não substitui a
validação do ciclo real. A ação manual do dono fora do expediente continua
separada do contato automático com a equipe.

## Causas e limites encontrados no código

1. **Acompanhamento existente ainda não armado.** O worker da equipe percorre
   conversas abertas. O leitor de eventos pode avaliar prazos e tarefas no
   contexto de um grupo, mas não há garantia de que toda tarefa aberta vire
   acompanhamento. Não interpretar um contador de tarefas como cobrança ativa.
   Fontes: `scripts/atlas-events/server.py` (`scan`, `open_accounts`) e
   `scripts/atlas-team-pilot/server.py` (`scan`).
2. **Histórico indisponível e áudio novo usam a mesma indicação de pendência.**
   `assemble` marca qualquer áudio sem transcrição como cobertura parcial;
   `atlas_audio_enqueue` respeita a data de habilitação e a janela máxima.
   Um áudio antigo pode, portanto, manter o aviso mesmo com os áudios recentes
   completos. Isso não autoriza inventar seu conteúdo nem transcrever todo o
   passado automaticamente. Fontes: `scripts/atlas-events/context.py` e
   `20261009043258_atlas_group_audio_transcripts.sql`.
3. **O limite de cinco assuntos ainda carrega a revisão manual antiga.**
   `validate` redireciona todos ao dono quando o resultado tem exatamente cinco
   itens, mesmo sem comprovar um sexto pendente. Os cinco achados atuais têm
   essa marcação. Reprodução local confirmou quatro itens → conta e cinco →
   dono. O orquestrador gerenciado resolve o destinatário novamente; `route`
   sozinho não prova que o dono foi chamado. A política de cobertura e a
   decisão do gerente precisam ser coerentes, sem contornar fontes essenciais
   ausentes. Fonte: `scripts/atlas-events/context.py` (`validate`).
4. **A memória antiga não é reaproveitada diretamente pelo gerente em conversa.**
   O leitor de grupos consulta `atlas_memories`; já
   `atlas_manager_knowledge` retorna apenas resumos de respostas do dono
   concluídas no novo fluxo. Não havia requests desse fluxo aplicados.
   O gerente pode voltar a perguntar algo já guardado anteriormente. A correção
   precisa separar fatos operacionais compartilháveis de memória privada,
   sem entregar todas as memórias à equipe. Fonte:
   `20261017034308_atlas_manager_intake.sql` (`atlas_manager_context`,
   `private.atlas_manager_knowledge`).

Um registro manual antigo também aponta para uma tarefa indisponível. Sua
causa não foi determinada; nada foi recriado, arquivado ou corrigido por
suposição. Tipos de serviço e entregáveis existem nos 24 cadastros; esta
auditoria não valida se o texto corresponde ao contrato de cada cliente.

## Próxima entrega proposta

1. Corrigir a distinção entre fonte histórica indisponível, áudio novo pendente
   e cobertura de assuntos; manter trilha de fontes e revisão onde faltar
   informação essencial. Não remover verificações apenas para reduzir avisos.
2. Preparar reaproveitamento de conhecimento operacional anterior, com origem,
   cliente e versão, preservando a conversa privada do dono.
3. Completar os vínculos e responsáveis que faltam usando confirmação humana
   única por cadastro; não obrigar o dono a delegar cada pedido posterior.
4. Acoplar as tarefas abertas ao acompanhamento existente, sem duplicar tarefa,
   executor, prazo ou status. Primeiro validar um único ciclo com a conta:
   pedido → esclarecimento → tarefa pertinente → executor → retorno → revisão.
5. Mostrar no escritório e na caixa os registros reais desse ciclo e a próxima
   ação. A validação só é aceita quando a equipe consegue responder e o Atlas
   continua sem repasse manual do dono. Escopo/verba/conhecimento ausente
   continuam sendo exceções dirigidas ao dono.

Esses itens são proposta de trabalho, não implementação ou publicação desta
auditoria. Contato real com a equipe, IA e alteração produtiva precisam do
escopo específico da próxima execução. As regras de dias úteis e o orçamento
configurado permanecem vigentes.

## Verificação e alcance

- Seis arquivos centrais de eventos/equipe tiveram SHA-256 comparado com os
  diretórios carregados pelos respectivos serviços: iguais ao checkout lido.
- Serviços Atlas, escritório, eventos e equipe ativos. Heartbeats recentes;
  nenhum evento JSON de falha de varredura foi encontrado no recorte do dia
  examinado dos serviços de eventos/equipe. Isso não é uma auditoria completa
  de logs ou infraestrutura.
- Graphify determinístico usado para orientação; os 1.273 arquivos do manifesto
  estavam sem alteração ou ausência. SQL e estado produtivo foram verificados
  fora do grafo; nenhum backend de IA do Graphify foi acionado.
- `PYTHONPATH=scripts/atlas-events:scripts/atlas-team-pilot python3 -m unittest
  test_context test_manager test_rules`: **85 testes passaram**. Reprodução
  adicional com dados sintéticos confirmou as classificações de cinco assuntos
  e cobertura parcial.
- Sem teste de conversa, transcrição ou criação real nesta auditoria. Sem
  comprovação de qualidade semântica de todos os pedidos, conteúdo dos anexos,
  contrato ou aceite da equipe. Nenhum build necessário: código de produto
  permaneceu intacto.
