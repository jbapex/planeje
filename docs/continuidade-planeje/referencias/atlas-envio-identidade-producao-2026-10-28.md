# Atlas: envio imediato e identidade do dono — produção

Publicado em **28/10/2026, 08h11 de São Paulo**, após Josias autorizar “pode” para este reparo, sua migração e o reinício dos consumidores afetados. Publicação e verificação técnica concluídas; primeiro ciclo humano e aceite continuam pendentes.

## Resultado e conjunto

A [entrega local](atlas-envio-identidade-local-2026-10-28.md) foi publicada com seis arquivos de produto: `AtlasTeamAssistant.jsx`/`.css`, `manager.py`, `server.py`, `time_rules.py` e a migração nova. Enter envia; Shift+Enter quebra linha. A própria mensagem aparece imediatamente, com confirmação do servidor separada da análise do Atlas. Falha ou perda do recibo preserva o texto e permite retentar o mesmo ID; novo rascunho, navegação e troca de identidade têm proteção própria. Continua existindo uma análise ativa por assunto, com o campo disponível para preparar a próxima mensagem.

O dono é identificado pelo ator/sessão autenticados. Em acompanhamento da execução (`followup`), uma nova diretiva explícita e inequívoca, como “Confirme com a Poliana.”, pode criar consulta filha mínima para a pessoa interna indicada. Não altera conta/responsável oficial nem exclui tarefa; não compartilha histórico privado do dono. O retorno atribuído chega à origem, inclusive se houver impedimento de verba/escopo. Consulta inválida ou revogada fica sem acesso/envio e não bloqueia reconcile, criação ou vínculo da execução oficial. Expediente individual e dias úteis são respeitados; agendamento não é descrito como pergunta já enviada.

A release é **`/root/planeje-releases/atlas-send-owner-20261028-02/candidate`**, herdando fontes e perfil de `google-events-ui-20261028-01/candidate`. Inventário passou de **1.753 para 1.754 fontes**. Perfil `.env.production.local` foi herdado exclusivamente dentro da VPS; ambiente de runtime, modelo/provedor, autenticação, flags e limites preservados. Frontend: **`index.da5e64ea.js` / `index.0828c836.css`**. Eventos Google, funções Edge e Atlas Office foram preservados. Nenhum bundle de teste ou `dist` local foi promovido.

Somente **`20261027193803_atlas_owner_contact_reply.sql`** foi aplicada uma vez, SHA-256 **`f3adf0b2c48a948873cec1fabb5c9a1f8227368b4f04f1ac1f8e65ee5a9c1327`**. Nove definições finais de função foram conferidas contra a migração; sete substituídas conservaram dono/ACL anteriores, e os helpers novos têm grants restritos. Índice único foi conferido com suas chaves e exclusão estrita da consulta independente. Migrações anteriores não foram editadas/reaplicadas.

Somente **`planeje-atlas-team` e `planeje-atlas-events`** foram parados, repontados e iniciados; ambos consomem o fluxo SQL alterado. Os outros três serviços mantiveram unidades e diretórios de trabalho. Cinco serviços ativos na conferência final. Não repetir a migração ou o publicador concluído.

## Verificação

- Na candidata da VPS: **200 testes Python selecionados**, helper Node e build com o perfil produtivo passaram. As **19 fixtures do publicador** passaram no Mac e na VPS; revisão independente aprovou o hash exato após reparar um caso de recuperação antes de qualquer ativação.
- A QA local anterior inclui **244 SQL por etapas**, **28 grupos de navegador** e `npm run check`; independente repetiu 244 SQL e 102 Python. São testes fictícios/descartáveis, sem custo de modelo. Não confundir esse runner com testes contra o banco produtivo.
- Guardas de fontes/candidata/perfil, schema, funções/ACL, índice, unidades e ausência de trabalho em processamento passaram antes da troca. **Seis HTTP 200 com hashes** cobrem HTML, main/CSS novos e anteriores e escritório; **dois HTTP adicionais** conferem JS/CSS do Atlas Office.
- Logs dos dois workers não mostraram erro de inicialização/scan/fila no recorte observado após a publicação. Endpoints sem identidade recusaram a requisição de verificação; nenhuma mensagem ou chamada de modelo de teste foi criada.
- Snapshots de tarefas, pessoas, mensagens internas, saídas e configurações ficaram iguais entre o início/fim da janela da publicação. Isso não declara congelamento da operação posterior.
- Na sessão real de Josias, a caixa, a fila pessoal e uma conversa existente abriram. O atalho novo apareceu; Shift+Enter quebrou linha. Rascunho de conferência foi apagado sem envio; botão voltou a desabilitado. Zero erros capturados no navegador. O acompanhamento original ficou aberto no filtro **Atlas acompanhando** para a validação humana.

Captura privada e recortada contém somente campo vazio/atalhos/botões; nenhuma conversa bruta ou dado de cliente foi copiado para a documentação. Mapa incorporado, celular físico e resposta da IA real não foram testados nesta publicação. Os arquivos/HTTP do mapa continuam íntegros; a limitação visual da conferência anterior não foi declarada resolvida.

## Operação, recuperação e próximo aceite

A tentativa01 foi somente preparada. A revisão encontrou um caso herdado em que conflito de uma unidade impedia parar outro worker ainda próprio após falha. A correção foi exercitada com RED/GREEN; somente a tentativa02 foi ativada. Recuperação tenta parar individualmente unidades ainda próprias, preserva as concorrentes e bloqueia restauração/restart se houver conflito ou falha de parada. SQL já confirmado não é revertido, nem consumidores antigos são iniciados sobre a fila nova; exige correção à frente. Não foi necessário usar recuperação nesta publicação.

Para validar: na conversa original de acompanhamento, enviar com Enter uma nova orientação; observar a mensagem imediatamente e a resposta posterior. Para consulta, enviar uma nova diretiva explícita e acompanhar a pergunta/retorno no expediente pertinente. Mensagens antigas e avisos de decisão não foram apagados ou reprocessados em massa. Não iniciar outro acompanhamento para repetir o mesmo assunto.

Leitura de bytes de anexos, confirmação externa de postagem/qualidade e campanhas ao vivo permanecem fora deste reparo. A gramática explícita não cobre toda formulação livre; não se promete perfeição da IA sem ciclo humano real.

Evidência operacional privada: `.local/atlas-send-owner-release-20261028-02/` e `/root/planeje-releases/atlas-send-owner-20261028-02/`; revisões sensíveis fora do repositório. [Registro sanitizado](../evidencias/releases/atlas-envio-identidade-producao-2026-10-28.json). Próxima publicação deve herdar esta candidata/perfil ou uma base posterior, conferir concorrência e obter autorização específica do novo trabalho.
