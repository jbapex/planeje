# Interface existente

Componentes locais em `src/components/ui`, Radix, Tailwind 3 e identidade do
Planeje. Preserve formulários, diálogos, tabelas, estados vazios e navegação
existentes. Há padrões semelhantes a shadcn, mas falta `components.json`;
não inicializar/regenerar componentes por presumir configuração do CLI.

Conferir teclado, foco, rótulos, erros, contraste e movimento reduzido nas
mudanças pertinentes. Validar desktop/tela estreita com fixtures, incluindo
carregamento, vazio, falha e repetição quando afetados. React 18 não recebe
APIs React 19/ViewTransition ou Next apenas por recomendação de uma skill.

[Validação e aceite](continuidade-planeje/06-VALIDACAO-E-ACEITE.md) e referências
de módulos registram evidências anteriores. Prévia local não comprova produção
nem aceite. Configurar o harness não autoriza redesenho do produto.

## Menu da equipe

O menu principal usa três atalhos — Início, Minha caixa e Conversas — e cinco
categorias recolhíveis: Operação, Clientes e vendas, Marketing, IA e automações
e Gestão. Cada categoria mostra somente destinos autorizados; categorias
vazias desaparecem. Ao navegar, inclusive por Voltar e Avançar, a categoria da
página atual abre. Selecionar uma categoria na lateral recolhida expande o menu
sem substituir o botão que está com foco.

Os indicadores das categorias usam traço fino e contraste discreto. Apontam
para a direita quando fechadas e para baixo quando abertas, com transição curta
desativada na preferência por movimento reduzido. A área de clique permanece
igual, no computador e no celular.

Por decisão explícita de Josias, **Gestor IA, CS IA e CRM IA permanecem no
rodapé, como o Squad atual**. IA e automações contém Assistente e Automações.
Notificações, Configurações, Super Admin e conta conservam seus acessos.

No celular, os atalhos são Início, Caixa, Conversas e Tarefas, conforme os
módulos habilitados. Mais reúne as mesmas categorias, sem repetir os atalhos,
com Squad e utilitários ao final. O painel controla foco, fecha com Escape e
ao navegar, e é fechado ao mudar para a largura de computador. Movimento
reduzido desativa suas animações. Contadores e rotas por perfil são preservados.

[Publicação e verificação](continuidade-planeje/referencias/menu-categorias-producao-2026-11-11.md) ·
[Desenho e testes locais](continuidade-planeje/referencias/menu-categorias-local-2026-11-11.md).

## Conversar no Atlas

O atalho **Conversar** no Squad, o cartão **Conversar com Atlas** no ApexIA e
o botão de conversa do Escritório abrem `/assistant/atlas?view=conversation`.
A tela se inspira no
[Conversar do ScaleOS](continuidade-planeje/referencias/scaleos-conversar-2026-11-10.md):
lateral recolhível, sessões agrupadas por data, busca, sugestões em carrossel
e campo central. Cada sessão salva tem URL própria e pode ser reaberta após
recarregar. Favoritar, arquivar e restaurar organizam a lista neste navegador,
por conta. `@` escolhe o especialista e `#` escolhe o cliente. Os dois
controles podem ser removidos sem apagar o pedido. Trocar de cliente abre
uma conversa nova. A conversa, a voz, as missões e a memória usam os serviços
atuais do Atlas.

A entrada do título, a abertura do seletor, a passagem do campo para o rodapé
e a chegada das mensagens têm transições curtas. O carrossel pausa com foco,
ponteiro ou pelo botão. Movimento reduzido deixa o carrossel manual e abre
os controles sem animação.

Para quem já tem acesso a Demandas, a resposta concluída de um cliente pode
virar um repasse. A revisão mostra os campos antes da aprovação, usa a
Central de Demandas e deixa o link para a tarefa oficial no histórico.
Recusar arquiva a proposta. O link só aparece quando a tarefa está disponível
para aquele cliente. Esta entrega não inclui Automação, anexos ou novos conectores.
