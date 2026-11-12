# Convites e proteção de acesso — 13/10/2026

**Proteção e frontend publicados às 12:13 de São Paulo; compatibilidade Atlas/MCP concluída às 23:40 de 13/10.** Josias confirmou que o ingresso por seus convites vale somente para a equipe da agência. As quatro migrações abaixo foram aplicadas uma vez; não reaplicar.

Josias relatou cadastros de pessoas que não eram funcionários e determinou que o ingresso da equipe dependesse de seus links de convite. Informou que já havia excluído os desconhecidos. Não foram excluídos ou desativados outros usuários por inferência.

## Diagnóstico confirmado

- GoTrue produtivo `v2.189.0` estava com cadastro público liberado e confirmação automática de e-mail.
- `/signup` aceitava ausência de convite e usava o papel enviado pelo navegador. `/signup-superadmin` também chamava o cadastro público com esse papel.
- O trigger de novos usuários confiava em `raw_user_meta_data.role`, editável pelo usuário.
- Havia leitura pública de clientes/perfis/convites, permissões amplas para contas autenticadas e atualização do próprio perfil sem proteção suficiente de papel/aprovação.
- Uma função privilegiada de limpeza de usuários era executável por papéis comuns. A proteção foi restringida ao serviço administrativo existente.

Isso confirma falhas de autorização anteriores. Não comprova quais registros foram lidos nem ausência de acesso indevido. A auditoria histórica de leitura de dados não foi concluída.

## O que já está publicado

- Cadastro público desativado no servidor (`DISABLE_SIGNUP=true`), preservando login por e-mail e os usuários existentes. Teste real de signup retornou `signup_disabled`, sem criar conta.
- Login sem botão de cadastro; cadastro sem convite e bootstrap público de superadmin fechados.
- **Configurações → Equipe → Gerar Link** pede o e-mail da pessoa. Convites novos da equipe são criados somente por Josias, valem por sete dias e têm uso único. Os dois links genéricos anteriores expiraram; não foram expostos no relatório.
- O destinatário define nome/senha, mas não escolhe outro e-mail nem outro papel. O backend consome o convite atomicamente, cria o login e aprova o perfil pelo papel da linha autorizada. Falha ou revogação durante o processo não ativa o acesso; não há envio automático de e-mail.
- Papéis, aprovação, vínculo de cliente e páginas permitidas não podem ser alterados pelo próprio usuário. As permissões normais de edição de campos pessoais e WhatsApp da equipe foram preservadas.
- Contas pendentes da agência, contas sem perfil, usuários removidos e sessões revogadas não acessam dados pelas APIs. A aprovação é conferida no banco, nas políticas de tabelas/Storage e no ponto de entrada das funções. Views/RPCs também passam pela proteção de requisição.
- Áreas que leem dados de clientes, como chat/launcher, exigem login. Diagnóstico público, configuração pública não sensível e RPCs de briefing por token mantêm suas entradas previstas.

**Escopo confirmado:** Josias respondeu “Apenas a equipe da agência”. O convite individual é exigido para o ingresso de funcionários. Os fluxos administrativos de usuários das lojas/clientes permanecem, usando um marcador exclusivo do servidor em `app_metadata`. O fechamento do endpoint público de Auth não impede esses fluxos administrativos. Não presumir que todas as políticas legadas de isolamento entre clientes foram auditadas.

## Migrações já aplicadas uma vez

- `20261013140451_invite_only_access.sql`: proteção de contas/sessões, privacidade de requisições, permissões de perfil e convites individuais.
- `20261013150647_trusted_client_provisioning.sql`: preserva a criação administrativa de clientes sem confiar em metadados editáveis pelo usuário.
- `20261013152143_trusted_atlas_delegation.sql`: delegação de servidor do Atlas limitada ao proprietário configurado/ativo, finalidade assinada e validade máxima de 240 segundos; sessão real continua obrigatória para pessoas comuns.
- `20261014023511_mcp_active_account.sql`: o token pessoal MCP só representa equipe aprovada, não banida e com conta Auth existente. O nome foi gerado pelo CLI em UTC, ainda 13/10 no horário de São Paulo.

Não reaplicar. Datas e hashes estão no [release](../evidencias/releases/convites-seguranca-2026-10-13.json).

## Validação registrada

- Testes Node: alteração de e-mail/papel, convite inválido/expirado/usado, concorrência, revogação e limpeza de criação incompleta.
- Testes PostgreSQL numa transação revertida: metadado do navegador não cria superadmin; pendente não lê clientes/tarefas/Storage; perfil próprio não permite autoelevação; somente o proprietário cria convite; uso único e aprovação pelo convite; cliente já vinculado preservado; sessão revogada negada; leitura anônima de clientes/perfis/convites negada. Nenhum usuário de teste permaneceu cadastrado.
- Provisionamento de cliente testado separadamente com rollback: apenas o marcador de servidor produz papel `cliente`.
- Fixture com componentes reais e dados fictícios, em 1280×800 e 390×844: cadastro fechado, e-mail fixo, conclusão do convite, geração pelo proprietário e lista/edição da equipe preservadas; zero erros de navegador.
- Build passou. HTTP real recusou leitura anônima de clientes/perfis/convites e contas sem perfil nas APIs de dados e funções. Acesso administrativo vigente passou numa verificação somente de leitura/validação de corpo vazio, sem operação de exclusão.
- Navegador público: login/cadastro/superadmin/convite inválido conferidos; assets novos e anteriores responderam 200; zero erros de navegador.

Bundle `index.9e0f843e.js` / `index.cb906053.css`. [Abrir Equipe](https://planeje.jbapex.com.br/?v=9e0f843e#/settings?tab=equipe). Conservados `44e11d16` e `66ba606f`. Fonte publicada seletivamente em `/root/planeje`; funções em `/opt/supabase-planeje/volumes/functions`. Reiniciados Auth e funções; nenhum transporte ou credencial externa foi habilitado. Nenhuma mensagem WhatsApp/CAPI/e-mail ou tarefa real foi criada no teste.

Backup privado e candidato: `/root/planeje-releases/auth-invite-only-20261013-01/{before,candidate}`. Configurações/segredos ficaram exclusivamente no backup privado. Index anterior: `/var/www/planeje/index.html.bak-auth-invite-only-20261013-01`.

## Compatibilidade concluída às 23:40

O worker do Atlas usava JWT delegado sem `session_id`. A proteção nova interrompia essas leituras. Foi acrescentada a finalidade `planeje_server_delegate=atlas`, assinada pelo servidor, válida por até quatro minutos, exclusiva do proprietário configurado/ativo e com Atlas habilitado. A conta precisa existir e não estar banida. As consultas operacionais continuam com o papel autenticado e RLS do proprietário. Metadados editáveis de usuário não autorizam delegação.

Atualizados somente `scripts/atlas-worker.mjs` em `/root/planeje`, no candidato deste release e no candidato ativo `/root/planeje-atlas-releases/atlas-human-20261009-01/candidate`. Reiniciado `planeje-atlas.service`. Unidade e configuração de monitoramento preservadas, `monitor_enabled=false`. Heartbeat corrente e as oito fontes (carteira, visão geral, conversas, tráfego, planejamento, financeiro, equipe e memória) passaram na leitura real. A configuração de transcrição já habilitada foi preservada e retomou a leitura: 40 registros concluídos, nenhum pendente/falho na conferência. Não havia missão criada no intervalo da incompatibilidade; quatro falhas antigas não foram repetidas.

O MCP usa cliente administrativo do servidor e não dependia do JWT do Atlas. Entretanto, OAuth e tokens pessoais não conferiam aprovação atual. Agora o MCP verifica perfil ativo, papel da equipe, existência da conta Auth e bloqueio antes de cada requisição de usuário; OAuth também confere no login, emissão e renovação. A sessão MCP fica vinculada à identidade e ao papel atuais. Acesso anônimo permanece desligado. Código seletivo em `/root/planeje/planeje-mcp`, testes Node e sintaxe passaram; processo reiniciado e online. Tokens OAuth em memória podem exigir reconectar o Planeje no ChatGPT; tokens pessoais ativos continuam válidos.

SQL de compatibilidade testado em transação revertida: proprietário delegado permitido, pessoa sem sessão recusada, finalidade/proprietário/emissor/prazo inválidos recusados, Atlas desligado/perfil pendente/banido recusados, sessão real preservada, token pessoal pendente/banido/revogado recusado e token aprovado preservado. HTTP real confirmou sessão vigente e delegação válida (200), falta de sessão/delegação errada/conta removida/prazo excessivo (403), MCP anônimo (401) e refresh inválido (400). Nenhuma conta de teste permaneceu e nenhuma tarefa operacional foi alterada.

O chaveiro foi desbloqueado por Josias, e SSH recuperado pela chave já cadastrada. Nenhuma senha foi solicitada ou transportada. Backups adicionais seletivos em `before/compatibility-source`, `before/active-atlas-worker.mjs` e `before/compatibility-functions.sql`; evidência [Atlas/MCP](../evidencias/convites-seguranca-compatibilidade-2026-10-13.json).

**Aceite de uso pendente. Auditoria histórica e auditoria global do legado permanecem distintas desta correção.**

Fontes oficiais consultadas: [configuração de Auth](https://supabase.com/docs/guides/self-hosting/auth/config), [changelog de self-hosting](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1).
