# Rastreamento: conversas por conta e Mini CRM publicados

Publicado em **06/11/2026, 12h35, America/Sao_Paulo**, na VPS72.60.14.109. Josias autorizou com “pode sim”, em resposta à publicação concreta da prévia4385. [Entrega local e limites](rastreamento-conversa-canais-local-2026-11-06.md) · [Recibo produtivo sanitizado](../evidencias/releases/rastreamento-conversa-canais-producao-2026-11-06.json).

## Uso

[Rastreamento > Leads](https://planeje.jbapex.com.br/?v=9e73612f#/rastreamento?aba=leads). Abrir a ficha do contato. A conversa inicia em **Todos os canais**, com a conta identificada em cada mensagem e filtros por conta. Conta sem histórico gravado tem zero e mensagem explícita. A lateral mostra o resumo somente leitura do Mini CRM com campos e rótulos da loja. O editor original dentro do Mini CRM continua preservado.

Até 120 mensagens carregadas por canal. Não foi implementada busca retroativa no provedor nem backfill. No contato apresentado, a leitura anterior encontrou oito recebidas e seis enviadas na conta impacto, sem histórico na Amanda pelos identificadores conhecidos. Registros antigos sem whatsapp_config_id continuam agrupados pelo provedor disponível; não se adivinha a conta.

## Release e fonte atual

Release: `/root/planeje-releases/rastreamento-conversa-canais-20261106-01`.
Candidata: `/root/planeje-releases/rastreamento-conversa-canais-20261106-01/candidate`.
Base anterior: `crm-status-interface-20261105-01`, com1.797 fontes. Perfil `.env.production.local` herdado somente dentro da VPS, sem copiar credenciais para a máquina local. Node20.19.1 e dependências existentes preservados.

Quatro fontes promovidos: `src/lib/rastreamentoLeadConversa.js`, `src/components/crm/RastreamentoLeadFicha.jsx`, `src/lib/rastreamentoMiniCrmResumo.js` e `src/components/crm/RastreamentoMiniCrmResumo.jsx`. Dois novos, totalizando **1.799 fontes** conciliados no manifesto. CSS fonte não alterado. Arquivos de teste ficaram na candidata para QA e não foram promovidos ao diretório de trabalho.

Build produtivo:4.079 módulos,1m06s,12 artefatos. Atual: `index.9e73612f.js`, CSS `index.80eb966f.css`. HTML SHA256 `224181edd893dceedc62732a42a64826999385c41bba88ba685a76f07929707b`. Assets anteriores, inclusive `index.f2a5053c.js`, preservados. Futuras publicações devem herdar candidata/manifestos/perfil desta release ou de sucessora verificada; não usar o dist antigo da raiz nem bundle da prévia.

## Verificações

- Pacote confere com os quatro hashes da revisão independente sem achados abertos. Baseline e concorrência conferidas antes/depois do build e da promoção.
- 24 testes do publicador passaram localmente e naVPS: recuperação após falha, preservação de alteração concorrente, manifestos, novos arquivos e modos.
- Sete scripts executados na candidata com Node20/tsx: dois novos e regressões conversa, Meta, ficha, Mini CRM e histórico de origens. Todos passaram. QA local anterior incluiu cinco testes Node e14 checks React.
- Build e marcadores das funcionalidades anteriores/novas conferidos; ausência de marcadores de fixtures no bundle. Perfil preservado.
- Cinco verificações HTTP200/hashes: home, JS novo, CSS, JS anterior e escritório Atlas. Todos os artefatos atuais e anteriores conferidos no disco.
- Cinco serviços Atlas ativos; units/drop-ins, diretórios, início dos serviços, runtime Edge, início do container, MCP/PM2 e arquivos/timer do sincronizador preservados. Sem restart.
- Impacto continua usando o endpoint `planeje-status-export-connect`, ativa e sem erro, com sucesso recente confirmado após a publicação. Não houve troca de chave ou alteração da conexão.

Não houve migração, alteração de esquema, escrita em dados operacionais, conversão Meta, mensagem, publicação em redes ou chamada de IA. As consultas SQL de verificação foram somente leitura; a indicação no recibo `no_sql` refere-se à ausência de SQL aplicado à publicação.

## Dados e permissões

A conferência administrativa confirmou duas contas, dados Mini CRM disponíveis e ausência de configuração Mini CRM salva para a Impacto. Esse caso usa o modelo por nicho já existente; o fallback de loja de noivas sem configuração foi também verificado com fixture, incluindo rótulo Consultora e data.

Uma tentativa de leitura sob papel authenticated, com somente o identificador do administrador, retornou zero linhas: a política existente exige sessão viva além do perfil ativo. O código de `private.planeje_approved_access`/`planeje_live_session` confirmou essa causa. Nenhuma política foi alterada e nenhuma sessão foi criada, simulada com ID real ou falsificada para contornar a restrição. Portanto, essa tentativa **não equivale a uma leitura autenticada real no navegador**. O frontend mantém o cliente Supabase da sessão normal e todos os filtros existentes de cliente/contato.

Navegador desabilitado pelas configurações do cliente nas etapas anteriores; não contornado. Layout, foco, scroll, leitura na sessão do usuário e aceite humano permanecem pendentes. Testes em memória e HTTP não substituem essas verificações.

## Recuperação

Não repetir o publicador. Recibos `published.json`, `verification.json`, `data-read-verification.json`, manifestos e backups `before/` permanecem privados na release. Se houver problema, comparar hashes e reverter somente os quatro fontes/HTML desta entrega, preservando alterações concorrentes e assets. Não tocar no banco, worker, CRM87 ou chaves. Recuperação produtiva exige autorização atual conforme o escopo do incidente.
