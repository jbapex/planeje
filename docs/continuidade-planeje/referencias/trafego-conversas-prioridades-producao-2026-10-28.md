# Hoje: conversas de tráfego e prioridades — produção

Publicado em **28/10/2026, 09h03 de São Paulo**, após Josias autorizar **“publicar”** para esta entrega. Publicação e verificação técnica concluídas; baixa por resposta real de Rafael e aceite humano continuam pendentes.

## Resultado e fontes

A [entrega local](trafego-conversas-prioridades-local-2026-10-28.md) está publicada: contador compacto de conversas de tráfego, Dialog aberto por clique, link por cliente/conversa e baixa após resposta contextual do gestor oficial. Lista e Quadro separam **Urgente**, **Atrasado**, **Vence hoje**, A fazer e Aguardando cliente. Alertas críticos permanecem visíveis; tarefas conservam conclusão e histórico próprios.

Candidata **`/root/planeje-releases/traffic-conversations-20261028-01/candidate`**, sobre a release vigente `atlas-send-owner-20261028-02/candidate`. São **11 arquivos de produto**, inventário de **1.754 para 1.757 fontes**, frontend **`index.f207f736.js` / `index.57335d29.css`**. Build feito na VPS, herdando `.env.production.local` exclusivamente dentro dela. Não foi promovido `dist` local, ZIP, fixture ou trabalho de outra tarefa.

O `MainLayout.jsx` tinha uma diferença anterior ao escopo: posicionamento do Atlas no checkout local. Foi aplicado somente o hunk que oculta o popup genérico de espera em Hoje sobre a fonte publicada. A posição produtiva do Atlas foi preservada. Por isso o hash desse arquivo no pacote difere do arquivo local; os outros dez arquivos correspondem à entrega revisada. Futuras publicações devem preservar esta diferença explicitamente, sem copiar o checkout inteiro.

Somente a migração **`20261028110040_traffic_pending_conversations.sql`**, SHA-256 **`034602a1e46460ccab0f89317dbf17794c1373833bfbce52ce86a684c3aeff15`**, foi aplicada **uma vez**. Cria dois helpers/RPC aditivos de leitura; corpos, dono, grants, estabilidade, SECURITY DEFINER/INVOKER e search_path conferidos. Não substitui funções existentes nem altera tabelas, RLS, tarefas ou pessoas. PostgREST recebeu reload de schema.

Somente **`planeje-atlas-events`** foi reiniciado e repontado. Team, manager, office e demands mantiveram unidades/diretórios. Cinco serviços ativos; ambiente de runtime, provedor/modelo, autenticação e flags preservados. A comparação durante a publicação confirmou tarefas, pessoas, mensagens internas, saídas e políticas/configurações inalteradas. Não houve mensagem de teste ou chamada adicional de modelo para validar.

## Verificação

- Na candidata da VPS: **114 testes Python**, **12 casos de prioridades e quatro regressões Node**, build com perfil produtivo e marcadores de compatibilidade passaram.
- **20 testes sintéticos do publicador** passaram localmente. Revisão independente conferiu payload/dependência/rebase e acrescentou fixture de transação única/bloqueio de reaplicação; nenhum achado aberto. SHA revisado do publicador: **`06fdeaa735f8aa9afc7fc9ea599a16eff81b4ae45ad7b4cabd1183f105e3f162`**.
- Guardas de fontes/candidata/perfil, schema, contratos SQL, unidades e ausência de execução em andamento passaram. As 1.757 fontes coincidem no diretório de trabalho e na candidata. **Seis verificações HTTP/hash** cobrem HTML, JS/CSS novos, assets anteriores e Atlas Office.
- Sessão autenticada existente confirmou Hoje, Lista, Quadro, popup por clique e fechamento por Escape. Nenhum erro de navegador observado. A consulta produtiva respondeu com **11 conversas em análise pendente**, sem apresentar isso como zero definitivo.
- QA local anterior: **39 verificações PostgreSQL descartáveis**, **12 cenários isolados de navegador**, regressões Atlas/prioridades e `npm run check`. A matriz de negação por papel/cliente foi validada com fixtures; a UI produtiva foi conferida com administrador existente, sem assumir identidade de Rafael.

A primeira preparação isolada interrompeu antes de qualquer ativação porque o marcador esperado tinha inicial minúscula. Corrigido o marcador, a preparação integral foi repetida e passou. A tentativa anterior está preservada em `traffic-conversations-20261028-01-preparation-01`; não foi usada para publicar.

## Operação e limites

[Abrir Hoje publicado](https://planeje.jbapex.com.br/?v=f207f736#/paid-traffic/hoje). O contador depende da análise do Atlas no ciclo existente; o navegador consulta a cada 20 segundos e ao recuperar foco. Não houve retroclassificação do histórico, atribuição de carteira, cadastro de números ou ativação de configuração por inferência. A baixa real exige gestor oficial ativo e identidade cadastrada inequívoca, resposta do mesmo assunto e evidência de envio.

Não repetir a migração nem o publicador concluído. Se uma futura tentativa falhar após commit SQL, o procedimento preserva a migração e deixa o worker afetado parado para reparo adiante; nunca reverte consumidores às cegas. Release/baseline/payload/unidades, logs e recibos privados ficam na pasta da release na VPS. Revisões privadas no Mac: `/tmp/planeje-traffic-conversations-review-20261028.md` e `/tmp/planeje-traffic-conversations-deploy-review-20261028.md`.

Falta observar um ciclo humano de identificação e baixa com Rafael, validar celular físico e obter aceite de Josias. Conteúdo de conversas/clientes não foi copiado para este documento. [Manifesto sanitizado](../evidencias/releases/trafego-conversas-prioridades-producao-2026-10-28.json).
