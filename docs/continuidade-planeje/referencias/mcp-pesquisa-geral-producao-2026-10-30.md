# MCP: pesquisa geral publicada — 30/10/2026

Josias autorizou migração e publicação com “Pode publicar”. Versão **2.9.0**, ativa e conferida às **00h22 de São Paulo**. Release privada `/root/planeje-releases/mcp-general-20261030-02`. Complementa o [contrato local](mcp-pesquisa-geral-local-2026-10-29.md).

O leitor reúne inbox, sent e webhooks Chatvolt/Zapper, Meta e Uazapi para qualquer cliente autorizado. Cada chamada retorna uma página de 1–500; não há teto total. Seguir `continuacao` até a conclusão. Texto completo quando preservado, direção, horário, origem e evidências são retornados. `consultar_historico_cliente` lê origens, observações do Mini CRM e canais. Conta, módulo e papel são revalidados em cada página, preservando escopos pessoais.

O webhook Uazapi passou a preservar o corpo enviado completo. Mensagens antigas não foram regravadas; texto maior é recuperado quando outra evidência correspondente existe. Mídia expurgada não é reidratada; visão/transcrição não fazem parte desta entrega.

## Banco e operação

O preflight inicial encontrou URI longa e timeout ao buscar IDs no JSON bruto. A projeção `cliente_whatsapp_webhook_message_ids` agora fornece referências indexadas. Ela é privada a `service_role`, com RLS, GIN e gatilho interno. Cliente e snapshot são filtrados tanto na projeção quanto na leitura do log original por chave primária.

Migração **20261029163156** aplicada uma vez; **333.813 registros** escritos no preenchimento histórico e **zero referências faltantes** na conferência. Não reaplicar. Esquema anterior salvo na release privada. Gatilho `SECURITY DEFINER` em `private`, `search_path` vazio, referências qualificadas e sem execução para usuários comuns.

Vinte arquivos seletivos e um runtime Edge promovidos; dependências produtivas, ambiente e frontend preservados. Apenas MCP e Edge reiniciados. A primeira ativação recebeu HTTP 503 transitório após restart e restaurou automaticamente todos os arquivos, conferidos por hashes. A segunda ativação aguardou prontidão e passou; SQL não repetido. Cinco serviços Atlas preservados. Zero mensagens enviadas pelo teste.

## Verificação

- 92 testes MCP locais e na candidata VPS, incluindo 50 mil mensagens sem teto e IDs longos; oito testes do publicador passaram.
- Typecheck e lint tipado sem erros; avisos preexistentes permanecem.
- PostgreSQL temporário com fixtures: migração, backfill, gatilho, inserção autorizada, atualização, remoção e grants conferidos.
- Antes e após ativação: duas contas reais, duas páginas de mensagens por conta, origens, observações e canais. Dezesseis consultas à projeção e zero buscas de evidência por JSON bruto. Supabase somente GET.
- Catálogo OAuth em transporte MCP interno: 59 ferramentas. Permissões reais de colaborador lidas. Endpoint público saudável em 2.9.0 e chamada sem credencial negada com HTTP 401.

Evidências sem conteúdo de clientes: [migração](../evidencias/releases/mcp-pesquisa-geral-2026-10-30/migration.json), [publicação](../evidencias/releases/mcp-pesquisa-geral-2026-10-30/published.json), [preflight](../evidencias/releases/mcp-pesquisa-geral-2026-10-30/preflight.json), [verificação](../evidencias/releases/mcp-pesquisa-geral-2026-10-30/verification.json). Revisão incremental privada: `/Users/josiasbonfimdefaria/.codex/reviews/planeje-mcp-evidence-index-20261030.md`.

## Próximo uso e limites

Reconectar/atualizar o Planeje no GPT para renovar OAuth e catálogo. O agente não executou a consulta HTTP autenticada pela sessão do usuário: não existe chave administrativa configurada e nenhuma credencial foi criada. As leituras produtivas passaram pelo SDK MCP interno com identidade superadmin atual validada no banco. Aceite humano pendente.

Logs apagados, conteúdo nunca capturado, texto cortado sem cópia, mídias indisponíveis e formatos futuros não são recuperados por inferência. A conclusão confirma a varredura das fontes retidas declaradas; o GPT deve informar qualquer análise parcial.
