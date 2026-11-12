# Inicialização da sessão sem erro prematuro de perfil

Publicado em 16/10/2026 às 21h25 (São Paulo). Josias relatou que “Não foi possível carregar seu perfil” aparece a cada atualização e desaparece quando o conteúdo chega.

## Causa e comportamento

A versão anterior encerrava o carregamento após um prazo global de 12 segundos, mesmo com a sessão/perfil ainda pendentes. Login e renovação também atualizavam a sessão sem recuperar o estado de carregamento quando faltava o perfil. Consultas dentro do callback assíncrono do SDK podiam bloquear a própria sessão. A falha visual foi reproduzida com o App e AuthProvider anteriores e respostas controladas: o aviso aparecia e sumia ao liberar a consulta.

O carregamento agora é uma fotografia única de sessão, perfil e permissões. Consultas são iniciadas fora do callback de autenticação; respostas anteriores são invalidadas ao trocar a identidade ou sair. Uma consulta atrasada não restaura usuário/permissões antigos. Eventos repetidos da mesma sessão não duplicam a carga. O perfil e os campos vêm do banco, sem usar `user_metadata` para autorização. Renovação da mesma conta mantém o conteúdo enquanto revalida; troca de conta limpa o perfil anterior imediatamente.

O prazo de sessão (12 s) vale para sua consulta; o de perfil/permissões (8 s) vale para cada consulta, com cancelamento. Há uma repetição automática para falha transitória do perfil. Perfil ausente ou acesso recusado continua bloqueado, sem repetição automática. Permissões opcionais são consultadas em paralelo e mantêm o fallback anterior. O aviso de falha só aparece após falha concluída; Tentar de novo consulta novamente sem recarregar ou perder a rota. Uma rota explícita mantém `/mini-crm?...` no Mini CRM da área do cliente, em vez de cair no Dashboard pelo curinga durante a hidratação. Regras de papel/estado/página e rotas públicas preservadas.

## Validação

20 testes com relógio controlado passaram: sessão de 6 s + perfil de 7 s (ultrapassa o antigo prazo global); login; callback síncrono; respostas fora de ordem; saída durante consulta; sessão inicial antiga; eventos repetidos; token novo; repetição/timeout; perfil ausente e 403; permissões/exceções; consultas paralelas; fallback existente; troca de identidade; desmontagem; recuperação e papel obtido no banco.

14 verificações usando SDK **2.30.0**, GoTrue e PostgREST reais do CS isolado passaram: login de conta já fictícia, consulta autenticada, comparação do perfil com o banco, renovação do token, nova consulta, atualização manual e saída sem restauração tardia. Sessão de teste encerrada; zero perfis/credenciais/dados operacionais alterados. O transporte impede rede externa. Nenhuma alteração de DDL/RLS/grants, e nenhum upgrade do SDK.

12 verificações de navegador com App/AuthProvider reais e páginas/transportes fictícios: reprodução anterior, carregamento, mesma rota, reload, renovação, falha real e repetição, bloqueio de conta inativa, redirecionamento do cliente, superadmin e tela CSS 390×844. Viewport restaurado. Seis scripts de regressão (inclui os 20 testes) e build Vite completo no Mac passaram. HTTP/bytes de índice/assets novos/anteriores e quatro serviços ativos conferidos. Aba produtiva nova estava sem sessão; o navegador produtivo autenticado e o primeiro aceite de uso permanecem pendentes. Aba original e rascunhos do usuário preservados.

## Release e operação

Outra release entrou durante a promoção inicial. A guarda de concorrência recusou a troca antes de copiar assets; a candidata foi refeita sobre **atlas-events-production-20261016-01**, preservando seus 13 arquivos e flags `VITE_ATLAS_EVENTS_ENABLED=true`/`VITE_ATLAS_EVENTS_PILOT=false`. A atualização do robô/worker veio dessa outra release; este ajuste não mudou configuração operacional nem reiniciou serviços.

Assets **index.31f3e8e3.js / index.d86dd2fb.css**, conserva **index.55847b9c.js / index.d86dd2fb.css**. Guarda de 1.653 fontes; três fontes de produto e um teste próprios. Lista seguinte inclui os dois caminhos novos. Base frontend `/root/planeje-releases/auth-profile-load-20261016-01/candidate`; webroot `/var/www/planeje`. Serviços da equipe e acontecimentos mantêm suas candidatas anteriores. Fonte CS incorpora somente o ajuste de autenticação; seu App tinha diferenças antigas nas rotas públicas de WhatsApp e elas foram preservadas por adaptação comparada, sem rebuild ou publicação CS. Sem SQL, restart, chave, senha, IA, mensagem ou lead alterados por esta entrega.

[Callback do SDK e risco de travamento](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0) · [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange). Changelog atual conferido: descontinuação de cifras TLS não afeta self-hosted; mudança padrão API_EXTERNAL_URL/SAML não exige alteração neste ajuste de frontend.

![Teste anterior com dados fictícios](../evidencias/auth-perfil-antes-2026-10-16.png)

![Teste corrigido com dados fictícios](../evidencias/auth-perfil-carregamento-2026-10-16.png)
