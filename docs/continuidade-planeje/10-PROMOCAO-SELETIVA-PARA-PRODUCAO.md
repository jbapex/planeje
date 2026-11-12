# Promoção seletiva para produção — implantação de 16/09/2026

<!-- traffic-production-20260918:start -->
## Tráfego publicado na produção — 18/09/2026

Josias autorizou: “subir para o ambiente real, essas mudanças em tráfego”. Rotina semanal, tabela por campanha/conjunto, colagem, navegação por teclado, histórico e revisão/otimização independentes estão na produção [Rotina semanal](https://planeje.jbapex.com.br/?traffic=964c2d76#/paid-traffic/rotina).

Bundle desta entrega: `assets/index.964c2d76.js`; CSS `assets/index.1677bef5.css`. Dados, pessoas, senhas, configurações e integrações reais foram preservados. Nenhum registro ou responsável do teste foi importado. Recorrências chegam desativadas e são configuradas explicitamente por cliente; abrir a grade não cria tarefa, salvar é a criação explícita.

**Fase 7 permanece parcial.** Esta publicação supera as pendências anteriores de promoção deste recorte de tráfego; os registros de 17–18/09 sobre “somente staging” descrevem o estado anterior. Aceite geral de uso, restante da fase 7 e fase 6 permanecem pendentes. Outros trabalhos de Rastreamento/CAPI conservam suas próprias evidências e pendências.

Ver [promoção do tráfego](referencias/fase-7-promocao-trafego-2026-09-18.md) e [release de produção](evidencias/releases/trafego-producao-2026-09-18.json).

Promoção de tráfego separada da implantação de fases 1–5 em 16/09. Foram aplicadas somente cinco novas migrações e 21 arquivos de código/testes/SQL, com frontend próprio de produção e troca atômica do index. Nenhuma migração de fases 1–5 foi reaplicada; nenhum perfil foi ativado nesta entrega.
<!-- traffic-production-20260918:end -->

Atualização em **16/09/2026**. Josias autorizou por **“vamos atualizar”** promover as fases 1–5 e selecionou **funções, fluxos, prazos, planejamento e modelos de onboarding do teste, conferindo pessoas**. Dados/credenciais reais são preservados. Fases 6–7 seguem planejadas; autorização de produção não declara aceite geral de uso.

**Estado: implantação concluída em 16/09/2026, 23:26 UTC / 20:26 de São Paulo.** O SSH foi recuperado após liberação da chave local pelo usuário. A ativação dos três perfis foi autorizada explicitamente: “Ativar os três perfis e manter os responsáveis do teste.” Banco/frontend e código foram atualizados; evidência real está no release JSON.

## Ambiente e pacote

- Teste: `root@2.25.216.103:/opt/planeje-staging/source`, `https://app.planeje.online`.
- Produção: `root@72.60.14.109:/root/planeje`, `https://planeje.jbapex.com.br`; frontend `/var/www/planeje`; Supabase local `/opt/supabase-planeje`.
- Candidato: `/root/planeje-releases/phase1-5-20260916/candidate/source`, completo, montado sobre o working tree de produção com entregas selecionadas sobrepostas. 99 arquivos de `src` diferem; módulos de tráfego já existentes permanecem iguais. Não usar HEAD sozinho, reset ou clean.
- Preservados do destino: `.env.production`, `src/lib/customSupabaseClient.js`, `supabaseFunctions.js`, `mcpUserTokenClient.js`, `index.html`, arquivos públicos e serviços reais. Não copiar o client isolado ou credenciais/bloqueios do staging; não substituir MCP, briefing ou Edge Functions nesta implantação.

## Configuração selecionada

| Item | Pacote |
| --- | --- |
| Funções | Dez, oito ativas e duas antigas inativas. |
| Fluxos | Conteúdo — Arte e carrossel; Conteúdo — Vídeo e reels. |
| SLAs | Briefing 2 dias úteis; roteiro 2; revisão de roteiro 1; revisão final 1; validação 1; envio ao cliente 1; agendamento 1. Produção/gravação/edição usam compromisso próprio quando definido; espera do cliente não usa SLA interno. |
| Planejamento | Automático ligado desde outubro/2026; no mês anterior, iniciar 10, plano pronto 15, reunião/aprovação 20, primeira semana pronta 28. |
| Onboarding | Entrada de cliente: objetivos/escopo 2 dias, informações/acessos 3, organizar operação 2, confirmar início 2. Sem iniciar clientes automaticamente. |
| Automações | Treze regras congeladas; antigas coincidentes preservadas e pausadas para não duplicar atribuições. |
| Capacidade | A única amostra do teste não será importada. |

Clientes, contratos, tarefas, projetos, planos, publicações, mensagens, anexos, Auth e histórico vêm da produção. Não importar execuções ou conteúdo de teste. Escopo inicial novo deriva dos contratos reais do destino. `candidate/settings.json` é privado e não entra neste pacote documental.

### Equipe conferida e decisão aplicada

| Pessoa | Perfil real atual | Função selecionada |
| --- | --- | --- |
| Josias BF | Ativo, superadmin | Validação interna |
| Poliana Geffer | Ativa, admin | Planejamento/briefing e revisão interna |
| Jheimisson Ray De Sousa Lima | Ativo, colaborador, após autorização | Design, aprovação com cliente e postagem |
| Gabriel Moraes | Ativo, colaborador, após autorização | Roteiro e gravação |
| Samuel Bonfim | Ativo, colaborador, após autorização | Edição |

As cinco identidades foram conferidas por ID/e-mail Auth. Não foram criados usuários nem trocados senhas, papéis ou permissões. O usuário autorizou ativar os perfis de Jheimisson, Gabriel e Samuel; verificação posterior confirmou os três ativos e com papel colaborador. `candidate/settings-validation.json` registra a autorização. Referência histórica a pessoa ausente permanece apenas em duas regras inativas; não virou integrante ativo.

## Backups privados e cópia sem rede

Na produção, `/root/planeje-releases/phase1-5-20260916/before` contém `database.dump`, `roles.sql`, `source.tgz`, `frontend.tgz`, `nginx.tgz`, `storage.tgz` e manifesto de hashes. Permissões privadas; valores não devem ser impressos. Dump/catalogue e tars foram verificados. Os arquivos físicos do Storage tiveram catálogo validado; restauração completa desse serviço não foi ensaiada.

Dump e roles foram transferidos diretamente entre VPS para `/opt/planeje-staging/private/promotion-phase1-5-20260916/production-before`. Restauração completa passou no container `planeje-production-rehearsal-20260916`, imagem `supabase/postgres:17.6.1.136`, **sem rede/portas**, cron desligado. Essa cópia separada já recebeu as migrações; não reaplicar cegamente nem restaurar sobre o staging em uso.

Fotografia real do backup: 43 clientes, 1.278 tarefas, 24 projetos, 12 planos, 24 perfis, 27 usuários Auth, 1.309 anexos e 31 checklists. Contagens não são metas a restabelecer por exclusão.

## SQL e evidência

`candidate/promote.sql` agrega **29 migrações e configuração selecionada em uma transação**, com `ON_ERROR_STOP`, lock timeout e advisory lock. `migration-manifest.json` lista arquivos e hash: `5cb270500befe0ca4eab32a94ec3cd37cbb3440cbedc88fc83c43065be90541b`.

Antes/depois foram comparadas quantidades e hashes dos valores de todas as colunas originais em **109 tabelas existentes**. Colunas novas de metadados ficam fora dessa igualdade; status/automações são exceções da configuração escolhida, e perfis permitem somente as três ativações propostas. Auth e catálogo Storage permaneceram iguais. Erro aborta integralmente.

O webhook de tarefas `notificacao-tarefa` é suspenso apenas dentro da transação durante o backfill e reabilitado no final; não imprimir sua definição privada. Atualização de metadados não deve gerar notificações externas. Serviços produtivos permanecem preservados.

- **118/118 testes Node passaram** no Node 20 do destino; log `candidate/node-tests.log`.
- Build Vite de produção passou; conexão real preservada e HTML/JS sem origens/bloqueios de staging. `candidate/build.log` e `bundle-validation.json`.
- Candidato: `assets/index.268432b5.js`, SHA256 `f552d504b302c591c5e505a6f79e34618cf028ebb6938ec6894acde416a3bb8e`; CSS `assets/index.f07a208f.css`.
- Ensaio SQL passou em **54,07 segundos**, incluindo verificação dos dados originais.
- `agencyContentFlow.acceptance.sql` passou: prontidão/aprovação de plano, tarefa única, comprovante, atraso/justificativa, revisão/SLA, espera do cliente, evidência por canal, conclusão e relatório preservado.
- `clientOnboarding.acceptance.sql` passou: ACL, snapshot, uma tarefa atual, avanço ordenado/idempotente, prazo ao ativar, sincronização, conclusão e gates de conteúdo preservados.

Testes SQL executados sob identidade autenticada, com cliente próprio e rollback, **somente na cópia sem rede**. Nenhuma fixture foi criada em produção real ou na homologação usada pelo usuário. Evidência não equivale a auditoria completa do legado nem aceite geral de uso.

## Aplicação realizada e verificações

1. Backup privado atualizado em `before-apply-20260916T232440Z`; arquivo de fonte/nginx do backup inicial `before` preservado. Código produtivo foi comparado e não tinha novas alterações desde a preparação.
2. SQL exato ensaiado aplicado como `supabase_admin` em `supabase-db`, numa transação, em 45,06 segundos. PASS de preservação em 109 tabelas; ativação somente dos três perfis autorizados, senhas/papéis Auth intactos. Webhook legado reabilitado ao final.
3. Assets novos instalados conservando anteriores; índice trocado atomicamente. 221 arquivos selecionados de código/tests/migrações/documentação instalados sem reset/clean, preservando ambiente, clients produtivos e serviços reais. Nenhum MCP/briefing/Edge Function foi substituído ou reiniciado.
4. Antes/depois iguais: 43 clientes, 1.278 tarefas, 24 projetos, 12 planos, 27 usuários Auth, 1.309 anexos, 31 checklists. Onboardings iniciados automaticamente: zero.
5. HTTP 200 para índice/JS/CSS/Auth health; SHA do JS correto; Supabase healthy. Dez funções/oito ativas, dois fluxos ativos, um modelo, planejamento desde outubro/2026 confirmado. ACL nova mantém anon sem iniciar onboarding, authenticated sem insert direto nem acesso ao schema privado.
6. Navegador exibiu login e carregou `index.268432b5.js`. Não foi feita jornada autenticada real nem reset de senha; essa revisão de uso será acompanhada com o usuário.
7. Documentação, release e pacote portátil atualizados. `app.planeje.online` permanece teste; `planeje.jbapex.com.br` é produção.

Ver [manifesto](evidencias/releases/producao-fases1-5-2026-09-16.json) e [verificação real](evidencias/verificacao-producao-2026-09-16.json). Não reexecutar o instalador: objetos já estão presentes e `deployment-result.json` marca conclusão. Uma futura reversão/migração deve considerar gravações posteriores.

## Retorno que preserva novas gravações

Antes do COMMIT, falha reverte a transação inteira. Na publicação visual, recuperar o índice anterior do backup, preservando banco/assets; uma volta visual não desfaz os gates novos do servidor. Após retomar uso, preferir correção/reversão seletiva fundamentada; **não restaurar dump completo automaticamente**, pois perderia novas gravações. Não declarar recuperação de toda a stack ensaiada apenas por haver tars.

Ver [estado](01-ESTADO-ATUAL.md), [validação](06-VALIDACAO-E-ACEITE.md) e [pendências](07-PENDENCIAS-E-PROXIMOS-PASSOS.md).
