# MCP: contexto de auditoria — incremento local de 30/10/2026

**Atualização:** versão 2.9.1 publicada às 01h19, migração aplicada uma vez e 507.177 registros processados. A [referência de produção](mcp-auditoria-contexto-producao-2026-10-30.md) substitui as pendências de publicação abaixo; o restante conserva o estado local original.

Implementação autorizada por “vamos para proximo passo então”, após o teste do GPT. **Local, não publicado.** Produção continua MCP 2.9.0 da [release anterior](mcp-pesquisa-geral-producao-2026-10-30.md).

## Comportamento

- Período usa projeção de intervalos com índice GiST, filtrada por cliente/fonte e snapshot. Cada intervalo inclui a gravação e as datas explícitas reconhecidas do registro. Preserva importações tardias e lotes Meta; o filtro final mantém o dia civil de São Paulo, inclusive DST histórico. Registros sem relação temporal deixam de consumir páginas do GPT.
- Horários com espaço SQL e offsets `-0300`/`-03` são reconhecidos. Fuso ausente e data inválida não são adivinhados; `horario_origem=registro` permanece explícito quando não há data original reconhecida. Campos `em` e `registrada_em` continuam distintos.
- `autoria` informa `cliente`, `humano`, `automacao` ou `nao_identificado`, com evidência. `sent_by` prova envio por usuário identificado; o novo `sender_kind` é gravado pelo caminho autenticado do handler. API, texto, nome e ausência de remetente não provam automação. Conflitos ficam não identificados. Isso identifica o caminho/responsável pelo envio, não quem redigiu intelectualmente a mensagem. Histórico sem prova não é reclassificado.
- Áudios podem trazer `transcricao` existente e completa, estado, fonte e data, marcada automática. Somente proprietário autenticado do Atlas ativo, módulo permitido, conversa de grupo atual do mesmo cliente e fonte inbox correspondente não expurgada. Conta/módulo e bloqueio/arquivamento são conferidos. Chave administrativa não substitui identidade pessoal. Não gera transcrições ou cobra modelo. Falha da fonte é erro explícito.
- Cursor passa a `mensagens-v3`; uma pesquisa iniciada na versão anterior deve ser reiniciada após a ativação.

## Esquema e publicação futura

Nova migração `supabase/migrations/20261030035326_mcp_message_research_dates.sql`, gerada pelo CLI e testada somente em PostgreSQL temporário. Cria projeção privada, estado inicial não pronto, índices/gatilhos nas três fontes e coluna opcional de autoria em sent. Não reaplica a migração 20261029163156 já publicada.

Ordem operacional: aplicar migração uma vez; preencher cada fonte com `private.mcp_backfill_message_dates(source,after,size)` em lotes de até 1000, avançando pelo `last_id` até `written=0`; chamar `private.mcp_finish_message_dates()` para conferir cobertura e ativar o estado. Depois validar candidata com leituras reais e promover MCP/handler de envio. Antes de prontidão, uma consulta por período retorna erro, nunca uma conclusão vazia falsa. O backfill só escreve na projeção, não nas mensagens. Gatilhos sincronizam tráfego novo.

## Verificações

98 testes MCP aprovados; incluem consulta sem atravessar 300 registros antigos, importações tardias, DST, lotes Meta e 50 mil mensagens sem teto. Testes adicionais executam migração, prontidão, gatilhos, batches, grants e construção real da persistência humana/automática. Auth existente do envio e 59 casos de entrada também passaram. Typecheck/lint tipado sem erros, com 11 avisos preexistentes.

Plano: [2026-10-30-mcp-auditoria-contexto](../../superpowers/plans/2026-10-30-mcp-auditoria-contexto.md). Revisão sensível privada do implementador: `/Users/josiasbonfimdefaria/.codex/reviews/planeje-mcp-auditoria-contexto-20261030.md`.

Publicação/migração produtivas deste incremento ainda exigem autorização específica conforme AGENTS. Não foram geradas transcrições novas nem feita auditoria/planilha de cliente. A cobertura continua limitada a conteúdo retido e autorizado; candidatos temporais podem incluir falsos positivos de lotes mistos, eliminados no filtro final.
