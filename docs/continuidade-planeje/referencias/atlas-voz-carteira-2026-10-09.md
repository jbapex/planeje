# Atlas — voz, conversa e carteira atual · 09/10/2026

Pedido de Josias: revisar as últimas conversas, reduzir formalidade, corrigir cortes intermitentes de áudio e priorizar clientes fechados. Publicado em produção às 08:23 (SP); aceite de uso e conversa longa ainda pendentes.

## Diagnóstico observado

Leitura autorizada das últimas 18 mensagens e quatro resultados privados, sem copiar seu conteúdo para esta documentação. Uma pergunta sobre demandas do dia recebeu conselhos genéricos sem consulta. Uma análise geral de tráfego incluiu cliente perdido e dados antigos. Resumos sucessivos também perdiam ressalvas sobre período e ausência de conversão registrada. O texto passado pela camada de voz às vezes interpretava a fala em vez de preservá-la.

No transporte de voz, trocar de aba encerrava a sessão; WebRTC disconnected encerrava imediatamente; a resposta pós-ferramenta podia começar enquanto o áudio anterior tocava. Havia teto de 700 tokens sem tratamento de resposta incomplete. Não havia telemetria histórica dos eventos de áudio: estes são defeitos encontrados, não prova de que todos causaram cada corte relatado.

## Implementação

- `atlasVoiceSession`: tolerância de oito segundos para desconexão transitória, espera pelo fim da reprodução antes de falar/avisar missão, recuperação única de voz truncada por max_output_tokens sem repetir ferramentas, recusa de executar chamada incompleta, corrida de response.create recuperável, fim de sessão de 15 minutos adiado até terminar a fala. Stop/pagehide/desmontagem continuam liberando o microfone.
- `useAtlasVoice`: sair do foco da aba não encerra a conversa iniciada pelo usuário; fechar/sair da página continua encerrando.
- `atlasVoiceConfig`: teto de 2400 tokens; duas/três frases por fala, tom próximo, transcrição fiel em primeira pessoa no consult_atlas, preservação de período e incertezas. Modelo e voz existentes mantidos.
- `atlasManager`: diálogo menos formal, sem lista obrigatória de cinco prioridades; perguntas operacionais exigem consulta, com proteção para a pergunta de demandas antes respondida genericamente. Sem falha de integração/culpa/conversão inventadas a partir de campos ausentes. Relatórios anteriores permanecem históricos.
- Carteira atual definida por `clientes.etapa = closed`, conforme a regra de Ativos já usada pelo Planeje. Bootstrap e validação de novo escopo de chat/voz usam esse filtro. Leituras de tarefas, projetos, planos, tráfego, resultados e mensalidades também. Financeiro conserva despesas sem cliente e explicita que o recorte não é o total contábil histórico.
- Grupos usam o cadastro da agência como canal, mas só entram na análise quando o nome corresponde a cliente fechado. Vínculo por nome continua sendo inferência, não cadastro confirmado. Grupo sem correspondência fica fora; não significa conversa resolvida. Consulta fora desse escopo retorna fonte indisponível sem derrubar toda a missão.
- Contextos gerais resumidos antes de enviar ao modelo; detalhamento por cliente preservado. Isso evita consumir o contexto inteiro nos primeiros clientes e mantém os limites explícitos.
- Worker arquiva apenas seus próprios sinais automáticos obsoletos após evidência positiva de saída da carteira/escopo. Falha de leitura ou inventário incompleto não arquivam sinais. Relatórios e histórico não foram apagados.

## Validação

57 testes passaram no candidato da fonte produtiva, incluindo espera de reprodução, corte por limite, interrupção real do usuário, desconexão curta/longa, encerramento e escopo. Build completo passou.

Auditoria somente leitura com identidade do proprietário/RLS: 23 clientes fechados; 16 grupos elegíveis e 12 grupos fora do recorte; 16 contas com dados de tráfego; amostra de 50 tarefas; 30 projetos; 39 lançamentos do recorte. Todas as fontes testadas disponíveis e sem cliente perdido. Texto geral de planos caiu de aproximadamente 100 mil para 13 mil caracteres; tarefas de 39 mil para 24 mil. Amostras continuam limitadas e não são garantia de inventário operacional completo.

Teste real na sessão de Josias: a pergunta de demandas gerou missão, consultou overview e team e retornou resultado persistido. A saudação de voz completou na interface e a sessão voltou à espera. Microfone pausado no teste e ligação encerrada ao final. Zero erros de navegador observados. Nenhuma garantia de estabilidade em conversa longa inferida deste teste curto.

Worker ativo, fontes do monitor disponíveis, zero alertas automáticos abertos vinculados a clientes fora de closed no momento da conferência. Nenhuma mensagem WhatsApp/CAPI, mudança de cadastro/contrato, campanha, tarefa ou financeiro executada. Sem SQL/migração. As escritas da validação foram a própria conversa/missão privada do Atlas; arquivamento de sinais ocorreu pelo worker.

## Publicação e retomada

`index.66ba606f.js` / `index.e981fa67.css`; recarregar `https://planeje.jbapex.com.br/?v=66ba606f#/assistant/atlas` e iniciar nova ligação para receber a configuração de voz. Assets anteriores, inclusive `index.399e022d.js`, preservados.

Release `/root/planeje-atlas-releases/atlas-human-20261009-01`; worker `planeje-atlas.service` usa seu `candidate`. Fonte selecionada sincronizada em `/root/planeje`; funções selecionadas em `/opt/supabase-planeje/volumes/functions`. Backup dos arquivos, index e unit em `before/`. Env/credenciais existentes mantidos sem exposição. Continuar preservando working tree remoto e arquivos não rastreados.

Pendente: Josias testar uma conversa contínua no aparelho onde percebeu os cortes e avaliar o tom. Não houve aceite inferido. Se repetir, capturar o motivo de response.done e estado da conexão sem gravar áudio bruto/segredos. Grupos que não correspondem ao nome de um cadastro fechado exigem conferência explícita do vínculo antes de incluí-los.

## Documentação oficial consultada

- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Realtime server events](https://developers.openai.com/api/reference/resources/realtime/server-events)
