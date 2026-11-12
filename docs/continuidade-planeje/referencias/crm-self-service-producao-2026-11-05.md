# CRM: conexão ao Planeje por loja publicada

**Atualização18h23:** primeira conexão real com chave da nova tela confirmada para Impacto. A captura mostrava chave nova na URL fixa antiga, causando recusa. Durante o diagnóstico, a configuração foi atualizada pela interface para a URL com `-connect`, testada e ativada. O agente não escreveu na configuração nem gerou chave. Identidade da organização conferida; último ciclo sem erro,10.708 registros já iguais e5.063 telefones associados. API antiga continua instalada, mas o destino Impacto agora usa a nova. [Evidência](../evidencias/releases/crm-self-service-impacto-2026-11-05.json). Visual e aceite de uso continuam pendentes; o limite sobre ausência de exportação real abaixo descreve apenas a entrega das18h14.

Publicado em05/11/2026,18h14(São Paulo), na VPS82.29.181.87. Josias respondeu “pode” à solicitação concreta de publicar tela, API e nova configuração do banco. A autorização não incluiu ativar outras lojas ou migrar a conexão fixa da Impacto, que foi preservada.

## Uso e escopo

[CRM > Integrações > Planeje](https://crm.jbapex.com.br/integracoes/planeje), com administrador ativo da loja selecionada. Gerar chave e copiar endereço/chave. No Planeje, selecionar o cliente correspondente e abrir Rastreamento > Integrações > CRM Ápice; colar, testar, conferir a loja e ativar. Cada organização possui sua própria chave; vários administradores da mesma loja gerenciam a mesma conexão. A chave aparece uma vez. Para substituí-la, revogar e gerar outra, atualizando o Planeje.

URL compartilhada: `https://dadoscrm.jbapex.com.br/functions/v1/planeje-status-export-connect`. A chave determina a loja. Gerar a chave não ativa a sincronização. Revogar impede futuras consultas, mas não apaga status já recebidos. O painel novo não administra a configuração fixa anterior da Impacto.

Foram promovidos quatro fontes do CRM: App.jsx, IntegrationsContent.jsx, crmPaths.js e a página PlanejeIntegration.jsx. Usa permissão integrations e administração ativa da organização; não altera permissões existentes. Não houve mudança nova no frontend, worker, banco ou configuração da VPS109.

## Release e fonte atual

Release privada: `/root/apice-releases/planeje-self-service-20261105-01` na87. Candidata compilada: `candidate/`; fontes correntes: `/root/apicecrm`; site: `/var/www/apicecrm`. A configuração `.env` foi herdada dentro da VPS, sem cópia local ou divulgação. Node18.19.1, React18.3.1, Vite4.5.14, SDK2.30.0 e runtime Edge1.71.2 preservados.

Antes do overlay, build completo reproduziu exatamente o HTML publicado `d509c25f…` e entrypoint `index-a2224d8a.js`, em42,91s. Build novo:3.913 módulos,25,54s.340 fontes conciliadas, incluindo uma nova;103 artefatos atuais conferidos.101 assets antigos preservados. HTML promovido atomicamente, com backups e guardas de concorrência;24 testes do publicador passaram localmente e naVPS.

Atual: `index-8015b389.js`, CSS `index-3693192e.css`, página `PlanejeIntegration-c53d5f66.js`. HTML SHA256 `35d458f2d0d0b8f2a382ad0eb5d3237432c4f6706316fc6e662772a60bad8895`. Charts, Supabase e CSS conservaram hashes anteriores. `/root/apicecrm/dist` permanece build anterior: **não é a base para futura publicação**. Usar candidata e manifestos desta release, reconciliando alterações posteriores.

## Banco e API

Migração `20261105203802_planeje_self_service.sql` aplicada **uma vez**, apenas no CRM87. SHA256 `9674daf72754a0f4ec03c9a88d271b67ed83e67c6c4e6deb2e34dd1b5fb73ae9`. Recibos `database-started.json` e `database-applied.json` na release; fonte arquivada também em `/root/apicecrm/supabase/migrations`. PostgREST recarregado por NOTIFY. Não reaplicar.

Tabela privada `crm_private.planeje_connections`, RLS ativo e sem acesso direto a anon/authenticated/service_role. RPC pública de gerenciamento permitida somente ao authenticated e valida owner/admin ativo da organização ativa. Resolver de hash permitido somente ao service_role. Criação/revogação serializadas, membership revalidada após o lock. Chave de256bits aleatórios; banco guarda hash/prefixo.

API empacotada em `/root/supabase/docker/volumes/functions/planeje-status-export-connect/index.ts`, SHA256 `d29b96468fca6ea4eee387724a737e80d47376a6f77e2edf3abec59cdbf230e6`. GET sem query, chave dedicada, limites de25s/25mil registros, revalidação antes de responder. Organizações de um mesmo proprietário só recebem registros explicitamente associados quando o legado é ambíguo. Função fixa anterior, arquivo de segredo, roteador global, Nginx, env e início do container preservados. Sem restart.

## Evidência e limites

Validação local anterior:34SQL descartáveis,12Node com regressões e20React; lint e revisão sem achados materiais abertos. [Registro local histórico](crm-self-service-local-2026-11-05.md). [Recibo produtivo sanitizado](../evidencias/releases/crm-self-service-producao-2026-11-05.json).

No servidor: grants/RLS conferidos; consulta status da RPC sob papel authenticated e identidade de administrador existente, sem criar chave. Cinco respostas HTTP esperadas: ausência/formato inválido/chave desconhecida401, query400, método405. A chave desconhecida com formato correto percorreu o resolvedor real. Oito verificações públicas200/hashes incluíram home, rota, entrypoints antigo/novo, bibliotecas/CSS e chunk da página. Todos os assets novos/antigos conferidos no disco.

Impacto: API fixa200 com8.687 registros na leitura de verificação; timer109 ativo, uma única loja configurada/ativa, sucesso recente e sem erro. Nenhum segredo divulgado, chave persistente criada, nova loja conectada ou mensagem enviada.

Não houve inspeção visual: navegador desabilitado pelas configurações do cliente, sem contorno. Nova exportação com chave válida coberta por fixtures; primeira geração/conexão real de outra loja e aceite humano permanecem pendentes. A verificação SQL de status não equivale a uma sessão autenticada no navegador.

## Recuperação

Não repetir o publicador. Backups em `before/`, manifestos e recibos privados na release. Se necessário, comparar hashes e repor somente os três pais anteriores/retirar a nova página e restaurar HTML anterior, preservando alterações concorrentes e assets. Suspender a nova API após conferir dependências; não apagar tabela/chaves nem desfazer a migração automaticamente. Conexão fixa Impacto independente. Recuperação produtiva requer autorização atual; falhas posteriores ao commit devem ser tratadas incrementalmente.
