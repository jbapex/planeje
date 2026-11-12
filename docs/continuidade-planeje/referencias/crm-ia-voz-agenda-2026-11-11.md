**Continuação vigente:** [release 04, publicada às 08h36](crm-ia-perfis-leads-2026-11-11.md), com perfis, Leads/CSV e conversa integrada. O registro abaixo descreve a release 02.

# CRM IA — voz e Google Agenda, 11/11/2026

## Estado

Continuação publicada às **05h33 BRT**, na release `crm-ia-20261111-02`, sobre o núcleo `crm-ia-20261111-01`. HTTPS, fontes, runtime, permissões e interface autenticada foram conferidos. A meta integral continua na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md); não houve aceite humano nem homologação real de provedores. [Estado do núcleo](crm-ia-producao-2026-11-11.md), [contratos](../../superpowers/specs/2026-11-11-crm-ia-design.md) e [auditoria da referência](crm-ia-scaleos-auditoria-2026-11-11.md).

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

`npm run check` e 163 testes dirigidos passaram, com rede externa negada. Cobrem PostgreSQL descartável por socket Unix, transportes falsos, autorização antes de custo, canal/contato, concorrência, pausa, OAuth por sessão, ETag, ocupações externas, confirmação e fallback. A candidata passou em 109 testes Node na VPS e no build com perfil produtivo herdado. A revisão independente encerrou sem achados pendentes no escopo exato; contagens sobrepostas não devem ser somadas.

A primeira preparação parou em uma fixture antiga do Atlas, com a mesma falha reproduzida na release base. Foram adotadas duas correções locais de fixture: vínculo canônico do grupo e método de paginação do Supabase fictício. Todos os asserts foram mantidos. A candidata que falhou foi preservada; nenhuma migração ou promoção havia ocorrido naquela tentativa.

A prévia foi conferida em desktop e 390 px: salvar voz/velocidade/compreensão preserva os campos e não liga autonomia; Google sem configuração mostra indisponibilidade real. Na sessão produtiva, Google Agenda estava desconectado com botão de conexão disponível; o editor de agente mostrou voz e compreensão desligadas e foi cancelado sem salvar.

## Release e recuperação

São 54 sobreposições e 2.046 fontes no manifesto. HTML SHA-256 `66b7950616f49a2c74cfbf9552694299ab974226edab3b9fd3e93ac7b731704c`; entrada `index.949697ec.js` e CSS `index.7d7406ee.css`. HTML e todos os 22 assets do build passaram por HTTPS/hash. Oito entradas Edge foram compiladas em bundles ESM, incluindo Calendar e a ponte do callback Drive. Apenas o mesmo container Edge foi reiniciado, preservando ambiente/configuração; Atlas, MCP e sincronizador CRM permaneceram sem reinício.

Aplicadas uma vez, juntas em uma transação: `20261111062101`, `20261111062548`, `20261111072502` e `20261111075558`. **Não editar nem reaplicar.** As quatro da release 01 também permanecem intactas. O último contrato corrige modelos que perdiam configurações de agenda e valida novas gravações sem reescrever agentes/templates existentes. Slots rejeita intervalo/duração inválidos antes da iteração.

Em recuperação, restaurar seletivamente fontes/runtime/HTML conferindo concorrência; SQL aditivo permanece. O perfil canônico foi herdado da candidata da release 01 exclusivamente na VPS. As tabelas privadas têm RLS e não permitem o serviço Calendar ou início de transporte ao papel autenticado. Após a publicação havia zero novas configurações CRM, filas, autorizações de voz, transcrições e conexões Calendar: nenhuma ativação em massa. [Recibo sanitizado](../evidencias/releases/crm-ia-voz-agenda-producao-2026-11-11.json).

Não foram usados modelo real, WhatsApp real, consentimento Google ou dados de clientes nos testes. A homologação depende do número de teste e da conta/calendário escolhidos pelo usuário. Voz espelhada, mecanismos adicionais de Concierge e demais diferenças observadas continuam sujeitos à matriz de paridade; não há declaração de equivalência integral da engenharia privada do ScaleOS.
