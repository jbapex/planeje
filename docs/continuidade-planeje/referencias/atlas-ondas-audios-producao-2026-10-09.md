# Atlas — ondas e áudios publicados em 09/10/2026

Josias autorizou publicar todas as mudanças desta entrega. Acesso SSH recuperado; publicação concluída às 10:55 UTC (07:55 em São Paulo) na VPS 72.60.14.109. O candidato foi montado sobre a fonte produtiva atual, com comparação de hashes e reconciliação de AtendimentoThread, medidor de áudio e fixture da prévia. As alterações remotas foram preservadas.

- Frontend: `index.b84cf63f.js` / `index.80dfcb02.css`; recarregar `?v=b84cf63f#/assistant/atlas`. Assets anteriores `ccb5ae8e`/`208b174a` preservados.
- Ondas: três superfícies translúcidas e uma borda de luz, atrás da esfera, com curvas fechadas e transições suavizadas. Entrada do microfone e saída do Atlas medidas separadamente. Destaque de agentes acompanha passos reais das missões, incluindo delegação e trabalhos simultâneos.
- Backend: `atlas-chat`, `atlasManager`, `atlasManagerContext` e `atlasGroupAudio` atualizados no runtime; container de functions reiniciado.
- Worker: `planeje-atlas.service` ativo, diretório efetivo `/root/planeje-atlas-releases/atlas-fluid-audio-20261009-01/candidate`. Ambiente privado preservado. Executa uma transcrição por vez junto às missões existentes.
- SQL: somente `20261009043258_atlas_group_audio_transcripts.sql`, ensaiado com rollback no schema real e aplicado uma vez. Não reaplicar as três migrações Atlas anteriores nem esta.
- Ativação: `transcribe_group_audio=true` para o proprietário já configurado. Janela inicial de 24 horas; continua com novos áudios. Escolha técnica limitada, dentro da publicação solicitada. Pausa disponível nas preferências do Atlas.

## Validação

48 testes JavaScript e build passaram no candidato produtivo. A entrega tem também 165 verificações PostgreSQL locais em cluster descartável. Bootstrap autenticado respondeu 200, heartbeat atual, oito áudios recebidos reais transcritos com `gpt-4o-transcribe`, consumo do provedor registrado e nenhuma falha nesse lote. Leitura pelo Atlas validou mensagem de origem, texto completo paginado e trecho na conversa. Outro usuário ativo recebeu zero transcrições via RLS.

Interface do Atlas carregou na sessão de Josias, com quatro superfícies SVG e zero erros de console. Em Conversas, dois controles de transcrição apareceram sob áudios recebidos; o texto de 527 caracteres foi expandido e renderizou. O carregamento de mídias antigas dessa conversa retornou “Message not found” pelo caminho já existente de mídia; isso não impediu a transcrição nova. A nova reação visual a microfone/alto-falante não foi novamente testada em uma ligação real nesta publicação; testes de software e prévia simulada passaram. A confirmação de voz da versão anterior continua registrada, sem inferir novo aceite visual ou global.

Nenhuma mensagem WhatsApp foi enviada. Sem CAPI, alteração de campanha ou tarefa operacional. Transcrições são privadas, reutilizadas por mensagem e tratadas como fonte do cliente, nunca como instruções/memórias de Josias. Não foi criado arquivo de áudio adicional no servidor.

## Continuidade e recuperação

Release e backups seletivos: `/root/planeje-atlas-releases/atlas-fluid-audio-20261009-01`. Preservados index anterior, arquivos alterados, runtime e unidade systemd. Não desfazer schema/filas nem restaurar dados para voltar apenas o visual. Fonte oficial produtiva `/root/planeje` e candidato conferidos por hash. Não substituir pelo build local `90dea1ee`.

Pendentes: avaliação da aparência e das ondas na conversa real por Josias; acompanhar qualidade, latência e consumo em uso. A transcrição agora cobre os áudios recebidos nos grupos da agência, dentro da janela configurada; histórico anterior, áudio expirado e canais não abrangidos continuam fora dessa leitura. Escrita operacional e mensagens à equipe/clientes continuam fora do escopo.

[Release](../evidencias/releases/atlas-ondas-audios-producao-2026-10-09.json) · [Visual publicado](../evidencias/atlas-fluid-producao-2026-10-09.png) · [Histórico da implementação local](atlas-ondas-audios-2026-10-09.md)
