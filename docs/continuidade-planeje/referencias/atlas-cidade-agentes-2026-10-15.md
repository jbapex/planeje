# Atlas como escritório de agentes para acompanhar a equipe

**Atualização posterior de 15/10:** Josias confirmou a direção (“perfeito”); a [primeira prévia local](atlas-escritorio-previa-2026-10-15.md) foi construída e conferida com dados fictícios. O texto abaixo documenta a etapa de pesquisa que a antecedeu. Integração real e publicação permanecem pendentes.

15/10/2026, São Paulo. **Pesquisa e proposta de produto; não implementada nem publicada.** Esta direção substitui a recomendação inicial de priorizar ferramentas de manutenção como resposta principal ao pedido de Josias. O levantamento anterior de 60 projetos permanece como pesquisa histórica, sem adoção aprovada.

## Pedido confirmado

Josias quer agentes cuidando da equipe e de cada colaborador, visíveis em uma cidade ou escritório com salas como Tráfego, Design e Edição. Os agentes devem consultar tarefas e usuários reais do Planeje. Na pergunta sobre autonomia, escolheu: **“Também criar e organizar tarefas dentro de regras que eu definir.”**

Essa escolha define a capacidade desejada. As regras de criação, atribuição, mudança de prazo e de status ainda não foram definidas. Não autoriza executar ações operacionais reais nesta pesquisa, publicar uma nova versão, enviar cobranças à equipe ou reativar o monitor anterior do Atlas. A preferência anterior de eventual hospedagem continua sendo a VPS de produção 72.60.14.109.

## Projetos encontrados para este escopo

| Projeto | O que oferece | Avaliação para o Atlas |
| --- | --- | --- |
| [Habblaud](https://github.com/marmottajr/habblaud) | Escritório com salas dinâmicas, personagens, atividade e interface em português; acompanha sessões Claude Code/Codex | Candidato forte para a apresentação do Atlas. Modelo e operações atuais são de sessões de programação; requer adaptador próprio para equipe e tarefas do Planeje. |
| [Claw-Empire](https://github.com/GreenSheep01201/claw-empire) | Escritório em pixel art, departamentos, agentes, tarefas e reuniões; integra diferentes executores de IA | Referência mais próxima do produto descrito. Avaliar aproveitar o escritório visual, conectando-o ao Planeje; a aplicação completa tem execução e armazenamento próprios. |
| [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) | Escritório editável, personagens, áreas e estados por eventos; versão de navegador e extensão | Alternativa para uma camada visual mais leve. A integração entregue toma Claude Code como referência; ligação ao Atlas precisa ser desenvolvida. |
| [Paperclip](https://github.com/paperclipai/paperclip) | Organização de agentes, objetivos, tarefas, limites de consumo e governança | Referência para coordenação e regras, com sistema próprio de trabalho. Não traz pronta a ligação à equipe humana do Planeje. |
| [Star Office UI](https://github.com/ringhyacinth/Star-Office-UI) | Escritório visual com estados e entrada por API | Referência de apresentação. Código MIT, mas o arquivo de licença restringe os elementos gráficos ao uso não comercial e exige substituí-los no uso comercial. |
| [Agent Office](https://github.com/Pixel-Process-UG/agent-office) | Salas, presença, conversa e fila de tarefas para agentes | O README declara desenvolvimento inicial e funções incompletas; o mapa usa um pacote gráfico pago não incluído. |
| [Pixel Office](https://github.com/fedevgonzalez/pixel-office) | Visualização de sessões, eventos, personagens e agentes externos reportados | Referência adicional de adaptação visual. O funcionamento padrão acompanha sessões de programação, e não a operação da agência. |

Fontes: README, licença e manifestos disponíveis dos sete projetos. Três tiveram inspeção seletiva de código em clones temporários. Isso não constitui auditoria de segurança, validação funcional ou certificação das licenças de cada dependência e elemento gráfico.

## Avaliação adicional do Habblaud

Josias indicou https://habblaud.com/ para análise. O código consultado é `marmottajr/habblaud`, commit `4ccce2537472fe5a8d432f06974494d2e778ff15`, versão declarada `0.11.0`. A avaliação foi estática, sem instalação ou execução.

O desenho tem uma fronteira aproveitável: o servidor constrói um estado do escritório, publica eventos SSE e o cliente desenha o mundo em Canvas. Há separação entre modelo, transporte, desenho e painéis. Uma adaptação poderia alimentar o escritório com eventos e consultas autorizadas do Atlas, mantendo ações no Planeje. Isso é uma hipótese de integração, não uma API de integração Planeje já existente.

Limites identificados no código: `RoomInfo` usa o caminho de um projeto de programação como identidade; `AgentInfo` representa uma sessão e sua conta; `TaskItem` contém título e três estados, sem o conjunto de cliente, responsável, prazo e evidência usado pelo Planeje. Salas permanentes de departamento, acompanhamento por pessoa e as tarefas oficiais precisam de representação própria. Não basta renomear os projetos.

O projeto inclui controles reais sobre sessões, mensagens, permissões e terminais, além de apresentação. Eles não equivalem às regras operacionais desejadas por Josias. A configuração remota própria dispõe de login, TLS e capacidades selecionáveis; não foi validada para a VPS produtiva ou para compartilhamento de identidade com o Planeje. O desenho recomendado continua sendo autenticação e autorização do Atlas e ações pelos caminhos do Planeje.

As interações de convivência são uma simulação no cliente; não demonstram deliberação de IA, trabalho humano ou conclusão de tarefa. Seus personagens podem continuar visíveis sem uma chamada contínua ao modelo. O histórico e as tarefas mostrados nativamente vêm de sessões dos agentes de programação.

O arquivo principal usa MIT. O README descreve os elementos desenhados por código e imagens próprias geradas para o projeto; não apresenta a restrição não comercial encontrada no Star Office UI. Isso favorece a avaliação de reaproveitamento, mantendo a conferência dos avisos e dependências efetivamente adotados. O núcleo usa Node/TypeScript; recursos opcionais de terminal têm dependências opcionais. Não houve medição de desempenho nem auditoria de segurança.

Após essa comparação, Habblaud passa a ser um candidato preferencial para uma prova da apresentação de cidade/escritório em português. Claw-Empire continua uma referência forte para departamentos e coordenação. A escolha final depende da prova de adaptação; nenhum dos dois está aprovado para instalação. O benefício operacional depende de acompanhamento por pessoa, consulta completa e regras executáveis do Atlas, já descritos abaixo.

Fontes específicas: [site](https://habblaud.com/), [documentação em português](https://github.com/marmottajr/habblaud/blob/main/README.pt-BR.md), [servidor](https://github.com/marmottajr/habblaud/blob/main/server/README.md), `shared/types.ts`, `server/model/rooms.ts`, `client/src/net/store.ts` e `client/src/app.ts`. A captura apresentada é `docs/screenshots/overview.png` do projeto original em demonstração, e não uma implementação ou dados da agência.

## Encaixe recomendado

Antes da indicação do Habblaud, a primeira hipótese era usar o escritório do Claw-Empire como candidato visual. A análise adicional acima inclui Habblaud como candidato preferencial de apresentação e mantém **Planeje e Atlas como base operacional**. Pixel Agents permanece uma alternativa visual. A escolha final depende de uma prova de adaptação com dados fictícios; não está aprovada para implantação.

A inspeção encontrou uma separação útil no Claw-Empire: `OfficeView` recebe departamentos, agentes, tarefas e callbacks de seleção. O componente depende de outros módulos e dos tipos do projeto; não é um componente independente pronto para colar no Planeje. O código visual usa React e PixiJS. Sua execução de agentes, seus próprios registros e conectores externos não devem ser ativados por instalação automática.

Pixel Agents separa eventos normalizados, transporte e renderização em Canvas 2D. Isso pode facilitar uma adaptação visual, mas o provedor concreto entregue acompanha Claude Code. Trocar um nome na configuração não cria integração com o Atlas. No estado consultado, seu cliente usa React 19 e o Planeje local usa React 18; uma integração requer compatibilidade avaliada, sem atualização implícita do aplicativo inteiro.

O Claw-Empire consultado exige Node 22 ou superior e possui dependência de Remotion, cuja licença é própria. Esses requisitos afetam a avaliação de uma instalação completa. O Atlas atual não precisa ser substituído para representar especialistas em salas. Antes de reaproveitar elementos gráficos, conferir seus termos e atribuições específicos; o rótulo da licença principal do código não resolve automaticamente todos os componentes.

## Como o escritório deve representar trabalho real

- **Atlas central:** acompanha as áreas, conflitos de prioridade e decisões que exigem Josias.
- **Salas por especialidade:** Tráfego, Design, Edição e Operação/Atendimento como desenho inicial proposto. A separação e os nomes ainda podem ser ajustados.
- **Acompanhamento por pessoa:** cada colaborador tem um perfil associado ao seu usuário real e às suas tarefas. Um agente pode ser responsável pelo acompanhamento desse perfil; as salas consolidam essas pessoas por área. Não inferir departamento apenas pelo nome, nem confundir o agente com o colaborador humano.
- **Clique numa pessoa:** mostra tarefas, prazos, dependências registradas, bloqueios comprovados, materiais e próximo passo. A consulta deve abrir a tarefa original para conferência.
- **Clique num agente:** mostra a missão em execução, consultas realizadas, propostas e ações registradas. A animação de trabalho depende desses eventos; personagem presente no escritório não comprova execução humana.
- **Reunião de agentes:** uma coordenação vinculada a uma demanda real, com resultado e próximos passos. Deslocamento no mapa é apresentação, não evidência de que uma reunião ou uma entrega ocorreu.

Exemplo fictício: uma tarefa de edição aguarda um material do cliente. O acompanhamento identifica a dependência registrada. Se existir uma regra aprovada, o agente cria a pendência correspondente no Planeje, com origem e vínculo, sem duplicar a tarefa de edição nem concluir que o editor está atrasado por culpa própria. O coordenador informa a situação a Josias. Comunicação externa e cobrança automática não foram autorizadas.

## Mudanças operacionais necessárias além do mapa

1. **Cobertura completa por pessoa.** O leitor local atual do Atlas seleciona até 40 tarefas não terminais e dez concluídas recentes. A fonte `team` seleciona até 100 perfis ativos. São consultas limitadas, não prova de inventário completo. O novo acompanhamento precisa consultar todas as páginas necessárias, filtrar por responsável e apresentar contagens e limites verificados. Não enviar o banco inteiro ao modelo.
2. **Mapeamento explícito de pessoas e áreas.** Usar responsáveis, funções e vínculos registrados. Tarefas sem responsável ou classificação ambígua ficam visíveis para resolução, sem inventar atribuição.
3. **Regras de atuação definidas por Josias.** Especificar quando pode criar, atribuir, ordenar, alterar prazo ou mover etapa, e quais situações exigem decisão. Esta pesquisa não escolhe essas permissões por inferência.
4. **Execução no mecanismo existente.** Reutilizar os caminhos de Tarefas e o histórico. Cada ação precisa ter origem, regra aplicada, vínculo e resultado; uma repetição ou reinício não pode duplicar a demanda.
5. **Estado persistente e limites.** O agente mantém seu perfil e responsabilidades entre missões. Consultas e chamadas do modelo acontecem por eventos ou cadência configurada; personagens podem continuar visíveis sem uma chamada permanente de IA.
6. **Evidência e escopo.** Separar falta de registro, espera do cliente, bloqueio da equipe e entrega comprovada. Preservar permissões por usuário/cliente e a privacidade do Atlas. Todos os usuários visíveis significa os que a identidade autorizada pode consultar, com recorte explícito.

O Atlas existente tem consulta, memória e fila de missões privadas. Sua versão registrada consulta e propõe; não executa as mudanças operacionais pedidas agora. Design e Edição como agentes dedicados e acompanhamento por colaborador são capacidades novas propostas. O acompanhamento automático anterior permanece pausado.

## Primeiro resultado concreto proposto

Provar um escritório de três salas com dados fictícios, seleção de pessoa/agente e ligação visual às tarefas. Em seguida, provar uma única regra operacional definida por Josias em ambiente isolado: mesma tarefa, mesmo responsável, origem registrada e repetição sem duplicação. A cidade visual, a consulta completa e a execução pelas regras precisam ser verificadas separadamente.

Nenhuma interface nova foi construída nesta pesquisa. A imagem apresentada é uma captura do projeto Claw-Empire original, não do Atlas. Nenhum pacote foi instalado, projeto de terceiros executado, chave configurada, VPS acessada ou dado operacional alterado.

## Código e evidências consultados

- Planeje local: `supabase/functions/_shared/atlasContext.js`, `atlasManagerContext.js`, `atlasManager.js`; `src/components/atlas/AtlasOrbit.jsx`, `AtlasMissions.jsx` e `atlasPresentation.js`. A fonte local foi usada para localizar limites e desenho de integração, não como comprovação do runtime produtivo atual.
- Claw-Empire: commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`; inspeção de `OfficeView.tsx`, modelo do escritório, manifestos, README e licença.
- Pixel Agents: commit `d1e007a9fdf3003c252d2973abe1999ae59aec33`; inspeção de provedor de eventos, mensagens, manifestos, README e licença.
- [Evidência da pesquisa direcionada](../evidencias/atlas-cidade-agentes-2026-10-15.json) · [Manifesto](../evidencias/releases/atlas-cidade-pesquisa-2026-10-15.json).
