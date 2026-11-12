# UTMs na ficha e origem pela mensagem do link — 14/10/2026

Josias solicitou analisar um contato que veio do Linktree e exibir suas UTMs. Depois de explicar o vínculo por código, ele pediu a alternativa pela frase. A implementação foi publicada com o código ainda desligado.

## Diagnóstico conferido

- A ficha reaproveitava `utm_campaign`, `utm_medium` e `utm_content` como nomes de campanha, conjunto e anúncio. Origem e termo não tinham campos separados.
- O contato indicado não tinha UTMs recebidas no payload; só metadados operacionais no `tracking_data`. Os cliques recentes do link tinham três UTMs configuradas, mas nenhum estava ligado ao telefone, pois a mensagem não levava código.
- A primeira mensagem recebida era exatamente igual à mensagem completa do único link ativo do cliente, no canal correspondente. Isso permite reconhecer o link pela mensagem; não comprova qual clique individual originou o contato.
- O link estava classificado por padrão como Meta → site. A configuração foi corrigida para Site para esse caminho do Linktree, sem inferir anúncio pago.

Dados completos do contato, mensagens, configurações e backups permanecem somente na release privada na VPS. Esta referência não contém telefones, conteúdo de atendimento ou payloads reais.

## Comportamento publicado

1. A ficha tem cinco campos próprios: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`, com cópia dos valores. Ausência aparece como Não informado; sem nenhum campo há um estado vazio. Dados de anúncio ficam separados e usam nomes reais disponíveis, sem relabelar UTMs. Linktree aparece como origem na ficha quando o vínculo ao link está registrado.
2. Mensagem sem código pode identificar um link se o texto completo corresponder a uma única mensagem configurada entre os links ativos do mesmo cliente e se o canal conferir. Aceita diferenças de caixa, espaços e quebras de linha; não busca só trecho genérico. Frase duplicada, cliente/canal errado, grupo, mensagem enviada pela equipe, catálogo truncado ou falha de consulta não produzem vínculo.
3. Código de clique e atribuição já recebida têm prioridade. CTWA, Google e outras atribuições anteriores não são substituídas pela frase. Metadados como número da linha e nome do contato deixam de impedir a primeira atribuição válida; metadados e etiquetas são preservados.
4. A origem por mensagem grava o link, o método `initial_message`, o identificador da mensagem recebida e o momento do registro, com as UTMs da configuração do link. Não grava `ctwaClid`, `gclid`, código de atendimento ou clique individual inventado e não marca um clique por proximidade de horário. A ficha explica a procedência dos valores.
5. O contato indicado foi ajustado uma vez usando sua primeira mensagem recebida e o mesmo resolvedor. Seus demais campos, horários, dados comerciais e histórico foram preservados. O registro diferencia o ajuste posterior (`planeje_link_attribution_backfilled`) de uma captura feita no recebimento original. Outros contatos antigos não foram atualizados em massa.
6. O texto e o código desligado do link foram mantidos. O formulário informa que, sem código, a origem depende de mensagem completa e exclusiva e que as UTMs vêm da configuração do link.

## Verificação e implantação

- Fonte, plugins, configuração e assets correntes conferidos contra o último candidato publicado (`ab564283` / `cb906053`). Candidato isolado, sem incluir CS/Assessoria ainda não publicada ou o `.env.production` legado.
- Sete scripts Node passaram, incluindo dez casos executando os handlers reais dos dois webhooks em ambiente fictício, com banco e transportes substituídos. Cobertura: novo contato, metadados anteriores, ambiguidade, atribuição Meta preservada e texto diferente. Nenhuma chamada de transporte real ou dado operacional de teste.
- Casos puros adicionais cobrem canal/cliente errado, duplicação, link inativo, código prioritário, fromMe/grupo, destino manual conferido, limite de consulta, origem sem dados, UTMs em fontes diferentes e nomes oficiais de anúncio separados.
- Duas funções TypeScript compiladas com suas dependências locais. Build do candidato passou; tokens embarcados somente com papel `anon`.
- Componentes reais em prévia fictícia conferidos em notebook e celular: cinco campos, placeholders, nota do método, separação Meta/UTM, rolagem e conversa acessível. Sem erro de console. Navegador autenticado em produção confirmou o contato indicado e seus campos, sem editar dados comerciais ou enviar mensagem.
- UPDATE pontual do contato com guarda de metadados/UTMs vazias e verificação dos campos não relacionados. Correção pontual do uso padrão desse link e da categoria desse contato. Não há migração de esquema; a tabela de contatos não tinha trigger de envio na conferência.
- Somente dois handlers e o novo módulo compartilhado foram sincronizados em `/opt/supabase-planeje/volumes/functions`; `supabase-edge-functions` reiniciado para carregar o código. GET de saúde das duas rotas retornou 200, sem POST de mensagem real.
- Índice, assets novos e anteriores conferidos por HTTP e bytes. Assets antigos preservados; Atlas segue `monitor_enabled=false`.

Release: `/root/planeje-releases/rastreamento-utms-20261014-01`; backups e reparos privados em `before/`, `repair-contact.sql` e `correct-link-origin.sql`. Índice anterior também em `/var/www/planeje/index.html.bak-rastreamento-utms-20261014-01`.

Produção: `index.0298c2a9.js` / `index.94bf622f.css`. [Recarregar Leads](https://planeje.jbapex.com.br/?v=0298c2a9#/rastreamento?aba=leads). [Manifesto](../evidencias/releases/rastreamento-utms-2026-10-14.json) · [Evidências](../evidencias/rastreamento-utms-testes-2026-10-14.json). Imagem do caso real fica na pasta local ignorada `.local/rastreamento-utms-20261014`, fora da documentação portátil.

Sem envio WhatsApp/CAPI/e-mail, escrita em tarefas ou mudança de credenciais/transporte. Aceite de uso ainda pendente. A frase identifica a configuração do link, e não parâmetros particulares de um clique; para campanhas que variam UTMs no mesmo texto é necessário usar mensagens distintas ou o código. Frases iguais não devem ser usadas para links de origens diferentes do mesmo cliente. Mudança da configuração atual do link não reconstrói o histórico passado automaticamente. CS/Assessoria continua não publicada e seu próximo candidato deve incluir esta revisão.
