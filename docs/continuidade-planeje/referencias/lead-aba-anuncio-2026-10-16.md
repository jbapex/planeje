# Origem e rastreamento na aba Anúncio

Publicado em 16/10/2026 às 19h56 (São Paulo), atendendo ao pedido de Josias de reunir UTMs, origem, campanha e conta junto do anúncio de origem.

A ficha compartilhada pelo Mini CRM, Rastreamento e calendário mantém Contato com os campos de edição, marcação comercial/etiquetas e Atendimento. Anúncio reúne o criativo, origem/canal, conta de anúncios e ID quando registrados, campanha/conjunto/anúncio, IDs disponíveis, clique, cinco UTMs e jornada da Meta. A etiqueta compacta de origem no cabeçalho foi preservada. Não há duplicação dos blocos de origem/UTMs entre as abas.

Nome da conta vem exclusivamente de `tracking_data.meta_ad_details.accountName`, formato já salvo pelo detalhamento existente. ID vem do anúncio ou campanha armazenados; valores ausentes não são inventados. Nenhuma consulta adicional à Meta foi introduzida. UTMs continuam separadas dos nomes oficiais da campanha e da elegibilidade de CAPI. Botões de copiar, link do anúncio, estados vazios e controle existente de envio da jornada foram preservados. Nenhum envio foi efetuado pelo agente.

Computador: criativo à esquerda, dados com rolagem própria à direita. Celular: rolagem da aba completa, sem transbordamento horizontal. Os painéis permanecem montados; editar uma observação, trocar Contato → Anúncio → Contato e reabrir conservou o valor salvo no cenário fictício.

Cinco scripts (`rastreamentoLeadFicha`, `rastreamentoLeadConversa`, `miniCrmOrigin` com 17 cenários, `miniCrm`, `leadIdentity` com seis verificações), build Vite completo e navegador fictício Meta/Linktree/sem dados passaram. Conta/campanha, UTMs do link e sua nota de procedência, criativo, jornada e tela CSS 390×844 conferidos. Viewport restaurado. A verificação produtiva desta entrega usa HTTP/bytes e serviços; não houve teste autenticado nem alteração real de leads.

Publicação seletiva: três fontes, guarda de 1.638 arquivos; assets `index.e72fc152.js` / `index.b251e8bf.css`, conserva `index.cbb6ac1b.js` / `index.939a0f53.css`. Extensões ZIP conferidas com a fonte produtiva e preservadas. Sem SQL, migração, restart, IA ou ambiente alterado; Atlas e edições anteriores do Mini CRM preservados. Nova base frontend `/root/planeje-releases/lead-ad-tab-20261016-01/candidate`, webroot `/var/www/planeje`; backend continua na candidata Atlas anterior. Primeiro uso e aceite de Josias pendentes.

![Demonstração no computador](../evidencias/lead-aba-anuncio-demonstracao-2026-10-16.png)

![Demonstração no celular](../evidencias/lead-aba-anuncio-celular-2026-10-16.png)
