# Nova ficha de contato do Rastreamento — 14/10/2026

Josias pediu um upgrade visual inspirado na ficha de outro sistema: duas colunas, os controles de Marcar, origem e UTMs à esquerda, conversa à direita e uma aba superior para ver a imagem do anúncio. A referência foi usada para a distribuição visual; não foram criados os status, agendamentos ou observações específicos do outro produto.

## Implementação publicada

- Cabeçalho com foto, nome, origem, telefone, canal e data inicial preservados. Abas Contato / Anúncio acessíveis pelo teclado; a ficha volta a Contato quando abre outro registro.
- Contato no computador: Marcar, Origem, as cinco UTMs e Jornada na coluna esquerda com rolagem própria. Conversa na direita, ocupando a altura disponível, com os mesmos canais, contadores, mídias, áudios e textos. Alternar a aba não desmonta os controles nem perde o canal selecionado.
- Anúncio: imagem ampliada sem corte, nomes de campanha/conjunto/anúncio e o link de abertura já existente. Sem imagem há estado informativo; origens como Linktree não recebem criativo inventado. A miniatura é limpa antes de carregar outra atribuição, para evitar mostrar o anúncio do contato anterior.
- Celular: os blocos ficam em sequência, com rolagem para alcançar a conversa. A imagem se adapta à largura. Na versão final conferida não há sobreposição nem rolagem horizontal.
- Qualificação, compra, valor, etiquetas e envio existente de Jornada seguem os mesmos componentes, callbacks e regras. Cópia das UTMs e procedência da atribuição pela mensagem preservadas. Nenhuma mudança de payload, webhook ou regra de atribuição.

Arquivos do produto: `src/components/crm/RastreamentoLeadFicha.jsx` e `src/components/pages/RastreamentoHub.css`. Prévia com dados fictícios em `.local/rastreamento-layout-20261014/preview`; servidor em `http://127.0.0.1:4322/`. Essa prévia substitui a API e bloqueia gravações, sem sessão real. Imagem demonstrativa em SVG; não é um anúncio de cliente.

## Validação

- Três scripts existentes passaram localmente e na candidata: ficha, conversa e etiquetas. Não foram adicionados testes que apenas repetem o CSS.
- Build da prévia passou. Build completo da candidata passou: `index.47519cec.js / index.2731d631.css`.
- Candidata isolada criada da fonte atual de produção `/root/planeje`, após comparação sem diferenças dos 14 diretórios/arquivos usados no build contra a última release publicada. Assets anteriores também comparados por bytes. O working tree remoto e suas entregas foram preservados; CS/Assessoria não foi incluída.
- Navegador em 1280 × 720 e 390 × 844: Linktree, Meta com imagem, estado vazio, dois canais, preservação do canal entre abas, teclado e rolagem. A sobreposição encontrada durante a preparação no celular foi corrigida e reconferida. Override de viewport restaurado.
- Ações comerciais e o botão de envio CAPI não foram acionados. Nenhum banco, tarefa, WhatsApp, CAPI, e-mail, transporte ou configuração do Atlas alterado.

## Estado e continuidade

**Publicada em 14/10/2026, 15h53.** Josias respondeu “Gostei” à prévia do upgrade solicitado. Aceite visual da prévia registrado; aceite de uso no sistema publicado continua pendente. Produção agora usa `index.47519cec.js` / `index.2731d631.css`; os assets anteriores `0298c2a9` / `94bf622f` foram conservados.

Antes da promoção, o índice, os assets anteriores e toda a fonte dos 14 diretórios/arquivos do build foram conferidos: a base não havia mudado. Somente os dois arquivos de produto foram sincronizados à fonte atual, sem substituir o restante do working tree. Assets novos copiados e `index.html` trocado de forma atômica; nenhum serviço reiniciado. HTTP confirmou por bytes o índice, os dois assets novos e os dois anteriores. Navegador autenticado confirmou o contato indicado, cinco campos de UTM, as duas colunas, cinco mensagens preservadas e a aba Anúncio sem criativo para Linktree. Tela estreita sem sobreposição/overflow do painel; override restaurado. Nenhuma ação comercial ou envio acionado.

Release privada: `/root/planeje-releases/rastreamento-ficha-layout-20261014-01`, com `candidate/`, `before/`, `build.log` e `verification.json`. Arquivos de produto anteriores e índice preservados no backup. A fonte atual em `/root/planeje` recebeu somente os dois arquivos desta mudança. Backup adicional do índice em `/var/www/planeje/index.html.bak-rastreamento-ficha-layout-20261014-01`.

[Manifesto](../evidencias/releases/rastreamento-ficha-layout-2026-10-14.json) · [Evidências](../evidencias/rastreamento-ficha-layout-testes-2026-10-14.json). Capturas fictícias em `.local/rastreamento-layout-20261014`, fora da documentação portátil.

[Recarregar Leads](https://planeje.jbapex.com.br/?v=47519cec#/rastreamento?aba=leads). Captura da ficha real publicada fica na pasta local ignorada `.local/rastreamento-layout-20261014`, sem dados de atendimento na documentação portátil.

Próximo passo: Josias usar a ficha publicada e confirmar o comportamento. A aprovação “Gostei” refere-se à prévia visual, não foi registrada como aceite de uso. CS/Assessoria continua separada e não publicada; sua próxima candidata deverá incorporar esta revisão.
