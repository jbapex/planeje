# Gestor IA — Rotina semanal publicada

Publicado em **12/11/2026, 00h43 (Brasília)**, por autorização explícita de Josias: “publicar”, após a entrega local. Release `/root/planeje-releases/gestor-rotina-20261112-01/candidate`, sucedendo `menu-categorias-20261111-01`. Publicação e validação técnica concluídas; aceite humano permanece separado.

Página: [Rotina semanal](https://planeje.jbapex.com.br/#/gestor-ia/rotina). O [contrato e a validação local](gestor-ia-rotina-semanal-local-2026-11-11.md) continuam como referência funcional. Os hashes, testes e limites estão na [evidência de produção](../evidencias/releases/gestor-rotina-producao-2026-11-12.json).

## Entrega

Entrada por cliente/semana no Gestor IA, reutilizando a planilha, as revisões e o salvamento oficiais. Campanhas, conjuntos, gasto e agendamentos mantêm o fluxo existente. A seleção de linhas abre leads ou agendamentos no painel com a ficha compartilhada. A coorte usa primeira entrada na semana de Brasília e aceita agendamento posterior.

O catálogo e o gasto consultam leituras Meta salvas. A consulta de leads exige Rastreamento, acesso ao cliente e IDs exatos; nomes não comprovam atribuição. A tela simplificada salva rascunho e preserva análise/conclusão na rotina completa. O MCP anuncia a página e reutiliza ferramentas de consulta; não foi adicionada ferramenta de escrita ou automação de mensagens.

## Composição e preservação

Nove fontes frontend, cinco novas, elevaram o manifesto de 2.144 para **2.149 fontes**. Três fontes MCP foram promovidas separadamente. Quatro arquivos de teste foram usados somente na candidata; não foram instalados nas fontes live.

O editor `TrafficWeeklyRoutine.jsx` foi composto da base produtiva para incluir apenas a rotina nova. O retorno de assessoria presente no checkout local permanece fora desta publicação e não foi removido do checkout. Das 23 dependências comparadas, 22 eram idênticas; a diferença no helper da rotina se limita à rota de assessoria e ao texto de erro, mantendo as APIs consumidas. A composição passou pelas mesmas 56 verificações React.

Perfil `.env.production.local` herdado na própria VPS; as flags de Decisões, Agenda e Agenda IA continuam `false`. Main `index.107b9551.js`, CSS global `index.2df522b9.css`, HTML SHA-256 `11e2036282d14b463e615d7abe03e5ff0dd3004dc2aaeef995953b3a4ef7d78c`. Manifesto SHA-256 `cd4225fe8e3ef9641caee52cc917514255bc27bda678c35da430921e3a136f80`.

Somente `planeje-mcp` foi reiniciado, mantendo PM2, configuração, ambiente e versão 2.9.2. Cinco serviços Atlas, Edge, runtime, worker, perfil e assets anteriores foram conferidos e preservados. A API Meta produtiva `saved-v4` foi mantida; o index Edge local antigo não foi promovido. Nenhuma migração, SQL, coleta Meta, mensagem ou chamada de IA foi executada nesta publicação.

## Verificação e operação

- Dez guardas do publicador, 60 testes Node e 75 testes MCP passaram. Catálogo com 54 abas; build Vite em 43,54s e 28 artefatos. Revisão diferencial independente sem P1/P2 pendentes, vinculada aos hashes exatos de programa, escopo, pacote e relatório.
- A preparação inicial apontava dois testes ausentes; foi interrompida antes de alterar live e corrigida. A segunda detectou um teste antigo que esperava 58 ferramentas, enquanto a baseline já tinha 59. A contraprova isolada repetiu a falha sem overlay. Somente o teste da candidata recebeu a contagem correta, preservando suas 55 asserções; allowlist e teste live ficaram intactos. A terceira preparação passou integralmente. Evidências anteriores arquivadas, sem apagar trabalho ou alterar produção para acomodar testes.
- Promoção conferiu fontes/perfil/serviços e concorrência, manteve backups e instalou assets imutáveis antes da troca atômica do HTML. O único reinício foi o MCP. Recibos e publicador ficam em `/root/planeje-releases/gestor-rotina-20261112-01`; cópia privada local em `.local/gestor-rotina-release-20261112-01`.
- **42 verificações HTTPS** passaram, incluindo hashes de HTML/assets novos e anteriores, Atlas Office, saúde MCP e rejeição 401 de requisição MCP sem autenticação. Fontes, serviços, runtime e perfil conferidos após a publicação.
- Sessão autenticada abriu a entrada e uma semana de cliente existente: campos campanha/conjunto, gasto salvo, controles de leads/agendamentos e retorno aos clientes carregaram sem erro. Documento sem rolagem horizontal em 1.060 CSS px. Nenhum campo real foi editado; não foi acionada coleta Meta. A página publicada ficou aberta no navegador.

O publicador recusa repetição quando `started.json` existe. Em falha, recuperar somente bytes pertencentes à tentativa e preservar mudanças externas; não usar reset, limpeza ou rollback cego após promoção concorrente. Não reaplicar migrations anteriores.

## Limites

Salvamento e painel de leads foram exercitados com fixtures e PostgreSQL descartável; nesta conferência produtiva, somente navegação e leitura. Login de Rafael, celular físico e aceite de uso não foram certificados. A grade continua manual: leitura diária de mensagens, preenchimento automático por IA e escrita pelo MCP não estão implementados ou ativados.
