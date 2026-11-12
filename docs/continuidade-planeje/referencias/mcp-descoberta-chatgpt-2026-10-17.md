# Descoberta pública do MCP Planeje no ChatGPT — 17/10/2026

## Resultado da investigação

O endpoint utilizado pelo app pessoal Planeje é `https://mcp.planeje.jbapex.com.br/mcp`. A versão produtiva continua **2.8.1**, com os hashes da entrega anterior e dois reinícios PM2 correspondentes à publicação. O processo correto roda em `/root/planeje/planeje-mcp`; o Nginx encaminha para `127.0.0.1:3100`, com `proxy_cache off` e `proxy_buffering off`.

Duas conexões OAuth atuais alcançaram o manifesto de 58 ferramentas. Outras duas conexões antigas pediam renovação de autenticação. A permissão do app herda “Permitir ações de baixo risco”; não foi alterada.

O catálogo carregado nesta conversa ainda era uma fotografia antiga de **55 ferramentas**, sem `consultar_trafego_meta`, `comparar_periodos_meta`, `consultar_rastreamento` e `listar_leads_rastreamento`. Reconectar OAuth não equivale a atualizar a fotografia de ferramentas do app.

## Correção no consumidor

Foi acionado **Configurações → Plugins → Planeje → Atualizar ferramentas** no ChatGPT. Em seguida, a lista do aplicativo passou a mostrar **58 ferramentas**: cinco classificadas como Read e 53 como Write pelas anotações já existentes. As duas novas de Meta aparecem em Read; as duas de Rastreamento aparecem no grupo Write porque o código legado ainda não fornece readOnlyHint para essas ferramentas. A categoria de interface não é demonstração de que o handler escreve.

As quatro ferramentas solicitadas foram identificadas na lista efetivamente importada pelo ChatGPT após a atualização, não apenas no manifesto interno. Não houve alteração de campanhas, dados operacionais, credenciais produtivas, permissões ou reinício adicional do servidor.

A conversa atual mantém o conjunto de ferramentas recebido no início da execução. A documentação oficial orienta iniciar uma nova conversa depois de atualizar o catálogo; não é necessário publicar novamente um servidor cujos metadados já estão corretos.

## Cliente independente

Foi preparado `planeje-mcp/scripts/probe-public-discovery.mts`, com `@modelcontextprotocol/sdk`, OAuth normal, PKCE S256 e callback exclusivo de loopback. Não utiliza chave administrativa ou autenticação fictícia. Faz initialize + tools/list pela URL pública, repete tools/list sem sessão, verifica os quatro nomes e compara a resposta com o manifesto. Grava somente esquemas/metadados e revoga os tokens do teste ao terminar; não faz leitura de dados comerciais nem mutações.

O login foi concluído pelo dono diretamente no Planeje, fora da conversa. Às **18h25min59s de 17/10/2026** (21:25:59 UTC), o SDK externo recebeu **58 ferramentas** e a requisição HTTPS stateless a `tools/list` retornou **HTTP 200 / 58 ferramentas**. Os quatro nomes solicitados estavam presentes nas duas respostas. O conjunto de nomes coincidiu exatamente com `listar_ferramentas_mcp`; versão informada pelo protocolo: **2.8.1**. SHA-256 dos esquemas: `e1528808c874d7c8ebabec1dd32f0beae6250bff009b44495d86b61e9ddcd091`.

O script terminou com código zero; duas chamadas `POST /revoke` às 21:25:59 UTC receberam HTTP 200, confirmadas no log do Nginx. Access token e refresh token do cliente temporário foram revogados. Credenciais e tokens não foram gravados nos artefatos. A compilação TypeScript estrita do script passou. Não foi necessário novo deploy ou restart.

O teste desta etapa validou **descoberta**, sem executar consultas de dados comerciais pelas quatro ferramentas. As consultas reais de tráfego e comparação foram validadas na entrega 2.8.1 anterior. A conversa que já estava aberta continua com seu catálogo inicial; a atualização do aplicativo foi confirmada e deve ser carregada por uma nova conversa.

Evidências: [resultado e limpeza OAuth](../evidencias/releases/mcp-descoberta-chatgpt-2026-10-17.json), [resposta pública com os 58 esquemas](../evidencias/mcp-tools-list-publico-2026-10-17.json) e [catálogo efetivamente importado pelo ChatGPT](../evidencias/mcp-catalogo-chatgpt-2026-10-17.png).

## Referências

- [OpenAI — atualização de metadados](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata).
- [Entrega do tráfego Meta](mcp-trafego-impacto-2026-10-17.md).
