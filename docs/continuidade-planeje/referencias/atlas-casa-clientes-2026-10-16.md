# Atlas: casa dos clientes, carteiras e movimento — 16/10/2026

Publicado em duas etapas: casa funcional às 00h54 (`fab2cc84`) e personagens andando às 01h08 (`3a5bc020`), São Paulo. Josias confirmou a casa com JB Apex e Ápice Noivas e, durante a conferência, reforçou “quero já jogar para a vps e preciso aparecer os clientes andando dentro da casa”.

## Resultado e fontes

Uma casa separada, do outro lado da rua, aparece na visão geral. Clique no cenário abre as carteiras; o botão Casa dos clientes aproxima a câmera. Clientes no cabeçalho também abre o diretório. São os mesmos cadastros e tarefas do Planeje, sem espelhamento de execução.

O diretório tem filtros Todos, JB Apex, Ápice Noivas e A confirmar, busca por nome sem depender de acentos, contadores e cartões com tarefas abertas, prazos vencidos, equipe efetivamente atribuída, demandas e situação do acompanhamento. O cliente abre seu painel no escritório; atalhos chegam às abas existentes Ficha, Demandas e histórico, Arquivos e memória, Reuniões e Projetos. Pendências, memórias e links das tarefas continuam no painel. O formulário de resposta/ditado e a aprovação humana anterior permanecem.

A classificação usa apenas etiquetas explícitas, com normalização de grafia/chaves e catálogo existente. A consulta inicial confirmou nove Ápice Noivas, zero JB Apex com etiqueta explícita e quinze sem operação definida. Na conferência final ao vivo, as etiquetas já refletiam 14 JB Apex, nove Ápice Noivas e um a confirmar. Esse cliente restante fica A confirmar; uma etiqueta não relacionada, o nome/nicho ou a ausência de Ápice não atribui JB. Etiquetas conflitantes também exigem conferência. Nenhuma etiqueta foi criada/alterada. O cadastro existente, acessível na ficha, permite conferir a operação.

`loadOfficeClientHouse` usa o cliente Supabase autenticado do navegador após o gate do escritório, com as RLS existentes. Lê somente metadados de `clientes` (id/etiquetas), `cliente_etiquetas` (chave/nome) e `atlas_demands` (id/cliente/estado/tarefa), com escopo dos clientes fechados já visíveis, paginação de 500 e limite completo. Na abertura e no snapshot completo, aproximadamente uma vez por minuto enquanto a tela está visível; status intermediário conserva essa leitura datada. Falha não vira zero demandas: o painel informa a fonte não conferida. Não há chave privilegiada no navegador nem mudança de política/grant.

## Personagens dos clientes

Um avatar determinístico por cliente atual, sem duplicar cadastro e sem criar agentes de trabalho. Os clientes classificados caminham na respectiva sala: na conferência final eram 14 na JB Apex, nove na Ápice Noivas e um na recepção compartilhada aguardando classificação. Aparência/frames usam a arte original do Habblaud. Iniciais identificam cada avatar; ao selecionar, seu nome completo e o acompanhamento aparecem. O hit-test inclui o identificador do cliente e o adaptador o valida contra a carteira visível antes de abrir. Os sete agentes da equipe continuam separados dos 24 representantes de clientes e preservam o descanso do expediente.

A animação tem percursos delimitados, velocidades moderadas e pequenas pausas, sem atravessar a mesa central. Ordenação estável e relógio absoluto conservam posições durante atualizações da fonte. Pausar movimento / Retomar movimento atua somente nos avatares dos clientes; não pausa o worker, prazos ou acompanhamentos. `prefers-reduced-motion` mantém todos visíveis e parados. É representação da carteira, sem sinal de presença online, localização ou atendimento real. Mover/clicar não usa IA, não dispara análise e não altera tarefas.

## Arquivos e limites da entrega

Base: `src/lib/atlasOfficeClients.js`; bridge `src/components/atlas/AtlasOffice.jsx`; `scripts/atlas-office-live/main.ts`, `office.css`, `client-house.ts`; contrato/opções, entrada, câmera/seleção e renderer do Habblaud com landmarks aditivos. Movimento puro em `src/lib/atlasClientWalk.js`; testes `scripts/atlasOfficeClients.test.mjs`, `scripts/atlasClientWalk.test.mjs`. O renderer integra a casa aos limites/enquadramento e à iluminação; não cria salas/agentes operacionais paralelos. URL do iframe final `/atlas-office/index.html?v=client-walk-20261016-01`.

Fixtures de três clientes (uma operação de cada tipo e um a confirmar), stub autenticado de metadados e modo analisando ficaram somente na prévia local, sem banco/IA. Não foram promovidas. Sem SQL, restart, alterações de serviços, modelo, limites, worker ou funções de backend. Sem criação/edição de cliente, etiqueta, tarefa, comentário, memória, campanha ou envio externo pelo agente.

## Verificações

- Dez cenários de carteiras/fontes: etiquetas normalizadas e do catálogo, ausência/conflito, busca/filtro, dados imutáveis, tarefas/responsáveis reais, demandas, estados de atenção, navegação limitada às abas existentes, paginação e falhas inclusive em página seguinte.
- Seis de movimento: um avatar por id, identidade/área, imutabilidade, posições diferentes no tempo e estáveis na reordenação, limites/direção em relógios longos/NaN, seleção do id pelo personagem, acessibilidade com movimento reduzido e recepção para classificação desconhecida.
- Oito regressões de relógio/sono e 62 verificações de ditado/estados mais 30 do escritório passaram. Total 24 cenários e 92 verificações existentes; testes sem provedor/banco operacional. Mesmos testes na candidata remota.
- Builds do escritório e do app completo a partir da fonte produtiva reconciliada passaram; build completo final em 35,99 s. Ajuste final de pausa somente em dois arquivos do iframe: novo build do mapa (2,66 s) e 24 cenários repetidos, mantendo o app completo que já referenciava a mesma URL. Flags `VITE_ATLAS_DEMANDS_ENABLED=true` / `VITE_ATLAS_DEMAND_PILOT=false`; nada de Assessoria/funil de teste no bundle.
- Navegador fictício: entrada pelo clique no mapa, aproximação pelo botão, filtros, busca, cliente correto, atalhos, ditado visível, rascunho preservado em ampliar/Esc/celular; movimento observado, pausa/retomada e clique no personagem com pausa conferidos. Telefone solicitado 390×844: largura CSS efetiva variou com a janela/zoom; 409 px de conteúdo = 409 px de scroll, sem transbordamento. Viewport restaurado.
- Produção autenticada: classificação inicial 24/0/9/15 e demanda existente conferidas; ao encerrar, leitura viva 24/14/9/1, acompanhando as etiquetas que já estavam no cadastro, sem escrita do agente. Casa → carteira Ápice → cliente do pedido anterior → Demandas e histórico abriu o único acompanhamento já existente, com responsável e prazo preservados; Arquivos e memória também abriu. Nenhuma ação de criar/analisar/aprovar/guardar acionada. Tela estreita: 416/416 px; computador 1318/1318. Zero erros de console observados. A versão com movimento também foi conferida em produção antes do encerramento: 24 personagens visíveis nas áreas correspondentes, em posições diferentes entre capturas; controle Pausar disponível, movimento ligado e zero erros de console. O clique em personagem foi validado na prévia pausada.
- Consulta em transação READ ONLY com papel anon: zero clientes visíveis e acesso à tabela de demandas recusado, sem alterar grants. As leituras positivas vieram da sessão humana autorizada no navegador. Não se simularam sessões de funcionários reais.
- Hashes dos índices e HTTP 200 dos assets atuais/anteriores conferidos. Serviços próprios continuam ativos; sem reinício.

Capturas de clientes reais permanecem somente em `.local/atlas-client-house` e `.local/atlas-client-walk`; não versionar dados de clientes. Aceite visual de Josias e classificação do cliente restante continuam pendentes. A entrega não encerra os itens operacionais anteriores, limites atingidos/erros do gerente ou aceite da Assessoria.

## Publicação e recuperação

Base em `/root/planeje-releases/atlas-client-house-20261016-01`, dez fontes selecionadas. Complemento em `/root/planeje-releases/atlas-client-walk-20261016-01`, oito fontes selecionadas. Ambas partem da fonte real e conferem hashes prévios, igualdade das demais fontes `src`, flags e ausência de `cs_snapshots`; preservam o working tree e os assets anteriores. Índices trocados atomicamente após copiar novos arquivos. Não importar o bundle do CS.

Final: `index.3a5bc020.js` / `index.8a46408f.css`; mapa `index-a6e80258.js` / `index-8fa600e9.css`. Conservados base `fab2cc84` / `e685eeed` e noite `883defd9` / `d6177d45`. URL `https://planeje.jbapex.com.br/?v=3a5bc020#/assistant/atlas`.

Cada release tem fontes/índices/diretório servido do mapa em `before/`. Restaurar o before do complemento volta à casa sem personagens; restaurar o before da base volta ao escritório anterior. Preservar dados, serviços e migrações; nenhum SQL a reverter/reaplicar. Dois arquivos novos sem referência podem permanecer. As credenciais privadas não foram copiadas para evidências.
