# TRACK-APICE — spec de uso do workspace Impacto (18/09/2026)

Fonte: listagem operacional da instância TRACK na outra VPS, gravada em `extensao-whatsapp-planeje/outra vps`. É **especificação de comportamento**, não código a copiar. Não misturar as duas bases. Não remover rodapé/licença PalmUP daquela instância. Tokens, URLs com secret e IDs de Pixel/conta não entram neste arquivo.

## Menu do cliente (6 páginas)

Visão geral, Leads, Relatórios, Eventos Meta para quem está autenticado. Integrações e Configurações só com gestão. Backoffice/licença/login ficam fora.

## Regra de ouro do lead

Lead na plataforma = mensagem de **entrada**, **não grupo**, **não fromMe**, com **ctwaClid**. Sem isso a conversa pode existir no WhatsApp e não entra em Leads. Contato orgânico não vira CAPI pago.

## Ordem do webhook Uazapi (ciclo real)

1. Autentica instância + token da URL.
2. Parse (telefone, texto, fromMe, grupo, ctwaClid, IDs de anúncio, labels).
3. Log; evento duplicado para.
4. `fromMe` e não grupo: avalia **frase da equipe** só no lead já pago. Não cria lead.
5. Evento de labels + telefone + não grupo: avalia etiqueta só se já for lead pago.
6. Cria/atualiza lead só se inbound + não grupo + ctwaClid.
7. `LeadSubmitted` (auto_lead / “Conversa iniciada”) se ainda não existir o mesmo dedupe.
8. Avalia frase/etiqueta cadastradas.
9. Fila CAPI: token + Pixel + Página + phoneHash + ctwaClid + adId. Falta qualquer um → `not_configured`.
10. Ligar Meta depois **não** reenvia leads antigos.

No Impacto daquela instância: **zero gatilhos manuais**. Só roda o automático de conversa iniciada. Frase do atendente nunca cria lead.

## Integrações vs Configurações

Integrações ligam Meta, fonte WhatsApp e destino CAPI. Gatilhos de frase/etiqueta ficam em Configurações → Jornada. Relatórios só lêem Ads (Sincronizar Meta); não enviam CAPI. Eventos Meta reenviam só falha transitória de rede.

## WhatsApp daquela instância (Impacto)

Instância Uazapi conectada (nome de agenda da operação) + webhook inbound em observação, POSTs chegando na API do TRACK. Isso **não** é o webhook `uazapi-inbox-webhook` do Planeje. Não apontar o mesmo número para os dois produtos ao mesmo tempo: duplicaria CAPI.

Canais do Planeje no Impacto (Amanda / outro) são cadastros separados. CAPI do Planeje só dispara no canal cujo webhook Uazapi posta neste Supabase.

## O que o Planeje passa a espelhar

- Hub com as mesmas 5 abas de operação (Funil do Planeje fica escondido).
- Leads do hub começam filtrados em Meta Ads (CTWA).
- Webhook: `LeadSubmitted` na primeira mensagem paga; etiqueta/frase só com `ctwaClid`; `fromMe` avalia frase no contato já pago; grupo não converte.
- Sem replay dos eventos históricos falhos.
