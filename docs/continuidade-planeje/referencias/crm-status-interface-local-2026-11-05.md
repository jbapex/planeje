# CRM Ápice: conexão e sincronização no Rastreamento

**Atualização posterior:** publicação e ativação autorizadas com “pode” e concluídas em05/11,17h18. [Estado produtivo, ajustes de runtime e evidência](crm-status-interface-producao-2026-11-05.md). O registro abaixo descreve a entrega local anterior.

## Estado

Entrega local de05/11/2026, após Josias aceitar o bloco simples em Integrações com “vamos fazer isso”. Não publicada, sem migração ou status aplicado em produção. Complementa e substitui o procedimento operacional da candidata de02/11; a simulação histórica continua sendo somente evidência daquela data.

## Experiência

Rastreamento > Integrações > CRM Ápice, na loja selecionada. Superadmin ativo informa endereço e chave, clica Testar conexão e confere o nome da organização retornada. Só então Ativar sincronização fica disponível. A mesma área oferece Pausar, Sincronizar agora, Última sincronização, contagens e indicação de erro/indisponibilidade.

A chave salva nunca retorna ao navegador. Trocar dados invalida o teste e pausa a configuração. Trocar loja desmonta o formulário; respostas atrasadas não preenchem outra loja. O teste aguarda o worker e não é apresentado como concluído no clique. A atualização continua usando o campo CRM-Apice na coluna Etiqueta, sem mover cartões internos.

## Arquivos e contrato

- `RastreamentoCrmApice.jsx`: formulário e estado; `RastreamentoIntegracoes.jsx`: import, atalho e card com key por cliente.
- Migração nova `20261105190000_crm_apice_sync_control.sql`: configuração e heartbeat privados, RLS/revokes, RPC restrita a superadmin ativo, segredo omitido das respostas e versão por alteração.
- `control.py`: atende um pedido ou loja elegível por execução; reaproveita `sync.py`, comparação de telefone/status e escrita transacional. Configuração/revisão/enabled são travados e revalidados no mesmo bloco dos status.
- API de origem acrescenta o nome da organização. Cada função continua restrita à organização configurada pelo administrador. Conectar outra organização exige provisionamento inicial de URL/chave na origem.
- Timer verifica pedidos após10s de inatividade; cada loja ativa espera cerca de um minuto após sua execução. Heartbeat/recuperação5min; serviço240s; escrita25s no servidor. A fila soma tempo ao intervalo.

O JWT anon do CRM fica em arquivo root0600; URL/chave da loja ficam na tabela privada. URL de origem restrita ao host conhecido e rota de exportação; redirecionamento recusado. CLI antigo de aplicação não deve rodar em paralelo nem contornar Pausar. Não há novas dependências do produto ou mudanças em package/lock.

## Evidência

Passaram5 testes Node de origem,18 testes Python,53 verificações de PostgreSQL descartável e22 verificações do componente React em memória. Total98. A fixture SQL aplica a migração real e executa o worker real com transporte local; cobre usuário ausente/incorreto/inativo, segredo privado, fluxo teste/ativa/aplica/pausa, idempotência, revisão obsoleta, mudança de conexão, rollback e logs.

O teste React usa React18.2/react-test-renderer18.2 somente em diretório temporário de QA. Cobre estado pendente, segredo apagado após salvar, ativação/pausa, erro/offline, troca de cliente, requisição longa, timeout e resposta tardia. Não abre navegador ou rede. Revisão independente encontrou polling sobreposto que descartava respostas lentas: reprodução RED, guarda de uma leitura em voo, prazo20s e abort corrigidos; revisão encerrada sem achados materiais abertos.

Lint dos dois JSX passou sem avisos. `npm run build:check` final passou em20,24s, com saída temporária removida; não promoveu dist/ZIPs. Hashes locais da entrega registrados em `.local/crm-status-sync/interface-manifest.json`. Relatório de revisão privado em `/tmp/planeje-crm-ui-review-2026-11-05.md`, modo0600.

## Limites e publicação

O navegador local foi recusado pela configuração do Codex. Não houve contorno por Playwright/OS; layout desktop/celular, teclado e uso visual ainda não foram conferidos em navegador. Prévia isolada em [localhost4383](http://127.0.0.1:4383), enquanto o processo local estiver ativo. Iniciar com o comando no [README operacional](../../../scripts/crm-status-sync/README.md).

Gateway novo, Deno instalado, systemd real e escrita produtiva não foram validados. Publicação específica deverá incluir migração nova uma vez, API na final87, worker/units na final109 e frontend sobre a release vigente. Configuração começa desabilitada; validar autenticação, heartbeat, loja identificada e simulação antes da atualização inicial autorizada. Aceite humano continua separado.

Planejamento: [spec](../../superpowers/specs/2026-11-05-crm-status-interface.md) e [plano](../../superpowers/plans/2026-11-05-crm-status-interface.md). Instalação e recuperação detalhadas no README operacional; preservar dados recebidos e alterações concorrentes.
