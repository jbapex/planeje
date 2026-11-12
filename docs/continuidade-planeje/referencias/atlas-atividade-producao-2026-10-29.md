# Atlas: atividade operacional no chat — produção

Publicado em 29/10/2026, 00h14 (São Paulo), após autorização explícita de Josias: “publicar”. Aceite de uso é uma etapa separada.

## Comportamento

O chat mostra atividade operacional confirmada: contexto, fontes consultadas, especialistas, registro de perguntas internas, destinatários, respostas recebidas, retornos, falhas e espera por orçamento. O histórico é expansível. Indicador de trabalho depende de lease vigente; fila ou lease expirado não aparecem como processamento infinito. Consultas filhas exibem recibos somente ao dono e após validar vínculo, cliente e requisição.

Novas respostas são apresentadas progressivamente depois de validadas e salvas. Não é streaming bruto do provedor. Respostas antigas não são reanimadas. Movimento reduzido, teclado, rascunho e envio imediato foram preservados.

## Operação

Candidata: `/root/planeje-releases/atlas-activity-20261028-01/candidate`. Base herdada de `rastreamento-leads-compact-20261028-01`, inclusive perfil produtivo; 1.790 fontes. Assets: `index.318dea93.js` e `index.65c717d0.css`. Overlay de nove arquivos, hashes na evidência.

Migração `20261028233500_atlas_team_activity.sql` aplicada UMA VEZ. Não reaplicar. Só `planeje-atlas-team` foi reiniciado; cinco serviços ativos, quatro unidades restantes, Edge e ambiente produtivo preservados. Escrita de atividade restrita ao serviço e lease; leitura reutiliza acesso vigente da conversa. Sem conteúdo livre de ferramentas, prompts ou raciocínio privado.

Preparações anteriores foram interrompidas por concorrência de release e fixture incompleta. A primeira ativação parou antes do SQL por comparação de metadado dinâmico do systemd; HTML/fontes/unidade foram recuperados sem conflitos. A comparação foi corrigida para configuração estática, mantendo comando/drop-ins/ambiente verificados e com regressão. A ativação final aplicou a migração uma única vez.

## Evidência

467 verificações SQL em PostgreSQL descartável; 184 testes Python seguros; 41 Node; seis cenários UI de atividade, dez de envio, oito de diálogo, sete de contexto; lint sem erros (sete avisos preexistentes) e build passaram. Publicador: 28 testes de promoção/rollback e nove de ativação/configuração/recuperação locais e remotos. Candidata passou 184 testes Python, helpers e build com perfil herdado.

Pós-publicação: seis HTTP/hashes, contrato SQL/ACL, fontes e serviços conferidos. UI autenticada abriu conversa existente e histórico expandido: execuções antigas mostram honestamente “Sem trilha detalhada para esta análise”. Captura privada fica somente em `.local/atlas-activity-release-20261028-01/published-chat.png`.

[Evidência sanitizada](../evidencias/atlas-atividade-2026-10-29/verification.json) · [Publicação e hashes](../evidencias/atlas-atividade-2026-10-29/published.json) · [Validação local](../evidencias/atlas-atividade-2026-10-29/local-verification.json).

## Limites e próximo passo

Trilha detalhada começa nas novas execuções. Escopo: execução operacional de cada conversa, não todas as automações da agência. Leitor mostra dez requisições recentes, até 96 eventos por requisição e cinco recibos de resposta de consulta filha. Registro interno não comprova entrega no WhatsApp nem leitura; relato não certifica publicação/entrega.

Nenhuma IA paga, mensagem, áudio ou imagem real de teste foi disparada. O ciclo humano completo com nova resposta e contato da equipe continua pendente de uso/aceite. Limites de orçamento existentes continuam valendo.
