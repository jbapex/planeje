# Atlas — ondas, agentes e áudios dos grupos

**PUBLICADO em 09/10/2026 às 07:55.** O bloqueio SSH foi resolvido e a entrega entrou em produção com transcrição real. Os registros abaixo documentam o histórico local, anterior à publicação. Consulte o [estado produtivo e validação](atlas-ondas-audios-producao-2026-10-09.md).

**Nova tentativa visual de 09/10 — aguardando avaliação de Josias.** Feedback: a animação anterior ainda parecia estranha/artificial. Foram substituídos os quatro contornos concêntricos por três superfícies translúcidas com gradientes e uma borda de luz parcial. Curvas cúbicas fechadas dão continuidade ao contorno; cada camada deriva em fase diferente. Envelope de áudio com ataque de 110 ms e retorno de 380 ms, mais atraso suave entre camadas, reduz trancos. Desenho sincronizado aos frames do navegador; a esfera opaca permanece em primeiro plano. Não foi substituído o áudio real por movimento simulado no produto. A prévia continua explicitamente simulada.

Conferido no navegador: repouso, ouvir e falar; contorno evolui entre frames, zero erros de console. Build e sete testes de áudio/ondas passaram nesta revisão; os demais testes registrados abaixo são da entrega anterior. Nenhum teste/SQL foi executado em produção. [Captura desta versão](../evidencias/atlas-fluid-previa-2026-10-09.png).

**Ajuste visual de 09/10:** a pedido de Josias, o globo fica em primeiro plano e as ondas começam atrás dele, expandindo-se ao redor. Camada opaca circular cobre os trechos internos; respiração da esfera reduzida. Conferido na prévia (ondas z=0, globo z=2), zero erros de console, build e sete testes de áudio/ondas passaram. Continua local, sem publicação; bloqueio SSH anterior permanece.

Captura do ajuste: [ondas atrás do globo](../evidencias/atlas-ondas-atras-previa-2026-10-09.png).

Estado em 09/10/2026: implementação local validada; publicação e teste com áudio real pendentes. Produção continua com o bundle `ccb5ae8e`.

## Pedido e implementação

Josias pediu ondas ao redor da esfera, reação à sua fala e ao ritmo da voz do Atlas, indicação visual do agente acionado e transcrição de áudios dos clientes nos grupos.

- Superfícies de luz com curvas fechadas deformam-se com o volume medido. Microfone e saída WebRTC são analisados separadamente; silêncio, mute, autoplay bloqueado e encerramento não simulam volume. Movimento reduzido usa curvas estáticas.
- Cartões e conexões acendem pelos passos persistidos das missões. Trabalho simultâneo não some por causa de outra missão recente. Delegação entre especialistas tem uma linha própria. Conclusão/cancelamento encerram a animação.
- Áudio recebido dos grupos integrados da agência entra numa fila privada. O texto fica associado à mensagem original; guarda modelo, consumo informado, hash, tentativas e origem. Não guarda uma nova cópia do arquivo de áudio.
- Worker baixa o áudio com IDs da mensagem exata, no canal original. Não busca mensagem aproximada por horário nem segue URLs recebidas em webhooks. Pede MP3 à Uazapi; limita o arquivo a 24 MiB e faz uma transcrição por vez, com prazo de 150 s e lease de três minutos. Até três tentativas; falhas têm códigos sem segredos.
- Modelo inicial `gpt-4o-transcribe`, configurável no ambiente privado do servidor. Transcrição por mensagem é reutilizada nas consultas seguintes. Não há fine-tuning nem gravação de transcrições como preferências pessoais.
- O especialista Clientes lê o trecho com remetente, data e `source_inbox_id`. Texto longo tem `truncated` e leitura paginada de 6 mil caracteres, até o limite de 30 mil do registro. Fonte pendente/falha não significa áudio ouvido. Instruções contidas no áudio são dados não confiáveis.
- Em Conversas, o proprietário do Atlas pode expandir a transcrição abaixo do áudio. Outros usuários não recebem o texto. O controle “Transcrever áudios recebidos nos grupos para o Atlas” pausa novos trabalhos; textos já concluídos permanecem consultáveis.

## Dados, permissões e limites

Migração `20261009043258_atlas_group_audio_transcripts.sql` criada pelo Supabase CLI, aplicada somente no cluster descartável dos testes. Ainda não aplicada na VPS. Adiciona `transcribe_group_audio` (false), `audio_since` e `atlas_audio_transcripts` com RLS e RPCs invoker exclusivos do worker. Proprietário ativo + visibilidade da mensagem/conversa são exigidos. Excluir a mensagem exclui a transcrição. Bloquear/arquivar o grupo retira o acesso e impede trabalho novo.

Não cria motor operacional, tarefa, mudança de campanha, CAPI ou envio WhatsApp. A fila executa o trabalho técnico de transcrição, inclusive fora do expediente; cobrança e acompanhamento operacional continuam nas regras de horário já existentes.

O primeiro lote de até 24 horas é a configuração técnica proposta para ativação. Depois, entram os novos áudios. Não se propõe transcrever todo o histórico sem limite. Áudio expirado, formato ilegível ou falha do fornecedor aparece indisponível, sem texto inventado.

## Evidências locais

- `node --test scripts/atlasBackend.test.mjs scripts/atlasVoice.test.mjs scripts/atlasManager.test.mjs scripts/atlasAudio.test.mjs`: 48 testes passaram.
- `node scripts/atlasDatabase.test.mjs`: 165 verificações PostgreSQL passaram em cluster descartável, sem acessar produção.
- `npm run build`: passou. Bundle local atual após o refinamento: `index.90dea1ee.js` / `index.99b86101.css`. Este build não é um candidato reconciliado com a fonte produtiva e não deve ser copiado inteiro para produção.
- `node --check` nos dois scripts do worker: passou.
- Prévia em `http://127.0.0.1:4318/waves.html`: ouvir/falar e acionamento, conclusão/cancelamento de especialistas conferidos pelo navegador; quatro curvas, zero barras antigas, animação encerra em cancelamento, zero erros de console.
- A prévia usa amplitudes e missões de demonstração claramente identificadas. Não houve teste de voz real nem transcrição de cliente nesta entrega. Nenhum aceite de Josias foi inferido.
- Captura: [prévia das ondas](../evidencias/atlas-ondas-previa-2026-10-09.png).

## Retomada da publicação

O SSH anuncia que aceita a chave já cadastrada. A etapa de assinatura falha porque o macOS não permite acessar a senha da chave no chaveiro (`User interaction is not allowed`). A solicitação para Josias desbloquear o chaveiro de login está pendente. Não coletar senha, substituir chave, alterar autenticação ou abrir transporte alternativo.

1. Com a chave desbloqueada, ler estado e hashes da fonte produtiva `/root/planeje`. Preservar todas as alterações remotas. Comparar com manifesto local e reconciliar especialmente `AtendimentoThread.jsx`; não usar HEAD como fonte atual nem copiar o working tree local inteiro.
2. Criar candidato da fonte atual, aplicar somente os arquivos/deltas desta entrega, guardar backup e compilar/testar no candidato. Verificar schema real das tabelas de origem antes do SQL.
3. Conferir ausência da migração/coluna nova, ensaiar SQL com rollback e aplicar só `20261009043258` uma vez. Não reaplicar SQLs `004301`, `030813` ou `032640`. Recarregar schema PostgREST.
4. Atualizar módulos compartilhados e `atlas-chat` no runtime. O worker roda no candidato da release anterior: atualizar sua fonte efetiva ou apontar systemd para o novo candidato com arquivos/dependências verificados. Não basta editar `/root/planeje/scripts`.
5. Ativar `transcribe_group_audio` para o proprietário já configurado, com `audio_since=now()-interval '24 hours'`, sem modificar outros parâmetros nem exportar segredos. Reiniciar serviços afetados e publicar frontend seletivamente, preservando assets anteriores.
6. Confirmar uma mensagem real recebida: fila → transcrição → texto na própria mensagem → consulta do Atlas com fonte; conferir outro usuário sem acesso. Validar onda com entrada e saída de voz reais. Não enviar mensagem para testar.
7. Atualizar release/estado com bundle e evidência reais. Sincronizar a evidência final da entrega anterior, que também ficou local após falha SSH.
