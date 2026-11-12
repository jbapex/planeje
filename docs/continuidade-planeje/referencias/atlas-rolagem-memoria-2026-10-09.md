# Atlas — rolagem, adaptação de altura e memória atual

## Correção de interface em 09/10/2026

Diagnóstico real: a página Atlas era filha de uma coluna flex com rolagem, mas seu flex-shrink padrão e overflow:hidden a comprimiam à altura disponível. A área externa via scrollHeight igual à altura visível e não rolava; o conteúdo interno era cortado. O mínimo fixo de 735 px e o mapa com mínimo de 525 px agravavam o corte.

CSS ajustado: página preserva altura natural (flex:0 0 auto, largura100%); layout sem mínimo fixo; mapa de desktop varia com altura da janela, mantendo um mínimo legível; chat usa altura disponível e rola conteúdos longos; cartões compactos em telas baixas. Em telas estreitas os blocos seguem empilhados e a página rola. Fonte produtiva atual usada para o candidato e assets anteriores preservados. Somente CSS e fixture de prévia; nenhum SQL, restart de backend, envio WhatsApp ou alteração de memória.

Validação: prévia 1366×768 com rolagem externa e compositor visível; prévia 390×844 sem overflow horizontal e rolagem até o final. Produção: layout no tamanho original deixou todos os controles acessíveis; janela baixa com rolagem externa comprovada; Memória teve 3479 px de conteúdo em 860 px visíveis e scrollTop 2619. Interface móvel também conferida. Build produtivo passou. Aceite de Josias pendente.

## Como a memória funciona nesta versão (leitura do código e da VPS)

A persistência está no PostgreSQL do Supabase próprio na VPS 72.60.14.109, nas tabelas privadas atlas_*. Não é um vault Obsidian nem uma pasta de Markdown. atlas_conversations/atlas_messages guardam o histórico textual das consultas; atlas_memories guarda fatos, preferências e decisões com proprietário, contexto geral/cliente, assunto, origem, citação, versão e estado; atlas_jobs guarda pedidos/resultados/passos das missões; atlas_audio_transcripts guarda texto ligado ao áudio recebido original, sem virar automaticamente memória pessoal.

Auto_memory está ligado. No momento da primeira conferência havia 12 memórias ativas: 10 definições do brainstorm e 2 aprendidas nas conversas. A contagem pode mudar com uso posterior; a UI seguinte mostrou 13. Não registrar conteúdo privado de memórias nesta documentação.

Cada diálogo recebe oito mensagens recentes, até 20 memórias ativas priorizadas por pinned, busca textual em português e recência, além de contexto autorizado. Memórias de cliente só entram no escopo correspondente; gerais acompanham os contextos. O modelo propõe até três memórias duráveis por mensagem; código/SQL exigem trecho presente na mensagem de origem e rejeitam formatos de segredo. Fonte de cliente/resultado de agente não deve ser aprendida como preferência de Josias. Correção explícita pode substituir memória, preservando versão anterior; revogação retira das consultas novas. A aba Memória permite ver origem, corrigir/revogar e pausar aprendizado. A voz encaminha pedidos textuais ao mesmo serviço consult_atlas.

Limites atuais: busca textual, não busca semântica por embeddings; não relê todo histórico a cada fala; não há grafo de conhecimento entre notas/clientes/decisões/resultados nem vault/exportação Obsidian; habilidades definidas no código não se reescrevem sozinhas. Aprender aqui é salvar/recuperar contexto, sem retreinar os pesos do modelo. A rede visual da tela representa agentes, não conexões entre memórias. Evolução discutida, ainda não implementada: conhecimento conectado com origem, vigência, relações e aprendizados validados por resultado.

Publicação final: `index.399e022d.js` / `index.e981fa67.css`, `?v=399e022d#/assistant/atlas`. Release `/root/planeje-atlas-releases/atlas-scroll-20261009-01`, finalizada 09/10 às08:09 em São Paulo. Conserva `b84cf63f` e também a publicação intermediária `0d4261e1`. Worker permanece no candidato de áudio anterior; não foi reiniciado.
