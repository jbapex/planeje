# Editar os campos do Mini CRM dentro da ficha do lead

Publicado em 16/10/2026 às 18h47 (São Paulo), após Josias aprovar a proposta com “sim faz muito”.

A ficha aberta pelo nome do contato na Grade ou no Kanban, ou pela conversa no Follow-up, agora permite editar Status, Consultora/Vendedor, Não respondeu, data e horário de agendamento, Compareceu, Data da venda, follow-up, Próxima ação, Observação e outros campos configurados da loja. Os campos são os mesmos da Grade; qualificação, compra, valor e etiquetas continuam no bloco Marcar. A seção Mini CRM usa a fila, os patches e o RPC existentes, sem cadastro paralelo. O cliente, as opções, os vendedores, os nomes e a ordem dos campos vêm da configuração atual da loja.

O salvamento é automático, com indicador e botão Salvar alterações para adiantar ou repetir uma tentativa. Fechar a ficha aguarda a gravação pendente e conserva a janela se falhar. Venda Realizada abre a confirmação existente de data e valor; falha na gravação mantém o formulário, restaura o estado anterior e impede a conversão. Cancelar retorna à etapa anterior. A confirmação só prossegue após sucesso no banco. A marcação manual e a retomada da automação usam o comportamento existente.

## Validação

Seis scripts de regressão (miniCrm, miniCrmMessageRules com 48 verificações, miniCrmOrigin com 17 cenários, miniCrmConfigCopy, rastreamentoLeadFicha e leadIdentity com seis verificações) e build completo da fonte produtiva passaram no Mac. Componente real com adaptador fictício: Grade/Kanban, salvar etapa/consultora/data/horário/comparecimento/próxima ação/notas, texto com espaços, reabrir/recarregar, fechamento antes do debounce, falha/repetição, venda/cancelamento e erro de venda seguido de cancelamento passaram. Horário conferido por teclado e no registro fictício. Tela CSS 390×844 editou, salvou e rolou até Atendimento sem transbordamento horizontal; a janela do navegador foi restaurada.

A publicação é seletiva de três fontes e assets. Guarda de 1.638 arquivos do candidato produtivo; sem promover CS/Assessoria. Assets `index.cbb6ac1b.js` / `index.939a0f53.css`, conserva `index.9c001447.js` / `index.74446f1a.css`. HTTP e bytes novos conferidos. Nginx e quatro serviços Atlas permaneceram ativos. URL/anon key de API idênticas ao bundle anterior. Sem SQL, migração, restart, ambiente, IA, mensagem ou conversão real alterados/disparados pelo agente.

A conferência autenticada de produção ficou pendente: a nova aba IAB abriu sem sessão e a sessão disponível do Chrome não carregou o perfil após uma tentativa. Não foi solicitado novo login ou alterada a sessão do usuário. A leitura administrativa prévia contou 279 contatos na Marbô Noivas e zero ajustes automáticos de status pendentes; nenhum lead foi editado no navegador produtivo.

As três fontes também foram incorporadas ao candidato CS após guarda de hashes, sem reconstruir ou publicar o piloto. Documentação sincronizada com produção, fonte de staging e candidato CS, preservando o histórico de cada ambiente.

Nova base frontend: `/root/planeje-releases/mini-crm-ficha-edit-20261016-01/candidate`; webroot `/var/www/planeje`. Backend segue a candidata Atlas anterior. Backups e manifestos na pasta da release. Resta o primeiro uso de Josias/loja e o aceite; edição nas entradas Rastreamento/calendário e envio de WhatsApp não fazem parte desta entrega.

![Demonstração no computador](../evidencias/mini-crm-ficha-edicao-demonstracao-2026-10-16.png)

![Demonstração no celular](../evidencias/mini-crm-ficha-edicao-celular-2026-10-16.png)
