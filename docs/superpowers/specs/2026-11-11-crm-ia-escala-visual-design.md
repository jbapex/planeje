# CRM IA — escala visual e lateral consistente

Josias apontou que o menu lateral ocupa espaço excessivo, que as áreas usam tamanhos diferentes e que o CRM IA parece ampliado em comparação ao ScaleOS. Este refinamento integra o pedido vigente de reprodução visual e publicação após verificação; a autonomia e a direção visual já foram dadas nesta conversa.

## Direção

Usar as proporções observadas na referência e a base existente do Planeje. Na comparação de 11/11, ambos os sites estavam em viewport de 1600 × 938, DPR 1,8 e sem `zoom` CSS. ScaleOS usa lateral expandida de 248 px, itens de 36 px, ícones de 17 px e fonte de 13,5 px. Planeje usa 272 px, itens de 44 px e margem externa na lateral do Squad; Atlas já usa 248 px expandido e 57 px recolhido. O CRM repete um cabeçalho de ambiente antes do título da página.

Manter a tipografia legível, padronizar a lateral em 248 px expandida e 64 px recolhida, compartilhar essas medidas com Atlas e remover a variação exclusiva de 232 px no notebook. Compactar os itens de desktop sem reduzir os alvos de toque no celular. No CRM, manter fundo branco, lateral neutra e bordas suaves; alinhar a lateral à borda do ambiente e colocar a escolha de conta no cabeçalho da página. O Workspace mantém esse cabeçalho e o seletor no mesmo pai durante carga, erro e troca de conta, preservando o foco. O conteúdo isolado mantém seu cabeçalho por padrão.

## Abordagens

- Ajustar CSS e o cabeçalho React existentes: direção escolhida pelo implementador dentro do pedido, mantém escala, teclado, fluxo de dados e layout responsivo.
- Aplicar `zoom` ou `transform:scale`: descartado porque reduz texto e alvos, altera coordenadas e esconde o problema de espaço.
- Reescrever as cascas de navegação: desnecessário; os módulos já compartilham lateral e tokens.

## Aceitação e limites

- Mesmas larguras nos ambientes principal, CRM IA, CS IA, Gestor IA e conversa do Atlas, sem sobrescrita por faixa de notebook.
- Um cabeçalho de página no CRM carregado, com seletor de conta funcional; trocar a conta mantém os filtros, permissões e desmontagem atuais.
- Conteúdo começa mais alto, com margens de 24 px no desktop; tabelas, cartões e conversas mantêm legibilidade.
- Desktop, notebook, 390 px e 320 px conferidos na prévia isolada; sem rolagem horizontal do documento, controles cortados ou rodapé inacessível.
- Sem novas dependências, transporte, SQL, alteração de permissões ou ativação de agentes neste refinamento.
- Publicação usa nova candidata que preserve a publicação concorrente do espaçamento do Gestor; a tentativa privada anterior não foi promovida.
