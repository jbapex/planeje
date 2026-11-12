# MCP do Planeje — tráfego Meta e comparação da Impacto

Data: 17/10/2026. Versão **2.8.1 PUBLICADA**, com HTTPS e consulta real pela fonte produtiva conferidos. Publicação e conferências finais registradas na [release](../evidencias/releases/mcp-trafego-impacto-2026-10-17.json).

Escopo exclusivo: este projeto e a VPS Planeje `72.60.14.109`, serviço PM2 `planeje-mcp`, diretório `/root/planeje/planeje-mcp`, endpoint `https://mcp.planeje.jbapex.com.br/mcp`. Nenhum acesso à VPS ou ao MCP Ápice CRM. Nenhuma mudança em campanha, conjunto, anúncio, orçamento, tarefa ou mensagem.

## Diagnóstico

`src/chatgptToolBudget.ts` desativava ferramentas fora de uma lista de 53 nomes quando a sessão era OAuth (`label=oauth`). `ver_resultados_cliente`, `ver_campanhas_pagas` e `listar_contas_meta_cliente` estavam registradas, mas fora dessa lista. O manifesto mostrava nomes desativados sem enumerar claramente o conjunto executável. Não foi necessário retirar autenticação, alterar papéis ou abrir acesso anônimo.

O comentário antigo afirmava um limite aproximado de 55 ferramentas do ChatGPT. Essa era uma decisão local, não uma restrição oficial comprovada pela auditoria. A lista agora preserva os 53 nomes anteriores e acrescenta as três consultas corrigidas e as duas novas: **58 executáveis no OAuth**, sem remover funcionalidades anteriores. O manifesto informa `nomes_executaveis` e `nomes_desabilitados`.

As três consultas têm origens diferentes. Na Impacto, o teste retornou **zero resultados comerciais diários registrados**, **zero solicitações internas em paid_campaigns** e **uma conta Meta vinculada**. Lista vazia nessas duas tabelas não significa ausência de mídia na Meta.

## Ferramentas e parâmetros

| Ferramenta | Parâmetros | Origem e comportamento |
|---|---|---|
| `ver_resultados_cliente` | `cliente_id` UUID obrigatório; `data_inicio`, `data_fim`; `limit` 1–500, padrão 90; `offset` ≥0, padrão 0 | Resultados comerciais registrados em `planeje.cliente_resultados_diarios`; não são Insights Meta nem dados de CRM externo. |
| `ver_campanhas_pagas` | `client_id`, `status`; `limit` 1–300, padrão 100; `offset` ≥0 | Solicitações internas em `planeje.paid_campaigns`. Colaborador vê somente solicitações de que é dono/responsável, conforme política existente. |
| `listar_contas_meta_cliente` | `cliente_id` obrigatório; `incluir_inativas` (padrão false); `limit` 1–100, padrão 50; `offset` ≥0 | Vínculos cadastrados em `planeje.cliente_meta_accounts`. |
| `consultar_trafego_meta` | `cliente_id`; `conta_id` `act_…`; `recurso`; `inicio`, `fim`; `campanha_id`; `nivel`; `granularidade`; `categoria_historico`; `limite` 1–100, padrão 50; `cursor` | Consulta de leitura à Marketing API Meta v24.0. |
| `comparar_periodos_meta` | `cliente_id`; `conta_id`; `inicio_anterior`, `fim_anterior`, `inicio_atual`, `fim_atual`; `campanha_id`; `limite` 1–100; `cursor` | Comparação de períodos de mesma duração, por conjunto, com grupos separados e ranking de campanhas. |

`recurso` aceita `contas`, `metricas` (padrão), `campanhas`, `conjuntos`, `anuncios`, `historico`.

- `contas`: vínculos ativos e inativos; não acessa a Meta. Sem `conta_id`, outros recursos selecionam a única conta ativa. Se houver várias ou nenhuma, informar explicitamente uma conta vinculada.
- `metricas`: `inicio` e `fim` obrigatórios, inclusivos, YYYY-MM-DD; entre 1 e 366 dias. `nivel`: `conta`, `campanha` (padrão), `conjunto`, `anuncio`. `granularidade`: `dia` ou `periodo` (padrão). Período usa alcance deduplicado retornado pela Meta, sem somar alcance diário.
- `campanhas`: identificadores, objetivo, status configurado/efetivo, orçamento, criação, atualização, início e término atuais.
- `conjuntos`: campanha, otimização, cobrança, destino, orçamento, segmentação, público personalizado, atribuição e datas atuais.
- `anuncios`: campanha/conjunto/anúncio e criativo, textos, hashes/IDs de mídia, URLs e UTMs disponíveis em `creative.url_tags` e destinos do criativo. Macros e variantes são preservadas.
- `historico`: datas obrigatórias; horário convertido pelo fuso da conta. `campanha_id` consulta a campanha e os identificadores de conjuntos/anúncios explicitamente enumerados no catálogo atual, após verificar pertencimento à conta. Há uma guarda de 200 objetos filhos; acima disso, usar o histórico por conta e cruzar `object_id` com o catálogo. Objetos excluídos sem vínculo recuperável podem exigir esse cruzamento por conta. Categoria opcional: `CAMPAIGN`, `AD_SET`, `AD`, `BUDGET`, `TARGETING`, `STATUS`, `AUDIENCE`. Eventos têm hora, tipo, objeto, autor, detalhes e estado de destino quando reconhecido.

Período aplica-se às métricas e ao histórico. Catálogo e vínculos são atuais; enviar datas nesses recursos é recusado com explicação. Para identificar entrega em determinado período, usar `metricas`; para campanhas criadas no período, usar `campanhas_criadas` na comparação.

As três consultas antigas retornam `paginacao.tem_mais` e `proximo_offset`. Nas novas, repetir os mesmos parâmetros e enviar `paginacao.proximo_cursor` até `tem_mais=false`. Cursores são assinados, vinculados aos filtros e vencem em uma hora ou no reinício. A comparação mantém uma fotografia por dez minutos, no máximo cinco fotografias em memória; se expirar, iniciar novamente sem cursor. Não trocar limite/filtros ao continuar uma página.

## Exemplos de chamada

Impacto: cliente `9196d07f-f0a8-4eb2-9f9a-3dade28d4a69`, conta `act_111670682252093`.

```json
{
  "ferramenta": "consultar_trafego_meta",
  "argumentos": {
    "cliente_id": "9196d07f-f0a8-4eb2-9f9a-3dade28d4a69",
    "conta_id": "act_111670682252093",
    "recurso": "metricas",
    "inicio": "2026-09-01",
    "fim": "2026-09-16",
    "nivel": "campanha",
    "granularidade": "periodo",
    "limite": 50
  }
}
```

Recorte real de uma linha dessa consulta (campos omitidos apenas neste exemplo):

```json
{
  "versao_schema": "1.0",
  "origem": "meta_marketing_api",
  "conta": {"id": "act_111670682252093", "currency": "BRL", "timezone_name": "America/Sao_Paulo"},
  "dados": [{
    "cliente_id": "9196d07f-f0a8-4eb2-9f9a-3dade28d4a69",
    "conta_id": "act_111670682252093",
    "campanha_id": "52529903626212",
    "conjunto_id": null,
    "anuncio_id": null,
    "inicio": "2026-09-01",
    "fim": "2026-09-16",
    "moeda": "BRL",
    "objetivo": "OUTCOME_ENGAGEMENT",
    "resultado_tipo": "profile_visit_view",
    "familia_resultado": "visitas_perfil",
    "metricas": {
      "investimento": 1248.74,
      "alcance": 112872,
      "impressoes": 156748,
      "visitas_perfil": 4322,
      "resultado": 4322,
      "custo_por_resultado": 0.2889264229523369
    }
  }]
}
```

Comparação solicitada:

```json
{
  "ferramenta": "comparar_periodos_meta",
  "argumentos": {
    "cliente_id": "9196d07f-f0a8-4eb2-9f9a-3dade28d4a69",
    "conta_id": "act_111670682252093",
    "inicio_anterior": "2026-09-01",
    "fim_anterior": "2026-09-16",
    "inicio_atual": "2026-10-01",
    "fim_atual": "2026-10-16",
    "limite": 50
  }
}
```

Recorte real, valores monetários arredondados aqui para leitura:

```json
{
  "origem": "meta_marketing_api",
  "investimento_total": {
    "anterior": 5753.02,
    "atual": 7456.97,
    "diferenca": 1703.95,
    "variacao_percentual": 29.618356967297153
  },
  "cobertura": {"metricas_completas": true, "catalogo_completo": true, "campos_indisponiveis": []}
}
```

A conferência final demonstrou que `add_children` da Meta retornava apenas o evento da campanha. A versão 2.8.1 usa `oid` e `extra_oids` explícitos: a campanha criada em 16/10 retornou 53 eventos, sendo um da campanha, 15 de conjuntos e 37 de anúncios. Esse caso real virou teste da entrega.

O retorno completo inclui `grupos_separados`, `campanhas` ordenadas pelo investimento atual, `campanhas_criadas`, histórico disponível, resumos por categoria (criação, status, pausas, ativações, orçamento, público, criativo, otimização) e indicação explícita de amostras truncadas. Eventos completos ficam em `consultar_trafego_meta/recurso=historico`, com paginação. Os totais da comparação percorrem todas as páginas Meta até a guarda de 100 páginas por origem; eventual interrupção aparece em `cobertura`.

## Contrato de métricas e cruzamento externo

As novas ferramentas retornam JSON em `content` e `structuredContent`, com `versao_schema`, origem, momento da consulta, datas, fuso/moeda da conta e identificadores como strings. Não existe chamada ou dependência de CRM externo.

Cada linha de métricas possui investimento, alcance, impressões, frequência, cliques, cliques de link, CPM, CTR, CPC, conversas iniciadas, custo por conversa, visitas ao perfil, custo por visita, resultado e custo por resultado. `ausentes` lista métricas null; `campos_indisponiveis` lista campos opcionais recusados pela Meta. Ações, custos e resultados originais da Meta são preservados, sem segredos.

Conversas usam exclusivamente `onsite_conversion.messaging_conversation_started_7d`; aliases não são somados. Visitas usam `instagram_profile_visits`. Resultado principal vem de `results.indicator`, sem inferir pelo nome da campanha ou misturar tipos. Famílias `mensagens`, `visitas_perfil`, `outros` e `nao_informado` são explícitas. Se múltiplas janelas de atribuição vierem, usa-se a janela default identificada; sem identificação inequívoca, o valor é null. Custos derivados são investimento/quantidade; não se calcula média simples de custos de anúncios. Divisão por zero dá null. CTR é o CTR de cliques totais da Meta, não CTR de link.

Comparação separa objetivo, otimização, resultado, moeda, atribuição e evidência do público atual. A consulta usa `action_report_time=impression` e `use_unified_attribution_setting=true`; a atribuição retornada acompanha cada linha. Alcance/frequência de grupos agregados são null para evitar duplicar pessoas. Usar consulta por conta/campanha, granularidade período, para alcance deduplicado.

## Segurança e operação

As cinco ferramentas são marcadas somente leitura. Conta/equipe ativa e papel atual são revalidados; consultas de permissão falham fechadas. As novas consultas Meta exigem módulo de tráfego e vínculo exato cliente/conta; solicitações internas respeitam dono/responsável para colaborador. Autenticação OAuth/token pessoal, identidade vinculada à sessão e verificações de revogação existentes são preservadas.

A credencial Meta permanece no servidor, obtida pelo leitor de segredo já utilizado pelo Planeje. Apenas endpoints GET fixos são permitidos. Nenhum URL de paginação recebido é seguido; usa-se somente o cursor na mesma origem fixa. Erros não retornam credencial, URL autenticada ou mensagem bruta do provedor. Cursores são assinados e dados de resposta passam por remoção de segredos. Nenhuma migração ou permissão do banco foi alterada. Dependências/versões instaladas foram preservadas pelo lockfile existente; somente a versão do pacote foi atualizada.

Backup e guarda de concorrência abrangeram 20 arquivos na entrada e 22 na correção final do filtro de histórico do MCP. Só arquivos próprios da entrega são promovidos. Apenas `planeje-mcp` é reiniciado. Não há publicação de frontend nem reinício de Supabase, Atlas ou Nginx.

## Verificação e limites

- **18 testes Node aprovados**: datas, métricas ausentes/zero, ações sem duplicação, custo ponderado, separação de objetivos/tipos/moedas/atribuição/públicos, UTMs/macros, dados sensíveis, cursores, conta/papel/permissões, endpoints somente GET, erros, paginação e catálogo OAuth.
- Regressões de conta ativa, catálogo do hub e consulta ao vivo existentes executadas.
- Teste HTTP do candidato: cinco consultas reais, três argumentos inválidos recusados e dois acessos sem credencial válida recusados com 401. A credencial administrativa do teste é efêmera e só existe no processo candidato; não altera a configuração produtiva.
- Consultas reais da Impacto: contas, campanhas, conjuntos, anúncios/criativos, métricas de setembro/outubro, diário/acumulado, paginação, filtros de campanha, histórico/status e comparação equivalente.
- Investimento por conjuntos conciliado com a consulta agregada da conta em ambos os períodos, diferença apenas de ponto flutuante (<R$0,01).
- TypeScript dos módulos novos e suas dependências diretas passou. O projeto MCP completo já possuía 18 diagnósticos de tipos em dossiê/hub/caixa; a mesma lista foi reproduzida antes/depois, sem diagnóstico novo. Não declarar o typecheck global aprovado.

Limitações: dados comerciais diários da Impacto e solicitações internas estavam vazios; não há vendas/atendimentos do Ápice neste retorno. Público personalizado indica potencial remarketing, mas não prova intenção, e pode incluir públicos semelhantes; não é classificação histórica. A Meta pode omitir métricas/objetos excluídos ou limitar a retenção de eventos. Sem evento não significa sem alteração. Atualização de orçamento no catálogo não reconstitui valores antigos; detalhes dependem do evento disponível. A comparação informa observações de mídia, não comprova causa da queda comercial.

Após o restart, atualizar as ferramentas e reconectar o Planeje no ChatGPT. O OAuth atual guarda sessões em memória, portanto sessões anteriores ao restart precisam de nova conexão. O teste dessa nova conexão no ChatGPT depende da sessão do usuário; não foi contornado por remoção da autenticação.

Fontes técnicas: [SDK oficial da Meta — Insights](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py), [conta e paginação de atividades](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py), [eventos](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adactivity.py), [consultas Supabase](https://supabase.com/docs/reference/javascript/select), [segurança e retornos MCP](https://developers.openai.com/plugins/build/mcp-server), [atualizar catálogo do ChatGPT](https://developers.openai.com/api/docs/guides/custom-mcp-server).
