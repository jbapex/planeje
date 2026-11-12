**Atualização:** publicação autorizada e concluída em29/10,01h17. [Resultado produtivo e limites](rastreamento-origem-consistente-producao-2026-10-29.md). As seções abaixo preservam o registro da etapa local.

# Rastreamento: origem consistente entre lista e ficha — local

29/10/2026. Implementado e verificado localmente; não publicado. Pedido atual: validar a origem real de contatos cujo `utm_source` é Linktree/chatgpt.com, mas cuja lista mostra Meta Ads.

## Diagnóstico e contrato

Consulta restrita, somente leitura, no cliente indicado confirmou um link ativo configurado com origem Meta Ads e Source Linktree. O contato tem vínculo ao link pela mensagem inicial, sem GCLID ou CTWA. A tabela aceitava a classificação bruta Meta; a ficha já tinha uma exceção Linktree. Não houve perda da UTM nesse caso. Não foi alterada a configuração do link nem qualquer registro.

A leitura compartilhada aplica a compatibilidade de Linktree com vínculo Planeje, sem Google/CTWA, também à lista, filtros, estatísticas, relatórios e CSV. Site com Source mostra seu nome, como chatgpt.com. A primeira origem reconhecida prevalece sobre heurísticas posteriores; origens Google legadas e anúncios Meta com CTWA são preservados. Mini CRM mantém seu rótulo Meta Link existente. O histórico, backend e envios de eventos não foram modificados.

## Escopo e aceitação

Cinco arquivos de produto: contactFromWebhookPayload.js, rastreamentoTrackableLink.js, rastreamentoLeadFicha.js, ContatosPage.jsx e ClienteCalendarioPage.jsx. Novo teste scripts/rastreamentoOriginConsistency.test.mjs. Sem dependências ou esquema novos.

Critérios conferidos: Linktree aparece igual na lista/ficha; Source personalizado Site não vira Meta por sinal posterior; Google/Meta reais permanecem em seus grupos; Site legado com GCLID posterior continua Site na lista/CSV/ficha/filtros; calendário não esconde Linktree rastreado quando não rastreados estão desligados; entradas não são mutadas.

## Verificação

- Doze scripts de domínio passaram: origem consistente, ficha, links, Mini CRM (17 cenários), relatórios Meta/Google/Site, Visão geral/origens, cockpit, histórico, CSV e eventos Meta.
- Regressões observadas antes das correções: Linktree contado como Meta; Google legado substituído por Linktree; calendário ocultando Linktree. A revisão reproduziu também Site legado substituído por GCLID posterior nos mapeamentos reais; o teste agora executa esses trechos da página.
- Lint dos cinco arquivos: zero erros, dois avisos anteriores em ContatosPage. Build temporário final passou; nenhum dist/ZIP operacional promovido.
- Revisão independente concluiu os três P2 resolvidos, sem achado remanescente; relatório privado referenciado na evidência.
- CUA, fixture isolada sem Supabase/transporte: quatro rótulos corretos; Site=2, Meta=1, Google=1. Tabela real extraída preserva Nome180px, Ver dados e coluna Funil oculta.

[Evidência e hashes](../evidencias/rastreamento-origem-consistente-local-2026-10-29.json).

## Limites e próxima etapa

A VPS não recebeu esta correção. Publicação depende de autorização específica para o trabalho atual, conforme AGENTS.md. Se autorizada, reler operação/release e concorrência vigentes, compor apenas este delta sobre a fonte produtiva atual e herdar o perfil produtivo. Não promover o ContatosPage local inteiro nem Visão geral local não publicada. A publicação Atlas mais recente registrada é 29/10,01h01; confirmar novamente antes de preparar candidata.

Sem backfill, regravação de origem/histórico, alteração de link, migração, restart ou envio real. Celular físico e calendário autenticado não foram certificados; a visibilidade do calendário foi testada com a função real e fixtures. Aceite humano ainda pendente.
