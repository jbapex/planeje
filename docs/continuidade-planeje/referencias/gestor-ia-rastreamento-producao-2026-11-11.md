# Rastreamento no Gestor IA — 11/11/2026

Publicado às 01h05 de Brasília na release `gestor-rastreamento-20261111-01`, a pedido de Josias. A lateral do Gestor abre a página oficial de Rastreamento. A entrada exige acesso aos dois módulos. O atalho da Memória abre Integrações com cliente e período. [Abrir Rastreamento no Gestor IA](https://planeje.jbapex.com.br/?v=53bb6d8d#/gestor-ia/rastreamento).

A candidata herdou as 1.964 fontes e o perfil produtivo de `atlas-conversar-20261110-02`. A sobreposição contém apenas cinco arquivos do Gestor: workspace, lateral compartilhada, Memória, modelo de navegação e CSS. Os testes auxiliares ficaram na candidata. A página oficial, o banco, as funções e os serviços não foram alterados. O build conserva os controles de IA usados pela base.

Passaram 17 testes locais, incluindo 141 verificações React do Gestor, os testes de Memória e os quatro conjuntos de Rastreamento. O lint dos arquivos da entrega e os 24 testes de recuperação do publicador passaram. Na VPS passaram os testes auxiliares e a compilação com o perfil produtivo. O domínio serve `index.53bb6d8d.js` e o CSS `index.7d7406ee.css`. As 22 verificações HTTPS conferiram os hashes novos, os artefatos anteriores e o Escritório Atlas. Serviços, configuração efetiva e arquivos de runtime conservaram os hashes anteriores.

No domínio oficial, com sessão autenticada, foram conferidos a nova rota, a lateral do Gestor e as sete abas: Visão geral, Leads, Relatórios, Eventos, Links, Integrações e Configurações. A conferência foi somente de leitura; não foram testadas edições ou envios com dados reais. O aceite de uso permanece com Josias.

Os recibos, os manifestos, a candidata e os backups do HTML e das cinco fontes estão na pasta privada `/root/planeje-releases/gestor-rastreamento-20261111-01`. A recuperação deve conferir os hashes e a release vigente e restaurar apenas os arquivos afetados, preservando alterações posteriores. Não repetir o publicador. [Evidência resumida](../evidencias/releases/gestor-rastreamento-producao-2026-11-11.json).

## Ajuste local de espaçamento

Após a captura de Josias em 11/11, a prévia reproduziu a coluna de seleção com 200 px. A regra genérica `td:first-child` do Gestor alcançava a página de Rastreamento. Uma exclusão em `GestorIa.css` impede essa aplicação. A primeira coluna voltou a aproximadamente 37 px, com 24 px entre a seleção e o avatar. Os 74 contatos fictícios e a seleção de todas as linhas permaneceram disponíveis. O teste em 390 px preservou a largura da página, e a primeira coluna de Métricas manteve 200 px. O build temporário passou. O ajuste foi publicado às 10h33, conforme o registro abaixo.

## Publicação do espaçamento

A release `gestor-rastreamento-espaco-20261111-01` entrou em produção em 11/11/2026 às 10h33 de Brasília, a pedido de Josias. A candidata herdou as 2.084 fontes, o perfil produtivo e os controles de IA de `crm-ia-20261111-04`. O pacote contém somente a linha de CSS que restringe a largura mínima da primeira coluna às tabelas do Gestor.

Passaram a compilação na VPS e os 24 testes de recuperação do publicador. O domínio serve `index.562ea603.js` e o CSS global `index.7d7406ee.css`. As 25 verificações HTTPS conferiram os artefatos novos, os anteriores e o Escritório Atlas. Runtime, unidades, serviços e perfil foram preservados, sem migração ou reinício.

A conferência autenticada em Leads confirmou a coluna de seleção passando de 200 para 37 px e o espaço até o avatar de 187 para 24 px. Foi somente de leitura. Os manifestos, recibos e backups do HTML e da única fonte ficam na pasta privada da release. Não repetir o publicador; uma futura publicação deve herdar esta base ou uma sucessora verificada. [Abrir a tela publicada](https://planeje.jbapex.com.br/?v=562ea603#/gestor-ia/rastreamento?aba=leads) · [Evidência resumida](../evidencias/releases/gestor-rastreamento-espaco-producao-2026-11-11.json).

## Ficha e Atendimento em prévia local

Em 11/11, Josias esclareceu que desejava organizar somente o quadro Mini CRM. O refinamento geral da primeira prévia foi retirado: cores, tamanho do diálogo, cabeçalho, conversa, canais e campos de Marcar voltaram ao visual original. O Mini CRM apresenta rótulo e valor em linhas com separadores; observações e próxima ação ocupam a largura completa. Fontes e cores seguem a ficha existente.

Em seguida, Josias pediu a cor do status. O resumo agora conserva a cor do status resolvido pela configuração oficial do Mini CRM. Uma etiqueta na ficha do Gestor usa essa cor e o contraste calculado pelo `statusInk` existente. Status desconhecido ou vazio permanece neutro. Não há consulta adicional nem mudança no cadastro, e a etiqueta recebe estilos somente no escopo do Gestor. A prévia confirmou o status roxo e o fundo original do Atendimento. Passaram três testes do resumo (incluindo cor personalizada e ausência de configuração), 18 verificações React e lint sem erros nas fontes desta alteração.

`ContatosPage` identifica a rota `/gestor-ia/rastreamento` e passa a classe opcional `rt-lead-ficha--gestor` ao diálogo. `GestorIaTracking.css`, importado pelo workspace, contém somente regras de disposição dentro de `[aria-label="Mini CRM"]` nesse escopo. O atributo visual de valores vazios foi retirado do resumo. A ficha fora do Gestor mantém sua classe padrão; consumidores, carregamento, edição, salvamento e conversões permanecem nos fluxos anteriores. Não houve alteração de banco, permissões, sincronização ou chamadas externas.

Passaram novamente 16 verificações React da ficha multicanal/Mini CRM, incluindo a classe padrão e a optativa, e a compilação temporária após a correção. Uma conferência estática confirmou seis regras de CSS, todas restritas ao Mini CRM, sem nova paleta ou dimensões da ficha. Na etapa anterior passaram seis testes dos contratos de resumo, conversa e atribuição e lint sem erros (cinco avisos preexistentes). O `dist` operacional foi preservado.

A conferência usa fixtures e rede isolada. Após a correção, a comparação dos estilos computados com a ficha padrão confirmou igualdade de fundo, cor do texto, bordas, espaçamento, tamanho e peso da fonte no diálogo, cabeçalho, corpo, conversa, mensagens, canal selecionado e campo comercial. A organização do Mini CRM permanece restrita ao seu quadro. A nova conferência em 390 px confirmou a largura da página e a rolagem do corpo; a captura final foi feita com o viewport restaurado. Os testes anteriores de abertura pela rota do Gestor, cancelamento da edição de nome, aba Anúncio, filtros de canal e atualização da conversa continuam como evidência dos fluxos preservados; não são aceite do refinamento geral retirado.

[Abrir demonstração da ficha](http://127.0.0.1:4385/?gestor=1). A demonstração é fictícia e não grava dados. Esta etapa local foi publicada às16h03 conforme o registro abaixo. A conferência autenticada com arquivos reais e o aceite operacional continuam separados da publicação. A base usada foi `crm-ia-periodo-20261111-01/candidate`.

## Áudio, imagens e figurinhas na conversa

Josias relatou a ausência de áudios, imagens e figurinhas. A investigação local confirmou que a ficha só resolvia por download os áudios. Outras mídias apareciam como texto quando não havia uma URL pronta em `attachments`. Os tipos `voice` também não eram classificados como áudio e figurinhas eram reduzidas a imagens comuns.

`LeadMediaControl`, na ficha compartilhada, reutiliza `fetchAtendimentoMediaUrl` para carregar fotos, figurinhas, áudio, vídeo e documentos por clique. URLs de anexos já disponíveis continuam diretas; links `.enc` dependem da resolução pelo serviço existente. O pedido mantém cliente, canal, identificadores da mensagem e conversa. Em falha de rede ou decodificação, a tentativa seguinte pode ignorar o cache daquele pedido e guardar o novo resultado. Chamadores antigos do helper mantêm o cache padrão. Não há carregamento automático em massa, nova coleta, mudança de webhook, banco, função Edge ou autenticação.

Figurinhas identificadas conservam seu tipo e usam quadro de 128 px com fundo transparente. Áudio e vídeo usam os controles nativos existentes; fotos abrem em outra aba e documentos exibem seu nome. As cores e o layout da ficha continuam os anteriores. A marca explícita de mídia removida prevalece mesmo se ainda existir um anexo no registro. Expiração e ausência de identificador exibem um aviso; a legenda textual é preservada. Este trabalho não recupera arquivos apagados pelo provedor nem reclassifica historicamente figurinhas cujo tipo já foi perdido no texto salvo.

Passaram nove testes dirigidos dos contratos de resumo, ficha, histórico, multicanal e download; o componente passou 33 verificações React. Os casos novos cobrem voz, figurinha, marca de remoção, carregamento por clique, falha, nova tentativa após erro do player, ausência de arquivo, expiração, canal de envio e cache isolado por cliente/canal. Lint sem erros, mantendo os avisos preexistentes das fontes, e compilação temporária passaram; log local em `.local/gestor-rastreamento-midias-build-20261111.log`. Nenhum `dist` foi promovido.

A [prévia de mídias](http://127.0.0.1:4385/?gestor=1&midia=1) usa imagens SVG e tom WAV sintéticos, documento fictício e vídeo gerado de um canvas local, sem câmera, microfone ou conexão aos provedores. No navegador, o áudio de um segundo foi reproduzido; as imagens recebida/enviada e a figurinha terminaram de carregar. O vídeo decodificou em 320 × 180 px sem erro. Em 390 px, a página conservou sua largura e a rolagem. A captura final mantém o Mini CRM e os controles originais ao lado das mídias. Essa validação sintética antecedeu a publicação descrita abaixo; não certifica download de arquivos reais.


## Publicação da ficha e das mídias

A release `gestor-rastreamento-midias-20261111-01` foi publicada em11/11/2026 às16h03 de Brasília (`2026-11-11T19:03:26.639076Z`), a pedido de Josias: “Vamos publicar Vps”. A candidata herdou as2.116 fontes e o perfil produtivo da release CRM de14h26. O pacote explícito tem nove fontes de produto e cinco testes, totalizando2.120 fontes no novo manifesto. Três ajustes locais da barra de filtros ficaram fora: `ContatosPage` foi composto da fonte produtiva com somente importação, identificação da rota e classe da ficha.

A revisão independente encontrou dois problemas antes da promoção: um anexo com erro escondia os demais, e a classificação nova de figurinha quebrava o renderer do CRM IA. A primeira candidata foi arquivada sem promoção. As correções mantêm erros por arquivo e preservam `auditMediaKind(...sticker) -> image` para os consumidores existentes; somente a auditoria da ficha especializa figurinha. Casos vermelhos e verdes passaram; a reavaliação dos hashes finais encerrou sem achados pendentes.

Passaram nove testes Node na candidata,36 verificações React locais e24 casos de recuperação do publicador. O build com o perfil herdado passou em40,47s. A promoção manteve serviços Atlas, MCP, sincronizador, Edge, unidades efetivas, runtime e arquivos anteriores. Não houve SQL, reinício, envio de WhatsApp, chamada de IA ou uso do `dist` local. O verificador conferiu27 artefatos HTTPS por SHA256, incluindo a entrada, assets novos/anteriores e o Escritório Atlas.

Essa primeira promoção serviu `index.cb58be5d.js` e `index.775a6d7c.css`; o HTML tinha SHA256 `d5e283530916512e7d87c24046dcacea484e80dc0377577aa51c8911333937b7`. O navegador carregou esses mesmos arquivos na rota publicada. Naquele momento a sessão estava sem login. Josias entrou depois, permitindo a conferência autenticada e o complemento abaixo; nenhuma credencial foi lida ou inserida pelo agente. O aceite operacional permanece distinto da validação técnica.

Recibos, candidata, perfil herdado, manifestos, revisão e backups ficam na pasta privada `/root/planeje-releases/gestor-rastreamento-midias-20261111-01`. A tentativa inicial está arquivada em `attempt-1`, sem promoção. Não repetir o publicador nem promover candidata antiga. Uma próxima entrega deve herdar esta release ou uma sucessora verificada. A recuperação confere hashes e restaura somente fontes/HTML desta troca, preservando concorrência e assets imutáveis.

[Evidência da primeira promoção](../evidencias/releases/gestor-rastreamento-midias-producao-2026-11-11.json).

## Identificador da mídia e conferência autenticada

Após o login de Josias, a ficha real confirmou a organização do Mini CRM e o status com a cor configurada. Dois áudios de um histórico antigo devolveram `Message not found`. A investigação leu somente metadados em transação SQL `READ ONLY`, sem selecionar tokens ou o payload completo. Ela identificou que o webhook já guardava um identificador completo em `message.id`, ausente da projeção INBOX usada pela ficha.

A correção acrescenta somente `uazapi_internal_id:raw_payload->message->>id` à projeção existente. O normalizador e o transporte já aceitam esse alias; os IDs anteriores, cliente, canal, conversa, filtros e retenção permanecem. Não houve alteração de registros, esquema, função Edge ou autenticação. O teste multicanal passou a exigir esse escalar e recusar a seleção de `raw_payload` inteiro. O caso falhou antes da linha e passou depois; nove testes Node e36 verificações React locais passaram. A revisão independente reproduziu o fluxo com dados fictícios até o transporte e encerrou sem achados.

A release corretiva `gestor-rastreamento-identificador-20261111-01` foi publicada às16h39 de Brasília (`2026-11-11T19:39:10.202929Z`), sob a mesma autorização de publicação. Herdou a release de16h03 e seu perfil produtivo, com duas sobreposições — uma fonte de produto e seu teste — mantendo2.120 fontes. Nove testes da candidata e o build passaram;26 verificações HTTPS por SHA256 confirmaram a entrada e os assets. Serviços, unidades, runtime e assets anteriores permaneceram. Sem escrita no banco, migração, reinício, mensagem ou chamada de IA.

A versão vigente é `index.d1e64000.js`, com o CSS preservado `index.775a6d7c.css` e HTML SHA256 `9ebe3f8d448a797e110eab45e4a3ebbe8421794952916b0377150e15cf0a54bd`. O navegador autenticado carregou esse bundle. Em uma conversa recente, o clique em **Ouvir áudio** abriu um player nativo com `readyState=4`, duração12,9s e nenhum erro. Isso verifica o download e a decodificação de um áudio real, sem reproduzir a voz nem enviar mensagens. A ficha exibiu os nove campos configurados e o status colorido.

Fotos, figurinhas, vídeos e documentos continuam validados com fixtures, sem certificação de arquivo real nesta rodada. Os dois arquivos antigos não foram repetidamente solicitados; sua recuperação não foi comprovada. Arquivos removidos ou indisponíveis no provedor não são recuperados por esta correção. Não se infere aceite humano.

Os recibos, manifesto, revisão e backups do complemento ficam em `/root/planeje-releases/gestor-rastreamento-identificador-20261111-01`; não repetir seu publicador. Uma próxima entrega deve herdar essa candidata ou uma sucessora conferida, incluindo seu perfil, com nova checagem de concorrência. A captura da ficha e do player fica somente no artefato privado da sessão; nenhum conteúdo de cliente foi copiado para esta documentação ou evidência JSON.

[Abrir a versão publicada](https://planeje.jbapex.com.br/?v=d1e64000#/gestor-ia/rastreamento?aba=leads) · [Evidência do complemento](../evidencias/releases/gestor-rastreamento-identificador-producao-2026-11-11.json).
