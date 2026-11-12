# MCP: contexto de auditoria publicado — 30/10/2026

Josias autorizou com “pode sim”. **Versão 2.9.1 publicada e verificada às 01h19 de São Paulo.** Release privada `/root/planeje-releases/mcp-context-20261030-01`, sobre a 2.9.0. [Contrato implementado](mcp-auditoria-contexto-local-2026-10-30.md).

## Resultado

Consultas por período usam candidatos no índice temporal GiST, com cliente/fonte/snapshot e filtro final na data normalizada. Preserva importações tardias, lotes e DST histórico. Páginas podem conter menos mensagens após reconciliação/filtros; não há teto total e a continuação deve ser seguida até conclusão.

Horários explícitos com espaço SQL ou offset compacto passam a ser reconhecidos. Ausência de fuso e data inválida mantêm fallback de registro. `autoria` distingue cliente/humano/automação quando há evidência; a API sozinha não prova bot, conflitos e histórico sem prova ficam não identificados. O caminho de envio passa a gravar `sender_kind`; não foram retroclassificadas mensagens antigas.

`transcricao` retorna conteúdo existente completo, estado e fonte, marcado automático, somente ao proprietário atual autorizado do Atlas e na conversa de grupo correspondente do mesmo cliente. Bloqueio, arquivamento, fonte e expurgo são verificados. Nenhuma transcrição nova foi gerada. Não estende o acesso privado a colaboradores ou à chave administrativa.

## Banco e publicação

Migração **20261030035326** aplicada UMA VEZ. Backfill: **110.245 inbox**, **62.655 enviadas**, **334.277 logs**; total **507.177 registros** processados. Finalização verificou cobertura/identidade/data das três fontes e habilitou `ready=true`. Gatilhos sincronizam entradas/alterações/exclusões; lotes históricos bloqueiam suas fontes contra atualização concorrente. Não reaplicar SQL nem repetir o backfill por presumir pendência.

RLS ativa nas duas tabelas internas; `anon`/`authenticated` sem SELECT, `service_role` autorizado. Índices GiST/ordem/PK válidos. Esquema anterior guardado privadamente na release. Apenas 14 arquivos seletivos e o runtime `uazapi-send-message` promovidos; versões das dependências preservadas. MCP e Edge reiniciados com espera de prontidão. Frontend, ambiente e cinco serviços Atlas preservados por conferência de hashes/estado.

## Evidências

- 98 testes MCP passaram na candidata VPS, incluindo 50 mil mensagens e regressões de acesso/cursores/mídia.
- Migração e persistência dos dois caminhos de envio testadas em fixtures; auth existente do envio e 59 casos dos webhooks passaram localmente. Typecheck e lint sem erros, com avisos preexistentes.
- Pré e pós-publicação: mensagens/históricos reais de dois clientes. Cada consulta temporal de teste devolveu seis mensagens examinando dez registros, usando o novo índice.
- Uma transcrição existente autorizada foi lida pelo helper produtivo: estado completed, automática, 471 caracteres. Somente metadados/contagem registrados na evidência, sem conteúdo ou identificação de cliente.
- Catálogo OAuth no transporte MCP interno: 59 ferramentas. Endpoint público em 2.9.1; chamada sem credencial retorna 401. Ausência de chave administrativa impediu smoke HTTP autenticado; sessão real do GPT permanece para validação humana.

[Migração](../evidencias/releases/mcp-auditoria-contexto-2026-10-30/migration.json) · [Publicação](../evidencias/releases/mcp-auditoria-contexto-2026-10-30/published.json) · [Preflight](../evidencias/releases/mcp-auditoria-contexto-2026-10-30/preflight.json) · [Verificação](../evidencias/releases/mcp-auditoria-contexto-2026-10-30/verification.json) · [Preservação](../evidencias/releases/mcp-auditoria-contexto-2026-10-30/preservation.json).

## Próximo uso e limites

Atualizar/reconectar o Planeje no GPT e iniciar nova pesquisa: cursores antigos `mensagens-v2` não continuam no leitor `mensagens-v3`. Solicitar período/cliente e seguir continuação até conclusão, declarando lacunas. Testes não equivalem à auditoria ou planilha completa de um cliente nem ao aceite de Josias.

Áudios sem transcrição existente continuam sem conteúdo analisável. Fontes externas sem prova de autoria permanecem não identificadas. Datas nunca capturadas e conteúdo apagado não são reconstruídos. O snapshot não congela edições/exclusões concorrentes. Nenhuma mensagem enviada pelo agente ou nova chamada de transcrição/modelo durante a publicação.
