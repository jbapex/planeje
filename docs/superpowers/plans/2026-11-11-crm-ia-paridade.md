# CRM IA — execução da paridade observável

**Objetivo:** concluir os controles remanescentes do pedido integral, com a mesma apresentação da referência e registros canônicos conectados.

**Base:** release `crm-ia-20261111-02`, 05h33 BRT. [Desenho](../specs/2026-11-11-crm-ia-paridade-design.md), [matriz completa](../../continuidade-planeje/referencias/crm-ia-scaleos-paridade-2026-11-11.md) e [evidência publicada](../../continuidade-planeje/referencias/crm-ia-voz-agenda-2026-11-11.md).

## Onda 1

- [x] Ler os consumidores, identificar lacunas e registrar contrato e limites.
- [x] Backend de propostas/confirmação, alterações de agenda e recuperação de ausência.
- [x] Áudio espelhado e tons observados, com prova de origem e compatibilidade.
- [x] Rascunho automático, publicação e descarte de agentes, sem afetar runtime antes de publicar.
- [x] Agenda semanal, fuso autoritativo do recorte e formulário de marcação humana de ausência; backend e publicação seguem pendentes.
- [ ] Integrar callers/fixtures/testes e revisar o intervalo sensível exato.
- [ ] Verificar localmente e publicar incremento sobre fontes/perfil vivos da release 02.
- [ ] Conferir interface autenticada, HTTPS/artefatos e serviços, sem teste produtivo não autorizado.

## Coordenação

Backend de Concierge detém runtime, parser/prompt tipado, scheduler e nova migration de ações/agenda. Autor de agentes detém editor, voz e nova migration de rascunhos/modos; não modifica runtime/parser. Coordenador detém Agenda, CSS, API comum, fixture de prévia, documentação, configuração, Git e publicação. Testes novos têm arquivos próprios; mudanças em testes compartilhados são combinadas antes. Revisor somente leitura.

Migrations publicadas permanecem imutáveis. Novas wrappers do workspace têm nomes únicos e ordem definida, mantendo autorização, OIDs quando possível e os gates existentes. A declaração de proposta de modelo não prova consentimento do contato nem autorização de transporte.

## Ondas seguintes

Continuar a matriz após integrar esta onda: perfis de lead; notificações à equipe/titular; filtros/colunas/ficha/importação; totais/arrasto/ícones do Kanban; leitura/avaliação/notificações/atalhos de Conversas; distribuição por origem; configuração por chat; gestão de conhecimento/catálogo; painel/parceiros com cobertura. Não marcar a meta completa por concluir uma publicação incremental.

## Evidência local da agenda

`agenda-week.test.mjs`, `ui-agenda-week.test.mjs` e `preview-contract.test.mjs`: 16/16 em 11/11, sem chamadas externas. Incluem período de sete dias, virada civil no fuso, sobreposição, área acionável de cinco minutos, grade vazia, resumo do servidor, consulta sem escrita e conflito que conserva canal/versão. O fuso da resposta RPC prevalece sobre o workspace antigo da aba. CUA conferiu a grade em 390/1800px e o editor de agentes em 320px; nenhuma página apresentou rolagem horizontal global. Rascunho foi retomado e descartado na fixture, sem publicação. Essa evidência local não comprova homologação produtiva nem envio WhatsApp.

A integração local consolidada passou **205/205 testes dirigidos, sem skips**, com rede negada e PostgreSQL descartável; inclui as onze migrations na ordem real para runtime, voz, rascunhos e ações de agenda. `npm run check` passou. O gate sensível independente e a promoção continuam pendentes. A correção de etiquetas acrescenta a nova migration `20261111090003`, sem modificar as oito já aplicadas.
