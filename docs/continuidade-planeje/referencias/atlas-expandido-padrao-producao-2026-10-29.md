# Atlas ampliado por padrão — produção

Publicado em 29/10/2026,01h01 (São Paulo), após autorização explícita “publicar”. Ao abrir o robô, o chat começa ampliado; Reduzir permanece disponível. Redução manual é respeitada durante a sessão do componente e a troca de usuário renova o padrão ampliado. Não abre o robô automaticamente.

## Release e escopo

`/root/planeje-releases/atlas-expandido-20261029-01/candidate`,1.790 fontes. Base/perfil herdados de `atlas-responsavel-20261029-01`; filtro por responsável, atividade e mudanças de Rastreamento preservados. Um JSX com duas mudanças no estado existente; main `cd869874`, CSS `80eb966f` inalterado. Sem SQL, reaplicação de migração, reinício, backend/permissões novas ou mensagem real de teste.

## Verificação

Prévia isolada passou em1280×900,390×844,320×568: abertura ampliada, redução/ampliação, rascunho, detalhes por teclado, redimensionamento e ausência de overflow. Build temporário passou. 24 testes do publicador locais/remotos, helper de ditado e build da candidata passaram. Pós-publicação: fontes, cinco HTTP/hashes, assets antigos, cinco serviços ativos, unidades/Edge/runtime preservados.

UI autenticada confirmou abertura de12px até888px em viewport900px; Reduzir retornou a690px de altura, Ampliar restaurou. Conversa existente carregou no painel ampliado. Captura privada em `.local/atlas-expandido-release-20261029-01/published-expanded.png`.

[Evidência de publicação](../evidencias/atlas-expandido-2026-10-29/published.json) · [Verificação produtiva](../evidencias/atlas-expandido-2026-10-29/verification.json) · [Contrato e prévia locais](atlas-expandido-padrao-local-2026-10-29.md).

Celular físico e envio real não foram testados em produção; sem IA paga de teste. Aceite humano separado. Não repetir o publicador.
