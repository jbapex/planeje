# Atlas: robô de acompanhamento da equipe em produção — 16/10/2026

Publicado em 16/10/2026 às 15h21, São Paulo, após Josias aprovar o avatar (“Adorei”) e solicitar “agora jogar para a vps?”. Conferência autenticada concluída depois de Josias renovar a sessão expirada. O piloto privado permanece disponível; sua candidata de Assessoria não foi promovida.

## Resultado disponível

[Abrir Minha caixa com a versão publicada](https://planeje.jbapex.com.br/?v=ae721a01#/caixa). O avatar branco/roxo fica fixo no canto superior direito das páginas do layout principal. Clicar abre/recolhe a conversa; um chamado novo pode apresentar um aviso para a pessoa autorizada, sem abrir a conversa automaticamente. O botão não tem arraste nem ocultação permanente nesta versão. É uma imagem estática, sem IA para desenhar/exibir.

O dono tem “Novo acompanhamento” mesmo sem conversas existentes. Escolhe cliente fechado, tarefa aberta já existente e responsável interno pela conta, escreve a orientação opcional e marca explicitamente “Autorizo o Atlas a chamar esta pessoa no Planeje sobre a tarefa”. Não há responsável ou prazo escolhido automaticamente neste formulário. O fluxo mantém o primeiro contato com o responsável interno, como Poliana; o cliente externo não recebe mensagem.

Depois de iniciado pelo dono: responsável da conta → executor permitido → combinado confirmado e próxima revisão → andamento/impedimento/entrega com evidência → revisão do dono. As conversas ficam limitadas aos participantes. Respostas podem usar texto ou ditado, com conferência e envio manual. A IA propõe; o botão de confirmação registra o combinado. Cobranças seguem o relógio, expediente e limite diário de duas sem resposta, sem chamar o modelo só para conferir a hora. Novas tarefas e transferências continuam no fluxo de aprovação já existente.

Acompanhamento não altera responsável, prazo ou etapa oficial da tarefa. Andamento/entrega confirmados pelo executor podem gerar os comentários canônicos já testados. Entrega relatada não conclui a tarefa; a revisão do dono fecha a conversa. Link informado não comprova automaticamente conteúdo, publicação ou qualidade.

## Ajustes necessários para a produção

- Entrada “Novo acompanhamento” e seleção de dados reais com acesso administrativo verificado pelo servidor. Funcionário não pode iniciar uma cobrança em nome do dono.
- Rascunho do formulário mantido no componente pai ao recolher/reabrir. Produção omite o rótulo de teste; piloto conserva sua identificação.
- Um acompanhamento ativo por dono/tarefa; repetição reaproveita o mesmo registro. Bloqueio de retargeting de nonce, troca silenciosa de responsável da conta e início sobre tarefa concluída.
- Contexto da tarefa verifica cliente e tarefa juntos; mover tarefa para outro cliente não expõe o novo contexto ao responsável anterior.
- Serviço Python com modo de produção explícito, guarda de hostname/ambiente e rejeição de Bearer vazio. Credenciais existentes permanecem somente no servidor.

## Publicação e continuidade técnica

Webroot público correto: `/var/www/planeje`. `/root/planeje/dist` era uma cópia antiga e não deve servir de base. A candidata anterior realmente publicada era `/root/planeje-releases/lead-name-20261016-01/candidate`.

Nova base produtiva: `/root/planeje-releases/atlas-team-production-20261016-01/candidate`. A promoção conferiu 1.627 hashes do baseline e sobrepôs somente 13 arquivos próprios; MainLayout foi adaptado sobre a fonte produtiva, sem promover o MainLayout local inteiro. Plugins necessários ao build foram recuperados da fonte produtiva. A cópia `/root/planeje` recebeu apenas os mesmos arquivos. Não substituir por bundle CS/Assessoria.

Assets: `index.ae721a01.js` / `index.341caecc.css`; avatar `atlas-avatar-3d-v1.860d62c4.png`. Anteriores `index.fa402a2e.js` / `index.a59c888c.css` preservados. Flags do build: `VITE_ATLAS_TEAM_ENABLED=true`, `VITE_ATLAS_TEAM_PILOT=false`, mantendo `VITE_ATLAS_DEMANDS_ENABLED=true` e `VITE_ATLAS_DEMAND_PILOT=false`.

SQL `20261016160546_atlas_team_conversations.sql` e `20261016175851_atlas_team_launch_controls.sql` aplicados UMA VEZ em produção, na mesma transação. Não reaplicar. No CS a base `20261016160546` já existia; somente `20261016175851` foi aplicada nesta revisão, também uma vez. Sete novas tabelas com RLS; wrappers públicos invoker e escritores estreitos privados. Configuração ligada somente ao proprietário atual do Atlas; zero threads reais importadas/criadas. Sem importar horários fictícios do piloto: padrão aprovado seg–sex 08h–17h, São Paulo.

Novo `planeje-atlas-team.service`, socket `/run/planeje-atlas-team/team.sock`, grupo www-data/modo 0660, ambiente existente `/root/.config/planeje-atlas.env`. Nginx encaminha somente `/sb-fn/atlas-team-chat` e `/functions/v1/atlas-team-chat` ao socket. Serviço novo iniciado e Nginx recarregado; nenhum contêiner ou serviço existente do Atlas foi reiniciado.

Backups de índice, Nginx, env e fontes próprias em `/root/planeje-releases/atlas-team-production-20261016-01/before/`. Para reversão visual, restaurar o índice anterior e as fontes/flags correspondentes; para interromper o novo acompanhamento, parar somente o novo serviço e restaurar a configuração Nginx guardada. Não remover as tabelas de conversas ou reaplicar SQL. O promotor tem guarda contra repetição e não deve ser executado outra vez.

## Validação

- 14 cenários Python no Mac e na candidata real; 92 regressões Node do áudio/escritório e build produtivo passaram.
- 42 verificações API/Auth/RLS em cópia descartável do esquema completo, sem dados produtivos: dono/equipe/intruso, sessão revogada, metadados forjados, deduplicação, troca de cliente, confirmação, comentários canônicos, revisão e ausência de escritores anônimos/definers públicos.
- Piloto privado: formulário, autorização, reuso da conversa existente sem nova mensagem, rascunho ao recolher/reabrir e tela de celular passaram. A base anterior já havia validado modelo/transcrição com áudio sintético; não houve nova chamada real em produção.
- Produção autenticada por Josias: 24 clientes e sete pessoas, tarefas abertas da Impacto carregadas, envio bloqueado sem pessoa/autorização, duas imagens carregadas, rascunho preservado ao recolher e reabrir, wrapper fixo e ausência de rótulo privado. Computador 1416×1005 e celular com 390×844 pixels CSS; caixa x=12..378/y=165..829, sem transbordamento horizontal. Zoom existente respeitado, override responsivo retirado.
- HTML/assets/avatar e assets anteriores com HTTP 200 e bytes exatos. API anônima/Bearer vazio/origem externa negados; rota anterior de demandas preservada. Serviços de equipe, demandas, escritório, missões e Nginx ativos; snapshot do worker vazio e nenhum erro de varredura.
- Hash da tabela de tarefas idêntico antes/depois, comentários 1.516→1.516, demandas 1→1. Após a conferência autenticada: zero threads, mensagens e requisições ao modelo deste novo subsistema. Nenhuma cobrança real iniciada durante a validação.
- Banco/REST/rede descartáveis e chaves temporárias removidos; piloto persistente CS conservado. Sem WhatsApp, CAPI ou e-mail enviado.

Capturas privadas em `.local/atlas-team-production/`; release público contém somente metadados de validação. A sessão expirada foi resolvida pelo login do próprio usuário, sem mudar conta, senha ou permissões.

## Uso real e limites restantes

Próximo passo: Josias abre o robô → Novo acompanhamento, escolhe tarefa/pessoa e autoriza seu primeiro caso real. Validar então a conversa da equipe, o ditado com microfone físico e a primeira cobrança no expediente. Nenhuma pessoa real foi contatada pelo agente nesta publicação.

A ingestão completa das mensagens/áudios de grupos WhatsApp, os vínculos explícitos cliente/grupo e a unificação entre escritório, central e missões continuam pendências da auditoria operacional. Esta publicação não os implementa nem aumenta limites do gerente do escritório. Personalização de expediente por pessoa em interface, feriados e inspeção automática da evidência também permanecem fora desta entrega.

[Release e evidências resumidas](../evidencias/releases/atlas-robo-equipe-producao-2026-10-16.json).
