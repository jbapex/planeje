# CRM IA — voz e Google Agenda, 11/11/2026

## Estado

Continuação local do núcleo publicado em `crm-ia-20261111-01`. A candidata `crm-ia-20261111-02` está em revisão; este texto ainda não comprova a publicação dessa continuação. [Estado do núcleo](crm-ia-producao-2026-11-11.md), [contratos](../../superpowers/specs/2026-11-11-crm-ia-design.md) e [auditoria da referência](crm-ia-scaleos-auditoria-2026-11-11.md).

## Configuração e modelos

Em **Agentes IA → Configurar → Respostas e compreensão de áudio**, saída em voz sintética e compreensão de áudios recebidos são escolhas independentes, desligadas por padrão. A autorização é conferida no servidor por agente, autor e versão. A disponibilidade mostrada na UI informa somente se o servidor tem o provedor configurado; não revela a chave e não chama o modelo.

O modelo de conversa continua sendo a escolha já suportada no atendimento. Voz usa `gpt-4o-mini-tts`, com treze vozes e velocidade de 0,25 a 4. Transcrição usa `gpt-4o-mini-transcribe`, com detecção de idioma e sem vocabulário de outra empresa. O helper compartilhado conserva português e seus valores anteriores nos consumidores Atlas. O teste de agente continua textual e não envia WhatsApp.

Há manutenção necessária antes dos desligamentos anunciados: TTS em **06/01/2027**, transcrição em **26/02/2027**. As datas foram conferidas em 11/11/2026 nas referências oficiais de [síntese](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) e [transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create). Isso não autoriza trocar automaticamente modelos, provedor ou autenticação.

## Execução do áudio

O webhook aceita áudio sem texto pelo ID da mensagem e canal exatos. Antes de baixar ou transcrever, o banco verifica entrada, agente, janela, modo de teste, módulos e autorização atual. Mensagem já processada usa cache privado, inclusive em falha. Captura por frase só cria o lead se a transcrição contiver a frase configurada; não se presume conteúdo de um áudio incompreensível.

O histórico mostra a transcrição que já foi autorizada, sem acionar geração ou download ao abrir. Áudio recebido sem compreensão produz pedido de texto quando o atendimento estiver autorizado. Nova resposta ou intervenção humana invalida trabalho antigo.

A resposta de voz é gerada uma vez sob a reserva do envio, informa que foi criada por IA e permanece somente em memória, limitada a 4 MB. O banco guarda estados, hash e metadados. Falha do TTS usa texto antes de chamar WhatsApp; resultado incerto não inicia nova cobrança automática. Entrega WhatsApp continua exigindo recibo, com `uncertain` separado de `sent`.

## Google Agenda

Em **Configurações → Google Agenda**, cada pessoa conecta sua própria conta e escolhe um calendário com escrita. O botão apenas prepara o link; o consentimento acontece no Google. Depois do retorno, a aplicação elimina código e estado do endereço antes de montar as rotas e finaliza com JWT da mesma pessoa e sessão que iniciaram a operação. Código fica somente em memória por até cinco minutos; nonce é assinado, expira e é consumido uma vez. Tokens são cifrados em tabelas privadas.

Consulta de ocupações precede a oferta de horários e inclui as folgas configuradas. Falha, cache vencido ou cobertura incompleta não vira lista livre. Reagendamento exclui somente o evento próprio comprovado e conserva compromissos externos sobrepostos.

O espelho recebe apenas os horários e o título **Compromisso Planeje**, sem nome de lead, notas ou texto da conversa. ID determinístico, propriedade privada, ETag e versões evitam duplicação e sobrescrita de edição humana. Cancelamento só é considerado sincronizado após recibo atual. Desconectar remove a autorização local e preserva os eventos externos e a concessão compartilhada com o Drive.

O scheduler já existente entrega primeiro o legado, processa no máximo um job Google por tick com orçamento de 12 segundos e depois drena a fila CRM. Confirmações e lembretes aguardam recibo da versão atual. Falha ou incerteza gera aviso textual de conferência pela equipe, com comparação da fonte atual; não anuncia reserva confirmada nem reenvia confirmação se a reconciliação acontecer depois. A UI distingue reserva no Planeje e sincronização Google.

## Validação e limites

`npm run check` passou. As suítes dirigidas cobrem PostgreSQL descartável por socket Unix, transportes falsos, autorização antes de custo, canal/contato, concorrência, pausa, OAuth por sessão, ETag, ocupações externas, confirmação e fallback. A prévia foi conferida em desktop e 390 px: salvar voz/velocidade/compreensão preserva os campos e não liga autonomia; Google sem configuração mostra indisponibilidade real.

Não foram usados modelo real, WhatsApp real, consentimento Google ou dados de clientes nos testes. A homologação depende do número de teste e da conta/calendário escolhidos pelo usuário. Voz espelhada, mecanismos adicionais de Concierge e demais diferenças observadas continuam sujeitos à matriz de paridade; não há declaração de equivalência integral da engenharia privada do ScaleOS.
