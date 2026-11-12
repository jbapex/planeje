# Google Data Manager e histórico Chatvolt — produção em 27/10/2026

Publicado às 15h26 de São Paulo, por autorização atual de Josias: “Pluciar na vps, mas confere ... mensagem ... sequência”. Aceite humano permanece pendente. O reparo Google local foi publicado junto de uma correção de leitura Chatvolt confirmada pela auditoria solicitada.

## Diagnóstico e contrato do histórico

A amostra somente leitura da Dinamac encontrou 270 eventos com fala recebida no dia: 246 com mensagem no inbox e 24 sem telefone, portanto fora desse cadastro. Desses 24, 23 tinham uma conversa conhecida com telefone único no mesmo cliente; um permanecia sem referência segura. Não concluir ausência no Chatvolt a partir da ausência no inbox. Nenhum dado de contato/texto/identificador de cliente está copiado nesta evidência.

No caso dos prints, as três mensagens estavam gravadas. O webhook da resposta automática chegou às 14:08:05 e o evento combinado com a fala do lead chegou às 14:08:20, sem createdAt original. Por isso, ordenar pelo recebimento mostra a resposta antes da pergunta. A leitura real após publicação mostrou também a resposta posterior das 15:09. Não se reconstruiu uma cronologia inventada nem se alterou o histórico.

O leitor agora recupera falas do log pelo JID conhecido e eventos sem telefone pelo conversationId já vinculado ao contato do mesmo cliente. Consulta só Chatvolt e NULL from_jid para essa extensão, valida identidade, ignora evento de sistema/grupo/direção de equipe e deduplica pelo messageId. Aceita mídia sem legenda em evento inbound explícito. Sem telefone nem conversa conhecida não há associação por nome ou aproximação. Trata-se de leitura; contato/inbox/automação/conversão não são retroativamente escritos.

A ficha informa horário de recebimento quando falta timestamp válido, exibe falha parcial e limite das últimas120mensagens carregadas e tem Atualizar manual. A ordem histórica exata continua dependendo do horário original de cada fala — createdAt de um evento combinado não demonstra sozinho o horário separado da pergunta/resposta. O webhook documentado pelo fornecedor admite createdAt, mas ele não estava presente na amostra produtiva. Recuperar todos os eventos nunca recebidos exigiria outra fonte/API do provedor, não implementada nesta entrega.

## Google

Publicadas as sete fontes do reparo Data Manager v1, com configuração explícita de projeto de quota, novo consentimento adwords+datamanager, diagnóstico manual/backoff, reserva atômica do snapshot original e reenvio individual por ID local. O recebimento é pendente até diagnóstico do registro correto; não significa atribuição contabilizada no Ads. Consultas/campanhas existentes foram preservadas. [Contrato e preparação Cloud/OAuth](rastreamento-google-data-manager-local-2026-10-27.md).

A release não configurou projeto/API/IAM, não substituiu credenciais e não fez novo consentimento Google. Não enviou nem reenviou conversão real. Os erros legados continuam visíveis; primeiro evento real e sua contabilização continuam pendentes desses passos.

## Operação e verificação

- Base nova `/root/planeje-releases/google-data-manager-20261027-02/candidate`, herdando `rastreamento-invisible-20261027-01/candidate` e seu perfil `.env.production.local` exclusivo da VPS. Guarda final1741fontes;15overlays, sendo9fontes de produto e6scripts operacionais/testes.
- JS `index.d69b7d6b.js`, CSS `index.bc73e6cf.css`; assets anteriores e escritório mantidos. Não promover dist da raiz. A candidata01 desta migração só foi preparada; nunca publicada e foi substituída pela02.
- Só `supabase-edge-functions` reiniciado; imagem v1.74.0 e saúde healthy. Quatro serviços/unidades Atlas preservados e ativos. Sem migração SQL; não repetir publicador/migrações/ativação do código invisível.
- Check completo final,45casos do handler Google,5do consumidor comercial,13scripts dirigidos na candidata,31testes de publicação/recuperação locais e na VPS passaram. Fonte/membro do pacote/manifesto/revisão conferidos. Duas rodadas da revisão resolveram modo executável do helper OAuth e classificação de anexo de evento de sistema; sem achados pertinentes restantes.
- Navegador fictício isolado validou erro parcial, atualização e horários no desktop/390/320. Primeiro screenshot móvel durante resize não serviu como evidência; foram refeitos em viewports novas com caixa do diálogo/botão dentro da tela e inspeção visual. Sessão autenticada real abriu a ficha do caso enviado e uma segunda ficha confirmou a fala ausente no inbox recuperada pelo vínculo da conversa. Sem edição de cliente.
- Cinco HTTP/hashes: HTML, main/CSS novos, main anterior e escritório. Cinco sondagens sem payload de cliente: OPTIONS Google200 confirma carregamento do handler; GET CRM/Uazapi/Ápice200 e redirecionador sem link404. Não criam clique/mensagem/conversão. Regras de automação permaneceram iguais durante a publicação.

[Manifesto e resultados](../evidencias/releases/google-data-manager-chatvolt-producao-2026-10-27.json). Relatórios privados fora do repositório, sem dados de cliente ou upload. Fontes oficiais: [webhooks Chatvolt](https://docs.chatvolt.ai/agent/webhooks), [Data Manager ingest](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest). Context7 consultado para os contratos; código/consentimento/permissões reais são estados distintos.

Recuperação: arquivos anteriores, modos e HTML estão na release, sob guarda de hashes; conservar assets e concorrência. Não restaurar banco, apagar logs, reaplicar SQL ou chamar backfill como atalho. Qualquer nova publicação deve partir desta candidata e perfil, preservando trabalho local de outros chats.
