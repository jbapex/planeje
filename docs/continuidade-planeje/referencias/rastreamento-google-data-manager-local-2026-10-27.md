**Atualização de 27/10,15h26: código publicado. Cloud/OAuth e evento real ainda pendentes.** [Publicação combinada e evidência](google-data-manager-chatvolt-producao-2026-10-27.md). As menções a “não publicado” abaixo descrevem a entrega local original.

# Conversões Google — migração local para Data Manager

Estado: implementação local; publicação, configuração Cloud, consentimento Google e validação real pendentes. Pedido de Josias em 27/10/2026: “vamos fazer isso”, após o diagnóstico de recusa da API anterior e a proposta de migração.

## Resultado local

- Conversa, qualificação e compra usam `events:ingest` da Data Manager v1 e as ações já mapeadas por cliente. Consultas, campanhas e alterações de Google Ads permanecem na API existente.
- OAuth pede `adwords` e `datamanager`. A troca do code exige os dois escopos antes de gravar a conexão. Projeto de quota é configurado explicitamente em Google Ads da agência (`GOOGLE_DATA_MANAGER_PROJECT_ID`), pelo mecanismo de secrets existente.
- O log guarda o snapshot da conversão e o `requestId`. Recebimento significa processamento pendente; somente diagnóstico `SUCCESS` com o único registro esperado confirma processamento. A atribuição/contabilização na campanha é outra verificação, no Google Ads.
- A PK existente reserva atomicamente o primeiro payload por UUID determinística; assim, requisições concorrentes não ajustam valor/data por acidente. Reenvios usam o snapshot canônico e o mesmo `transactionId`. Não há migração SQL.
- Reenvio é individual por ID local do log e relê dados no servidor. Legado sem snapshot usa a primeira tentativa registrada; compra legada sem valor salvo não é reenviada automaticamente. Sucesso/processamento anterior bloqueia duplicata, inclusive com `force`.
- Diagnóstico é consultado manualmente na tela, com primeira consulta após 30 minutos, backoff crescente até 60 minutos e reserva atômica da janela. Não existe novo cron ou promessa de consulta em segundo plano.
- As operações afetadas verificam usuário, conta/sessão ativa, perfil/cliente e propriedade do contato/lead. Serviço interno continua autenticado pela chave do servidor. Conta, ação, projeto e `requestId` não são substituíveis livremente no payload.
- Eventos Google apresenta quatro contadores, processamento, falhas/erros completos e reenvio recuperável. Trocar de cliente descarta respostas atrasadas da consulta anterior. Sucesso legado é identificado como integração anterior.

## Verificações e revisão

45 cenários do handler real via esbuild, com banco/OAuth/Google fictícios; cinco do consumidor comercial; helpers, ações, escrita, catálogo e regras de conversão. Oito comandos dirigidos passaram. Prévia com Chrome e rede restrita a localhost: 1440/390/320 px, rolagem da tabela, diagnóstico, reenvio por ID, resposta atrasada de outro cliente, recusa OAuth sem gravação e projeto salvo após aceite fictício.

`npm run check` passou antes e depois da rodada de reparos da revisão. O comando cobre contexto, harness, lint rápido/tipado, tipos, regras, testes locais/MCP e build temporário. Avisos legados não foram suprimidos; `dist` e ZIPs da raiz não foram usados como artefato de publicação.

Revisão independente encontrou dois Important: erro estruturado perdia HTTP temporário; identidade Google sem reserva inicial permitia ajuste concorrente de valor. Ambos receberam regressões e correção. Reavaliação final confirmou ambos resolvidos e nenhum achado pertinente restante; mais sete cenários de recuperação/concorrência passaram. Hashes constam da evidência; relatórios privados fora do repositório, sem upload. Comparação usa snapshots anteriores deste reparo porque HEAD/índice têm trabalho misturado de outras entregas.

## Próxima operação

1. Obter autorização específica de publicação deste reparo e ler a operação/release vigente. Conferir fontes produtivas e concorrência; criar candidata a partir da base atual, herdando seu perfil/flags e `.env.production.local` quando exigido.
2. Sobrepor somente as fontes deste reparo; conferir hashes e rodar os testes dirigidos/build na candidata. Não promover `dist` antigo da raiz. Não aplicar SQL.
3. Promover frontend e `google-ads-api`/módulo compartilhado com recuperação dos arquivos anteriores. Reiniciar somente o runtime Edge se necessário; preservar os demais serviços e releases concorrentes. GET de saúde não deve disparar conversões.
4. No projeto Google Cloud correto, conferir/ativar Data Manager API. No Planeje, preencher seu ID ou número em Google Ads da agência. Essa etapa requer acesso autorizado ao projeto; não inferir pelo Client ID.
5. Copiar a nova URL OAuth, autorizar os dois escopos com a conta apropriada e salvar pelo formulário. Não pedir/colar tokens ou Client Secret em chat/documentação. A conta precisa dos acessos Google Ads/Cloud correspondentes; verificação real de IAM/OAuth ainda não foi feita.
6. Com envio real autorizado, validar um evento escolhido e consultar o processamento após o intervalo. Só então reenviar os recusados elegíveis individualmente; nada de replay coletivo ou nova data/valor para esconder rejeições. Confirmar também o diagnóstico e a contabilização no Google Ads.

Recuperação: restaurar somente fontes/ponteiro de assets deste reparo sob guarda dos hashes, preservando assets anteriores e alterações concorrentes. O JSON do log é aditivo e deve permanecer para diagnóstico; não apagar histórico nem retirar `adwords` da autorização. Nenhuma configuração de Meta, GTM, Tray, número/link ou automação foi modificada por esta implementação.

## Evidência e fontes

- [Desenho](../../superpowers/specs/2026-10-27-google-data-manager-design.md)
- [Plano](../../superpowers/plans/2026-10-27-google-data-manager.md)
- [Evidência local](../evidencias/releases/rastreamento-google-data-manager-local-2026-10-27.json)
- [Migração oficial](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade/steps)
- [Ingestão REST](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest)
- [Diagnósticos](https://developers.google.com/data-manager/api/devguides/diagnostics)
- [Configuração REST/projeto de quota](https://developers.google.com/data-manager/api/devguides/quickstart/install-library)

Context7 Google Data Manager/Supabase JS e changelog Supabase foram consultados. Versões/runtime/dependências mantidos. Fixtures não certificam IAM, OAuth, RLS, importação ou atribuição produtivos.
