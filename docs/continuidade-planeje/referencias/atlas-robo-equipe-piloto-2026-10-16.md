# Atlas: conversa e cobrança interna — piloto privado de 16/10/2026

Josias aprovou validar o robô com uma demanda da Impacto. “Dono do cliente” significa responsável interno da conta, como Poliana. A autorização desta etapa é para um piloto privado; não habilita cobranças à equipe real nem nova autonomia em produção.

## Resultado disponível

Em `http://127.0.0.1:4320/#/caixa`, o robô roxo flutua no canto superior direito. Um chamado abre conversa persistente sobre uma tarefa e sua origem. O cenário usa cópia datada de um pedido da Impacto, em cliente/tarefa de teste, com Poliana e Rafael explicitamente marcados DEMONSTRAÇÃO. Respostas e entrega são fictícias. O texto original e credenciais ficam apenas nos arquivos privados do piloto.

Foi conferido no navegador, com sessões normais de cada papel:

1. Responsável pela conta recebe o chamado, indica o executor já atribuído e confirma o combinado na tela.
2. Executor recebe a pergunta e combina revisão para 16/10 às 15h, no fuso de São Paulo.
3. Confirmar andamento grava uma atualização estruturada e um comentário na tarefa existente. Não duplica tarefa nem altera etapa, prazo ou responsáveis.
4. Executor informa entrega com URL literal de evidência, confirma e encaminha à revisão do dono. O material vinculado foi aberto e identificado como FICTÍCIO.
5. Dono recebe a revisão, pode conferir evidência, registrar o que verificou e aceitar ou pedir ajuste. Sem registro, os botões ficam desabilitados. A demonstração principal foi deixada em `delivery_review` para Josias experimentar; não foi aceita pelo agente.

O histórico da tarefa contém exatamente os dois comentários confirmados: andamento e entrega para revisão. A tarefa permanece A fazer, com o mesmo responsável e prazo. Ler/receber, informar previsão, informar entrega e concluir a tarefa são estados diferentes.

## Horários e consumo

Cobranças usam relógio e banco, sem IA. Scanner de 30 s; no máximo duas cobranças sem resposta por dia, com intervalo de uma hora. Seg–sex, no expediente individual cadastrado; padrão 08h–17h, São Paulo. Para trabalho do dia, revisão após a saída é antecipada visivelmente para 15 minutos antes; a pessoa confere antes de registrar. Exceções de tarefa/responsável também esperam o expediente. No teste, os dois funcionários sintéticos encerram às 16h para validar a regra individual.

IA somente ao enviar uma resposta; modelo atual `gpt-4o-mini-2024-07-18`, saída estruturada e `store:false`. Limites exclusivos do piloto: 20 respostas e 40 ditados por pessoa/dia, mensagem de 4.000 caracteres, contexto limitado. Não alteram teto ou orçamento do Atlas produtivo. As cinco chamadas reais da demonstração consumiram 13.687 tokens, incluindo as reproduções de falhas. Houve também uma transcrição real de áudio sintético; a repetição usou cache.

Foram corrigidos durante o teste: data ISO divergente de “hoje às 15h”; e repetição de sugestão antiga diante de um relato novo. Horário explícito inequívoco prevalece sobre a data gerada; histórico enviado ao modelo usa papéis de conversa, sem propostas antigas, e mensagem atual explícita. As sugestões incorretas não foram aplicadas.

## Segurança e arquitetura

- Flag `VITE_ATLAS_TEAM_PILOT=true` apenas no build privado. Padrão desligado.
- Sete tabelas `atlas_team_*` com RLS, leitura apenas dos participantes atuais, sessão humana ativa e sem delegação de servidor. Funcionário externo, anônimo, sessão revogada, ex-destinatário e autoaprovação da entrega recusados.
- Escritas por RPCs pequenas; wrappers públicos invoker. Writers privados definer necessários para mensagens Atlas e verificação da sessão, com caminho de busca fechado. Finalização/worker somente serviço; nenhum grant amplo em `auth.sessions`.
- Participantes: dono, responsável interno da conta e responsáveis atuais da tarefa do mesmo cliente. Contexto exclui memórias privadas do dono, financeiro, credenciais e outros clientes. Não seleciona executor por inferência de cargo.
- Nonce, revisão da conversa e confirmação humana protegem repetição, concorrência e sugestão desatualizada. Mudança do vínculo ou tarefa concluída segue para conferência; não cria nova tarefa.
- Ditado: gravar → parar/transcrever → conferir texto → enviar. Cancelamento preserva o fluxo; transcrever não envia. Provedor e cache foram testados com fala sintética. Microfone físico de Josias continua pendente.

## Implantação exclusiva no CS

VPS 103, `/opt/planeje-cs-integration`, banco `planeje-cs-db/cs_integration`, rede isolada e acesso por túnel local. Release `releases/atlas-team-20261016-01`; serviço próprio `planeje-atlas-team-pilot.service`, socket `dist/.runtime/team.sock`, rota exata `/functions/v1/atlas-team-chat`. Bridge reutiliza a chave já autorizada, somente no servidor.

Migração `20261016160546_atlas_team_conversations.sql`: base e ajustes de desenvolvimento aplicados somente ao CS. Arquivo local consolidado corresponde ao estado final. **Não reaplicar no CS e não aplicar na produção nesta etapa.** Só o serviço novo foi reiniciado; nginx privado recebeu reload para a rota. Serviço de demandas anterior foi preservado.

Build CS completo: `index-f66f8f1e.js` / `index-08eed2fb.css`. Preserva assets e sockets existentes; índice/proxy anteriores guardados em `before/`. Uma alteração concorrente na fonte foi detectada antes de publicar e reconciliada; Mini CRM/identidade do lead foram mantidos. Esta candidata também contém Assessoria ainda não aprovada para produção: **não promover o bundle CS para a VPS 109**.

Reversão do piloto: desabilitar a flag no próximo build privado ou restaurar o índice anterior da release; parar o serviço novo e restaurar o proxy anterior com `nginx -t`/reload, se necessário. Preservar tabelas/histórico; não apagar dados como parte da reversão visual.

## Validação e limites restantes

13 cenários Python no Mac e na VPS; 40 verificações API/Auth/RLS/estados isoladas; 92 regressões existentes (ditado e escritório); build completo; IA real e transcrição sintética; navegador computador e 390×844, rolagem até os botões, rascunho ao fechar/reabrir e navegação; comentários canônicos e campos oficiais conferidos. Fixtures transitórias da suíte removidas, mantendo apenas a demonstração e os dados anteriores do piloto. Serviço ativo e sete tabelas RLS conferidos.

A captura e evidências privadas ficam em `.local/atlas-team-pilot/`. [Release sanitizada](../evidencias/releases/atlas-robo-equipe-piloto-2026-10-16.json).

Este piloto valida conversa → combinado → cobrança → entrega → conferência. Ainda falta a ingestão automática e completa de pedidos WhatsApp/áudios, cobertura dos vínculos explícitos de grupos, conciliação entre leitores/missões/escritório, orçamento/estados produtivos e seleção do primeiro acompanhamento pela interface. A revisão automática de conteúdo não foi implementada: IA não abriu o link nem avaliou qualidade; entrega é um relato para conferência humana. Feriados e expedientes especiais não cadastrados. Aceite de Josias e escolha de implantação real pendentes. Nenhuma pessoa real contatada; nenhuma escrita, tarefa, comentário, envio WhatsApp/CAPI/e-mail ou serviço de produção alterado por esta entrega.
