# Atlas: ciclo de iluminação e descanso — 16/10/2026

Publicado às 00h37, São Paulo, após Josias perguntar por que o escritório ficava claro e os personagens ativos à noite e confirmar “vamos fazer”.

## Comportamento

O relógio visual usa `America/Sao_Paulo` com `Intl.DateTimeFormat`, independentemente do fuso do dispositivo. A iluminação reaproveita a interpolação existente do Habblaud: madrugada/amanhecer/dia/entardecer/noite, exterior azulado e lâmpadas quentes. Os relógios do cenário acompanham a hora fornecida. É um ciclo visual por horário; não consulta clima ou astronomia. Cabeçalho e painéis mantêm a identidade atual, sem modo escuro global.

Fora de segunda a sexta, 08h–17h, os agentes entram em descanso e cochilam nas mesas. Não passeiam nem aceitam convites sociais. Aos sábados e domingos descansam mesmo com o cenário diurno. Um acompanhamento pausado também descansa em horário comercial. O estado visual é separado das filas: perguntas, propostas e erros continuam visíveis nos contadores, filtros e painéis; o mapa deixa de levantar mãos/exibir balões de cobrança durante o descanso.

Uma análise efetivamente em andamento, com heartbeat recente e reserva válida, acorda apenas os agentes relacionados àquele cliente. Fila solicitada, pergunta, erro ou análise antiga não simulam trabalho. Quando a análise deixa de estar ativa, volta ao descanso. Isso observa o processamento que já existia; não cria chamadas de IA nem muda o gerente. A conversa em tela separada continua disponível.

A apresentação reavalia o relógio a cada 15 s e ao voltar à aba. Só atualiza animação/interface; não adiciona consultas ao banco ou ao provedor. As consultas autenticadas existentes continuam com seus intervalos. Rascunhos, seleção, rolagem e expansão são preservados pela renderização existente. Personagens continuam representando agentes, não presença humana.

## Fontes e escopo

Novo `src/lib/atlasOfficeClock.js`; adaptador `atlasOfficePresentation.js`; ponte `AtlasOffice.jsx` com URL versionada `/atlas-office/index.html?v=daylight-20261016-01`; apresentação `scripts/atlas-office-live/main.ts`. Ajustes aditivos no Habblaud vendorizado: opção `daylightHour`, campo visual opcional `resting`, consumo do relógio no renderer, interrupção de passeio na transição e exclusão de agentes descansando de rodas sociais. O cochilo reaproveita o comportamento original de inatividade longa. Teste `scripts/atlasOfficeHours.test.mjs` usa a simulação real, sem DOM/provedor/banco.

Fixture local ganhou `?scenario=analyzing` para validar visualmente um agente atendendo enquanto outro descansa. Essa fixture não foi promovida à produção. Sem SQL, mudança de worker/serviço/autenticação, limites, IA, tarefa, comentário, memória ou envio externo.

## Verificação

- Oito cenários Node: limites exatos de 08h/17h, dias úteis/fim de semana/meia-noite, fases e continuidade de luz, imutabilidade das pendências, pose real de sono por três minutos simulados, recusa de convite social, análise fresca versus expirada/erro/fila, despertar/retorno/retomada de manhã e interrupção de passeio. Passaram também com `TZ=Asia/Tokyo` e `TZ=America/Los_Angeles`.
- 62 verificações de ditado/estados e 30 do escritório passaram localmente e na candidata remota. Sem chamada ao modelo.
- Builds do escritório e completo da candidata reconciliada passaram (40,09 s no completo), mantendo `VITE_ATLAS_DEMANDS_ENABLED=true` / `VITE_ATLAS_DEMAND_PILOT=false`. Nenhuma Assessoria/funil de teste promovida; `cs_snapshots` ausente do bundle produtivo.
- Navegador fictício: noite, um trabalhando/outro descansando, rascunho ao atualizar/ampliar/reduzir, áudio disponível, 390×844 sem transbordamento (366 px disponíveis = 366 px de scroll). Viewport restaurado.
- Produção autenticada: cenário noturno, sete agentes em descanso, perguntas/erro acessíveis, versão do iframe correta, Ampliar/Esc, sem transbordamento (1318/1318 px) e zero erros de console. Não se iniciou análise real como teste. Quantidades de pendências refletem o estado vivo e podem mudar durante uso de Josias.
- HTTP público: hashes dos dois índices correspondem à candidata, novos assets e anteriores respondem 200. Serviços do Atlas mantidos ativos, sem reinício.

Capturas reais ficam somente em `.local/atlas-daylight/atlas-noite-producao-2026-10-16.png` e `atlas-noite-ampliado-producao-2026-10-16.png`, sem versionar dados de clientes. Capturas fictícias privadas em `mobile-preview.png` / `manual-preview.png`. Aceite visual de Josias e observação de uma transição natural de expediente permanecem pendentes; os limites foram simulados em teste.

## Publicação e recuperação

Release `/root/planeje-releases/atlas-daylight-20261016-01`, construída de `/root/planeje` com patch limitado a dez arquivos. Verificados hashes prévios e igualdade das demais fontes `src`. Novos assets copiados antes de trocar atomicamente os índices; arquivos antigos preservados.

Main `index.883defd9.js` / `index.8a46408f.css`; mapa `index-d6177d45.js` / `index-5acebe14.css`. Main anterior `3413bd21`/`8a46408f` e mapa `0b828dc0`/`5acebe14` conservados. URL `https://planeje.jbapex.com.br/?v=883defd9#/assistant/atlas`.

Backups seletivos de fontes, índice principal e diretório servido do mapa em `before/`. Para recuperar apresentação, restaurar esses dois índices/diretório e fontes anteriores; os dois arquivos novos podem permanecer sem uso. Não alterar dados nem reaplicar migrações. Serviços continuam nos diretórios de trabalho já configurados; esta entrega não requer reinício.
