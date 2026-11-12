# Caixa do Atlas: hierarquia visual — 17/10/2026

Josias considerou a caixa confusa e sem hierarquia. O ajuste publicado prioriza pedidos e próximo passo, mantendo os mesmos registros e classificação operacional da entrega anterior.

## Experiência publicada

- Fundo branco e roxo pontual, título Pedidos dos clientes e quatro filtros com contagens. Busca por pedido, cliente, carteira e responsável; perguntas do dono precedem os outros registros.
- Uma seção por cliente, com linhas compactas: pedido, com quem está e próximo passo. Resumo longo, instrução completa, fonte, tarefa candidata, revisão e opção manual aparecem ao expandir. Abertura pelo teclado disponível.
- Contexto e fontes em diálogo com foco/Escape; abrir as fontes não dispara IA.
- Controles de funcionamento/consumo/fila ficam recolhidos no rodapé. Regras continuam editáveis na rota de configurações; analisar cliente permanece ação explícita. Pedido manual global dentro do funcionamento.
- Repasses e tarefas é uma seção recolhível, com contagem e indicação dos que dependem do dono. Detalhe aberto, formulário novo, acompanhamento e links antigos expandem a área. Fechar durante operação/ditado é bloqueado; projeções automáticas continuam sem duplicação na tabela.
- Cabeçalho chama o contador legado de avisos. Nenhum aviso foi arquivado ou marcado como lido pelo publicador.

## Validação

61 testes Node existentes passaram (apresentação dos pedidos, atividade, calendário, prazos e robô). Build da candidata com as mesmas opções produtivas passou. Prévia fictícia com busca, filtros, linhas por teclado, fontes/Escape, pergunta ao dono, mensagem à equipe, análise por cliente sem provedor, tabela manual e detalhe/recolhimento. Tela 390×844 da prévia sem transbordamento horizontal.

Produção autenticada final: cinco pedidos antigos da Impacto, zero desses pedidos exigindo o dono, Atlas e equipe cinco, conta Poliana Geffer. Fontes reais abriram no diálogo. Os dois registros manuais foram conservados (Jaralcon e campanha da Impacto com tarefa indisponível); esse vínculo não foi investigado ou recriado. Configurações abriram com teto de um milhão; quatro tentativas /163.119 tokens continuaram registrados. Produção estreita também conferida; o viewport efetivo informado pelo navegador foi 433px. Seis HTTP/bytes e quatro serviços ativos.

## Incidente do primeiro pacote e correção

A primeira promoção às 19h14 (`94cdcff4`/`a8313023`) não levou as opções de compilação: a sessão autenticada mostrou o fluxo antigo. O HTML anterior foi restaurado com guarda de concorrência às 19h16, preservando fontes/dados/backend. O pacote seguinte herdou `.env.production.local` da candidata produtiva anterior; as opções `VITE_ATLAS_DEMANDS_ENABLED`, `VITE_ATLAS_EVENTS_ENABLED` e `VITE_ATLAS_TEAM_ENABLED` foram conferidas como true. Nenhum publicador já executado foi repetido. A candidata correta foi promovida às 19h17 e verificada na conta real. O primeiro pacote não é a base de uso e seu registro de publicação deve ser lido junto de `frontend-restored.json`.

## Base final e continuidade

`/root/planeje-releases/atlas-inbox-hierarchy-20261017-02/candidate`, guarda de 1.699 fontes. Main `index.fe9cfb4b.js` / `index.a8313023.css`. Escritório herdado `index-c15dc511.js` / `index-e5ae8acc.css`, iframe `caixa-andamento-20261017-01`. Backend continua `atlas-manager-flow-20261017-01/candidate`. Bases anteriores e assets mantidos.

**Próximo build deve herdar também o perfil de compilação produtivo**, excluído intencionalmente dos manifestos de fontes. Local: `.local/atlas-inbox-hierarchy-final/candidate/.env.production.local`; `build-profile.json` registra somente as opções Atlas. Nunca publicar `dist` da raiz do checkout: há trabalho não produtivo nessa árvore. O build incidental da raiz nesta sessão não foi promovido.

Sem migração/SQL, restart, mudança de configuração/autonomia, IA real, tarefa ou mensagem operacional pelo agente. O visual não reanalisa os cinco registros nem comprova trabalho executado. Reanálise, primeiro ciclo real da equipe, vínculos anteriormente pendentes e aceite seguem pendentes.

[Produção](../evidencias/atlas-caixa-hierarquia-producao-2026-10-17.png) · [Prévia no celular](../evidencias/atlas-caixa-hierarquia-mobile-2026-10-17.png) · [Produção estreita](../evidencias/atlas-caixa-hierarquia-producao-mobile-2026-10-17.png) · [Release](../evidencias/releases/atlas-caixa-hierarquia-2026-10-17.json).
