# Avatar 3D do Atlas — 16/10/2026

Josias pediu uma imagem de avatar 3D para o robô do piloto. Criado um mascote branco/roxo com expressão acolhedora e fundo transparente, via ferramenta nativa de geração de imagens. Original preservado no diretório de imagens do Codex; PNG final e prompt completo salvos no projeto:

- `src/assets/atlas/atlas-avatar-3d-v1.png`: 1254×1254, canal alfa, 1.335.256 bytes.
- `src/assets/atlas/atlas-avatar-3d-v1.prompt.txt`: prompt final e ferramenta utilizada.

A imagem substitui o ícone do botão flutuante e aparece no cabeçalho, ao lado de Atlas. Botão 60 px/cabeçalho 38 px no computador e 54/34 px no celular. Área de clique, rótulo acessível, contadores, foco e abrir/recolher preservados. Imagens decorativas não repetem o nome para leitores de tela. Fundo transparente, leve sombra e movimento reduzido respeitado. Não é um modelo 3D em execução; é uma imagem estática, sem IA ou tokens para exibir.

Disponível somente no piloto `http://127.0.0.1:4320/#/caixa`. Build completo passou; HTTP da imagem 200; duas imagens carregadas, transparência/legibilidade conferidas no computador e em 390×844. No celular, diálogo dentro do viewport (x=12..378, y=165..829). Botão fecha/reabre, conversa e revisão preservadas; tamanho do navegador restaurado. Capturas privadas em `.local/atlas-avatar/`.

Release `/opt/planeje-cs-integration/releases/atlas-avatar-20261016-01` na VPS 103. Assets `index-b203239a.js` / `index-56d01cbd.css`, imagem `atlas-avatar-3d-v1-860d62c4.png`. Guarda de hash verificou 920 arquivos de origem antes de aplicar somente dois componentes/estilos e o novo PNG/prompt. Assets anteriores e índice do piloto `f66f8f1e/08eed2fb` preservados; índice anterior em `before/index.html` para reversão visual. Não executar novamente o promotor sem novo baseline.

Sem SQL, restart, alteração do backend/IA/automações, tarefa/comentário ou envio. Produção intocada; não promover a candidata CS, que contém Assessoria ainda não aprovada. Aceite visual de Josias pendente. [Release](../evidencias/releases/atlas-avatar-2026-10-16.json).
