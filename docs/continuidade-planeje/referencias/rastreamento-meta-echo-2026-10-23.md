# Respostas da empresa no histórico Meta — 23/10/2026

Josias autorizou aplicar a correção das respostas da empresa, preservando os formatos já tratados, especialmente o Chatvolt da Dinamac. A investigação confirmou que `smb_message_echoes` chega ao log, mas não participa da ficha. Publicado para validação às 13h52 de São Paulo; aceite humano ainda pendente.

## Desenho e limite

Reutilizar a leitura de respostas do log já usada pelo Chatvolt: consultar os ecos Meta pelo cliente autenticado e telefone destinatário, interpretar somente mensagens enviadas e juntar ao histórico. Isso contempla registros anteriores e novos sem reprocessar webhooks. O leitor Chatvolt, inbox e enviados existentes continuam com seus contratos.

Alternativa descartada neste reparo: persistir novamente os eventos na tabela de enviados, com backfill e mudança no webhook. Acrescentaria escritas, efeitos de automação e recuperação sem necessidade para corrigir a exibição solicitada. Não ampliar permissões/RLS nem tratar avisos de entrega como mensagens.

Texto, texto renderizado do template e corpo interativo aparecem como fala da equipe, na data da mensagem original. Mídia só abre com URL HTTPS fornecida e ainda válida; sem arquivo fica identificada. ID da mensagem evita duplicação com enviados ou repetições do log. A consulta acompanha o envelope unitário efetivamente recebido; lotes de vários envelopes permanecem fora deste reparo.

## Plano e aceitação

1. Reproduzir com fixture Meta no construtor real do histórico: resposta ausente antes da alteração.
2. Acrescentar interpretação de ecos e consulta com filtros de cliente e destinatário, preservando a consulta Chatvolt.
3. Verificar histórico antigo, ordem temporal, duplicatas, template/interativo/mídia, status excluído, URLs inseguras e falha de consulta. Rodar regressões Chatvolt/Dinamac, histórico Uazapi e checks locais.
4. Revisar o delta e publicar somente fontes selecionadas sobre a candidata produtiva vigente, com perfil herdado, guarda de concorrência e recuperação do HTML/fontes. Sem SQL, Edge, reinício, IA, envio de mensagem ou conversão.
5. Conferir a ficha da Maison e uma da Dinamac em leitura, registrar assets/evidência e atualizar continuidade. Aceite humano permanece distinto da verificação técnica.

Nenhum payload, telefone, conteúdo de cliente ou segredo deve ser copiado para esta referência ou fixtures.

## Publicação e verificação

Publicado na VPS72.60.14.109 em `/root/planeje-releases/meta-echo-20261023-01/candidate`, sobre `atlas-task-record-20261020-01/candidate`; perfil produtivo herdado dentro da VPS. Somente `src/lib/rastreamentoLeadConversa.js` e dois scripts de teste foram promovidos. Guarda de1.728 fontes anteriores; composição seguinte1.729. Main `index.cdee87a3.js`; CSS existente `index.bc73e6cf.css`. Assets anteriores, HTML do escritório e unidades dos quatro serviços preservados. O publicador foi executado uma única vez; não repetir.

Os testes novos falharam antes do reparo e passaram depois. A revisão identificou dois casos de filtro multicanal, ambos corrigidos: entradas/saídas Meta identificam WhatsApp oficial; uma resposta já persistida, deduplicada com o eco, conserva esse canal quando não tem canal explícito. Canal explícito e o leitor Chatvolt mantêm prioridade.

Quatro scripts dirigidos passaram localmente e na candidata remota, incluindo12cenários webhook→regras sem rede externa. `npm run check` passou no conjunto local; advertências preexistentes de tamanho/hooks/lint permanecem (359 rápidas e12tipadas). Nove simulações de promoção/concorrência/recuperação passaram localmente e na VPS. Revisão independente encerrada sem bloqueadores, relatório privado fora do repositório. Prévia fictícia na ficha real mostrou os dois lados no oficial e a resposta Chatvolt separada no Zapper.

Cinco HTTP com hashes correspondentes (HTML, JS/CSS atual, JS anterior e escritório), fontes e quatro serviços ativos conferidos após publicação. Sessão real da Maison confirmou8mensagens do lead e5respostas da equipe na conversa antes incompleta, com datas originais. Nenhum conteúdo, telefone ou identificador desse contato foi salvo na evidência. Dinamac conferida na mesma sessão, com5mensagens do lead e2respostas Chatvolt. Console sem erros durante as duas conferências.

Sem SQL, migração, Edge Function, reinício, reprocessamento, envio WhatsApp/CAPI/IA, alteração de status ou permissões. O reparo é de exibição do histórico; avisos de entrega, vinculação automática de números e mídias de entrada ainda não são ampliados aqui. Leitura limitada aos120itens combinados e envelope unitário; mídia sem URL segura/válida fica identificada sem abrir arquivo.

[Evidência da release](../evidencias/releases/rastreamento-meta-echo-2026-10-23.json). Artefatos operacionais em `.local/meta-echo-20261023/` e na pasta remota da release.
