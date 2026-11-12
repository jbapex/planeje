**Continuação vigente:** [release 04, publicada às 08h36](crm-ia-perfis-leads-2026-11-11.md), com perfis, Leads/CSV e conversa integrada. O registro abaixo descreve a release 01.

# CRM IA no Squad — publicação de 11/11/2026

O núcleo comercial foi publicado às **03h06 BRT**, com autorização do pedido atual de Josias. A continuação de voz, transcrição e Google Agenda foi publicada às **05h33 BRT** na [release 02](crm-ia-voz-agenda-2026-11-11.md), que é a base vigente. A meta integral segue na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md). Publicação, validação técnica e aceite humano são estados distintos.

## O que está publicado

As dez áreas observadas no ScaleOS estão em `/crm-ia`: Painel, Funil, Leads, Conversas, Agentes IA, Agenda, Disparos, Rastreabilidade, Modelos e Configurações. O shell do Squad mantém a marca Planeje e usa a apresentação clara da referência. [Auditoria da referência](crm-ia-scaleos-auditoria-2026-11-11.md), [contratos](../../superpowers/specs/2026-11-11-crm-ia-design.md) e [plano](../../superpowers/plans/2026-11-11-crm-ia.md).

| Área | Fonte e comportamento |
| --- | --- |
| Painel | Agregados do período completo, com links ao recorte dos leads, conversas e agenda. Qualificados têm filtro próprio. Ausência de medição não vira resultado inventado. |
| Funil e Leads | `leads`, `crm_pipelines`, `crm_stages`, eventos e interações existentes. Busca, período, responsável, qualificação, paginação, edição com versão, importação CSV revisada e arquivamento recuperável. |
| Movimento | A transação oficial confere destino permitido, ações obrigatórias, interações e motivo de ganho/perda; grava etapa e evento juntos. Colaborador mantém o responsável ou assume para si; transferência a outra pessoa exige gestão. |
| Primeira conversa | O botão da ficha confere telefone e canal, resolve contato canônico sem escolher entre identidades ambíguas e abre em estado humano. Não envia mensagem ao abrir. |
| Conversas | Histórico e envio por cliente + canal + JID. Estado humano/IA é o registro compartilhado do contato em `cliente_atend_conversas`; pausa vale em todos os canais. Histórico atualiza a cada 5 segundos; listas e fila, a cada 15 segundos com a aba visível. |
| Mídia | Reutiliza o compositor, gravador e emoji da casa. Texto, imagem, áudio, vídeo e documento até 4 MB. Download exige mensagem conhecida no contato/canal. Bytes de envio ficam só na requisição; fila guarda hash/metadados. |
| Agentes | Qualificação, Follow-up e Agendamentos por funil/etapa, com identidade, modelo, conhecimento, idiomas, variáveis, gatilhos, janelas, cadência e destino. Agentes legados continuam visíveis e preservados. |
| Conhecimento e catálogo | Reutiliza bases, produtos e serviços existentes, com escopo da conta. Modelos removem referências de outra conta ao copiar. |
| Agenda | Compromissos internos com disponibilidade, fuso, exceções, antecedência, intervalo, folgas e limite diário. Reserva e conflito são conferidos no servidor, inclusive sob concorrência. |
| Rastreabilidade | Abre a operação oficial do Planeje com a conta selecionada; não cria outro motor de conversões. |
| Atlas | Especialista CRM IA no Squad, fonte autorizada `crm_ia` e rascunho contextual. Não envia WhatsApp nem cria motor paralelo de tarefas. A consulta ao modelo recebe indicadores e estados, sem copiar textos das conversas ao especialista. |

## Como uma resposta é executada

1. O webhook autenticado identifica cliente, canal e mensagem; a entrada respeita a configuração explícita da conta.
2. O executor escolhe agente por funil, etapa, modo e horário, respeitando pausa humana. Follow-up só atua no modo de silêncio.
3. Conhecimento e histórico são montados no escopo autorizado. O provedor e os modelos já usados pelo atendimento são preservados; o LLM privado do ScaleOS não é conhecido.
4. A saída estruturada tem ações limitadas. SQL revalida titular, configuração, origem, etapa e versão antes de alterar dados. Agendamento só é confirmado depois do recibo de reserva real.
5. A resposta entra na `crm_ia_outbox`. A reserva impede consumidores concorrentes; `crm_ia_delivery_start` consome a autorização de transporte uma vez por lease, inclusive diante de repetição HTTP.
6. `sent` exige confirmação do transporte. Timeout ou resposta ambígua vira `uncertain`, sem reenvio automático. A UI preserva o rascunho em falha, cancelamento ou processamento; não afirma confirmação falsa.
7. A cadência é armada após recibo. Nova resposta, pausa humana, alteração de agente/configuração ou revogação invalida trabalho pendente. Execução expirada é encerrada para não travar a fila.

Eco antecipado de uma mensagem da API recebe marca provisória. Só um recibo de automação com o mesmo ID/canal e a mesma versão pode desfazer essa pausa; alteração humana posterior prevalece. Não se compara o texto para inferir autoria.

## Release e preservação

- Release: `crm-ia-20261111-01`; base: `gestor-rastreamento-20261111-01`.
- 71 sobreposições; 2.019 fontes no manifesto final. Foram acrescentados três helpers puros necessários à compilação do Atlas. Três dependências existentes que divergiam localmente foram herdadas da VPS.
- Perfil `.env.production.local` herdado somente dentro da VPS. Flags produtivas dos pilotos preservadas. Nenhum segredo foi copiado ao ambiente local ou ao relatório.
- HTML SHA-256: `670dce7fce20ace2523fa39403a39aec15edd04e19a708a89012d539c4401481`.
- Entrada: `index.d416e401.js`; CSS: `index.7d7406ee.css`. HTML e 22 assets conferidos por HTTPS/hash; assets antigos preservados.
- Seis entradas Edge compiladas em bundles ESM: CRM IA, Atendimento IA, scheduler, remetente, webhook e Atlas Chat. `_shared` vivo não foi sobrescrito. O mesmo container Edge foi reiniciado, preservando sua configuração e ambiente.
- Os cinco serviços Atlas, suas unidades/drop-ins, MCP e sincronizador CRM Ápice foram preservados, sem reinício.

Aplicadas uma vez, juntas em uma transação: `20261111041703`, `20261111041704`, `20261111043800` e `20261111044652`. **Não reaplicar**. A VPS não utiliza `supabase_migrations.schema_migrations`; os hashes/recibos ficam no diretório da release. A preparação recusa tabelas CRM IA já presentes. Em recuperação, restaurar seletivamente código/runtime/HTML; o SQL aditivo permanece.

## Evidência e limites

`npm run check` passou. As suítes CRM locais e 35 verificações SQL de entrega passaram em PostgreSQL descartável por socket Unix, sem DSN produtivo. A candidata passou em 48 testes Node na VPS e no build produtivo. A revisão independente usou ainda 73 testes Node, dez casos de banco e reproduções de concorrência, privacidade e revogação. As contagens se sobrepõem e não devem ser somadas como casos únicos.

CUA conferiu desktop, 390/320 px, fechamento por Escape, erro sem perder formulário, recuperação de leitura e data civil sem deslocamento de fuso. Na produção, conferiu sessão, seleção de conta, painel, agentes existentes, agenda, fila vazia e repasse ao Atlas com cliente/especialista e texto revisável. Nenhuma mensagem ou geração real foi acionada nos testes.

RLS está ativa nas tabelas novas; `anon` não executa o workspace e `authenticated` não executa o início do transporte. Logo após a publicação havia zero configurações novas e zero envios novos: não houve ativação em massa. A agência ainda precisa da preparação explícita por conta; autonomia exige configuração geral e autorização do agente.

Voz gerada, transcrição privada de áudios e Google Agenda estão na [release 02 publicada](crm-ia-voz-agenda-2026-11-11.md). Disparos e Inspetor permanecem com a indisponibilidade observada na referência. Remarcação/cancelamento pelo agente e recuperação de ausência ainda não equivalem a todos os controles privados do ScaleOS. Não há certificação de equivalência de 100% da engenharia privada.

A homologação ponta a ponta precisa de número WhatsApp de teste autorizado e da conta/calendário Google escolhidos pelo usuário; as perguntas foram enviadas sem interromper o trabalho independente. O teste com o provedor real pode consumir sua franquia. [Recibo sanitizado](../evidencias/releases/crm-ia-producao-2026-11-11.json).
