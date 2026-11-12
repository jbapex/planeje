# Menu principal por categorias — implementação local em 11/11/2026

**Atualização:** publicação autorizada posteriormente por Josias e concluída
às 23h43 BRT. [Publicação, verificações e limites](menu-categorias-producao-2026-11-11.md).
As seções abaixo preservam o registro das etapas locais anteriores.

## Pedido e decisões

Josias aprovou organizar o menu principal com categorias e submenus, para
reduzir os botões visíveis. Em seguida, determinou: “só o Gestor IA, CS IA,
CRM IA quero permanecer lá embaixo como está esse meu Squad”. O bloco desses
três acessos no rodapé do computador foi preservado literalmente em relação
à baseline desta tarefa.

O menu começa com Início, Minha caixa e Conversas. As cinco categorias são:

| Categoria | Destinos |
| --- | --- |
| Operação | Tarefas, Projetos, Cobertura e Solicitações |
| Clientes e vendas | Clientes, Onboarding, CRM, Mini CRM e Área do Cliente |
| Marketing | Tráfego Pago, Redes Sociais e Rastreamento |
| IA e automações | Assistente e Automações |
| Gestão | Financeiro e Relatórios equipe |

O celular mantém Início, Caixa, Conversas, Tarefas e Mais. Os atalhos
desabilitados desaparecem sem promover páginas de outra categoria. Mais
agrupa o restante e mantém os três acessos autorizados do Squad abaixo das
categorias, junto dos utilitários. CRM IA agora também está disponível nesse
menu móvel, sob a mesma autorização usada pela lateral.

## Implementação e contratos

`src/lib/teamNavAccess.js` continua definindo os mesmos 19 destinos, papéis e
módulos. `groupTeamNav` organiza somente itens já filtrados; categorias vazias
desaparecem e atalhos não se repetem. `src/lib/teamNav.js` acrescenta os ícones
das categorias. O destino de Tráfego por perfil permanece intacto.

`Sidebar.jsx` reutiliza o Accordion existente. Os atalhos conservam seus
contadores. Na lateral recolhida, abrir uma categoria expande o menu mantendo
o gatilho e o foco. A seleção manual é descartada quando o caminho muda,
inclusive no histórico do navegador, para abrir a categoria da página atual.

`BottomNav.jsx` usa as mesmas categorias e o Dialog local para Mais. Escape,
navegação e a mudança para a largura de computador fecham o painel. O Dialog
devolve o foco ao gatilho. A preferência por movimento reduzido prevalece
sobre as classes de animação por estado dos componentes Radix.

Selecionar um destino também descarta a seleção manual imediatamente, cobrindo
o retorno rápido antes de o próximo render da navegação ocorrer.

O destaque usa Link e o comparador compartilhado, com `aria-current` explícito:
React Router 6 não usa a propriedade `isActive` da antiga API. A consulta
Context7 usou documentação oficial da linha 6.30; instalação observada
6.30.6, React 18.3.1 e Vite 4.5.14. Nenhuma dependência foi adicionada.

## Verificação

- `node --test scripts/teamNav.test.mjs scripts/teamNavHistory.test.mjs scripts/moduleManagementConfig.test.mjs`: passou. A regressão do histórico falhou nas duas interfaces antes da correção e passou depois.
- Revisão independente somente leitura encontrou a seleção antiga ao retornar pelo histórico. Correção realizada e coberta por testes React e pela conferência em navegador.
- Prévia com autenticação e contadores fictícios, servida em `127.0.0.1:4413`, com Playwright do runtime local e Chrome em perfil temporário. Rede externa bloqueada; nenhum dado ou serviço produtivo faz parte da fixture.
- Verificação visual: 12 cenários passaram, com zero solicitações externas e zero erros de navegador. Computador em 1280 px, lateral expandida/recolhida, celular em 390 px e tela estreita em 320 px, tema escuro e movimento reduzido. Conferidos teclado, Tab, Escape, retorno do foco, ausência de transbordamento, contadores, destino por perfil, categorias vazias, Squad e histórico.
- Scripts, baseline e capturas da conferência ficam em `.local/menu-categorias-2026-11-11`, fora do produto e do Git. A fixture visual não faz parte do comando canônico.

`npm run check` passou na versão final: contexto, harness, lint rápido/tipado,
tipos, regras, testes locais e build temporário. O repositório conserva seus
avisos de lint (360 rápidos e 11 tipados, sem erros); o lint dirigido dos
quatro arquivos de produção desta tarefa não apontou avisos. O log final
está em `.local/menu-categorias-2026-11-11/check-final.log`.

A regressão React também cobre a volta imediata antes do render seguinte.
Os dois cenários do histórico falharam antes de cada ajuste e passaram depois.
O caso de movimento reduzido falhou na prévia antes da precedência explícita
da classe de animação e passou após a correção. A revisão deixou foco e
aparência para a conferência do coordenador; esses pontos foram exercitados
nos 12 cenários e as capturas foram inspecionadas. Sem achados pendentes.

## Limites

Entrega local. Nenhuma publicação, migração, alteração de conta/módulo,
mensagem, consulta de dados de cliente ou transporte real foi executada.
As verificações não representam homologação em produção nem aceite humano.
O checkout já tinha alterações de outras entregas; foram preservadas, sem
reset, limpeza ou commit automático.

[Desenho aprovado](../../superpowers/specs/2026-11-11-menu-categorias-design.md) ·
[Plano](../../superpowers/plans/2026-11-11-menu-categorias.md) ·
[Interface](../../design.md) · [Qualidade](../../quality.md).

## Refinamento dos indicadores após o recorte de Josias

Josias considerou os indicadores dos submenus brutos em comparação com outros
sistemas. O ajuste local limita o chevron das categorias a 12 px, com traço
fino, contraste discreto e alinhamento central. Fechado aponta para a direita;
aberto aponta para baixo. A rotação dura 160 ms e é desativada com movimento
reduzido. Foco e área de clique foram preservados.

A classe visual é compartilhada apenas pelas categorias de `Sidebar.jsx` e
`BottomNav.jsx`, com CSS em `planeje-brand.css`. O Accordion geral e o Squad
não foram alterados. A baseline desta etapa está em
`.local/menu-refino-2026-11-11/baseline`.

Os testes dirigidos de navegação e histórico passaram novamente, assim como
o lint dos dois componentes e `npm run build:check`. A prévia isolada repetiu
os 12 cenários sem solicitações externas ou erros. Quatro verificações visuais
adicionais conferiram orientação, traço, movimento reduzido, foco, tamanho dos
botões e alvo móvel de 44 px. Capturas antes/depois e resultados estão em
`.local/menu-refino-2026-11-11`. Entrega local, sem publicação.
