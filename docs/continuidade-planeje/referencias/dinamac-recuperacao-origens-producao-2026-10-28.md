# Dinamac: recuperação de origens antigas — produção de 28/10/2026

**APLICADO E VERIFICADO às13h54 de São Paulo.** Josias autorizou “faça isso e já
publique na vps também”, após a explicação sobre recuperar origens antigas com
evidência salva. A autorização abrange esta operação na Dinamac; não amplia o
escopo a outros clientes ou a reenvio de conversões.

[Plano e contrato](../../superpowers/plans/2026-10-28-dinamac-recuperacao-origens.md) ·
[Evidência sanitizada](../evidencias/releases/dinamac-recuperacao-origens-2026-10-28.json) ·
[Histórico já publicado](rastreamento-historico-origens-producao-2026-10-28.md).

## Resultado

Inseridas **18 evidências em17 contatos existentes**: **11 Google Ads**, todas com
GCLID e UTMs originais, e **7 Site**, uma com UTM e seis sem esses parâmetros.
Sete contatos já tinham origem principal, preservada. Os outros dez receberam a
primeira origem comprovada. Datas de clique/mensagem/recebimento foram mantidas;
a data de registro no histórico indica a recuperação.

A auditoria leu8.222 logs retidos da Dinamac, desde08/10, e654 contatos. Candidatos
limitados a recebimentos anteriores à ativação do histórico, em28/10 às11h35m39s
de São Paulo; toda conversa retida foi considerada para verificar identidade.
Nove entradas com código não tinham contato existente e duas não comprovaram o
vínculo da conversa. Permaneceram fora; não foram recriados contatos apagados.
Frases como “vim pelo site”, sozinhas, não autorizaram Google, GCLID ou UTMs.

Uma nova auditoria retornou **zero candidatos**. A consulta confirmou ausência
de chaves duplicadas. O total geral do histórico também recebeu eventos naturais
durante a conferência; as18 entradas desta operação foram verificadas por origem,
datas e instante de registro. Não confundir o total vivo com o tamanho deste lote.

## Operação publicada

Utilitário isolado em
`/root/planeje-operations/dinamac-attribution-20261028-01/recover.mjs`, bundle
SHA256`b72b9de67f718b36b777c33ff25920229a36e34f8e66210a9f6f3006adccfa73`.
Auditoria é o padrão; aplicação exige o hash do plano revalidado. O lote aplicado
tem SHA256`e60af522def994a9cb92b6c92636029f11f8b7193de5ea163a8062ed487f0f44`.
Resumo de auditoria, aplicação e manifesto ficam privados na mesma pasta;
nenhum payload, telefone ou GCLID bruto foi copiado para esses registros.

Código original → clique exato do mesmo cliente → telefone inequívoco → contato
existente. Reutiliza os leitores e a RPC publicados. Donos conflitantes são
verificados mesmo quando não têm contato ou chegam depois do corte. Códigos
ambíguos e replays contraditórios falham fechados. Não há associação por nome,
proximidade de horário ou configuração atual do link.

Claim e persistência rodam na mesma transação SERIALIZABLE. O snapshot de fontes,
contatos, cliques, histórico e contrato de banco é revalidado antes das escritas;
locks protegem contatos/cliques e alterações de triggers. Mudanças anteriores ao
snapshot ou disputa das linhas abortam todo o lote. Eventos novos posteriores
podem ser ordenados depois da recuperação; não se bloqueia a chegada dos webhooks
de todos os clientes para manter uma fotografia permanente.

Não houve replay do handler, envio de mensagem, automação ou conversão Google/Meta.
Não houve migração, troca de frontend, build do produto ou restart. Mantida a base
Atlas12h14, HTML SHA256`c41a7e2397c70a8f86e131d28e1db895f70495b3609853f6356f102ea45df947`;
cinco serviços Atlas ativos e Edge saudável após a operação.

## Validação e limites

Passaram12 testes do planejador, três scripts de leitores compartilhados,
57 cenários dos handlers e fixture PostgreSQL16 por socket descartável:
snapshot alterado, preservação do cadastro/primeira origem, claims atômicos,
rollback, repetição e edição concorrente. Contexto e sintaxe também passaram.
Não foi repetido o build do frontend, pois nenhum código de UI foi alterado.

A revisão independente reproduziu dois P2 de ambiguidade, corrigidos e
retestados; nenhum P2+ ficou aberto. Também executou UTM contendo delimitador SQL
como texto literal e conferiu privilégios imutáveis do histórico. Relatório
privado fora do repositório, SHA256
`641c5b84f5b73d6ccd09e7fa35ae5910ed97420672efb748c9bd20f36a28411f`.

Na sessão autenticada, a ficha de um caso antigo da análise passou a mostrar
Google Ads, `google/cpc`, campanha e histórico do clique em27/10 às20h42.
A conferência não alterou marcações comerciais. Dados ausentes no clique/log
não podem ser reconstruídos com segurança. Aceite de uso de Josias permanece
distinto da verificação técnica.
