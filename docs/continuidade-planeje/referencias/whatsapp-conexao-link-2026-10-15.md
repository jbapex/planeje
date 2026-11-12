# Conexão do WhatsApp por link — 15/10/2026

Josias pediu um botão em Rastreamento → Integrações para enviar ao responsável uma página com QR code ou conexão por código usando o número. A implementação foi publicada após recuperar o acesso SSH e concluir a auditoria de permissões.

## Fluxo publicado

- Em cada instância Uazapi, administradores veem **Gerar link de conexão**. O diálogo permite gerar/copiar/abrir e revogar. Gerar outro link desativa o anterior. Consultar o diálogo não inicia conexão.
- O cliente abre `#/conectar-whatsapp/<token>` sem login no painel e escolhe QR code ou Pelo número. A conexão só começa ao clicar no botão; prévias automáticas de links não iniciam pareamento.
- Pelo número: telefone internacional com país e DDD; código exibido com botão Copiar e instruções de Aparelhos conectados. A página consulta status enquanto aguarda e pausa consultas automáticas quando fica oculta.
- A conexão existente é reaproveitada. Nenhum endpoint de desconectar, excluir instância, enviar mensagem ou alterar webhook foi exposto. Sessão já conectada ou tentativa em andamento não é substituída.
- Confirmação válida grava o status conectado e encerra novas tentativas com o link. O cliente recebe confirmação e pode fechar a página. O link não funciona como monitor permanente nem permite reconectar depois de usado.

## Escopo e proteção

- Link aleatório de 256 bits, 24 horas, vinculado a uma única instância e cliente. Banco guarda somente SHA-256; a credencial do provedor permanece no servidor. O token da URL fica no fragmento, fora do caminho HTTP/referrer. A página informa noindex e no-referrer; respostas não podem ser armazenadas em cache.
- Gerenciamento exige Auth.getUser, conta/sessão atual aprovada, papel admin/superadmin e leitura do canal sujeita ao RLS já existente. A tabela nova tem RLS, sem políticas públicas e sem privilégios anon/authenticated. Os RPC são invoker e executáveis somente por service_role.
- O receptor público aceita apenas info/status/connect por capacidade válida, devolvendo nome do canal, validade, estado e QR/código filtrados. Não aceita IDs fornecidos pelo navegador para trocar o destino. Provedor restrito a HTTPS em subdomínio Uazapi e sem redirecionamento.
- Intervalo mínimo de três segundos entre consultas de status, um minuto entre tentativas de conexão inclusive após rotação, até 12 tentativas por link. Locks seguem canal → link para serializar rotação e consumo.
- Revogar impede novas consultas/tentativas pela URL. Um QR/código já emitido depende da expiração do provedor; revogação não desconecta uma sessão já confirmada. Outro número em uma instância já conectada exige a operação protegida de desconectar no painel.

## Validação e ambientes

- 35 verificações Node do contrato, mais o teste existente de instâncias WhatsApp. TypeScript da função compilado com dependências locais.
- 105 verificações executando o handler com SDK, GoTrue, PostgREST e banco reais do ambiente isolado da VPS 103. Provedor Uazapi substituído e rede interna bloqueia saídas. Canais fictícios removidos ao terminar; sessões de teste encerradas com escopo local. Nenhuma foto/snapshot real ou tarefa foi alterada.
- Migração `20261015045127_whatsapp_connection_links.sql`, gerada pela CLI, aplicada uma vez em `planeje-cs-db/cs_integration` e uma vez na produção `supabase-db/postgres`. Não reaplicar em nenhum dos dois bancos. Sem aplicação ao staging legado ou de SQL da Assessoria. Registro privado de execução, hash e auditoria em `production-migration.json`; a instalação não tinha schema de histórico de migrações da CLI.
- A fonte de staging continua sem o componente corrente de Rastreamento. A base produtiva foi reconciliada para os arquivos tocados: App e Instâncias eram idênticos aos locais antes desta mudança. Candidata isolada criada da fonte atual `/root/planeje`, sem incluir as mudanças locais de Assessoria.
- Build completo passou: `index.95e6d883.js` / `index.c1a42de6.css`. Chaves embarcadas somente anon. A função nova fixa supabase-js@2.30.0, versão utilizada pelo teste. O hash do entrypoint foi reconciliado no manifesto antes da publicação; fontes e funções publicadas conferem com todos os dez hashes da candidata.
- Navegador: diálogo, geração de link fictício, QR, telefone inválido, código, conclusão simulada, URL inválida e celular 390 × 844 sem overflow. Não foi lido QR real nem pareado aparelho real.
- Documentação atual da Uazapi confirma POST /instance/connect sem phone para QR e com phone para paircode; GET /instance/status acompanha o pareamento e não se deve reiniciar uma tentativa em andamento. Changelog Supabase consultado; alteração TLS de outubro não afeta self-hosted. Sem upgrade de dependências do aplicativo.

## Publicação e conferência

Em 15/10, Josias pediu nova tentativa e o SSH voltou nas duas VPS. Base produtiva, índice anterior, dez hashes da candidata e ausência dos objetos novos foram reconferidos antes de aplicar. O backup do índice e dos dois arquivos existentes permanece na release privada, junto ao schema anterior do canal; nenhuma restauração de dados foi realizada.

A migração nova foi aplicada atomicamente, com guarda de ausência, timeout e auditoria: RLS ligada, anon/authenticated sem privilégios, tabela sem políticas públicas, funções invoker com search_path vazio e EXECUTE somente service_role. A tabela permaneceu vazia após a verificação; nenhum link real foi emitido.

Publicados somente a função `whatsapp-connection` e seus dois módulos novos no volume de funções; reiniciado apenas `supabase-edge-functions`. POST público com token inexistente/malformado retorna 410, gerenciamento anônimo 401 e conclusão pública 400; CORS e no-store conferidos. Esses testes não consultam o provedor real.

Frontend publicado por troca atômica do índice, preservando todos os assets anteriores. Índice e quatro assets novos/anteriores passaram por HTTP e conferência exata de bytes. Navegador autenticado confirmou botão e diálogo no cliente aberto, consulta sem erro e botão habilitado; a página externa abriu o estado inválido sem o menu interno. A captura privada recorta somente o diálogo, sem credenciais ou URLs de webhook ao fundo. Geração/QR/código/conclusão foram testados com dados fictícios, não com aparelho real.

Produção: `index.95e6d883.js` / `index.c1a42de6.css`; conserva `index.47519cec.js` / `index.2731d631.css`. [Abrir Integrações](https://planeje.jbapex.com.br/?v=95e6d883#/rastreamento?aba=integracoes).

Release privada: `/root/planeje-releases/whatsapp-conexao-link-20261015-01`, com before, candidate, build.log, verification.json, production-migration.json e evidências HTTP. Teste isolado: `/opt/planeje-whatsapp-connect-20261015`, relatório de 105 verificações. Capturas privadas locais em `.local/whatsapp-connect-20261015`.

Nenhuma conexão de aparelho real iniciada, tarefa ou histórico alterado, mensagem WhatsApp/CAPI/e-mail enviada ou credencial do canal modificada. Atlas continua `monitor_enabled=false`; o escritório Atlas e CS/Assessoria continuam não publicados e devem incorporar esta revisão no próximo candidato. Aceite de uso e confirmação com aparelho real permanecem pendentes; não gerar link, reiniciar pareamento ou desconectar número real como teste automático.

[Manifesto](../evidencias/releases/whatsapp-conexao-link-2026-10-15.json) · [Testes](../evidencias/whatsapp-conexao-link-testes-2026-10-15.json).
