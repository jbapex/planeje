# Mini CRM — automação por mensagem e horário — 16/10/2026

Publicado na VPS 109 em 16/10/2026 às 12h50 (São Paulo). Assets `index.c682c5dd.js` / `index.cd788441.css`; conserva `a4b77eda` / `8ff25961` e anteriores. Candidata exata: `/root/planeje-releases/mini-crm-message-rules-20261016-01/candidate`. Incorpora Meta Link, cópia de configuração, cadastro de vendedores e demais entregas produtivas. Escritório `panels-logos-20261016-01` preservado.

## Pedido e referência

Josias pediu uma inteligência semelhante ao CRM da VPS 82.29.181.87: novo lead, resposta da equipe → atendimento, palavras configuráveis e agendamento com data e hora. Informou usuário SSH root. As chaves disponíveis não autenticaram; a análise foi feita pela tela autenticada existente de `crm.jbapex.com.br/integracoes/status-mensagens` e pelo código público do frontend. Nenhuma configuração ou serviço do sistema de referência foi alterado; não se obteve o código do backend dele.

## Uso

Mini CRM → escolher cliente → **Automação**. Regras independentes por cliente, desligadas por padrão. Escolher etapas de entrada e atendimento; opcionalmente confirmar agendamento, a coluna de data e palavras extras; criar palavras/frases com remetente e canais; Salvar regras. Sem canais selecionados, vale em todos os canais individuais desse cliente, inclusive ingressos sem instância vinculada. Prévia de frase não grava contato.

Chegada sem etapa → novo lead; primeira resposta da equipe → atendimento, sem regredir etapas avançadas. Confirmação de agendamento enviada pela equipe preenche a etapa, data e horário quando explícito. Aceita dia/mês, ano opcional, nomes de meses, hoje/amanhã e formatos 15h, 15hrs, 15h30, 15:30. Normaliza acentos e admite uma letra diferente nas palavras de confirmação. Datas/horários inválidos, alternativas múltiplas, perguntas e negações simples não são confirmações. Sem ano usa São Paulo, com tolerância de sete dias para o ano corrente; prévia explica a virada para o próximo ano. Sem hora, o valor antigo é limpo e fica sem horário, sem inventar uma hora.

Agendamento confirmado tem prioridade sobre palavras; entre palavras vence a primeira regra configurada que combinar. Regras de palavras não usam IA. Marcar a etapa manualmente, inclusive em editores legados, pausa aquele contato. Kanban → Preencher dados (ou painel Follow-up) oferece **Retomar automação**, também para etapa preexistente considerada manual. Venda Realizada, Lead Qualificado, Follow Up e Repescagem mantêm suas ações próprias de confirmação/cadência e não são destinos automáticos dessa entrega.

Hora acompanha a coluna existente em um campo separado `${coluna}_hora`; datas anteriores não são convertidas. Grade, ficha lateral, resumo de datas do Follow-up e calendário mostram o horário. Calendário ordena por hora e nome. Não há nova agenda externa nem envio de confirmação.

## Persistência e limites

`mini_crm_message_rules` guarda regras e versão; `mini_crm_message_history` registra transições por mensagem, sem copiar o texto completo. Dois webhooks aguardam o runner compartilhado; Uazapi reconhece mensagens reais de cliente/equipe e o ingresso Chatvolt usa `agentResponse` apenas para a regra de mensagens da equipe. Reações, confirmações de entrega, atualizações, notas/bloqueios e eventos de grupo são ignorados pelo motor.

RPC de serviço aplica patch com comparação de versões e trava no contato; não sobrescreve edição simultânea. ID/canal, horários e ordem protegem duplicidade/atrasos; mensagens distintas no mesmo segundo podem ser processadas. Regras salvas valem para as mensagens a partir do salvamento, sem histórico retroativo. Contatos em etapa avançada sem autoria automática são preservados como manuais.

Edição da página usa RPC que mescla somente os campos alterados, com fila por contato, conservando outros campos e metadados. Realtime atualiza cartões; consulta de até 200 IDs alterados a cada 20 s, somente com página visível, cobre desconexão. Metadados da automação não podem ser forjados pela UI. Conta/sessão vigente, módulo, cliente e RLS existentes continuam exigidos; configuração indisponível para membros não administradores da loja. Histórico só leitura para usuário autorizado que possa ver o contato; aplicação automática exclusiva do serviço. Funções novas são SECURITY INVOKER, search_path vazio e grants explícitos.

## Validação e operação

48 verificações puras, 12 casos dos handlers reais com transporte isolado, 58 verificações API/Auth/RLS em banco CS, nove scripts no build completo no Mac e sete scripts na candidata remota passaram. Prévia com dados fictícios validou resposta → atendimento, agendamento com hora, observação simultânea preservada, pausa/retomada, palavras/canais, data inválida, calendário e tela estreita. Produção autenticada da Casa D Noivas confirmou a aba, canal Larissa, etapas e configuração desligada. HTTP exato de assets novos/anteriores, recusas de webhook sem segredo, grants/RLS, serviços e Atlas conferidos.

SQL novo `20261016152632_mini_crm_message_automation.sql` aplicado uma vez no teste e uma vez na produção. O teste recebeu apenas complemento dos grants durante a revisão; não reaplicar o arquivo na produção ou no CS. Não há migrações anteriores reaplicadas. Apenas `supabase-edge-functions` reiniciado; VPS e Atlas não reiniciados. Fontes selecionadas incorporadas à candidata CS, sem rebuild/publicação da Assessoria ou restart nela.

Regras reais permanecem desligadas. Nenhum contato/horário fictício ou vendedor real foi criado na produção para teste; nenhuma mensagem WhatsApp, CAPI ou e-mail foi enviada pelo agente. A configuração escolhida pelo usuário e a primeira mensagem real após ativação ainda precisam de aceite de uso. Não declarar que a integração real foi validada enviando mensagem: os ensaios funcionais foram isolados.

[Release](../evidencias/releases/mini-crm-automacao-2026-10-16.json) · [Evidências](../evidencias/mini-crm-automacao-2026-10-16.json).
