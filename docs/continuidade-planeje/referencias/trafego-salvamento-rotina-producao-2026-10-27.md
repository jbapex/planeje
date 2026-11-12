# Rotina semanal — salvamento publicado em 27/10/2026

Publicado às **16h08 de São Paulo**, após Josias responder “pode” ao pedido específico de publicar a correção e aplicar a migração nova. Aceite humano permanece pendente. [Diagnóstico, escopo e testes locais](trafego-salvamento-rotina-local-2026-10-27.md).

## Comportamento entregue

Salvar encerra o estado ocupado inclusive quando não há alteração ou existe validação pendente. A primeira gravação mantém o texto; erro e demora liberam a fila e mostram retorno claro. Conflito conserva a edição local e exige conferir a versão atual, sem sobrescrever silenciosamente outra pessoa. Descartar não salva ao sair. Concluir análise/otimização atualiza a rotina e o Hoje; leitura anterior em andamento é seguida por nova leitura. Editar ficha concluída reabre sua tarefa oficial com histórico na mesma transação; concluir imediatamente depois da edição primeiro grava o conteúdo novo.

## Publicação e conferência

Base atual: `/root/planeje-releases/traffic-save-20261027-02/candidate`, herdando `google-data-manager-20261027-02/candidate` e seu perfil produtivo exclusivo da VPS. Guarda final de **1.750 fontes**, 14 sobreposições: quatro fontes da interface, uma migração e nove arquivos de teste. Os links locais de assessoria não publicados foram excluídos somente da candidata; trabalho local de outros chats foi preservado. Não usar o dist da raiz.

JS `index.2bd8f173.js`; CSS `index.bc73e6cf.css`. HTML, JS/CSS novos, JS anterior e escritório responderam200 com hashes exatos. Os quatro serviços Atlas continuaram ativos e com as mesmas unidades; nenhum serviço/Edge foi reiniciado. A sessão real abriu a Rotina semanal e carregou seus registros.

Apenas `20261027184719_traffic_weekly_reopen_task.sql` foi aplicada, **uma vez com sucesso**, em transação e pelo proprietário existente `supabase_admin`. Dono, ACL, SECURITY DEFINER e search_path foram conferidos antes/depois e preservados. Não há tabela `supabase_migrations.schema_migrations` nesse servidor; o registro da aplicação está na release com hash, horário e definições anterior/posterior. Não reaplicar a migração por ausência desse ledger.

A tentativa01 foi recusada por falta de propriedade da função no papel `postgres`; a transação não aplicou SQL e as fontes/HTML foram restaurados sem conflito. A tentativa02 usou o proprietário já existente, sem novos privilégios, e os mesmos artefatos compilados e testados. Backups e registros das duas tentativas foram preservados. Se houver falha futura, comparar fontes/HTML/função antes de qualquer recuperação; não restaurar banco ou registros de clientes.

## Evidência e limites

`npm run check` local,50 casos Node, banco PostgreSQL16 descartável com RPC/guard reais e catálogo/ACL fictícios passaram. Na candidata: oito scripts dirigidos, build com perfil produtivo e15 cenários de interface isolados passaram. Publicador:24 testes de recuperação/autorização/modos locais e remotos. Revisão manual do agente principal, sem revisão independente nesta entrega. [Manifesto e resultados](../evidencias/releases/trafego-salvamento-rotina-producao-2026-10-27.json).

Consulta agregada somente leitura após a publicação: zero fichas em rascunho com tarefa concluída, zero fichas finalizadas com tarefa não terminal e zero fichas sem tarefa. Nenhum registro de cliente foi usado como teste de gravação, corrigido em lote ou apagado. Permanece pendente o aceite no uso real de salvar/concluir. Recarregar [Rotina semanal](https://planeje.jbapex.com.br/?v=2bd8f173#/paid-traffic/rotina) para usar o novo bundle.
