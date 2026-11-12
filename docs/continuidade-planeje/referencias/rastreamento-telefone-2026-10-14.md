# Rastreamento: telefone sem o dispositivo do WhatsApp — 14/10/2026

Josias relatou que o destino do link ganhava `15` ao final e que o visitante recebia o aviso de número inexistente. A investigação confirmou o sufixo de dispositivo no JID devolvido pela conexão, e a correção solicitada foi publicada às 12h17 de São Paulo.

## Causa e correção

`classifyUazapiStatusPayload`, usado pelas instâncias e pelo seletor de destino dos links, removia os caracteres não numéricos de `telefone:dispositivo@servidor`. Com isso, concatenava o dispositivo ao telefone. Agora separa o conteúdo anterior a `:` antes de extrair os dígitos. Telefones sem dispositivo e a alternativa de digitação manual conservam o comportamento anterior.

Foram conferidos os oito registros de links e suas três configurações vinculadas. Somente três links ativos tinham destino exatamente igual ao resultado incorreto do parser, comprovado pela leitura atual da própria instância. Esses três destinos receberam o telefone extraído do JID correto, numa transação que exigiu exatamente três alterações e verificou a preservação dos demais campos e destinos. Não houve truncamento indiscriminado nem troca de números divergentes por suposição.

Os endereços públicos, slugs, mensagens, UTMs, configurações vinculadas, códigos, modo de abertura e históricos permaneceram. O backup das linhas completas e a instrução pontual de reparo ficam exclusivamente no diretório privado da release na VPS; nenhum dado de cliente ou credencial foi copiado para esta documentação.

## Validação e publicação

- Fonte atual produtiva copiada para candidato isolado; preservados o working tree e os arquivos não rastreados. Configuração do último candidato publicado, sem usar o `.env.production` legado da fonte.
- Baseline reproduziu byte a byte `index.9e0f843e.js` e `index.cb906053.css`. Só o parser e seu teste foram alterados.
- Dois scripts Node passaram localmente e no candidato: instâncias WhatsApp e links rastreáveis. A regressão cobre seis formatos de JID em três posições do payload e 54 destinos nos modos automático, aplicativo e Web, além dos fallbacks existentes.
- Build do candidato passou; tokens embarcados conferidos somente com papel `anon`. CSS permaneceu idêntico.
- Os três endereços públicos retornaram HTTP 302 para o telefone correto, com mensagem preservada. Não foi seguido o redirecionamento para o WhatsApp, nem enviado conteúdo. O endpoint registra clique também no teste: seis cliques com marcador exclusivo foram removidos, e foi confirmado que nenhum clique de verificação permaneceu. A primeira limpeza precisou considerar o parâmetro `slug` acrescentado pelo nginx; somente os registros identificados pelo agente exclusivo da verificação foram removidos.
- Navegador autenticado em produção: Editar e Novo link exibem o telefone sem o dispositivo; nenhum erro de console. Formulários cancelados, sem criação de link fictício. A imagem de conferência fica na pasta local ignorada `.local/rastreamento-telefone-20261014`, fora da documentação portátil.
- Novo índice, JS e CSS servidos por HTTP, com comparação integral dos bytes. Assets anteriores continuam disponíveis.

Release: `/root/planeje-releases/rastreamento-telefone-20261014-01`; backup: `before/`; índice anterior também em `/var/www/planeje/index.html.bak-rastreamento-telefone-20261014-01`.

Produção: `index.ab564283.js` / `index.cb906053.css`. Recarregar [Rastreamento → Links](https://planeje.jbapex.com.br/?v=ab564283#/rastreamento?aba=links). Assets `9e0f843e` e `66ba606f` conservados. [Manifesto](../evidencias/releases/rastreamento-telefone-2026-10-14.json) · [Verificação](../evidencias/rastreamento-telefone-testes-2026-10-14.json).

Sem migração de esquema, restart de backend, envio WhatsApp/CAPI/e-mail ou alteração de tarefas. Atlas permanece com `monitor_enabled=false`. O trabalho de CS/Assessoria continua não publicado: seu próximo candidato precisa incorporar este parser e ser reconferido sobre a produção atual. Aceite de uso de Josias permanece pendente; não foi testado envio real de mensagem.
