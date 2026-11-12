# Acesso da equipe ao link de conexão — 15/10/2026

Josias informou que o gestor não via o botão e determinou que a ferramenta deve estar disponível para todos que já podem abrir o Rastreamento. A restrição anterior a admin/superadmin foi substituída pelas mesmas regras da página, sem elevar papéis ou modificar permissões cadastradas.

## Comportamento publicado

Superadmin, administrador e colaborador ativos com o módulo Rastreamento habilitado podem gerar, consultar e revogar links do canal acessível pelas políticas já existentes. Conta de cliente, conta inativa, sessão revogada e módulo desligado continuam recusados. A permissão individual prevalece sobre o padrão global; ausência de configuração conserva o padrão habilitado da página.

A interface usa o contexto do módulo e a regra compartilhada. O serviço confere conta/sessão atual, papel/status e configurações atualizadas do módulo, seguido da leitura do canal com o RLS do usuário. A nova validação SQL repete papel/status/módulo para emitir e usar links. Se o criador perder acesso ao Rastreamento, o link deixa de permitir pareamento.

A tabela de links continua inacessível diretamente para anon/authenticated. As três funções SQL são invoker, têm search_path vazio e EXECUTE somente por service_role. Nada amplia os clientes acessíveis, entrega token Uazapi ao público, desconecta o canal ou altera as regras de 24 horas, encerramento após conectar, limites e revogação.

## Verificação

48 verificações Node, 145 API/Auth/RLS no ambiente isolado e build completo passaram. Os testes reais de Auth/RLS usaram somente canais fictícios e provedor substituído, incluindo colaborador, conta cliente, módulo desligado, prioridade da permissão individual, escopo de canal, sessão revogada e uso/revogação do link. Perfis/permissões temporários foram restaurados e dados fictícios removidos. A prévia com perfil de colaborador confirmou visibilidade, geração e revogação; sem permissão, botão ausente e sem erros de console.

A base é a fonte produtiva atual com Atlas `03465f2e`/`841037d3`, conferida contra o último candidato publicado. Quatro bundles antigos do escritório, presentes só na fonte e ausentes do publicado, ficaram fora do candidato. Build usa somente a configuração pública anon já embarcada na produção. Todos os cinco arquivos promovidos foram conferidos por hash; Atlas e Assessoria não foram promovidos nesta entrega.

Migração nova `20261015173734` aplicada uma vez no teste isolado e uma vez na produção; não reaplicar. Não se reaplicou `20261015045127`. Backup das funções SQL anteriores, fontes e índice permanece na release privada. Somente dois módulos da função foram atualizados e apenas Edge Functions reiniciado; serviços/configuração do Atlas preservados.

Produção: `index.9aefb86f.js` / `index.841037d3.css`. [Abrir Integrações](https://planeje.jbapex.com.br/?v=9aefb86f#/rastreamento?aba=integracoes). Assets anteriores `index.03465f2e.js` / `index.841037d3.css` preservados; índice e assets novos/anteriores conferidos por HTTP e bytes. A validação da conta real do gestor no banco retornou acesso permitido, sem alterar seu papel ou suas permissões. Nenhum link real foi emitido pelo teste e nenhum pareamento ou envio externo foi iniciado.

Aceite de uso do gestor pendente. Esta entrega trata do acesso ao link; o diagnóstico de participantes de grupos virando contatos permanece sem correção nesta revisão. Futuros candidatos de Atlas/Assessoria devem incorporar esta publicação seletiva.

[Release](../evidencias/releases/whatsapp-conexao-acesso-2026-10-15.json) · [Testes](../evidencias/whatsapp-conexao-acesso-testes-2026-10-15.json).
