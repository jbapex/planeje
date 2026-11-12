**Atualização posterior:** publicação autorizada e concluída em06/11/2026,12h35. Este documento preserva a etapa local. [Estado produtivo e operação](rastreamento-conversa-canais-producao-2026-11-06.md).

# Rastreamento: contas WhatsApp e resumo do Mini CRM

Implementado localmente em 06/11/2026, a pedido de Josias. **Não publicado.** Plano: [escopo e etapas](../../superpowers/plans/2026-11-06-rastreamento-conversa-canais.md).

## Comportamento

A ficha abre em **Todos os canais**, com mensagens em ordem cronológica e identificação da conta em cada mensagem. Botões permitem filtrar por conta; contas configuradas sem mensagens aparecem com zero e estado vazio explícito. Os botões são filtros com aria-pressed e rótulo de grupo, acessíveis pelo teclado.

Contas identificadas por whatsapp_config_id são separadas mesmo quando usam o mesmo provedor. A consulta carrega apenas id/name das configurações e mantém cliente/telefone/JID em todos os caminhos. Consultas adicionais por conta evitam que uma conta movimentada esconda a outra; no máximo cinco leituras de mensagens simultâneas. Mantém a busca anterior para registros legados. Falhas parciais preservam o histórico carregado e mostram aviso.

O limite é de até 120 mensagens carregadas por canal e está informado na ficha. Isso não adiciona paginação histórica nem recuperação de mensagens ausentes no servidor. Ingressos/Chatvolt sem whatsapp_config_id continuam agrupados pela identificação de provedor disponível; não se adivinha a conta. Nenhuma mudança em webhooks, ingestão ou banco.

A lateral exibe resumo **somente leitura** do Mini CRM: status com o nome configurado, consultora/vendedor, agendamento e horário, observações, próximos passos e campos personalizados. Reutiliza modelos, normalizadores e formatação de miniCrm.js. Qualificação e valor continuam no bloco comercial existente. Cliente e ID do contato são exigidos; sem vínculo, mostra ausência de ficha. Não procura outra pessoa por semelhança de telefone. O editor original fornecido por crmFields continua prevalecendo dentro do Mini CRM.

Trocar cliente/contato/lead/evento remonta a ficha, limpando filtros e dados anteriores. O resumo descarta respostas atrasadas, apresenta erro de leitura e permite atualizar. Conteúdo é texto escapado; não há nova escrita, chamada de IA, conversão, envio de mensagem ou alteração da integração CRM Ápice.

## Caso apresentado

Leitura agregada confirmou duas contas configuradas para a Impacto. O contato da captura possui oito mensagens recebidas e seis enviadas, todas em uma conta, e um registro com Mini CRM preenchido. Os 14 logs correspondentes são Uazapi. Não foi encontrado histórico desse contato na segunda conta pelos identificadores conhecidos. A nova tela distingue esse estado de ausência de um filtro de canal; ela não inventa a segunda conversa.

Somente contagens/metadados de diagnóstico foram consultados; nenhum texto de conversa, telefone ou credencial foi usado em fixtures ou documentação.

## Arquivos e base

Quatro arquivos de produto: `src/lib/rastreamentoLeadConversa.js`, `src/components/crm/RastreamentoLeadFicha.jsx`, novo `src/lib/rastreamentoMiniCrmResumo.js` e novo `src/components/crm/RastreamentoMiniCrmResumo.jsx`. CSS existente reaproveitado sem alteração. Sete consumidores da ficha foram inspecionados, incluindo contatos, calendário, tráfego e eventos/relatórios; assinaturas preservadas.

Baseline exata em `.local/rastreamento-conversa-canais/before/`, com hashes. Antes da entrega, os dois fontes alterados, CSS e dependência miniCrm.js foram comparados com `/root/planeje` na VPS109 e coincidem com a fonte corrente. HEAD é anterior e contém muitas diferenças preexistentes; não representa o delta desta tarefa. Pacote local em `.local/rastreamento-conversa-canais/package`, com quatro fontes e manifesto; não é um bundle para publicação direta.

## Validação

- Cinco testes Node novos: contas distintas, conta vazia, limite por conta, consultas restritas, falhas parciais, campos personalizados, datas/horário e ausência de escrita.
- 14 verificações React em memória: visão conjunta, filtros, vazio, resumo, erro/repetição, troca de contato durante resposta pendente e preservação do editor original.
- Regressões de conversa, Meta, ficha, Mini CRM e histórico de origens passaram; revisão independente executou também recuperação Chatvolt.
- Lint dos quatro fontes: zero erros; quatro avisos já presentes na baseline, sobre tamanho dos arquivos e dependências de efeitos antigos. Novos arquivos sem avisos.
- Build completo temporário passou em 14,75 s, removendo o diretório temporário. Build da prévia passou em 5,16 s. Nenhuma alteração de dist/ZIPs operacionais.
- Revisão diferencial independente sem achados acionáveis, relatório privado `/tmp/rastreamento-multicanal-review-2026-11-06.md`, modo 0600.

Context7 consultado sobre select/eq/maybeSingle e RLS. O catálogo não oferece a versão exata 2.30.0; métodos conferidos também nos testes com o SDK instalado. Não houve atualização de dependências ou uso de service_role no frontend.

## Prévia e limites

Prévia com dados fictícios: [http://127.0.0.1:4385/](http://127.0.0.1:4385/). Comando: `node node_modules/vite/bin/vite.js --config scripts/rastreamento-multicanal-preview/vite.config.mjs`. Env isolado no diretório da prévia e cliente de dados substituído por fixture em memória; nenhum transporte produtivo. HTML e módulos JavaScript conferidos por HTTP200 e Content-Type. Processo da sessão71122 ativo na entrega.

Navegador indisponível pelas configurações do cliente nas etapas anteriores; não contornado. Componentes Radix/controles comerciais são simulados no teste React, portanto ele não comprova layout, foco real, scroll ou acessibilidade visual. RLS produtivo não foi modificado nem testado com nova sessão autenticada; filtros foram verificados com SDK e transporte fictício.

Publicação e aceite humano pendentes. Para publicar, exigir autorização específica do trabalho atual, reconciliar fontes/release/perfil/concorrência na109 e construir candidata produtiva com apenas os quatro fontes. Não promover bundle de prévia, não reaplicar SQL e não alterar a conexão ativa da Impacto. Evidência: [recibo local](../evidencias/releases/rastreamento-conversa-canais-local-2026-11-06.json).
