# Atlas: colunas recolhíveis e logos — 16/10/2026

Publicado às 01h20, São Paulo. Pedidos de Josias: recolher as duas colunas internas do Atlas; substituir as abreviações acima dos personagens dos clientes pela foto/logo cadastrada.

## Comportamento

Duas setas discretas nas bordas do mapa recolhem e reabrem, de forma independente, o menu de áreas/pessoas à esquerda e o acompanhamento à direita. Não alteram a barra externa do Planeje. O mapa reenquadra a seleção e desconta somente os painéis abertos; zoom, dica e rodapé acompanham o espaço disponível. Os botões permanecem visíveis para restaurar. Há rótulos acessíveis, aria-controls, aria-expanded e foco no botão após o acionamento.

Os estados duram enquanto o escritório está aberto, inclusive durante atualizações das fontes e Ampliar/Reduzir/Esc. Recarregar abre ambos novamente. Cliente/agente/filtros, rascunhos e rolagem do acompanhamento não são descartados por recolher. Navegar explicitamente para um cliente/agente/aba reabre o acompanhamento; atualização de dados não o reabre. Recolher não cancela gravação nem aciona transcrição/análise. No celular, o menu horizontal pode ser recolhido; Ver acompanhamento e Fechar acompanhamento continuam controlando o painel, inclusive depois de trocar do computador para celular com uma coluna recolhida.

A primeira imagem não vazia de `clientes.logo_urls`, a mesma fonte do perfil do cliente, aparece em um pequeno círculo branco acima do personagem. Ajuste proporcional contém toda a logo, sem cortar marca retangular. Borda identifica a carteira e destaca seleção. Sem imagem, carregando ou indisponível: iniciais no mesmo círculo. Ao selecionar, permanece o nome completo. A área clicável inclui a logo. A imagem é carregada uma vez por URL em cache, com CORS anônimo e sem referrer; falha não provoca requisição por frame. URLs fora de HTTP/HTTPS e com credenciais são rejeitadas.

Não se cadastraram logos novas. Algumas empresas ainda usam iniciais porque o cadastro não oferece imagem ou a URL não está disponível. Movimento, pausa, preferências de movimento reduzido, iluminação e sete agentes continuam como publicados.

## Fonte, segurança e escopo

A consulta existente `loadOfficeClientHouse` passa de `id,etiquetas` para `id,etiquetas,logo_urls`; mantém o caller autenticado, clientes fechados já autorizados, paginação, controle de completude e políticas existentes. `officeClientCards` entrega somente a URL de apresentação; `clientWalkers` conserva a correspondência por id. O servidor e as políticas não foram alterados. A consulta real foi validada pela tela autenticada e renderização das logos atuais. Sem chave administrativa no navegador ou chamada de provedor.

Arquivos seletivos: `scripts/atlas-office-live/main.ts`, `office.css`, `client-house.ts`, `src/lib/atlasOfficeClients.js`, `atlasClientWalk.js`, `src/components/atlas/AtlasOffice.jsx` e dois scripts de teste. URL nova do iframe `/atlas-office/index.html?v=panels-logos-20261016-01`. Fixtures de logo existente, imagem 404 e cliente sem imagem ficaram apenas locais, sem produção.

## Validação e publicação

27 cenários Node passaram localmente e na candidata: 12 de carteiras/leitura/logo, sete de movimento/seleção e oito de horário/descanso. Verificam preservação do escopo autenticado, campos mínimos, logo do cadastro, fontes inseguras, ausência de imagem e clique na região acima da cabeça.

Build do mapa e app completo a partir da fonte produtiva reconciliada, com `VITE_ATLAS_DEMANDS_ENABLED=true` e `VITE_ATLAS_DEMAND_PILOT=false`; build completo em 39,81 s. Após um ajuste exclusivamente no iframe para abrir corretamente o painel móvel no primeiro toque, novo build do mapa e repetição dos 27 cenários. O app completo já aponta para a mesma URL versionada; sua fonte não mudou nesse ajuste. Não inclui Assessoria/funil de teste.

Prévia fictícia: fechamentos independentes, ambos fechados com largura zero, reabertura, cliente e rascunho preservados após atualizações e Ampliar/Esc; logo carregada e alternativas para URL 404/ausente. Celular solicitado 390×844, conteúdo CSS 366 e scroll 366; fechar, abrir no primeiro toque, recolher navegação e restaurar viewport conferidos.

Produção autenticada: 24 clientes (14 JB Apex, nove Ápice, um a confirmar), logos reais visíveis, ambos painéis recolhidos com largura zero e conteúdo 1422 = scroll 1422; cliente selecionado preservado após recolher/restaurar, larguras de volta a 220/~384; zero erros de console. Screenshot real guardada somente em `.local/atlas-office-panels/producao-colunas-recolhidas.png`.

Candidata `/root/planeje-releases/atlas-office-panels-20261016-01/candidate`, backup `before`. Publicação verificou hashes do baseline/fontes/HTML, recusando mudança concorrente, e copiou apenas fontes selecionadas, assets novos e dois índices atômicos; assets antigos preservados. HTML/assets novos e anteriores HTTP 200. Sem SQL, restart, mudança de worker/limites, tarefas/comentários/memórias alterados, mensagem ou envio externo. Aceite visual de Josias pendente.
