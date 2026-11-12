# Rastreamento: nome de origem pelo utm_source

28/10/2026. **Entrega local concluída; publicação autorizada e verificada às 15h28.**
[Operação produtiva](rastreamento-origem-utm-source-producao-2026-10-28.md).
Josias pediu mostrar o `utm_source`, como `chatgpt.com`, em vez de `Site`
quando o contato não é atribuído a Google ou Meta.

## Comportamento e alcance

Tráfego classificado como Site mostra o primeiro `utm_source` textual não vazio,
sem espaços nas pontas. A lista consulta o campo direto e `tracking_data`;
a ficha também considera o lead vinculado. Cada entrada do histórico usa
somente a UTM daquele próprio registro, sem copiar a origem atual do contato.
UTM ausente/inválida mantém Site. Google Ads, Meta Ads, Linktree na ficha,
cores, categorias, filtros e elegibilidade de conversões seguem os contratos
anteriores. O CSV reutiliza o rótulo da lista. Leads sem contato também carregam a UTM
na projeção da tela e preservam Site/Google/Meta na exportação completa.
O serializador neutraliza prefixos de fórmula com apóstrofo e preserva
aspas, nulos e texto normal; 11 casos sintéticos cobrem esse limite.

A mudança é de apresentação. Não grava `origin_source`, não reatribui o
contato, não substitui a primeira origem nem mistura entradas do histórico.
Sem migração, consulta produtiva, recuperação ou envio de eventos.
Mini CRM já usa UTM como rótulo e não precisou de alteração.

## Implementação e verificações

`siteOriginLabel` no módulo existente de links valida somente strings e
centraliza o nome de Site na lista, ficha e histórico. Sem dependência nova.
Antes de implementar, o teste da ficha falhou como esperado: Site em vez de
chatgpt.com. Depois passaram oito scripts:

- `node scripts/contatosCsv.test.mjs`
- `node scripts/rastreamentoTrackableLink.test.mjs`
- `node scripts/rastreamentoLeadFicha.test.mjs`
- `node scripts/miniCrmOrigin.test.mjs`
- `node scripts/miniCrm.test.mjs`
- `node scripts/rastreamentoLeadAttributionHistory.test.mjs`
- `node scripts/rastreamentoPeriod.test.mjs`
- `node scripts/contatosMessagePeriod.test.mjs`

ESLint dos cinco arquivos de produto: zero erros e dois avisos já existentes
no ContatosPage (tamanho e dependência do efeito fora deste delta).
`npm run build:check` passou inicialmente em 14 segundos e foi repetido após os reparos da revisão, sem promover dist/ZIP.
Prévia com dados sintéticos em 127.0.0.1:4377 confirmou a ficha real, cabeçalho,
UTMs e histórico mostrando chatgpt.com. O mock recusa ações externas. A porta
4361 já estava ocupada por outra prévia, que foi preservada.

O CSV não foi certificado em uma planilha externa. A conferência na VPS
consta na referência produtiva acima.
Revisão independente encerrada com zero P2+ pendente; dois achados corrigidos
e retestados (projeção do lead e fórmula no CSV), nove cenários de tela/base
e 11 casos CSV. Relatório privado fora do repositório.
Fechamento da evidência registrado no diretório privado
`.local/rastreamento-utm-source-20261028`. Uma futura publicação precisa de
autorização específica e deve compor apenas este delta sobre a candidata
produtiva vigente; não promover os arquivos locais inteiros.
