# Mini CRM — fontes de webhook e mensagens da empresa

Publicado em 26/10/2026: capacidade às12h05 e filtro de probe às12h10, horário de São Paulo, na VPS72.60.14.109. Autorização atual de Josias: “vamos ligar então”. A configuração real foi conferida após recarregar a página; aceite humano e próximo evento real permanecem pendentes.

## Comportamento

A seleção de canais da automação passa a incluir fontes de webhook. Os canais configurados mantêm UUID e comportamento; Meta distingue o identificador do número empresarial, e Chatvolt distingue WhatsApp oficial/Zapperapi quando informado. O catálogo `mini_crm_message_sources` contém somente identificador, nome e telefone de negócio, sempre por cliente. Serviço escreve; usuário com acesso vigente ao Mini CRM lê sob o predicado existente. Não há segredo de integração no catálogo.

Mensagens Meta de entrada e ecos `smb_message_echoes` usam a mesma fonte, telefone do contato e data original. Lotes são separados antes do processamento. Resposta da empresa só atualiza contato já existente, sem criar lead, texto de entrada, IA ou conversão. Templates usam apenas o texto renderizado fornecido; não se inventa o corpo do modelo. Histórico sinalizado, comprovante de entrega, ID/data inválidos não acionam automação. Eco histórico ou inválido também não inventa recência no contato.

O executor/RPC existente continua responsável por etapas, palavras, agendamento, versões e pausa manual. IDs antigos de ingresso são aliases compatíveis, inclusive no marcador da última mensagem; selecionar um número não seleciona outro. A regra sem seleção conserva “todos os canais” do mesmo cliente. Não se alteram interruptores, etapas ou filtros reais indiscriminadamente.

O número empresarial da metadata passa ao reconhecimento de mensagem inicial do link, já existente, sem substituir atribuição anterior. Links externos ainda podem informar o número de destino manualmente. Não foi criada conexão Uazapi fictícia nem trocado o segredo/URL existente. Não se valida assinatura F3 nesta entrega; a autenticação por segredo existente permanece.

## Verificação

52 casos do planejador;25 dos handlers reais com transportes fictícios; teste das identidades/seletor/executor real;9 verificações SQL/RLS em PostgreSQL novo por socket Unix; regressões Chatvolt, atribuição, histórico Meta e links. `npm run check` passou; lint dirigido depois dos ajustes sem erros. Prévia do componente real confirmou números distintos, Uazapi preservada e seleção independente em regra de chegada e palavra, com zero erro de console. Nenhum usuário/lead real foi usado como fixture.

Revisão independente sensível: quatro P2 encontrados e corrigidos (identidade com chave inválida; recência de eco inválido; hash SQL antes da primeira escrita; rollback por interrupção). Sem P1/P2 abertos no recorte. Publicador passou10 testes de frontend e8 de runtime, incluindo SQL adulterado antes de qualquer chamada ao banco. Relatório privado em `.codex/reviews/webhook-sources-2026-10-26.md`.

As preparações01/02 compilaram, mas foram recusadas por um marcador de QA que esperava no bundle um nome vindo do banco; nenhuma delas publicou, aplicou SQL ou reiniciou serviço. A guarda foi corrigida para o contrato efetivamente compilado. A preparação03 herda `atlas-source-refresh-20261023-01/candidate`, perfil produtivo e1.731 fontes; só11 arquivos de escopo entram na sobreposição, quatro novos. Nunca promover `dist` antigo ou repetir migração anterior.

## Operação e limites

Migração nova: `20261026143800_mini_crm_webhook_sources.sql`, aplicada UMA VEZ com sucesso na release05 e anteriormente validada no banco descartável. Não reaplicar nem editar o arquivo aplicado. A carga inicial copia exclusivamente identificadores empresariais/transportes do log, sem reexecutar mensagens ou tocar contatos/configurações. Preparação não aplica SQL. Publicação conferiu fontes, runtime, perfil, HTML e unidades. O publicador não escreve regras; salvamentos humanos concorrentes são registrados e preservados.

Para trocar o runtime, parar somente `supabase-edge-functions`, copiar os cinco arquivos aprovados e iniciar. Isso evita normalizador novo com handler antigo em execução. Outros serviços/VPS não são reiniciados. Recuperação restaura fontes/HTML/runtime somente quando ainda pertencem à tentativa; catálogo aditivo permanece caso a publicação posterior falhe. Não há DROP/replay como recuperação.

Sem envio de WhatsApp, CAPI ou IA de teste. Primeiro evento novo real e aceite humano não são certificados por fixture. Fontes aparecem após serem observadas/recebidas, sem presumir telefone que o provedor não informa; Chatvolt sem número empresarial é identificado pelo transporte informado.


## Resultado produtivo e continuidade

Base atual: `/root/planeje-releases/webhook-source-filter-20261026-01/candidate`, sobre `webhook-sources-20261026-05/candidate`; guarda de1.735 fontes. Main `ccdbedd9`/`bc73e6cf`; conserva os assets05 `dc3d0f26`/`bc73e6cf`, `cdee87a3` e anteriores. Escritório `1ed69416`/`59ec53c3` e as quatro unidades/serviços Atlas foram preservados. Perfil produtivo herdado exclusivamente na VPS. Duas trocas controladas somente de `supabase-edge-functions` (capacidade e filtro); nenhum restart da VPS/Atlas.

A tentativa03 recusou SQL antes da troca de fontes/runtime; transação desfeita e tabela ausente confirmada. A causa exata não ficou disponível. Um ensaio com ROLLBACK passou, sem persistência; não equivale a migração aplicada. A tentativa04 detectou salvamento concorrente de regras e parou antes do SQL. A05 reutilizou a preparação exata03, conferindo fontes/perfil/build, e registrou a aplicação bem-sucedida. Diagnóstico privado foi adicionado; nenhum publicador consumido foi repetido. Não confundir tentativas com múltiplas aplicações.

A conferência autenticada mostrou uma fonte Meta real e um probe legado `f3-test` sem número, e não dois números reais. Hotfix de dois arquivos: ID Meta numérico ou telefone válido identifica a fonte; fonte Meta sem ambos fica fora do seletor. O registro de diagnóstico foi preservado, sem DELETE nem nova migração. A regra real da Maison já estava ligada, limitada ao canal antigo; o único número real foi acrescentado à chegada e ao agendamento pela UI autenticada, com confirmação de salvamento e persistência após reload. Etapas, palavras, canal anterior e demais clientes foram preservados. SQL de leitura confirmou enabled/arrival/appointment vinculados. Não se liga automação globalmente por inferência.

Verificações finais: guarda1735, HTTP exato do main/assets novos/anteriores/escritório, quatro serviços/unidades, runtime aprovado e RLS/grants passaram. GET do ingresso200, POST sem segredo401 e Uazapi sem parâmetros400; estes testes não gravam eventos autenticados. Tela real mostrou somente as fontes válidas, número selecionado nas duas regras e zero erro de console. Hotfix passou novamente52 planner,25 handlers, helper/executor e18 testes de recuperação locais/remotos, além dos oito scripts e build da candidata. O check completo anterior passou; ajustes finais receberam verificações dirigidas e builds, sem alegar repetição integral.

Evidência pública contém apenas hashes/contagens/limites. Captura da configuração fica somente no artefato local da tarefa, sem copiar dados de contato para a documentação. O próximo evento novo depende de entrega válida do provedor e das regras/pausas do contato. Não foi enviada mensagem real de teste nem reprocessado histórico; transição real ponta a ponta e aceite de Josias permanecem por observar.


## Preferência recebida após publicação

Josias respondeu à pergunta pendente: aplicar aos dois números do webhook. A preferência vale para os dois números reais da Maison, sem incluir probe. Nova conferência somente leitura encontrou ainda um número empresarial válido já vinculado à chegada/agendamento e o identificador `f3-test` com display inválido. Nenhuma segunda fonte real foi encontrada nos eventos ou no catálogo. É necessário identificar o segundo número antes de vinculá-lo; não inventar identidade nem selecionar a origem de teste. A configuração existente permanece ligada. Esta conferência não alterou regras, runtime, SQL ou mensagens.
