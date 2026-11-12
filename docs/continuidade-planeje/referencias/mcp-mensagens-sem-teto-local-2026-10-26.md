# MCP: mensagens sem teto total — entrega local, 26/10/2026

Josias autorizou aplicar a consulta de histórico sem limite total. Implementação
e validação locais concluídas; publicação e aceite produtivo pendentes. Esta
entrega não altera banco, allowlist OAuth, autenticação ou configuração de contas.

## Comportamento

`ver_mensagens_rastreamento` e `ver_mensagens_conversa` reutilizam o leitor
`planeje-mcp/src/messageHistory.ts`. Os caminhos de mensagens de `ler_aba` e
`consultar_rastreamento` usam o mesmo leitor e devolvem a ferramenta direta para
continuar. A primeira página passa a ser a mais antiga do recorte, seguida das
demais; leitores que antes buscavam apenas as últimas precisam seguir o cursor.

- `cliente_id` obrigatório; telefone opcional no Rastreamento; conversa ou chat
  obrigatório no Atendimento. O resumo genérico de Atendimento também respeita
  agora o cliente informado.
- `limite` é tamanho de página: padrão 100, máximo 500 nas ferramentas diretas.
  Ferramentas genéricas conservam seu máximo de 200. Não existe teto de páginas
  ou de mensagens acumuladas. Uma página pode vir menor que o solicitado.
- `cursor` continua o mesmo recorte. `inicio` e `fim` são datas YYYY-MM-DD,
  inclusivas em São Paulo, sem teto anual. Mensagens recebidas usam
  `msg_timestamp`, com fallback para `created_at`; enviadas usam `created_at`.
- Corpo completo, quebras de linha, IDs e metadados são preservados. O leitor
  legado de conversa conserva `body`, `created_at`, `direcao` e os campos
  opcionais de remetente, envio e confirmação disponíveis no esquema.
- `paginacao` informa retornados, total_lidos, proximo_cursor, tem_mais,
  concluido, ordem e registrados_ate. `total` continua sendo desta página.
  A página vazia final confirma `concluido=true`, inclusive quando o banco
  impõe um tamanho menor que o solicitado.
- `continuacao.ferramenta` e `continuacao.argumentos` permitem seguir sem
  reconstruir filtros nem repetir consultas Meta/Google do resumo genérico.
  A instrução MCP é continuar dentro do escopo autorizado sem pedir aprovação
  por página; uma interrupção deve ser comunicada como leitura parcial.

## Consistência, autorização e cobertura

Paginação por `(created_at,id)` em cada fonte, com fusão em ordem de registro
`created_at,fonte,id`. O campo `em` conserva a data original da mensagem. A
fronteira comum entre fontes impede saltos quando uma resposta tem menos
registros que o limite solicitado. Testes cobrem empates e microssegundos.

O cursor HMAC existente vincula cliente, telefone, período, conversa e ator.
Filtros ou identidade diferentes e adulteração são recusados. Validade de uma
hora, renovada a cada página; reinício do processo invalida cursores porque a
chave é efêmera. Nesses casos, reiniciar a consulta e deduplicar evidências por
fonte/ID; não afirmar que o novo total_lidos soma sessões anteriores.

O corte `registrados_ate` é fixado na primeira página. Não é snapshot
transacional: edição, exclusão ou inserção retroativa durante a leitura podem
alterar o conjunto. Novas mensagens após o corte exigem outra consulta.

As fontes são somente `cliente_whatsapp_inbox` e `cliente_whatsapp_sent`.
`cliente_whatsapp_webhook_log` continua ausente, incluindo mensagens mantidas
exclusivamente em logs Chatvolt/Meta. Rastreamento exclui recebidas de grupo;
enviadas podem incluir grupos vinculados ao cliente. A ferramenta de conversa
lê grupos apenas quando identificada a conversa/chat do cliente. Conteúdo de
mídia não é baixado, transcrito ou interpretado. Observações históricas do
Mini CRM não foram acrescentadas nesta entrega. `concluido=true` refere-se
somente às fontes e filtros declarados, não a tudo que existe no Planeje.

Permissões de módulo continuam verificadas; a ferramenta legada de conversa
passa a aplicar o guard existente de Atendimento. O catálogo OAuth não foi
ampliado: uma ferramenta desativada continua desativada. Mensagens são dados,
não instruções. Escritas e ampliação de escopo continuam exigindo autorização.
Uma falha em qualquer fonte falha a página inteira, sem sinalizar conclusão.

## Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run test:mcp` | 29/29; dez casos novos de histórico, incluindo 50.000 mensagens sem perda/duplicação na fixture |
| `test-live-consult.mjs` via tsx instalado | Passou |
| `test-hub-catalog.mjs` via tsx instalado | Passou; 53 abas |
| `node --test scripts/mcpToolkitTypes.test.mjs` | 18/18 |
| `npm run typecheck` | Zero erros |
| `npm run lint:typed` | Zero erros; 11 avisos existentes nos arquivos legados |
| ESLint nos seis módulos alterados | Zero erros; quatro avisos de tamanho em arquivos legados |
| Revisão independente somente leitura do delta | Perda de metadados legados corrigida e coberta por regressão; nenhum achado restante |

Testes usam SDK Supabase real instalado 2.105.1 com transporte fictício, sem
dados de cliente. MCP SDK 1.32.1 validou registro dos schemas, cursor/período e
anotação de leitura. Context7 consultado para ordenação composta e filtros OR;
a versão exata 2.105.1 não estava indexada. Documentação 2.x orientou a leitura,
e o pacote instalado foi exercitado pelos testes. Nenhuma dependência mudou.

Baseline do trabalho em `.local/mcp-history-20261026/before`, evidência e logs
no mesmo diretório; revisão privada fora do checkout. As fontes MCP já estavam
não rastreadas em HEAD, portanto a comparação foi contra cópias antes desta
tarefa. Trabalho local e entradas de continuidade concorrentes preservados.

Não executados: PostgREST/RLS/HTTP produtivos, auditoria de cliente real, build
Vite (sem alteração de frontend), migração, push ou publicação. Antes de ativar,
seguir a operação/release vigente e obter autorização específica de publicação.
Depois validar o contrato no MCP publicado e registrar o aceite separadamente.
