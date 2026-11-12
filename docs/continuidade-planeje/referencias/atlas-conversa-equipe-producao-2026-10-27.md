# Atlas: conversa, fila pessoal e resposta posterior — produção

Publicado em **27/10/2026, 16h12 (São Paulo)** após autorização explícita de Josias: “pode publicar”. Verificação técnica concluída; primeiro ciclo humano e aceite continuam pendentes.

## Conjunto publicado

A [entrega local](atlas-conversa-equipe-local-2026-10-27.md) foi promovida com 13 arquivos de produto. A base é `/root/planeje-releases/traffic-save-20261027-02/candidate`, incluindo as entregas Google Data Manager/Chatvolt, Rastreamento e Rotina semanal. A preparação01 foi interrompida pela guarda de concorrência antes de qualquer ativação; apenas02 foi publicada.

Nova base de fontes: `/root/planeje-releases/atlas-dialogue-20261027-02/candidate`, com 1.752 fontes. Perfil `.env.production.local` herdado dentro da VPS; modelo, provedor, autenticação, EnvironmentFile, limites e flags existentes preservados. Nenhum `dist` local/teste foi promovido. Frontend: `index.9982524c.js` / `index.ee022d49.css`; escritório e ativos anteriores conservados.

Somente `20261027170137_atlas_dialogue_team_flow.sql`, SHA-256 `e7693827c1d020ed4ccc59c252c8f33e1b6293eb7df588769528e8d5c4ad89c5`, foi aplicada uma vez. Migrações anteriores não foram repetidas. Só `planeje-atlas-team` e `planeje-atlas-events` foram repontados/reiniciados; os cinco serviços Atlas observados estão ativos. Não repetir o publicador ou a migração.

## O que passa a operar

- Fatos respondidos, dependência e próximo passo persistem no acompanhamento existente; negação, confirmação curta e reagendamento têm tratamento explícito.
- Avisos curtos, com contexto completo recolhido; referências de comentários, justificativas, anexos e publicação são revalidadas na tarefa/cliente atuais.
- Robô abre a fila pessoal com Precisa responder, Não lidas e Atlas acompanhando. Equipe aparece só ao superadmin autorizado no próprio escopo. Vínculo revogado retira acesso do destinatário anterior, inclusive ao histórico.
- Enviar salva mensagem/request e devolve o recebimento; worker responde depois. Lease, identidade/sessão, revisão e fontes são reconferidos antes da escrita. Retentativa usa o mesmo ID; respostas antigas não são repetidas em massa.
- Aprovação pertinente de grupo pode retomar o acompanhamento exato aguardando cliente; “ok” solto não avança trabalho.
- O dono ou a conta oficial com acesso vigente pode justificar atendimento já realizado e resolver somente o aviso daquele grupo. Não executa SQL livre, apaga mensagens nem conclui tarefas.

Tarefas continua como execução oficial. Nenhuma ferramenta nova de verificação externa de campanha, vídeo ou publicação foi incluída.

## Verificação e limites

188 testes Python passaram na candidata produtiva, helper Node e build com o perfil real. A QA local já tinha 181 verificações SQL, 18 verificações de navegador e `npm run check` aprovado. As 13 fixtures do publicador e a revisão independente passaram. Seis caminhos HTTP principais/anteriores, mais dois assets do escritório, conferidos por hash; contratos SQL, índice único, colunas, permissões, fontes e unidades verificados. Logs dos dois workers não mostraram erro de inicialização, scan ou fila desde o reinício até a observação registrada.

Na sessão autenticada de Josias, caixa, filtros pessoais, controle Equipe, contexto de acompanhamento existente e conversa pessoal abriram. Não foi enviada resposta/justificativa nem disparada análise de teste. **O mapa incorporado ficou vazio na aba de conferência**, inclusive após reload; a URL direta abriu seu aviso normal de sessão e os três arquivos do mapa permaneceram idênticos à release anterior. Renderização incorporada não está validada por esta inspeção e deve ser conferida no navegador de Josias.

Tarefas, pessoas, mensagens internas e configurações ficaram iguais entre os snapshots da publicação. A contagem de saídas mudou durante a operação concorrente; não alegar congelamento global. O publicador não chama transporte de mensagens; nenhum envio externo ou modelo pago de teste foi executado.

Primeiro ciclo real de resposta/continuidade e naturalidade da IA precisam de validação humana. Leitura de bytes, verificação de postagem/qualidade externa e campanhas ao vivo permanecem fora deste reparo.

## Operação e recuperação

A publicação sela fontes, perfil, SQL e unidades; a troca do HTML ocorre por último e mantém assets antigos. Antes do commit SQL, recuperação só restaura unidades antigas depois de conferir fontes/HTML e ausência de conflito. Depois de um commit, não restaura consumidores antigos sobre uma fila nova: preserva SQL e respostas e mantém os workers próprios parados para reparo para frente. Essa recuperação não foi necessária na publicação02.

Evidência privada operacional em `.local/atlas-dialogue-release-20261027-02/` e `/root/planeje-releases/atlas-dialogue-20261027-02/`; [registro sanitizado](../evidencias/releases/atlas-conversa-equipe-producao-2026-10-27.json). Arquivos com funções/ambiente e diagnósticos privados ficam na VPS; nenhuma credencial ou conversa bruta foi trazida para esta referência.
