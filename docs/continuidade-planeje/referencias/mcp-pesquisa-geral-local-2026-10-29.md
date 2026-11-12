# MCP: pesquisa geral por cliente — 29/10/2026

**Atualização de 30/10/2026:** versão 2.9.0 publicada com migração incremental de evidências e consultas reais verificadas. A [referência de produção](mcp-pesquisa-geral-producao-2026-10-30.md) substitui as pendências de ativação e a previsão sem SQL abaixo; o texto restante preserva o estado local original.

Implementação local autorizada por Josias com “vamos fazer isso então”. Publicação, teste produtivo e aceite de uso continuam pendentes. Complementa o [leitor paginado anterior](mcp-mensagens-sem-teto-local-2026-10-26.md); nenhuma adaptação depende de um cliente específico.

## Comportamento entregue

`ver_mensagens_rastreamento` consulta inbox, sent e `cliente_whatsapp_webhook_log`. Interpreta os formatos atuais Chatvolt (incluindo canal Zapper), Meta e Uazapi. Omitir telefone percorre o cliente inteiro; `inicio`/`fim` usam a data da mensagem em São Paulo, incluindo contatos antigos que voltaram a conversar. Canal, direção e busca literal são filtros opcionais. Quando não existe horário original confiável, a resposta identifica o horário de registro usado como alternativa.

O limite de 1–500 controla cada página, não o histórico total. O cursor assinado vincula cliente, filtros, ator e corte de registro. Páginas sem fala também avançam; lotes Meta continuam dentro do mesmo registro sem perder itens. O GPT deve seguir `continuacao` até `concluido=true`, sem pedir autorização por página. Se interromper, deve declarar análise parcial.

Cada mensagem informa origem, identificador, direção, canal conhecido, horário e evidências. A reconciliação exige ID e identidade compatíveis; textos repetidos não são motivo para apagar mensagens. IDs Uazapi legados são associados ao ID completo somente quando o payload do próprio registro comprova o vínculo; `message_id_armazenado` conserva o valor legado. Divergências de texto são informadas com suas versões. Canal desconhecido ou vínculos ambíguos não são adivinhados. Mensagens Meta sem remetente/destinatário não herdam o telefone de outro item do lote.

O caminho futuro de saída do `uazapi-inbox-webhook` deixa de cortar o texto em 500 caracteres. Para registros antigos, o leitor recupera texto maior quando há evidência correspondente preservada no log. Não houve backfill nem regravação de mensagens existentes.

Mídias retornam apenas metadados/URLs disponíveis e seguras, sem download, visão ou transcrição. Payloads brutos não são devolvidos. A marca de expurgo do histórico ou de outra evidência correspondente impede recuperar anexos de um log ainda não expurgado.

`consultar_historico_cliente` pesquisa origens, observações do Mini CRM e canais. Origens e observações aceitam contato opcional, período e cursor sem teto total. Observações legadas sem data são identificadas e não atribuídas artificialmente ao período. Canais são um catálogo atual; rejeitam período/contato e não comprovam cobertura histórica.

O catálogo OAuth passa de 58 para 59 ferramentas. As instruções ao GPT orientam combinar ficha, rotina semanal, situação do tráfego, integrações, mensagens e históricos. Não foi criado SQL genérico nem outro sistema de tarefas.

## Permissões

Todas as ferramentas registradas passam pelo gate central de conta, módulo e papel. Erro na leitura de permissões nega a consulta. A conta é revalidada; o cursor não concede acesso após revogação. Ferramentas novas sem política são negadas a usuários não superadmin. Os limites mais restritivos de dono/responsável nos handlers existentes permanecem.

Superadmin conserva o acesso amplo. Colaboradores usam os módulos habilitados e seus escopos: relatórios ficam em `self` por padrão, inclusive para admin, salvo autorização `all`. O dossiê omite seções bloqueadas; Caixa pessoal e agregações respeitam a pessoa. No MCP, cobertura derivada exige **Tarefas e Projetos** habilitados nos três acessos (dossiê, resumo e aba). É uma restrição conservadora adicional em relação à página Cobertura, autorizada por Tarefas no frontend; não é uma nova ACL genérica de tabelas.

A lista de clientes usa a projeção pública já existente e preserva `total`. O smoke operacional do dossiê recebeu o novo argumento de acesso, mas não foi executado: carrega ambiente e pode consultar produção.

## Verificação e revisão

- `npm run test:mcp`: 91 testes locais, SDK instalado e transporte fictício; inclui 50.000 mensagens sem teto, limite interno menor, cursores, projeções, mídias expurgadas, lotes Meta, fontes exclusivas, duplicação, ambiguidade e duas contas com o mesmo telefone.
- `node --test scripts/mcpToolkitTypes.test.mjs`: 18 testes de compatibilidade, fallbacks, dono/responsável e destinatários, com fixtures de conta/permissões atualizadas.
- `node scripts/miniCrmMessageWebhooks.test.mjs`: 59 casos dos handlers reais compilados com transportes isolados; inclui saída Uazapi maior que 500 caracteres.
- Typecheck, lint dirigido/tipado e integridade documental registrados na evidência local. Avisos de tamanho preexistentes permanecem; não foram rebaixadas regras.
- Revisão sensível independente comparou a baseline privada da etapa, porque as fontes MCP já estavam não rastreadas no Git. Relatório privado fora do repositório: `~/.codex/reviews/planeje-mcp-general-20261029.md`. Achados de canal, IDs, agregação, legado Meta e expurgo tiveram correções e regressões.

Logs e hashes de fonte ficam em `.local/mcp-general-20261029`; não contêm mensagens de clientes nem segredos. A documentação pública de filtros foi consultada via Context7 e confrontada com o SDK instalado; a projeção foi exercitada por fetch fictício. Não há prova de latência/plano de consulta no banco produtivo.

## Limites e ativação

A conclusão confirma a varredura das fontes declaradas disponíveis no corte, não a captura de tudo que já existiu nos provedores. Logs apagados, textos historicamente cortados sem outra cópia, mídias indisponíveis e formatos futuros não podem ser reconstruídos por inferência. O corte não congela edições/exclusões concorrentes. Eventos sem ID confiável permanecem separados. `total_lidos` conta mensagens devolvidas; `registros_examinados` conta eventos percorridos.

Conversas por UUID exigem vínculo explícito com a conversa; para uma investigação abrangente de atendimento, prefira cliente/telefone. Fontes sem vínculo ou sem telefone exigem análise das lacunas, não atribuição automática.

Após autorização específica, reconciliar esta candidata com a fonte e operação vigentes, publicar o MCP e o ajuste do webhook, conferir schemas HTTP/OAuth e validar leitura autenticada. Nenhuma migração nova ou bundle de frontend faz parte desta entrega. Reinício pode exigir reconexão do conector e renovação do catálogo; comprovar isso na ativação. Não publicar o checkout inteiro nem reaplicar migrações antigas.
