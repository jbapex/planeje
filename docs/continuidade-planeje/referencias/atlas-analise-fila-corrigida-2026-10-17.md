# Atlas: análise bloqueada por lote antigo — 17/10/2026

Josias enviou uma captura com dois avisos genéricos de análise/conferência incompleta após usar Analisar cliente.

## Causa comprovada

O lote `26e684f5-0c04-448e-8a21-1b592619cb99`, criado na noite anterior, foi tentado às 19h56. O bloqueio de fontes reconheceu alteração de cadastro/contexto antes do provedor, gravou `provider_started=false`, zero tokens e attempt=1. A seleção buscava o mais antigo, então esse erro interrompia o ciclo sem chegar aos lotes atuais. O frontend mostrava o erro local e o último erro global como duas faixas.

Diagnóstico somente de leitura confirmou snapshot antigo desatualizado e outro snapshot válido. Nenhuma chave, mensagem bruta ou credencial foi registrada nos logs de diagnóstico. Changelog e filtros Supabase conferidos; nenhuma nova API/schema foi necessária.

## Correção

- Produção confere a fonte antes de reservar um lote sem lease. Se mudou, coloca em blocked preservando input/source_refs/histórico, com predicates de proprietário/id/estado/tentativa. Não reserva tokens nem gasta outra tentativa para esse caso. A fila pode seguir para o próximo válido.
- Lease vencida continua sendo recuperada pela função SQL existente, conservando a contabilização da reserva desconhecida. Mudança entre reserva e IA ou durante a IA termina a lease pelo RPC existente, conserva o consumo efetivo, bloqueia o lote com guarda de tentativa e não vira uma falha global genérica. Lease já superada não é sobrescrita.
- Analisar cliente explícito prioriza o contexto montado mais recentemente para aquele cliente. Rotina automática conserva a ordenação anterior e os lotes anteriores permanecem na fila. Nenhuma fonte é descartada para forçar sucesso.
- Uma única faixa de falha no frontend, priorizando o erro da solicitação. Falha de rede/autenticação continua sendo erro; não foi transformada em sucesso.

## Validação

70 testes Python (14 novos) e 61 regressões Node passaram. Os testes incluem contexto antigo seguido de válido, preservação de input/reservas/tentativas, seleção por cliente e proprietário, contexto mais recente manual, justiça da fila automática, lease ativa/vencida, troca de dono, falha de leitura e fonte alterada antes/depois da IA. Build produtivo com o perfil herdado passou; prévia mostrou um único alerta mesmo com erro local e global.

Primeira promoção às 20h03 corrigiu a trava. Validação autenticada concluiu um lote válido ainda antigo (`864d294b...`, 41.608 tokens). A conferência revelou que a ação manual ainda priorizava o mais antigo; complemento às 20h06 passou a priorizar o contexto recém-montado somente na ação por cliente. Publicadores distintos, nunca repetidos; frontend do complemento herdado sem novo build.

Validação final pelo botão normal da Impacto: lote `45f6f3ef-573f-44fc-b58c-ecc02d44f705` criado às 20h07, concluído/publicado às 20h07min25s, 100 mensagens; fonte mais recente disponível às 14h55min54s de 17/10. Consumo 41.729 tokens. Duas validações reais somaram 83.337 tokens registrados (não faturamento); painel inclui uma tentativa anterior sem provedor, total três tentativas no dia. Nenhuma reserva ficou aberta.

Permanece cinco achados, uma conversa/ cinco mensagens internas já existentes. Nenhuma tarefa ou mensagem à equipe/WhatsApp foi criada pelas validações; expediente e autonomia preservados. A semântica dos cinco achados e o primeiro ciclo real da equipe seguem sujeitos ao aceite.

## Publicação e continuidade

Base final: `/root/planeje-releases/atlas-scan-repair-20261017-02/candidate`, 1.700 fontes. Main `index.6f372f7c.js` / `index.a8313023.css`; escritório herdado `index-c15dc511.js` / `index-e5ae8acc.css`.

**Somente planeje-atlas-events.service** agora carrega essa candidata; serviço reiniciado nas duas promoções. Os demais serviços conservam suas bases anteriores. Ambiente, vendor/cache, restrições systemd, chaves e configuração foram preservados. Sem migração, DDL ou alteração de permissões. Reparação de filas usa as APIs e a lease existentes. As versões/HTMLs anteriores foram conservados.

Próximo build: herdar `.local/atlas-scan-repair-final/candidate/.env.production.local` (fora do manifesto), além das fontes guardadas. Nunca publicar dist da raiz. Seis HTTP com bytes/hashes e quatro serviços ativos passaram.

O lote antigo que gerou a captura continua preservado (erro anterior/attempt1); não foi apagado nem recontado nesta validação. Quando elegível para seleção, será conferido antes de qualquer nova reserva. Registros de fila antigos não significam tarefas pendentes para o dono.

[Produção](../evidencias/atlas-analise-fila-corrigida-producao-2026-10-17.png) · [Release](../evidencias/releases/atlas-analise-fila-corrigida-2026-10-17.json).
