# CRM IA integrado ao Squad

## Intenção e autorização

Reproduzir no Planeje os fluxos comerciais e a apresentação observados no CRM IA do ScaleOS. O pedido atual autoriza análise, implementação e publicação na VPS após validação. A referência de produto já foi escolhida por Josias; decisões técnicas rotineiras seguem abaixo, sem uma nova rodada de aprovação. A auditoria detalhada está em [CRM IA do ScaleOS](../../continuidade-planeje/referencias/crm-ia-scaleos-auditoria-2026-11-11.md).

## Abordagem

A composição dos registros existentes foi escolhida: leads, funis, eventos, contatos, canais, produtos, agentes e bases continuam canônicos. Um CRM separado duplicaria pessoas/histórico; incorporar a página antiga sem adaptação não atenderia ao desenho e aos fluxos pedidos. O shell do Squad será reutilizado, com estilo claro próprio para o CRM e marca Planeje.

Adicionar somente os contratos ausentes: configuração versionada do CRM IA, modelos reutilizáveis, compromissos com disponibilidade e fila de transporte reservável. Compromisso comercial não substitui Tarefas. O scheduler existente processa o transporte novo e o follow-up legado, com canal explícito e reserva antes de enviar. Não haverá um segundo cron/motor de transporte.

## Escopo e aceitação

- Dez destinos: Painel, Funil, Leads, Conversas, Agentes IA, Agenda, Disparos, Rastreabilidade, Modelos e Configurações. Atalhos do Squad e Conversar seguem permissões.
- Contas autorizadas selecionadas explicitamente; separar visão do escritório e carteira. Não misturar contatos de clientes nem inferir a agência por nome de cliente.
- Painel usa agregados do período completo, distingue ausência de dado e zero, e abre o registro que originou o indicador.
- Leads e conversas têm busca, filtros, paginação e ficha. Funil conserva restrições de avanço, ações obrigatórias e motivo de ganho/perda; evento e atualização são atômicos.
- Três agentes por funil: Qualificação, Follow-up e Agendamentos, com identidade, etapas, horário, repasse e ações. Concierge, conhecimento e catálogo compartilham o escopo explícito. Modelos reutilizáveis não copiam telefones, credenciais, canais, responsáveis ou IDs de outra conta.
- Agenda calcula horários pelo fuso, janelas, exceções, duração, folgas, limite diário e conflitos. Reservar horário e gravar compromisso ocorre atomicamente. Nunca confirmar horário que não foi gravado.
- Estado humano/IA e resolução usam `cliente_atend_conversas`. Autonomia nova começa desligada; salvar configuração não liga envios. Clientes sem módulo provisionado têm ação explícita de preparação.
- Fila registra cliente, canal, contato, idempotência, prazo, reserva e recibo. Concorrência não duplica despacho. Falha ambígua após chamar transporte fica para conferência e não tem retry automático. Pausa humana, resposta nova, cancelamento e mudança de configuração são reconferidos antes do envio automático.
- Disparos e Inspetor de Vendas mostram os limites efetivamente encontrados na referência; os recursos existentes de rastreamento continuam acessíveis com cliente/canal corretos. Não simular entrega Meta/Google ou integração Google Agenda.
- Teste de IA não envia WhatsApp. Usar configuração de provedor e modelos já suportados, sem troca de autenticação ou modelo da sessão Codex. O modelo privado do ScaleOS não é conhecido.
- Validação com dados sintéticos, banco descartável e rede externa bloqueada. Publicação herda fontes, `.env.production.local` e flags da release viva, com concorrência, hashes e recuperação seletiva. Não promover `dist` da raiz.

## Contrato entre interface e serviço

`crmIaRequest(db, action, clientId, payload = {})` chama `crm_ia_workspace(p_action, p_client_id, p_payload)`. Erros são exceções, inclusive acesso negado e conflito de versão. Envio e mídia usam o endpoint autenticado `crm-ia`; teste e sugestão usam `atendimento-ia`. Nenhum segredo vai ao navegador.

`bootstrap` retorna `{clients:[{id,empresa}], permissions:{manage}}`. `workspace` retorna `{client,pipelines,stages,agents,bases,products,people,channels,config:{data,revision},templates,provisioned,permissions:{manage,conversations,tracking}}`. Campos de registros existentes conservam seus nomes reais, por exemplo `lead.nome/whatsapp/valor/observacoes/pipeline_id/stage_id/responsavel_id/updated_at` e `stage.nome/ordem/color/tipo`.

Leituras: `overview`, `leads`, `lead`, `conversations`, `messages`, `agenda`, `slots`, `queue`, `usage`. Listas retornam `{rows,total}`; filtros incluem `{search,pipeline_id,stage_id,owner_id,origin,qualified,attendance,channel_id,since,until,offset,limit,sort}`. Toda leitura de mensagens exige `contact_id` e `channel_id` exatos. Ficha agrega `{lead,contact,conversation,events,appointments}`. Mensagens retornam identificadores autorizados para baixar mídia, tipo, autoria e estado do atendimento; nenhum payload bruto ou URL presumida. A conversa atualiza o histórico a cada cinco segundos e as listas/filas a cada quinze segundos enquanto a aba está visível, sem apagar rascunhos.

`open_conversation` inicia a primeira conversa de um lead com canal explícito. Confere telefone, contato canônico e privacidade; cria estado humano pausado quando necessário, sem enviar mensagem. Áudio gravado, imagem, vídeo e documento de até 4 MB usam o compositor existente. Os bytes ficam apenas na requisição imediata: a fila guarda hash e metadados, e o cron não tenta despachar um arquivo ausente. O download exige uma mensagem conhecida no contato/canal selecionado.

Gravações: `save_lead`, `move_lead`, `save_pipeline`, `save_stage`, `reorder_stages`, `save_agent`, `save_base`, `save_product`, `save_config`, `save_template`, `apply_template`, `save_conversation`, `save_appointment`, `cancel_appointment`, `schedule_message`, `cancel_message`, `provision`. Payloads usam `id`, valores reais e `expected_updated_at` ou `revision` quando o registro já existe. Criações destrutivas não são usadas para limpar fixtures. Remoção de etapa ocupada é recusada.

Configuração `config.data` tem seções `knowledge`, `concierge`, `availability`, `distribution`, `entry`, `custom_fields`, `test_mode`, `attendance`. As seções são atualizadas individualmente com versão; IDs referenciados são revalidados no servidor. `save_agent` guarda tipo/pipeline/etapas/idiomas/áudio/janelas/destino em `funil.crm_ia`, mantendo campos e comportamento legados fora desse namespace. O frontend não afirma suporte a uma opção que o executor não leia.

## Continuação: voz, transcrição e Google Agenda

`funil.crm_ia.audio` contém `{enabled:false,input_enabled:false,voice:'alloy',speed:1}` por padrão. Saída em voz e compreensão de entrada têm autorizações independentes. O servidor guarda prova da escolha por agente, autor e versão; alterar JSON legado diretamente não autoriza custo. A UI consulta somente capacidades booleanas antes de exibir os controles. Testar o agente permanece textual.

A fila reserva a geração de voz uma vez e revalida escopo, pausa e versões antes/depois do provedor. Arquivos ficam em memória, limitados a 4 MB; o banco registra estados e metadados. Voz indisponível retorna ao texto antes do transporte, sem repetir geração incerta. O áudio informa que foi gerado por IA. A transcrição de entrada usa cache privado por mensagem/canal/contato, inclusive em falha; não recria lead sem prova da frase de entrada e não baixa mídia ao abrir o histórico.

Google Agenda usa `crm-ia-calendar` com `client_id` e ações `status`, `connect-start`, `finalize`, `calendars`, `select-calendar`, `disconnect` e `busy`. O callback registrado do Drive encaminha somente estados com prefixo próprio. GET não troca o código: retorna ao fragmento de uma origem fixa validada. O bootstrap da UI remove imediatamente os parâmetros e conserva-os somente em memória por até cinco minutos. `finalize` exige JWT com o mesmo usuário e a mesma sessão do nonce, antes de consumi-lo e consultar o Google. Tokens cifrados ficam em tabelas privadas por conta e titular.

O espelho usa título genérico “Compromisso Planeje”, sem nomes, notas ou conversa. Consulta busy precede a oferta/reserva de horários, inclui folgas e não transforma erro em disponibilidade. ID externo determinístico, propriedade privada, ETag e versões protegem eventos humanos e repetição. Reagendamento ignora somente o evento próprio comprovado, preservando ocupações externas sobrepostas. Desconectar é local; não revoga a concessão compartilhada com Drive nem apaga eventos existentes.

O scheduler existente entrega o legado, drena no máximo um job de calendário com orçamento de 12 segundos e então processa a fila CRM. Confirmação automática e lembretes aguardam recibo da versão atual. Falha, conflito ou resultado incerto produz aviso honesto com repasse, somente se a fonte continua atual; nenhuma confirmação falsa é liberada. Selecionar novamente a mesma agenda reconcilia apenas jobs já existentes, sem importar reservas antigas.

## Limites que precisam permanecer visíveis

Não há prova do LLM ou engenharia privada do ScaleOS. Nenhuma inspeção por UI certifica 100% de efeitos de botões não executados. Google Agenda, áudio gerado e API oficial dependem de capacidade/configuração reais do Planeje; indicar indisponibilidade quando ausentes, sem botões que finjam sucesso. Não transmitir testes a clientes reais. Aceite de uso e validação técnica/publicação são estados separados.
