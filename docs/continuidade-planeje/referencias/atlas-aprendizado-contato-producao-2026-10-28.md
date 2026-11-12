# Atlas: aprendizado e contato natural — produção de 28/10/2026

## Estado e autorização

**PUBLICADO E VERIFICADO às 12h14 de São Paulo; aceite de uso pendente.** Josias autorizou expressamente “Publicar esta versão na VPS” para aprendizado automático com fonte/data, correção/revogação e contato natural à equipe, incluindo duas migrações novas. Esta referência supera o estado “somente local” da [entrega anterior](atlas-aprendizado-contato-local-2026-10-28.md).

[Evidência sanitizada e hashes](../evidencias/releases/atlas-aprendizado-contato-producao-2026-10-28.json) · [Desenho](../../superpowers/specs/2026-10-28-atlas-aprendizado-contato-design.md) · [Plano](../../superpowers/plans/2026-10-28-atlas-aprendizado-contato.md).

## O que entrou

As análises existentes podem propor até três observações duráveis de fontes elegíveis. Fatos guardam trecho atribuído; padrões exigem fontes distintas. Fonte, data, autor, cliente e versão são validados. Observações automáticas ficam privadas por cliente. Regras continuam sob decisão de Josias, e Tarefas continua sendo a execução oficial. Correção e revogação têm efeito nos leitores canônicos; resumos históricos não contornam a revogação. Não há replay coletivo, treinamento de pesos ou leitura universal.

O contato natural aceita a instrução do dono para confirmar algo com a pessoa interna ativa. Menções subordinadas integram o contexto da pergunta; não disparam contatos em massa. Negação, ambiguidade, condição ou citação pedem esclarecimento. Uma tarefa removida não é reconstruída por título. Falta de vínculo permanece explícita, e a dúvida acionável volta à mesma conversa do dono.

No escritório: robô → **Detalhes e histórico → Memória**. A aba abriu autenticada e mostrou tipo, data, origem e controles de corrigir/revogar dos registros existentes. Nenhuma memória foi alterada nessa conferência. A geração de nova observação depende de um próximo evento elegível; não foi fabricada em produção.

## Composição e operação

Release `/root/planeje-releases/atlas-learning-20261028-02/candidate`, herdada de `contact-attribution-history-events-20261028-01/candidate`, com perfil `.env.production.local` apenas na VPS. São **1.768 fontes**, main `index.204d5fb3.js`, CSS `index.ca294902.css`; HTML SHA-256 `c41a7e2397c70a8f86e131d28e1db895f70495b3609853f6356f102ea45df947`.

Treze arquivos de produto no manifesto. Dois leitores (`atlasManagerContext.js`, `atlasContext.js`) foram compostos sobre suas fontes produtivas somente com o delta de aprendizado; trabalho local de consulta/documentos ainda não publicado foi preservado. Os onze outros arquivos coincidem com os fontes locais revisados. Esta é a razão da diferença de hashes entre manifesto local e produtivo desses dois leitores; não usar cópia integral do workspace para publicação futura.

Aplicadas **uma única vez, na mesma transação**, em ordem: `20261028115736_atlas_observed_learning.sql` e `20261028115827_atlas_natural_owner_contact.sql`. Commit às 12h09; não reaplicar. Migrações anteriores permaneceram intactas. Dez corpos de função, ACL/owner preservados, colunas, RLS, trigger e índice de deduplicação foram conferidos. O índice da execução oficial não mudou.

Os cinco serviços `planeje-atlas`, `planeje-atlas-team`, `planeje-atlas-events`, `planeje-atlas-office`, `planeje-atlas-demands` foram atualizados por seus imports e estão ativos na nova candidata. Cinco arquivos Edge foram atualizados, com contêiner ativo. Ambiente, modelo, provedor, credenciais, limites e políticas produtivos foram preservados. Hashes de tarefas, pessoas e configurações, assim como contagens de mensagens internas/externas, permaneceram iguais durante a publicação.

## Ocorrência da ativação e reparo

Tentativa01 parou só na preparação por um guard de nomes de testes; nada foi ativado. A primeira admissão02 também recusou uma base concorrente antes de criar candidata; foi herdada a correção mais recente de histórico/Eventos, com os treze hashes-base Atlas reconferidos.

Na ativação02, após commit e validação SQL, o `events.conf` já existente de `planeje-atlas-office` sobrescreveu o WorkingDirectory do unit principal com uma candidata antiga. O fluxo parou os consumidores por segurança e restaurou frontend/fontes de trabalho sem conflitos. SQL novo e arquivos Edge foram preservados; não se restaurou SQL nem se repetiram migrações.

O reparo à frente validou hashes/contratos, alterou somente o WorkingDirectory desse drop-in, reativou os cinco consumidores e Edge e promoveu a mesma candidata testada. O publicador e o reparo tiveram revisão independente e regressões de recuperação. Publicações futuras precisam conferir **unit efetivo e drop-ins**, além do arquivo principal. Os registros privados ficam na release02; `forward-completed.json` e `published.json` confirmam a conclusão. Um `failed.json` anterior não significa que a versão final permaneceu parada.

## Evidência e limites

Passaram 286 verificações locais SQL/RLS, 266 Python da candidata, 29 Node de memória/gerente, helper de diálogo, build produtivo com 4.068 módulos, 27 fixtures do publicador e oito do reparo à frente. Cinco HTTP/arquivos tiveram hashes conferidos, mantendo o bundle anterior disponível. As rotas públicas sem autenticação recusaram os pedidos: chat401, equipe403 e eventos403. Os cinco serviços permaneceram ativos, sem marcadores de erro de inicialização no journal desde a publicação. Revisões locais e de publicação encerraram sem achados pertinentes abertos.

A conversa e a aba Memória foram conferidas autenticadas no navegador. O iframe do mapa continuou vazio no inspetor, comportamento já observado antes; esta entrega não certifica o mapa visualmente. Não houve mensagem de teste à equipe, chamada paga de IA ou alteração de configuração para criar evidência.

Falta observar em uso real: evento elegível → observação com fonte/data → recuperação contextual → consulta natural à conta → retorno à origem; depois correção/revogação em leitura futura. Aceite de Josias e conclusão de trabalho real não são inferidos dos testes nem da publicação.
