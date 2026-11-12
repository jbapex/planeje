# Atlas: filtro por responsável — local, 29/10/2026

Solicitação de Josias: superadmin poder filtrar por responsável dentro do Atlas para conferir os assuntos da equipe.

## Contrato

Na lista do robô, a aba Equipe mostra um seletor Responsável, inicialmente Todos os responsáveis, e quantidade de assuntos. Opções vêm somente da lista já autorizada e são deduplicadas pelo ID, ordenadas pelo nome. Filtra por `current_person_id`: a pessoa com quem está o assunto agora, não o responsável oficial da tarefa nem o responsável pela conta.

Filtros pessoais Precisa responder, Não lidas e Atlas acompanhando conservam o comportamento. Seleção permanece ao alternar abas e zera ao trocar usuário. Se a pessoa deixa de ter assuntos, a seleção continua explícita e mostra lista vazia. Supervisão exige simultaneamente acesso gerencial existente e perfil superadmin. Nenhuma consulta nova, permissão, alteração de RLS, tarefa ou mensagem.

## Escopo e verificação

Produto: `src/components/atlas/AtlasTeamAssistant.jsx` e CSS correspondente. Fixture existente ganhou parâmetro `responsibles`; teste `scripts/atlas-team-pilot/verify-responsible-ui.mjs` usa somente rede local e três larguras (1280/390/320). Confere responsáveis distintos, deduplicação, todos, abas pessoais, contagem, troca de ator e ausência de supervisão para colaborador. Evidência privada em `.local/atlas-responsavel-20261029/`.

Três cenários de filtro (1280/390/320) e oito verificações de diálogo passaram, sem rede externa/erros de página. Lint sem erros (360 avisos existentes no escopo global) e integridade dos nove documentos passaram. Build temporário registrado na evidência local. Revisão do delta: filtros usam IDs, dados permanecem no escopo do RPC paginado existente, nenhuma mudança no backend. Graphify consultado como mapa; código atual conferido porque grafo é anterior às entregas recentes.

Somente local. Publicação desta alteração ainda não autorizada nem executada. Aceite humano e produção são etapas separadas.

## Atualização posterior

Publicação autorizada e concluída em 29/10/2026,00h35. [Operação e evidência](atlas-filtro-responsavel-producao-2026-10-29.md). Não repetir o publicador.
