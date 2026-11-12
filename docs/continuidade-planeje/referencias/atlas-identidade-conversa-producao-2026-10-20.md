# Atlas: identidade na conversa — publicado para validação

Publicado em **20/10/2026, 01h41 de São Paulo** (04h41 UTC), na VPS `72.60.14.109`, após Josias responder “autorizo” à publicação deste reparo. A verificação técnica terminou; interpretação pela IA real e aceite humano permanecem pendentes.

[Abrir o escritório](https://planeje.jbapex.com.br/?v=91d9d02e#/assistant/atlas) · [Correção e testes locais](atlas-identidade-conversa-local-2026-10-20.md) · [Evidência](../evidencias/releases/atlas-identidade-conversa-producao-2026-10-20.json).

## Escopo publicado

O autor autenticado é identificado na mensagem atual. Em acompanhamento, a própria pessoa pode informar que cuida da etapa sem selecionar outro executor. O esquema só oferece os contatos aceitos pela validação existente; nomes nulos/vazios não travam o fluxo. Isso não muda responsável oficial, status ou prazo da tarefa.

Candidata: `/root/planeje-releases/atlas-speaker-loop-20261020-01/candidate`, composta sobre a release funcional de 19/10. **Um arquivo de runtime mudou:** `scripts/atlas-team-pilot/manager.py`, SHA-256 `0e67a63d35d009d727a7ec7cc4f4e640dd403276bac99b0bcb075651d2447105`. Guarda integral de **1.727 fontes** conferida antes e depois. Os testes novos foram executados em `qa/` separado; alterações locais alheias não foram promovidas.

Somente `planeje-atlas-team` foi reiniciado e passou à candidata nova; WorkingDirectory, ExecStart e cwd efetivo foram conferidos. Os outros três serviços conservaram suas unidades. Perfil produtivo foi herdado dentro da VPS, com modo0600, sem exportar segredos. Modelo, provedor e autenticação permaneceram iguais.

Não houve migração, SQL de alteração, build, alteração de configuração ou reprocessamento coletivo. HTML e assets mantêm os mesmos bytes: main `91d9d02e`/`828bc4c4`, escritório `1ed69416`/`59ec53c3`. A correção é do serviço; o histórico antigo continua visível.

## Verificações observadas

- Implementação local: 43 testes do gerente, 14 de horário, nove de contexto e 94 SQL/RLS em PostgreSQL descartável; revisão independente sem achados abertos.
- Candidata na VPS: os 43 testes do gerente passaram usando transporte fictício. A primeira preparação parou por um caminho de importação da fixture; o caminho foi corrigido, e a qualificação foi retomada com novas conferências, antes de ativar qualquer serviço.
- Publicador: sete testes de unidade/autorização e 15 testes reutilizados de promoção/recuperação passaram. Revisor conferiu duas simulações adicionais de rollback. Dependências e correção foram vinculadas por SHA ao conjunto autorizado; revisão final sem achados abertos.
- Após ativação: 1.727 fontes, seis HTTP200 com hashes esperados, quatro serviços ativos, cwd correto do robô e funções/índice do banco iguais à baseline. Requisição sem autenticação ao socket foi recusada com 401/403.
- Na janela da publicação, contagens e hashes de tarefas, threads e mensagens permaneceram iguais; política, configuração de eventos e quantidade de saídas do WhatsApp também. Nenhuma tarefa ou mensagem de teste foi criada e nenhuma chamada paga de IA foi feita pelo publicador.

Artefatos privados: `.local/atlas-speaker-loop-release-20261020-01/`. Revisões privadas em `/Users/josiasbonfimdefaria/.codex/reviews/atlas-speaker-loop-2026-10-20.md` e `atlas-speaker-publication-2026-10-20.md`. Publicador e recuperação reutilizam versões anteriores fixadas por hash. Não repetir a publicação após interrupção: inspecionar marcadores e processo antes de qualquer recuperação.

## Próximo uso e limites

Continuar a conversa existente com o Atlas. Uma mensagem nova usa o serviço corrigido; respostas antigas não são reescritas nem reenviadas automaticamente. Observar se ele reconhece quem responde e avança apenas sobre o andamento, impedimento ou revisão que falta.

Os testes usam resposta sintética no transporte: não certificam a interpretação de uma nova resposta pelo provedor real. A interface não mudou; navegador, áudio e build não foram repetidos neste delta Python. Não foi simulada uma resposta real em nome de funcionário ou do dono. A publicação não é aceite humano nem garantia de funcionamento perfeito em qualquer conversa.
