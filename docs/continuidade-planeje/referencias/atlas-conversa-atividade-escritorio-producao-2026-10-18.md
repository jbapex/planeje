# Atlas: conversa e atividade no escritório — publicação

Publicado em **18/10/2026, 14h37 de São Paulo**. Josias autorizou este conjunto com “pode”, em resposta à pergunta específica de publicação. **Aceite de uso permanece pendente.**

[Abrir o escritório publicado](https://planeje.jbapex.com.br/?v=dbe714f9#/assistant/atlas) · [evidência e hashes](../evidencias/releases/atlas-conversa-atividade-escritorio-producao-2026-10-18.json) · [conferência visual real](../evidencias/atlas-conversa-atividade-escritorio-producao-2026-10-18.jpg).

## Resultado

Conversa com avatar existente do robô, painel claro e controles em “Detalhes e histórico”. Consulta contínua por texto/áudio no mesmo controlador; contexto e confirmação de cliente conservados. “Atlas e especialistas de IA” mostra passos reais separados dos acompanhamentos por pessoa. O sprite pixelado visita o especialista ativo; clique abre a consulta/conversa exatas. Espera por outro especialista é distinta de leitura; fim/falha retiram o trabalho ativo. Atualização pela leitura existente a cada quatro segundos, inclusive durante outro envio. Heartbeat antigo/ausente não mantém personagem trabalhando.

Este conjunto altera apresentação e ligação entre registros já existentes. Não cria autonomia, motor paralelo de tarefas, pessoa, presença humana ou confirmação de entrega. “Retorno recebido” e “Consulta finalizada” conservam esse limite. Detalhes funcionais e falha legada fora do delta na [entrega local](atlas-conversa-atividade-escritorio-local-2026-10-18.md).

## Composição e operação

Candidata publicada: `/root/planeje-releases/atlas-office-live-chat-20261018-01/candidate`; fonte/perfil anterior `social-calendar-polish-20261018-02/candidate`. Guarda de **1.726 fontes**, 14 overlays (11 fontes/teste e três arquivos de mapa gerados). Os 11 arquivos anteriores conferiram contra a baseline produtiva; nenhum outro trabalho da raiz local foi promovido. Calendário corrigido preservado pela composição e guarda integral. `.env.production.local` herdado somente dentro da VPS, modo0600; flags habilitadas/piloto falso conferidas, sem exposição do conteúdo.

Assets main `/assets/index.dbe714f9.js` e `/assets/index.828bc4c4.css`; mapa `/atlas-office/bundle/index-1ed69416.js` e `/atlas-office/bundle/index-59ec53c3.css`. Versão do iframe `conversa-atividade-20261018-01`. Ambos os HTML trocados com assets imutáveis novos já disponíveis; anteriores e backups preservados. Guardas otimistas detectam edição concorrente e rollback não sobrescreve gravação externa. Não repetir o publicador após tentativa concluída; inspecionar os registros se houver interrupção.

**Nenhum SQL, Edge, cron, unidade, modelo, autenticação ou restart alterado.** Worker principal continua na candidata source-order; outros caminhos systemd conservados. Futuras publicações devem usar a nova candidata de frontend/perfil e manifesto, conferindo fontes/concorrência antes de compor. Não reaplicar migrações anteriores, inclusive 20261018014504 e 20261018150153.

## Verificação e limites

- 51 testes Node locais e remotos, `npm run check` final e builds main/mapa passaram. As 32 verificações de navegador da entrega local passaram; o conjunto integrado de dez foi repetido após o bump do iframe, sem rede externa.
- Revisão independente do código anterior e do publicador sem achados abertos; 12 fixtures de recuperação passaram localmente e na VPS, incluindo falha entre os dois HTML e colisão de asset imutável.
- Lint opcional na candidata remota não encontrou configuração ESLint herdada. A fonte produtiva não foi ampliada com configuração do toolkit para contornar isso; lint/check final local dos arquivos alterados passou. Não apresentar essa tentativa remota como aprovada nem declarar suíte inteira verde.
- Seis respostas HTTP200 com hashes exatos, 1.726 fontes, quatro serviços ativos e hashes de unidades preservados conferidos após publicação.
- Sessão real autenticada: mapa visível, novo chat/avatar aberto pelo botão do escritório, contexto de clientes disponível, detalhes abrem/recolhem; faixa indica “Nenhuma consulta em execução agora”. Não houve missão em execução a observar nesse momento.
- Nenhum pedido, mensagem, tarefa ou chamada paga foi criado para validar. Não houve gravação/transcrição real de microfone nesta etapa. Uso do novo mapa durante uma consulta humana real, retorno da equipe e aceite de Josias permanecem pendentes.

Artefatos privados de operação em `.local/atlas-office-live-chat-release-20261018-01/`, com fontes/testes selados, baseline, build, revisão, publicação, verificação e captura. A evidência local anterior permanece como histórico datado, sem significar que esta versão ainda aguarda publicação.
