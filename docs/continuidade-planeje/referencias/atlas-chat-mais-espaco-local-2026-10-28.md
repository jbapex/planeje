**Atualização: publicado28/10,23h02.** [Operação e evidência](atlas-chat-mais-espaco-producao-2026-10-28.md). Registro local anterior preservado abaixo.

# Atlas — mais espaço para ler mensagens

Implementado e verificado localmente; não publicado. Pedido de Josias: ganhar altura para ler mais mensagens no chat operacional.

Botão Ampliar/Reduzir no cabeçalho ocupa a altura útil com margem de 12px; considera visualViewport, inclusive redimensionamento. Robô flutuante fica oculto enquanto ampliado para não cobrir mensagens; reaparece ao reduzir ou fechar. Posição salva do robô preservada. Informações da tarefa ficam em details nativo recolhido; título e estado/pessoa continuam visíveis, demais datas e links acessíveis por clique/teclado. Cabeçalho menor, compositor e regras de orçamento/envio intactos.

Três fontes visuais alteradas, sem dependência/backend/SQL. Teste novo `scripts/atlas-team-pilot/verify-chat-space.mjs`: 1280x900,390x844,320x568; ampliar/reduzir, details por teclado, redimensionamento, rascunho e launcher preservados; zero rede externa/erros. Área de mensagens em1280 passou de436px para622px ao ampliar; em320 passou de132px para288px. Suíte existente de envio imediato passou (10 checks), build temporário passou; lint zero erros e oito avisos anteriores. Revisão do delta: sem achado pendente.

[Medidas e evidência fictícia](../evidencias/atlas-chat-mais-espaco-2026-10-28/checks.json) · [Prévia390px](../evidencias/atlas-chat-mais-espaco-2026-10-28/ampliado-390.png).

Sem microfone/IA/envio real ou operação na VPS. Publicação específica e aceite pendentes. Para publicar, herdar a release/perfil vigente (última conferida: atlas-composer-compact-20261028-01/candidate) e promover apenas delta revisado; nenhuma migração/restart necessária.
