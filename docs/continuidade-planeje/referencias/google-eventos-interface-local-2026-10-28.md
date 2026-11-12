**Atualização de 28/10: interface publicada após autorização específica.** [Operação, verificação e limites](google-eventos-interface-producao-2026-10-28.md). O texto abaixo preserva a evidência da etapa local.

# Eventos Google: contatos e tentativas — entrega local de 28/10/2026

## Pedido e resultado

Josias relatou que a lista Google destoava da Meta, não identificava o contato e fazia um reenvio parecer uma conversão duplicada, mantendo erros antigos na lista. A interface agora reutiliza os cartões, métricas, filtros, tabela, cartões móveis e paginação já existentes na Meta. Nome personalizado e telefone permitem abrir a ficha existente. O resultado atual ocupa uma linha; tentativas anteriores e erros técnicos ficam no histórico.

## Contrato e escopo

- Identidade de apresentação: cliente, GCLID integral, evento normalizado (Lead/LeadSubmitted) e ação de conversão. Identidade incompleta fica separada, sem associação por suposição. IDs repetidos do mesmo registro não contam duas vezes.
- Sucesso confirmado prevalece sobre erros posteriores. Sem sucesso, uma tentativa ativa ainda não substituída por retryOf prevalece; caso contrário, vale a tentativa mais recente. Os contadores usam esses resultados, não a quantidade de linhas do log.
- Nome/telefone vêm dos IDs armazenados em qualquer tentativa do grupo. Consultas de contatos/leads usam cliente_id explícito em lotes de 100, com fontes independentes em paralelo. Identidades divergentes não escolhem um contato silenciosamente; falhas parciais preservam os eventos com aviso.
- Reenvio usa apenas o registro atual e mantém o contrato action/clienteId/eventId. Um ref bloqueia clique repetido imediatamente; ações são liberadas após reler o estado. Atualizar/período durante a chamada usa a função de carga vigente. Respostas antigas não substituem outro cliente; leitura com erro fica visível e bloqueia ações sobre resultado desatualizado.
- Histórico e totais abrangem somente as tentativas carregadas no período escolhido, até 500. Ao exceder o limite, a tela avisa e orienta reduzir o recorte. Isso não é um histórico global completo; não apagar falhas nem executar backfill para limpar a lista.
- Em processamento significa recebimento pelo Google, não confirmação de atribuição na campanha. Envio legado bem-sucedido é identificado como registro da integração anterior.

Produto alterado: RastreamentoEventosGoogle.jsx, novo RastreamentoGoogleEventHistory.jsx, helper rastreamentoEventosGoogle.js e estilos Google no RastreamentoHub.css. Meta reutilizada sem alteração de comportamento. Nenhuma dependência, esquema, RLS, payload de envio, autenticação ou configuração produtiva alterados.

## Verificação

Baseline exato dos arquivos sujos preservado em .local/google-events-ui-20261027/baseline e baseline.json. Testes puros ficaram RED para agrupamento ausente antes do reparo. A fixture real da interface ficou RED antes do novo título/fluxo e reproduziu RED no refresh durante a chamada; ambos passaram após os reparos.

Comandos dirigidos aprovados:

- node scripts/googleConversions.test.mjs — identidade, grupos, prioridade, retryOf, conflitos, contagem e imutabilidade.
- node scripts/googleDataManager.test.mjs — 48 casos do handler sem transporte real.
- node scripts/googleConversionsClient.test.mjs — 5 casos do consumidor isolado.
- node scripts/rastreamentoEventosMeta.test.mjs.
- node scripts/leadIdentity.test.mjs — 6 casos; rastreamentoLeadFicha.test.mjs e rastreamentoLeadConversa.test.mjs.
- scripts/google-conversions-preview/verify.cjs com Playwright/Chrome locais na porta 4357, rede externa recusada. Cobre sete tentativas/quatro eventos, contato vindo da tentativa anterior, ficha com cliente correto, histórico sem ações antigas, diagnóstico respeitando backoff, sucesso prevalecendo, clique duplo com uma chamada, refresh durante a chamada, filtros,320/390px sem overflow, falha parcial, refresh com erro, resposta/enriquecimento tardios, limite 500 e paginação.
- npm run check: contexto, harness, lint/tipado, tipos, regras, testes locais e build temporário. Avisos legados continuam visíveis; check não é auditoria completa do produto.

A prévia substitui apenas a fronteira da ficha por um componente fictício, para conferir IDs/cliente sem API real. Regressões puras da ficha existente passaram; esta tarefa não certifica sua navegação produtiva autenticada. Context7 consultado para React 18 sobre cleanup de efeitos e respostas assíncronas obsoletas; não adotados APIs React 19/Next/RSC.

## Estado e limites

IMPLEMENTADO LOCALMENTE. Revisão sensível independente com delta exato: achado de refresh durante a chamada corrigido e retestado; encerrada sem achados abertos; hashes na [evidência local](../evidencias/google-eventos-interface-local-2026-10-28.json). Capturas fictícias do computador, celular e histórico ficam em .local/google-events-ui-20261027. Relatório privado em /Users/josiasbonfimdefaria/.codex/security-reviews/planeje-google-events-ui-20261028-yhgwoe81/differential-review.md. Sem publicação, migração, replay real, consulta Google real ou aceite de Josias nesta tarefa. A autorização anterior cobria apenas a correção eventSource e um evento específico; uma futura publicação desta interface requer autorização específica e candidata herdada da release vigente, nunca o dist antigo da raiz.
