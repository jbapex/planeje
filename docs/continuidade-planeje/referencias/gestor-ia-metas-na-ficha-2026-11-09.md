# Gestor IA: metas dentro da ficha do cliente

Em 09/11/2026, conferimos o ScaleOS na sessão autenticada. **Nova meta** e **Editar** abrem um painel lateral na própria ficha. O formulário oferece objetivo, escopo por objetivo, cliente ou campanhas escolhidas, custo, verba, volume e controles independentes de meta ativa e principal. Uma simulação de R$ 900 de verba e R$ 12 por lead sugeriu 75 leads. O modo de campanhas escolhidas bloqueou a gravação sem seleção. Cancelamos o formulário sem gravar.

Na prévia do Planeje, a aba **Metas** mostra a meta de tráfego e os volumes mensais. **Nova meta** e **Editar meta** usam o cadastro de tráfego já existente. **Editar metas do mês** grava leads, agendamentos e vendas do cliente no mês selecionado na tabela de Indicadores. Ambos abrem no painel lateral e atualizam os cartões após salvar. Cancelar e Escape devolvem o foco ao botão de origem sem gravar.

O painel confere perfil administrativo, módulo, sessão ativa, cliente na carteira e permissões de campo. A edição de tráfego chama `saveClienteForm` no modo restrito. A edição mensal grava apenas campos alterados para o cliente e mês escolhidos. Limpar um campo não apaga os demais. O Gestor lê o cadastro ao atualizar o cartão, sem consultar a Meta. Nenhuma migração é necessária. O Planeje ainda não tem neste painel escopo por campanha nem cálculo de volume a partir de custo e verba.

Validação local: 71 testes do Gestor, incluindo 104 verificações React de navegação; lint direcionado e build temporário. A prévia isolada confirmou criação, edição de volume, separação por mês, atualização de valores, Cancelar e Escape sem mudança de rota. Não houve gravação de clientes reais nem publicação na VPS neste turno.
