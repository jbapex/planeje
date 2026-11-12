# Login de cliente e indisponibilidade da VPS — 16/10/2026

Correção PUBLICADA na VPS em 16/10 às 11h18, São Paulo. Diagnóstico iniciado após erro genérico ao criar login do Mini CRM. Durante a investigação, a VPS de produção deixou de responder; nenhuma alteração desta entrega havia sido publicada antes da queda. Após o retorno da hospedagem, os serviços foram conferidos e a correção publicada.

## Falha do cadastro

Leitura produtiva do cadastro indicado encontrou uma conta Auth com marcador administrativo `planeje_provisioning_role=cliente`, mas perfil `colaborador`, `pending`, sem cliente. Não registrar identificador, e-mail ou senha do cadastro em evidência pública. O mesmo comportamento foi reproduzido com uma conta fictícia no Auth isolado e removido em seguida.

No [GoTrue v2.189.0](https://github.com/supabase/auth/blob/v2.189.0/internal/api/admin.go), `adminUserCreate` insere o usuário antes de aplicar `app_metadata`; o trigger INSERT cria, portanto, colaborador pendente. O handler administrativo interpretava esse perfil recém-criado como funcionário existente e recusava concluir o vínculo. O fluxo da loja já persistia o perfil explicitamente.

O handler publicado agora aceita esse estado inicial somente para o ID Auth criado na própria requisição, retornado com o marcador administrativo confiável. Nunca converte funcionário preexistente ou tentativa antiga automaticamente. Valida conta/sessão atual por RPC e JWT explícito; confere vínculo e papel antes de trocar senha em e-mail duplicado; desfaz conta nova se falhar a persistência. SDK fixado em 2.30.0. A UI lê a resposta JSON do FunctionsHttpError para exibir a causa real.

12 verificações de apresentação, 106 verificações com handler real e GoTrue/PostgREST/RLS isolados, regressões de convites e Mini CRM passaram. Incluem login novo, autorização do cliente pendente vinculado, escopo dos contatos Mini CRM, sessão revogada, conflito sem alteração de senha, loja e falhas de limpeza. Contatos e contas fictícios removidos; a loja fictícia exigiu teardown transacional da guarda de último administrador exclusivamente no banco isolado. Guarda restaurada, zero contas/loja fictícias restantes. As políticas legadas amplas de leitura da tabela `clientes` não foram alteradas nem apresentadas como isolamento corrigido.

## Indisponibilidade

Por volta de 10h30–10h35, São Paulo, TCP 22/80/443 passou a expirar. DNS continua 72.60.14.109. HTTPS e SSH indisponíveis tanto do computador quanto da VPS 103; ferramenta web também não acessou o site. Painel da Hostinger mostra a VPS de produção srv1102699/KVM 4 ativa, validade 14/11, CPU 13%, memória 25%, disco 85/200 GB e nenhum evento anti-DDoS. Essas métricas podem estar defasadas. Console web encerrou sem conectar.

[Incidente oficial da Hostinger](https://statuspage.hostinger.com/incidents/cwmx7r6chbjw) identificado em 16/10 às 11h20 UTC: manutenção emergencial da frota VPS, reinicializações previstas. Inicialmente era hipótese compatível; após Josias propor reiniciar, o painel confirmou especificamente: **“Your VPS node is currently in maintenance. Please try again later.”** Uma solicitação de reinício normal foi recusada. Reinício não executado; não insistir em novos reinícios enquanto a manutenção impedir. Não restaurar backups, alterar rede/credenciais ou recriar a máquina.

## Retorno, publicação e verificação

Às 10h56 o frontend voltou a HTTP 200 na mesma versão anterior. Banco e Atlas responderam e, em seguida, todos os contêineres principais ficaram saudáveis. Houve lentidão intermitente após o reinício da hospedagem. Ao subir a carga novamente, o build candidato iniciado na VPS foi interrompido; o código não tinha sido promovido. A cópia produtiva reconciliada foi transferida e compilada no Mac em 14,34 s, com os mesmos pacotes e flags Atlas. A carga diminuiu; o usuário relatou consultas mais rápidas e a tela autenticada voltou a carregar após Tentar de novo.

Publicação seletiva sobre bdacac55/8a46408f, sem Assessoria e com `VITE_ATLAS_DEMANDS_ENABLED=true`, `VITE_ATLAS_DEMAND_PILOT=false`. Handler publicado primeiro, com SHA igual ao testado; somente Edge Functions reiniciado. GET 405, POST sem cliente 400 e anônimo 401 confirmaram JSON específico/no-store. Depois, a tentativa real incompleta foi recuperada em transação: exatamente o usuário/e-mail/data de criação originais, marcador administrativo confiável, papel solicitado cliente, perfil colaborador pendente sem cliente, sem membro de loja, e cliente exato. Alterados apenas papel e vínculo. Senha, nome, estado e páginas preservados; conta Auth não recriada. Backup privado anterior no diretório da release. Nenhum outro perfil, convite, tarefa, comentário ou mensagem alterado.

Frontend novo `index.f19ca1d1.js` / `index.8a46408f.css`. CSS e assets anteriores conservados; índice principal trocado atomicamente. Índice e assets novos/anteriores HTTP 200 com bytes exatos; mapa f94ade29/17b78889 e índice do escritório preservados. Banco pronto, Auth/REST/Storage/Edge saudáveis e Atlas ativo depois da publicação.

Navegador produtivo autenticado na URL nova: Usuários de cliente mostra o cadastro indicado com um login e o usuário vinculado no modal; totais passaram de 20 a 21 logins. Screenshot contém dados reais e permanece apenas em `.local/client-login-20261016/login-vinculado-producao.png`. Não foi solicitada/lida a senha, nem feita entrada real como cliente; esse aceite fica com o usuário. Login/criação com credenciais fictícias foram validados nos 106 casos isolados. A aba original do usuário não foi recarregada nem perdeu rascunho.

Os dois arquivos de produto foram incorporados seletivamente à fonte CS, mediante hashes do baseline, para que futuros candidatos não revertam a correção. Não houve rebuild da interface de teste nem promoção de Assessoria. Sem migração nova/reaplicação de SQL antigo, envio externo ou conta produtiva de teste. Aceite de entrada/uso pelo cliente pendente.

Operações, backups e testes privados: `.local/client-login-20261016`, `/root/planeje-releases/client-login-20261016-01` na produção e `/opt/planeje-client-login-20261016` no teste. [Release](../evidencias/releases/client-login-2026-10-16.json) e [verificações](../evidencias/client-login-testes-2026-10-16.json).
