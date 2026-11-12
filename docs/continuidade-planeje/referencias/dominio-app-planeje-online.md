> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Domínio público da homologação Planeje

Ativado em 16/09/2026: https://app.planeje.online aponta para a VPS isolada 2.25.216.103. A produção em 72.60.14.109 não foi alterada.

## Caminho da requisição

DNS A → Caddy `/opt/planeje-staging/edge` (80 redireciona para 443; certificado automático) → Nginx `planeje-staging-web:8080` na rede Docker interna → Supabase isolado. Nenhuma porta do banco ou gateway de API é publicada no host. O túnel SSH para `localhost:18080` continua disponível como acesso alternativo.

## Arquivos e operação

- `/opt/planeje-staging/edge/compose.yaml` e `Caddyfile`: entrada TLS; `/data` preserva certificados para renovação.
- `/opt/planeje-staging/infra/nginx-staging.conf`: host permitido, CSP, bloqueios de integrações e proxy da API.
- `/opt/planeje-staging/infra/browser-guard.js`: restringe chamadas do navegador à mesma origem.
- `/opt/planeje-staging/source/src/lib/customSupabaseClient.js`: origens autorizadas e JWT da base de testes.
- `/opt/planeje-staging/stack/.env`: URL pública de autenticação e redirecionamento.
- Backup pré-alteração: `/opt/planeje-staging/private/domain-before-20260916T122808Z`.

O cadastro público está desabilitado. O SMTP de testes está desabilitado; recuperação de senha e convites por e-mail não entregam mensagens. Integrações externas e notificações seguem bloqueadas. A aplicação exige login com conta já presente na base de testes.

## Imagens da base de teste

Em 16/09/2026, as URLs públicas do Storage copiadas da produção foram ajustadas na base isolada para `https://app.planeje.online/storage/v1/object/public/` em `profiles.avatar_url` (4), `clientes.logo_urls` (36), `cliente_briefings.respostas` (4), `client_checklists.items` (4) e `public_config.value` (1). Os arquivos dos avatares e logos já estavam no volume de Storage do teste; a imagem de boas-vindas do diagnóstico foi copiada para o bucket público `diagnostic-images` do teste. Backups dos registros anteriores estão em `/opt/planeje-staging/private/image-urls-before-20260916.sql` e `/opt/planeje-staging/private/remaining-image-urls-before-20260916.sql`. O Nginx do teste aceita uploads de até 25 MB.

Em futuras restaurações da base, reescrever apenas URLs de objetos que estejam presentes no Storage isolado. Fotos remotas do WhatsApp (`pps.whatsapp.net`) não fazem parte desse Storage e algumas URLs antigas já retornam 403; não ampliar o CSP para esses links sem tratar expiração e privacidade.

Checagens: `docker compose -f /opt/planeje-staging/edge/compose.yaml ps`; `curl -I https://app.planeje.online`; `curl https://app.planeje.online/_staging/health`; `docker ps --filter name=planeje-staging`.

Para retirar o domínio do ar sem afetar o túnel: `cd /opt/planeje-staging/edge && docker compose down`; em seguida fechar 80/443 no UFW. Para retornar por completo à origem exclusiva `localhost`, restaurar os arquivos do backup, reconstruir `dist` com `infra/build.env` e recriar somente os serviços de autenticação/gateway do staging.
