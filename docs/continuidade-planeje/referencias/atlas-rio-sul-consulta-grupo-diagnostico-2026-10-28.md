# Atlas: resposta sobre grupo da Rio Sul — diagnóstico somente leitura

28/10/2026, após a conversa de 18h02. Josias questionou a resposta do robô sobre não conseguir acessar o grupo. Esta etapa investigou o caso e seus consumidores; não alterou banco, configuração, tarefas, mensagens, fontes ou serviços e não fez chamadas de IA.

## Evidência e causa

O request operacional correspondente está `completed`, aplicado, decisão `ask`, sem código de erro. A frase sobre não conseguir acessar consta no resultado gerado pelo modelo. A resposta anterior havia consultado status, responsável e comentário da tarefa. O hash produtivo de `manager.py` coincide com a release de contexto das 17h01.

A Rio Sul está selecionada na configuração do Atlas, mas não possui objeto de vínculo `entregaveis.whatsapp_grupo`. A função canônica `private.atlas_event_client` não encontra grupo autorizado para esse cliente. Há dois registros com nome RIO SUL - MKT, um ativo e outro arquivado; o ativo possui 687 mensagens recebidas e 18 saídas armazenadas. O nome sozinho não autoriza escolher nem associar um grupo. Esses agregados comprovam histórico retido, não a saúde atual da conexão ou o conteúdo da entrega citada.

O chat operacional `manager.reply` recebe contexto da conversa, tarefa, índice de tarefas, pessoas, escopo e conhecimento operacional. Não há busca de mensagens do WhatsApp acionada por “chegou a ver no grupo?”. O contexto atual da conversa também não contém mensagens ou cobertura de leitura do grupo. O reader `atlas-events` é outro consumidor: consulta inbox, saídas e transcrições somente de grupos explicitamente vinculados. Não havia jobs de análise dos grupos para esse cliente na leitura.

Portanto, a resposta não comprova uma tentativa de consulta que falhou. Há duas lacunas independentes: vínculo do grupo ausente e ausência de consulta de mensagens por solicitação dentro deste chat. A IA preencheu a ausência de fonte com uma afirmação de acesso não sustentada. Os dados atuais não permitem concluir se o vídeo foi enviado ou aprovado no grupo.

## Próxima correção delimitada

Confirmar/registrar o grupo canônico do cliente pela identidade exata, preservando o registro arquivado. Conectar a consulta do chat às fontes autorizadas desse grupo, com autor/data, texto, saídas e transcrições existentes; declarar recorte, ausência de fonte e erros reais. Revalidar vínculo, sessão e versão depois da consulta e antes de gravar ações. Não enviar mensagens externas, concluir trabalho pelo nome ou abrir anexos arbitrários.

Necessário testar grupo sem vínculo, arquivado, duplicidade de nomes, remapeamento, permissão de participante, fonte incompleta e conteúdo não confiável. A frase do modelo não pode substituir uma tentativa registrada. Nenhum desses reparos foi implementado/publicado nesta etapa de diagnóstico. As melhorias de prazo, imagens e vínculo de tarefas das 17h01 permanecem publicadas, com seu escopo anterior.

Fontes locais: `scripts/atlas-team-pilot/manager.py`, `server.py`, `scripts/atlas-events/server.py`, migrações `20261016225723` e `20261028170215`. O grafo local de 17/10 não cobre o código atual; as relações foram reconferidas diretamente nos consumidores. Consultas produtivas usaram transação READ ONLY e timeout, sem extrair anexos ou conteúdo bruto do grupo. O texto operacional já mostrado por Josias foi conferido somente para localizar o request; não foi copiado para este documento.
