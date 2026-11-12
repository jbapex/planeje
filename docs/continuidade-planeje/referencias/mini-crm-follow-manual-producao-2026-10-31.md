# Mini CRM: colunas manuais de follow-up publicadas — 31/10/2026

Publicado às 20h53 de São Paulo, após Josias responder “sim” ao pedido específico
de publicação na VPS. [Contrato e testes locais](mini-crm-follow-manual-local-2026-10-31.md).

Status personalizados, inclusive numerados e renomeados, mantêm o destino
selecionado no Kanban ou na grade. Somente a chave reservada `Follow Up` ativa a
cadência do sistema pela mudança de status. Sair dela para uma coluna manual
encerra o retorno e preserva o histórico. Nenhuma configuração real foi mudada.

## Composição e operação

Release `/root/planeje-releases/mini-crm-follow-manual-20261031-01/candidate`.
Somente `src/lib/miniCrm.js` e `scripts/miniCrm.test.mjs` promovidos. Baseline dos
dois arquivos exatamente igual ao estado anterior à correção local.

As 1.796 fontes foram conciliadas com o manifesto frontend da release MCP 2.9.2,
`mcp-lotes-20261030-01`. Isso conserva as alterações de Edge e as migrações já
publicadas em 30/10, sem reaplicá-las. Perfil `.env.production.local` herdado
exclusivamente da última release frontend, `rastreamento-origin-20261029-01`,
no próprio servidor. Não foi publicado o `dist` da raiz local.

Main `index.76fa74a0.js`; CSS `index.80eb966f.css` inalterado. Assets anteriores,
escritório, runtime Edge, sete arquivos da release MCP 2.9.2 e seis serviços
preservados, inclusive horários de ativação. Sem SQL, restart, envio, CAPI,
regravação de contatos ou instalação de dependências.

## Evidências

- Cinco scripts do Mini CRM e build com perfil produtivo passaram na candidata.
- 24 testes do publicador passaram localmente e na VPS; bloqueio de publicação,
  concorrência, backup e rollback condicionado ao próprio conteúdo preservados.
- 1.796 fontes, HTML, assets novos/anteriores e escritório verificados por hash;
  cinco respostas HTTP 200 com bytes esperados.
- Aba autenticada da loja recarregada: main novo, 253 leads exibidos como antes,
  status personalizados presentes e Kanban aberto, zero erros de console.
- Nenhum contato real foi movido para teste. As regressões de movimentação
  executaram o helper compartilhado com contatos sintéticos.

[Publicação](../evidencias/mini-crm-follow-manual-2026-10-31/published.json),
[verificação](../evidencias/mini-crm-follow-manual-2026-10-31/verification.json),
[MCP e serviços](../evidencias/mini-crm-follow-manual-2026-10-31/protected-verification.json),
[candidata](../evidencias/mini-crm-follow-manual-2026-10-31/qa.json) e
[navegador](../evidencias/mini-crm-follow-manual-2026-10-31/browser-verification.json).
Captura privada em `.local/mini-crm-follow-manual-release-20261031-01/mini-crm-publicado.jpg`.

## Limites e próxima operação

Não repetir o publicador. A próxima publicação frontend herda esta candidata e
seu `source-manifest-next.json`, ou release posterior, conferindo concorrência
e perfil. A configuração de automação por mensagens continua independente.

Contatos desviados anteriormente não foram reposicionados: não há evidência
segura do destino pretendido. Retornos já gravados não são apagados apenas por
carregar a tela. Celular físico e movimentação autenticada de contato real não
foram testados. Aceite de uso humano continua separado da publicação técnica.
