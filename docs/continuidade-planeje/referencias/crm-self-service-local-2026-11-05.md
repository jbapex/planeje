**Atualização posterior:** publicação autorizada e concluída em 05/11/2026, 18h14. Este documento preserva a evidência da etapa local. [Estado produtivo e operação](crm-self-service-producao-2026-11-05.md).

# CRM: gerar conexão ao Planeje por loja — local

Pedido de Josias: configurar outros logins do CRM87 sem intervenção no servidor a cada loja. Implementação concluída localmente; publicação nova não autorizada nesta etapa. A autorização “pode” anterior cobriu o piloto Impacto já entregue, não foi tratada como autorização permanente.

No CRM, Integrações > Planeje, administrador da loja gera chave e copia os dois dados para o formulário existente do Planeje. URL compartilhada, chave exclusiva por organização. Controle no banco valida membership/role/status; RLS/revokes, hash256bits, segredo exibido uma vez e revogação confirmada. Troca de organização/login limpa a chave e ignora respostas tardias. Não reutiliza as chaves MCP, que têm escopo de leitura mais amplo.

Quatro fontes frontend CRM (página nova e três integrações), migração nova **somente para o banco87**, endpoint novo `planeje-status-export-connect`. Destino109 já aceita rota/envelope, sem mudanças. Função fixa e rotina atuais da Impacto permanecem preservadas. No modo novo, proprietário com múltiplas organizações só exporta linhas explicitamente vinculadas; legados ambíguos ficam de fora.

Revisão reproduziu perda de permissão durante espera de lock: owner passou a inactive enquanto create estava bloqueado e ainda gerava chave. Corrigido com revalidação e lock FOR SHARE de membership após adquirir o lock da organização; regressão RED→GREEN real no PostgreSQL descartável. Revisão final sem achados materiais abertos, relatório privado0600 `/tmp/planeje-crm-self-service-review-2026-11-05.md`.

Passaram34 verificações SQL,12Node incluindo seis regressões e20React. Lint de dois JSX limpo, build isolado Vite1,75s/1.439 módulos, quatro fontes transpiladas com rota/título/permissão conferidos e bundle Edge com três módulos. Preview [localhost4384](http://127.0.0.1:4384/) em processo39613 enquanto ativo, dados fictícios, HTTP HTML/JS200. O navegador continua bloqueado; não houve contorno nem inspeção visual. Build completo do CRM/perfil real e execução da Edge nova permanecem etapas da publicação.

Baseline de dez fontes lidos na87 sem env/credenciais em `.local/crm-self-service/baseline`; hashes no manifesto correspondente. Grafo local17/10 não cobria a entrega05/11, consulta determinística usada como mapa e código atual conferido diretamente. Pacote local pronto em `.local/crm-self-service/package`; comparar concorrência antes da publicação e não reutilizar como autorização ou como dist produtivo. Nenhuma chave real gerada, migração aplicada, API instalada, cliente ativado ou mensagem enviada nesta etapa.

[Plano](../../superpowers/plans/2026-11-05-crm-self-service.md) · [Contrato](../../superpowers/specs/2026-11-05-crm-self-service.md) · [Operação e comandos](../../../scripts/crm-status-sync/self-service/README.md) · [Evidência](../evidencias/releases/crm-self-service-local-2026-11-05.json).
