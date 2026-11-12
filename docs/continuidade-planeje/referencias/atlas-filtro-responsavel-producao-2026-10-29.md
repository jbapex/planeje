# Atlas: filtro por responsável — produção

Publicado em 29/10/2026,00h35 (São Paulo), após autorização explícita “pode publicar”.

## Uso e contrato

Robô → Ver assuntos do Atlas → Equipe → Responsável. Superadmin escolhe Todos os responsáveis ou uma pessoa; a quantidade e a lista acompanham a seleção. Filtra pelo destinatário atual (`current_person_id`), não reatribui tarefas. Filtros pessoais preservados; ao trocar usuário a seleção zera e o colaborador não ganha supervisão. Só usa os registros que o RPC existente já autoriza.

## Publicação e verificação

Release `/root/planeje-releases/atlas-responsavel-20261029-01/candidate`,1.790 fontes. Base/perfil herdados de `rastreamento-hide-funnel-20261029-01`: preserva botão Ver dados e coluna Funil/Etapa oculta no Rastreamento, além da atividade do Atlas. Apenas dois arquivos de produto (JSX/CSS), main `1edf29de`, CSS `80eb966f`.

Sem SQL, migração reaplicada, reinício, mudança de backend/permissões ou mensagem real de teste. Cinco serviços ativos, Edge/runtime e unidades preservados. Fontes, seis HTTP/hashes e assets antigos conferidos.

Testes locais: três cenários do filtro (1280/390/320), oito de diálogo, lint sem erros e build temporário. 24 testes de promoção/recuperação locais e remotos; helper de ditado e build da candidata com perfil produtivo passaram. Navegador autenticado confirmou Todos e filtro por Poliana: a contagem reduziu e só assuntos com ela permaneceram. Captura privada em `.local/atlas-responsavel-release-20261029-01/published-filter.png`, fora da documentação versionada.

[Evidência da publicação](../evidencias/atlas-responsavel-2026-10-29/published.json) · [Verificação produtiva](../evidencias/atlas-responsavel-2026-10-29/verification.json) · [Contrato local](atlas-filtro-responsavel-local-2026-10-29.md).

## Limites

A quantidade corresponde aos assuntos visíveis, inclusive acompanhamento/revisão, não somente respostas atrasadas. Opções incluem pessoas com assuntos carregados. Não foi usado envio real/IA paga para testar. Aceite de uso humano permanece separado.
