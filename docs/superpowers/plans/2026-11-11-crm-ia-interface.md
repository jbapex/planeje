# CRM IA — revisão estrutural da interface

Execução do pedido atual com Ponytail full, Superpowers de desenho/plano/TDD/revisão e workflow de agentes paralelos para os dois domínios independentes de interface. Modelo, provedor e autenticação da sessão preservados. [Desenho e aceitação](../specs/2026-11-11-crm-ia-interface-design.md).

## Responsabilidade e arquivos

- Coordenador: `CrmIa.css`, `CrmIaWorkspace.jsx`, `CrmIaConversations.jsx`, `CrmIaConversationContext.jsx`, `CrmIaLeads.jsx`, `CrmIaNotificationFeed.jsx`, `CrmIaPrimitives.jsx`, testes existentes de contrato/controles, fixture se necessário, continuidade, configuração/Git/publicação. Um escritor por arquivo.
- Painel: `CrmIaOverview.jsx`, novo `CrmIaOverview.css` e novo teste isolado `ui-overview-layout.test.mjs`. Sem CSS compartilhado ou servidor próprio.
- Configurações: somente parte de configurações em `CrmIaSettings.jsx`, novo `CrmIaSettings.css` e `ui-settings-layout.test.mjs`; preservar export/modelos. Sem CSS compartilhado ou servidor próprio.
- Revisores: somente leitura depois do congelamento; nenhuma operação produtiva ou navegador compartilhado.

## Etapas

- [x] Revalidar release/checkout, observar a referência e confirmar sobrescrita da paleta do CRM. Bases exatas privadas preservadas antes de editar.
- [x] Painel: observar teste relevante falhar, reorganizar com dados reais disponíveis e testar links/recorte/zero/ausência; entregar hashes e limites.
- [x] Configurações: observar teste falhar, agrupar e refinar seções, preservar attendance completo nas respostas rápidas, URL/versão/ACL; entregar hashes e limites.
- [ ] Coordenador: herdar lateral compartilhada, refinar inbox/lista/histórico/contexto/fila e adaptação móvel, preservando seleções e contratos de canal/conta.
- [ ] Integrar, revisar diff exato e executar conjunto de interfaces + regressões pertinentes, lint/contexto e build/check proporcional. Conferir teclado e quatro larguras em prévia isolada.
- [ ] Revisões independentes, candidata com fontes/perfil vivos e publicação já autorizada, condicionada aos gates; com somente a17ª migration de leitura, sem runtime/restart. Conferir HTTPS, serviços e as telas reais.
- [ ] Atualizar continuidade e matriz com evidência e limites; retomar homologação real e os demais itens da meta integral.

Comandos: `node --test --test-concurrency=1 scripts/crm-ia/ui-*.test.mjs scripts/crm-ia/preview-*.test.mjs`; lint dos arquivos afetados; `npm run verify:context`; `npm run check` e build produtivo na candidata. Sem banco/rede real nos testes. Não publicar arquivos canônicos existentes fora do manifesto por glob; preservar alterações locais de outros trabalhos.

## Ampliação explícita do pedido

- [x] Avatares CRM/CS gerados e copiados para o projeto, cores individuais e menus compartilhados integrados; Gestor original preservado.
- [x] Autoria e fotos modeladas por prova, migration17 e teste isolado com RED/GREEN8/8;16SQLanteriores imutáveis.
- [x] Cabeçalho conforme captura do ScaleOS, ações visíveis, ficha canônica em colunas e histórico incremental; RED/GREEN para o burst após background.
- [ ] Revalidar reparos da revisão independente, foco/scroll/avatares no navegador e hashes finais.
- [ ] Preparar publicador sobre a base viva, conferir ACL/owner/serviços/perfil e migração única em transação antes da promoção do frontend.
