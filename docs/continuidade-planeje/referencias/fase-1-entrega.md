> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Planeje — primeira entrega da fase 1

Implementada e verificada em **11/09/2026 somente na VPS de teste (2.25.216.103)**. Produção não foi acessada nesta implementação. A entrega está disponível em **Tarefas → Automações**, com **Funções** e **Conferir passagem**.

## O que já pode ser conferido

| Antes | Nesta entrega |
|---|---|
| Regras indicavam pessoas diretamente. | Podem também indicar uma função e seus destinatários configuráveis. A ação mostra se adiciona ou substitui os responsáveis. |
| Trocar de integrante exigia editar cada regra com seu nome. | A mudança na função passa a valer no próximo encaminhamento. Atribuições anteriores e histórico permanecem preservados. |
| A devolução antiga buscava o histórico de A Fazer. | Uma nova ação permite devolver aos responsáveis registrados na saída da etapa de produção escolhida. A ação antiga conserva seu comportamento. |
| Destinatário sem perfil podia desaparecer do editor ou aparecer como UUID. | A pendência fica visível e o vínculo não é removido silenciosamente. |
| Regras sobrepostas precisavam ser comparadas separadamente. | A conferência mostra todas as regras ativas para uma passagem, suas ações e conflitos de responsabilidade. |
| Salvar podia gravar a etapa anterior durante a validação. | Salvar fica bloqueado até validar a escolha; erros permitem tentar novamente. |
| Tarefa recém-criada podia aparecer sem cliente. | Cliente e projeto acompanham o resultado salvo e as atualizações. |
| Desconexão podia causar recursão; Social limitava a consulta a mil registros. | Limpeza de canais protegida, reconexão limitada, paginação completa, cancelamento e nova tentativa em caso de falha. |

A configuração usa os campos e o motor existentes. As explicações novas ficam no **?**. Função operacional não concede permissões de acesso. Os destinatários selecionados na função recebem a tarefa conforme “adicionar” ou “substituir”; não foi implementado rodízio.

## O que foi testado

- **55 verificações automatizadas de aplicação**, incluindo regras antigas, execução real do motor com banco simulado, concorrência de validações, reconexão e mais de mil tarefas.
- **19 verificações SQL**, antes e depois da migração: permissões das funções, destinos inválidos e proteção do registro de etapas contra sobrescrita pelo aplicativo.
- **15 verificações com o motor real e a API do clone**. O cenário usou perfis ativos disponíveis na cópia: roteiro e produção com pessoas distintas, revisão → validação → cliente → alteração → produtor, repetição das aprovações e troca de ocupante. Todas as regras e tarefas temporárias desse cenário foram removidas.
- **Interface:** cadastro e desativação de função; seleção de função e modo de atribuição; conferência das duas regras que coincidem na aprovação; cliente visível imediatamente após criar; Salvar desabilitado durante a validação; status correto após salvar; transferência da mesma tarefa para Social como concluída e sem responsáveis.
- A consulta social alcançou **1.177 registros**, incluindo as duas tarefas fictícias, e ambas foram localizadas em Concluídos. Nenhum erro de execução do novo bundle foi observado nessa navegação. A integração Meta continuou bloqueada no clone.
- Build de staging concluído. Nenhuma dependência adicionada. Os 25 arquivos da entrega conferem com a cópia servida; os nove serviços continuam na rede isolada.

A comparação final confirmou **1.234 tarefas originais, oito automações e duas regras de pré-requisitos idênticas** às anteriores. O novo histórico começa vazio nos registros antigos e registra transições futuras; ele não inventa quem produziu antes da implantação.

## Pontos para a revisão

1. **Cadastros pendentes:** Samuel e Jheimisson constam como `pending`, embora participem das tarefas atuais. Foi perguntado se poderão ser escolhidos nas novas funções nessa condição. Até essa definição, os novos destinos exigem perfil ativo; nenhum cadastro foi ativado ou alterado.
2. **Configuração real do fluxo:** as oito regras existentes foram mantidas. Ainda é necessário conferir quais funções, destinatários e modos de atribuição serão ativados para a agência. O exemplo de equipe informado por Josias não foi aplicado automaticamente.
3. **Falhas de automação:** o status da tarefa e a execução das regras continuam em operações separadas do motor existente. Uma falha é mostrada, e o novo destino inválido é detectado antes de remover responsáveis; isso não torna todas as operações uma transação única.
4. **Acesso administrativo às funções:** os dois administradores ativos atuais foram registrados em uma autorização protegida. Inclusão ou revogação de gestores dessa configuração ainda requer administração do banco. A troca de ocupantes da função é feita pela interface. As permissões amplas antigas continuam documentadas no diagnóstico.

Esta é a entrega de configuração e correções definida no documento “primeira fase”. A unificação de execução nos demais pontos de entrada (MCP, serviços e integrações), transferência coletiva de pendências, revisão ampla de acesso e ativação das regras reais continuam no plano maior de homologação. Publicações por canal pertencem à fase 2 e não foram implementadas aqui.

## Acesso, exemplos e retorno

Abrir: [Planeje de teste](http://localhost:18080/#/tasks/automations). O túnel SSH deste Mac precisa estar conectado; o arquivo `abrir-planeje-teste.command` continua disponível na pasta deste relatório.

Foram deixados dois exemplos de interface para revisão: a função **TESTE FASE 1 — Revisão da interface**, inativa e sem regra vinculada, e a tarefa **TESTE FASE 1 — Salvamento e cliente**, concluída em Social. A tarefa fictícia da validação anterior também permanece.

Backup anterior: `/opt/planeje-staging/private/phase1-before-20260911T171952Z`, com banco, fonte, build, configuração e Storage com atributos. O catálogo e a integridade dos arquivos foram verificados; a restauração integral desse novo ponto não foi repetida. O usuário já havia confirmado a recuperação por snapshot.

O índice web anterior está em `/opt/planeje-staging/private/releases/phase1-20260911/index-before.html`; os assets antigos foram mantidos para permitir retorno da interface. A migração é aditiva: voltar a interface não exige apagar o novo histórico. Uma reversão de banco precisa preservar os registros criados depois da migração.

Evidências nesta pasta: `aceite-fase1-api.json`, `aceite-fase1-interface.json` e `preservacao-apos-fase1.txt`. A migração e os testes estão na cópia local de código em `work/planeje-phase1/source`.

Versão local para revisão: commit `1603e26`, comparável à base `87e7e45`. Promover futuramente exige um pacote de alterações e build próprios de produção; o build do clone contém bloqueios e endereços exclusivos de teste.

## Complemento: situação dos cadastros na Equipe

Em 11/09, foi incluído no clone o controle que faltava em **Configurações → Equipe**. A lista mostra Ativo, Pendente ou Inativo; o lápis abre **Editar cadastro**, com os campos Permissão e Situação do cadastro. A explicação fica no ícone **?**. A situação afeta a elegibilidade operacional, mas não bloqueia o login nem redistribui tarefas existentes.

O salvamento envia apenas os campos alterados e confere o retorno do banco. Nove testes passaram; o build de staging foi concluído. Pela interface, um perfil fictício passou de Pendente para Ativo e voltou a Pendente; o banco confirmou a situação e a preservação do papel Colaborador. O perfil fictício foi removido. Os hashes de todos os perfis, tarefas e automações permaneceram iguais aos anteriores. Samuel, Jheimisson e os demais cadastros reais não foram alterados.

Versão complementar: commit `73ca553`, bundle `index.979216f1.js`. Os três arquivos servidos conferem com a versão local testada. Backup da interface e dos hashes anteriores: `/opt/planeje-staging/private/team-status-before-20260911T191123Z`. Nenhuma migração ou alteração de política de banco foi necessária. A produção não foi acessada.

## Organização do fluxo no clone — 14/09

As automações antigas foram preservadas e pausadas. A regra **Publicado** foi mantida ativa porque já removia os responsáveis e transferia a mesma tarefa para Redes Sociais → Concluídos. Foram criadas quatro funções ativas: **Revisão interna** (Poliana), **Validação interna** (Josias), **Aprovação com cliente** (Jheimisson) e **Postagem** (Jheimisson).

O fluxo ativo ficou com seis regras: revisão substitui o responsável pela função Revisão interna; Josias substitui pela Validação interna; Aprovar Cliente e Aguardando aprovação usam Aprovação com cliente; Agendar e Agendado usam Postagem; Alteração devolve ao responsável registrado ao sair de Em Produção; Publicado conclui em Redes Sociais.

A tarefa **TESTE DO SISTEMA — Fluxo organizado 14/09** validou o ciclo: Rafael → Poliana → Josias → Jheimisson → alteração para Rafael → nova revisão e validação → Jheimisson em Agendar/Agendado → Publicado. O registro terminou como `social_media/completed`, sem responsáveis, com 22 eventos no histórico de execução. As quatro funções têm integrantes ativos e nenhum destino inválido. O hash de todos os perfis permaneceu igual ao backup anterior.

Backup anterior à organização: `/opt/planeje-staging/private/workflow-before-organize-20260914T135544Z`. Backup da configuração organizada e testada: `/opt/planeje-staging/private/workflow-organized-20260914T140834Z`. Nenhuma tabela, política, usuário ou código foi alterado nesta organização; somente funções, automações e a tarefa fictícia do clone. A produção não foi acessada.
