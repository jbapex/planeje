# Prévia isolada do CRM IA

Monta o `CrmIaWorkspace` e o `GestorIaSidebar` reais. Autenticação, módulos,
descoberta do Atlas, RPC e funções usam somente `session.js` e `fixture.js`.
Não lê `.env` produtivo, não consulta banco, não executa scheduler e não chama
provedor ou WhatsApp. O arquivo HTML restringe conexões por CSP e o entry
bloqueia `fetch`; assets e módulos vêm apenas do Vite local. Inter usa a fonte
instalada ou fallback do sistema, sem download.

```sh
node node_modules/vite/bin/vite.js --config scripts/crm-ia/preview/vite.config.mjs
```

Porta fixa `127.0.0.1:4401`, com `strictPort`. Este preparo não inicia o servidor.

Conta A: `11111111-1111-4111-8111-111111111111`. Conta B:
`22222222-2222-4222-8222-222222222222`. O seletor real troca a conta e remonta
os dados. Não se infere escritório pelo nome.

- Painel: `http://127.0.0.1:4401/#/crm-ia/painel?cliente=11111111-1111-4111-8111-111111111111`
- Leads: `http://127.0.0.1:4401/#/crm-ia/leads?cliente=11111111-1111-4111-8111-111111111111`
- Ficha: acrescente `&lead_id=51111111-1111-4111-8111-111111111111` na rota Leads.
- Conversa: `http://127.0.0.1:4401/#/crm-ia/conversas?cliente=11111111-1111-4111-8111-111111111111&contact_id=61111111-1111-4111-8111-111111111111&channel_id=71111111-1111-4111-8111-111111111111`
- Segundo canal do mesmo contato: `72111111-1111-4111-8111-111111111111`.

As dez rotas são `painel`, `funil`, `leads`, `conversas`, `agentes`, `agenda`,
`disparos`, `rastreabilidade`, `modelos` e `configuracoes`. Agentes usa `aba`
com `agentes`, `knowledge`, `products` ou `concierge`.

## Cenários

Os parâmetros de cenário ficam antes do `#`, por exemplo:

`http://127.0.0.1:4401/?estado=erro&largura=390#/crm-ia/leads?cliente=11111111-1111-4111-8111-111111111111`

| Parâmetro | Comportamento |
| --- | --- |
| Sem `estado` / `ready` | Dados sintéticos nas duas contas; autonomia desligada. |
| `vazio` | Listas sem leads, contatos, mensagens, agenda e fila. |
| `erro` | Primeira leitura de cada ação falha; atualizar recupera. |
| `erro-permanente` | Leituras recusadas continuamente. |
| `carregando` | Consulta do workspace fica pendente para inspeção do carregamento. |
| `forbidden` | Módulo CRM recusado no gate real. |
| `conta-revogada` | Bootstrap permite a seleção, mas a conta recusa a leitura. |
| `consulta` | Perfil colaborador, sem controles administrativos. |
| `leitura-lenta` | Busca inicial demora 900 ms; busca preenchida demora 40 ms. |
| `conflito` | Primeira gravação de cada ação mostra conflito de versão. |
| `nao-provisionado` | Conta A exige preparação explícita; conta B permanece preparada. |
| `sem-atlas` | Atalho e análise do Atlas ocultos. |
| `autoria-mensagens` | Contato com foto local, resposta humana com recibo exato, IA comprovada, legado e provas divergentes sem autor atribuído; 64 mensagens no canal principal. |
| `largura=320` / `largura=390` | Monta a aplicação dentro de iframe com essa largura exata. |

Também aceita `perfil=colaborador`. Alterar cenário ou recarregar reinicia os
registros da fixture. Edições persistem durante a navegação desta página.

Autoria e histórico: `http://127.0.0.1:4401/?estado=autoria-mensagens#/crm-ia/conversas?cliente=11111111-1111-4111-8111-111111111111&contact_id=61111111-1111-4111-8111-111111111111&channel_id=71111111-1111-4111-8111-111111111111`.
As fotos deste cenário reutilizam avatares locais como representações sintéticas.
O autor da mensagem é Luana de demonstração, independentemente de quem assumir
o atendimento depois. A primeira página contém 50 mensagens; Carregar mensagens
antigas recupera as 14 restantes. O segundo canal conserva somente sua mensagem.

## Operações e evidência

As operações usam as formas de resposta de `20261111041704_crm_ia_workspace.sql`
e `20261111043800_crm_ia_workspace_readings.sql`: nomes nativos, envelopes
`rows/total`, contatos/canais exatos, revisão UUID, timestamps e recibos.
Edição, movimento, arquivamento, importação, agentes, bases, catálogo, modelos,
configuração, slots, reserva e cancelamento atualizam o estado sintético.

Programar mensagem mantém `pending`, sem processo que a envie. O botão Enviar
simula somente o recibo e acrescenta uma mensagem à fixture. Testar agente
retorna texto sintético, sem chamada de IA. Os dados podem ser inspecionados em
`window.__crmIaPreview.requests` e `window.__crmIaPreview.snapshot()`.

Atalhos para Atlas e operação oficial abrem um destino de demonstração, dentro
da prévia. Nenhum desses destinos navega para produção. Disparos, Google Agenda,
áudio gerado e Inspetor conservam os limites da interface real.

```sh
node --test scripts/crm-ia/preview-contract.test.mjs
```

O teste monta o workspace real com aliases e transporte bloqueado. Confere
escopo, versões, importação idempotente, fila e recusa de reserva duplicada na
fixture. Não substitui testes PostgreSQL, transportes reais ou revisão visual
e de teclado no navegador.
